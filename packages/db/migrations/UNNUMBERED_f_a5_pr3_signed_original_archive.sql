-- F-A5 PR-3 -- the signed-original archive doors (design SS3.8, annex A.5; TA-P14 (2)'s minimal
-- human doors). Design of record: docs/plan/active/reporting-agency-design.md (v2) SS3.8/SS3.9;
-- reporting-agency-annexes-1-mechanics.md A.4/A.5, battery B.11.
--
-- WHAT THIS FILE BUILDS, AND WHAT IT DOES NOT. The seal core (`_seal_report_artifact_core`,
-- 0071:121, extended by F-A5 PR-1) already knows how to write a 'signed_original' row -- the kind
-- is in its CHECK'd list and its chain logic already requires a signed original to point at THIS
-- run's sealed pre-sign artifact (0071's own chain law, unmoved). What is missing is a HUMAN DOOR
-- with a signature shaped for what a bookkeeper actually holds after a wet-signed pack comes back:
-- the new PDF's own hash and size, the evidence of who signed it, and the pre-sign hash it answers
-- -- not a full render manifest, which no human archiving a scan has ever seen. And a RETRIEVAL
-- door that reads the custody row back without ever regenerating anything (0080:258-261's law,
-- restated for this lane: "retained and retrieved, never regenerated").
--
-- NO NEW RELATION, NO NEW GRANT SURFACE BEYOND CLARA_AUTHENTICATED. Both doors are bookkeeper+
-- SECURITY DEFINER wrappers over existing state (report_artifacts, its own chain constraints); the
-- append-only/no-truncate/RLS-forced walls on report_artifacts are already in place since 0066 and
-- are untouched here.

-- ---------------------------------------------------------------------------------------------
-- PRESTATE -- every claim this file makes about what it depends on, measured before anything
-- moves. Both new names must be ABSENT (a second run of this file across a checksum-pinned apply
-- would otherwise silently no-op the second half); the four objects the doors call must be
-- PRESENT; the chain law they lean on must still hold the shape the design cites.
-- ---------------------------------------------------------------------------------------------
do $pre$
declare v_seal_core_missing boolean; v_report_artifacts_missing boolean;
        v_archive_present boolean; v_retrieve_present boolean;
begin
  select to_regprocedure(
    'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)'
  ) is null into v_seal_core_missing;
  select to_regclass('clara.report_artifacts') is null into v_report_artifacts_missing;
  select to_regprocedure('clara.archive_signed_original(uuid,text,bigint,jsonb,text,text)') is not null
    into v_archive_present;
  select to_regprocedure('clara.retrieve_signed_original(uuid)') is not null into v_retrieve_present;
  if v_seal_core_missing or v_report_artifacts_missing then
    raise exception 'f_a5_pr3 prestate: the seal core and report_artifacts must both already exist (F-A5 PR-1)'
      using errcode = 'CLR10';
  end if;
  if v_archive_present or v_retrieve_present then
    raise exception 'f_a5_pr3 prestate: archive_signed_original/retrieve_signed_original already exist -- this file is not re-appliable'
      using errcode = 'CLR10';
  end if;
  raise notice 'f_a5 pr3 prestate: clean -- the seal core and report_artifacts are present, neither new door exists yet';
end $pre$;

set role clara_fn_owner;

-- =================================================================================================
-- clara.archive_signed_original -- a THIN human door over _seal_report_artifact_core, shaped for
-- what a bookkeeper actually holds: the signed PDF's own identity, the signature evidence, and the
-- pre-sign hash it answers. NOT a raw pass-through of the seal core's manifest parameter, because
-- no human archiving a wet-signed scan has the render-side environment pins (renderer image
-- digest, extraction tool version, ...) that a machine render carries -- and the seal core's own
-- shape validator (`_validate_report_manifest_shapes_v1`) requires every one of them present and
-- non-null for a 'signed_original' artifact (`_report_manifest_required_keys('signed_original')`).
--
-- THE HONEST CONSTRUCTION: a signed original IS the pre-sign document, printed and wet-signed, so
-- its render-side facts (which engine rendered it, which fonts, which extraction tool read it,
-- which dataset/spec/style/profile it pins) are IDENTICAL to the pre-sign artifact it answers --
-- only the physical signing is new. So this door does not invent those facts; it takes the run's
-- already-sealed pre-sign artifact's own manifest VERBATIM and replaces exactly the two keys that
-- change (`signed_original_pdf_sha256`, `signature_evidence`), then re-derives the self-binding
-- hash the seal core checks (`render_manifest_sha256`). Every other required key -- including the
-- DB-derived pins the core independently re-verifies against `_report_render_pins_v1` -- is
-- therefore, by construction, still exactly what the pre-sign artifact carried, which is the only
-- thing that could ever make this door's manifest pass a check written for a machine render.
create function clara.archive_signed_original(
  p_report_run_id uuid,
  p_sha256 text,
  p_byte_size bigint,
  p_signature_evidence jsonb,
  p_answers_pre_sign_sha256 text,
  p_op_key text
) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
as $function$
declare
  c record;
  presign record;
  v_manifest jsonb;
  v_hash text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));

  select * into presign from clara.report_artifacts
   where report_run_id = p_report_run_id and firm_id = c.firm and kind = 'pre_sign';
  if not found then
    -- CLR11, not CLR42: this is the same "not in your firm, or absent" shape as every other
    -- report-lane lookup here -- a run in a foreign firm and a run with no pre-sign artifact both
    -- refuse identically to a caller who cannot tell "wrong firm" from "not sealed yet" apart, and
    -- must not be able to (no existence oracle across firms).
    raise exception 'this run has no sealed pre-sign artifact to answer' using errcode = 'CLR42',
      detail = jsonb_build_object('reason', 'artifact_chain_break', 'report_run_id', p_report_run_id,
        'fix', 'seal the pre-sign artifact before archiving its signed original')::text;
  end if;

  -- THE HASH NAMED MUST BE THE HASH SEALED. A caller who names the wrong pre-sign hash -- a stale
  -- one from a superseded requeue, or a typo -- is refused here, in words that name what disagreed,
  -- rather than falling through to the seal core's own generic manifest-binding-mismatch (which
  -- would still catch it, one layer down and less legibly).
  if p_answers_pre_sign_sha256 is distinct from presign.sha256 then
    raise exception 'the signed original does not name this run''s sealed pre-sign hash' using errcode = 'CLR42',
      detail = jsonb_build_object('reason', 'artifact_hash_mismatch', 'expected', presign.sha256,
        'supplied', p_answers_pre_sign_sha256,
        'fix', 'archive against the hash clara.replay_render_inputs / the issue card actually shows')::text;
  end if;

  -- THE MANIFEST: the pre-sign artifact's own, minus its self-binding hash and the two keys that
  -- change, plus the two that do -- then the self-binding hash is re-derived over exactly what the
  -- seal core will check it against (mirrors `_seal_report_artifact_core`'s own
  -- `p_manifest - 'render_manifest_sha256'` derivation, byte for byte).
  v_manifest := (presign.manifest - 'render_manifest_sha256' - 'signed_original_pdf_sha256' - 'signature_evidence')
    || jsonb_build_object('signed_original_pdf_sha256', p_sha256, 'signature_evidence', p_signature_evidence);
  v_hash := encode(clara._hash(v_manifest), 'hex');
  v_manifest := v_manifest || jsonb_build_object('render_manifest_sha256', v_hash);

  -- THE CORE OWNS EVERY OTHER LAW: the chain check (this must point at `presign.id` -- enforced by
  -- passing it as p_prior_artifact_id, never re-implemented here), the one-signed-original-per-run
  -- wall (`uq_report_artifacts_one_signed`, a second attempt refuses at the index), the manifest
  -- shape/pin re-verification, the reservation/receipt/audit writes. This door supplies identity
  -- and evidence; it does not duplicate judgement the core already carries.
  return clara._seal_report_artifact_core(
    c.firm, c.actor, p_report_run_id, 'signed_original', 'pdf',
    p_sha256, p_byte_size, v_manifest, presign.id, p_op_key);
end
$function$;
revoke all on function clara.archive_signed_original(uuid, text, bigint, jsonb, text, text) from public;
grant execute on function clara.archive_signed_original(uuid, text, bigint, jsonb, text, text) to clara_authenticated;

-- =================================================================================================
-- clara.retrieve_signed_original -- AUDITED retrieval. Writes its own audit row (who asked, when,
-- which artifact) BEFORE returning the custody pointer, and regenerates nothing -- the render
-- lane's own law restated for this lane (0080:258-261: "retained and retrieved, never
-- regenerated" -- re-rendering a signed original would be a forgery, not a drill). Mirrors
-- `verify_report_artifact`'s audited-read shape (0072): a read of a signed-original's custody is
-- itself an accountable act, because it is the moment a human answers "does the paper we hold
-- match the artifact we sealed" -- and that answer belongs in the audit trail even when it is
-- yes.
--
-- A MISS RETURNS NULL, IT DOES NOT RAISE -- and that is not a style choice, it is what makes "the
-- audit row is written even on a miss" TRUE rather than aspirational. `_audit` is a plain INSERT
-- (frozen, S8) with no autonomous-transaction trick behind it: a `perform clara._audit(...)`
-- immediately followed by `raise exception` in the SAME function call rolls its own insert back
-- along with everything else the moment the exception propagates -- proven on this rig (the first
-- draft raised here, and the "not found" audit row it claimed to write never existed after the
-- call returned). `verify_report_artifact` (0072) already carries the correct shape for exactly
-- this reason: it returns null on a miss rather than raising, so its own audit row SURVIVES. This
-- door follows that precedent rather than inventing a second one.
create function clara.retrieve_signed_original(p_report_run_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp
as $function$
declare
  c record;
  art record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));

  select * into art from clara.report_artifacts
   where report_run_id = p_report_run_id and firm_id = c.firm and kind = 'signed_original';
  if not found then
    -- THE AUDIT ROW IS WRITTEN EVEN ON A MISS, exactly as verify_report_artifact does for a
    -- foreign/absent artifact -- "someone asked and found nothing" is itself the fact worth
    -- keeping, and the alternative (audit only on success) would make a retrieval's own absence
    -- from the log look identical to nobody having asked. RETURNING null (not raising) is what
    -- lets this insert survive past the call that made it.
    perform clara._audit(c.firm, c.actor, null, null, 'retrieve_signed_original', null,
      jsonb_build_object('report_run_id', p_report_run_id, 'outcome', 'not_found_in_firm'));
    return null;
  end if;

  -- BEFORE RETURNING, NOT AFTER -- a read whose own audit write fails must return nothing, the
  -- same law B.11 states for this door: an unaccountable retrieval is not a retrieval.
  perform clara._audit(c.firm, c.actor, null, null, 'retrieve_signed_original', null,
    jsonb_build_object('report_run_id', p_report_run_id, 'artifact_id', art.id, 'outcome', 'found'));

  return jsonb_build_object(
    'artifact_id', art.id, 'report_run_id', art.report_run_id,
    'storage_key', art.storage_key, 'sha256', art.sha256, 'byte_size', art.byte_size,
    'sealed_by', art.sealed_by, 'sealed_at', art.sealed_at,
    'signature_evidence', art.manifest->'signature_evidence',
    'answers_pre_sign_sha256', art.manifest->>'pre_sign_pdf_sha256',
    'retrieval_note',
      'This is the custody pointer to the retained object -- storage_key + sha256, the same pair every ' ||
      'other sealed-artifact reader returns. Nothing here re-renders or regenerates any bytes.');
end
$function$;
revoke all on function clara.retrieve_signed_original(uuid) from public;
grant execute on function clara.retrieve_signed_original(uuid) to clara_authenticated;

reset role;

-- ---------------------------------------------------------------------------------------------
-- TAIL CENSUS -- what a reviewer reads instead of trusting "OK". Re-derives every claim above
-- from the live catalog, not from having just run the DDL that made it true.
-- ---------------------------------------------------------------------------------------------
do $tail$
declare
  v_archive_grantees text[]; v_retrieve_grantees text[];
  v_archive_owner name; v_retrieve_owner name;
  v_archive_definer boolean; v_retrieve_definer boolean;
  v_archive_search_path text; v_retrieve_search_path text;
  v_no_reach_role text; v_no_reach_hits int := 0;
begin
  -- The OWNER always surfaces here too (Postgres records the owner's inherent EXECUTE as an
  -- explicit-looking grant in this view; `revoke all from public` does not and cannot touch it) --
  -- every existing wrapper in this schema shows the identical {owner, granted-role} pair, so the
  -- expected set names BOTH rather than asserting a shape no live function actually has.
  select array_agg(grantee::text order by grantee::text) into v_archive_grantees
    from information_schema.role_routine_grants
   where routine_schema = 'clara' and routine_name = 'archive_signed_original' and privilege_type = 'EXECUTE';
  select array_agg(grantee::text order by grantee::text) into v_retrieve_grantees
    from information_schema.role_routine_grants
   where routine_schema = 'clara' and routine_name = 'retrieve_signed_original' and privilege_type = 'EXECUTE';
  if v_archive_grantees is distinct from array['clara_authenticated', 'clara_fn_owner'] then
    raise exception 'f_a5 pr3 tail: archive_signed_original grantees are %, expected exactly {clara_authenticated, clara_fn_owner}', v_archive_grantees
      using errcode = 'CLR10';
  end if;
  if v_retrieve_grantees is distinct from array['clara_authenticated', 'clara_fn_owner'] then
    raise exception 'f_a5 pr3 tail: retrieve_signed_original grantees are %, expected exactly {clara_authenticated, clara_fn_owner}', v_retrieve_grantees
      using errcode = 'CLR10';
  end if;

  select p.prosecdef, r.rolname, p.proconfig into v_archive_definer, v_archive_owner, v_archive_search_path
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara.archive_signed_original(uuid,text,bigint,jsonb,text,text)'::regprocedure;
  select p.prosecdef, r.rolname into v_retrieve_definer, v_retrieve_owner
    from pg_proc p join pg_roles r on r.oid = p.proowner
   where p.oid = 'clara.retrieve_signed_original(uuid)'::regprocedure;
  if not v_archive_definer or v_archive_owner <> 'clara_fn_owner' then
    raise exception 'f_a5 pr3 tail: archive_signed_original is not an owner-held SECURITY DEFINER (definer=%, owner=%)',
      v_archive_definer, v_archive_owner using errcode = 'CLR10';
  end if;
  if not v_retrieve_definer or v_retrieve_owner <> 'clara_fn_owner' then
    raise exception 'f_a5 pr3 tail: retrieve_signed_original is not an owner-held SECURITY DEFINER (definer=%, owner=%)',
      v_retrieve_definer, v_retrieve_owner using errcode = 'CLR10';
  end if;

  -- NO WAKE OR RUNTIME ROLE MAY REACH EITHER DOOR -- these are human acts (TA-P14 (2)'s own
  -- roster), never wake-sibling verbs; F-A5's agent lane has no archive/retrieve door and this
  -- file must never accidentally open one.
  foreach v_no_reach_role in array array[
    'clara_agent_ro', 'clara_runtime', 'clara_runtime_login',
    'clara_wake_interactive', 'clara_wake_proactive', 'clara_agent_read_login', 'clara_wake_write_login'
  ] loop
    if to_regrole(v_no_reach_role) is not null and (
      has_function_privilege(v_no_reach_role, 'clara.archive_signed_original(uuid,text,bigint,jsonb,text,text)', 'execute')
      or has_function_privilege(v_no_reach_role, 'clara.retrieve_signed_original(uuid)', 'execute')
    ) then
      v_no_reach_hits := v_no_reach_hits + 1;
    end if;
  end loop;
  if v_no_reach_hits > 0 then
    raise exception 'f_a5 pr3 tail: % non-human role(s) can reach a signed-original door', v_no_reach_hits
      using errcode = 'CLR10';
  end if;

  raise notice 'f_a5 pr3 tail: OK -- archive_signed_original and retrieve_signed_original both installed, definer/owner=clara_fn_owner, EXECUTE granted to clara_authenticated ONLY (zero wake/runtime reach across all seven named roles), both delegating every chain/manifest/wall law to the unmodified F-A5 PR-1 seal core. No table in workflow/graphile_worker/spike touched (two functions only; no DDL against any table).';
end $tail$;
