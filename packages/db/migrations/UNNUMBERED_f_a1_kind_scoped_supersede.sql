-- UNNUMBERED_f_a1_kind_scoped_supersede.sql -- Wave-F Track A, F-A1 PR-1's hard precondition
-- (docs/plan/active/f-a1-witness-pair-design.md SS3.9 / SS6.2 / D11): the 0017 authority
-- trigger's kind-blind supersede is made KIND-SCOPED. This is the FIRST piece of PR-1 --
-- the CHECK-constraint widenings, lane lists, purpose CHECKs and persist_witness_facts
-- itself are separate pieces of the same PR and are NOT in this file.
--
-- MIGRATION NUMBER claimed at MERGE (standing law, .claude/rules/db-migrations.md and
-- AGENTS.md hard constraint 10). Authored unnumbered on purpose above whatever the frontier
-- is when this lands; renumber mechanically at merge. The prestate pins the body it replaces
-- by prosrc sha256, so nothing here depends on the number, and packages/db/scripts/migrate.mjs
-- skips any filename without four leading digits -- this file will not run at all until it is
-- renamed, which is the intended state until merge.
--
-- WHY, IN ONE PARAGRAPH (full design: SS3.9). clara._tf_set_authoritative_extraction_0017()
-- compares every done extraction against the document-wide (extracted_at,id) max, with no
-- regard to engine_kind. F-A1's witness pair inserts TWO extraction rows
-- (engine_kind llm_text_facts / llm_vision_facts) in ONE transaction; both share the same
-- extracted_at (transaction now()), so the kind-blind trigger makes the pair supersede
-- ITSELF by a uuid coin flip on the (extracted_at,id) tie-break -- permanently, because
-- superseded_by is a one-way once-only transition (0007:663-676, CLR08). The design's
-- consumer census (folded into the design doc, SS2 "the walls a new lane must widen or join"
-- item 11) found the preferred kind-scoped shape breaks no production consumer and that
-- INSERT into document_extractions is provably centralized in SECURITY DEFINER writers --
-- so the fix below needs no txn-local GUC and no writer-side cooperation.
--
-- THE SEMANTIC CHANGE, STATED PLAINLY (it is a real behaviour change, not a pure bugfix):
-- under the OLD body, a document's OCR extraction landing before its invoice_facts
-- extraction gets superseded the moment the LATER-kind row lands, purely because it is
-- chronologically older -- a cross-kind side effect nobody asked the trigger to produce.
-- Under the NEW body, within-kind supersede bookkeeping is scoped to engine_kind, so a
-- kind's own current row is only ever superseded by a NEWER row of the SAME kind. The
-- document-wide authoritative_extraction_id pointer is UNCHANGED in shape (still the
-- (extracted_at,id)-max across all kinds, same comparison, same corrupt-pointer guard) --
-- so a document can now be in a state where its kind-current row for one kind is not the
-- pointer (another, newer-kind row is). The CLR31 consumer this design names
-- (clara._assert_opening_extraction_ref, live body unchanged by this file) already
-- distinguishes the two outcomes by construction: citing a SUPERSEDED row raises
-- 'extraction_not_accepted'; citing an UNSUPERSEDED row that is not the pointer raises
-- 'stale_extraction_version'. Both refusal tokens predate this file; nothing about them
-- is added or renamed here.
--
-- WHAT DOES NOT CHANGE: the trigger's name, signature, timing (AFTER INSERT FOR EACH ROW),
-- owner (clara_fn_owner), SECURITY DEFINER posture, pinned search_path, and ACL (EXECUTE to
-- clara_fn_owner only -- nothing else has ever been granted it, and this file grants
-- nothing). No table is created or altered, so no RLS section applies. workflow /
-- graphile_worker / spike are not touched.
--
-- D1 WRITE-QUIESCE (packages/db/README.md "Deploy contract"): this trigger fires on every
-- INSERT into clara.document_extractions from every existing writer
-- (persist_document_extraction, persist_invoice_facts, _persist_statement_core and the
-- extraction-recovery/reextraction settlement paths) -- it is reached by every existing
-- invoice and statement document, not merely by the not-yet-built witness lane. Per the
-- house D1 rule, a live deploy of this file takes the write-quiesce window; PR-1 mints no
-- witness work on its own (no router change, no new lane an old runtime image could reach),
-- so quiescing is about this trigger's hot-path reach, not about anything new becoming
-- live.
--
-- CELLS: packages/db/tests/f-a1-0017-kind-scoped.test.mjs (contract-blind cells marked
-- (BLIND) in that file's header) plus the existing packages/db/tests/x1-supersede.test.mjs
-- and x1-reextraction.test.mjs batteries, re-run against this body -- their result diff
-- against the pre-file baseline is recorded in the PR body, not restated here.
--
-- ADDENDUM (post-review, folded in before merge; see S0b below for the two new prestate
-- reads and the matching tail assertion): (1) the trigger itself is NOT special-cased for
-- pairs -- it does not know or care whether a row arrived alongside a sibling; determinism
-- for a same-transaction pair comes from the FUTURE witness writer stamping distinct
-- per-row extracted_at via clock_timestamp(), which the battery proves works with zero
-- trigger changes. (2) this file is proven, not assumed, to touch no
-- clara.document_extractions DATA row (S0b(a): a before/after checksum stash). (3) the
-- pre-existing SAME-KIND statement-reader-pair coin-flip (0038:1781-1798's reader1/reader2,
-- always one engine_kind by design) is COUNTED and NAMED in the prestate, never repaired --
-- it predates this file, is untouched by kind-scoping (both readers share one kind), and
-- superseded_by's one-way CLR08 transition makes an in-place fix impossible without an
-- unaudited data mutation. (4) the battery additionally proves the single multi-row INSERT
-- shape (AFTER-FOR-EACH-ROW fires at end of statement, so a sibling of a DIFFERENT kind is
-- already visible when each row's trigger fires) alongside the two-separate-statements
-- shape (the 0038:1781/1790 writer precedent) -- both leave a two-kind pair unsuperseded
-- under this body.
set local statement_timeout = '2min';
-- PRECAUTIONARY, not load-bearing: this file replaces one small trigger function and reads
-- the catalog: nothing here should run anywhere near that long on any real database.

-- =====================================================================================
-- S0 -- PRESTATE. The body being replaced is pinned exactly (the 0084/0085 precedent):
-- prosrc is the function body alone, no signature and no formatting drift, so a checksum
-- is honest here. Every other claim this file depends on is read POSITIVELY off the live
-- catalog before anything changes, never assumed.
-- =====================================================================================
do $pre$
declare
  v_src text; v_sha text; v_trig record; v_conf text[];
begin
  -- (0.1) The migration this file's trigger belongs to must already be applied.
  if not exists (select 1 from clara.schema_migrations where version ~ '^0017_') then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.1: 0017 is not applied -- clara._tf_set_authoritative_extraction_0017 does not exist yet'
      using errcode = 'CLR10';
  end if;

  -- (0.2) THE BODY BEING REPLACED, PINNED EXACTLY.
  select prosrc into v_src from pg_proc
    where oid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure;
  if v_src is null then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.2: clara._tf_set_authoritative_extraction_0017() is absent'
      using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha <> 'e603399e0f3e92d247609fb4a5d4e1c69bb58dc6c4de9b8170377229928b67fe' then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.2: _tf_set_authoritative_extraction_0017 is not the reviewed 0017 body (prosrc sha256 %) -- refusing to replace an unrecognised body',
      v_sha using errcode = 'CLR10';
  end if;

  -- (0.3) POSITIVE reads of what is being replaced: the corrupt-pointer guard, the
  -- document-row lock, and the tie-break comparison this file's new body reuses verbatim
  -- for the pointer half. An absent token here means the design's "same comparison as
  -- live" claim (SS3.9) would be re-deriving against a body nobody reviewed.
  if position('opening_extraction_pointer_corrupt' in v_src) = 0
     or position('for update' in v_src) = 0
     or position('(new.extracted_at,new.id)>(v_current_at,v_current)' in v_src) = 0
     or position('accepted extraction has no owning document' in v_src) = 0 then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.3: the live trigger body is missing a token this file''s replacement depends on -- re-derive against the live catalog before proceeding'
      using errcode = 'CLR10';
  end if;
  -- (0.4) PARTIAL-BIRTH GUARD (the 0085 idiom): the live body must NOT already carry any
  -- kind-scoping -- this file refuses to double-apply itself under a different number.
  if position('v_kind_current' in v_src) <> 0 or position('engine_kind=new.engine_kind' in v_src) <> 0 then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.4: the live trigger body already carries kind-scoping -- this file must not apply twice'
      using errcode = 'CLR10';
  end if;

  -- (0.5) THE TRIGGER BINDING, read positively: AFTER INSERT, FOR EACH ROW, enabled,
  -- bound to exactly this function, on exactly this table.
  select tg.tgname, tg.tgenabled, tg.tgtype into v_trig
    from pg_trigger tg
    where tg.tgrelid = 'clara.document_extractions'::regclass
      and tg.tgfoid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure
      and not tg.tgisinternal;
  if v_trig.tgname is distinct from 't_document_extractions_authority_0017'
     or v_trig.tgenabled is distinct from 'O'
     -- tgtype 5 = TRIGGER_TYPE_ROW | TRIGGER_TYPE_AFTER | TRIGGER_TYPE_INSERT (bits 0,1,4).
     or v_trig.tgtype is distinct from 5 then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.5: t_document_extractions_authority_0017 is not bound AFTER INSERT FOR EACH ROW ENABLED on clara.document_extractions as expected (name %, enabled %, type %)',
      v_trig.tgname, v_trig.tgenabled, v_trig.tgtype using errcode = 'CLR10';
  end if;

  -- (0.6) OWNERSHIP / SECURITY / SEARCH_PATH the replacement must preserve exactly.
  select p.proconfig into v_conf from pg_proc p
    join pg_roles r on r.oid = p.proowner
    where p.oid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure
      and r.rolname = 'clara_fn_owner' and p.prosecdef;
  if v_conf is null or not ('search_path=clara, pg_temp' = any(v_conf)) then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.6: the live trigger is not owned by clara_fn_owner / SECURITY DEFINER / search_path=clara,pg_temp as expected'
      using errcode = 'CLR10';
  end if;

  -- (0.7) THE CLR31 CONSUMER THE DESIGN NAMES (SS3.9) already carries both refusal
  -- tokens this file's post-state relies on to distinguish "superseded" from
  -- "unsuperseded but not the pointer" -- read positively, not assumed. This file does
  -- not touch this function; the read is here only to refuse if the premise is false.
  if not exists (
    select 1 from pg_proc
    where oid = 'clara._assert_opening_extraction_ref(uuid,uuid,jsonb)'::regprocedure
      and position('extraction_not_accepted' in prosrc) <> 0
      and position('stale_extraction_version' in prosrc) <> 0
  ) then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede S0.7: clara._assert_opening_extraction_ref no longer carries both extraction_not_accepted and stale_extraction_version -- the design''s "the CLR31 consumer distinguishes them" premise no longer holds'
      using errcode = 'CLR10';
  end if;
end
$pre$;

-- =====================================================================================
-- S0b -- ADDENDUM (post-review, folded in before merge). Two DISTINCT obligations, both
-- READ-ONLY and both informational: (a) this file is a pure function replacement and
-- touches no clara.document_extractions DATA row -- proven, not assumed, by stashing a
-- before/after checksum across S0b and the tail; (b) the pre-existing SAME-KIND
-- statement-reader-pair coin-flip is DOCUMENTED, never repaired. `_persist_statement_core`
-- (0038:1781-1798) inserts reader1/reader2 as TWO rows sharing (document_id, engine_kind,
-- version_n) and differing only by engine_id, via TWO SEPARATE INSERT statements in one
-- transaction -- both take the SAME transaction-scoped extracted_at. That pair is, and
-- always was, the SAME engine_kind by design (SS2: "persists the pair as TWO rows under
-- ONE kind"), so kind-scoping this file ships does NOT touch it: one half of every such
-- pair still wins the (extracted_at,id) tie-break over the other, under BOTH the pre-file
-- and the post-file trigger body alike. That is a live, pre-existing defect in its own
-- right (a coin flip deciding which reader "won"), OUT OF SCOPE for this file (the 0017
-- trigger fix is narrowly the cross-kind self-supersede F-A1 introduces), and IRREPARABLE
-- in place: superseded_by is a one-way, once-only transition (0007:663-676, CLR08) -- an
-- UPDATE clearing it here would itself be an undocumented, unaudited data change, which is
-- worse than leaving a known, named condition on the record. So: counted and RAISE
-- NOTICE'd below, never touched.
-- =====================================================================================
do $pre_addendum$
declare
  v_n bigint; v_chk numeric;
  v_pair_docs int; v_pair_rows int;
begin
  -- (a) ZERO-DATA-ROW-TOUCH STASH. An order-independent, single-pass checksum over every
  -- (id, superseded_by) pair in clara.document_extractions today, plus the row count.
  -- Re-derived in the tail from the SAME live table and compared for exact equality --
  -- proving this file changed no data row, rather than asserting it from the fact that no
  -- DML statement appears above (a fact a future editor could silently invalidate).
  select count(*)::bigint,
         coalesce(sum(('x' || substr(md5(id::text || ':' || coalesce(superseded_by::text, 'NULL')), 1, 16))::bit(64)::bigint), 0)
    into v_n, v_chk
    from clara.document_extractions;
  create temporary table _fa1_pre_stash(k text primary key, v numeric) on commit drop;
  insert into _fa1_pre_stash values ('row_count', v_n), ('checksum', v_chk);
  raise notice 'UNNUMBERED_f_a1_kind_scoped_supersede S0b(a): zero-data-touch stash captured -- % row(s), checksum % -- re-verified byte-for-byte in the tail census',
    v_n, v_chk;

  -- (b) THE PRE-EXISTING SAME-KIND STATEMENT-PAIR COIN-FLIP, COUNTED AND NAMED, NEVER
  -- REPAIRED. A "pair" here is any two document_extractions rows sharing
  -- (document_id, firm_id, engine_kind, version_n) with DIFFERENT engine_id -- exactly the
  -- reader1/reader2 shape -- where one supersedes the other. Read-only; this query writes
  -- nothing and this file's S1 does not touch it.
  select count(distinct a.document_id), count(*)
    into v_pair_docs, v_pair_rows
    from clara.document_extractions a
    join clara.document_extractions b
      on a.firm_id = b.firm_id and a.document_id = b.document_id
     and a.engine_kind = b.engine_kind and a.version_n = b.version_n
     and a.engine_id <> b.engine_id and a.id < b.id
    where a.superseded_by = b.id or b.superseded_by = a.id;
  raise notice 'UNNUMBERED_f_a1_kind_scoped_supersede S0b(b): PRE-EXISTING same-kind statement-reader-pair coin-flip -- % document(s), % pair(s) where one reader row supersedes its sibling purely on the (extracted_at,id) tie-break. This is a live production condition that PREDATES this file, is NOT introduced or worsened by it (reader1/reader2 stay one engine_kind by design, so within-kind scoping applies to them exactly as document-wide scoping always did), and is NOT repaired here: superseded_by is a one-way, once-only transition (0007:663-676, CLR08), so an in-place fix would itself be an unaudited data mutation. Documented for the record; a remedy (if any) is a separate, deliberate change with its own review.',
    v_pair_docs, v_pair_rows;
end
$pre_addendum$;

set role clara_fn_owner;
-- =====================================================================================
-- S1 -- THE BODY. Same signature, same trigger binding, same owner/security/search_path.
-- The document-row lock, the corrupt-pointer guard and the pointer's own tie-break
-- comparison are carried over VERBATIM (SS3.9/SS6.2: "same comparison as live"). What
-- changes: a new within-kind lookup that decides supersede bookkeeping, and the pointer
-- block no longer writes superseded_by at all -- that responsibility moves entirely to
-- the within-kind block below it.
-- =====================================================================================
create or replace function clara._tf_set_authoritative_extraction_0017() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  v_current uuid; v_current_at timestamptz;
  v_kind_current uuid; v_kind_current_at timestamptz;
begin
  if new.status<>'done' then return new; end if;
  select d.authoritative_extraction_id into v_current
    from clara.documents d
    where d.id=new.document_id and d.firm_id=new.firm_id for update;
  if not found then
    raise exception 'accepted extraction has no owning document'
      using errcode='CLR11';
  end if;
  if v_current is not null then
    select de.extracted_at into v_current_at
      from clara.document_extractions de
      where de.id=v_current and de.firm_id=new.firm_id
        and de.document_id=new.document_id and de.status='done'
        and de.superseded_by is null;
    if not found then
      raise exception 'document authoritative extraction pointer is corrupt'
        using errcode='CLR31',
          detail='{"reason":"opening_extraction_pointer_corrupt"}';
    end if;
  end if;
  -- [F-A1 PR-1, SS3.9] WITHIN-KIND supersede bookkeeping, decoupled from the pointer
  -- below. A one-transaction multi-kind witness pair shares one extracted_at (the
  -- transaction's now()); a kind-blind comparison would let the pair supersede itself by
  -- a uuid coin flip on the tie-break. Scoping BOTH the current-row lookup and BOTH write
  -- branches to new.engine_kind closes that -- a sibling of a DIFFERENT kind is invisible
  -- to this block in either direction, so it can never touch the other half of a pair.
  select de.id, de.extracted_at into v_kind_current, v_kind_current_at
    from clara.document_extractions de
    where de.firm_id=new.firm_id and de.document_id=new.document_id
      and de.engine_kind=new.engine_kind and de.id<>new.id
      and de.status='done' and de.superseded_by is null
    order by de.extracted_at desc, de.id desc limit 1;
  if v_kind_current is null
     or (new.extracted_at,new.id)>(v_kind_current_at,v_kind_current) then
    update clara.document_extractions de set superseded_by=new.id
      where de.firm_id=new.firm_id and de.document_id=new.document_id
        and de.engine_kind=new.engine_kind
        and de.id<>new.id and de.status='done' and de.superseded_by is null;
  else
    update clara.document_extractions de set superseded_by=v_kind_current
      where de.id=new.id and de.firm_id=new.firm_id
        and de.document_id=new.document_id and de.engine_kind=new.engine_kind
        and de.superseded_by is null;
  end if;
  -- [F-A1 PR-1, SS3.9] The pointer stays DOCUMENT-WIDE and byte-compatible: still the
  -- (extracted_at,id)-max across ALL kinds, same comparison as the pre-existing body.
  -- This block no longer writes superseded_by at all -- every such transition now
  -- happens in the within-kind block above. A row can therefore be kind-current yet not
  -- the pointer (the intended post-state, SS3.9); the corrupt-pointer guard above still
  -- holds because a pointer row is only ever superseded in the SAME trigger firing that
  -- repoints its successor here: superseding a pointer row requires a same-kind new row
  -- that beats it, which -- because the pointer was already the document-wide max --
  -- forces new to be the document-wide max too, so the repoint below always fires
  -- alongside it, atomically, in this one invocation.
  if v_current is null
     or (new.extracted_at,new.id)>(v_current_at,v_current) then
    update clara.documents d set authoritative_extraction_id=new.id
      where d.id=new.document_id and d.firm_id=new.firm_id;
  end if;
  return new;
end
$$;
reset role;

-- =====================================================================================
-- S2 -- TAIL CENSUS. Re-reads the live catalog; the census is the evidence a reviewer
-- reads, not an "OK" -- every claim above is re-derived from the post-state, never handed
-- over from S0.
-- =====================================================================================
do $tail$
declare
  v_src text; v_sha text; v_trig record; v_owner text; v_secdef boolean; v_conf text[];
  v_acl text; v_n bigint; v_chk numeric; v_pre_n numeric; v_pre_chk numeric;
begin
  -- ADDENDUM tail half of S0b(a): re-derive the SAME checksum from the SAME table, in this
  -- same transaction, and require EXACT equality with the stash S0b(a) captured before S1
  -- ran. This is the positive proof that replacing the function touched no data row --
  -- not an assumption from "no DML statement appears in S1" (a fact a future edit to this
  -- file could silently invalidate without anyone re-reading S1 by eye).
  select v into v_pre_n from _fa1_pre_stash where k = 'row_count';
  select v into v_pre_chk from _fa1_pre_stash where k = 'checksum';
  select count(*)::bigint,
         coalesce(sum(('x' || substr(md5(id::text || ':' || coalesce(superseded_by::text, 'NULL')), 1, 16))::bit(64)::bigint), 0)
    into v_n, v_chk
    from clara.document_extractions;
  if v_pre_n is null or v_pre_chk is null then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: the S0b(a) zero-data-touch stash is missing -- S0b did not run, or ran in a different transaction'
      using errcode = 'CLR10';
  end if;
  if v_n is distinct from v_pre_n or v_chk is distinct from v_pre_chk then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: clara.document_extractions data CHANGED during this migration (row_count % -> %, checksum % -> %) -- this file must touch the trigger FUNCTION only',
      v_pre_n, v_n, v_pre_chk, v_chk using errcode = 'CLR10';
  end if;
  raise notice 'UNNUMBERED_f_a1_kind_scoped_supersede tail: zero-data-touch CONFIRMED -- % row(s), checksum % identical before and after', v_n, v_chk;

  select prosrc into v_src from pg_proc
    where oid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure;
  if v_src is null then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: the trigger function is absent after replacement'
      using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha = 'e603399e0f3e92d247609fb4a5d4e1c69bb58dc6c4de9b8170377229928b67fe' then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: the live body is still the pre-file 0017 body -- the replacement did not take'
      using errcode = 'CLR10';
  end if;

  -- The kind-scoping markers are present, on ALL THREE kind-scoped sites (the current-row
  -- SELECT, the winner-branch sweep UPDATE, and the loser-branch single-row UPDATE -- the
  -- addendum's "BOTH [write] branches carry engine_kind=new.engine_kind", plus the SELECT
  -- that feeds them both), and the pointer block's own superseded_by write is GONE (the
  -- responsibility moved above it). Counted with regexp_matches rather than a length-diff
  -- trick, so the count itself is legible to a reviewer re-deriving it by eye.
  if position('v_kind_current' in v_src) = 0
     or (select count(*) from regexp_matches(v_src, 'de\.engine_kind\s*=\s*new\.engine_kind', 'g')) <> 3
     or position('opening_extraction_pointer_corrupt' in v_src) = 0
     or position('for update' in v_src) = 0
     or position('(new.extracted_at,new.id)>(v_current_at,v_current)' in v_src) = 0
     or position('(new.extracted_at,new.id)>(v_kind_current_at,v_kind_current)' in v_src) = 0 then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: the replaced body is missing an expected kind-scoping or carried-over token, or does not carry engine_kind=new.engine_kind at exactly the three expected sites (got %)',
      (select count(*) from regexp_matches(v_src, 'de\.engine_kind\s*=\s*new\.engine_kind', 'g')) using errcode = 'CLR10';
  end if;
  -- The pointer block must carry NO superseded_by write of its own any more -- every
  -- assignment to superseded_by in the body must sit in the within-kind block, which is
  -- textually ABOVE the pointer's own "update clara.documents" line.
  if position('set superseded_by=' in substring(v_src from position('update clara.documents' in v_src))) <> 0 then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: a superseded_by write survives at or after the pointer block -- the within-kind/pointer split did not land as designed'
      using errcode = 'CLR10';
  end if;

  select tg.tgname, tg.tgenabled, tg.tgtype into v_trig
    from pg_trigger tg
    where tg.tgrelid = 'clara.document_extractions'::regclass
      and tg.tgfoid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure
      and not tg.tgisinternal;
  if v_trig.tgname is distinct from 't_document_extractions_authority_0017'
     or v_trig.tgenabled is distinct from 'O' or v_trig.tgtype is distinct from 5 then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: the trigger binding moved (name %, enabled %, type %)',
      v_trig.tgname, v_trig.tgenabled, v_trig.tgtype using errcode = 'CLR10';
  end if;

  select r.rolname, p.prosecdef, p.proconfig, p.proacl::text into v_owner, v_secdef, v_conf, v_acl
    from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = 'clara._tf_set_authoritative_extraction_0017()'::regprocedure;
  if v_owner is distinct from 'clara_fn_owner' or v_secdef is distinct from true
     or v_conf is null or not ('search_path=clara, pg_temp' = any(v_conf))
     or v_acl is distinct from '{clara_fn_owner=X/clara_fn_owner}' then
    raise exception 'UNNUMBERED_f_a1_kind_scoped_supersede tail: owner/security/search_path/ACL drifted (owner %, secdef %, config %, acl %)',
      v_owner, v_secdef, v_conf, v_acl using errcode = 'CLR10';
  end if;

  raise notice 'UNNUMBERED_f_a1_kind_scoped_supersede tail: OK -- clara._tf_set_authoritative_extraction_0017 replaced (old sha e603399e..., new sha %), kind-scoped within-kind bookkeeping installed at all three engine_kind=new.engine_kind sites, the document-wide pointer comparison and corrupt-pointer guard carried verbatim, superseded_by writes now live ONLY in the within-kind block, trigger binding/owner/security/search_path/ACL unmoved, zero document_extractions data rows touched (checksum-proven), and the pre-existing same-kind statement-pair coin-flip is counted and left untouched per S0b(b). No table created or altered; workflow/graphile_worker/spike untouched.',
    v_sha;
end
$tail$;
