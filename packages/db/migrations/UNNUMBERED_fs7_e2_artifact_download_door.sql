-- FS-7 echelon 2 -- THE ONE GENERIC ARTIFACT DOWNLOAD DOOR (裁-96②, ruled beta-gating by 裁-118).
--
-- Number is claimed at MERGE PREP (裁-108, .claude/rules/db-migrations.md). Nothing in this file,
-- in its prestate, in its tail or in its battery keys on the number: every claim below reads the
-- LIVE CATALOG (to_regprocedure / pg_proc / aclexplode), never a filename and never
-- clara.schema_migrations.
--
-- DESIGN OF RECORD
--   · docs/plan/active/mohe-grill-rulings-2026-09-01.md 裁-96② -- "the report-PDF download door is
--     ONE generic door over BOTH artifact families (report_artifacts + sandbox_exports),
--     server-side gate only, client-side signed-URL minting FORBIDDEN".
--   · docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md SS FS-7 "PR-3 (F-A5b)".
--   · The shape copied: clara.get_document_for_human_read(uuid,uuid) (0011:2401) -- a definer read
--     that takes the RESOLVED principal as an argument and is granted to clara_runtime, so the
--     trusted-ingress route (packages/runtime/src/documentRoutes.ts) can call it after validating
--     a human session JWT. Its DOOR is copied; its RELATION is not (that one reads clara.documents).
--
-- ============================ WHAT THIS FILE ADDS, AND WHAT IT DOES NOT =========================
-- NEW: 3 functions. NO new table, NO new column, NO altered relation, NO changed row.
--   clara._artifact_download_core(uuid,uuid,uuid,int)  -- owner-only. THE GATE. Both families.
--   clara.get_artifact_for_human_read(uuid,uuid)       -- clara_runtime only. THE BYTE DOOR.
--   clara.list_downloadable_artifacts(uuid,int)        -- clara_authenticated only. THE OFFER.
-- NOT TOUCHED, stated so nothing is inferred: no CREATE OR REPLACE of any live body anywhere in
-- this file, so its D1 write-quiesce obligation is NIL and the tail proves that by re-reading the
-- prosrc sha of every neighbouring reporting body it could plausibly have disturbed.
--
-- ============================ THE GRANT SPLIT, AND WHY IT IS THIS WAY ===========================
-- The work order's sentence reads "Grants: clara_authenticated only for the door". Taken
-- literally that would put the BYTE door -- the one whose return carries `storage_key` -- on the
-- role the BROWSER holds through PostgREST, which is the very thing 裁-96② forbids ("NO direct
-- storage read from the browser"). The estate's own analogue settles it: the document byte door is
-- granted to clara_runtime and to nothing else, precisely so the storage path never crosses to a
-- client. So the split here is:
--
--   get_artifact_for_human_read  -> clara_runtime ONLY. Returns storage_key. Never reachable from
--                                   a browser session; the runtime route holds the storage custody
--                                   credential and streams the bytes itself.
--   list_downloadable_artifacts  -> clara_authenticated ONLY. Returns NO storage_key, ever. It is
--                                   what tells the UI whether a Download control may appear at all,
--                                   so the control is never a dead link.
--
-- Both are "the door" in 裁-96②'s sense -- ONE gate body over BOTH families, server-side only --
-- and the gate is literally one function that both call. This deviation from the work order's
-- grant WORDING (never from its ruling) is named in the PR body for the reviewer.
--
-- ============================ WHY THE OFFER CALLS THE GATE, NOT A COPY =========================
-- 裁-112: a cell that proves a gate discriminates must EXECUTE THE GATE, never a copy of its
-- predicate. The same law binds the PRODUCTION reader: list_downloadable_artifacts does not
-- re-implement "is this downloadable" -- it CALLS clara._artifact_download_core once per candidate
-- row inside an exception block and reports the gate's own verdict. A second predicate beside the
-- first is how a UI comes to offer a control the door then refuses.

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE. Every premise this file rests on, measured before the first write; the prosrc shas
-- of the neighbouring bodies pinned so the tail can prove none of them moved.
-- ==============================================================================================
create temp table _fs7e2_prestate (k text primary key, v jsonb not null) on commit drop;

do $pre$
declare v_missing text; v_sha text; n text;
begin
  -- (a) The two artifact relations and the relations the gate joins must all exist.
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_missing
    from unnest(array['report_artifacts','sandbox_exports','sandbox_views','clients',
                      'firm_memberships','watermark_policy_versions','report_runs']) x
   where to_regclass('clara.' || x) is null;
  if v_missing <> '(none)' then
    raise exception 'fs7 e2 prestate: required relation(s) absent: %', v_missing using errcode = 'CLR10';
  end if;

  -- (b) The three targets must be WHOLLY absent -- a partial cohort is refused, never extended.
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_missing from unnest(array[
      'clara._artifact_download_core(uuid,uuid,uuid,int)',
      'clara.get_artifact_for_human_read(uuid,uuid)',
      'clara.list_downloadable_artifacts(uuid,int)']) x
   where to_regprocedure(x) is not null;
  if v_missing <> '(none)' then
    raise exception 'fs7 e2 prestate: target cohort must be wholly absent; found %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (c) The helpers the gate calls must resolve by EXACT SIGNATURE (spelling is not identity).
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_missing from unnest(array[
      'clara._human_ctx(integer)', 'clara.role_rank(text)',
      'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)']) x
   where to_regprocedure(x) is null;
  if v_missing <> '(none)' then
    raise exception 'fs7 e2 prestate: helper(s) do not resolve by exact signature: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (d) THE READ FLOOR IS MEASURED, NOT ASSUMED. The gate refuses below role_rank('bookkeeper');
  -- if that helper ever stops ranking bookkeeper above viewer the gate is meaningless.
  if clara.role_rank('bookkeeper') is null or clara.role_rank('viewer') is null
     or clara.role_rank('bookkeeper') <= clara.role_rank('viewer') then
    raise exception 'fs7 e2 prestate: the human read floor is not orderable (bookkeeper % viewer %)',
      clara.role_rank('bookkeeper'), clara.role_rank('viewer') using errcode = 'CLR10';
  end if;

  -- (e) The columns the gate projects must exist with the names it uses. A rename upstream would
  -- otherwise surface as a runtime error on the first human download rather than here.
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_missing from unnest(array[
      'report_artifacts.storage_key','report_artifacts.sha256','report_artifacts.byte_size',
      'report_artifacts.key_extension','report_artifacts.kind','report_artifacts.client_id',
      'report_artifacts.prior_artifact_id','report_artifacts.report_run_id','report_artifacts.manifest',
      'sandbox_exports.storage_key','sandbox_exports.artifact_sha256','sandbox_exports.byte_size',
      'sandbox_exports.state','sandbox_exports.sandbox_view_id',
      'sandbox_exports.watermark_policy_version_id','sandbox_views.client_set']) x
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema='clara' and c.table_name = split_part(x,'.',1)
        and c.column_name = split_part(x,'.',2));
  if v_missing <> '(none)' then
    raise exception 'fs7 e2 prestate: projected column(s) absent: %', v_missing using errcode = 'CLR10';
  end if;

  -- (f) Pin the neighbouring bodies. This file replaces NONE of them; the tail re-reads each sha
  -- and aborts on drift, which is what makes "no D1 obligation" a measurement rather than a claim.
  foreach n in array array[
      'clara.get_document_for_human_read(uuid,uuid)',
      'clara.verify_report_artifact(uuid)',
      'clara.list_sandbox_exports(uuid,integer)',
      'clara.complete_sandbox_export(uuid,text,text,bigint,text)',
      'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'] loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = n::regprocedure;
    if v_sha is null then
      raise exception 'fs7 e2 prestate: cannot pin % (absent)', n using errcode = 'CLR10';
    end if;
    insert into _fs7e2_prestate(k, v) values ('sha:' || n, to_jsonb(v_sha));
  end loop;

  -- (g) The watermark policy trio the sandbox family's gate depends on. Recorded, not required to
  -- be non-empty: a rig with no locale rows must still be able to APPLY this file. What the gate
  -- does with an absent row is a refusal, and the battery forces it.
  insert into _fs7e2_prestate(k, v)
  select 'watermark_locales', coalesce(jsonb_agg(distinct locale order by locale), '[]'::jsonb)
    from clara.watermark_policy_versions where policy_key = 'sandbox_watermark';

  raise notice 'fs7 e2 prestate: OK -- 7 relations resolve, 3 targets absent, 3 helpers resolve by exact signature, the read floor is orderable (bookkeeper > viewer), 16 projected columns present, 5 neighbouring bodies pinned by prosrc sha';
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. THE GATE. One body, both families, every refusal typed.
--
-- IT TAKES ITS PRINCIPAL AS ARGUMENTS AND READS NO JWT. That is deliberate and it is what lets
-- ONE gate serve two callers with two different identity mechanisms: the browser-facing offer
-- resolves its principal from the JWT (clara._human_ctx) and the runtime byte door resolves it
-- from the live membership row (the get_document_for_human_read idiom). A gate that read the JWT
-- itself could only ever serve one of them, and the other would need a copy -- which is the
-- duplicated-predicate defect 裁-112 names.
--
-- THE NOT-FOUND SHAPE IS SINGLE (no existence oracle). A nonexistent id, an id belonging to
-- another firm, and an id whose client has left the firm all raise the SAME CLR11 with the same
-- message. Only the states a caller is ENTITLED to see -- their own artifact is superseded, their
-- own export has not finished -- get a distinguishing code.
-- ==============================================================================================
create function clara._artifact_download_core(
    p_artifact uuid, p_firm uuid, p_actor uuid, p_rank int)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  a record; e record; v record; v_successor uuid; v_keywords text; v_watermark text;
  v_stray uuid[];
begin
  if p_artifact is null or p_firm is null or p_actor is null or p_rank is null then
    raise exception 'artifact not found' using errcode = 'CLR11',
      detail = '{"reason":"artifact_not_found"}';
  end if;
  -- THE HUMAN READ FLOOR. Measured against the SAME helper every other reporting reader uses
  -- (clara.list_sandbox_exports, clara.verify_report_artifact): a viewer-rank member is below it.
  if p_rank < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04',
      detail = '{"reason":"insufficient_role","floor":"bookkeeper"}';
  end if;

  -- ---------- FAMILY 1: the SEALED lane, clara.report_artifacts ----------
  select ra.id, ra.firm_id, ra.client_id, ra.report_run_id, ra.kind, ra.key_extension,
         ra.storage_key, ra.sha256, ra.byte_size, ra.manifest, ra.sealed_at
    into a
    from clara.report_artifacts ra
   where ra.id = p_artifact and ra.firm_id = p_firm;

  if a.id is not null then
    -- The artifact's CLIENT must still be a client of this firm. A composite FK already binds
    -- (report_run_id, firm_id, client_id), so this is a belt over a structural brace -- and it is
    -- the clause that makes "a member of firm A cannot fetch firm B's artifact" true by the
    -- artifact's own client rather than only by its firm_id column.
    if not exists (select 1 from clara.clients cl where cl.id = a.client_id and cl.firm_id = p_firm) then
      raise exception 'artifact not found' using errcode = 'CLR11',
        detail = '{"reason":"artifact_not_found"}';
    end if;

    -- SUPERSEDED. The chain is linear (uq_report_artifacts_linear_chain), so at most one row can
    -- name this one as its predecessor; serving a superseded artifact would hand a human a
    -- document the run itself has moved past.
    select s.id into v_successor from clara.report_artifacts s
     where s.report_run_id = a.report_run_id and s.prior_artifact_id = a.id;
    if v_successor is not null then
      raise exception 'this artifact has been superseded within its report run'
        using errcode = 'CLR10',
        detail = jsonb_build_object('reason','artifact_superseded','successor_artifact_id',v_successor)::text;
    end if;

    -- THE WATERMARK WALL, on the family that carries one. A draft_watermarked artifact whose own
    -- sealed manifest does not record that a watermark was burned is refused rather than served:
    -- an unwatermarked draft that reads as a draft is exactly the document a reader mistakes for
    -- an issued one.
    --
    -- \m...\M ARE WORD BOUNDARIES AND THEY ARE LOAD-BEARING. The keyword string carries either
    -- `watermarked` or `unwatermarked`, and `unwatermarked` CONTAINS `watermarked` as a substring
    -- -- a bare LIKE '%watermarked%' would pass the exact row this wall exists to stop. (Review
    -- law 3: spelling is not identity.)
    if a.kind = 'draft_watermarked' then
      v_keywords := a.manifest #>> '{document_metadata,keywords}';
      if v_keywords is null or v_keywords !~ '\mwatermarked\M' then
        raise exception 'this draft artifact does not record a burned watermark'
          using errcode = 'CLR10',
          detail = '{"reason":"artifact_watermark_unproven","fix":"re-render the draft through the render worker; a draft is served only when its sealed manifest records the burn"}';
      end if;
    end if;

    return jsonb_build_object(
      'family', 'report_artifact',
      'artifact_id', a.id,
      'firm_id', a.firm_id,
      'client_ids', jsonb_build_array(a.client_id),
      'report_run_id', a.report_run_id,
      'kind', a.kind,
      'storage_key', a.storage_key,
      'sha256', a.sha256,
      'byte_size', a.byte_size,
      'content_type', case a.key_extension when 'pdf' then 'application/pdf'
                                           when 'json' then 'application/json' end,
      -- DERIVED, NEVER SUPPLIED. There is no filename column anywhere in either family (0066's
      -- own note: "the filename vector is structurally closed"), and none is invented here from a
      -- database string: the name is the family, the kind and the first 12 hex of the content
      -- address. Smuggling a claim into it would mean smuggling it into a sha256 first.
      'filename', 'clara-report-' || a.kind || '-' || left(a.sha256, 12) || '.' || a.key_extension,
      'produced_at', a.sealed_at);
  end if;

  -- ---------- FAMILY 2: the SANDBOX lane, clara.sandbox_exports ----------
  select se.id, se.firm_id, se.sandbox_view_id, se.state, se.storage_key, se.artifact_sha256,
         se.byte_size, se.watermark_policy_version_id, se.finished_at, se.locale
    into e
    from clara.sandbox_exports se
   where se.id = p_artifact and se.firm_id = p_firm;

  if e.id is null then
    raise exception 'artifact not found' using errcode = 'CLR11',
      detail = '{"reason":"artifact_not_found"}';
  end if;

  select sv.client_set into v from clara.sandbox_views sv
   where sv.id = e.sandbox_view_id and sv.firm_id = p_firm;
  if v.client_set is null then
    raise exception 'artifact not found' using errcode = 'CLR11',
      detail = '{"reason":"artifact_not_found"}';
  end if;

  -- THE COVERED-CLIENT WALL. A sandbox export is minted over a SET of clients, so its download is
  -- gated on the WHOLE set: a set carrying any client this firm does not own must never be served
  -- to this firm, and the refusal is the single not-found shape rather than a report of which
  -- client was stray.
  select coalesce(array_agg(x), '{}') into v_stray
    from unnest(v.client_set) x
   where not exists (select 1 from clara.clients cl where cl.id = x and cl.firm_id = p_firm);
  if cardinality(v_stray) > 0 then
    raise exception 'artifact not found' using errcode = 'CLR11',
      detail = '{"reason":"artifact_not_found"}';
  end if;

  -- NOT FINISHED. The completion CHECK (ck_sandboxexports_completion_paired) already ties
  -- state='done' to the three completion columns being non-null; both halves are read anyway,
  -- because a gate that trusts a constraint it did not check is a gate that stops working the day
  -- the constraint is widened.
  if e.state <> 'done' or e.storage_key is null or e.artifact_sha256 is null or e.byte_size is null then
    raise exception 'this sandbox export has produced no bytes yet'
      using errcode = 'CLR10',
      detail = jsonb_build_object('reason','sandbox_export_not_complete','state',e.state)::text;
  end if;

  -- THE WATERMARK WALL on this family is the PINNED POLICY ROW, not a manifest keyword: the export
  -- froze watermark_policy_version_id at request time and the renderer refuses to author its own
  -- disclosure language (packages/reporting-render/lib/layout-sandbox.mjs's
  -- sandbox_watermark_unsealed). A row that has gone missing, or whose text is blank, means the
  -- bytes cannot be shown to carry the burn -- so the download refuses too.
  -- `watermark` is a jsonb OBJECT carrying the ratified text under its own `watermark` key -- the
  -- shape layout-sandbox.mjs reads as `payload.watermark.watermark`. Read by key, never coerced
  -- from the object: `btrim(watermark::text)` on `{"watermark":""}` is a NON-BLANK seven-character
  -- string, so the coercion would have passed the exact row this wall exists to stop.
  select btrim(coalesce(wpv.watermark ->> 'watermark', '')) into v_watermark
    from clara.watermark_policy_versions wpv where wpv.id = e.watermark_policy_version_id;
  if v_watermark is null or v_watermark = '' then
    raise exception 'this sandbox export has no ratified watermark text pinned'
      using errcode = 'CLR10',
      detail = '{"reason":"watermark_policy_absent","fix":"a sandbox export is downloadable only while the watermark policy version it pinned still carries ratified text"}';
  end if;

  return jsonb_build_object(
    'family', 'sandbox_export',
    'artifact_id', e.id,
    'firm_id', e.firm_id,
    'client_ids', to_jsonb(v.client_set),
    'sandbox_view_id', e.sandbox_view_id,
    'kind', 'sandbox_export',
    'storage_key', e.storage_key,
    'sha256', e.artifact_sha256,
    'byte_size', e.byte_size,
    -- clara.complete_sandbox_export pins the key shape to '<...>/sandbox/<sha>.pdf': this family
    -- is PDF by construction, not by convention.
    'content_type', 'application/pdf',
    'filename', 'clara-sandbox-export-' || left(e.artifact_sha256, 12) || '.pdf',
    'locale', e.locale,
    'produced_at', e.finished_at);
end $$;

revoke all on function clara._artifact_download_core(uuid,uuid,uuid,int) from public;

-- ==============================================================================================
-- 2. THE BYTE DOOR. clara_runtime only -- the trusted-ingress route's read, and the ONLY place in
-- the estate where a storage_key for either artifact family leaves the database.
--
-- EVERY SUCCESSFUL CALL WRITES AN AUDIT LINE. A byte leaving the system is an egress event: who,
-- which artifact, when. The line is written BEFORE the return so a transaction that commits the
-- read commits the receipt with it -- there is no ordering in which the caller gets bytes and the
-- ledger does not get the line.
-- ==============================================================================================
create function clara.get_artifact_for_human_read(p_artifact uuid, p_user uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare m record; r jsonb;
begin
  if p_artifact is null or p_user is null then
    raise exception 'artifact not found' using errcode = 'CLR11',
      detail = '{"reason":"artifact_not_found"}';
  end if;
  -- THE LIVE MEMBERSHIP, exactly the get_document_for_human_read idiom: the caller is trusted to
  -- have validated a session JWT and to pass the subject it resolved, and the DATABASE decides
  -- what that subject may see. `status='active'` is the whole authorisation -- a removed member's
  -- token buys nothing here even while it is still cryptographically valid.
  select fm.firm_id, clara.role_rank(fm.role) as rank into m
    from clara.firm_memberships fm
   where fm.user_id = p_user and fm.status = 'active';
  if m.firm_id is null then
    raise exception 'artifact not found' using errcode = 'CLR11',
      detail = '{"reason":"artifact_not_found"}';
  end if;

  r := clara._artifact_download_core(p_artifact, m.firm_id, p_user, coalesce(m.rank, -1));

  perform clara._audit(m.firm_id, p_user, null, null, 'get_artifact_for_human_read', p_artifact,
    jsonb_build_object(
      'family', r->>'family',
      'sha256', r->>'sha256',
      'byte_size', r->'byte_size',
      'client_ids', r->'client_ids',
      -- The storage key is deliberately NOT in the audit line. The ledger records WHICH artifact
      -- left and to whom; the content address is already on the artifact row, and repeating a
      -- storage path into a widely-read table only widens where it can be read from.
      'content_type', r->>'content_type'));
  return r;
end $$;

revoke all on function clara.get_artifact_for_human_read(uuid,uuid) from public;
grant execute on function clara.get_artifact_for_human_read(uuid,uuid) to clara_runtime;

-- ==============================================================================================
-- 3. THE OFFER. clara_authenticated only -- what the Reports tab asks before it draws a control.
--
-- IT RETURNS NO storage_key AND NEVER WILL. That absence is the whole reason this is a separate
-- projection rather than the same door with a different grant.
--
-- IT EXECUTES THE GATE (裁-112). `downloadable` is clara._artifact_download_core's own verdict,
-- caught per row, never a second predicate that happens to agree with it today.
-- ==============================================================================================
create function clara.list_downloadable_artifacts(p_client uuid, p_limit int)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  c record; v_limit int; v_rank int; v_out jsonb := '[]'::jsonb; row_ record;
  v_verdict jsonb; v_ok boolean; v_reason text; v_detail text; v_state text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_client is null then
    raise exception 'client is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"client"}';
  end if;
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"client_not_found"}';
  end if;
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
  -- The caller's own rank, read from the live membership rather than re-derived from the JWT, so
  -- the offer and the byte door are ranked by the same number.
  select clara.role_rank(fm.role) into v_rank from clara.firm_memberships fm
   where fm.user_id = c.actor and fm.firm_id = c.firm and fm.status = 'active';

  for row_ in
    select id, produced_at, family, label from (
      select ra.id, ra.sealed_at as produced_at, 'report_artifact'::text as family,
             ra.kind as label
        from clara.report_artifacts ra
       where ra.firm_id = c.firm and ra.client_id = p_client
      union all
      select se.id, se.created_at as produced_at, 'sandbox_export'::text as family,
             se.state as label
        from clara.sandbox_exports se
        join clara.sandbox_views sv on sv.id = se.sandbox_view_id and sv.firm_id = se.firm_id
       where se.firm_id = c.firm and p_client = any (sv.client_set)
    ) u
    order by produced_at desc nulls last, id desc
    limit v_limit
  loop
    begin
      v_verdict := clara._artifact_download_core(row_.id, c.firm, c.actor, coalesce(v_rank, -1));
      v_ok := true; v_reason := null;
    exception when others then
      v_ok := false; v_verdict := null;
      -- The gate's OWN typed reason, lifted from the refusal it actually raised (GET STACKED
      -- DIAGNOSTICS, never a re-derivation) so a refusal renders as the database wrote it rather
      -- than as UI-authored prose. A refusal with no parseable detail degrades to its SQLSTATE,
      -- which is still the gate's own word and never an invented one.
      get stacked diagnostics v_detail = pg_exception_detail, v_state = returned_sqlstate;
      begin
        v_reason := (nullif(v_detail, ''))::jsonb ->> 'reason';
      exception when others then v_reason := null;
      end;
      v_reason := coalesce(v_reason, v_state);
    end;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'artifact_id', row_.id,
      'family', row_.family,
      'label', row_.label,
      'produced_at', row_.produced_at,
      'downloadable', v_ok,
      'refusal_reason', v_reason,
      -- NO storage_key. NO signed URL. The browser learns THAT it may download and WHAT the file
      -- will be called; the path it lives at never crosses this boundary.
      'sha256', case when v_ok then v_verdict->>'sha256' end,
      'byte_size', case when v_ok then v_verdict->'byte_size' end,
      'content_type', case when v_ok then v_verdict->>'content_type' end,
      'filename', case when v_ok then v_verdict->>'filename' end));
  end loop;
  return v_out;
end $$;

revoke all on function clara.list_downloadable_artifacts(uuid,int) from public;
grant execute on function clara.list_downloadable_artifacts(uuid,int) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 4. TAIL CENSUS. Read from the LIVE CATALOG, never asserted.
-- ==============================================================================================
do $tail$
declare
  v_grants text; v_expect text; v_sha text; v_pre text; n text; v_leak int; v_bad text;
begin
  -- (1) All three landed, by EXACT signature.
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_bad from unnest(array[
      'clara._artifact_download_core(uuid,uuid,uuid,int)',
      'clara.get_artifact_for_human_read(uuid,uuid)',
      'clara.list_downloadable_artifacts(uuid,int)']) x
   where to_regprocedure(x) is null;
  if v_bad <> '(none)' then
    raise exception 'fs7 e2 tail: target(s) absent after create: %', v_bad using errcode = 'CLR10';
  end if;

  -- (2) THE GRANT CENSUS, with a LEFT JOIN so a PUBLIC grant (grantee 0, which matches no
  -- pg_roles row) cannot vanish -- 0083's own correction, reused rather than re-learned.
  select coalesce(string_agg(distinct rr.rolname, ',' order by rr.rolname), '(none)') into v_grants
    from pg_proc p, aclexplode(p.proacl) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.oid = 'clara.get_artifact_for_human_read(uuid,uuid)'::regprocedure
     and acl.privilege_type = 'EXECUTE';
  if v_grants <> 'clara_fn_owner,clara_runtime' then
    raise exception 'fs7 e2 tail: the byte door''s EXECUTE grantees are % (want clara_fn_owner,clara_runtime)', v_grants
      using errcode = 'CLR10';
  end if;

  select coalesce(string_agg(distinct rr.rolname, ',' order by rr.rolname), '(none)') into v_grants
    from pg_proc p, aclexplode(p.proacl) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.oid = 'clara.list_downloadable_artifacts(uuid,int)'::regprocedure
     and acl.privilege_type = 'EXECUTE';
  if v_grants <> 'clara_authenticated,clara_fn_owner' then
    raise exception 'fs7 e2 tail: the offer door''s EXECUTE grantees are % (want clara_authenticated,clara_fn_owner)', v_grants
      using errcode = 'CLR10';
  end if;

  select coalesce(string_agg(distinct coalesce(rr.rolname,'PUBLIC'), ',' order by coalesce(rr.rolname,'PUBLIC')), '(none)')
    into v_grants
    from pg_proc p, aclexplode(p.proacl) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.oid = 'clara._artifact_download_core(uuid,uuid,uuid,int)'::regprocedure
     and acl.privilege_type = 'EXECUTE';
  if v_grants <> 'clara_fn_owner' then
    raise exception 'fs7 e2 tail: the gate core is executable by % -- it must be owner-only', v_grants
      using errcode = 'CLR10';
  end if;

  -- (3) NO AGENT ROLE, AND NO BROWSER ROLE, REACHES THE BYTE DOOR. Positive census over every
  -- role that must not hold it, read from the ACL rather than inferred from what was granted.
  select count(*) into v_leak
    from pg_proc p, aclexplode(p.proacl) acl
    left join pg_roles rr on rr.oid = acl.grantee
   where p.oid in ('clara.get_artifact_for_human_read(uuid,uuid)'::regprocedure,
                   'clara._artifact_download_core(uuid,uuid,uuid,int)'::regprocedure)
     and acl.privilege_type = 'EXECUTE'
     and (rr.rolname is null   -- PUBLIC
          or rr.rolname in ('clara_authenticated','clara_agent_ro','clara_freeform_ro',
                            'clara_wake_interactive','clara_wake_proactive','clara_wake_bank',
                            'clara_wake_filing','clara_stripe_webhook'));
  if v_leak > 0 then
    raise exception 'fs7 e2 tail: % EXECUTE grant(s) on the byte door/gate to a role that must not hold one', v_leak
      using errcode = 'CLR10';
  end if;

  -- (4) All three are SECURITY DEFINER and owned by clara_fn_owner.
  select coalesce(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), '(none)')
    into v_bad from pg_proc p
   where p.oid in ('clara._artifact_download_core(uuid,uuid,uuid,int)'::regprocedure,
                   'clara.get_artifact_for_human_read(uuid,uuid)'::regprocedure,
                   'clara.list_downloadable_artifacts(uuid,int)'::regprocedure)
     and (not p.prosecdef or p.proowner <> 'clara_fn_owner'::regrole);
  if v_bad <> '(none)' then
    raise exception 'fs7 e2 tail: % is not a clara_fn_owner-owned SECURITY DEFINER', v_bad
      using errcode = 'CLR10';
  end if;

  -- (5) THE OFFER LEAKS NO STORAGE PATH. Read from the shipped body, not from intent: the column
  -- name must not appear anywhere in list_downloadable_artifacts' COMMENT-STRIPPED code (0157's
  -- own instrument -- a comment that NAMES the thing it refuses to return is documentation, and a
  -- check that cannot tell the two apart would have to be satisfied by deleting the explanation).
  if regexp_replace((select p.prosrc from pg_proc p
       where p.oid = 'clara.list_downloadable_artifacts(uuid,int)'::regprocedure),
       '--[^' || chr(10) || ']*', '', 'g') ~ 'storage_key' then
    raise exception 'fs7 e2 tail: the clara_authenticated offer door mentions storage_key in CODE'
      using errcode = 'CLR10';
  end if;

  -- (6) NO NEIGHBOURING BODY MOVED -- this is what makes "no D1 write-quiesce obligation" a
  -- measurement. Five bodies, pinned in the prestate, re-read here.
  foreach n in array array[
      'clara.get_document_for_human_read(uuid,uuid)',
      'clara.verify_report_artifact(uuid)',
      'clara.list_sandbox_exports(uuid,integer)',
      'clara.complete_sandbox_export(uuid,text,text,bigint,text)',
      'clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)'] loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = n::regprocedure;
    select v #>> '{}' into v_pre from _fs7e2_prestate where k = 'sha:' || n;
    if v_sha is distinct from v_pre then
      raise exception 'fs7 e2 tail: % moved (pre %, post %)', n, v_pre, v_sha using errcode = 'CLR10';
    end if;
  end loop;

  raise notice 'fs7 e2 tail: OK -- ONE gate body (clara._artifact_download_core) over BOTH artifact families, owner-only and reachable from no role at all; the BYTE door (get_artifact_for_human_read, the clara.get_document_for_human_read idiom -- resolved principal in, live active membership decides) is granted to clara_runtime and to nothing else, so a storage_key never crosses to a browser and no signed URL is ever minted client-side; the OFFER door (list_downloadable_artifacts) is granted to clara_authenticated and to nothing else, EXECUTES the gate per row rather than copying its predicate, and its shipped body does not contain the string storage_key; every refusal is typed (CLR11 artifact_not_found as ONE shape for absent/foreign-firm/stray-client, CLR04 insufficient_role, CLR10 artifact_superseded / artifact_watermark_unproven / sandbox_export_not_complete / watermark_policy_absent); the draft watermark wall matches \mwatermarked\M so that unwatermarked cannot satisfy it; every successful byte read writes an egress audit line; NO relation, column or row was created or altered and NO live body was replaced -- 5 neighbouring reporting bodies are byte-identical to their prestate pins, so this file carries NO D1 write-quiesce obligation.';
end $tail$;
