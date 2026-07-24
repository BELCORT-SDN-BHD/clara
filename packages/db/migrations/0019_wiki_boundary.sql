-- 0019_wiki_boundary — the wiki AUTHORITY BOUNDARY (WB-R21 · WB-R24(ii)).
--
-- Authority: docs/plan/wave-b-migration-0019-design.md (v1.0, RATIFIED). Scope is
-- fixed by rulings WB-R21 + WB-R24(ii) and is neither widened nor narrowed here.
--
-- What this migration delivers, section by section against the contract:
--   §1 the R2-F2 EXISTS-veto is REMOVED from both filing-transition bodies, with the
--      NON-WIKI client-row SERIALIZER preserved at exactly the position the veto call
--      held (so the publication/retirement lock order is byte-for-byte 0017's), and
--      clara._assert_filing_wiki_unreferenced DROPPED;
--   §2 wiki_page_citations + wiki_page_refs gain the additive stale marker pair
--      (stale_at / stale_reason + the paired-presence CHECK), plus the index coverage
--      the writer / lint / read predicates need (both tables shipped PK-only);
--   §3a clara.retire_wiki_page takes the CLIENT row before the PAGE row (ratchet R2
--      finding B1). Page retirement is NOT a wait-for-graph leaf — after its page lock it
--      requests clara.firm_event_seq through _append_event (0005:482-484) — so once §3
--      added a client -> page actor, a composing transaction could close a real 40P01
--      cycle. All four wiki actors now share ONE client -> page order, asserted over
--      EVERY clara function by the §9 tail rather than over three named ones;
--   §3 clara.mark_wiki_citations_stale — the runtime-only stale WRITER. NO domain
--      event is appended and NO event type is registered (amendment 4: a client-scoped
--      wiki event would reach assert_books_current (0007:2665-2681) and the correction
--      books-version check (0009:2449-2450), handing a projection-derived event an
--      indirect veto over authority — exactly the inversion WB-R21 abolishes);
--   §1b a TYPED refusal of REPEATABLE READ on the publication CORE (ratchet R1
--      finding 2): under a pinned snapshot the preserved client-row lock does NOT order
--      publication against retirement, so the unlocked active-filing floor could
--      validate an already-retired filing and commit a permanently UNMARKED citation.
--      READ COMMITTED and SERIALIZABLE are both safe and both keep working;
--   §5 an additive, NULL-safe MONOTONIC projected_from_seq guard on the supersede
--      branch of _publish_wiki_page_version_core, as a TYPED TERMINAL refusal
--      CLR32/{"reason":"stale_projected_from_seq"} (a silent converge is rejected: the
--      wrapper would still _audit and append wiki.page_published for a publication that
--      never happened, and both mutators discard the receipt);
--   §6 the lint finding class 'stale_citation' on run_client_lint — ONE finding per
--      (page_id, document_id), the UNION of the MARKED scan and the INVERTED scan
--      (unmarked live sources whose document has no active filing to that client). The
--      inverted half is the ONLY surface that sees a writer failure that dead-lettered
--      AND advanced the checkpoint (wiki-projection.mjs:422-426);
--   §7 read-surface MARKING (inform-never-decide): has_stale_sources on get_wiki_page /
--      list_wiki_pages / the pack's wiki page object, and stale_at/stale_reason added BY
--      NAME to the pack's enumerated citation object. Nothing is filtered, reordered or
--      gated — candidates / priority / row_number / the byte-cap admission are untouched;
--   §9 the in-transaction fail-closed tail, including the CLEAN-END-STATE closed-set
--      scan that SUPERSEDES 0017's exclusion loop (0017:5945-5967).
--
-- Deliberately NOT here: the retirement EVENT (document.filing_retired already exists,
-- 0007:2685, emitted by both authority fns), any new event type, consent/privacy (0020,
-- WB-R23), the commit-lane review attestation (WB-R22), and ANY widening of the
-- clara_runtime table read surface — notably clara.document_filings, which clara_runtime
-- still cannot read (0007:2740-2741). The tail asserts that negatively.
--
-- The 0017 apply-time veto-existence pins (0017:5595-5605, 5606-5618) ran once at
-- 0017-apply and are NOT re-run here; 0019's tail is their exact inverse.
--
-- HONEST CHARACTERISATION OF THE §9 CLOSED-SET SCAN (amendment 7). It is a closed
-- STATIC defence, not a proof. Known limits:
--   * FALSE-PASS. Dynamic SQL can construct a relation name without a word-bounded
--     literal. The original defect was itself a wrapper shape — the authority bodies
--     named only _assert_filing_wiki_unreferenced while the helper held the reads
--     (0017:1824, 1860) — which is why the scan also follows CALL EDGES; but the call-
--     edge half is still a source-token scan, because plpgsql bodies create NO pg_depend
--     edges for their callees, so there is no catalog graph to walk. The paired repo lint
--     (scripts/check-wiki-dynamic-sql.mjs) is the half the DB tail structurally cannot
--     provide.
--   * FALSE-FAIL. A raw prosrc regex also sees comments and string literals
--     (0017:5961-5963), so a non-wiki function that merely MENTIONS wiki_pages in an
--     error message or comment trips it. The raise names the offending signature.
--
-- Structure mirrors 0018: every DDL + function body runs under `set role clara_fn_owner`
-- (the 0014:46 idiom — the definer must own the functions so SECURITY DEFINER keeps its
-- authority); grants + the tail run after `reset role`. Large existing bodies are patched
-- via pg_get_functiondef + string surgery (the 0017 CoR-prestate idiom) so an anchor
-- drift ABORTS the apply rather than silently reproducing hundreds of lines. Every
-- functional tail probe runs inside a forced-rollback subtransaction — a probe must never
-- commit fixture rows into production. One transaction; any failure aborts.
--
-- No workflow-body change; ZERO freeze-manifest implication (the consumer loop is a
-- startWorld runtime plugin, packages/runtime/plugins/startWorld.ts:218, not a frozen WDK
-- workflow). Validate on a throwaway Postgres only.

set role clara_fn_owner;

-- =====================================================================
-- §2a. THE STALE MARKER — an additive nullable pair on BOTH reference
-- relations (the 0018 bound_scope pattern, 0018:36-44). Every existing row is
-- unmarked (stale_at is null) and every existing read is byte-identical until a
-- writer marks a row. The single-valued stale_reason enum is the extension seam.
--
-- The two relations have DIFFERENT lifecycles and this migration does not conflate
-- them: CITATIONS are versioned and immutable (they hang off version_id,
-- 0017:2128-2131 — superseded versions keep theirs forever), while REFS are
-- PAGE-LEVEL MUTABLE rows that _publish_wiki_page_version_core DELETEs and
-- re-inserts on every republish (0017:2134). A ref's stale mark therefore does not
-- survive a republish — which is correct: a republish re-validates every document
-- ref against the CLR02 active-filing floor (0017:2157-2163), so a re-created ref
-- is provably live.
-- =====================================================================
alter table clara.wiki_page_citations
  add column stale_at timestamptz,
  add column stale_reason text check (stale_reason in ('source_filing_retired')),
  add constraint ck_wiki_citations_stale_pair
    check ((stale_at is null) = (stale_reason is null));

alter table clara.wiki_page_refs
  add column stale_at timestamptz,
  add column stale_reason text check (stale_reason in ('source_filing_retired')),
  add constraint ck_wiki_refs_stale_pair
    check ((stale_at is null) = (stale_reason is null));

-- =====================================================================
-- §2b. INDEX COVERAGE. 0017 created NO index on either relation beyond the PK, and
-- the composite FKs do not index the referencing side, so all three new predicate
-- shapes are new work rather than tuning. The §9 tail carries EXPLAIN-backed proof.
--   (1) writer + catch-up scan  -> *_doc_live
--   (2) lint stale-marked lookup -> *_stale ; page-join key -> *_version / *_page
--   (3) the has_stale_sources EXISTS in get_wiki_page / list_wiki_pages / the pack
--       reuses (2).
-- The INVERTED lint side needs nothing new: uq_document_filing_active
-- (clara.document_filings(document_id, client_id) where retired_at is null,
-- 0007:93-94) already serves the NOT EXISTS probe.
-- =====================================================================
create index ix_wiki_citations_doc_live
  on clara.wiki_page_citations (document_id, version_id) where stale_at is null;
create index ix_wiki_citations_stale
  on clara.wiki_page_citations (version_id, document_id) where stale_at is not null;
create index ix_wiki_citations_version
  on clara.wiki_page_citations (version_id);
create index ix_wiki_refs_doc_live
  on clara.wiki_page_refs (document_id, page_id) where ref_kind = 'document';
create index ix_wiki_refs_stale
  on clara.wiki_page_refs (page_id, document_id) where stale_at is not null;
create index ix_wiki_refs_page
  on clara.wiki_page_refs (page_id);

-- =====================================================================
-- §2c/§6a. The two closed CHECK sets this migration widens, by exactly one value
-- each: wiki_log.action gains 'mark_stale' (0017:972-973) and
-- lint_findings.finding_kind gains 'stale_citation' (0017:1323-1325). The existing
-- constraints are discovered by DEFINITION, never by a guessed auto-generated name;
-- a miss ABORTS.
-- =====================================================================
do $ck$
declare v_name text;
begin
  select conname into v_name from pg_constraint
    where conrelid = 'clara.wiki_log'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
      and pg_get_constraintdef(oid) ilike '%''lint_pass''%';
  if v_name is null then
    raise exception '0019: the wiki_log.action CHECK was not found' using errcode = 'CLR10';
  end if;
  execute format('alter table clara.wiki_log drop constraint %I', v_name);
  execute 'alter table clara.wiki_log add constraint ck_wiki_log_action check ('
    || 'action in (''ingest'',''publish'',''supersede'',''retire'',''lint_pass'','
    || '''hold'',''release'',''mark_stale''))';

  select conname into v_name from pg_constraint
    where conrelid = 'clara.lint_findings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%finding_kind%'
      and pg_get_constraintdef(oid) ilike '%''orphan_page''%';
  if v_name is null then
    raise exception '0019: the lint_findings.finding_kind CHECK was not found'
      using errcode = 'CLR10';
  end if;
  execute format('alter table clara.lint_findings drop constraint %I', v_name);
  execute 'alter table clara.lint_findings add constraint ck_lint_findings_kind check ('
    || 'finding_kind in (''contradiction'',''stale_claim'',''orphan_page'',''cap_pages'','
    || '''cap_page_size'',''wiki_synthesis_held'',''opening_tb_tie_broken'','
    || '''opening_doc_unfiled'',''stale_citation''))';
end
$ck$;

-- =====================================================================
-- §1. THE VETO REMOVAL — the symmetric inverse of the 0017 insertion
-- (0017:1850-1897), MINUS the veto, PLUS the lock.
--
-- Each patched body retains, at EXACTLY the position the `perform` call occupied, a
-- plain non-wiki client-row lock with the same shape and the same not-found refusal
-- the helper had (CLR11). Keeping the lock THERE preserves the as-built acquisition
-- order exactly:
--   publication: clients FOR UPDATE (0017:2049-2050) -> wiki_pages FOR UPDATE (2054-2056);
--   retirement:  document_filings FOR UPDATE (0007:1445) -> CLR17 checks (0007:1447-1448)
--                -> clients FOR UPDATE -> the retirement UPDATE (0007:1457-1458);
--   correction:  filing_corrections FOR UPDATE (0009:2440) -> document_filings FOR UPDATE
--                (0009:2452-2453) -> CLR19 source-filing check (0009:2456) -> clients FOR
--                UPDATE -> the entry locks (0009:2457-2458).
-- Publication NEVER locks document_filings — its active-filing floor is an unlocked
-- read (0017:2115-2121, 2157-2163) — so the two orders share no cycle. This is the
-- identical lock graph 0017 shipped; 0019 changes nothing about it.
--
-- The alias is `cl`, NOT `c`: both bodies declare a plpgsql record variable named
-- `c`, and a `c` range-table alias would be an ambiguous column reference under the
-- default plpgsql.variable_conflict = error.
--
-- What changes semantically: publication and retirement still SERIALIZE on the
-- client row; what disappears is the VETO. Once serialized, retirement proceeds
-- unconditionally in the authority domain and the wiki converges by stale-marking.
--
-- Drift-guard per body (apply ABORTS otherwise): the anchor matched EXACTLY ONCE;
-- the replace changed the body; the normalized result no longer contains
-- _assert_filing_wiki_unreferenced; it DOES contain the client-row FOR UPDATE token
-- and its CLR11 raise; and the COMPLETE acquisition sequence above is asserted as a
-- chain of positional inequalities.
--
-- WHY THE FULL CHAIN AND NOT JUST "BEFORE THE UPDATE" (ratchet R1 finding 5). A
-- "client lock precedes the retirement UPDATE" assertion is satisfied by MANY orders,
-- including the one that deadlocks: if a future body change hoists the client lock ABOVE
-- the filing lock, correction/retirement would take client -> filing while page
-- publication keeps client -> pages and a concurrent retirement takes filing -> client —
-- and PostgreSQL aborts one of the pair with a deadlock. Every token the old guard
-- asserted would still be present. So the guards below pin each PAIR of adjacent steps:
--   retire_document_filing : filing FOR UPDATE < CLR17 already-retired < CLR17
--     stale-revision < client FOR UPDATE < the journal-entry live blocker < the
--     retirement UPDATE;
--   approve_wrong_client_correction : filing_corrections FOR UPDATE <
--     document_filings FOR UPDATE < the CLR19 source-filing guard < client FOR UPDATE <
--     the entry locks (`for update of je`) < the retirement UPDATE.
-- The same chain is mirrored in the live-catalog battery (wb-0019-tail.test.mjs), so a
-- later migration cannot reorder a body and still pass CI.
-- =====================================================================
do $cor1$
declare
  v_def text; v_next text; v_norm text; v_anchor text; v_sig text;
  v_chain text[]; v_tok text; v_at int; v_prev int;
begin
  ---- retire_document_filing -------------------------------------------------
  v_sig := 'retire_document_filing';
  select pg_get_functiondef(
    'clara.retire_document_filing(uuid,text,uuid,text)'::regprocedure) into v_def;
  v_anchor :=
$old$  -- [R2-F2] Active wiki provenance blocks retirement under the client lock.
  perform clara._assert_filing_wiki_unreferenced(
    f.firm_id,f.client_id,f.document_id);$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: retire_document_filing veto anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$  -- [WB-R21/0019 §1] The wiki VETO is gone. The non-wiki client-row SERIALIZER
  -- stays, at exactly the position the veto call held, so filing retirement and wiki
  -- publication still serialize on the same client row (0017:2049-2053).
  perform 1 from clara.clients cl
    where cl.id=f.client_id and cl.firm_id=f.firm_id for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_def
     or position('_assert_filing_wiki_unreferenced' in v_norm) > 0
     or position('raiseexception''filingclientnotinthesuppliedfirm''usingerrcode=''clr11'''
       in v_norm) = 0 then
    raise exception '0019: retire_document_filing veto-removal drift' using errcode = 'CLR10';
  end if;
  -- The COMPLETE acquisition chain, pair by pair (see the section header).
  v_chain := array[
    'select*intoffromclara.document_filingswhereid=p_filing_idforupdate',
    'raiseexception''filingisalreadyretired''usingerrcode=''clr17''',
    'raiseexception''stalefilingrevision''usingerrcode=''clr17''',
    'perform1fromclara.clientsclwherecl.id=f.client_idandcl.firm_id=f.firm_idforupdate',
    'fromclara.journal_entriesjewhereje.filing_id=f.id',
    'updateclara.document_filingssetretired_at'
  ];
  v_prev := 0;
  foreach v_tok in array v_chain loop
    v_at := position(v_tok in v_norm);
    if v_at = 0 then
      raise exception '0019: % lost the acquisition-chain step "%"', v_sig, v_tok
        using errcode = 'CLR10';
    end if;
    if v_at <= v_prev then
      raise exception '0019: % acquisition-order drift — "%" no longer follows its predecessor',
        v_sig, v_tok using errcode = 'CLR10';
    end if;
    v_prev := v_at;
  end loop;
  execute v_next;

  ---- approve_wrong_client_correction ----------------------------------------
  v_sig := 'approve_wrong_client_correction';
  select pg_get_functiondef(
    'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure)
    into v_def;
  v_anchor :=
$old$  -- [R2-F2] A correction move retires the source filing, so the same active
  -- wiki provenance blocker and client-row lock apply.
  perform clara._assert_filing_wiki_unreferenced(
    c.firm,x.from_client,x.document_id);$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: approve_wrong_client_correction veto anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$  -- [WB-R21/0019 §1] The wiki VETO is gone. A correction move still retires the
  -- SOURCE filing, so the SOURCE client's row lock — the serializer against wiki
  -- publication — stays, at exactly the position the veto call held.
  perform 1 from clara.clients cl
    where cl.id=x.from_client and cl.firm_id=c.firm for update;
  if not found then
    raise exception 'filing client not in the supplied firm' using errcode='CLR11';
  end if;$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_def
     or position('_assert_filing_wiki_unreferenced' in v_norm) > 0
     or position('raiseexception''filingclientnotinthesuppliedfirm''usingerrcode=''clr11'''
       in v_norm) = 0 then
    raise exception '0019: approve_wrong_client_correction veto-removal drift'
      using errcode = 'CLR10';
  end if;
  v_chain := array[
    'select*intoxfromclara.filing_correctionswhereid=p_correctionforupdate',
    'perform1fromclara.document_filingsfwheref.document_id=x.document_idandf.firm_id=c.firmorderbyf.idforupdate',
    'raiseexception''sourcefilingisnolongeractive''usingerrcode=''clr19''',
    'perform1fromclara.clientsclwherecl.id=x.from_clientandcl.firm_id=c.firmforupdate',
    'forupdateofje',
    'updateclara.document_filingssetretired_at'
  ];
  v_prev := 0;
  foreach v_tok in array v_chain loop
    v_at := position(v_tok in v_norm);
    if v_at = 0 then
      raise exception '0019: % lost the acquisition-chain step "%"', v_sig, v_tok
        using errcode = 'CLR10';
    end if;
    if v_at <= v_prev then
      raise exception '0019: % acquisition-order drift — "%" no longer follows its predecessor',
        v_sig, v_tok using errcode = 'CLR10';
    end if;
    v_prev := v_at;
  end loop;
  execute v_next;
end
$cor1$;

-- The helper was the ONLY reader of wiki tables among authority fns and the ONLY
-- producer of the 'active_wiki_document_reference' reason anywhere. It goes.
drop function clara._assert_filing_wiki_unreferenced(uuid, uuid, uuid);

-- =====================================================================
-- THE PUBLICATION-CORE PATCHES. Two independent guards land in ONE CoR block
-- because both rewrite clara._publish_wiki_page_version_core, and a second
-- pg_get_functiondef round-trip would have to re-read the body this one just
-- installed. They are applied in BODY order: §1b first (the preamble), then §5
-- (the supersede branch).
--
-- §1b. THE ISOLATION FLOOR ON THE PUBLICATION PATH — a TYPED refusal of
-- REPEATABLE READ (ratchet R1 finding 2).
--
-- §1's safety argument is that the preserved client-row lock ORDERS publication against
-- filing retirement/correction. That argument is sound at two of PostgreSQL's three
-- isolation levels and UNSOUND at the third:
--
--   READ COMMITTED (the default, and everything the runtime opens) — SAFE. Every
--     statement after `clients ... for update` takes a FRESH snapshot, so a retirement
--     that committed while we waited on the lock is visible to the active-filing reads at
--     0017:2115-2121 / 2157-2163, and the publication refuses CLR02.
--
--   SERIALIZABLE — SAFE, and STRICTER, so it is NOT refused. Publication and both
--     retirement paths each call clara._append_event, whose first act is
--     `insert into clara.firm_event_seq ... on conflict do update` on the SAME firm row
--     (0005:482-484). Under SERIALIZABLE that is a genuine write-write conflict on a row
--     the other transaction changed after our snapshot, so the loser aborts 40001 instead
--     of committing on a stale view; SSI additionally sees the rw-conflict on
--     clara.document_filings. A publication cannot commit an unmarked citation.
--
--   REPEATABLE READ — UNSAFE. The snapshot is pinned for the whole transaction, and
--     `select ... for update` raises 40001 only if the row was actually UPDATED or
--     DELETED — merely LOCKING it does not. Retirement only LOCKS the client row
--     (it updates document_filings, not clients), so a publisher that pinned its snapshot
--     while the filing was still active can wait behind retirement's client lock, be
--     granted it cleanly, re-read the filing through its stale snapshot, see it ACTIVE,
--     and commit a citation to a document whose filing is already retired. The consumer
--     ran before that commit and marked zero rows, and no later event repairs it: the
--     citation is a permanently UNMARKED INVALID END STATE, exactly what §10 R2-F2c
--     forbids.
--
-- WHAT THE RR REFUSAL IS FOR — stated accurately (ratchet R2 corrects the round-1 wording,
-- which called the firm_event_seq upsert "a coincidence, not a barrier"). It IS a barrier
-- for these two wrappers, by either arm: if publication has NOT already touched the
-- firm_event_seq row, the later conflicting upsert raises 40001 under RR; if it HAS, then
-- retirement cannot commit its own event while publication owns that row, and an opposing
-- client-row wait resolves as a deadlock abort. So the hole above is not open in today's
-- code. The refusal is therefore CONSERVATIVE DEFENCE-IN-DEPTH, not the thing that closes
-- an open hole — and it is kept because it is cheap, structural, and removes the safety
-- argument's dependence on an INTERNAL of clara._append_event (0005:482-484): a future
-- change that stops publication touching firm_event_seq, or moves the append, would
-- silently reopen the hole with no local signal. A one-line isolation check does not.
--
-- The fix is structural refusal, not a filing lock: adding `document_filings for update`
-- to publication would create the reverse-order cycle (retirement takes filing -> client,
-- publication would take client -> filing) that §1 deliberately avoids. It goes on the
-- CORE, which is the single choke point both publishing wrappers pass through
-- (publish_wiki_page_version 0017:2212, record_wiki_source_ingest 0017:2264), and it is
-- the FIRST statement in the body so no stale-snapshot read can precede it.
--
-- Idiom + code: the typed `current_setting('transaction_isolation')` refusal of
-- 0017:3834-3836 / 0017:4172-4174, raised in the WIKI family (CLR32, 0017:13) that owns
-- every other refusal on this path, with a reason discriminant.
--
-- §5. THE MONOTONIC projected_from_seq GUARD — a TYPED TERMINAL refusal.
--
-- The residual (v25-runtime-lanes-memo.md:118-120): the app-side recency re-check
-- (wiki-projection.mjs:158-165, 241-248, 303-310) cannot stop two writers inside the
-- same txn window from both observing the old value and both publishing. The guard
-- makes the in-txn recency check STRUCTURAL, on the SUPERSEDE branch only, evaluated
-- BEFORE the supersede UPDATE and the version insert.
--
-- It is a refusal, not a silent converge: both publishing mutators DISCARD the DB
-- receipt, and the wrapper would still run _audit (0017:2216-2219), _append_event
-- ('wiki.page_published', 0017:2222-2224) and _finish_op (0017:2225) — a "no-op"
-- would emit a publication event and complete an op receipt for a publication that
-- never happened. A typed refusal rolls ALL of that back inside the caller's effect
-- txn, and is distinguishable from a dedupe hit (which returns before the core is
-- called, 0017:2205-2211).
--
-- NULL-safe by construction: deterministic ingest passes p_projected_from_seq = null
-- (record_wiki_source_ingest, 0017:2264-2269) and the new-page branch (0017:2057-2069)
-- has no prior — both bypass the guard and publish.
-- =====================================================================
do $cor2$
declare v_def text; v_cur text; v_next text; v_norm text; v_anchor text;
begin
  select pg_get_functiondef(
    'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)'::regprocedure)
    into v_def;
  v_cur := v_def;

  ---- §1b the isolation floor (the FIRST statement of the body) ----------------
  v_anchor :=
$old$begin
  if p_slug is null or p_slug!~'^[a-z0-9][a-z0-9/_-]{0,199}$'$old$;
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: publication-core preamble anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$begin
  -- [WB-R21/0019 §1b] REPEATABLE READ is refused STRUCTURALLY: under a pinned snapshot
  -- the client-row lock this path shares with filing retirement does not order the two
  -- (a lock without an UPDATE is not a serialization failure), so the unlocked
  -- active-filing floor below could validate an already-retired filing and commit an
  -- UNMARKED citation. READ COMMITTED (fresh per-statement snapshots) and SERIALIZABLE
  -- (the firm_event_seq write-write conflict + SSI on document_filings) are both safe
  -- and both keep working.
  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'wiki publication cannot run under repeatable read isolation'
      using errcode='CLR32',detail='{"reason":"isolation_unsupported"}';
  end if;
  if p_slug is null or p_slug!~'^[a-z0-9][a-z0-9/_-]{0,199}$'$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_cur
     or position('isolation_unsupported' in v_norm) = 0
     or position('current_setting(''transaction_isolation'')=''repeatableread''' in v_norm) = 0
     -- …and it precedes the unlocked active-filing floor it exists to protect.
     or position('isolation_unsupported' in v_norm)
        > position('wikicitationdocumentisnotactivelyfiledtothisclient' in v_norm) then
    raise exception '0019: publication-core isolation-floor drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  ---- §5 the monotonic projected_from_seq guard -------------------------------
  v_anchor := 'if v_prior is not null then';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: supersede-branch anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$if v_prior is not null then
      -- [WB-R21/0019 §5] Structural monotonic recency guard on the supersede branch.
      if p_projected_from_seq is not null and exists(
          select 1 from clara.wiki_page_versions pv
           where pv.id=v_prior and pv.projected_from_seq is not null
             and p_projected_from_seq<=pv.projected_from_seq) then
        raise exception 'wiki publication is not newer than the published version'
          using errcode='CLR32',detail='{"reason":"stale_projected_from_seq"}';
      end if;$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_cur
     or position('stale_projected_from_seq' in v_norm) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_norm) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_norm)
        > position('updateclara.wiki_page_versionssetstate=''superseded''' in v_norm)
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_norm)
        > position('insertintoclara.wiki_page_versions(' in v_norm) then
    raise exception '0019: monotonic-guard drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor2$;

-- =====================================================================
-- §3a. THE PAGE-RETIREMENT LOCK REORDER — clara.retire_wiki_page takes the CLIENT
-- row before the PAGE row (ratchet R2 finding B1).
--
-- WHAT R1 GOT WRONG. §3's round-1 no-deadlock argument asserted that page retirement
-- "takes exactly one lock and then requests none, so it can only ever be a leaf in the
-- wait-for graph". That is FALSE. After locking its page row (0017:2296) the body calls
-- clara._append_event (0017:2315), whose first act is an upsert on the firm's
-- clara.firm_event_seq row (0005:482-484). Page retirement therefore HOLDS a page row
-- while REQUESTING a shared per-firm row — the textbook shape of a non-leaf.
--
-- THE REACHABLE CYCLE the added page lock completed:
--   1. T1 (an outer runtime transaction) publishes page A. The call returns while T1 still
--      holds clients(X), wiki_pages(A) and firm_event_seq(F).
--   2. T2 runs retire_wiki_page(page B): it locks wiki_pages(B), then WAITS on T1's
--      firm_event_seq(F).
--   3. T1 calls mark_wiki_citations_stale for a document on page B. It already owns
--      clients(X) and now WAITS on wiki_pages(B).
--   4. T1 waits for T2, T2 waits for T1 → PostgreSQL aborts one with 40P01.
-- Before §3 existed nothing else locked a page row while holding the client row, so the
-- cycle was unreachable; §3's LOCK 2 is what closed it.
--
-- THE FIX IS ORDERING, NOT ARGUMENT. Page retirement adopts the SAME client -> page order
-- every other wiki actor uses, which removes the reverse edge outright:
--   publication    : clients(p_client) -> wiki_pages(one row)      0017:2049-2056
--   the stale writer: clients(p_client) -> wiki_pages(N, asc id)   §3 below
--   page retirement : clients(p.client)  -> wiki_pages(p_page)     HERE
--   (all three then reach firm_event_seq LAST, or not at all — the writer appends no event.)
-- The filing actors take document_filings -> clients (§1) and NEVER take a page row, and
-- publication reads document_filings UNLOCKED (0017:2115-2121), so there is no
-- clients -> document_filings edge anywhere to close a cycle against them either.
--
-- (firm_id, client_id) are IMMUTABLE on clara.wiki_pages — nothing in 0017/0018/0019
-- updates either column — so the UNLOCKED lookup that identifies which client row to lock
-- cannot go stale. It decides NOTHING: every authority check is re-evaluated under the
-- page lock afterwards, including a re-assertion that the page still belongs to the client
-- whose row we hold.
--
-- The CLR11 refusal text is unchanged, so no caller sees a new error shape; the only
-- observable difference is that a retirement now BLOCKS on a concurrent same-client
-- publication (as publication and the stale writer already do) instead of racing it.
--
-- Drift-guard: the two anchors match EXACTLY ONCE each, both replaces change the body, and
-- the complete acquisition chain is asserted as positional inequalities — the §1 idiom.
-- =====================================================================
do $cor1b$
declare
  v_def text; v_cur text; v_next text; v_norm text; v_anchor text;
  v_chain text[]; v_tok text; v_at int; v_prev int;
begin
  select pg_get_functiondef('clara.retire_wiki_page(uuid,text,text)'::regprocedure)
    into v_def;
  v_cur := v_def;

  ---- (1) the two new locals ---------------------------------------------------
  v_anchor := 'declare c record; p record; v_dedupe jsonb; v_result jsonb;';
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: retire_wiki_page declare anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$declare c record; p record; v_dedupe jsonb; v_result jsonb;
  -- [WB-R21/0019 §3a] the immutable (firm,client) of the page, read UNLOCKED so the
  -- client row can be locked FIRST. Nothing is decided on them.
  v_firm uuid; v_client uuid;$new$);
  if v_next = v_cur then
    raise exception '0019: retire_wiki_page declare drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  ---- (2) client row FIRST, then the page row, then revalidate ------------------
  v_anchor :=
$old$  select * into p from clara.wiki_pages where id=p_page for update;
  if not found or p.firm_id<>c.firm then
    raise exception 'wiki page not in your firm' using errcode='CLR11';
  end if;$old$;
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: retire_wiki_page page-lock anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$  -- [WB-R21/0019 §3a] CLIENT -> PAGE, the order publication (0017:2049-2056) and
  -- mark_wiki_citations_stale (§3) both use. Page retirement is NOT a wait-for-graph
  -- leaf: after the page row it requests clara.firm_event_seq through _append_event
  -- (0005:482-484), so holding a page row while another actor holds the client row
  -- closes a real 40P01 cycle. Taking the client row first removes that edge.
  select wp.firm_id,wp.client_id into v_firm,v_client
    from clara.wiki_pages wp where wp.id=p_page;
  if v_firm is null or v_firm<>c.firm then
    raise exception 'wiki page not in your firm' using errcode='CLR11';
  end if;
  perform 1 from clara.clients cl
    where cl.id=v_client and cl.firm_id=v_firm for update;
  if not found then
    raise exception 'wiki page not in your firm' using errcode='CLR11';
  end if;
  -- Re-read EVERYTHING the body decides on under the page lock. The unlocked probe
  -- above only chose which client row to take.
  select * into p from clara.wiki_pages where id=p_page for update;
  if not found or p.firm_id<>c.firm or p.client_id<>v_client then
    raise exception 'wiki page not in your firm' using errcode='CLR11';
  end if;$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_cur then
    raise exception '0019: retire_wiki_page page-lock drift' using errcode = 'CLR10';
  end if;
  -- The COMPLETE acquisition chain, pair by pair. "the client lock is present" would be
  -- satisfied by the very order this fix exists to forbid (page -> client).
  v_chain := array[
    'selectwp.firm_id,wp.client_idintov_firm,v_clientfromclara.wiki_pageswpwherewp.id=p_page;',
    'perform1fromclara.clientsclwherecl.id=v_clientandcl.firm_id=v_firmforupdate',
    'select*intopfromclara.wiki_pageswhereid=p_pageforupdate',
    'ifnotfoundorp.firm_id<>c.firmorp.client_id<>v_clientthen',
    'clara._reserve_op(c.firm,''retire_wiki_page''',
    'updateclara.wiki_pagessetstate=''retired'''
  ];
  v_prev := 0;
  foreach v_tok in array v_chain loop
    v_at := position(v_tok in v_norm);
    if v_at = 0 then
      raise exception '0019: retire_wiki_page lost the acquisition-chain step "%"', v_tok
        using errcode = 'CLR10';
    end if;
    if v_at <= v_prev then
      raise exception '0019: retire_wiki_page acquisition-order drift — "%" no longer follows its predecessor',
        v_tok using errcode = 'CLR10';
    end if;
    v_prev := v_at;
  end loop;
  execute v_next;
end
$cor1b$;

-- =====================================================================
-- §3. THE STALE WRITER — clara.mark_wiki_citations_stale.
--
-- Scope of the mark is EXACTLY the blocker scope the veto scanned (0017:1821-1836),
-- flipped from a raise into a mark: (i) citations on the CURRENT version of an ACTIVE
-- page of (p_client, firm) with document_id = p_document and stale_at is null; (ii)
-- ref_kind='document' refs on an ACTIVE page of (p_client, firm) with the same
-- document and stale_at is null. Superseded-version citations and retired-page rows
-- are NEVER touched. A later publication that re-cites the now-retired document
-- cannot happen — the CLR02 active-filing floor already refuses it for both citations
-- (0017:2115-2121) and refs (0017:2157-2163); 0019 adds no new prevention there.
--
-- Idempotency is THREE distinct mechanisms with three distinct observable results:
--   (a) same op key, same args  -> _reserve_op replays the STORED receipt byte-
--       identically (0004:43-60), original non-zero counts and all. No re-scan, no
--       new audit/wiki_log row.
--   (b) DIFFERENT op key over already-marked rows -> a fresh reservation whose
--       `stale_at is null` filter matches nothing -> {0,0,'noop'}; the FIRST call's
--       stale_at is preserved.
--   (c) same op key, CHANGED args -> _reserve_op hash mismatch -> CLR10.
-- (a) vs (b) is why the ceremony catch-up op key must carry a run key (§11): a fixed
-- per-pair key would replay case (a) forever and never examine fresh rows.
--
-- Audit is POSITIVE-CHANGE-ONLY (the run_client_lint precedent, 0017:4882-4892): a
-- 'noop' writes NO wiki_log row and NO audit_log row. The op receipt is always
-- written. NO event is appended and NO event type is registered — see the header.
--
-- Firm is resolved FROM the client, as every wiki writer does (0017:2199-2200).
-- Argument validation precedes _reserve_op so an invalid call never consumes an
-- op_key (the 0018 R1-0018-2 discipline).
--
-- ELIGIBILITY IS LOCKED, NOT SAMPLED (ratchet R1 finding 1). A collect-then-update
-- shape — gather ids by joining wiki_pages, then UPDATE by id re-checking only
-- `stale_at is null` — leaves the eligibility predicate unprotected between the two
-- statements, and BOTH ways out of scope are reachable:
--   * a clean republish supersedes the version the citation hangs off, so the row is
--     no longer a CURRENT-version citation (0017:2080) — and §3 says superseded-version
--     citations are NEVER touched;
--   * retire_wiki_page (0017:2296-2307) retires the page, so the row is no longer on an
--     ACTIVE page.
-- Both are closed by taking the locks BEFORE the collection and re-evaluating the
-- active/current predicates UNDER them:
--   (1) the CLIENT ROW FOR UPDATE — the same serializer _publish_wiki_page_version_core
--       takes at 0017:2049-2053, so no publication for this client can interleave at all
--       (current_version_id cannot move, refs cannot be deleted/re-inserted, 0017:2134);
--   (2) then the eligible PAGE ROWS FOR UPDATE, in ASCENDING page-id order — this is what
--       orders against retire_wiki_page, which also locks the page row (0017:2296).
--
-- WHY THIS INTRODUCES NO DEADLOCK CYCLE (state it, don't assume it — and do NOT argue it
-- from any actor being a "leaf"; ratchet R2 finding B1 showed that argument was false).
-- The three actors that touch these rows acquire:
--   publication    : clients(p_client) -> wiki_pages(one row, by client+slug) 0017:2049-2056
--   this writer    : clients(p_client) -> wiki_pages(N rows, ascending id)    here
--   page retirement: clients(page.client) -> wiki_pages(one row, by id)       §3a above
-- ALL THREE share the same client -> page prefix, so any two of them are mutually
-- exclusive at the CLIENT row before either can reach a page row: the reverse edge that a
-- cycle needs does not exist. That is the whole argument, and it survives the fact that
-- publication and page retirement BOTH go on to request clara.firm_event_seq through
-- _append_event (0005:482-484) — a lock requested strictly AFTER the shared prefix cannot
-- close a cycle across it.
--
-- The round-1 text claimed instead that page retirement "takes exactly one lock and then
-- requests none, so it can only ever be a leaf". It is not a leaf: _append_event's
-- firm_event_seq upsert is a request made while holding the page row, and an outer
-- transaction that already holds that sequence row plus the client row closes a genuine
-- 40P01 cycle (the full three-statement sequence is in §3a). §3a repairs the ORDER; this
-- comment repairs the ARGUMENT.
--
-- Two writers on the SAME client serialize on the client row; two writers on DIFFERENT
-- clients touch disjoint page sets (wiki_pages is client-scoped), so the ascending-id
-- order is belt-and-braces there. NO actor in the schema takes a wiki_pages row before a
-- clara.clients row — asserted over EVERY clara function by the §9 tail, not assumed.
--
-- The re-evaluation is correct at every isolation level. READ COMMITTED: each statement
-- after the locks takes a fresh snapshot, so a retirement that committed while we waited is
-- visible. REPEATABLE READ / SERIALIZABLE: both republish (0017:2168) and retire_wiki_page
-- (0017:2301) genuinely UPDATE the wiki_pages row, so `for update` on a row they changed
-- after our snapshot raises 40001 rather than granting a stale-snapshot lock — the exact
-- failure mode §5's sibling guard (below) has to legislate for the publication path, where
-- the contended row is only LOCKED and never updated.
-- =====================================================================
create function clara.mark_wiki_citations_stale(
    p_client uuid, p_document uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_firm uuid; v_dedupe jsonb; v_result jsonb; v_status text;
  v_cit int := 0; v_ref int := 0; v_page uuid;
  v_cit_ids uuid[] := '{}'; v_ref_ids uuid[] := '{}';
  v_pages_c uuid[] := '{}'; v_pages_r uuid[] := '{}'; v_pages uuid[] := '{}';
  v_locked uuid[] := '{}'; v_lock record;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required'
      using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  if p_document is null then
    raise exception 'a source document is required'
      using errcode = 'CLR10', detail = '{"reason":"document_required"}';
  end if;
  -- The SAME allowed set as the column CHECK; an unrecognised reason is a typed refusal.
  if p_reason is null or p_reason not in ('source_filing_retired') then
    raise exception 'unrecognised wiki stale reason'
      using errcode = 'CLR10', detail = '{"reason":"stale_reason_unknown"}';
  end if;
  select firm_id into v_firm from clara.clients where id = p_client;
  if v_firm is null then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(v_firm, 'mark_wiki_citations_stale', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'document', p_document,
      'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- ---- LOCK 1: the client row — the publication serializer (0017:2049-2053). ----
  perform 1 from clara.clients cl
    where cl.id = p_client and cl.firm_id = v_firm for update;
  if not found then
    raise exception 'client not found' using errcode = 'CLR11';
  end if;

  -- ---- LOCK 2: every ELIGIBLE page row, in ASCENDING page-id order. Eligibility is
  -- read once here only to bound the lock set; nothing is decided on it. A page cannot
  -- JOIN the set behind our back: joining requires a publication, and publication is
  -- blocked on the client row we now hold. A page can LEAVE the set (retire_wiki_page
  -- takes no client row), which is precisely what the re-evaluation below catches. ----
  for v_lock in
    select wp.id as page_id
      from clara.wiki_pages wp
     where wp.firm_id = v_firm and wp.client_id = p_client and wp.state = 'active'
       and (exists(select 1 from clara.wiki_page_citations wc
                    where wc.version_id = wp.current_version_id
                      and wc.client_id = wp.client_id and wc.firm_id = wp.firm_id
                      and wc.document_id = p_document and wc.stale_at is null)
         or exists(select 1 from clara.wiki_page_refs wr
                    where wr.page_id = wp.id
                      and wr.client_id = wp.client_id and wr.firm_id = wp.firm_id
                      and wr.ref_kind = 'document' and wr.document_id = p_document
                      and wr.stale_at is null))
     order by wp.id
  loop
    perform 1 from clara.wiki_pages lp where lp.id = v_lock.page_id for update;
    v_locked := v_locked || v_lock.page_id;
  end loop;

  -- (i) CURRENT-version citations of ACTIVE pages — RE-EVALUATED under the locks, so
  -- `state='active'` and `current_version_id` are the values the UPDATE is authorised
  -- against, not the values some earlier statement happened to observe.
  select coalesce(array_agg(wc.id), '{}'), coalesce(array_agg(distinct wp.id), '{}')
    into v_cit_ids, v_pages_c
  from clara.wiki_page_citations wc
  join clara.wiki_pages wp on wp.current_version_id = wc.version_id
    and wp.client_id = wc.client_id and wp.firm_id = wc.firm_id
  where wp.id = any(v_locked)
    and wp.firm_id = v_firm and wp.client_id = p_client and wp.state = 'active'
    and wc.document_id = p_document and wc.stale_at is null;
  update clara.wiki_page_citations
    set stale_at = now(), stale_reason = p_reason
    where id = any(v_cit_ids) and stale_at is null;
  get diagnostics v_cit = row_count;

  -- (ii) page-level ref_kind='document' refs on ACTIVE pages — same re-evaluation.
  select coalesce(array_agg(wr.id), '{}'), coalesce(array_agg(distinct wp.id), '{}')
    into v_ref_ids, v_pages_r
  from clara.wiki_page_refs wr
  join clara.wiki_pages wp on wp.id = wr.page_id
    and wp.client_id = wr.client_id and wp.firm_id = wr.firm_id
  where wp.id = any(v_locked)
    and wp.firm_id = v_firm and wp.client_id = p_client and wp.state = 'active'
    and wr.ref_kind = 'document' and wr.document_id = p_document
    and wr.stale_at is null;
  update clara.wiki_page_refs
    set stale_at = now(), stale_reason = p_reason
    where id = any(v_ref_ids) and stale_at is null;
  get diagnostics v_ref = row_count;

  -- page_id is set only when the mark is unambiguously page-attributable — and it is
  -- derived from the SAME locked, re-evaluated sets the UPDATEs ran against, so the
  -- audit/wiki_log attribution can never name a page whose rows were not marked.
  select coalesce(array_agg(distinct z), '{}') into v_pages
    from unnest(v_pages_c || v_pages_r) z;
  if coalesce(array_length(v_pages, 1), 0) = 1 then v_page := v_pages[1]; end if;

  v_status := case when v_cit + v_ref = 0 then 'noop' else 'marked' end;
  v_result := jsonb_build_object(
    'document_id', p_document, 'reason', p_reason,
    'citations_marked', v_cit, 'refs_marked', v_ref, 'status', v_status);
  if v_status = 'marked' then
    insert into clara.wiki_log(firm_id, client_id, page_id, action, actor_kind, detail)
      values (v_firm, p_client, v_page, 'mark_stale', 'runtime',
        jsonb_build_object('document_id', p_document, 'reason', p_reason,
          'citations_marked', v_cit, 'refs_marked', v_ref));
    perform clara._audit(v_firm, null, null, null, 'mark_wiki_citations_stale', null,
      jsonb_build_object('client', p_client, 'document', p_document,
        'reason', p_reason, 'citations_marked', v_cit, 'refs_marked', v_ref,
        'op_key', p_op_key));
  end if;
  return clara._finish_op(v_firm, 'mark_wiki_citations_stale', p_op_key, v_result);
end $fn$;

-- =====================================================================
-- §6b. THE LINT FINDING CLASS — 'stale_citation' on run_client_lint.
--
-- Grain: ONE finding per (page_id, document_id), NOT per citation row. A page citing
-- the same document from several citation rows, or from both a citation and a ref,
-- produces exactly one finding. dedupe_key rides uq_lint_findings_one_open
-- (0017:1358-1359) unchanged.
--
-- The condition is the UNION of TWO scans:
--   (1) MARKED    — a current-version citation or a page-level document ref of an
--                   ACTIVE page carrying stale_at is not null;
--   (2) INVERTED  — an unmarked (stale_at is null) live source whose document has NO
--                   active filing to that client (the same probe run_client_lint
--                   already performs for opening_doc_unfiled, 0017:4804-4807, indexed
--                   by uq_document_filing_active, 0007:93-94).
-- Scan (2) is NOT redundant with the writer: processFirm advances the checkpoint past
-- a dead-lettered event once attempts are exhausted (wiki-projection.mjs:422-426), so
-- a writer failure can exhaust into dead-letter-plus-checkpoint and the stale citation
-- would otherwise be permanently invisible. Scan (2) is the only surface that sees it;
-- marker_missing:true is that visible signal.
--
-- page_id is set at the TOP LEVEL of the condition object: the episode insert reads
-- nullif(j->>'page_id','')::uuid from the CONDITION, not from detail (0017:4836-4842),
-- so a detail-only page_id would leave the finding's FK column null.
--
-- `y` is the record variable 0017 declared and never used; aliases avoid p/c/x/s/f/h/cl
-- because those are plpgsql variables in this body (variable_conflict = error).
-- =====================================================================
do $cor3$
declare v_def text; v_next text; v_norm text; v_anchor text;
begin
  select pg_get_functiondef('clara.run_client_lint(uuid,text)'::regprocedure) into v_def;
  v_anchor := '    -- Converge current conditions into one-open episodes.';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: run_client_lint convergence anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$    -- [WB-R21/0019 §6] stale_citation: MARKED sources UNION the INVERTED scan.
    for y in
      select zz.page_id, zz.document_id,
        min(zz.stale_at) as since,
        min(zz.stale_reason) as stale_reason,
        (count(*) filter (where zz.stale_at is not null) = 0) as marker_missing
      from (
        select wp.id as page_id, wc.document_id, wc.stale_at, wc.stale_reason
          from clara.wiki_pages wp
          join clara.wiki_page_citations wc on wc.version_id=wp.current_version_id
            and wc.client_id=wp.client_id and wc.firm_id=wp.firm_id
         where wp.client_id=p_client and wp.state='active'
           and wc.document_id is not null
           and (wc.stale_at is not null
             or not exists(select 1 from clara.document_filings df
                  where df.document_id=wc.document_id and df.client_id=wp.client_id
                    and df.retired_at is null))
        union all
        select wp.id, wr.document_id, wr.stale_at, wr.stale_reason
          from clara.wiki_pages wp
          join clara.wiki_page_refs wr on wr.page_id=wp.id
            and wr.client_id=wp.client_id and wr.firm_id=wp.firm_id
         where wp.client_id=p_client and wp.state='active'
           and wr.ref_kind='document' and wr.document_id is not null
           and (wr.stale_at is not null
             or not exists(select 1 from clara.document_filings df
                  where df.document_id=wr.document_id and df.client_id=wp.client_id
                    and df.retired_at is null))
      ) zz
      group by zz.page_id, zz.document_id
      order by zz.page_id, zz.document_id
    loop
      v_conditions:=v_conditions||jsonb_build_object(
        'finding_kind','stale_citation',
        'dedupe_key','stalecite:'||y.page_id||':'||y.document_id,
        'severity','warn','page_id',y.page_id,
        'detail',jsonb_build_object('page_id',y.page_id,
          'document_id',y.document_id,'stale_reason',y.stale_reason,
          'since',y.since,'marker_missing',y.marker_missing));
    end loop;

    -- Converge current conditions into one-open episodes.$new$);
  v_norm := regexp_replace(lower(v_next), '\s+', '', 'g');
  if v_next = v_def
     or position('''stale_citation''' in v_norm) = 0
     or position('''stalecite:''||y.page_id||'':''||y.document_id' in v_norm) = 0
     or position('''marker_missing'',y.marker_missing' in v_norm) = 0
     -- BOTH halves of the inverted scan are present. The pattern is the wp-joined
     -- predicate, NOT a bare document_filings probe: run_client_lint already carries
     -- one for opening_doc_unfiled (0017:4804-4807), which a looser count would
     -- silently absorb.
     or regexp_count(v_norm, 'df[.]client_id=wp[.]client_id') <> 2 then
    raise exception '0019: run_client_lint stale_citation drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor3$;

-- =====================================================================
-- §7. READ-SURFACE MARKING — inform-never-decide (ADR-004; LAW).
--
-- The fields do NOT all arrive "for free": get_wiki_page returns to_jsonb(c) /
-- to_jsonb(r) (0017:2392-2398) so the per-row columns are additive there, but
-- list_wiki_pages ENUMERATES page fields (0017:2420-2425) and the pack's wiki block
-- ENUMERATES citation fields (0017:5053-5063) and carries NO refs array at all. So
-- three explicit changes, all MARK-never-drop:
--   1. get_wiki_page gains a derived page-level has_stale_sources;
--   2. list_wiki_pages gains has_stale_sources in its enumerated per-page object;
--   3. the pack's wiki block adds stale_at + stale_reason BY NAME to the enumerated
--      citation object and has_stale_sources to the enumerated page object.
--
-- Name: has_stale_sources, not has_stale_citations — the flag aggregates citations
-- AND page-level document refs, and the pack shows no refs array, so there the flag
-- is the ONLY signal that a page's document ref went stale.
--
-- Definition, identical in all three: EXISTS a citation of the page's CURRENT version,
-- OR a ref_kind='document' ref on the page, with stale_at is not null.
--
-- NOTHING is filtered, reordered or gated: the pack's candidates set (0017:5043-5045),
-- its priority/row_number ordering (0017:5039-5052) and its
-- `ord <= page_cap and running_bytes <= byte_cap` admission (0017:5065) are untouched,
-- and content_bytes derives from wv.content alone (0017:5038) so adding fields to the
-- enumerated citation object cannot shift the byte cap.
-- =====================================================================
do $cor4$
declare v_def text; v_next text; v_cur text; v_anchor text;
begin
  ---- 1. get_wiki_page --------------------------------------------------------
  select pg_get_functiondef('clara.get_wiki_page(uuid,text)'::regprocedure) into v_def;
  v_anchor :=
$old$      'refs',coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
        from clara.wiki_page_refs r where r.page_id=p.id),'[]'::jsonb))$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: get_wiki_page anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$      'refs',coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
        from clara.wiki_page_refs r where r.page_id=p.id),'[]'::jsonb),
      'has_stale_sources',(exists(select 1 from clara.wiki_page_citations sc
          where sc.version_id=p.current_version_id and sc.stale_at is not null)
        or exists(select 1 from clara.wiki_page_refs sr
          where sr.page_id=p.id and sr.ref_kind='document'
            and sr.stale_at is not null)))$new$);
  if v_next = v_def
     or position('has_stale_sources' in v_next) = 0 then
    raise exception '0019: get_wiki_page has_stale_sources drift' using errcode = 'CLR10';
  end if;
  execute v_next;

  ---- 2. list_wiki_pages ------------------------------------------------------
  select pg_get_functiondef('clara.list_wiki_pages(uuid)'::regprocedure) into v_def;
  v_anchor := $old$      'size_bytes',v.size_bytes,'updated_at',p.updated_at)$old$;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: list_wiki_pages anchor must match exactly once' using errcode = 'CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
$new$      'size_bytes',v.size_bytes,'updated_at',p.updated_at,
      'has_stale_sources',(exists(select 1 from clara.wiki_page_citations sc
          where sc.version_id=p.current_version_id and sc.stale_at is not null)
        or exists(select 1 from clara.wiki_page_refs sr
          where sr.page_id=p.id and sr.ref_kind='document'
            and sr.stale_at is not null)))$new$);
  if v_next = v_def
     or position('has_stale_sources' in v_next) = 0 then
    raise exception '0019: list_wiki_pages has_stale_sources drift' using errcode = 'CLR10';
  end if;
  execute v_next;

  ---- 3. the pack's wiki block ------------------------------------------------
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) into v_def;
  v_cur := v_def;

  v_anchor :=
$old$              'detail',wc.detail)
              order by wc.created_at,wc.id)$old$;
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: pack citation-enumeration anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$              'detail',wc.detail,'stale_at',wc.stale_at,
              'stale_reason',wc.stale_reason)
              order by wc.created_at,wc.id)$new$);
  if v_next = v_cur then
    raise exception '0019: pack citation-enumeration drift' using errcode = 'CLR10';
  end if;
  v_cur := v_next;

  v_anchor :=
$old$            where wc.version_id=r.version_id),'[]'::jsonb),
          'content',r.content) order by r.ord),'[]'::jsonb)$old$;
  if (length(v_cur) - length(replace(v_cur, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '0019: pack page-object anchor must match exactly once'
      using errcode = 'CLR10';
  end if;
  v_next := replace(v_cur, v_anchor,
$new$            where wc.version_id=r.version_id),'[]'::jsonb),
          'has_stale_sources',(exists(select 1 from clara.wiki_page_citations sc
              where sc.version_id=r.version_id and sc.stale_at is not null)
            or exists(select 1 from clara.wiki_page_refs sr
              where sr.ref_kind='document' and sr.stale_at is not null
                and sr.page_id=(select sv.page_id from clara.wiki_page_versions sv
                  where sv.id=r.version_id))),
          'content',r.content) order by r.ord),'[]'::jsonb)$new$);
  if v_next = v_cur
     or position('has_stale_sources' in v_next) = 0
     or position('''stale_at'',wc.stale_at' in v_next) = 0
     -- the admission / ordering / candidate shape must be byte-identical.
     or position('where r.ord<=cfg.page_cap and r.running_bytes<=cfg.byte_cap' in v_next) = 0
     or position('row_number() over(order by priority,updated_at desc,slug) ord' in v_next) = 0 then
    raise exception '0019: pack page-object drift' using errcode = 'CLR10';
  end if;
  execute v_next;
end
$cor4$;

reset role;

-- =====================================================================
-- GRANTS (as the migration role). The stale writer is a RUNTIME-ONLY verb — the
-- set_wiki_synthesis_hold matrix (0017:5125-5135). It never reaches
-- clara_authenticated, clara_agent_ro, clara_wake_interactive or clara_wake_proactive,
-- and NO new table grant is issued to any role: clara_runtime still has no SELECT on
-- clara.document_filings (0007:2740-2741), which is why the §11 ceremony catch-up
-- splits into a ceremony-role scan plus a runtime-role marking verb.
-- =====================================================================
revoke execute on all functions in schema clara from public;
grant execute on function
  clara.mark_wiki_citations_stale(uuid, uuid, text, text)
  to clara_runtime;

-- =====================================================================
-- §9. THE IN-TRANSACTION FAIL-CLOSED TAIL BATTERY.
-- Static catalog / prosrc / ACL asserts + the clean-end-state closed-set scan +
-- EXPLAIN-backed plan coverage + three functional probes, each inside a forced-
-- rollback subtransaction. One transaction; any failure aborts the apply.
-- =====================================================================
do $tail$
declare
  v_def text; v_src text; v_sig text; v_owner oid; v_txt text; v_plan jsonb;
  v_wl text[]; v_wl_oids oid[]; v_bad text; v_probe_ok boolean; v_n int;
  v_f uuid; v_u uuid; v_c uuid; v_d uuid; v_fil uuid;
  v_pg uuid; v_ver uuid; v_cit uuid; v_r jsonb;
  v_rev uuid; v_stale timestamptz; v_content text; v_sha text; v_key text;
  v_seq0 bigint; v_relrx text; v_callrx text;
  v_chain text[]; v_at int; v_prev int;
begin
  v_owner := (select oid from pg_roles where rolname = 'clara_fn_owner');
  v_relrx := '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M';
  v_callrx := '\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale)\M';

  -- ---- §1 the helper is GONE. to_regprocedure, NOT to_regproc (0011:4132-4136):
  -- to_regproc takes a BARE name and errors/misresolves on an argument list. ----
  if to_regprocedure('clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)') is not null then
    raise exception '0019 the R2-F2 veto helper still exists' using errcode = 'CLR10';
  end if;

  -- ---- §1 both authority bodies are wiki-clean AND still hold the client row ----
  foreach v_sig in array array[
    'clara.retire_document_filing(uuid,text,uuid,text)',
    'clara.approve_wrong_client_correction(uuid,text,text,text)'
  ] loop
    select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
      from pg_proc where oid = v_sig::regprocedure;
    if position('_assert_filing_wiki_unreferenced' in v_src) > 0 then
      raise exception '0019 the veto call survives in %', v_sig using errcode = 'CLR10';
    end if;
    if position('fromclara.clientscl' in v_src) = 0
       or position('forupdate' in v_src) = 0
       or position('raiseexception''filingclientnotinthesuppliedfirm''usingerrcode=''clr11'''
         in v_src) = 0 then
      raise exception '0019 the client-row serializer is missing from %', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §1 THE COMPLETE ACQUISITION CHAIN, pair by pair (ratchet R1 finding 5).
  -- "the client lock precedes the retirement UPDATE" is satisfied by orders that
  -- DEADLOCK — notably one that hoists the client lock above the filing lock, giving
  -- correction/retirement client -> filing against a concurrent retirement's
  -- filing -> client. Every token the weaker assertion named would still be present.
  -- Each step below must exist AND strictly follow its predecessor. ----
  foreach v_sig in array array[
    'clara.retire_document_filing(uuid,text,uuid,text)',
    'clara.approve_wrong_client_correction(uuid,text,text,text)'
  ] loop
    select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
      from pg_proc where oid = v_sig::regprocedure;
    if v_sig like 'clara.retire_document_filing%' then
      v_chain := array[
        'select*intoffromclara.document_filingswhereid=p_filing_idforupdate',
        'raiseexception''filingisalreadyretired''usingerrcode=''clr17''',
        'raiseexception''stalefilingrevision''usingerrcode=''clr17''',
        'perform1fromclara.clientsclwherecl.id=f.client_idandcl.firm_id=f.firm_idforupdate',
        'fromclara.journal_entriesjewhereje.filing_id=f.id',
        'updateclara.document_filingssetretired_at'
      ];
    else
      v_chain := array[
        'select*intoxfromclara.filing_correctionswhereid=p_correctionforupdate',
        'perform1fromclara.document_filingsfwheref.document_id=x.document_idandf.firm_id=c.firmorderbyf.idforupdate',
        'raiseexception''sourcefilingisnolongeractive''usingerrcode=''clr19''',
        'perform1fromclara.clientsclwherecl.id=x.from_clientandcl.firm_id=c.firmforupdate',
        'forupdateofje',
        'updateclara.document_filingssetretired_at'
      ];
    end if;
    v_prev := 0;
    foreach v_txt in array v_chain loop
      v_at := position(v_txt in v_src);
      if v_at = 0 then
        raise exception '0019 % lost the acquisition-chain step "%"', v_sig, v_txt
          using errcode = 'CLR10';
      end if;
      if v_at <= v_prev then
        raise exception '0019 % acquisition-order drift — "%" no longer follows its predecessor',
          v_sig, v_txt using errcode = 'CLR10';
      end if;
      v_prev := v_at;
    end loop;
  end loop;

  -- ---- §1 NON-WIKI blockers survive, PER FUNCTION (never both-in-both) ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
    from pg_proc where oid = 'clara.retire_document_filing(uuid,text,uuid,text)'::regprocedure;
  if position('raiseexception''filingisalreadyretired''usingerrcode=''clr17''' in v_src) = 0
     or position('raiseexception''stalefilingrevision''usingerrcode=''clr17''' in v_src) = 0
     or position('fromclara.journal_entriesjewhereje.filing_id=f.id' in v_src) = 0
     or position('raiseexception''filinghaslivecitationblockers:%'',v_blockers::textusingerrcode=''clr10'''
       in v_src) = 0 then
    raise exception '0019 retire_document_filing lost a non-wiki blocker' using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
    from pg_proc where oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure;
  if position('raiseexception''sourcefilingisnolongeractive''usingerrcode=''clr19''' in v_src) = 0 then
    raise exception '0019 approve_wrong_client_correction lost its CLR19 source-filing guard'
      using errcode = 'CLR10';
  end if;

  -- ---- §3a PAGE RETIREMENT TAKES THE CLIENT ROW FIRST (ratchet R2 finding B1) ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src
    from pg_proc where oid = 'clara.retire_wiki_page(uuid,text,text)'::regprocedure;
  v_chain := array[
    'selectwp.firm_id,wp.client_idintov_firm,v_clientfromclara.wiki_pageswpwherewp.id=p_page;',
    'perform1fromclara.clientsclwherecl.id=v_clientandcl.firm_id=v_firmforupdate',
    'select*intopfromclara.wiki_pageswhereid=p_pageforupdate',
    'ifnotfoundorp.firm_id<>c.firmorp.client_id<>v_clientthen',
    'clara._reserve_op(c.firm,''retire_wiki_page''',
    'updateclara.wiki_pagessetstate=''retired'''
  ];
  v_prev := 0;
  foreach v_txt in array v_chain loop
    v_at := position(v_txt in v_src);
    if v_at = 0 or v_at <= v_prev then
      raise exception '0019 retire_wiki_page acquisition-chain drift at "%" — the client row must be locked BEFORE the page row',
        v_txt using errcode = 'CLR10';
    end if;
    v_prev := v_at;
  end loop;

  -- ---- §3a THE CLIENT -> PAGE ORDER, OVER EVERY clara FUNCTION. §3's no-deadlock
  -- argument rests on one absolute claim — no actor takes a clara.wiki_pages row before a
  -- clara.clients row — and ratchet R1 "verified" it over three NAMED functions, which is
  -- how R2 found retire_wiki_page violating it. The claim is only worth its enforcement,
  -- so it is now asserted over the WHOLE schema: any function that locks a page row
  -- either locks a client row FIRST, or fails the apply. A function that locks a page row
  -- and NO client row is also a violator: it may request anything afterwards (page
  -- retirement requested clara.firm_event_seq through _append_event, 0005:482-484, which
  -- is precisely why "it is a leaf" was false), and a lock held outside the shared prefix
  -- is exactly the reverse edge a cycle needs. Positions are taken on the
  -- whitespace-stripped body, the drift-guard idiom used throughout this migration. ----
  select string_agg(q.sig, ', ' order by q.sig) into v_bad
    from (
      select p.oid::regprocedure::text as sig,
             regexp_instr(regexp_replace(lower(p.prosrc), '\s+', '', 'g'),
               'fromclara\.wiki_pages[a-z]*where[^;]*forupdate') as page_at,
             regexp_instr(regexp_replace(lower(p.prosrc), '\s+', '', 'g'),
               'fromclara\.clients[a-z]*where[^;]*forupdate') as client_at
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara' and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
    ) q
   where q.page_at > 0 and (q.client_at = 0 or q.client_at > q.page_at);
  if v_bad is not null then
    raise exception '0019 lock-order violation — these clara function(s) take a wiki_pages row FOR UPDATE without a preceding clara.clients row FOR UPDATE: %',
      v_bad using errcode = 'CLR10';
  end if;
  -- …and the scan is NOT vacuous: the three actors that DO take both must be found by it.
  select count(*) into v_n
    from (
      select regexp_instr(regexp_replace(lower(p.prosrc), '\s+', '', 'g'),
               'fromclara\.wiki_pages[a-z]*where[^;]*forupdate') as page_at
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'clara'
         and p.oid in (
           'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)'::regprocedure,
           'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'::regprocedure,
           'clara.retire_wiki_page(uuid,text,text)'::regprocedure)
    ) q
   where q.page_at > 0;
  if v_n <> 3 then
    raise exception '0019 lock-order scan is vacuous — it recognises only % of the 3 page-locking actors', v_n
      using errcode = 'CLR10';
  end if;

  -- ---- §2 the stale marker exists on BOTH relations, with both CHECKs ----
  foreach v_sig in array array['wiki_page_citations', 'wiki_page_refs'] loop
    if not exists(select 1 from pg_attribute
          where attrelid = ('clara.' || v_sig)::regclass and attname = 'stale_at'
            and atttypid = 'timestamptz'::regtype and not attisdropped)
       or not exists(select 1 from pg_attribute
          where attrelid = ('clara.' || v_sig)::regclass and attname = 'stale_reason'
            and atttypid = 'text'::regtype and not attisdropped) then
      raise exception '0019 stale marker columns missing on %', v_sig using errcode = 'CLR10';
    end if;
    -- EXACTLY ONE stale_reason value CHECK (distinguished from the paired CHECK by not
    -- referencing stale_at) and its normalized definition EQUALS the allowed-value
    -- predicate — a substring match could false-pass a widened predicate.
    if (select count(*) from pg_constraint
        where conrelid = ('clara.' || v_sig)::regclass and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%stale_reason%'
          and pg_get_constraintdef(oid) not ilike '%stale_at%') <> 1 then
      raise exception '0019 stale_reason CHECK: expected exactly one on %', v_sig
        using errcode = 'CLR10';
    end if;
    select pg_get_constraintdef(oid) into v_def from pg_constraint
      where conrelid = ('clara.' || v_sig)::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%stale_reason%'
        and pg_get_constraintdef(oid) not ilike '%stale_at%';
    if regexp_replace(lower(v_def), '\s+', '', 'g')
         <> 'check((stale_reason=''source_filing_retired''::text))' then
      raise exception '0019 stale_reason allowed-value predicate assertion failed on % (got: %)',
        v_sig, v_def using errcode = 'CLR10';
    end if;
    select pg_get_constraintdef(oid) into v_def from pg_constraint
      where conrelid = ('clara.' || v_sig)::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%stale_at%'
        and pg_get_constraintdef(oid) ilike '%stale_reason%';
    if regexp_replace(lower(coalesce(v_def, '')), '\s+', '', 'g')
         not like '%(stale_atisnull)=(stale_reasonisnull)%' then
      raise exception '0019 paired-presence CHECK shape assertion failed on %', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §2 every new index exists ----
  foreach v_sig in array array[
    'ix_wiki_citations_doc_live', 'ix_wiki_citations_stale', 'ix_wiki_citations_version',
    'ix_wiki_refs_doc_live', 'ix_wiki_refs_stale', 'ix_wiki_refs_page'
  ] loop
    if not exists(select 1 from pg_class i join pg_namespace n on n.oid = i.relnamespace
        where n.nspname = 'clara' and i.relname = v_sig and i.relkind = 'i') then
      raise exception '0019 index % is missing', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §3 the writer's catalog shape ----
  if not exists(select 1 from pg_proc p
      where p.oid = 'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'::regprocedure
        and p.prosecdef and p.proowner = v_owner
        and exists(select 1 from unnest(p.proconfig) x where x like 'search_path=%')) then
    raise exception '0019 mark_wiki_citations_stale owner/secdef/search_path assertion failed'
      using errcode = 'CLR10';
  end if;
  if (select proargnames from pg_proc
        where oid = 'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'::regprocedure)
       is distinct from array['p_client','p_document','p_reason','p_op_key']::text[] then
    raise exception '0019 mark_wiki_citations_stale arg-name assertion failed'
      using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'::regprocedure;
  if position('clara._reserve_op(v_firm,''mark_wiki_citations_stale''' in v_src) = 0
     or position('clara._finish_op(v_firm,''mark_wiki_citations_stale''' in v_src) = 0
     or position('_append_event' in v_src) > 0 then
    raise exception '0019 writer op-key discipline / no-event assertion failed'
      using errcode = 'CLR10';
  end if;

  -- ---- §2c/§6a the two widened CHECK sets ----
  if not exists(select 1 from pg_constraint
      where conrelid = 'clara.wiki_log'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%mark_stale%') then
    raise exception '0019 wiki_log.action CHECK lacks mark_stale' using errcode = 'CLR10';
  end if;
  if not exists(select 1 from pg_constraint
      where conrelid = 'clara.lint_findings'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%stale_citation%') then
    raise exception '0019 lint_findings.finding_kind CHECK lacks stale_citation'
      using errcode = 'CLR10';
  end if;

  -- ---- amendment 4: NO new event type. The negative assertion. ----
  if exists(select 1 from clara.event_types where name = 'wiki.citations_staled') then
    raise exception '0019 the dropped wiki.citations_staled event type exists'
      using errcode = 'CLR10';
  end if;

  -- ---- §7 / §6 body markers ----
  foreach v_sig in array array[
    'clara.get_wiki_page(uuid,text)', 'clara.list_wiki_pages(uuid)',
    'clara.get_context_pack(uuid,text)'
  ] loop
    select prosrc into v_src from pg_proc where oid = v_sig::regprocedure;
    if position('has_stale_sources' in v_src) = 0 then
      raise exception '0019 % does not expose has_stale_sources', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.get_context_pack(uuid,text)'::regprocedure;
  if position('''stale_at'',wc.stale_at' in v_src) = 0
     or position('''stale_reason'',wc.stale_reason' in v_src) = 0 then
    raise exception '0019 the pack citation enumeration lacks the stale fields'
      using errcode = 'CLR10';
  end if;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara.run_client_lint(uuid,text)'::regprocedure;
  if position('''stale_citation''' in v_src) = 0
     or position('''stalecite:''||y.page_id||'':''||y.document_id' in v_src) = 0
     or position('''marker_missing'',y.marker_missing' in v_src) = 0
     or regexp_count(v_src, 'df[.]client_id=wp[.]client_id') <> 2 then
    raise exception '0019 run_client_lint lacks the stale_citation class or its inverted scan'
      using errcode = 'CLR10';
  end if;

  -- ---- §5 the monotonic guard is present on the supersede branch ----
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into v_src from pg_proc
    where oid = 'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)'::regprocedure;
  if position('stale_projected_from_seq' in v_src) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_src) = 0
     or position('p_projected_from_seq<=pv.projected_from_seq' in v_src)
        > position('updateclara.wiki_page_versionssetstate=''superseded''' in v_src) then
    raise exception '0019 monotonic guard missing or misplaced' using errcode = 'CLR10';
  end if;

  -- ---- §1b the isolation floor is present and PRECEDES every read it protects ----
  if position('current_setting(''transaction_isolation'')=''repeatableread''' in v_src) = 0
     or position('isolation_unsupported' in v_src) = 0 then
    raise exception '0019 the publication-core REPEATABLE READ refusal is missing'
      using errcode = 'CLR10';
  end if;
  -- SERIALIZABLE must NOT be refused — it is STRICTER, and refusing it would break the
  -- 0017 opening-seed lanes that legitimately run publication inside a serializable txn.
  if position('<>''serializable''' in v_src) > 0 then
    raise exception '0019 the publication core refuses serializable isolation — it must not'
      using errcode = 'CLR10';
  end if;
  v_chain := array[
    'isolation_unsupported',
    'wikicitationdocumentisnotactivelyfiledtothisclient',
    'wikirefdocumentisnotactivelyfiledtothisclient'
  ];
  v_prev := 0;
  foreach v_txt in array v_chain loop
    v_at := position(v_txt in v_src);
    if v_at = 0 or v_at <= v_prev then
      raise exception '0019 the isolation floor no longer precedes the unlocked active-filing read "%"',
        v_txt using errcode = 'CLR10';
    end if;
    v_prev := v_at;
  end loop;

  -- ---- §9 GRANTS / capability closed set ----
  if not has_function_privilege('clara_runtime',
      'clara.mark_wiki_citations_stale(uuid,uuid,text,text)', 'execute') then
    raise exception '0019 the runtime grant on the stale writer is missing' using errcode = 'CLR10';
  end if;
  foreach v_sig in array array['clara_authenticated', 'clara_agent_ro',
      'clara_wake_interactive', 'clara_wake_proactive'] loop
    if has_function_privilege(v_sig,
        'clara.mark_wiki_citations_stale(uuid,uuid,text,text)', 'execute') then
      raise exception '0019 role % gained EXECUTE on the stale writer', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;
  if exists(select 1 from clara.wake_fn_allowlist
      where function_name = 'mark_wiki_citations_stale') then
    raise exception '0019 the stale writer leaked into wake_fn_allowlist' using errcode = 'CLR10';
  end if;
  -- whole-schema PUBLIC-execute sweep (covers the new fn).
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where n.nspname = 'clara' and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception '0019 PUBLIC execute sweep failed' using errcode = 'CLR10';
  end if;
  -- the patched read/lint surfaces keep their 0017 ACLs (CoR preserves them).
  if not has_function_privilege('clara_runtime', 'clara.run_client_lint(uuid,text)', 'execute')
     or not has_function_privilege('clara_runtime', 'clara.get_wiki_page(uuid,text)', 'execute')
     or not has_function_privilege('clara_authenticated', 'clara.get_wiki_page(uuid,text)', 'execute')
     or not has_function_privilege('clara_runtime', 'clara.list_wiki_pages(uuid)', 'execute')
     or not has_function_privilege('clara_authenticated', 'clara.list_wiki_pages(uuid)', 'execute') then
    raise exception '0019 a patched surface lost its 0017 ACL' using errcode = 'CLR10';
  end if;
  -- NO new table grant. In particular the runtime document→client gap STAYS shut:
  -- widening it is 0020's decision, not 0019's.
  if has_table_privilege('clara_runtime', 'clara.document_filings', 'select') then
    raise exception '0019 clara_runtime gained SELECT on document_filings — out of scope'
      using errcode = 'CLR10';
  end if;
  foreach v_sig in array array['wiki_page_citations', 'wiki_page_refs'] loop
    if has_table_privilege('clara_agent_ro', 'clara.' || v_sig, 'select')
       or has_table_privilege('clara_runtime', 'clara.' || v_sig, 'update')
       or has_table_privilege('clara_runtime', 'clara.' || v_sig, 'insert')
       or has_table_privilege('clara_authenticated', 'clara.' || v_sig, 'update') then
      raise exception '0019 direct table authority leaked for %', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- §9 THE CLEAN-END-STATE CLOSED-SET SCAN (D4b). This SUPERSEDES 0017's
  -- exclusion loop (0017:5945-5967), which scanned a FIXED NAMED LIST and OMITTED
  -- retire_document_filing + approve_wrong_client_correction — exactly why the veto
  -- could hide there. The inverse scan covers ALL clara fns and fails if any fn
  -- outside the whitelist either (a) names one of the seven wiki relations or
  -- (b) carries a CALL EDGE into the wiki-touch set. The whitelist is by EXACT
  -- regprocedure IDENTITY, not by proname (0017:6000-6004 used proname, so a future
  -- overload of a whitelisted name was silently covered). Resolving each signature is
  -- itself an existence assertion.
  --
  -- THE SCAN IS NOT RESTRICTED TO DEFINERS (ratchet R1 finding 4). A `p.prosecdef`
  -- filter leaves an escape hatch that defeats the whole closed set: an innocuously
  -- named SECURITY INVOKER helper reads wiki_pages (or calls get_wiki_page), an
  -- authority DEFINER is patched to call that helper, and the definer's own body then
  -- contains no wiki token at all. Both halves pass a definers-only scan — yet when the
  -- definer invokes the invoker helper, current_user is still the DEFINER's owner, so
  -- the helper runs with the definer owner's authority and a wiki-derived veto is fully
  -- restored. Scanning EVERY clara function (definer or not) is the conservative closure:
  -- an invoker helper cannot be reached from a definer without existing, and if it
  -- exists it is scanned. The baseline is clean — the only clara functions matching
  -- either regex are exactly the twelve whitelisted ones. ----
  v_wl := array[
    'clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)',
    'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)',
    'clara.record_wiki_source_ingest(uuid,uuid,text,text)',
    'clara.retire_wiki_page(uuid,text,text)',
    'clara.set_wiki_synthesis_hold(uuid,text,text)',
    'clara.clear_wiki_synthesis_hold(uuid,text)',
    'clara.get_wiki_page(uuid,text)',
    'clara.list_wiki_pages(uuid)',
    'clara.get_context_pack(uuid,text)',
    'clara.run_client_lint(uuid,text)',
    'clara.run_lint_all(text)',
    'clara.mark_wiki_citations_stale(uuid,uuid,text,text)'
  ];
  select coalesce(array_agg(s::regprocedure::oid), '{}') into v_wl_oids from unnest(v_wl) s;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'
     and not (p.oid = any(v_wl_oids))
     and (p.prosrc ~* v_relrx or p.prosrc ~* v_callrx);
  if v_bad is not null then
    raise exception '0019 wiki authority/call-edge leaked into non-whitelisted function(s): %',
      v_bad using errcode = 'CLR10';
  end if;

  -- ---- §9 PLAN COVERAGE (EXPLAIN-backed). enable_seqscan is discouraged LOCALLY
  -- for the probe (set_config(..., true) = transaction-local, restored below), so a
  -- Seq Scan on wiki_page_citations / wiki_page_refs proves the intended index is
  -- NOT USABLE rather than merely not preferred. Plans over other relations are
  -- irrelevant here and are not asserted. ----
  perform set_config('enable_seqscan', 'off', true);
  foreach v_txt in array array[
    -- (1) writer + catch-up scan, citations
    $q$select 1 from clara.wiki_page_citations wc
         join clara.wiki_pages wp on wp.current_version_id=wc.version_id
           and wp.client_id=wc.client_id and wp.firm_id=wc.firm_id
        where wp.state='active' and wp.client_id='00000000-0000-0000-0000-000000000001'::uuid
          and wc.document_id='00000000-0000-0000-0000-000000000002'::uuid
          and wc.stale_at is null$q$,
    -- (1) writer + catch-up scan, refs
    $q$select 1 from clara.wiki_page_refs wr
         join clara.wiki_pages wp on wp.id=wr.page_id
           and wp.client_id=wr.client_id and wp.firm_id=wr.firm_id
        where wp.state='active' and wp.client_id='00000000-0000-0000-0000-000000000001'::uuid
          and wr.ref_kind='document'
          and wr.document_id='00000000-0000-0000-0000-000000000002'::uuid
          and wr.stale_at is null$q$,
    -- (2)+(3) the stale-marked lookup behind has_stale_sources / the lint scan
    $q$select 1 from clara.wiki_page_citations sc
        where sc.version_id='00000000-0000-0000-0000-000000000003'::uuid
          and sc.stale_at is not null$q$,
    $q$select 1 from clara.wiki_page_refs sr
        where sr.page_id='00000000-0000-0000-0000-000000000004'::uuid
          and sr.ref_kind='document' and sr.stale_at is not null$q$,
    -- (2) the page-join keys the INVERTED lint scan drives on
    $q$select 1 from clara.wiki_page_citations wc
        where wc.version_id='00000000-0000-0000-0000-000000000003'::uuid$q$,
    $q$select 1 from clara.wiki_page_refs wr
        where wr.page_id='00000000-0000-0000-0000-000000000004'::uuid$q$
  ] loop
    execute 'explain (format json) ' || v_txt into v_def;
    v_plan := (v_def::jsonb) -> 0 -> 'Plan';
    -- The ROOT node is checked directly (a single-relation probe's top node IS the
    -- scan); `.**` then covers every descendant.
    if (v_plan ->> 'Node Type' = 'Seq Scan'
          and v_plan ->> 'Relation Name' in ('wiki_page_citations', 'wiki_page_refs'))
       or exists(select 1
           from jsonb_path_query(v_plan, '$.**?(@."Node Type" == "Seq Scan")') sn
           where sn ->> 'Relation Name' in ('wiki_page_citations', 'wiki_page_refs')) then
      raise exception '0019 plan coverage: a sequential scan of a wiki reference relation remains reachable for: %',
        v_txt using errcode = 'CLR10';
    end if;
  end loop;
  perform set_config('enable_seqscan', 'on', true);

  -- ===================================================================
  -- FUNCTIONAL PROBE A (§5) — the monotonic guard, with the SIX negative
  -- assertions. Fixtures are minted inside the block and discarded on unwind.
  -- ===================================================================
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid();
    v_d := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, '0019 probe A firm');
    insert into clara.users(id, display_name) values (v_u, '0019 probe A user');
    insert into clara.clients(id, firm_id, name, status)
      values (v_c, v_f, '0019 probe A client', 'active');
    insert into clara.documents(id, firm_id, sha256, original_filename)
      values (v_d, v_f, repeat('a', 64), 'probe-a.pdf');
    insert into clara.document_filings(firm_id, document_id, client_id, filed_by, basis)
      values (v_f, v_d, v_c, v_u, 'legacy-0007');

    v_content := '# 0019 probe A v1';
    v_sha := encode(sha256(convert_to(v_content, 'UTF8')), 'hex');
    v_key := 'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md';
    perform clara.publish_wiki_page_version(v_c, 'profile', 'profile', 'Probe A', null,
      v_content, v_sha, v_key,
      jsonb_build_array(jsonb_build_object('source_kind', 'document', 'document_id', v_d)),
      '[]'::jsonb, 'deterministic', null, 500, 'probe-a-1');

    v_content := '# 0019 probe A v2 (stale seq)';
    v_sha := encode(sha256(convert_to(v_content, 'UTF8')), 'hex');
    v_key := 'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md';
    v_probe_ok := false;
    begin
      perform clara.publish_wiki_page_version(v_c, 'profile', 'profile', 'Probe A', null,
        v_content, v_sha, v_key,
        jsonb_build_array(jsonb_build_object('source_kind', 'document', 'document_id', v_d)),
        '[]'::jsonb, 'deterministic', null, 500, 'probe-a-2');
    exception when sqlstate 'CLR32' then
      get stacked diagnostics v_txt = pg_exception_detail;
      v_probe_ok := position('stale_projected_from_seq' in coalesce(v_txt, '')) > 0;
    end;
    if not v_probe_ok then
      raise exception '0019 functional A: a stale-seq supersede was NOT refused CLR32/stale_projected_from_seq'
        using errcode = 'CLR10';
    end if;
    -- (1) no new version row, and (2) the prior version is still 'published'.
    if (select count(*) from clara.wiki_page_versions where client_id = v_c) <> 1
       or not exists(select 1 from clara.wiki_page_versions
            where client_id = v_c and state = 'published') then
      raise exception '0019 functional A: the refused supersede left a version behind'
        using errcode = 'CLR10';
    end if;
    -- (3) no audit_log row for the refused attempt.
    if exists(select 1 from clara.audit_log
        where firm_id = v_f and fn = 'publish_wiki_page_version'
          and args ->> 'op_key' = 'probe-a-2') then
      raise exception '0019 functional A: the refused supersede wrote an audit row'
        using errcode = 'CLR10';
    end if;
    -- (4) no wiki_log publish/supersede row beyond the first publication.
    if (select count(*) from clara.wiki_log
        where client_id = v_c and action in ('publish', 'supersede')) <> 1 then
      raise exception '0019 functional A: the refused supersede wrote a wiki_log row'
        using errcode = 'CLR10';
    end if;
    -- (5) no second wiki.page_published event.
    if (select count(*) from clara.domain_events
        where firm_id = v_f and event_type = 'wiki.page_published') <> 1 then
      raise exception '0019 functional A: the refused supersede emitted a publication event'
        using errcode = 'CLR10';
    end if;
    -- (6) NO op_receipts row AT ALL — stronger than "no completed receipt":
    -- _reserve_op inserts the reservation BEFORE the core runs (0004:48-52), so the
    -- raise rolls the reservation back too.
    if exists(select 1 from clara.op_receipts
        where firm_id = v_f and fn = 'publish_wiki_page_version' and op_key = 'probe-a-2') then
      raise exception '0019 functional A: the refused supersede left an op_receipts reservation'
        using errcode = 'CLR10';
    end if;
    -- NULL-safe: a null p_projected_from_seq still publishes over the same prior.
    v_content := '# 0019 probe A v3 (null seq)';
    v_sha := encode(sha256(convert_to(v_content, 'UTF8')), 'hex');
    v_key := 'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md';
    perform clara.publish_wiki_page_version(v_c, 'profile', 'profile', 'Probe A', null,
      v_content, v_sha, v_key,
      jsonb_build_array(jsonb_build_object('source_kind', 'document', 'document_id', v_d)),
      '[]'::jsonb, 'deterministic', null, null, 'probe-a-3');
    if (select count(*) from clara.wiki_page_versions where client_id = v_c) <> 2 then
      raise exception '0019 functional A: the guard is not NULL-safe' using errcode = 'CLR10';
    end if;

    raise exception 'clara_0019_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;  -- expected: fixtures discarded
  end;

  -- ===================================================================
  -- FUNCTIONAL PROBE B (§3) — mark, then re-mark with a FRESH op key:
  -- idempotency case (b) returns {0,0,'noop'} and writes no second
  -- wiki_log/audit_log row; the first call's stale_at is preserved.
  -- ===================================================================
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid();
    v_d := gen_random_uuid(); v_pg := gen_random_uuid(); v_ver := gen_random_uuid();
    v_cit := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, '0019 probe B firm');
    insert into clara.users(id, display_name) values (v_u, '0019 probe B user');
    insert into clara.clients(id, firm_id, name, status)
      values (v_c, v_f, '0019 probe B client', 'active');
    insert into clara.documents(id, firm_id, sha256, original_filename)
      values (v_d, v_f, repeat('b', 64), 'probe-b.pdf');
    v_sha := repeat('c', 64);
    insert into clara.wiki_pages(id, firm_id, client_id, slug, page_kind, title)
      values (v_pg, v_f, v_c, 'profile', 'profile', 'Probe B');
    insert into clara.wiki_page_versions(id, page_id, firm_id, client_id, version_n,
        content, content_sha256, storage_key, size_bytes, state, synthesis)
      values (v_ver, v_pg, v_f, v_c, 1, 'probe b', v_sha,
        'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md',
        7, 'published', 'deterministic');
    update clara.wiki_pages set current_version_id = v_ver where id = v_pg;
    insert into clara.wiki_page_citations(id, version_id, firm_id, client_id,
        source_kind, document_id)
      values (v_cit, v_ver, v_f, v_c, 'document', v_d);
    insert into clara.wiki_page_refs(page_id, firm_id, client_id, ref_kind, document_id)
      values (v_pg, v_f, v_c, 'document', v_d);

    v_r := clara.mark_wiki_citations_stale(v_c, v_d, 'source_filing_retired', 'probe-b-1');
    if v_r ->> 'status' <> 'marked'
       or (v_r ->> 'citations_marked')::int <> 1
       or (v_r ->> 'refs_marked')::int <> 1 then
      raise exception '0019 functional B: the first mark did not mark both relations (got %)',
        v_r::text using errcode = 'CLR10';
    end if;
    select stale_at into v_stale from clara.wiki_page_citations where id = v_cit;
    if v_stale is null then
      raise exception '0019 functional B: the citation was not marked' using errcode = 'CLR10';
    end if;

    v_r := clara.mark_wiki_citations_stale(v_c, v_d, 'source_filing_retired', 'probe-b-2');
    if v_r ->> 'status' <> 'noop'
       or (v_r ->> 'citations_marked')::int <> 0
       or (v_r ->> 'refs_marked')::int <> 0 then
      raise exception '0019 functional B: a fresh-key re-mark was not a clean noop (got %)',
        v_r::text using errcode = 'CLR10';
    end if;
    if (select stale_at from clara.wiki_page_citations where id = v_cit)
         is distinct from v_stale then
      raise exception '0019 functional B: the re-mark moved the original stale_at'
        using errcode = 'CLR10';
    end if;
    if (select count(*) from clara.wiki_log
          where client_id = v_c and action = 'mark_stale') <> 1
       or (select count(*) from clara.audit_log
          where firm_id = v_f and fn = 'mark_wiki_citations_stale') <> 1 then
      raise exception '0019 functional B: a noop wrote an audit / wiki_log row'
        using errcode = 'CLR10';
    end if;
    -- amendment 4: a mark appends NOTHING to the spine.
    if exists(select 1 from clara.domain_events where firm_id = v_f) then
      raise exception '0019 functional B: a stale mark appended a domain event'
        using errcode = 'CLR10';
    end if;
    -- an unrecognised reason is a typed refusal.
    v_probe_ok := false;
    begin
      perform clara.mark_wiki_citations_stale(v_c, v_d, 'not_a_reason', 'probe-b-3');
    exception when sqlstate 'CLR10' then v_probe_ok := true;
    end;
    if not v_probe_ok then
      raise exception '0019 functional B: an unrecognised reason was accepted'
        using errcode = 'CLR10';
    end if;

    raise exception 'clara_0019_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;
  end;

  -- ===================================================================
  -- FUNCTIONAL PROBE C (§1) — the inversion itself: retiring a filing that HAS a
  -- live wiki citation now SUCCEEDS and emits document.filing_retired. The human
  -- lane needs claims, so request.jwt.claims is set TRANSACTION-LOCALLY and is
  -- restored when the subtransaction unwinds.
  -- ===================================================================
  begin
    v_f := gen_random_uuid(); v_u := gen_random_uuid(); v_c := gen_random_uuid();
    v_d := gen_random_uuid(); v_pg := gen_random_uuid(); v_ver := gen_random_uuid();
    insert into clara.firms(id, name) values (v_f, '0019 probe C firm');
    insert into clara.users(id, display_name) values (v_u, '0019 probe C user');
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_f, v_u, 'bookkeeper', 'active');
    insert into clara.clients(id, firm_id, name, status)
      values (v_c, v_f, '0019 probe C client', 'active');
    insert into clara.documents(id, firm_id, sha256, original_filename)
      values (v_d, v_f, repeat('d', 64), 'probe-c.pdf');
    insert into clara.document_filings(id, firm_id, document_id, client_id, filed_by, basis)
      values (gen_random_uuid(), v_f, v_d, v_c, v_u, 'legacy-0007');
    select id, revision_token into v_fil, v_rev from clara.document_filings
      where document_id = v_d and client_id = v_c;
    v_sha := repeat('e', 64);
    insert into clara.wiki_pages(id, firm_id, client_id, slug, page_kind, title)
      values (v_pg, v_f, v_c, 'profile', 'profile', 'Probe C');
    insert into clara.wiki_page_versions(id, page_id, firm_id, client_id, version_n,
        content, content_sha256, storage_key, size_bytes, state, synthesis)
      values (v_ver, v_pg, v_f, v_c, 1, 'probe c', v_sha,
        'firms/' || v_f::text || '/wiki/' || v_c::text || '/' || v_sha || '.md',
        7, 'published', 'deterministic');
    update clara.wiki_pages set current_version_id = v_ver where id = v_pg;
    insert into clara.wiki_page_citations(version_id, firm_id, client_id, source_kind, document_id)
      values (v_ver, v_f, v_c, 'document', v_d);

    select coalesce(max(seq), 0) into v_seq0 from clara.domain_events where firm_id = v_f;
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_u)::text, true);
    v_r := clara.retire_document_filing(v_fil, '0019 probe C', v_rev, 'probe-c-1');
    perform set_config('request.jwt.claims', '', true);
    if v_r ->> 'status' <> 'retired' then
      raise exception '0019 functional C: retirement under a live wiki citation did not succeed (got %)',
        v_r::text using errcode = 'CLR10';
    end if;
    if not exists(select 1 from clara.document_filings
        where id = v_fil and retired_at is not null) then
      raise exception '0019 functional C: the filing was not retired' using errcode = 'CLR10';
    end if;
    select count(*) into v_n from clara.domain_events
      where firm_id = v_f and seq > v_seq0 and event_type = 'document.filing_retired';
    if v_n <> 1 then
      raise exception '0019 functional C: expected exactly one document.filing_retired, got %',
        v_n using errcode = 'CLR10';
    end if;
    -- the citation is untouched by the authority domain — the wiki converges by
    -- MARKING, driven by the retirement EVENT (§4), never inside the authority txn.
    if exists(select 1 from clara.wiki_page_citations
        where version_id = v_ver and stale_at is not null) then
      raise exception '0019 functional C: authority mutated wiki state in-band'
        using errcode = 'CLR10';
    end if;

    raise exception 'clara_0019_probe_rollback' using errcode = 'CLR99';
  exception
    when sqlstate 'CLR99' then null;
  end;
  perform set_config('request.jwt.claims', '', true);
end
$tail$;
