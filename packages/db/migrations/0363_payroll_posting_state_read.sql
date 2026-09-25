-- 0363_payroll_posting_state_read — #1148 (riders closing wave, lane 01): the payroll posting
-- verdict gets a granted, DOCUMENT-SCOPED read, so a document page can say why a payslip did not
-- post.
-- =====================================================================================
-- Spec of record: issue #1148's body (Agent Brief, riders closing wave, 2026-09-26; the ticket
-- carries ZERO comments, so the body is the whole contract). Source: candidate C15 of
-- `reports/waveS-followup-candidates.md`, which is #1048's own report
-- `waveS-lane04-ticket1048.md` §10 follow-up 1, with the routing it forces written out in that
-- report's §9.2.
--
-- WHAT #1048 LEFT. `clara._payroll_posting_verdict(uuid)` (0297:557, recut by 0343 §H) holds the
-- whole answer: the sentence naming what stopped the post, the verdict, the rung, the reason and
-- the completeness state. It is UNGRANTED (0297:841 revokes it from public and nothing ever
-- granted it) and is reached from `clara._post_payroll_run`, `clara.list_review_queue` and
-- `clara.answer_payroll_completeness` alone. The only way to SEE the verdict was therefore a
-- Needs-you queue row — firm-wide or client-scoped — or the entry's own receipt. A document page
-- that wanted to say "this payslip did not post because …" had NO read to call, which is why
-- #1048's own tool contract had to ask `clara.list_review_queue(p_scope, p_cursor, p_limit)` with
-- `p_scope = {"client_id": …}` and filter to two row kinds rather than asking about the document
-- it actually has.
--
-- WHAT THIS FILE DOES. ONE granted `security definer` wrapper at the VIEWER floor, firm-scoped
-- through the caller's own context, projecting five of the verdict's keys and nothing else.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   · It does not move ONE grant on `clara._payroll_posting_verdict(uuid)`. The internal stays
--     ungranted; the §0 prestate refuses to apply over a database where that has already stopped
--     being true, and the tail re-reads it after applying. A wrapper on top of a body the caller
--     could already execute would be a second, weaker story about the same wall.
--   · It does not change what the verdict DECIDES, or any posting behaviour. This is a read: it is
--     STABLE, so PostgreSQL itself refuses an INSERT, UPDATE or DELETE inside it, and the tail
--     re-derives that from the catalog rather than trusting the declaration.
--   · It does not touch the Needs-you queue's own rows or the five sync points a row kind carries.
--     `clara.list_review_queue` is byte-unchanged and keeps answering exactly as it does.
--   · It does not answer the completeness question. That is a professional judgement behind a human
--     door (`clara.answer_payroll_completeness`, 0343 §K), untouched here.
--   · It mints no database role (riders closing wave, risk 1: four lanes share one cluster and
--     0154 pins the cluster-wide role count).
--   · It touches no chat or Work tool. Re-pointing `read_payroll_posting_state` from #1048's queue
--     read to this door is a SUCCESSOR CONTRACT in this ticket's report, for a cut AFTER this
--     wave's, because #1144's roster is closed to additions.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates one
                                        -- small function and backfills nothing.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is building on, measured BEFORE it
--      builds. Pins are `sha256(prosrc)` MEASURED on the lane rig (riders closing wave lane 01,
--      127.0.0.1:55742 / `clara_c01`, 338 files, max `0362_standing_instruction_agent_read` —
--      #1147 landed before this ticket and recut nothing named here), never transcribed from an
--      older migration's header.
-- =====================================================================================
do $c0363_pre$
declare
  v_sha text; v_src text; v_acl text; v_n int; v_role text;
begin
  foreach v_role in array array['clara_fn_owner','clara_authenticated','clara_agent_ro','clara_runtime'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      raise exception '0363 prestate: role % is missing', v_role using errcode = 'CLR10';
    end if;
  end loop;

  -- 1 · THE PARENT FILES ARE APPLIED. 0297 mints the verdict; 0343 recut it and added the
  --     `completeness` object this door projects.
  if not exists (select 1 from clara.schema_migrations where version = '0297_payroll_summary_posting')
     or not exists (select 1 from clara.schema_migrations where version = '0343_payroll_completeness_witness') then
    raise exception '0363 prestate: 0297 and 0343 must both be applied before this file'
      using errcode = 'CLR10';
  end if;

  -- 2 · THE BODY THIS DOOR WRAPS, pinned UNCONDITIONALLY. This file never recuts it in either
  --     mode, so a changed sha is ALWAYS a finding and never a redo artefact. It is also what the
  --     integrator diffs against another lane's recuts (closing plan, seam rule (c)); no closing
  --     lane but this one touches the payroll family.
  if to_regprocedure('clara._payroll_posting_verdict(uuid)') is null then
    raise exception '0363 prestate: clara._payroll_posting_verdict(uuid) is absent -- 0297 is this file''s premise'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._payroll_posting_verdict(uuid)'::regprocedure;
  if v_sha is distinct from '4c350623e41527b717a1fc58e3ee8b772060b895b5353098f8cd21153585dac8' then
    raise exception '0363 prestate: clara._payroll_posting_verdict body drifted (sha %) -- this file NEVER recuts it and refuses to build a granted read on a body it cannot recognise', v_sha
      using errcode = 'CLR10';
  end if;

  -- 3 · …AND IT IS UNGRANTED, which is the whole reason this door exists. The file REFUSES TO
  --     APPLY over a database where some role already holds EXECUTE on the internal: a wrapper on
  --     top of a body the caller can already call is not a wall, it is decoration.
  select coalesce(p.proacl::text, '') into v_acl from pg_proc p
   where p.oid = 'clara._payroll_posting_verdict(uuid)'::regprocedure;
  if v_acl <> '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '0363 prestate: clara._payroll_posting_verdict already carries an ACL other than its owner''s (%) -- 0297:841 revokes it from public and this file is the FIRST granted way to reach its answer', v_acl
      using errcode = 'CLR10';
  end if;

  -- 4 · THE ESTATE'S ONE FLOOR BODY AND ITS RANK TABLE, pinned unconditionally for the same
  --     reason: this door adds NO floor of its own, it enters at the estate's, and a changed floor
  --     body would change what "viewer" means underneath a door that never mentions it again.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._human_ctx(integer)'::regprocedure;
  if v_sha is distinct from 'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46' then
    raise exception '0363 prestate: clara._human_ctx body drifted (sha %) -- every floor this file relies on is its', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.role_rank(text)'::regprocedure;
  if v_sha is distinct from '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f' then
    raise exception '0363 prestate: clara.role_rank body drifted (sha %)', v_sha using errcode = 'CLR10';
  end if;

  -- 5 · THE TWO COLUMNS THE WALL IS BUILT ON. Structural rather than a sha: a relation has no
  --     prosrc, and `clara.documents.firm_id` IS the tenancy wall this door closes over.
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.documents'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname in ('id','firm_id','document_kind');
  if v_n <> 3 then
    raise exception '0363 prestate: clara.documents carries % of the 3 columns this file reads (id, firm_id, document_kind)', v_n
      using errcode = 'CLR10';
  end if;
  --     …and `payroll_summary` is a kind this estate actually files under, rather than a string
  --     this file invented: 0296/0297's whole lane is keyed on it, and the capability registry
  --     carries its rows.
  if not exists (select 1 from clara.document_capabilities where document_kind = 'payroll_summary') then
    raise exception '0363 prestate: clara.document_capabilities knows no payroll_summary kind -- this door''s subject would be unreachable'
      using errcode = 'CLR10';
  end if;

  -- 6 · THE NAME THIS FILE MINTS IS FREE, or is already its own (a redo, #957). Anything else
  --     refuses BY NAME rather than being silently replaced.
  select p.prosrc into v_src from pg_proc p
   where p.oid = to_regprocedure('clara.get_payroll_posting_state(uuid)');
  if v_src is not null and position('#1148 [0363]' in v_src) = 0 then
    raise exception '0363 prestate: clara.get_payroll_posting_state(uuid) already exists and is not this file''s body'
      using errcode = 'CLR10';
  end if;
  if v_src is null then
    raise notice '0363 prestate: OK -- the read door is FIRST APPLY; the verdict is at its measured pre-image and ungranted';
  else
    raise notice '0363 prestate: OK -- the read door already carries this file''s marker (redo path); the verdict is at its measured pre-image and ungranted';
  end if;
end
$c0363_pre$;

-- =====================================================================================
-- §A — THE DOOR. clara.get_payroll_posting_state(p_document uuid) returns jsonb.
--
--      THREE THINGS IT DOES, AND NOTHING ELSE.
--
--      (1) IT ENTERS AT THE ESTATE'S FLOOR, VIEWER. `clara._human_ctx(clara.role_rank('viewer'))`
--          is the one floor body in this estate and it raises the three CLR04s a caller can meet:
--          no authenticated actor, no active membership, rank below the floor. VIEWER because
--          every member of a firm may already SEE the document, its filing, its entries and the
--          Needs-you row this sentence is derived for — this read tells them the same thing about
--          a document they are already looking at, and a higher floor would make the page say less
--          to a person than the queue already does.
--
--      (2) IT WALLS ON THE FIRM, AND THAT WALL IS `clara.documents.firm_id`. The internal takes no
--          firm and cannot: it is called from inside bodies that have already resolved one. A
--          DOCUMENT-scoped read cannot borrow that, so it asks the question itself, exactly as
--          `clara.answer_payroll_completeness` (0343 §K) does, and for the same stated reason: a
--          document id that is not this firm's must not be distinguishable from one that does not
--          exist. Both answer CLR11 with ONE message, raised at ONE place, before anything about
--          the document has been read.
--
--      (2b) …AND THEN ON ITS OWN SUBJECT, A PAYROLL SUMMARY. The brief's desired behaviour is a
--          wrapper that "answers the posting state of ONE PAYROLL SUMMARY DOCUMENT". The internal
--          takes any uuid because every body that calls it has already established what it is
--          looking at; a granted door has not. Handed an invoice it would answer
--          `facts_read / payroll_not_read` — "This payroll summary has not been read yet." said
--          over a supplier bill — so it refuses BY NAME instead, `CLR10` +
--          `{"reason":"not_a_payroll_summary"}`. That refusal is not the CLR11 above and must not
--          be: the document IS the caller's firm's and its kind is already theirs to read.
--
--      (3) IT PROJECTS FIVE KEYS. `sentence`, `verdict`, `rung`, `reason`, `completeness` — the
--          brief's own list — plus `document_id`, which is the caller's own argument echoed back
--          and carries no information the caller did not supply. What it does NOT project is the
--          point: `rung_vector` is the evaluator's internal ladder and not a person's business,
--          and `detail`, `plan`, `client_id`, `firm_id`, `filing_id`, `source_doc_sha256`,
--          `extraction_id`, `existing_entry_id`, `period_month`, `posting_date` and `period_label`
--          are internals of the posting lane that a page asking "why did this not post" has no act
--          to spend on.
--
--      IT IS STABLE, AND THAT IS A WALL RATHER THAN A HINT. PostgreSQL refuses every INSERT,
--      UPDATE and DELETE inside a non-volatile function, so a later edit that tried to make this
--      read write would fail to create. The body it wraps is STABLE too (0297 §D: "THE GATE WRITES
--      NOTHING"), so nothing is given up by saying so.
--
--      NO CORE, AND THAT IS LAW 31 RATHER THAN AN OMISSION. 0320, 0352 and 0353 each split a read
--      into one ungranted core with two entrances because a HUMAN door and a MODEL door compute
--      the same rows. This read has ONE entrance today: the model lane's twin is a successor
--      contract for a later cut, and a core minted now would be an ungranted body with exactly one
--      caller.
--
--      REDO-SAFE: `create or replace function`, one grant, no table, no row, no backfill.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.get_payroll_posting_state(p_document uuid)
  returns jsonb language plpgsql stable security definer
  set search_path = clara, pg_temp as $c1148_posting_state$
declare
  h record;
  v jsonb;
  v_kind text;
begin
  -- #1148 [0363]: the granted, document-scoped read of what 0297 §D decided.
  select * into h from clara._human_ctx(clara.role_rank('viewer'));

  -- THE FIRM WALL, ASKED BEFORE ANYTHING ELSE IS READ. One message for "not yours" and for "not a
  -- document at all", so a caller cannot tell the two apart (0343 §K's own wording and reason).
  select d.document_kind into v_kind from clara.documents d
   where d.id = p_document and d.firm_id = h.firm;
  if not found then
    raise exception 'payroll summary not found' using errcode = 'CLR11';
  end if;

  -- …AND THEN THE DOOR'S OWN SUBJECT. The body below takes any uuid and is right to: every other
  -- caller of it has already established what it is looking at. A GRANTED door has not, and handed
  -- an invoice it would answer `facts_read / payroll_not_read` -- "This payroll summary has not
  -- been read yet." said over a supplier bill. CLR10 rather than the CLR11 above, because this
  -- document IS the caller's firm's and its kind is already theirs to read: "not found" would be
  -- the lie here, and the wall above has already decided the only question a stranger may ask.
  if coalesce(v_kind, '') <> 'payroll_summary' then
    raise exception 'this document is not a payroll summary, so it has no payroll posting state'
      using errcode = 'CLR10', detail = '{"reason":"not_a_payroll_summary"}';
  end if;

  v := clara._payroll_posting_verdict(p_document);

  return jsonb_build_object(
    'document_id', p_document,
    'sentence',    v->'sentence',
    'verdict',     v->'verdict',
    'rung',        v->'rung',
    'reason',      v->'reason',
    'completeness', coalesce(v->'completeness', 'null'::jsonb));
end $c1148_posting_state$;

revoke all on function clara.get_payroll_posting_state(uuid) from public;
grant execute on function clara.get_payroll_posting_state(uuid) to clara_authenticated;

comment on function clara.get_payroll_posting_state(uuid) is
  '#1148 [0363]: the granted, DOCUMENT-SCOPED read of the payroll posting verdict. clara_authenticated only, VIEWER floor through clara._human_ctx, firm-scoped on clara.documents.firm_id -- another firm''s document and an id that is no document answer the SAME CLR11, so this read is no existence oracle. A document that IS this firm''s but is not a payroll summary is refused CLR10 / not_a_payroll_summary rather than answered about, because the verdict would otherwise say "This payroll summary has not been read yet." over a supplier bill. It projects clara._payroll_posting_verdict''s sentence, verdict, rung, reason and completeness and NOTHING else: rung_vector is the evaluator''s internal ladder, and the lane internals (detail, plan, filing, extraction, entry, dates) are not a person''s business on a page that is asking why a payslip did not post. STABLE, so PostgreSQL itself refuses a write inside it. The internal it wraps stays ungranted; this door is the first granted way to reach its answer, and before it the only way to see the verdict was a Needs-you queue row or the entry''s own receipt.';

reset role;

-- =====================================================================================
-- §Z — TAIL. Everything above, re-read off the LIVE catalog after applying.
-- =====================================================================================
do $c0363_tail$
declare
  v_acl text; v_n int; v_sha text;
begin
  -- 1 · THE DOOR EXISTS ONCE, AT ONE SIGNATURE, OWNED AND SHAPED THE WAY §A SAYS.
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'get_payroll_posting_state';
  if v_n <> 1 then
    raise exception '0363 tail: clara.get_payroll_posting_state resolves at % pg_proc rows, not 1', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_proc p
   where p.oid = 'clara.get_payroll_posting_state(uuid)'::regprocedure
     and p.prosecdef
     and p.provolatile = 's'                              -- STABLE: it cannot write
     and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
     and p.proconfig @> array['search_path=clara, pg_temp']
     and p.prosrc like '%#1148 [0363]%'
     and p.prosrc like '%clara._human_ctx(clara.role_rank(''viewer''))%'
     and p.prosrc like '%d.firm_id = h.firm%'
     and p.prosrc like '%CLR11%'
     and p.prosrc like '%not_a_payroll_summary%'
     and p.prosrc not like '%rung_vector%';   -- the ladder is NOT projected, read off the body
  if v_n <> 1 then
    raise exception '0363 tail: the read door is not SECURITY DEFINER + STABLE + clara_fn_owner + pinned search_path with the viewer floor, the firm wall, the payroll-summary subject and no rung ladder'
      using errcode = 'CLR10';
  end if;

  -- 2 · EXACTLY ONE ROLE REACHES IT, AND IT IS THE HUMAN LANE'S. A read minted for a document page
  --     is not a machine lane's; the model-lane twin is a successor contract for a later cut.
  select coalesce(p.proacl::text, '') into v_acl from pg_proc p
   where p.oid = 'clara.get_payroll_posting_state(uuid)'::regprocedure;
  if not has_function_privilege('clara_authenticated',
       'clara.get_payroll_posting_state(uuid)'::regprocedure, 'EXECUTE') then
    raise exception '0363 tail: the human lane cannot execute the read door (acl %)', v_acl
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n
    from unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive',
                      'clara_wake_proactive','public']) r
   where has_function_privilege(r, 'clara.get_payroll_posting_state(uuid)'::regprocedure, 'EXECUTE');
  if v_n <> 0 then
    raise exception '0363 tail: % non-human role(s) reach the read door (acl %) -- it is the document page''s, and a machine twin is a later cut''s business', v_n, v_acl
      using errcode = 'CLR10';
  end if;

  -- 3 · THE INTERNAL IS STILL UNGRANTED. The acceptance criterion in catalog form: if this stopped
  --     being true the door would be redundant AND the wall would be gone.
  select coalesce(p.proacl::text, '') into v_acl from pg_proc p
   where p.oid = 'clara._payroll_posting_verdict(uuid)'::regprocedure;
  if v_acl <> '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception '0363 tail: clara._payroll_posting_verdict gained an ACL (%) -- it is reached from clara._post_payroll_run, clara.list_review_queue, clara.answer_payroll_completeness and now this door, and from nowhere a caller can name', v_acl
      using errcode = 'CLR10';
  end if;

  -- 4 · …AND ITS BODY DID NOT MOVE. This file wraps it; it never recuts it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._payroll_posting_verdict(uuid)'::regprocedure;
  if v_sha is distinct from '4c350623e41527b717a1fc58e3ee8b772060b895b5353098f8cd21153585dac8' then
    raise exception '0363 tail: clara._payroll_posting_verdict moved while this file applied (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- 5 · THE ANSWER DOOR AND THE QUEUE ARE UNTOUCHED. The two surfaces that already reach this
  --     verdict keep the grants they had; a read beside them must not become a way in.
  if not has_function_privilege('clara_authenticated',
       'clara.answer_payroll_completeness(uuid,text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception '0363 tail: clara_authenticated lost EXECUTE on the completeness answer door'
      using errcode = 'CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
       'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure, 'EXECUTE') then
    raise exception '0363 tail: clara_authenticated lost EXECUTE on the review queue'
      using errcode = 'CLR10';
  end if;

  raise notice '0363 tail OK -- a document page can ask why a payslip did not post, the internal is still nobody''s to call, and nothing above the door may reword what it says';
end
$c0363_tail$;
