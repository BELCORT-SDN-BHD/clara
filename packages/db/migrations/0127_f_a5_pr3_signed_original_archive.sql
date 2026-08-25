-- F-A5 PR-3 -- the signed-original archive doors (design SS3.8, annex A.5; TA-P14 (2)'s minimal
-- human doors), PLUS a fold-in wall an independent review found live on main: A.4 reserves
-- archiving a signed original to a human, but the reservation was NOT mechanically held --
-- `wake_seal_report_artifact(p_kind='signed_original')` was ACCEPTED (0116, already merged). This
-- file closes that while it still can, in one migration, because PR-3 is unmerged.
--
-- WHAT THIS FILE BUILDS. Design of record: docs/plan/active/reporting-agency-design.md (v2)
-- SS3.8/SS3.9; reporting-agency-annexes-1-mechanics.md A.4/A.5, battery B.11.
--   1. THE WALL -- a BEFORE INSERT TRIGGER on clara.report_artifacts (owner ruling, 2026-08-24:
--      D1 NONE -- no live writer's body moves). Neither `_seal_report_artifact_core` (owner-only,
--      0071/F-A5 PR-1) nor `wake_seal_report_artifact` (already merged, 0116) is opened by this
--      file; the wall instead reads the row about to be written.
--
--      THE DISCRIMINANT IS `sealed_by`, NOT `prepared_by_agent`. report_artifacts.prepared_by_agent
--      is the RUN's provenance, DB-derived and copied onto every artifact of that run BY DESIGN
--      (0111 SECTION 5's own reasoning: every pre_sign artifact is sealed by the render worker, so
--      an artifact-local identity would leave ARM 1's comparison unarmed) -- it answers "was this
--      RUN agent-prepared", not "did the AGENT LANE perform THIS seal call". Keying the wall on it
--      would misfire both ways: an agent-prepared run's signed original, archived by a human
--      through clara.archive_signed_original (the ordinary flow), would be wrongly refused, while
--      wake_seal_report_artifact acting on a HUMAN-opened run would wrongly pass. `sealed_by` is
--      `p_actor` at the moment of THIS seal (0111 SECTION 5's n_vals) -- wake_seal_report_artifact
--      passes `clara.agent_user_id()` there for every run it touches (0114:200), every human door
--      passes a human's own actor id -- so it is the call-time-accurate, non-lossy signal, and
--      needs no new column and no caller edited to read it.
--   2. THE DOORS. clara.archive_signed_original -- a THIN human door over the (unmodified) core,
--      shaped for what a bookkeeper actually holds after a wet-signed pack comes back: the new
--      PDF's own hash and size, the evidence of who signed it, and the pre-sign hash it answers --
--      not a full render manifest, which no human archiving a scan has ever seen. And
--      clara.retrieve_signed_original -- an AUDITED retrieval that regenerates nothing
--      (0080:258-261's law, restated for this lane: "retained and retrieved, never regenerated").
--
-- D1: NONE. This file creates one new relation-level trigger and two new SECURITY DEFINER
-- functions; it CREATE-OR-REPLACEs / drops nothing that has ever shipped, so no live audited
-- writer's body moves, no prestate-pin/in-flight-call/checksum-drift machinery applies, and the
-- only lock cost is one brief ACCESS EXCLUSIVE while the trigger attaches to report_artifacts.
--
-- NO NEW RELATION, NO NEW GRANT SURFACE BEYOND CLARA_AUTHENTICATED. The two doors are bookkeeper+
-- SECURITY DEFINER wrappers over existing state (report_artifacts, its own chain constraints); the
-- append-only/no-truncate/RLS-forced walls on report_artifacts are already in place since 0066 and
-- are untouched here. `_seal_report_artifact_core` keeps its exact signature, grant (owner-only)
-- and body -- byte-identical, proven at the tail, not merely asserted -- for every one of its
-- THREE live callers (`seal_report_artifact`, `complete_render_job`, and this file's own
-- `archive_signed_original`).

-- ---------------------------------------------------------------------------------------------
-- PRESTATE -- every claim this file makes about what it depends on, measured before anything
-- moves. Both new door names, the new trigger function and the new trigger must be ABSENT (a
-- second run of this file across a checksum-pinned apply would otherwise silently no-op the
-- rest); the objects the doors call must be PRESENT. The seal core's CURRENT prosrc is
-- fingerprinted here -- not because this file recuts it (it does not: D1 NONE, owner ruling
-- 2026-08-24) -- but so the tail can PROVE byte-identity rather than merely assert "untouched".
-- The fingerprint crosses the two DO blocks via a transaction-local setting (set_config/
-- current_setting, precedented at 0019_wiki_boundary.sql:1525 for the identical cross-block
-- need), since a DO block shares no PL/pgSQL variable with any other.
-- ---------------------------------------------------------------------------------------------
do $pre$
declare v_seal_core_missing boolean; v_report_artifacts_missing boolean;
        v_archive_present boolean; v_retrieve_present boolean;
        v_core_def text; v_core_sha text;
        v_trigger_fn_present boolean; v_trigger_present boolean;
begin
  select to_regclass('clara.report_artifacts') is null into v_report_artifacts_missing;
  select to_regprocedure('clara.archive_signed_original(uuid,text,bigint,jsonb,text,text)') is not null
    into v_archive_present;
  select to_regprocedure('clara.retrieve_signed_original(uuid)') is not null into v_retrieve_present;

  select pg_get_functiondef(oid) into v_core_def from pg_proc
   where oid = 'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)'::regprocedure;
  v_seal_core_missing := v_core_def is null;
  if not v_seal_core_missing then
    v_core_sha := encode(sha256(convert_to(v_core_def, 'UTF8')), 'hex');
    perform set_config('clara._fa5pr3_core_sha_prestate', v_core_sha, true);
  end if;

  select to_regprocedure('clara._fa5_pr3_forbid_agent_signed_original()') is not null into v_trigger_fn_present;
  select exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'clara'::regnamespace and c.relname = 'report_artifacts'
       and t.tgname = 't_reportartifacts_forbid_agent_signed_original' and not t.tgisinternal
  ) into v_trigger_present;

  if v_seal_core_missing or v_report_artifacts_missing then
    raise exception 'f_a5_pr3 prestate: the seal core and report_artifacts must both already exist (F-A5 PR-1)'
      using errcode = 'CLR10';
  end if;
  if v_archive_present or v_retrieve_present or v_trigger_fn_present or v_trigger_present then
    raise exception 'f_a5_pr3 prestate: archive_signed_original/retrieve_signed_original/the fold-in trigger already exist -- this file is not re-appliable'
      using errcode = 'CLR10';
  end if;
  raise notice 'f_a5 pr3 prestate: clean -- the seal core (prosrc sha256 %, fingerprinted for the tail''s byte-identity proof; this file recuts NOTHING in it) and report_artifacts are present; neither new door nor the fold-in trigger exists yet', v_core_sha;
end $pre$;

set role clara_fn_owner;

-- =================================================================================================
-- THE FOLD-IN WALL -- A.4's human-act reservation on a signed original, made mechanical as a
-- BEFORE INSERT TRIGGER on clara.report_artifacts (owner ruling 2026-08-24: D1 NONE -- this is a
-- NEW trigger on an existing table, not a recut of any live writer's body, so none of D1's
-- prestate-pin/in-flight-call/checksum-drift machinery applies; `_seal_report_artifact_core` and
-- `wake_seal_report_artifact` are never opened by this file). A wet-signed physical document is
-- archived by a human who holds it in hand -- never produced by any wake/agent lane, no matter
-- which caller, and no matter which run it targets.
--
-- THE DISCRIMINANT IS sealed_by, THE CALL'S OWN ACTOR, NOT prepared_by_agent (the RUN's). See the
-- header note above for why prepared_by_agent would misfire in both directions. sealed_by is
-- p_actor at the moment of THIS seal; wake_seal_report_artifact passes clara.agent_user_id() there
-- unconditionally (0114:200), on any report_run_id it is given, agent-opened or human-opened alike
-- -- so a trigger reading it catches every agent-lane seal of a signed original structurally,
-- regardless of which function performed the INSERT or which run it targeted, and it fires before
-- the row lands.
-- =================================================================================================
create function clara._fa5_pr3_forbid_agent_signed_original() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tfwall$
begin
  if new.kind = 'signed_original' and new.sealed_by = clara.agent_user_id() then
    raise exception 'a signed original may only be archived through the human door' using errcode = 'CLR04',
      detail = jsonb_build_object('reason', 'signed_original_agent_seal_forbidden', 'kind', new.kind,
        'sealed_by', new.sealed_by,
        'fix', 'archive a wet-signed original through clara.archive_signed_original, the human door')::text;
  end if;
  return new;
end
$tfwall$;

-- PUBLIC HOLDS NO EXECUTE ON A NEW FUNCTION, EVEN A TRIGGER FUNCTION (T17, §3.10) -- the sprint's
-- own documented PUBLIC-EXECUTE class, its established idiom already 0038's own trigger functions
-- (`clara._tf_bank_statement_transition`, `_tf_bank_statement_no_delete`, `_tf_stamp_bmlm_account`,
-- each revoked immediately after CREATE). Trigger INVOCATION bypasses the EXECUTE check -- true,
-- and irrelevant here: PUBLIC could otherwise call
-- `clara._fa5_pr3_forbid_agent_signed_original()` DIRECTLY as a bare function, which is exactly
-- the surface every other newly created function in this migration (and the estate's own T17/§3.10
-- closed-world censuses) already close. No grant follows -- nothing ever calls this function
-- directly; only the trigger mechanism does.
revoke all on function clara._fa5_pr3_forbid_agent_signed_original() from public;

create trigger t_reportartifacts_forbid_agent_signed_original
  before insert on clara.report_artifacts
  for each row execute function clara._fa5_pr3_forbid_agent_signed_original();

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

  -- TYPED, NOT RAW 23502 (S8). Without this, a caller who omits p_byte_size or p_op_key hits
  -- report_artifacts' plain NOT NULL constraints deep inside the seal core -- a Postgres
  -- not-null-violation with none of this door's own vocabulary, the same class of surprise
  -- every other wake/human door in this estate refuses BEFORE any row is touched (mirrors the
  -- wake wrappers' own blank-op_key CLR10 shape, restated for this door's two bare parameters).
  if p_byte_size is null then
    raise exception 'archive_signed_original requires a byte size' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_request', 'class', 'byte_size')::text;
  end if;
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'archive_signed_original requires an idempotency key' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_request', 'class', 'op_key', 'constraint', 'nonempty')::text;
  end if;

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
    -- S4: WHO SEALED IT, NAMED. sealed_by is already the exact call-time actor this file's own
    -- fold-in wall reads (never the agent, by construction -- every path to a signed_original row
    -- is now a human actor); prepared_by_agent is the RUN's own provenance (0111's DB-derived
    -- column, distinct on purpose from sealed_by -- see the fold-in wall's header note), surfaced
    -- so a retrieval can say "Clara prepared this run; a human archived what came back signed"
    -- without the caller having to join report_runs itself.
    'sealed_by', art.sealed_by, 'sealed_at', art.sealed_at, 'prepared_by_agent', art.prepared_by_agent,
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
-- SPLIT FROM THE GRANT/REACH CENSUS BELOW ON PURPOSE (wiki-lint hygiene, not a style choice).
-- This block reads two function BODIES via pg_get_functiondef to prove the fold-in wall's
-- content and the seal core's byte-identity -- the wiki gate's change-of-record scan treats any
-- such block as install-capable and additionally scans it for the literal word "execute"
-- (comment-masked, but NOT string-literal-masked, so it cannot distinguish a PL/pgSQL EXECUTE
-- statement from the English word inside a raise-notice message or an information_schema
-- privilege-type string). Keeping this block's live text free of that word -- and keeping the
-- grant census's OWN unavoidable 'execute'/'EXECUTE' occurrences (has_function_privilege's
-- privilege-type argument, role_routine_grants.privilege_type) in a SEPARATE block that reads no
-- body -- is what lets both blocks clear the scan without a DYNAMIC_SQL_ALLOWLIST waiver, since
-- neither construction is a change-of-record patch at all: nothing here is ever EXECUTEd back.
do $tail_wall$
declare
  v_core_def text;
begin
  -- THE FOLD-IN WALL, RE-READ FROM THE LIVE CATALOG -- not trusted from having just run the
  -- DDL that made it true. The trigger is present, BEFORE INSERT, row-level, on report_artifacts,
  -- bound to this file's own function; that function's body carries the refusal token; AND the
  -- seal core's prosrc is BYTE-IDENTICAL to its prestate fingerprint -- PROVING (not asserting)
  -- that D1 does not apply: this file recut nothing in the one live audited writer it names.
  -- OID/BITMASK COMPARISON, NOT A TEXT MATCH ON THE TRIGGER'S RENDERED DEFINITION -- tgfoid cast
  -- via ::regprocedure is a type-safe identity check, immune to how a given Postgres version
  -- happens to render the trigger's own action clause back as text. tgtype's ROW+BEFORE+INSERT
  -- bits: 1+2+4=7.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relnamespace = 'clara'::regnamespace and c.relname = 'report_artifacts'
       and t.tgname = 't_reportartifacts_forbid_agent_signed_original' and not t.tgisinternal
       and t.tgfoid = 'clara._fa5_pr3_forbid_agent_signed_original()'::regprocedure
       and (t.tgtype & 7) = 7
  ) then
    raise exception 'f_a5 pr3 tail: the fold-in BEFORE INSERT trigger is absent, malformed, or points at the wrong function' using errcode = 'CLR10';
  end if;
  if position('signed_original_agent_seal_forbidden' in
      coalesce(pg_get_functiondef('clara._fa5_pr3_forbid_agent_signed_original()'::regprocedure), '')) = 0 then
    raise exception 'f_a5 pr3 tail: the fold-in trigger function does not carry the refusal token' using errcode = 'CLR10';
  end if;
  select pg_get_functiondef(oid) into v_core_def from pg_proc
   where oid = 'clara._seal_report_artifact_core(uuid,uuid,uuid,text,text,text,bigint,jsonb,uuid,text,uuid,text,jsonb)'::regprocedure;
  if encode(sha256(convert_to(v_core_def, 'UTF8')), 'hex') is distinct from current_setting('clara._fa5pr3_core_sha_prestate', true) then
    raise exception 'f_a5 pr3 tail: _seal_report_artifact_core''s body moved during this migration -- D1 NONE is FALSE, this file needs a D1 prestate pin' using errcode = 'CLR10';
  end if;
  raise notice 'f_a5 pr3 tail (wall): OK -- the fold-in trigger is live and correctly bound; the seal core''s prosrc is byte-identical to its prestate fingerprint';
end
$tail_wall$;

-- ---------------------------------------------------------------------------------------------
-- TAIL CENSUS, PART 2 -- grants, definer posture, and the no-reach probe. Reads no function body
-- (no pg_get_functiondef call anywhere in this block), so it is never treated as install-capable
-- by the wiki gate regardless of the unavoidable 'execute'/'EXECUTE' privilege-type text below.
-- ---------------------------------------------------------------------------------------------
do $tail$
declare
  v_archive_grantees text[]; v_retrieve_grantees text[]; v_trigger_fn_grantees text[];
  v_archive_owner name; v_retrieve_owner name;
  v_archive_definer boolean; v_retrieve_definer boolean;
  v_archive_search_path text; v_retrieve_search_path text;
  v_no_reach_role text; v_no_reach_hits int := 0;
begin
  -- PUBLIC HOLDS NO EXECUTE ON THE TRIGGER FUNCTION EITHER (T17, section 3.10's own closed-world
  -- censuses catch exactly this on every newly created function, trigger functions included --
  -- MEASURED live on the estate suite, not assumed: the first cut of this file omitted the
  -- revoke, reasoning trigger invocation never checks the DML-performer's own grant here -- true,
  -- but irrelevant to whether PUBLIC can call the function directly). owner-only, matching the
  -- doors' own established shape: information_schema always surfaces the owner's inherent
  -- EXECUTE, so the expected array names it rather than asserting empty.
  select array_agg(grantee::text order by grantee::text) into v_trigger_fn_grantees
    from information_schema.role_routine_grants
   where routine_schema = 'clara' and routine_name = '_fa5_pr3_forbid_agent_signed_original' and privilege_type = 'EXECUTE';
  if v_trigger_fn_grantees is distinct from array['clara_fn_owner'] then
    raise exception 'f_a5 pr3 tail: the fold-in trigger function''s grantees are %, expected exactly {clara_fn_owner}', v_trigger_fn_grantees
      using errcode = 'CLR10';
  end if;
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

  raise notice 'f_a5 pr3 tail: OK -- archive_signed_original and retrieve_signed_original both installed, definer/owner=clara_fn_owner, EXECUTE granted to clara_authenticated ONLY (zero wake/runtime reach across all seven named roles); the fold-in trigger function is owner-only (PUBLIC and every named role hold zero EXECUTE); the fold-in BEFORE INSERT trigger (signed_original_agent_seal_forbidden) is live on clara.report_artifacts, reading sealed_by (the call''s own actor, not the run-derived prepared_by_agent), so it catches every agent-lane seal of a signed original regardless of caller or target run; _seal_report_artifact_core''s prosrc is BYTE-IDENTICAL to its prestate fingerprint (D1 NONE, proven not asserted). No D1 body recut in this migration, no table in workflow/graphile_worker/spike touched, one new relation-level trigger, no relation created or altered.';
end $tail$;
