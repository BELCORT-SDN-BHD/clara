-- 0268_work_source_correction_supersede — #885: A DOCUMENT-FACT CORRECTION CANCELS AND RE-ADMITS
-- EVERY WORK PARKED ON A QUESTION ABOUT THAT DOCUMENT.
-- =====================================================================================
-- Spec of record: issue #885's Agent Brief (2026-09-18) and the owner's ruling comment of
-- 2026-09-20 on the same issue. Domain words: CONTEXT.md — "Accounting work", "Restated work /
-- supersedes", and this file's new one, "Source-corrected work".
--
-- THE RULING, IN ONE SENTENCE. When a human corrects what a document SAYS, a Work that is parked
-- on a question asked about that document is cancelled with the correction as its reason and
-- superseded by a fresh Work on the same admitted basis, so a person can NEVER answer a question
-- that was asked against a reading nobody is acting on any more.
--
-- WHY THIS FILE EXISTS AT ALL, measured rather than asserted. `clara.answer_work_question`
-- (0200 §D, the live body) converges on five things: the question's status, its version, its
-- deadline, the Work's state, and the Work's `basis_digest`. `clara.revise_document_fact` (0217
-- §4) moves NONE of them — it appends a `clara-fact-human:v1` extraction and writes a
-- `clara.document_fact_revisions` row, and 0217's own header records that it touches
-- `clara.accounting_work` nowhere. #658's `WorkKnowledgeDriftBanner` does not close the gap
-- either: it is keyed on `clara.knowledge_records.knowledge_version` (0230), and 0217:53 states
-- that a fact revision writes nothing on `clara.knowledge_records`, so on the very case this
-- ticket is about the banner never appears — and it only warns.
--
-- WHERE THE MECHANISM LIVES, and it is the owner's choice rather than the implementer's. The
-- 2026-09-20 ruling records the preference: the cancel-and-admit happens INSIDE THE CORRECTING
-- DOOR'S OWN TRANSACTION rather than in a new runtime consumer, so no frozen document-ingest
-- closure is touched and there is no window in which the corrected document and the still-
-- answerable question coexist.
--
-- THE FOUR WRITES ARE NOT RE-SPELLED HERE. `clara.restate_accounting_work` (0200 §E) already IS
-- "admit the successor, stamp `supersedes`, stamp `superseded_by` on the old Work, cancel the old
-- Work through its own door" in one transaction under one op key, and 0199's
-- `clara.cancel_accounting_work` already appends the single `work.cancelled` domain event whose
-- payload carries `outcome = 'superseded'` and the successor's id. This file CALLS that door once
-- per affected Work instead of copying its order, so the link the activity feed renders (#840) is
-- generated in exactly one place and a future change to the restatement contract cannot leave a
-- second, divergent spelling behind.
--
-- WHO MAY CAUSE A RESTATEMENT, AND WHY NO GRANT MOVES. `clara.restate_accounting_work` is granted
-- to `clara_runtime` alone, and it still is: this file changes no ACL. It is reached here as
-- `clara_fn_owner`, from inside a SECURITY DEFINER body, which is the ordinary way one definer door
-- composes another in this estate. What IS new is the PATH: before this file a restatement could
-- only originate from the runtime lane (`POST /api/work/:id/restate`, the human's `sub` passed
-- through), and now a bookkeeper's own correction can cause one. That is exactly what the owner
-- ruled, and the floor is not weakened by it: `clara.revise_document_fact` is agent-walled
-- (CLR03) and `clara._human_ctx(role_rank('bookkeeper'))`-floored at its top, and
-- `clara._work_door_ctx` then re-reads the SAME actor's ACTIVE bookkeeper+ membership at the
-- restatement door, per Work. A viewer cannot correct a fact and therefore cannot restate; an
-- agent identity cannot do either.
--
-- WHAT THE REPLACEMENT CARRIES. The SAME admitted basis, the SAME `basis_origin` and the SAME
-- `source_refs`, verbatim off the old row — because the INSTRUCTION did not change, the DOCUMENT
-- did. The successor is admitted `queued`, so the run that picks it up reads the document's
-- CORRECTED reading from the top and asks its own question against it. Re-deriving a basis from
-- the corrected facts is not this door's judgement to make: a basis is what a human asked for.
--
-- WHICH WORKS ARE AFFECTED — ONE RULE, `clara._source_corrected_work`, and nothing else in this
-- file re-states it. A Work of this firm that (a) still has a PENDING question, (b) names this
-- document in its own `source_refs`, (c) holds NO committed receipt, and (d) is in one of the
-- three statuses a restatement is offered from. It is the WRITE-side twin of
-- `clara.list_source_dependents`' `work_questions` arm (0217 §7), narrowed by (c) and (d):
--   * (c) is the brief's own carve-out — a Work already holding a committed receipt is UNTOUCHED,
--     because correcting a posted result is #676's territory and the PRD parks the automation;
--   * (d) keeps a pending-question RESIDUE on an already-terminal Work from turning a
--     professional's correction into a refusal. `clara.restate_accounting_work` refuses a Work
--     outside `queued`/`running`/`awaiting_input` by design, and this door must not inherit that
--     refusal for a row nobody is waiting on.
-- `clara.list_source_dependents` is NOT recut: it is a read whose job is to show a human
-- everything standing on the document, including the rows this rule deliberately leaves alone.
--
-- THE LOCK ORDER, AND WHY THE DOCUMENT LOCK IS NO LONGER THIS BODY'S FIRST. The declared global
-- order is **accounting_plans → accounting_work → agent_tasks → agent_interruptions** (0193:248).
-- `clara.documents` is not named in it, but the JOURNAL lane takes that row while already holding
-- the accounting_work rung: `clara._lock_document_binding` (0197:329) is called from two BEFORE
-- ROW triggers on `clara.journal_entries` and `clara.entry_evidence_links`, inside transactions
-- that locked their Work first. A correcting transaction that took `clara.documents` first and
-- then reached for a Work row would be the OPPOSITE direction of that same edge — the classic
-- ABBA between a posting transaction and a correction. So `clara.revise_document_fact` now takes
-- the Work rungs FIRST, in the declared order, through `clara._lock_source_corrected_work`, and
-- `clara.documents` sits BELOW them. 0217's own `select … for update` on `clara.documents` is not
-- moved by one line; it simply is no longer the first lock the body takes. §T asserts the ORDER
-- positionally in the committed text, the way 0197 §F asserts its own.
--
-- ONLY WHAT WAS LOCKED IS SUPERSEDED. `clara._lock_source_corrected_work` returns exactly the ids
-- it locked, `clara.revise_document_fact` holds them, and `clara._supersede_source_corrected_work`
-- re-asks the ONE rule under those locks and acts only on the intersection. A Work that becomes
-- parked on this document AFTER the lock is not superseded by this call — nothing in the estate
-- serialises `clara.open_work_question` against a document row, so that is a property of the
-- world at the moment of correction rather than a gap this file could close by locking harder.
--
-- IF A REPLACEMENT CANNOT BE ADMITTED, THE WHOLE CORRECTION REFUSES. `clara.restate_accounting_work`
-- raises typed refusals of its own (a non-journal purpose, a document that already backs a posted
-- entry, a client gone inactive). None is swallowed: the correction refuses with that door's own
-- (errcode, detail.reason) and nothing half-done commits. Fail-closed is the only posture
-- compatible with the ruling — a correction that cancelled a Work and could not replace it would
-- leave a professional with neither the old question nor a new one.
--
-- THE ANSWER DOOR GAINS ONE WORD, NOT A NEW ARM. A question closed by the cancel cascade already
-- refuses CLR13; this file makes its `detail.reason` read `superseded` (instead of `cancelled`)
-- when the Work carries `superseded_by`, and puts the successor's id on `detail.current` so a
-- surface can send the person to the Work that replaced this one. Every other status keeps the
-- exact word 0180 gave it and `already_answered` still wins. A RESTATEMENT (#721) reaches the same
-- new word, which is correct: the reason a question was retired is the same in both cases.
--
-- THIS FILE CREATES NO RELATION, NO EVENT TYPE AND NO TAXONOMY ROW. The cancellation is recorded
-- by 0199's existing `work.cancelled` event (already carrying `outcome` and `superseded_by`); the
-- REASON is carried by the successor's `intent_key` and the restatement's op key, both of which
-- read `source_corrected:<revision id>:<old work id>` and are durable on `clara.accounting_work`
-- and `clara.op_receipts` respectively, and by the `superseded_work` array this file adds to the
-- revision's own receipt, audit row and `document.fact_revised` reader contract.
--
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: NONE THAT IS NEW. The three
-- new bodies raise nothing of their own; the two recuts keep every refusal they had, and
-- `answer_work_question`'s existing CLR13 status refusal gains one additional `reason` VALUE
-- (`superseded`) on an arm that already existed.
--
-- D1 WRITE-QUIESCE IS OWED for `clara.revise_document_fact` and `clara.answer_work_question`:
-- this file replaces two audited writers' bodies, and PostgreSQL runs an in-flight PL/pgSQL call
-- to completion on the body it STARTED with. Two bodies, one window — see packages/db/README.md's
-- "Deploy contract".
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md). REDO (#957) over this file's own effects is safe: every object it
-- creates is a `create or replace function`, and §0's drift pins accept a body that already
-- carries this file's marker.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §0 PRESTATE. Every premise this file rests on, MEASURED NOW on this rig (never transcribed
-- from a creating migration's file text: a body one migration recuts can itself have been
-- spliced by a later one, so the file text is not proof of the live text).
-- =====================================================================================
do $w885_pre$
declare v_sha text; v_src text; v_n int; v_sig text;
begin
  -- 0.1 · THE LANES THIS FILE STANDS ON.
  foreach v_sig in array array[
      'clara.revise_document_fact(uuid,text,jsonb,int,text,text)',
      'clara.answer_work_question(uuid,int,jsonb,text)',
      'clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text)',
      'clara.cancel_accounting_work(uuid,uuid,text)',
      'clara._work_committed_receipt(uuid)',
      'clara.list_source_dependents(uuid)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#885 prestate: % is absent -- migrations 0178/0199/0200/0217 must all be applied', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if to_regclass('clara.accounting_work') is null or to_regclass('clara.agent_interruptions') is null
     or to_regclass('clara.agent_tasks') is null then
    raise exception '#885 prestate: the Work lane relations are absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='clara' and table_name='accounting_work'
        and column_name in ('superseded_by','supersedes')
      having count(*) = 2) then
    raise exception '#885 prestate: clara.accounting_work is missing the 0200 supersession pair'
      using errcode='CLR10';
  end if;

  -- 0.2 · EXACTLY ONE BODY of each name this file recuts. A recut that landed BESIDE the live body
  -- instead of replacing it would leave callers reaching whichever overload resolves.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='revise_document_fact';
  if v_n <> 1 then
    raise exception '#885 prestate: clara.revise_document_fact has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='answer_work_question';
  if v_n <> 1 then
    raise exception '#885 prestate: clara.answer_work_question has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- 0.3 · PRE-IMAGE sha256(prosrc) PINS ON THE TWO BODIES THIS FILE RECUTS, measured on this
  -- lane's own rig (clara_l09, 0001->0267, PG 17, 2026-09-20) off pg_proc.prosrc.
  --
  -- REDO-TOLERANT BY CONSTRUCTION (#957). A pin that admitted ONLY the pre-image would refuse the
  -- supported redo of this very file after a fix-round edit, because the live body would then be
  -- THIS file's own post-image. So the pin admits either the pinned pre-image OR a body that
  -- already carries this file's marker, and refuses everything else -- a FOREIGN drift still
  -- stops the migration, which is what the pin is for.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)'::regprocedure;
  select encode(sha256(convert_to(v_src,'UTF8')),'hex') into v_sha;
  if v_sha is distinct from 'b89a01ba9b5f029435afa6dfd450144ccb8dcc9d29f24ec9c96495e999c09d29'
     and position('#885' in v_src) = 0 then
    raise exception '#885 prestate: clara.revise_document_fact has DRIFTED from its pinned pre-image (measured %, expected b89a01ba9b5f029435afa6dfd450144ccb8dcc9d29f24ec9c96495e999c09d29) and does not carry this file''s marker -- re-derive this file against the LIVE body before applying', v_sha
      using errcode='CLR10';
  end if;
  if position('#885' in v_src) <> 0 then
    raise notice '#885 prestate: clara.revise_document_fact already carries this file''s splice -- this is a REDO (#957) over this file''s own effects, which create-or-replace makes safe.';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.answer_work_question(uuid,int,jsonb,text)'::regprocedure;
  select encode(sha256(convert_to(v_src,'UTF8')),'hex') into v_sha;
  if v_sha is distinct from '15a82c080d102e61ebdead2280577072a87c21720375174e83c86a7198fb07a7'
     and position('#885' in v_src) = 0 then
    raise exception '#885 prestate: clara.answer_work_question has DRIFTED from its pinned pre-image (measured %, expected 15a82c080d102e61ebdead2280577072a87c21720375174e83c86a7198fb07a7) and does not carry this file''s marker -- re-derive this file against the LIVE body before applying', v_sha
      using errcode='CLR10';
  end if;
  if position('#885' in v_src) <> 0 then
    raise notice '#885 prestate: clara.answer_work_question already carries this file''s splice -- this is a REDO (#957) over this file''s own effects.';
  end if;

  -- 0.4 · NON-REGRESSION PINS. Four bodies this file CALLS and must not move. §T re-reads all four
  -- at the same literals, so their promises are re-asserted rather than merely undisturbed.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from 'd3c5cc932d8ff63eb1b19aad22d8c54a74bf5a6a90cbb4776cee3c1a53c5be90' then
    raise exception '#885 prestate: clara.restate_accounting_work has DRIFTED (measured %) -- this file delegates the four supersession writes to it and cannot vouch for a body it does not recognise', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.cancel_accounting_work(uuid,uuid,text)'::regprocedure;
  if v_sha is distinct from '27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b' then
    raise exception '#885 prestate: clara.cancel_accounting_work has DRIFTED (measured %) -- the single work.cancelled event and its superseded_by payload are 0199''s promise, not this file''s', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._work_committed_receipt(uuid)'::regprocedure;
  if v_sha is distinct from '82700a7c43b7c08d19f6293d774ae61e623c9a6222394e93ca4c04398930de0c' then
    raise exception '#885 prestate: clara._work_committed_receipt has DRIFTED (measured %) -- it IS the "a posted Work is untouched" rule this file''s finder asks', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_source_dependents(uuid)'::regprocedure;
  if v_sha is distinct from 'f385e7843522d089141cdf64ccd97024eff0c4d6e81e5430dea7ce732278433a' then
    raise exception '#885 prestate: clara.list_source_dependents has DRIFTED (measured %) -- this file does NOT recut it and the tail says so', v_sha
      using errcode='CLR10';
  end if;

  raise notice '#885 prestate: clean -- the 0178/0199/0200/0217 lanes are present, clara.revise_document_fact and clara.answer_work_question exist exactly once at their pinned pre-images (or already carry this file''s marker, a supported #957 redo), and the four bodies this file calls or leaves alone are at their pinned shas.';
end
$w885_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE ONE RULE, THE LOCK, AND THE EFFECT — three ungranted bodies.
--
-- ALL THREE ARE UNGRANTED. They are reachable only from inside `clara.revise_document_fact`,
-- which is itself SECURITY DEFINER and is the ONE door a human uses; a grant on any of them
-- would be a second, unwalled way into the Work lane. §T re-reads the ACL of each, grantor
-- included.
-- =====================================================================================

-- A1 · WHICH WORKS A CORRECTION OF THIS DOCUMENT AFFECTS. The ONE rule; §A2 and §A3 both ask it
-- rather than re-stating it, so a lock taken over one set and an effect applied to another is
-- unconstructible.
create or replace function clara._source_corrected_work(p_document uuid, p_firm uuid)
  returns uuid[]
  language sql stable security definer set search_path = clara, pg_temp as $$
  select coalesce(array_agg(w.id order by w.id), '{}'::uuid[])
    from clara.accounting_work w
   where w.firm_id = p_firm
     -- (d) THE RESTATABLE SET, stated here rather than inherited as a refusal. #885
     and w.status in ('queued', 'running', 'awaiting_input')
     -- (c) A WORK HOLDING A COMMITTED RECEIPT IS UNTOUCHED — the brief's own carve-out; correcting
     -- a posted result is #676's, and docs/PRD.md parks the automation.
     and clara._work_committed_receipt(w.id) is null
     -- (a) IT IS PARKED ON A QUESTION. The tenant term is stated on BOTH sides rather than
     -- inherited: clara.agent_interruptions.work_id's foreign key is single-column, exactly the
     -- asymmetry 0217 §7's own round-1 review note closed on the read side.
     and exists (select 1 from clara.agent_interruptions i
                  where i.work_id = w.id and i.firm_id = p_firm and i.status = 'pending')
     -- (b) …AND THE QUESTION STANDS ON THIS DOCUMENT, through the Work's own evidence claim, the
     -- same `source_refs` term clara.list_source_dependents reads.
     and exists (select 1 from jsonb_array_elements(coalesce(w.source_refs, '[]'::jsonb)) x
                  where x->>'kind' = 'document' and x->>'document_id' = p_document::text);
$$;
revoke all on function clara._source_corrected_work(uuid,uuid) from public;
comment on function clara._source_corrected_work(uuid,uuid) is
  '#885: the ONE rule for "which Work does correcting this document affect" -- this firm''s Work '
  'that still has a PENDING question, names this document in its own source_refs, holds NO '
  'committed receipt (#676''s carve-out) and is in one of the three statuses a restatement is '
  'offered from. The WRITE-side twin of clara.list_source_dependents'' work_questions arm.';

-- A2 · THE RUNGS, TAKEN IN THE DECLARED ORDER AND BEFORE clara.documents.
--
-- accounting_plans → accounting_work → agent_tasks → agent_interruptions (0193:248). This body
-- takes the last three; it takes NO plan row, because nothing here reaches a plan. The caller
-- takes `clara.documents` AFTER this returns — see this file's header for the ABBA that ordering
-- exists to prevent.
--
-- ROW BY ROW, IN ID ORDER, rather than one set statement per rung: `for update` under an
-- `order by` is not a promise about acquisition order, and two concurrent corrections of two
-- documents whose affected sets overlap must queue rather than deadlock on each other.
create or replace function clara._lock_source_corrected_work(p_document uuid, p_firm uuid)
  returns uuid[]
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ids uuid[]; v_id uuid;
begin
  v_ids := clara._source_corrected_work(p_document, p_firm);
  if v_ids is null or cardinality(v_ids) = 0 then return '{}'::uuid[]; end if;
  foreach v_id in array v_ids loop
    perform 1 from clara.accounting_work w where w.id = v_id for update;
  end loop;
  foreach v_id in array v_ids loop
    perform 1 from clara.agent_tasks t
     where t.id = (select w.current_task_id from clara.accounting_work w where w.id = v_id)
     for update;
  end loop;
  foreach v_id in array v_ids loop
    perform 1 from clara.agent_interruptions i
     where i.work_id = v_id and i.firm_id = p_firm and i.status = 'pending'
     order by i.id for update;
  end loop;
  return v_ids;
end $$;
revoke all on function clara._lock_source_corrected_work(uuid,uuid) from public;
comment on function clara._lock_source_corrected_work(uuid,uuid) is
  '#885: takes the accounting_work -> agent_tasks -> agent_interruptions rungs (0193:248) for '
  'every Work a correction of this document affects, and returns exactly the ids it locked. '
  'clara.revise_document_fact calls it BEFORE it locks clara.documents, because the journal lane '
  'already takes clara.documents while holding the accounting_work rung (0197:329).';

-- A3 · THE EFFECT. One restatement per affected Work, through 0200 §E's own door.
--
-- THE RULE IS RE-ASKED UNDER THE LOCKS, and the result is intersected with what was actually
-- locked. §A2 computed its set BEFORE `clara.documents` was taken, so a Work that stopped being
-- eligible in between (answered and committed by its own run, cancelled by a human, restated
-- from somewhere else) must be LEFT ALONE rather than restated on a stale premise; and a Work
-- that became eligible in between must not be touched at all, because this transaction never
-- locked it.
--
-- THE KEY IS DERIVED AND DETERMINISTIC. `source_corrected:<revision>:<work>` is both the
-- successor's `intent_key` (durable on clara.accounting_work, unique per firm+client) and this
-- restatement's op key (durable on clara.op_receipts), so the REASON a Work was retired is a
-- fact on two relations rather than prose in a comment. The revision id makes it unique per
-- correction, which is what keeps a second correction of the same document from replaying the
-- first one's restatement.
create or replace function clara._supersede_source_corrected_work(p_document uuid, p_firm uuid,
    p_locked uuid[], p_actor uuid, p_revision uuid) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_eligible uuid[]; v_id uuid; w record; v_model text; v_key text;
  v_restated jsonb; v_out jsonb := '[]'::jsonb;
begin
  if p_locked is null or cardinality(p_locked) = 0 then return v_out; end if;
  v_eligible := clara._source_corrected_work(p_document, p_firm);
  foreach v_id in array p_locked loop
    continue when not (v_id = any(v_eligible));
    select aw.* into w from clara.accounting_work aw where aw.id = v_id;
    -- THE MODEL THE SUCCESSOR'S RUN IS SERVED BY: the one the retired run recorded. The composer
    -- refuses a blank snapshot, and a Work parked on a question always has a task to read it from.
    select at.model_snapshot into v_model from clara.agent_tasks at
     where at.id = coalesce(w.current_task_id,
             (select i.task_id from clara.agent_interruptions i
               where i.work_id = v_id and i.status = 'pending'
               order by i.created_at, i.id limit 1));
    v_key := 'source_corrected:' || p_revision::text || ':' || v_id::text;
    v_restated := clara.restate_accounting_work(v_id, p_actor, v_key, w.basis, w.basis_origin,
      w.source_refs, v_model, v_key);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'work_id', v_id,
      'new_work_id', v_restated->>'work_id',
      'task_id', v_restated->'task_id',
      'reason', 'source_corrected',
      'revision_id', p_revision));
  end loop;
  return v_out;
end $$;
revoke all on function clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid) from public;
comment on function clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid) is
  '#885: cancels and re-admits every LOCKED Work that is still affected by a correction of this '
  'document, through clara.restate_accounting_work (0200 §E) so the four supersession writes and '
  'the single work.cancelled event keep exactly one spelling. Returns one {work_id, new_work_id, '
  'task_id, reason:source_corrected, revision_id} object per Work.';

-- =====================================================================================
-- §B  clara.revise_document_fact — 0217 §4's body VERBATIM plus exactly THREE additions:
--     two declare variables, ONE lock call placed above the document lock, and the supersede
--     call with its three payload keys (receipt, audit row). The `document.fact_revised` event
--     and the audit row swap places so the CAUSE is appended before the effects it causes and
--     the audit row can name them; neither call's own arguments change otherwise.
-- =====================================================================================
create or replace function clara.revise_document_fact(p_document uuid, p_field_path text, p_value jsonb,
    p_observed_version int, p_reason text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  c record; wk record; d record; obs record; r record; prior record;
  v_dedupe jsonb; v_ext uuid; v_version int; v_format text; v_cap jsonb;
  v_raw text; v_cents bigint; v_monetary boolean; v_carried int := 0;
  v_prior_value jsonb; v_new_value jsonb; v_client uuid; v_revision uuid;
  v_locator_kind text; v_locator jsonb; v_found boolean;
  -- #885 · the Work rungs this call took BEFORE clara.documents, and what it did with them.
  v_locked uuid[]; v_superseded jsonb;
begin
  -- THE AGENT WALL, verbatim from clara.set_document_kind (0169:162-165). A revision of what a
  -- document SAYS is a human judgement; a wake credential makes none.
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id = clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot revise a document fact' using errcode = 'CLR03';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_document is null or p_field_path is null
     or p_reason is null or nullif(btrim(p_reason), '') is null then
    raise exception 'a document, a field path and a reason are required' using errcode = 'CLR10',
      detail = '{"reason":"revision_incomplete"}';
  end if;

  -- #885 · THE WORK RUNGS, TAKEN BEFORE clara.documents AND NOT AFTER IT. The declared global
  -- order is accounting_plans -> accounting_work -> agent_tasks -> agent_interruptions
  -- (0193:248), and the JOURNAL lane already takes clara.documents while holding the
  -- accounting_work rung (clara._lock_document_binding, 0197:329, from two BEFORE ROW triggers
  -- on clara.journal_entries and clara.entry_evidence_links). A correcting transaction that
  -- took clara.documents first and reached for a Work row afterwards would be the OTHER
  -- direction of that same edge -- the ABBA a posting transaction and a correction can deadlock
  -- on. So the Work rungs are taken FIRST, in the declared order, and clara.documents stays
  -- BELOW them; 0217's own documents lock is not moved by one line, it simply is no longer the
  -- first lock this body takes. The helper returns exactly the ids it LOCKED, and nothing else
  -- in this body may supersede a Work it did not lock.
  v_locked := clara._lock_source_corrected_work(p_document, c.firm);

  -- SERIALISED AGAINST EVERY OTHER WRITER OF THIS DOCUMENT'S READING, on the same row
  -- clara.set_document_kind takes (0169:184). Two concurrent revisions of the same document
  -- therefore queue here rather than racing the facts-version comparison below.
  select * into d from clara.documents where id = p_document for update;
  if not found or d.firm_id <> c.firm then
    raise exception 'document not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"document_not_found"}';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'revise_document_fact', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'value', p_value, 'observed_version', p_observed_version, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- 0038's LIVE BANK STATEMENT PIN, the same family as set_document_kind's (0169:199-203): a
  -- statement, its lines and every match on them cite this document's reading. Void the statement
  -- first, then revise.
  if clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before revising its facts'
      using errcode = 'CLR10', detail = '{"reason":"live_bank_statement_present"}';
  end if;

  -- THE GRAMMAR WALL FIRST (0191:554 -- CLR10 with its own detail), then the narrower lane wall.
  -- Order matters: a string that is not a path at all must be refused as a SYNTAX error, while
  -- `statement.closing_balance` is a perfectly canonical path that simply cannot live in an
  -- invoice-facts extraction.
  perform clara._assert_field_path(p_field_path);
  if not clara._revisable_invoice_field(p_field_path) then
    raise exception 'field path % is not one this door can revise', quote_literal(left(p_field_path, 160))
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'field_path_not_revisable',
        'field_path', p_field_path)::text;
  end if;

  -- THE CAPABILITY REGISTRY'S OWN VERDICT (0191:460), asked rather than re-derived. An
  -- unclassified document reads `typed_facts: unsupported` with `kind_known:false`, which is the
  -- honest refusal for "there are no typed facts here to revise yet".
  v_format := clara._document_format(d.mime_type);
  v_cap := clara._document_capability(v_format, d.document_kind);
  if coalesce(v_cap->>'typed_facts', 'unsupported') <> 'supported' then
    raise exception 'typed facts are not supported for this document'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'typed_facts_not_supported',
        'format', v_format, 'document_kind', d.document_kind,
        'typed_facts', v_cap->>'typed_facts')::text;
  end if;

  select * into obs from clara._document_source_observation(p_document);
  if obs.facts_version = 0 or obs.facts_extraction_id is null then
    raise exception 'this document carries no typed facts to revise'
      using errcode = 'CLR10', detail = '{"reason":"no_facts_to_revise"}';
  end if;

  -- THE VALUE, decoded before the staleness comparison so a malformed value is not reported as a
  -- version problem. A jsonb scalar only: an object or an array is not a value a fact region can
  -- carry, and silently stringifying one would store JSON text where a professional expects the
  -- figure they typed.
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number') then
    raise exception 'a revised fact value must be a JSON string or number'
      using errcode = 'CLR10', detail = '{"reason":"value_not_scalar"}';
  end if;
  v_raw := p_value #>> '{}';
  if nullif(btrim(coalesce(v_raw, '')), '') is null then
    raise exception 'a revised fact value must not be blank -- this door revises a value, it does not remove one'
      using errcode = 'CLR10', detail = '{"reason":"value_blank"}';
  end if;
  v_raw := btrim(v_raw);
  v_monetary := clara._monetary_invoice_field(p_field_path);
  if v_monetary then
    v_cents := clara._normalize_invoice_cents(v_raw);
    -- STRICTER THAN clara.persist_invoice_facts ON `invoice.total`, DELIBERATELY. That writer
    -- admits an unparseable total because an OCR engine legitimately cannot read one and the
    -- fail-closed corroboration path handles it (0026:846-851). A HUMAN typing a total that does
    -- not normalise to cents is a typo, and accepting it would store a fact with no number in the
    -- one field the six-term identity is measured against.
    if v_cents is null then
      raise exception 'a revised monetary value must be readable as cents'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'monetary_value_malformed',
          'field_path', p_field_path, 'attempted_value', v_raw)::text;
    end if;
    -- 0022's (b2) and 0023's (b3) sign conventions, re-stated at this boundary because an
    -- emitter convention is not a control: the identity SUBTRACTS the discount, so a negative one
    -- becomes a plus and a wrong total ties.
    if p_field_path in ('invoice.service_charge','invoice.discount','invoice.delivery',
                        'invoice.total_excl_tax','invoice.tax_total') and v_cents < 0 then
      raise exception 'a stated invoice component must not be negative'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'component_must_not_be_negative',
          'field_path', p_field_path, 'attempted_cents', v_cents)::text;
    end if;
  end if;

  -- THE STALE-SOURCE REFUSAL (CLR19), with the attempted value echoed back so the surface can
  -- re-show what the human typed beside what the document now says. AC2: "preserves the attempted
  -- values and converges on the accepted revision".
  if p_observed_version is distinct from obs.facts_version then
    raise exception 'this revision was written against facts version %, the current version is %',
      coalesce(p_observed_version, -1), obs.facts_version
      using errcode = 'CLR19', detail = jsonb_build_object('reason', 'stale_source_version',
        'observed_version', p_observed_version, 'current_version', obs.facts_version,
        'current_extraction_id', obs.facts_extraction_id,
        'field_path', p_field_path, 'attempted_value', v_raw)::text;
  end if;

  -- THE APPENDED EXTRACTION. version_n is scoped to (document, engine_id, engine_kind) exactly as
  -- 0169:291-292 scopes the human classification's, so it counts THIS engine's revisions and
  -- collides with nothing the machine wrote.
  select coalesce(max(version_n), 0) + 1 into v_version from clara.document_extractions
   where document_id = p_document and engine_id = 'clara-fact-human:v1' and engine_kind = 'invoice_facts';

  select * into prior from clara.document_regions rg
   where rg.extraction_id = obs.facts_extraction_id and rg.field_path = p_field_path
   order by rg.created_at, rg.id limit 1;
  v_found := found;
  if v_found then
    v_prior_value := jsonb_strip_nulls(jsonb_build_object(
      'text', prior.text_content, 'cents', prior.monetary_cents));
    -- THE LOCATOR IS CARRIED, not invented: the human is correcting the value read AT THAT PLACE
    -- on the page, so the overlay keeps pointing at the same polygon and UI-17's highlight still
    -- lands where the figure is printed.
    v_locator_kind := prior.locator_kind;
    v_locator := prior.locator;
  else
    v_prior_value := null;
    -- A fact the reader never persisted has no place on the page to point at. An EMPTY polygon is
    -- the honest locator: clara.document_regions.locator is NOT NULL, and the page overlay skips a
    -- region whose polygon is missing or too short rather than drawing a degenerate shape.
    v_locator_kind := 'page_polygon';
    v_locator := jsonb_build_object('page', 1, 'polygon', '[]'::jsonb, 'source', 'human');
  end if;
  v_new_value := jsonb_strip_nulls(jsonb_build_object('text', v_raw, 'cents', v_cents));

  insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
      version_n, status, page_count, envelope)
    values (c.firm, p_document, 'clara-fact-human:v1', 'invoice_facts', v_version, 'done',
      coalesce(d.page_count, 0),
      jsonb_build_object('source', 'human', 'actor', c.actor, 'reason', btrim(p_reason),
        'field_path', p_field_path, 'prior_value', v_prior_value, 'new_value', v_new_value,
        'revises_extraction_id', obs.facts_extraction_id,
        'observed_version', obs.facts_version, 'op_key', p_op_key))
    returning id into v_ext;

  -- EVERY OTHER FACT CARRIED FORWARD. Without this the appended extraction would supersede the
  -- machine's whole reading with a single field (0089:280-285 supersedes the entire kind), and the
  -- arithmetic belt would then measure a document with no total. Each carried path passes the
  -- canonical grammar on the way in, so a path that predates 0191's splice cannot ride through
  -- this door.
  for r in select rg.* from clara.document_regions rg
            where rg.extraction_id = obs.facts_extraction_id
              and rg.field_path is distinct from p_field_path
            order by rg.created_at, rg.id loop
    perform clara._assert_field_path(r.field_path);
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
        field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
      values (c.firm, v_ext, r.locator_kind, r.locator, r.field_path, r.text_content,
        r.engine_confidence, r.monetary_raw, r.monetary_cents);
    v_carried := v_carried + 1;
  end loop;

  insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
      field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
    values (c.firm, v_ext, v_locator_kind, v_locator, p_field_path, v_raw, 1,
      case when v_monetary then v_raw end, v_cents);

  v_client := clara._document_sole_live_client(p_document);
  insert into clara.document_fact_revisions(firm_id, client_id, document_id, revision_kind,
      field_path, prior_value, new_value, observed_extraction_id, observed_version_n,
      resulting_extraction_id, reason, recorded_by, op_key)
    values (c.firm, v_client, p_document, 'fact', p_field_path, v_prior_value, v_new_value,
      obs.facts_extraction_id, obs.facts_version, v_ext, btrim(p_reason), c.actor, p_op_key)
    returning id into v_revision;

  -- #885 · THE CAUSE IS APPENDED FIRST, and 0217's own event is unchanged to the byte. A reader
  -- of the feed meets the correction and only then the cancellations it caused; the reverse order
  -- would show a Work retired for a reason the timeline had not yet recorded. (0217 wrote the
  -- audit row before this event; the audit row now has to NAME the supersessions, so it moves
  -- below them and this event moves above. Nothing else about either call changes.)
  perform clara._append_event(c.firm, 'document.fact_revised', v_client, c.actor, null, null,
    null, p_document, null,
    jsonb_build_object('revision_id', v_revision, 'field_path', p_field_path,
      'extraction_id', v_ext, 'observed_version', obs.facts_version,
      'facts_version', obs.facts_version + 1, 'source', 'human'));

  -- #885 · THE EFFECT. Every Work this call LOCKED that is still parked on a question about this
  -- document is cancelled with the correction as its reason and superseded by a fresh Work on the
  -- same admitted basis -- the owner's 2026-09-17 ruling, re-confirmed 2026-09-20. It runs in THIS
  -- transaction: a runtime consumer would leave a window in which the stale question is still
  -- answerable, which is the one thing the ruling forbids. If a replacement cannot be admitted,
  -- the restate door's own typed refusal propagates and the WHOLE correction refuses -- nothing
  -- half-done is ever committed.
  v_superseded := clara._supersede_source_corrected_work(p_document, c.firm, v_locked, c.actor,
    v_revision);

  perform clara._audit(c.firm, c.actor, null, null, 'revise_document_fact', null,
    jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'prior_value', v_prior_value, 'new_value', v_new_value,
      'observed_extraction', obs.facts_extraction_id,
      'observed_version', obs.facts_version, 'extraction', v_ext, 'revision', v_revision,
      'reason', p_reason, 'op_key', p_op_key,
      'superseded_work', v_superseded));

  return clara._finish_op(c.firm, 'revise_document_fact', p_op_key,
    jsonb_build_object('document_id', p_document, 'revision_id', v_revision,
      'field_path', p_field_path, 'prior_value', v_prior_value, 'new_value', v_new_value,
      'extraction_id', v_ext, 'observed_extraction_id', obs.facts_extraction_id,
      'observed_version', obs.facts_version, 'facts_version', obs.facts_version + 1,
      'carried_regions', v_carried,
      'superseded_work', v_superseded));
end $fn$;

-- =====================================================================================
-- §C  clara.answer_work_question — 0200 §D's body VERBATIM plus exactly THREE additions: one
--     column on the Work select, one key on `current`, and one `reason` VALUE on the status arm
--     that already existed. Every refusal it raised, it still raises.
-- =====================================================================================
create or replace function clara.answer_work_question(p_question uuid, p_question_version int,
    p_answer jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; i record; w record; v_client_status text; v_role text;
  v_current jsonb; v_result jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  if p_question_version is null or p_question_version < 1 then
    raise exception 'a question version is required' using errcode='CLR10',
      detail='{"reason":"invalid_question_version"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(c.firm, 'answer_work_question', p_op_key,
      clara._hash(jsonb_build_object('q', p_question, 'v', p_question_version, 'a', p_answer)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args". Re-raised WITH a detail so
    -- this door's contract is one shape: every refusal it emits carries (errcode, detail.reason).
    raise exception 'this op key was already used for a different answer' using errcode='CLR10',
      detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if coalesce(v_dedupe->>'pending','') = 'true' then
      raise exception 'this answer is already being recorded' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;                              -- the ORIGINAL receipt, byte-identical
  end if;

  select * into i from clara.agent_interruptions where id = p_question for update;
  -- NO ORACLE: an unknown id, another firm's row and a CHAT clarify all answer the same way. A
  -- caller learns nothing about what exists outside its own firm.
  if not found or i.firm_id <> c.firm or i.work_id is null then
    raise exception 'question not found' using errcode='CLR11', detail='{"reason":"question_not_found"}';
  end if;
  -- #721: `aw.basis` joins the select because the basis-change discriminator below needs the
  -- ADMITTED values, not only their digest — a digest can say "it changed", never "you are about
  -- to change posting_date, which is already 2026-09-01".
  -- #885: `aw.superseded_by` joins the select because the status arm below has to tell a
  -- question that was CLOSED BY A SUPERSESSION apart from one an ordinary cancel closed --
  -- the first has a successor to send the person to, the second does not.
  select aw.id, aw.status, aw.basis_digest, aw.current_task_id, aw.client_id, aw.basis,
         aw.superseded_by into w
    from clara.accounting_work aw where aw.id = i.work_id;

  select cl.status into v_client_status from clara.clients cl
   where cl.id = i.client_id and cl.firm_id = c.firm;
  if v_client_status is distinct from 'active' then
    raise exception 'this client is not active' using errcode='CLR04',
      detail='{"reason":"client_inactive"}';
  end if;

  v_current := jsonb_build_object('status', i.status, 'question_version', i.question_version,
    'answered_by', i.answered_by, 'answered_at', i.answered_at,
    'work_id', i.work_id, 'work_status', w.status,
    -- #885 · the successor, so a surface that converges can link to the Work that replaced
    -- this one instead of leaving a person at a dead end. SQL NULL when there is none.
    'superseded_by', w.superseded_by);

  if i.status <> 'pending' then
    raise exception 'this question is no longer open (%)', i.status using errcode='CLR13',
      detail=jsonb_build_object(
        -- #885 · ONE NEW WORD, ON THE NARROWEST CONDITION THAT CAN CARRY IT. A question the
        -- CANCEL CASCADE closed (clara.cancel_accounting_work, 0199 §G') reads 'cancelled', and
        -- for an ordinary cancel that is the whole truth. When the Work also carries
        -- `superseded_by` -- a restatement (#721) or, from this file, a SOURCE CORRECTION -- the
        -- truth is narrower and more useful: this question was retired because its Work was
        -- replaced, the replacement is named in `current.superseded_by`, and answering the old
        -- one could only ever have written an answer against a basis nobody is acting on. Every
        -- other status keeps the exact word 0180 gave it, and `already_answered` still wins.
        'reason', case when i.status = 'answered' then 'already_answered'
                       when i.status = 'cancelled' and w.superseded_by is not null then 'superseded'
                       else i.status end,
        'current', v_current)::text;
  end if;
  if i.question_version <> p_question_version then
    raise exception 'this answer is for question version %, the current version is %',
      p_question_version, i.question_version
      using errcode='CLR13', detail=jsonb_build_object('reason','stale_question','current',v_current)::text;
  end if;
  -- THE DEADLINE, COMPARED AFTER THE LOCK (S4-D5).
  if i.expires_at < clock_timestamp() then
    raise exception 'this question has expired' using errcode='CLR13',
      detail=jsonb_build_object('reason','expired','current',v_current)::text;
  end if;
  -- THE WORK MUST STILL BE PARKED ON *THIS* QUESTION'S RUN.
  if w.status <> 'awaiting_input' or w.current_task_id is distinct from i.task_id then
    raise exception 'this Work is no longer waiting on this question' using errcode='CLR13',
      detail=jsonb_build_object('reason','state_changed','current',v_current)::text;
  end if;
  -- AND THE BASIS MUST STILL BE THE ONE THE QUESTION WAS ASKED ABOUT.
  if w.basis_digest is distinct from i.basis_digest then
    raise exception 'the basis this question was asked about has changed' using errcode='CLR13',
      detail=jsonb_build_object('reason','basis_changed','current',v_current)::text;
  end if;

  -- #721 · AN ANSWER COMPLETES ONLY WHAT WAS ASKED. A reply that claims a basis element is not an
  -- answer to this question — it is a NEW instruction, and `clara.restate_accounting_work` is where
  -- it goes. The rule is asserted in TWO PHASES around the generic answer assertion, because the
  -- two halves want opposite precedence and one call cannot have both:
  --
  --   PHASE 1, BEFORE it (`p_basis` deliberately NULL, so only the shape arms can fire): an
  --   explicit `basis`/`basis_patch` member, and a basis-element key THIS QUESTION DID NOT
  --   DECLARE. These must beat `clara._assert_work_answer`, which would otherwise reach an
  --   undeclared basis element and answer `unknown_key` — true, and useless.
  --
  --   PHASE 2, AFTER it (`p_basis` = the ADMITTED basis): a DECLARED basis element that the
  --   admitted basis already carries with a different value. This must LOSE to
  --   `clara._assert_work_answer`, because "you may not change the posting date" is the wrong
  --   thing to say about `01/09/2026` or a blank — those are malformed answers, and #629's typed
  --   `iso_date` / `required` diagnosis is the better one. Only a well-formed claim reaches here.
  perform clara._assert_answer_changes_no_basis(i.fields, p_answer, null);

  perform clara._assert_work_answer(i.fields, p_answer, i.client_id);

  -- #721 · PHASE 2. See the two-phase note above.
  perform clara._assert_answer_changes_no_basis(i.fields, p_answer, w.basis);

  select m.role into v_role from clara.firm_memberships m
   where m.firm_id = c.firm and m.user_id = c.actor and m.status = 'active';

  update clara.agent_interruptions
     set status = 'answered', answer = p_answer, answered_by = c.actor, answered_at = now(),
         answer_key = p_op_key, answered_role = v_role
   where id = p_question and status = 'pending';

  perform clara._audit(c.firm, c.actor, null, null, 'answer_work_question', null,
    jsonb_build_object('question', p_question, 'work', i.work_id,
      'question_version', i.question_version, 'op_key', p_op_key));
  perform pg_notify('clara_runtime_ctl', '');

  v_result := jsonb_build_object('question_id', p_question, 'work_id', i.work_id,
    'question_version', i.question_version, 'status', 'answered',
    'answered_by', c.actor, 'answered_role', v_role,
    'answered_at', (select answered_at from clara.agent_interruptions where id = p_question));
  return clara._finish_op(c.firm, 'answer_work_question', p_op_key, v_result);
end $$;

reset role;

-- =====================================================================================
-- §T  TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w885_tail$
declare v_src text; v_n int; v_sha text; v_sig text; v_posture text; v_missing text;
begin
  -- 1 · THE THREE NEW BODIES: created, owned by clara_fn_owner, SECURITY DEFINER, pinned
  -- search_path, PUBLIC revoked, and EXECUTE-reachable by NO application role.
  foreach v_sig in array array['clara._source_corrected_work(uuid,uuid)',
      'clara._lock_source_corrected_work(uuid,uuid)',
      'clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception '#885 tail: % was not created', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p join pg_roles r on r.oid = p.proowner
     where p.oid = v_sig::regprocedure and r.rolname = 'clara_fn_owner' and p.prosecdef
       and p.proconfig @> array['search_path=clara, pg_temp'];
    if v_n <> 1 then
      raise exception '#885 tail: % is not a clara_fn_owner SECURITY DEFINER with a pinned search_path', v_sig
        using errcode='CLR10';
    end if;
    if has_function_privilege('public', v_sig::regprocedure, 'execute') then
      raise exception '#885 tail: PUBLIC still holds EXECUTE on %', v_sig using errcode='CLR10';
    end if;
    foreach v_posture in array array['clara_authenticated','clara_runtime','clara_agent_ro'] loop
      if to_regrole(v_posture) is not null
         and has_function_privilege(v_posture, v_sig::regprocedure, 'execute') then
        raise exception '#885 tail: % is EXECUTE-reachable by % -- these bodies are internal to clara.revise_document_fact', v_sig, v_posture
          using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- 2 · THE ONE RULE IS ASKED, NEVER RE-SPELLED. Both the lock and the effect name the finder,
  -- and neither carries its own copy of the source_refs predicate.
  foreach v_sig in array array['clara._lock_source_corrected_work(uuid,uuid)',
      'clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    if position('clara._source_corrected_work' in v_src) = 0 then
      raise exception '#885 tail: % does not ask clara._source_corrected_work', v_sig using errcode='CLR10';
    end if;
    if position('jsonb_array_elements' in v_src) <> 0 then
      raise exception '#885 tail: % carries its OWN copy of the source_refs predicate instead of asking the one rule', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- 2b · THE FINDER REALLY CARRIES ALL FOUR TERMS of the rule this file documents.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._source_corrected_work(uuid,uuid)'::regprocedure;
  v_missing := '';
  if position('i.status = ''pending''' in v_src) = 0 then v_missing := v_missing || ' pending-question'; end if;
  if position('x->>''document_id'' = p_document::text' in v_src) = 0 then v_missing := v_missing || ' this-document'; end if;
  if position('clara._work_committed_receipt(w.id) is null' in v_src) = 0 then v_missing := v_missing || ' no-committed-receipt'; end if;
  if position('w.status in (''queued'', ''running'', ''awaiting_input'')' in v_src) = 0 then v_missing := v_missing || ' restatable-set'; end if;
  if position('i.firm_id = p_firm' in v_src) = 0 then v_missing := v_missing || ' interruption-tenant-term'; end if;
  if v_missing <> '' then
    raise exception '#885 tail: clara._source_corrected_work is missing term(s):%', v_missing using errcode='CLR10';
  end if;

  -- 2c · THE EFFECT GOES THROUGH 0200's DOOR, and mints no second spelling of the four writes.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid)'::regprocedure;
  if position('clara.restate_accounting_work(' in v_src) = 0 then
    raise exception '#885 tail: the effect does not call clara.restate_accounting_work' using errcode='CLR10';
  end if;
  foreach v_sig in array array['clara.admit_journal_work', 'clara.cancel_accounting_work',
      'set superseded_by', 'set supersedes'] loop
    if position(v_sig in v_src) <> 0 then
      raise exception '#885 tail: the effect re-spells % instead of delegating to clara.restate_accounting_work', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  if position('''source_corrected''' in v_src) = 0
     or position('''source_corrected:''' in v_src) = 0 then
    raise exception '#885 tail: the effect does not carry the source_corrected reason and derived key'
      using errcode='CLR10';
  end if;

  -- 3 · THE RECUT DOOR: still exactly one body, and the ORDER is asserted POSITIONALLY, because
  -- the order IS the mechanism (0197 §F's own idiom).
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='revise_document_fact';
  if v_n <> 1 then
    raise exception '#885 tail: clara.revise_document_fact now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)'::regprocedure;
  if position('clara._lock_source_corrected_work' in v_src) = 0 then
    raise exception '#885 tail: clara.revise_document_fact does not take the Work rungs at all'
      using errcode='CLR10';
  end if;
  if position('from clara.documents where id = p_document for update' in v_src) = 0 then
    raise exception '#885 tail: clara.revise_document_fact lost 0217''s own document lock'
      using errcode='CLR10';
  end if;
  if position('clara._lock_source_corrected_work' in v_src)
     > position('from clara.documents where id = p_document for update' in v_src) then
    raise exception '#885 tail: clara.revise_document_fact takes clara.documents BEFORE the Work rungs -- that is the ABBA against the journal lane''s clara._lock_document_binding that this file exists to avoid'
      using errcode='CLR10';
  end if;
  if position('clara._supersede_source_corrected_work' in v_src) = 0 then
    raise exception '#885 tail: clara.revise_document_fact never supersedes anything' using errcode='CLR10';
  end if;
  if position('clara.document_fact_revisions' in v_src)
     > position('clara._supersede_source_corrected_work' in v_src) then
    raise exception '#885 tail: clara.revise_document_fact supersedes BEFORE it records the revision -- the successor would name a revision that did not exist'
      using errcode='CLR10';
  end if;
  if position('''document.fact_revised''' in v_src)
     > position('clara._supersede_source_corrected_work' in v_src) then
    raise exception '#885 tail: the correction event is appended AFTER the cancellations it causes'
      using errcode='CLR10';
  end if;
  -- …and 0217's own guards are all still standing.
  v_missing := '';
  if position('agent identity cannot revise a document fact' in v_src) = 0 then v_missing := v_missing || ' agent-wall'; end if;
  if position('stale_source_version' in v_src) = 0 then v_missing := v_missing || ' CLR19-stale'; end if;
  if position('live_bank_statement_present' in v_src) = 0 then v_missing := v_missing || ' bank-pin'; end if;
  if position('typed_facts_not_supported' in v_src) = 0 then v_missing := v_missing || ' capability'; end if;
  if position('field_path_not_revisable' in v_src) = 0 then v_missing := v_missing || ' lane-wall'; end if;
  if position('monetary_value_malformed' in v_src) = 0 then v_missing := v_missing || ' cents'; end if;
  if position('clara._reserve_op(c.firm, ''revise_document_fact''' in v_src) = 0 then v_missing := v_missing || ' reserve'; end if;
  if position('''superseded_work'', v_superseded' in v_src) = 0 then v_missing := v_missing || ' receipt-key'; end if;
  if v_missing <> '' then
    raise exception '#885 tail: clara.revise_document_fact LOST guard(s)/key(s):% -- only the three #885 additions may change', v_missing
      using errcode='CLR10';
  end if;

  -- 4 · THE ANSWER DOOR: one body, the new word, and every refusal 0180/0200 gave it.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='answer_work_question';
  if v_n <> 1 then
    raise exception '#885 tail: clara.answer_work_question now has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.answer_work_question(uuid,int,jsonb,text)'::regprocedure;
  v_missing := '';
  if position('then ''superseded''' in v_src) = 0 then v_missing := v_missing || ' superseded-word'; end if;
  if position('''superseded_by'', w.superseded_by' in v_src) = 0 then v_missing := v_missing || ' successor-on-current'; end if;
  if position('''already_answered''' in v_src) = 0 then v_missing := v_missing || ' already_answered'; end if;
  if position('''stale_question''' in v_src) = 0 then v_missing := v_missing || ' stale_question'; end if;
  if position('''expired''' in v_src) = 0 then v_missing := v_missing || ' expired'; end if;
  if position('''state_changed''' in v_src) = 0 then v_missing := v_missing || ' state_changed'; end if;
  if position('''basis_changed''' in v_src) = 0 then v_missing := v_missing || ' basis_changed'; end if;
  if position('clara._assert_answer_changes_no_basis(i.fields, p_answer, null)' in v_src) = 0 then v_missing := v_missing || ' phase-1'; end if;
  if position('clara._assert_answer_changes_no_basis(i.fields, p_answer, w.basis)' in v_src) = 0 then v_missing := v_missing || ' phase-2'; end if;
  if position('clara._assert_work_answer(i.fields, p_answer, i.client_id)' in v_src) = 0 then v_missing := v_missing || ' answer-assertion'; end if;
  if v_missing <> '' then
    raise exception '#885 tail: clara.answer_work_question LOST arm(s)/key(s):% -- only the three #885 additions may change', v_missing
      using errcode='CLR10';
  end if;
  -- THE NEW WORD IS NARROW: it can only be reached for a CANCELLED question whose Work carries a
  -- successor. A body that reached it on any non-pending status would re-label `expired`.
  if position('when i.status = ''cancelled'' and w.superseded_by is not null then ''superseded''' in v_src) = 0 then
    raise exception '#885 tail: the superseded arm is not the narrow (cancelled AND superseded_by) one this file documents'
      using errcode='CLR10';
  end if;

  -- 5 · BOTH RECUT SHAS MOVED (the splices actually committed).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)'::regprocedure;
  if v_sha = 'b89a01ba9b5f029435afa6dfd450144ccb8dcc9d29f24ec9c96495e999c09d29' then
    raise exception '#885 tail: clara.revise_document_fact is BYTE-IDENTICAL to its pre-image -- the recut did not commit'
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.answer_work_question(uuid,int,jsonb,text)'::regprocedure;
  if v_sha = '15a82c080d102e61ebdead2280577072a87c21720375174e83c86a7198fb07a7' then
    raise exception '#885 tail: clara.answer_work_question is BYTE-IDENTICAL to its pre-image -- the recut did not commit'
      using errcode='CLR10';
  end if;

  -- 6 · AND THE FOUR BODIES THIS FILE CALLS OR LEAVES ALONE ARE BYTE-IDENTICAL to their pins.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.restate_accounting_work(uuid,uuid,text,jsonb,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from 'd3c5cc932d8ff63eb1b19aad22d8c54a74bf5a6a90cbb4776cee3c1a53c5be90' then
    raise exception '#885 tail: clara.restate_accounting_work MOVED (measured %) -- this file must not touch it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.cancel_accounting_work(uuid,uuid,text)'::regprocedure;
  if v_sha is distinct from '27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b' then
    raise exception '#885 tail: clara.cancel_accounting_work MOVED (measured %) -- this file must not touch it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._work_committed_receipt(uuid)'::regprocedure;
  if v_sha is distinct from '82700a7c43b7c08d19f6293d774ae61e623c9a6222394e93ca4c04398930de0c' then
    raise exception '#885 tail: clara._work_committed_receipt MOVED (measured %) -- this file must not touch it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_source_dependents(uuid)'::regprocedure;
  if v_sha is distinct from 'f385e7843522d089141cdf64ccd97024eff0c4d6e81e5430dea7ce732278433a' then
    raise exception '#885 tail: clara.list_source_dependents MOVED (measured %) -- this file does not recut the read', v_sha
      using errcode='CLR10';
  end if;

  -- 7 · NO NEW EVENT TYPE, NO NEW TAXONOMY ROW. The cancellation rides 0199's own work.cancelled.
  if not exists (select 1 from clara.event_types e where e.name = 'work.cancelled') then
    raise exception '#885 tail: work.cancelled is not registered -- the successor link this file relies on has no carrier'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.event_types e where e.name like 'work.source%';
  if v_n <> 0 then
    raise exception '#885 tail: this file registered % work.source%% event type(s) -- it registers none', v_n
      using errcode='CLR10';
  end if;

  raise notice '#885 tail: OK -- clara._source_corrected_work, clara._lock_source_corrected_work and clara._supersede_source_corrected_work exist as clara_fn_owner SECURITY DEFINERs with pinned search_paths and NO grant to any application role; the lock and the effect both ASK the one rule and neither re-spells it; clara.revise_document_fact takes the accounting_work/agent_tasks/agent_interruptions rungs BEFORE clara.documents, records the revision before it supersedes, appends document.fact_revised before the cancellations it causes, and keeps every 0217 guard; clara.answer_work_question gained the narrow (cancelled AND superseded_by) -> superseded word plus the successor on detail.current and kept every refusal 0180/0200 gave it; and clara.restate_accounting_work, clara.cancel_accounting_work, clara._work_committed_receipt and clara.list_source_dependents are byte-identical to their pinned shas.';
end
$w885_tail$;
