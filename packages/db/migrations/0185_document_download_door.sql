-- 0185_document_download_door — #620 (以最小权限保管、查看和下载客户来源资料): THE SUCCESSOR
-- SOURCE-DOCUMENT BYTE DOOR.
-- =====================================================================================
-- Spec of record: issue #620 AC2/AC5 — "allowed own-client reads, denied cross-firm/client/object
-- access, revoked membership", and "every successful source read is receipted". Domain words:
-- CONTEXT.md — "Document", "Filing", "Custody". Builds on 0007 (clara.documents,
-- clara.document_filings) and 0011 (the v1 door); copies its SHAPE from
-- 0162_fs7_e2_artifact_download_door.sql (the artifact byte door: typed refusals, one
-- not-found shape, an egress audit line, clara_runtime-only EXECUTE).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE new function —
-- clara.get_document_for_human_read_v2(uuid,uuid,uuid,text) — which is the v1 door plus the three
-- things v1 never had: a CLIENT SCOPE read off the document's ACTIVE filing, a typed
-- CUSTODY-PENDING refusal instead of a null storage_path, and an EGRESS AUDIT LINE on every
-- success. No new table, no new column, no altered relation, no changed row, and NO
-- `create or replace` of any live body anywhere in this file.
--
-- =====================================================================================
-- WHY A SUCCESSOR AND NOT A RECUT OF v1 (#620 contract decision 9).
--
-- clara.get_document_for_human_read(uuid,uuid)'s exact ACL row is pinned by a migration-tail
-- assertion inside 0011 itself (0011_daily_loop.sql:4238 —
-- ('clara.get_document_for_human_read(uuid,uuid)',false,false,false,true)) and rostered twice in
-- the db battery (packages/db/tests/rig-meta.mjs, packages/db/tests/wave-a-helpers.mjs). Recutting
-- its signature or its grants means moving three pins in one change and leaves no way to cut the
-- route over gradually. A SUCCESSOR door leaves every one of those pins true, and this file's own
-- tail proves it: v1's prosrc is re-read and compared to a LITERAL sha-256 measured before this
-- file was written, and its EXECUTE grantee set is compared to a literal string. v1's retirement is
-- a later migration, after the route has been on v2 in production.
--
-- =====================================================================================
-- THE REFUSAL ORDER, AND WHY THE PURPOSE IS CHECKED FIRST.
--
--   1. p_purpose not in ('preview','download')      -> CLR10 invalid_purpose
--   2. p_document / p_user null                     -> CLR11 document_not_found
--   3. no document, OR no ACTIVE membership in the  -> CLR11 document_not_found  (ONE shape)
--      document's firm, OR p_client given and no
--      active filing (document, p_client) in it
--   4. own-firm, in scope, but storage_path or      -> CLR13 custody_pending
--      bytes_verified_at is null
--   5. otherwise: _audit, then the row.
--
-- STEP 1 IS FIRST FOR THE NO-EXISTENCE-ORACLE LAW, not for tidiness. If existence were decided
-- first, then "invalid purpose + a document you may read" would answer CLR10 while "invalid purpose
-- + a document that does not exist" answered CLR11 — and a caller who can send an arbitrary purpose
-- string would have a two-answer probe for whether a document id is real. Validating the purpose
-- before anything is read makes that probe answer CLR10 either way. (The route never sends an
-- invalid purpose: packages/runtime/src/documentRoutes.ts validates `disposition` and answers 400
-- before it opens a transaction. This wall is for every other caller the grant may ever reach.)
--
-- STEP 3 COLLAPSES THREE FACTS INTO ONE ANSWER, exactly as v1 does and as 0162's gate does:
-- absent, another firm's, and "yours but filed under a different client" are indistinguishable —
-- same SQLSTATE, same message, same detail. Step 4 is the one refusal a caller is ENTITLED to tell
-- apart, because it is about THEIR OWN document and the fix (wait for verification, or re-upload)
-- is theirs to take; it is a STATE conflict (CLR13, the estate's 409 class — 0006's own header) and
-- never a not-found.
--
-- THE CLIENT SCOPE IS THE ACTIVE FILING, AND NOTHING ELSE (#620 contract decision 3).
-- clara.documents lost its client_id column at 0007:1106; the document->client relation lives in
-- clara.document_filings, whose ACTIVE row is `retired_at is null` (uq_document_filing_active).
-- No per-user client ACL is invented here — none exists in the estate, and inventing one inside a
-- read door is how an authorization model comes to have two of them.
--
-- PLAN DISCIPLINE. `set plan_cache_mode = force_custom_plan`, the 0183 discipline: this body binds
-- the caller's user id and the document's firm into multi-tenant predicates over clara.documents,
-- clara.firm_memberships and clara.document_filings, and a generic plan built for the per-firm
-- average is what flips a pooled connection's sixth call onto a Nested Loop over the whole table.
-- The tail asserts the clause is on the shipped function, from proconfig rather than from prosrc.
-- =====================================================================================

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- =====================================================================================
-- 0. PRESTATE. Every premise this file rests on, measured before the first write.
-- =====================================================================================
create temp table _d620_prestate (k text primary key, v jsonb not null) on commit drop;

do $pre$
declare v_missing text; v_sha text; v_acl text;
  -- MEASURED, then PINNED AS A LITERAL. Both values below were read from a clara_dev rebuilt from
  -- the 0184 frontier on 2026-09-12 before this file existed:
  --   select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
  --     where p.oid='clara.get_document_for_human_read(uuid,uuid)'::regprocedure;
  -- A literal, not a self-measurement, is the point: a prestate that pins whatever it finds proves
  -- only that the value did not change WHILE THIS FILE RAN. This one refuses to apply at all onto a
  -- chain where v1 is not the body #620 decided to leave alone.
  c_v1_sha  constant text := '23428d1b7ae247918e3327cee73ea6444106d2e48c7dc9801034b3b99e85d60d';
  c_v1_acl  constant text := 'clara_fn_owner,clara_runtime';
begin
  -- (a) The relations this door reads must all exist.
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_missing
    from unnest(array['documents','document_filings','firm_memberships','clients','audit_log']) x
   where to_regclass('clara.' || x) is null;
  if v_missing <> '(none)' then
    raise exception '0185 prestate: required relation(s) absent: %', v_missing using errcode = 'CLR10';
  end if;

  -- (b) The target must be WHOLLY absent. A partial cohort is refused, never extended.
  if to_regprocedure('clara.get_document_for_human_read_v2(uuid,uuid,uuid,text)') is not null then
    raise exception '0185 prestate: the successor door already exists' using errcode = 'CLR10';
  end if;

  -- (c) The helper this door CALLS must resolve by EXACT SIGNATURE (spelling is not identity).
  if to_regprocedure('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)') is null then
    raise exception '0185 prestate: clara._audit does not resolve by its exact signature'
      using errcode = 'CLR10';
  end if;

  -- (d) The columns this door projects must exist with the names it uses. A rename upstream would
  -- otherwise surface as a runtime error on the first human preview rather than here.
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_missing from unnest(array[
      'documents.storage_path','documents.mime_type','documents.byte_size','documents.sha256',
      'documents.original_filename','documents.document_kind','documents.bytes_verified_at',
      'documents.firm_id','document_filings.document_id','document_filings.client_id',
      'document_filings.firm_id','document_filings.retired_at','document_filings.filed_at',
      'firm_memberships.user_id','firm_memberships.firm_id','firm_memberships.status']) x
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'clara' and c.table_name = split_part(x, '.', 1)
        and c.column_name = split_part(x, '.', 2));
  if v_missing <> '(none)' then
    raise exception '0185 prestate: projected column(s) absent: %', v_missing using errcode = 'CLR10';
  end if;

  -- (e) THE v1 DOOR IS THE ONE #620 AGREED NOT TO TOUCH. Pinned by prosrc sha AND by ACL, both
  -- against literals; the tail re-reads both and proves this file moved neither.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.get_document_for_human_read(uuid,uuid)'::regprocedure;
  if v_sha is distinct from c_v1_sha then
    raise exception '0185 prestate: v1 get_document_for_human_read prosrc is % (pinned %) — #620 adds a successor to THAT body and to no other', v_sha, c_v1_sha
      using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(distinct coalesce(rr.rolname, 'PUBLIC'), ',' order by coalesce(rr.rolname, 'PUBLIC')), '(none)')
    into v_acl
    from pg_proc p, aclexplode(p.proacl) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.oid = 'clara.get_document_for_human_read(uuid,uuid)'::regprocedure
     and acl.privilege_type = 'EXECUTE';
  if v_acl is distinct from c_v1_acl then
    raise exception '0185 prestate: v1 door EXECUTE grantees are % (pinned %)', v_acl, c_v1_acl
      using errcode = 'CLR10';
  end if;
  insert into _d620_prestate(k, v) values ('v1_sha', to_jsonb(v_sha)), ('v1_acl', to_jsonb(v_acl));

  -- (f) The roles the tail sweeps must be nameable. Recorded, not required: a chain that has not
  -- minted a wake role yet still applies this file, and the tail sweeps whatever exists.
  insert into _d620_prestate(k, v)
  select 'walled_roles', coalesce(jsonb_agg(r order by r), '[]'::jsonb) from unnest(array[
      'clara_authenticated','clara_agent_ro','clara_freeform_ro','clara_wake_interactive',
      'clara_wake_proactive','clara_wake_bank','clara_wake_filing','clara_stripe_webhook']) r
   where to_regrole(r) is not null;

  raise notice '0185 prestate: OK -- 5 relations resolve, the successor door is wholly absent, clara._audit resolves by exact signature, 16 projected columns present, and the v1 door is byte-identical to its pinned prosrc sha (%) with its pinned EXECUTE grantee set (%); % of 8 walled roles exist on this cluster and will be swept by the tail',
    left(c_v1_sha, 12), c_v1_acl,
    jsonb_array_length((select v from _d620_prestate where k = 'walled_roles'));
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- 1. THE SUCCESSOR BYTE DOOR. clara_runtime only — the trusted-ingress route's read, and the
-- second place in the estate where a source document's storage_path leaves the database.
--
-- IT TAKES ITS PRINCIPAL AS AN ARGUMENT AND READS NO JWT, the v1/0162 idiom: the runtime route
-- validates a human session JWT, resolves the subject, and the DATABASE decides what that subject
-- may see. `status='active'` is the whole firm authorization — a removed member's token buys
-- nothing here even while it is still cryptographically valid.
--
-- EVERY SUCCESSFUL CALL WRITES AN AUDIT LINE. Source bytes leaving the estate is an egress event:
-- who, which document, for which client, to preview or to download. The line is written BEFORE the
-- return so a transaction that commits the read commits the receipt with it — there is no ordering
-- in which the caller gets a storage_path and the ledger does not get the line. The v1 door writes
-- none, which is the asymmetry with clara.get_artifact_for_human_read (0162:356) that #620 closes.
-- =====================================================================================
create function clara.get_document_for_human_read_v2(
    p_document uuid, p_user uuid, p_client uuid default null, p_purpose text default 'preview')
  returns jsonb
  language plpgsql
  volatile
  security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
as $$
declare d record; v_client uuid;
begin
  -- (1) THE PURPOSE, BEFORE ANYTHING IS READ. See this file's header: deciding existence first
  -- would turn an arbitrary purpose string into a two-answer existence probe.
  if p_purpose is null or p_purpose not in ('preview', 'download') then
    raise exception 'unsupported read purpose' using errcode = 'CLR10',
      detail = '{"reason":"invalid_purpose","allowed":["preview","download"]}';
  end if;

  if p_document is null or p_user is null then
    raise exception 'document not found' using errcode = 'CLR11',
      detail = '{"reason":"document_not_found"}';
  end if;

  -- (2) THE DOCUMENT AND THE LIVE MEMBERSHIP, in one statement and one shape. The membership
  -- predicate is v1's own, inline (0011:2411-2414) — #620 does not recut the membership surface,
  -- which belongs to the admission lane.
  select dd.id, dd.firm_id, dd.storage_path, dd.mime_type, dd.byte_size, dd.sha256,
         dd.original_filename, dd.document_kind, dd.bytes_verified_at
    into d
    from clara.documents dd
   where dd.id = p_document
     and exists (select 1 from clara.firm_memberships m
                  where m.user_id = p_user and m.firm_id = dd.firm_id and m.status = 'active');
  if d.id is null then
    raise exception 'document not found' using errcode = 'CLR11',
      detail = '{"reason":"document_not_found"}';
  end if;

  -- (3) THE CLIENT SCOPE. A request that names a client is answered only when the document's
  -- ACTIVE filing is that client's; a RETIRED filing is not a filing, and a document filed under
  -- no client at all is out of scope for every named client. All three refusals are the SAME
  -- not-found shape as step (2), so "this document is not yours" and "this document is not this
  -- client's" are not tellable apart from "there is no such document".
  if p_client is not null then
    select f.client_id into v_client
      from clara.document_filings f
     where f.document_id = d.id and f.client_id = p_client and f.firm_id = d.firm_id
       and f.retired_at is null;
    if v_client is null then
      raise exception 'document not found' using errcode = 'CLR11',
        detail = '{"reason":"document_not_found"}';
    end if;
  else
    -- No client asked for: report the active filing the document actually has, or null when it is
    -- unfiled. uq_document_filing_active admits one active row PER CLIENT, so a document filed for
    -- two clients at once has two; the most recent filing is reported and the read is not refused
    -- — the caller asked about the DOCUMENT, and a firm member may read every document of their
    -- own firm (#620 contract decision 4: no rank floor, firm membership is the wall).
    select f.client_id into v_client
      from clara.document_filings f
     where f.document_id = d.id and f.firm_id = d.firm_id and f.retired_at is null
     order by f.filed_at desc, f.id desc
     limit 1;
  end if;

  -- (4) CUSTODY. The bytes are addressed by content and verified once at intake; until both halves
  -- of that bond are stamped there is nothing to serve, and saying "not found" about a document the
  -- caller can see in their own list is a lie they cannot act on. This is the one refusal that is
  -- deliberately NOT the single not-found shape -- it is the caller's OWN document, and the fix
  -- (wait for verification, or re-upload) is theirs to take.
  if d.storage_path is null or d.bytes_verified_at is null then
    raise exception 'document bytes are not in custody yet' using errcode = 'CLR13',
      detail = '{"reason":"custody_pending","fix":"the object is not verified yet -- retry once intake finishes, or re-upload"}';
  end if;

  -- (5) THE EGRESS RECEIPT, then the row. Called, never recut: clara._audit is a shared utility.
  -- The storage_path is deliberately NOT in the line — the ledger records WHICH document left, to
  -- whom, under which client scope and for which purpose; the content address already lives on the
  -- document row, and repeating a storage path into a widely-read table only widens where it can
  -- be read from (0162's own reasoning for the artifact family).
  perform clara._audit(d.firm_id, p_user, null, null, 'get_document_for_human_read_v2', d.id,
    jsonb_build_object('client', p_client, 'purpose', p_purpose));

  return jsonb_build_object(
    'storage_path', d.storage_path,
    'mime_type', d.mime_type,
    'byte_size', d.byte_size,
    'sha256', d.sha256,
    'original_filename', d.original_filename,
    'document_kind', d.document_kind,
    'bytes_verified_at', d.bytes_verified_at,
    'client_id', v_client,
    'firm_id', d.firm_id);
end $$;

comment on function clara.get_document_for_human_read_v2(uuid,uuid,uuid,text) is
  '#620 successor source-document byte door. clara_runtime ONLY: it returns storage_path, so a '
  'browser role must never hold it. Takes the RESOLVED principal (the v1/0162 idiom) and decides '
  'from the LIVE active firm_memberships row. Refusals are typed and carry no existence oracle: '
  'CLR10 invalid_purpose (checked FIRST, so an arbitrary purpose string cannot probe existence), '
  'CLR11 document_not_found as ONE shape for absent / foreign-firm / out-of-client-scope, and '
  'CLR13 custody_pending for the caller''s OWN document whose storage_path or bytes_verified_at is '
  'still null. Client scope is the ACTIVE clara.document_filings row (retired_at is null) and '
  'nothing else. Every SUCCESS writes a clara._audit egress line; no refusal writes one. Pins '
  'plan_cache_mode = force_custom_plan (0183 discipline): the caller and the firm are parameters '
  'over multi-tenant relations. v1 clara.get_document_for_human_read(uuid,uuid) is untouched and '
  'stays granted exactly as 0011 left it.';

revoke all on function clara.get_document_for_human_read_v2(uuid,uuid,uuid,text) from public;
grant execute on function clara.get_document_for_human_read_v2(uuid,uuid,uuid,text) to clara_runtime;

reset role;

-- =====================================================================================
-- 2. TAIL CENSUS. Every claim re-READ from the live catalog, never asserted.
--
-- THE prosrc PROBE READS THE BODY'S STATEMENTS, NOT ITS PROSE (0184 §J's instrument, lifted).
-- plpgsql `prosrc` carries the function's own comments, so a census that greps it can be satisfied
-- by a sentence ABOUT the code instead of the code — this body's own header paragraph names
-- `_audit` twice. The strip below is LITERAL-AWARE: the rule is "the first `--` at EVEN
-- single-quote parity", carried across lines over the KEPT text only, because a blind
-- `regexp_replace(prosrc,'--[^newline]*','','g')` also cuts from a `--` INSIDE a string literal to
-- the end of that line — and this body has exactly such a literal (the custody_pending `fix`
-- text), deliberately, so the two-sided vacuity control below has a real subject on both sides.
-- =====================================================================================
do $tail$
declare
  v_sig constant text := 'clara.get_document_for_human_read_v2(uuid,uuid,uuid,text)';
  v_body text; v_out text; v_par int; v_kept text; v_rest text; v_head text; v_p int;
  v_line text; v_bad text; v_acl text; v_sha text; v_pre text; v_n int; r text;
  v_pinned_sha constant text := '23428d1b7ae247918e3327cee73ea6444106d2e48c7dc9801034b3b99e85d60d';
  v_pinned_acl constant text := 'clara_fn_owner,clara_runtime';
begin
  -- (1) IT LANDED, by EXACT SIGNATURE, owned by clara_fn_owner and SECURITY DEFINER.
  if to_regprocedure(v_sig) is null then
    raise exception '0185 tail: % did not land', v_sig using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(p.oid::regprocedure::text, ','), '(none)') into v_bad
    from pg_proc p
   where p.oid = v_sig::regprocedure
     and (not p.prosecdef or p.proowner <> 'clara_fn_owner'::regrole or p.provolatile <> 'v');
  if v_bad <> '(none)' then
    raise exception '0185 tail: % is not a VOLATILE clara_fn_owner-owned SECURITY DEFINER', v_bad
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = 'get_document_for_human_read_v2';
  if v_n <> 1 then
    raise exception '0185 tail: get_document_for_human_read_v2 has % overloads (want exactly 1)', v_n
      using errcode = 'CLR10';
  end if;

  -- (2) THE GRANT MATRIX. clara_runtime holds EXECUTE; the browser role, both agent read roles,
  -- every wake lane and the webhook role do not. Read behaviourally through
  -- has_function_privilege (which follows role membership), over the roles this cluster actually
  -- has — a chain that has not minted a wake role yet still passes, and a cluster that HAS one and
  -- granted it fails.
  if not pg_catalog.has_function_privilege('clara_runtime', v_sig, 'execute') then
    raise exception '0185 tail: clara_runtime cannot execute % -- the route could not read a byte', v_sig
      using errcode = 'CLR10';
  end if;
  foreach r in array array['clara_authenticated','clara_agent_ro','clara_freeform_ro',
      'clara_wake_interactive','clara_wake_proactive','clara_wake_bank','clara_wake_filing',
      'clara_stripe_webhook'] loop
    if to_regrole(r) is not null and pg_catalog.has_function_privilege(r, v_sig, 'execute') then
      raise exception '0185 tail: % can execute % -- a storage_path must never be reachable from a browser, an agent or a wake lane', r, v_sig
        using errcode = 'CLR10';
    end if;
  end loop;
  -- …and the ACL itself carries no PUBLIC grant (grantee 0 matches no pg_roles row, so the join
  -- must be a LEFT one — 0083's own correction, reused rather than re-learned).
  select coalesce(string_agg(distinct coalesce(rr.rolname, 'PUBLIC'), ',' order by coalesce(rr.rolname, 'PUBLIC')), '(none)')
    into v_acl
    from pg_proc p, aclexplode(p.proacl) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.oid = v_sig::regprocedure and acl.privilege_type = 'EXECUTE';
  if v_acl <> 'clara_fn_owner,clara_runtime' then
    raise exception '0185 tail: the successor door''s EXECUTE grantees are % (want clara_fn_owner,clara_runtime)', v_acl
      using errcode = 'CLR10';
  end if;

  -- (3) THE PLAN CLAUSE IS ON THE SHIPPED FUNCTION. proconfig, not prosrc: a `set` on the function
  -- is catalog state, and reading it out of the body text would be satisfied by a comment.
  if not ('plan_cache_mode=force_custom_plan' = any (coalesce(
      (select p.proconfig from pg_proc p where p.oid = v_sig::regprocedure), '{}'::text[]))) then
    raise exception '0185 tail: % does not pin plan_cache_mode=force_custom_plan -- without it the caller and the firm are planned at the per-firm average of a multi-tenant table', v_sig
      using errcode = 'CLR10';
  end if;
  if not ('search_path=clara, pg_temp' = any (coalesce(
      (select p.proconfig from pg_proc p where p.oid = v_sig::regprocedure), '{}'::text[]))) then
    raise exception '0185 tail: % does not pin search_path=clara, pg_temp', v_sig using errcode = 'CLR10';
  end if;

  -- (4) THE BODY REALLY CALLS clara._audit. Comment-stripped, literal-aware.
  select p.prosrc into v_body from pg_proc p where p.oid = v_sig::regprocedure;
  v_out := ''; v_par := 0;
  for v_line in select l from regexp_split_to_table(v_body, chr(10)) with ordinality t(l, n) order by n
  loop
    v_kept := ''; v_rest := v_line;
    loop
      v_p := position('--' in v_rest);
      if v_p = 0 then
        v_kept := v_kept || v_rest;
        v_par := (v_par + length(v_rest) - length(replace(v_rest, '''', ''))) % 2;
        exit;
      end if;
      v_head := substr(v_rest, 1, v_p - 1);
      v_par := (v_par + length(v_head) - length(replace(v_head, '''', ''))) % 2;
      if v_par = 0 then
        v_kept := v_kept || v_head;   -- outside every literal: a real comment, to end of line
        exit;
      end if;
      v_kept := v_kept || v_head || '--';  -- inside a literal: the two dashes are data
      v_rest := substr(v_rest, v_p + 2);
    end loop;
    v_out := v_out || v_kept || chr(10);
  end loop;

  -- VACUITY CONTROL, BOTH SIDES. (1) the one line carrying a `--` INSIDE a literal must come out
  -- WHOLE, or every probe below is reading a body with real SQL missing; (2) a sentence that is
  -- unambiguously PROSE must be GONE, or the strip is a no-op and every probe below could be
  -- satisfied by a comment.
  if position('retry once intake finishes, or re-upload"}''' in v_out) = 0 then
    raise exception '0185 tail: the comment strip is not literal-aware -- it cut inside a string literal, so every probe below is unsound'
      using errcode = 'CLR10';
  end if;
  if position('THE EGRESS RECEIPT, then the row' in v_out) > 0 then
    raise exception '0185 tail: the comment strip left prose in the body -- every probe below could be satisfied by a sentence about the code'
      using errcode = 'CLR10';
  end if;
  if position('clara._audit(' in v_out) = 0 then
    raise exception '0185 tail: % does not CALL clara._audit -- a served source document must be receipted', v_sig
      using errcode = 'CLR10';
  end if;
  -- The three typed refusals are raised by the CODE, not described by it.
  foreach r in array array['''CLR10''', '''CLR11''', '''CLR13'''] loop
    if position(r in v_out) = 0 then
      raise exception '0185 tail: % never raises errcode % in code', v_sig, r using errcode = 'CLR10';
    end if;
  end loop;
  if position('retired_at is null' in v_out) = 0 then
    raise exception '0185 tail: % does not read the ACTIVE filing (retired_at is null) in code', v_sig
      using errcode = 'CLR10';
  end if;

  -- (5) v1 IS UNTOUCHED — the whole reason this file is a successor and not a recut. Both halves
  -- are compared to the LITERALS the prestate pinned, and to the prestate's own record of them, so
  -- neither a drifted chain nor a mid-file edit can pass.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = 'clara.get_document_for_human_read(uuid,uuid)'::regprocedure;
  select v #>> '{}' into v_pre from _d620_prestate where k = 'v1_sha';
  if v_sha is distinct from v_pinned_sha or v_sha is distinct from v_pre then
    raise exception '0185 tail: v1 get_document_for_human_read moved (pinned %, prestate %, now %)',
      v_pinned_sha, v_pre, v_sha using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(distinct coalesce(rr.rolname, 'PUBLIC'), ',' order by coalesce(rr.rolname, 'PUBLIC')), '(none)')
    into v_acl
    from pg_proc p, aclexplode(p.proacl) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.oid = 'clara.get_document_for_human_read(uuid,uuid)'::regprocedure
     and acl.privilege_type = 'EXECUTE';
  select v #>> '{}' into v_pre from _d620_prestate where k = 'v1_acl';
  if v_acl is distinct from v_pinned_acl or v_acl is distinct from v_pre then
    raise exception '0185 tail: v1 door EXECUTE grantees moved (pinned %, prestate %, now %)',
      v_pinned_acl, v_pre, v_acl using errcode = 'CLR10';
  end if;

  raise notice '0185 tail: OK -- clara.get_document_for_human_read_v2(uuid,uuid,uuid,text) is the ONE new object in this file: a VOLATILE, clara_fn_owner-owned SECURITY DEFINER with exactly one overload, PUBLIC-revoked and granted to clara_runtime and to NOTHING else (clara_authenticated, both agent read roles, every wake lane and the webhook role are behaviourally denied, so a storage_path can never be reached from a browser, an agent or a wake lane); it pins search_path=clara, pg_temp and plan_cache_mode=force_custom_plan in proconfig; its COMMENT-STRIPPED, LITERAL-AWARE body really calls clara._audit, really raises CLR10/CLR11/CLR13 and really reads the ACTIVE filing (retired_at is null), with a two-sided vacuity control proving the strip neither mutilated a string literal nor left prose behind; and the v1 door clara.get_document_for_human_read(uuid,uuid) is byte-identical to its pinned prosrc sha with its pinned EXECUTE grantee set clara_fn_owner,clara_runtime -- so 0011''s own grant-matrix assertion and both test rosters stay true and v1''s retirement remains a later, deliberate migration. NO relation, column or row was created or altered and NO live body was replaced.';
end $tail$;
