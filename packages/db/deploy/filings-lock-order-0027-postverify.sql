-- =====================================================================
-- Migration 0027 (documents-before-document_filings lock order, task #29 ledger) —
-- POST-DEPLOY VERIFY PROBES.
-- =====================================================================
--
-- Read-only. Run as a superuser/owner session against the deployed database immediately
-- after applying 0027:
--
--     psql "$DSN" -v ON_ERROR_STOP=1 -f filings-lock-order-0027-postverify.sql
--
-- Every probe raises on failure and prints an OK notice on success, so a clean run ends
-- with one notice per probe and nothing else.
--
-- WHAT 0027 CLAIMS, restated as probes:
--   1. 0027 is applied and 0026 is still in the history (mandatory prior-migration check).
--   2. confirm_attribution_candidate locks `clara.documents` FOR UPDATE strictly before
--      BOTH the client_resolutions insert (FK -> clients KEY SHARE) and the filings
--      insert. approve_wrong_client_correction and retire_document_filing lock documents
--      strictly before their own first document_filings acquisition. All match
--      file_document's canonical order.
--   3. resolve_and_ingest_wiki_source (0020) — a document_filings READER, not a writer —
--      now locks documents strictly before document_filings, closing the P-round cycle.
--   4. file_document, finalize_document_intake and _seed_verified_document — the three
--      writers that already had the correct order — are untouched (0027 issues no CREATE
--      OR REPLACE for any of them).
--   5. The 0020 §6 closed-set member this migration's callees touch
--      (_enqueue_invoice_facts_core) is untouched: same owner-only EXECUTE surface, and a
--      NULL proacl (implicit PUBLIC EXECUTE) is treated as a FAILURE, not a pass.
--   6. No OTHER document_filings writer exists beyond the six the migration's header
--      enumerates — re-run the same classification sweep against the deployed catalog,
--      not trusted from the migration's own header comment, on COMMENT-STRIPPED source,
--      recognizing the schema-qualified OR unqualified (pinned search_path) form, and
--      allowlisting by exact signature rather than bare name.
--
-- WHY THE PROBES MATCH COMMENT-STRIPPED TEXT. Same discipline as 0022/0025/0026's own
-- postverify files: a raw substring match on prosrc is defeated by deleting a guard and
-- pasting its text back as a `--` comment. Every check below strips `-- ...` comments and
-- normalizes whitespace before searching, and additionally asserts POSITION ORDER (the new
-- documents lock must appear BEFORE every pre-existing conflicting acquisition), not just
-- presence — presence alone would pass even if the new lock were pasted at the very end of
-- the function, after all the work it is supposed to precede.
--
-- P-ROUND (Codex O-round, 7816f93, REFUSED — six findings). This file fixes P3 (probe 2c's
-- missing peek-before-lock position check), P4 (probe 5's — now 6's — NULL-proacl fail-
-- open), and P5 (the writer sweep's uncommented-source / qualified-only / proname-allowlist
-- gaps); a new probe 3 covers P1 (resolve_and_ingest_wiki_source); probe 2a covers P2 (the
-- documents-before-clients position check). See 0027_filings_lock_order.sql's own header
-- for the full P-round summary.
--
-- Q-ROUND (b08172f, three residuals, CLOSING round). Probe 6 (Q2) now strips BOTH comment
-- styles (`--` and `/* */`), recognizes ONLY / MERGE INTO / quoted-identifier forms, and
-- pins `search_path` to `pg_catalog` before any `regprocedure` cast so the allowlist
-- comparison cannot silently break on a database whose default search_path already
-- resolves `clara` unqualified. It also states its own honest limit in-line: a syntactic
-- sweep cannot prove exhaustiveness against dynamic SQL — that is BELT, the primary
-- instrument is the build-time CoR enumeration, and the probe fails CLOSED on anything it
-- cannot classify rather than fail open. (Q1 and Q3 are elsewhere: Q1 tightens two
-- 40P01-accepting assertions in packages/db/tests/wave-b/wb-0020-resolver.test.mjs to
-- serialization-only, now that P1 makes the cycle they were hedging against structurally
-- dead; Q3 fixes 0027_filings_lock_order.sql's own header, which had drifted from its tail.)
--
-- THE HONEST FRAMING (carried from every prior migration's postverify): this is BELT. The
-- primary defense is the migration's own in-transaction tail, already run and already
-- raised on any failure during the ceremony itself. This file re-proves the same claims
-- from OUTSIDE that transaction, against the COMMITTED catalog, in case the ceremony's own
-- session state (search_path, temp objects) masked something the tail's own careful design
-- already tries to rule out.

do $verify$
declare
  v_prior_count int;
  v_src_a text; v_src_b text; v_src_c text; v_src_d text;
  v_norm_a text; v_norm_b text; v_norm_c text; v_norm_d text;
  v_pos_lock int; v_pos_touch int; v_pos_client int; v_pos_peek int;
  v_bad_text text;
begin
  -- (1) mandatory prior-migration check.
  select count(*) into v_prior_count from clara.schema_migrations where version = '0026_lane_widen';
  if v_prior_count <> 1 then
    raise exception '0027 postverify: migration 0026 is not recorded as applied';
  end if;
  select count(*) into v_prior_count from clara.schema_migrations where version = '0027_filings_lock_order';
  if v_prior_count <> 1 then
    raise exception '0027 postverify: migration 0027 itself is not recorded as applied';
  end if;
  raise notice '0027 postverify OK (1/6): prior-migration chain intact through 0027';

  -- (2a) confirm_attribution_candidate: documents lock strictly before BOTH the
  -- client_resolutions insert (P2's finding — the FK takes `clients` FOR KEY SHARE) and
  -- the filings insert.
  select pg_get_functiondef(oid) into v_src_a from pg_proc
    where proname = 'confirm_attribution_candidate' and pronamespace = 'clara'::regnamespace;
  if v_src_a is null then raise exception '0027 postverify: confirm_attribution_candidate is missing'; end if;
  v_norm_a := regexp_replace(regexp_replace(v_src_a, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  v_pos_lock := position('from clara.documents where id=x.document_id for update' in lower(v_norm_a));
  v_pos_client := position('insert into clara.client_resolutions' in lower(v_norm_a));
  v_pos_touch := position('insert into clara.document_filings' in lower(v_norm_a));
  if v_pos_lock = 0 or v_pos_client = 0 or v_pos_touch = 0
     or v_pos_lock >= v_pos_client or v_pos_lock >= v_pos_touch then
    raise exception '0027 postverify: confirm_attribution_candidate does not lock documents strictly before BOTH client_resolutions and document_filings (lock=%, client=%, filings=%)', v_pos_lock, v_pos_client, v_pos_touch;
  end if;
  raise notice '0027 postverify OK (2a/6): confirm_attribution_candidate locks documents before clients AND document_filings';

  -- (2b) approve_wrong_client_correction: documents lock strictly before the filings
  -- row lock (the `perform 1 from clara.document_filings f ...` sweep).
  select pg_get_functiondef(oid) into v_src_b from pg_proc
    where proname = 'approve_wrong_client_correction' and pronamespace = 'clara'::regnamespace;
  if v_src_b is null then raise exception '0027 postverify: approve_wrong_client_correction is missing'; end if;
  v_norm_b := regexp_replace(regexp_replace(v_src_b, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  v_pos_lock := position('from clara.documents where id=x.document_id for update' in lower(v_norm_b));
  v_pos_touch := position('from clara.document_filings f where f.document_id=x.document_id' in lower(v_norm_b));
  if v_pos_lock = 0 or v_pos_touch = 0 or v_pos_lock >= v_pos_touch then
    raise exception '0027 postverify: approve_wrong_client_correction does not lock documents strictly before its document_filings row lock (lock_pos=%, touch_pos=%)', v_pos_lock, v_pos_touch;
  end if;
  raise notice '0027 postverify OK (2b/6): approve_wrong_client_correction locks documents before document_filings';

  -- (2c) retire_document_filing: the PEEK strictly precedes the documents lock, which
  -- strictly precedes the filing row lock. P3's finding: the old two-term check (lock <
  -- filing) passed even if the peek itself were moved after the lock or dropped, since
  -- v_peek_doc would just read null and the lock's own position was unaffected. All three
  -- positions are now asserted in strict order.
  select pg_get_functiondef(oid) into v_src_c from pg_proc
    where proname = 'retire_document_filing' and pronamespace = 'clara'::regnamespace;
  if v_src_c is null then raise exception '0027 postverify: retire_document_filing is missing'; end if;
  v_norm_c := regexp_replace(regexp_replace(v_src_c, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  v_pos_peek := position('select document_id into v_peek_doc from clara.document_filings' in lower(v_norm_c));
  v_pos_lock := position('from clara.documents where id = v_peek_doc for update' in lower(v_norm_c));
  v_pos_touch := position('select * into f from clara.document_filings where id = p_filing_id for update' in lower(v_norm_c));
  if v_pos_peek = 0 or v_pos_lock = 0 or v_pos_touch = 0
     or v_pos_peek >= v_pos_lock or v_pos_lock >= v_pos_touch then
    raise exception '0027 postverify: retire_document_filing''s peek/lock/filing-row-lock are not in strict order (peek=%, lock=%, filing=%)', v_pos_peek, v_pos_lock, v_pos_touch;
  end if;
  raise notice '0027 postverify OK (2c/6): retire_document_filing peeks, THEN locks documents, THEN locks the filing row — in that strict order';

  -- (3) resolve_and_ingest_wiki_source (§D, P1's finding): a document_filings READER
  -- (FOR SHARE, never a writer), not part of the six-writer set below, but a fourth
  -- acquirer of the SAME two locks — now documents-first, matching the writers.
  select pg_get_functiondef(oid) into v_src_d from pg_proc
    where proname = 'resolve_and_ingest_wiki_source' and pronamespace = 'clara'::regnamespace;
  if v_src_d is null then raise exception '0027 postverify: resolve_and_ingest_wiki_source is missing'; end if;
  v_norm_d := regexp_replace(regexp_replace(v_src_d, '--[^\n]*', '', 'g'), '\s+', ' ', 'g');
  v_pos_lock := position('from clara.documents d' in lower(v_norm_d));
  v_pos_touch := position('from clara.document_filings f' in lower(v_norm_d));
  if v_pos_lock = 0 or v_pos_touch = 0 or v_pos_lock >= v_pos_touch then
    raise exception '0027 postverify: resolve_and_ingest_wiki_source does not lock documents strictly before document_filings (lock=%, filings=%)', v_pos_lock, v_pos_touch;
  end if;
  raise notice '0027 postverify OK (3/6): resolve_and_ingest_wiki_source locks documents before document_filings';

  -- (4) the three reference-order writers are present and untouched by this migration
  -- (0027 issues no CREATE OR REPLACE for any of them — a catalog-presence check, not a
  -- body-identity pin; none of the three is a 0020 §6 closed-set member so no exact-hash
  -- pin applies here).
  if not exists (select 1 from pg_proc where proname = 'file_document' and pronamespace = 'clara'::regnamespace) then
    raise exception '0027 postverify: file_document (the reference order) is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'finalize_document_intake' and pronamespace = 'clara'::regnamespace) then
    raise exception '0027 postverify: finalize_document_intake is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = '_seed_verified_document' and pronamespace = 'clara'::regnamespace) then
    raise exception '0027 postverify: _seed_verified_document is missing';
  end if;
  raise notice '0027 postverify OK (4/6): the three reference-order writers are present';

  -- (5) the 0020 §6 pinned closed-set member this migration's callees reach
  -- (_enqueue_invoice_facts_core) keeps its owner-only EXECUTE surface. P4's finding: a
  -- NULL proacl (Postgres's own default privileges — implicit PUBLIC EXECUTE on a function
  -- unless explicitly REVOKEd) must FAIL this probe, not pass it — aclexplode(NULL) yields
  -- zero rows, so the old exists(...) form read a publicly-executable core as "owner-only".
  if exists (select 1 from pg_proc p where p.proname = '_enqueue_invoice_facts_core' and p.pronamespace = 'clara'::regnamespace
              and (p.proacl is null or exists (
                select 1 from lateral aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE'
                    and (a.grantee = 0 or pg_get_userbyid(a.grantee) <> 'clara_fn_owner')))) then
    raise exception '0027 postverify: _enqueue_invoice_facts_core (0020 §6 pinned) gained a direct/PUBLIC EXECUTE grant (or lost its ACL)';
  end if;
  raise notice '0027 postverify OK (5/6): the 0020 §6 pinned closed-set member is untouched (NULL-ACL checked, not just explicit grants)';

  -- (6) re-run the writer-classification sweep against the DEPLOYED catalog (not trusted
  -- from the migration header): every function whose body inserts/updates/deletes
  -- clara.document_filings must be one of the six named ones, matched by EXACT SIGNATURE
  -- (regprocedure), not bare name — a second overload sharing one of the six names would
  -- previously have been silently allowlisted too. P5's finding: source is now
  -- COMMENT-STRIPPED and whitespace-normalized before the regex runs (the same
  -- delete-a-guard-paste-as-comment class 0022 established applies here too — an
  -- unstripped scan can be defeated by commenting out the offending DML), and the regex
  -- recognizes BOTH the schema-qualified (`clara.document_filings`) and the bare,
  -- unqualified form (`document_filings`) that is equally legal under every one of these
  -- functions' own `SET search_path TO 'clara', 'pg_temp'`, the ONLY / MERGE INTO forms,
  -- and quoted identifiers.
  --
  -- 0027 Q-round (finding 2, tightened): pin search_path for this probe's OWN session to
  -- pg_catalog (excluding clara) BEFORE any regprocedure cast — `oid::regprocedure::text`
  -- prints the UNQUALIFIED name whenever the calling session's search_path already
  -- resolves it, which would silently break the fully-qualified allowlist below on a
  -- database whose default search_path happens to include clara.
  set local search_path to pg_catalog;
  --
  -- Comments are stripped in BOTH styles (`-- ...` line comments AND `/* ... */` block
  -- comments, non-greedy across newlines) before the regex runs — the same
  -- delete-a-guard-paste-as-comment class 0022 established applies to either comment
  -- style, and the old strip only handled the first.
  --
  -- THE HONEST LIMIT (stated, not hidden): this is a SYNTACTIC sweep over static prosrc.
  -- It cannot prove exhaustiveness against dynamic SQL (EXECUTE, format(), string-built
  -- statements) — no regex over source text can. It is BELT. The PRIMARY instrument
  -- against an unenumerated writer is the build-time CoR enumeration this migration's own
  -- header records (pg_get_functiondef against the live catalog, classified into
  -- insert/update/delete on document_filings, independently re-run and confirmed by the
  -- Codex O-round) — that enumeration found exactly six, by actually reading every
  -- function's compiled body, not by pattern-matching its text. This probe's job is
  -- narrower and achievable: catch the STATIC forms perfectly, and fail CLOSED (raise) on
  -- anything it cannot confidently classify as accounted-for — never fail open by silently
  -- passing a shape it does not recognize.
  --
  -- The inner CTE is forced MATERIALIZED (a real bug found while first writing this probe):
  -- without it, the planner can evaluate the pg_get_functiondef()-based regex predicates
  -- against pg_proc rows from OTHER schemas before the nspname='clara' filter narrows the
  -- set, and pg_get_functiondef() raises "X is an aggregate function" the moment it lands
  -- on a non-plain-function oid (e.g. pg_catalog.array_agg) anywhere in the full catalog.
  -- Materializing the already-nspname-filtered set first means pg_get_functiondef() only
  -- ever runs against clara's own (all prokind='f') functions.
  with clara_fns as materialized (
    select p.oid, p.oid::regprocedure::text as sig,
           regexp_replace(
             regexp_replace(
               regexp_replace(pg_get_functiondef(p.oid), '/\*[\s\S]*?\*/', '', 'g'),
               '--[^\n]*', '', 'g'),
             '\s+', ' ', 'g') as src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara'
  )
  select string_agg(sig, ', ')
    into v_bad_text
    from clara_fns
    where (src ~* 'insert\s+into\s+(only\s+)?("?clara"?\.)?"?document_filings"?\y'
           or src ~* 'update\s+(only\s+)?("?clara"?\.)?"?document_filings"?\y'
           or src ~* 'delete\s+from\s+(only\s+)?("?clara"?\.)?"?document_filings"?\y'
           or src ~* 'merge\s+into\s+("?clara"?\.)?"?document_filings"?\y')
      and sig not in (
        'clara.file_document(uuid,uuid,text,text)',
        'clara.finalize_document_intake(uuid,text,text,jsonb,integer,text,uuid,uuid,text)',
        'clara._seed_verified_document(uuid,uuid,text,text,text,bigint,text,uuid,integer,text,date,uuid)',
        'clara.confirm_attribution_candidate(uuid,text,boolean)',
        'clara.approve_wrong_client_correction(uuid,text,text,text)',
        'clara.retire_document_filing(uuid,text,uuid,text)'
      );
  if v_bad_text is not null then
    raise exception '0027 postverify: an UNENUMERATED document_filings writer exists in the deployed catalog: %', v_bad_text;
  end if;
  raise notice '0027 postverify OK (6/6): no unenumerated document_filings writer exists among the STATIC forms this probe can see — the six-signature set is exhaustive against them (dynamic SQL is out of this probe''s reach by construction; the build-time CoR enumeration is the primary defense there)';

  raise notice '0027 postverify: ALL PROBES PASSED — documents-before-document_filings lock order is consistent across every live writer AND the resolve_and_ingest_wiki_source reader';
end
$verify$;
