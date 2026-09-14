-- 0196_restore_pre_0195_bodies — THE RELEASE ROLLBACK for the hosted 0188…0195 run.
-- DRAFT. NOT APPLIED. NOT PLACED UNDER packages/db/migrations. Drafted per
-- docs/plan/active/refresh-wave-2026-09-14/RELEASE-RUNBOOK.md steps 3e / 6d / 9.
-- =====================================================================================
-- WHY THIS FILE EXISTS AT ALL. The release applies 0188…0195 in ONE run with the single Fly
-- machine stopped. Afterwards there is no way back DOWN: clara.schema_migrations is an
-- append-only ledger, scripts/migrate.mjs has no `down`, and once the frontier is 0195 the old
-- runtime image v82 (claraWork_v2) is not a legal boot target — packages/runtime/lib/
-- rollback-preflight.mjs REFUSES it with `frontier_requires_body`, exit 1 (the wave-3 ruling,
-- ARCHITECTURE §10). The only honest DATABASE rollback this release has is therefore a NEW
-- append-only migration that puts the RECUT LIVE FUNCTION BODIES back to their pre-release text,
-- paired with a compatibility image. 0191 says exactly this at its own splice (0191:598-600):
--
--     "APPLY DURING THE WRITER-QUIESCENCE WINDOW for function-body replacement. The rollback is
--      the reverse dependency: a NEW append-only migration restoring the prior body. Never edit
--      0191."
--
-- This is that migration. The other rollback levers are unchanged and are NOT this file's job:
-- web is one `wrangler versions deploy <id>@100%`; the runtime is a deploy by digest; a whole-
-- estate restore is scripts/restore-full.mjs from the step-0a `backup:full` artefact.
--
-- DEPLOY ORDER — TWO STEPS, IN THIS ORDER, AND NEITHER ALONE:
--   1. STOP the writer (`flyctl machine stop 48ee715b763048`), then apply THIS FILE through the
--      DSN pipe exactly as step 6c applies the release. The frontier goes 0195 -> 0196 (191).
--   2. THEN release the COMPATIBILITY IMAGE and start the machine. That image MUST carry the
--      `claraWork_v3` body — see WHAT THIS DOES NOT ACHIEVE below. Applying this file without
--      that image leaves the estate in the state the preflight already refuses; releasing that
--      image without this file leaves 0195's wall standing.
--
-- =====================================================================================
-- WHAT IT RESTORES — TWO BODIES — AND WHAT IT DELIBERATELY LEAVES ALONE — NINE.
--
-- The release recut ELEVEN live bodies. A rollback that restored all eleven would not be a
-- rollback; it would be a second, unreviewed change. Every one was read as a diff — pre-image off
-- rig637/clara_637, a pristine 0187 chain whose 0187_legal_v1_beta_publication ledger checksum is
-- production's own 5fc28e38283088dddef0150384e9a18949301c9bf0ee89cf52957a2f9c5abd46; post-image
-- off rigw3b/clara_w3 at 0195 — and decided on ONE test: does putting the old text back serve the
-- rollback GOAL (run the pre-release lanes under a frontier that cannot move down) without
-- destroying an object, a control or a row that the append-only half of the release leaves
-- standing?
--
--   RESTORED (2)
--   ------------
--   clara._record_journal_entry_core  -> its 0194 body, NOT its 0184 body. THE HEART OF THIS FILE.
--       0195 inserted ONE contiguous 86-line block into 0194's body (the `#631 INSERTION` wall:
--       CLR13 `egress_not_authorized` unless the run holds a CONSUMED, non-invalidated
--       `accounting_work` authorization bound to clara._work_egress_event_seq(work, run), with
--       pre-v3 bundles grandfathered). NOTHING ELSE in the body moved — measured: a unified diff
--       of 0194's own file text against the installed 0195 prosrc is exactly that one hunk and
--       nothing else. Removing it IS the rollback: the Work lane posts again without the wall.
--
--       WHY THE 0194 BODY AND NOT THE PRE-RELEASE 0184 BODY. The 0184 body predates #643. It
--       carries none of 0194's periodic-adjustment arms, so restoring it would silently stop
--       writing clara.periodic_adjustments rows for kind='periodic_adjustment' Work that 0194's
--       relations, CHECKs and clara.admit_periodic_adjustment_work door still accept — a rollback
--       that manufactures orphaned accounting state. It would also contradict the two 0194 bodies
--       this file deliberately KEEPS (_close_gate_closing_stock, _tf_accounting_work_immutable).
--       The rollback goal is the runbook's own words — "run the Work lane without 0195's egress
--       wall" — not "un-ship #643", so the honest restore target is 0194's body.
--
--   clara.persist_document_extraction -> its 0123 body. 0191 spliced in exactly ONE statement,
--       `perform clara._assert_field_path(elem->>'field_path');`. That grammar is enforced at
--       THIS DOOR ONLY: there is no table CHECK on clara.document_regions.field_path carrying it
--       (re-read off the 0195 catalog — the only field_path CHECKs in clara are 0017's
--       opening-fact rule and two `btrim(...) <> ''` guards on other relations), so this one line
--       is the whole wall. It is the wall the runbook's failure branch 6d(ii) names: the
--       pre-release structured worker emits XLSX `r=` field paths that 0191's grammar refuses with
--       CLR10, leaving the task running. A compatibility image on the pre-release document lane
--       needs this restore; without it the rollback fixes the Work lane and breaks extraction.
--       clara._assert_field_path itself is LEFT STANDING (unused by this body, still granted,
--       still the grammar of record) — this file removes a CALL, never a definition.
--
--   KEPT AT THEIR RELEASED TEXT (9), each with its reason
--   -----------------------------------------------------
--   clara.prepare_egress_dispatch (0195) — KEPT, and this is the decision that most looks like an
--       omission. Restoring the 0123 body would narrow the purpose allowlist back to five, and
--       its unknown-purpose arm RETURNS {"verdict":"unknown"} rather than raising. claraWork_v3
--       calls clara.prepare_work_egress_dispatch -> this verb -> clara.consume_egress_dispatch at
--       claraWork.v3.impl.ts:280,291 and, on a non-granted verdict, ends the segment with
--       egressRefused / finishReason='egress_not_authorized' BEFORE the model. Restoring it would
--       strand every parked claraWork_v3 run — exactly the runs this rollback exists to unblock —
--       one step EARLIER than 0195's wall did. KEPT.
--   clara.grant_/activate_/deactivate_/revoke_client_egress_purpose (0195, four verbs) — KEPT.
--       0195 only widened their in-body allowlists to the sixth purpose (and gave `grant` a typed
--       CLR10 `purpose_derived_not_grantable`). The sixth purpose stays in all three table CHECKs
--       (append-only) and the derived consent/activation ROWS the release minted stay. Restoring
--       the five-purpose bodies would take away the owner's ONLY typed kill switch over rows that
--       still exist and that clara.consume_egress_dispatch still honours: a safety loss with no
--       rollback benefit.
--   clara.admit_journal_work (0194) — KEPT. 0194 turned a 158-line inline body into a four-line
--       delegation to clara._admit_accounting_work_core(..., 'journal_entry', ...). Same
--       signature, same kind, same behaviour for every pre-release caller; restoring the inline
--       body would FORK journal admission away from the core the adjustment door still uses.
--   clara._close_gate_closing_stock (0194/#643) — KEPT. Its answer object IS the close gate's
--       measured_digest, and 0194's header records that the digest move is intended and
--       user-visible. Restoring the 0056 body would flip that digest a SECOND time, invalidating
--       every attestation taken since the release, and would re-assert `no_producer_verb: true`
--       about an instrument that still exists in this database. A rollback must not lie.
--   clara._tf_accounting_work_immutable (0194/#643) — KEPT. 0194 added `adjustment_basis` to the
--       frozen-column set. Restoring the old set would make that column MUTABLE on rows that
--       still carry it: a strict safety regression with zero rollback benefit.
--   clara.save_my_preferences (0189/#641) — KEPT. The recut is purely ADDITIVE in what it accepts
--       (one new `elsif v_key = 'workViews'` arm inside the existing key loop), so every
--       pre-release patch behaves identically against it. Restoring buys nothing and would make
--       any interface.workViews rows the release already stored permanently unsaveable.
--
--   NOT A BODY QUESTION: tables, columns, CHECKs, new doors, new roles and new data from
--   0188…0195 all STAY. This file creates and drops nothing. Both restored bodies reference only
--   objects that exist in the 0195 catalog — 0195 is purely additive at the object level and both
--   restores REMOVE references rather than add them — so neither can fail to compile against the
--   estate it lands on. The runner's check_function_bodies pin validates both at CREATE time.
--
-- =====================================================================================
-- THE PIN TABLE. post-image = the body this file must FIND; pre-image = the body it INSTALLS.
-- Every value was derived twice and the two agree byte for byte: read off a live database, and
-- re-derived from the migration file text this file copies (0194_periodic_adjustments.sql for the
-- core, 0123_f_a7_gamma_egress.sql for persist).
--
--   clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)
--     post (0195, MUST FIND) f9c4f5258fdd45c115871c67bfb3af9b91a587ff9f723d340b583e052defa4fb
--     pre  (0194, INSTALLS ) eca58b99c45b53fe3c36dcd1b238a1d94b2b8c01a305e8debc4f0a6ca03d4ade
--
--   clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)
--     post (0191, MUST FIND) 0230031fe7d3f18332310fc19f39936b1408cb89ba597f77ce576017fea35905
--     pre  (0123, INSTALLS ) 8ba95a5210ad839d510729baebff3863862b6073691bf6efaaa7f6e38b8e2354
--
-- The core's pre-image IS 0195's own prestate pin ("clara._record_journal_entry_core has DRIFTED
-- from the pinned 0194 body"), and persist's pre-image IS 0191's own prestate pin. This file
-- therefore restores each body to the exact text the release migration itself measured before it
-- moved it — never to a text somebody retyped. The post-images are 0195's recorded installed core
-- sha (the grandfather cut, wave-3 report) and 0191's own splice-poststate pin.
--
-- =====================================================================================
-- WHAT THIS ROLLBACK ACHIEVES, AND WHAT IT DOES NOT. READ BOTH BEFORE RUNNING IT.
--
-- IT DOES:
--   * Stop the accounting write from requiring a consumed accounting_work egress authorization.
--     Every parked Work posts again: the v1/v2 runs 0195 grandfathered, AND the claraWork_v3 runs
--     0195 walled because their authorization was missing, invalidated, or withdrawn after the
--     consume. Said plainly: PARKED v3 RUNS THEN POST WITHOUT THE WALL. That is the intended
--     effect of a rollback, and it is the cost of one.
--   * Stop clara.persist_document_extraction refusing a non-conforming field_path, so a
--     pre-release structured worker's XLSX `r=` paths land again instead of raising CLR10 and
--     leaving the task running (runbook 6d(ii)).
--
-- IT DOES NOT:
--   * MOVE THE FRONTIER DOWN. It moves it UP, to 0196. max(clara.schema_migrations.version) stays
--     at or past 0195 forever, and that is precisely what the preflight reads.
--   * CLEAR `frontier_requires_body`. The preflight rule is DATA keyed on the frontier
--     (FRONTIER_BODY_RULES: frontier >= 0195 and claraWork_v3 not carried => REFUSED, exit 1), it
--     is global, no scope clears it, and this file does not touch it. THE COMPATIBILITY IMAGE
--     MUST CARRY claraWork_v3. v82 (registry.fly.io/clara-runtime:refresh-98f6eec6) carries 50
--     bodies and NOT that one, so v82 is STILL not a legal boot target after this migration. What
--     changes is only that the restored core no longer REQUIRES the authorization the v3 body was
--     built to obtain.
--   * REMOVE the sixth purpose, clara.work_execution_traces, the derived consents, the
--     0188…0195 relations, or any row. Append-only means append-only.
--   * UNDO the runtime or the web. Those roll back on their own levers, and only the web's is one
--     command.
--
-- THE COMPATIBILITY IMAGE, STATED AS A REQUIREMENT RATHER THAN A HOPE: an image that (a) carries
-- the claraWork_v3 body so the preflight's frontier rule is satisfied, and (b) runs the
-- pre-release lanes for everything this file restored. It is NOT built by this file, and it is
-- NOT v82.
--
-- =====================================================================================
-- MEASURED, BEFORE ANYONE HAS TO TRUST IT. Applied to a template copy of the 0195 estate
-- (rigw3b :55459, `create database clara_0196 template clara_w3`; CLARA_MIGRATIONS_DIR = the
-- release tree's 190 migration files PLUS this draft; both scratch databases dropped afterwards,
-- clara_w3 and rig637/clara_637 never written). Result: `1 new migration(s) applied · 191 total`,
-- the SECTION 0 pins matched, the SECTION 3 tail passed, and the installed bodies are the two
-- pre-images with owner, prosecdef, proconfig and proacl byte-unchanged.
--
--   work-journal-post              32 / 32   green
--   work-journal-admission         20 / 20   green
--   periodic-adjustment            19 / 19   green  <- #643's arms survive the restore. This is
--                                                      the block that justifies the 0194 body
--                                                      over the 0184 body, measured rather than
--                                                      argued.
--   document-capability-registry   16 / 16   green
--   work-egress-authority          24 / 31   SEVEN RED, and they are the wall itself:
--       w631.write.refused · .prepared_only · .other_run · .invalidated · .walled_from_v3 ·
--       .unknown_bundle · .withdrawn_after_consume. `w631.write.authorised` and
--       `w631.write.grandfathered` stay GREEN — a post that was allowed is still allowed.
--   field-path-grammar              0 / 7    ALL RED, all at ONE cohort hook, by design:
--       "field-path cohort is PARTIAL: validator=true spliced_into_persist=false. A validator
--       nothing calls is worse than no validator; refusing to skip past it." That guard is
--       #624's, it is RIGHT, and it is the cost of SECTION 2 stated by a test instead of by a
--       comment. Whoever applies this file OWNS that red; re-arming the call is a NEW migration.
--   Baseline for all six files on an untouched template copy of the same 0195 estate: 125 / 125.
--
-- THE FOURTEEN RED CELLS ARE THE ROLLBACK, NOT A DEFECT IN IT. Seven say the egress wall no
-- longer refuses; seven more — one cohort hook, seven cells — say the field-path grammar is no
-- longer spliced in. Both are exactly what the header above promises. Do not "fix" them; undo
-- them with a NEW migration when the release goes forward again.
-- =====================================================================================
set local statement_timeout = '5min'; -- two CREATE OR REPLACE FUNCTIONs and two censuses.

-- =====================================================================================
-- SECTION 0 — PRESTATE. The two bodies this file recuts are PINNED by prosrc sha256 at their
-- CURRENT (post-0195) text, and this file REFUSES if either differs: a restore derived from a
-- body that has since drifted would delete an arm nobody re-derived. The nine bodies it
-- deliberately KEEPS are censused too — but as a NOTICE, never a refusal, because a rollback that
-- will not apply is not a rollback.
--
-- The owner, DEFINER posture, search_path and EXACT proacl of both functions are snapshotted into
-- a temp relation here and re-read by SECTION 3, so the tail asserts "unchanged" against what was
-- actually there rather than against a literal somebody typed.
-- =====================================================================================
do $r0196_pre$
declare v_sha text; v_n int;
begin
  -- (P.1) THE FRONTIER. This file only means anything on an estate that took the whole release.
  if not exists (select 1 from clara.schema_migrations
                  where version = '0195_work_egress_purpose_and_execution_trace') then
    raise exception '0196 prestate: 0195_work_egress_purpose_and_execution_trace is not applied -- this file is the rollback OF that release and has nothing to undo'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.schema_migrations
   where version in ('0188_operator_support_console','0189_work_list_reads','0190_document_byte_door_v2',
                     '0191_document_capability_registry','0192_client_knowledge_records',
                     '0193_accounting_plans','0194_periodic_adjustments',
                     '0195_work_egress_purpose_and_execution_trace');
  if v_n <> 8 then
    raise exception '0196 prestate: only % of the eight release migrations 0188..0195 are applied -- a partial release is a LEDGER question (runbook 6d), not a body question', v_n
      using errcode = 'CLR10';
  end if;

  -- (P.2) THE CORE, at 0195's installed text. If it is ALREADY at the 0194 body this file has
  -- effectively been applied (or someone recut it by hand) and re-running would be a lie in the
  -- ledger rather than a change in the catalog.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha = 'eca58b99c45b53fe3c36dcd1b238a1d94b2b8c01a305e8debc4f0a6ca03d4ade' then
    raise exception '0196 prestate: clara._record_journal_entry_core is ALREADY at the 0194 body -- this restore has already happened on this database'
      using errcode = 'CLR10';
  end if;
  if v_sha is distinct from 'f9c4f5258fdd45c115871c67bfb3af9b91a587ff9f723d340b583e052defa4fb' then
    raise exception '0196 prestate: clara._record_journal_entry_core is not at 0195''s installed body (sha %) -- re-derive this restore against the live body before applying', coalesce(v_sha,'<absent>')
      using errcode = 'CLR10';
  end if;

  -- (P.3) persist_document_extraction, at 0191's spliced text, with the same two-sided check.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_sha = '8ba95a5210ad839d510729baebff3863862b6073691bf6efaaa7f6e38b8e2354' then
    raise exception '0196 prestate: clara.persist_document_extraction is ALREADY at the 0123 body -- this restore has already happened on this database'
      using errcode = 'CLR10';
  end if;
  if v_sha is distinct from '0230031fe7d3f18332310fc19f39936b1408cb89ba597f77ce576017fea35905' then
    raise exception '0196 prestate: clara.persist_document_extraction is not at 0191''s spliced body (sha %) -- re-derive this restore against the live body before applying', coalesce(v_sha,'<absent>')
      using errcode = 'CLR10';
  end if;

  -- (P.4) THE OBJECTS THIS FILE KEEPS AND DEPENDS ON. The whole "what it does not achieve"
  -- paragraph above is false if any of these is gone: the compatibility image's claraWork_v3
  -- segment still prepares and consumes through them, and the restored core stops REQUIRING the
  -- authorization rather than stopping the lane from obtaining one.
  -- Looked up BY NAME rather than by a typed signature, deliberately: a mistyped signature would
  -- resolve to null and read as "absent", which is exactly the false alarm this check must not
  -- raise in the middle of a bad release.
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'clara'
     and p.proname in ('prepare_work_egress_dispatch','consume_egress_dispatch','_work_egress_event_seq',
                       'restore_client_egress_purpose','record_work_execution_trace','_assert_field_path',
                       '_admit_accounting_work_core','_work_committed_receipt');
  if v_n < 8 then
    raise exception '0196 prestate: only % of the 8 named 0191/0194/0195 functions this file KEEPS and DEPENDS ON are present -- this is not the estate the release produced', v_n
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.work_execution_traces') is null or to_regclass('clara.periodic_adjustments') is null then
    raise exception '0196 prestate: clara.work_execution_traces or clara.periodic_adjustments is absent -- this is not the estate the release produced'
      using errcode = 'CLR10';
  end if;

  -- (P.5) THE NINE KEPT BODIES, censused by sha. NOTICE ONLY, deliberately: this is the file an
  -- operator reaches for when the release is going badly, and it must not refuse to apply because
  -- an unrelated body was hot-fixed. What it owes the operator is to SAY so.
  for v_sha, v_n in
    select x.sig, 0 from (values
      ('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)','f051fe1ff8cacfe15e570b668413e43d41e562b78f0f99524d03bf0889dcb3a9'),
      ('clara.grant_client_egress_purpose(uuid,text,uuid,text,text)','9801ab7107805cdef673de82bebc5191734d995d3c0c274da31dccf429b8e012'),
      ('clara.activate_client_egress_purpose(uuid,text,uuid,text)','b2657c488c3412fd42d8495e71b41530dd542dc7cf9cf84417546a04df473cca'),
      ('clara.deactivate_client_egress_purpose(uuid,text,text,text)','6463184d56f8ed33caf5d6201d8959c93cf36c40bbb226176e86f73d82f4499c'),
      ('clara.revoke_client_egress_purpose(uuid,text,text,text)','86473b60b8a15043afbe43e0fa89fa2703ece61e08110ce8f70ea1f28710b54d'),
      ('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)','011cfeedd4fe30ba37d34630fa43ad12ecd17a5e0f8e6abffe18f872e0697114'),
      ('clara._close_gate_closing_stock(uuid,uuid)','f221da9f04dda021ee12fd6edc1474af57846e9d2fe51e9b0fba2932b6fbbba0'),
      ('clara._tf_accounting_work_immutable()','7a68e97cf22053ea429a930deb7ff418fe7fb673397920b5a56c3f3520ba7f5d'),
      ('clara.save_my_preferences(int,jsonb,text)','613ef6f8b4402280689b86ec4004e25778d19e79ff979a99d60e315bf3aacdb9')
    ) as x(sig, want)
    where to_regprocedure(x.sig) is null
       or (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
            where p.oid = to_regprocedure(x.sig)) is distinct from x.want
  loop
    raise notice '0196 prestate: KEPT body % is absent or has drifted from the text this file''s decision table describes -- the decision for it was made against the released body, re-read it before trusting this rollback for that lane', v_sha;
  end loop;

  -- (P.6) THE SNAPSHOT the tail compares against. A temp relation, dropped with the transaction.
  create temporary table _r0196_prestate on commit drop as
    select p.oid::regprocedure::text as sig, p.proowner, p.prosecdef, p.proconfig, p.proacl
      from pg_proc p
     where p.oid in ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure,
                     'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure);
  select count(*)::int into v_n from pg_temp._r0196_prestate;
  if v_n <> 2 then
    raise exception '0196 prestate: expected exactly 2 snapshot rows (got %)', v_n using errcode = 'CLR10';
  end if;

  raise notice '0196 prestate: clean -- frontier 0195 with all eight release migrations applied, the core at f9c4f525…, persist_document_extraction at 0230031f…, the kept 0191/0194/0195 objects present, owner/ACL/DEFINER posture snapshotted.';
end
$r0196_pre$;

-- =====================================================================================
-- SECTION 1 — clara._record_journal_entry_core RESTORED to its 0194 body.
--
-- FULL BODY, copied byte for byte out of packages/db/migrations/0194_periodic_adjustments.sql
-- (the statement at 0194:1364, between its own `as $$` and `$$;`). Its sha256 is
-- eca58b99c45b53fe3c36dcd1b238a1d94b2b8c01a305e8debc4f0a6ca03d4ade, which is 0195 SECTION 0's own
-- prestate pin — the same text 0195 measured immediately before it recut it. SECTION 3 re-reads
-- the installed prosrc and refuses any other value, so a transcription error cannot commit.
--
-- The ONE thing this removes is the 86-line `#631 INSERTION` block: the CLR13
-- `egress_not_authorized` wall, its two liveness joins and the pre-v3 grandfather conjunct.
-- Everything else — 0184's cancel/settle ordering, 0182's reservation ordering, #630's task
-- status arm, #634's effects, and ALL of #643's periodic-adjustment arms — is carried unchanged,
-- because it is the same bytes.
--
-- CREATE OR REPLACE, never DROP: replace preserves the owner and the ACL (SECTION 3 proves it),
-- and a DROP would cascade into every dependent this estate still has.
-- =====================================================================================
create or replace function clara._record_journal_entry_core(p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_work uuid, p_logical_op_id text, p_basis jsonb, p_bundle_digest text,
    p_run_id text, p_rationale text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  w record; v_role text; v_member_status text; v_client_status text;
  v_canon jsonb; v_digest text; v_payload bytea; v_prior_hash bytea; v_dedupe jsonb;
  v_bad_code text; v_bad_idx int; v_lines jsonb;
  v_entry uuid; v_token uuid; v_receipt uuid; v_task uuid; v_result jsonb;
  v_source_document uuid; v_posted_entry uuid; v_effects jsonb;   -- #634
  v_task_status text;                                             -- #630
  v_adj_canon jsonb; v_flags jsonb; v_adjustment uuid; v_corrects uuid;   -- #643
begin
  -- 1 · THE WORK, inside this firm AND this client. A Work that is not this credential's is
  -- not-found, never a different error: the credential must not become an existence oracle.
  --
  -- #630 · AND IT IS LOCKED. `for update` here IS the ordering boundary between admitting this
  -- operation and cancelling the Work that authorised it (see 0184's header). A cancel that
  -- arrives from here on waits until this transaction commits or rolls back, and then reads the
  -- truth rather than racing it.
  --
  -- #643 · THE PURPOSE FILTER WIDENS. It was `= 'journal_entry'`; the three values are the
  -- column's own CHECK, restated so a purpose this core cannot post is a not-found rather than a
  -- surprise further down.
  select * into w from clara.accounting_work aw
   where aw.id = p_work and aw.firm_id = p_firm and aw.client_id = p_client
     and aw.purpose in ('journal_entry','periodic_stock_adjustment','payroll_obligation')
   for update;
  if not found then
    raise exception 'accounting work not found for this client' using errcode='CLR11',
      detail='{"reason":"work_not_found"}';
  end if;

  -- 1b · #630 · THE OTHER SIDE OF THE BOUNDARY. The lock above is only half the contract: holding
  -- it proves nobody is cancelling RIGHT NOW, and these arms ask whether somebody already did.
  -- They sit BEFORE clara._reserve_op deliberately, so a refused operation leaves the logical
  -- identity unspent and a later Retry (or a takeover) can still use it.
  --
  -- A REPLAY IS NOT AN ADMISSION, AND THIS GUARD IS WHY THE WHOLE BLOCK IS CONDITIONAL. Measured on
  -- the rig (tests/work-cancel-e2e.mjs leg 4, first cut): a run that COMMITTED and then died before
  -- checkpointing re-executes its step on respawn, reaches this core again, and found the Work
  -- `completed` -- which an unconditional `work_settled` arm refused, breaking the one idempotency
  -- guarantee 0178 was built for. The effect is already on the books; returning it changes nothing
  -- and admits nothing, so a Work that HOLDS a committed receipt falls straight through to the
  -- reservation below, which answers with the stored result and `replayed:true`.
  --
  -- CLR13 is the estate's "the state is not the one this act needs" -- the same code
  -- clara.retry_accounting_work raises for `not_retryable` and 0182 raises for `source_conflict`.
  if clara._work_committed_receipt(p_work) is null then
    if w.status in ('stopping','cancelled') then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
    if w.status in ('completed','refused','failed','expired') then
      raise exception 'this accounting work already settled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_settled', 'status', w.status)::text;
    end if;
    -- …and the RUN's own abort request, which reaches the Work through the status mirror but may be
    -- read here first by a transaction that started before the mirror's update became visible.
    select t.status into v_task_status from clara.agent_tasks t where t.id = w.current_task_id;
    if v_task_status = 'cancel_requested' then
      raise exception 'this accounting work was cancelled; no operation is admitted'
        using errcode='CLR13',
          detail=jsonb_build_object('reason','work_cancelled', 'status', w.status,
            'task_status', v_task_status,
            'cancelled_by', (select t.cancelled_by from clara.agent_tasks t where t.id = w.current_task_id),
            'cancelled_at', (select t.cancelled_at from clara.agent_tasks t where t.id = w.current_task_id))::text;
    end if;
  end if;

  if w.logical_op_id is distinct from p_logical_op_id then
    raise exception 'this operation identity does not belong to that accounting work'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','logical_op_mismatch',
          'expected', w.logical_op_id, 'logical_op_id', p_logical_op_id)::text;
  end if;

  -- 2 · THE HUMAN'S LIVE AUTHORITY, reread AT COMMIT and never taken from the admission
  -- snapshot. (clara.wake_context()'s own liveness predicate already refuses a credential whose
  -- on_behalf_of stopped being an active bookkeeper+, so in the deployed lane that door answers
  -- first; these two arms are the belt behind it, and they are what makes this core safe for any
  -- future caller whose credential resolution is looser.)
  --
  -- #630 · AND THE READ IS SERIALISED WITH REVOCATION, not merely fresh. `for share` on the
  -- membership row is the second half of the boundary 0184 is about: without it a revocation
  -- can commit in the window between this SELECT and the INSERT below, and the entry posts under an
  -- authority that no longer existed when the books moved -- which is exactly what C79.2
  -- ("revocation wins before a later commit") forbids. The estate's revocation writers all UPDATE
  -- this row (`clara.remove_member` / `clara.set_member_role`, 0157:331/405), and an UPDATE
  -- conflicts with FOR SHARE, so the two orders are now decided rather than raced: a revocation
  -- that arrives first makes this read see it, and one that arrives second waits for this
  -- transaction and then applies to a world where the entry is already posted (and cannot erase
  -- it -- spec §5).
  -- …AND THE FIRM ROW IS TAKEN FIRST, because the revocation writers take it first. MEASURED on
  -- the rig (work-cancel.test.mjs wc.34, first cut): `clara.set_member_role` (0157) opens with
  -- `perform 1 from clara.firms where id = c.firm for update` and only then UPDATEs the
  -- membership, while this core took the membership FOR SHARE and reached `clara.firms` LATER —
  -- through the FK key-share every `operation_receipts`/`journal_entries` insert takes. Two
  -- transactions, two orders, one cycle: PostgreSQL broke it with 40P01, and a serialization
  -- failure on a posting is precisely the answer #630 exists to make impossible. `for key share`
  -- is the weakest lock that queues behind the revocation's `for update` (and it is the same mode
  -- the FK checks below need, so it is taken once rather than twice); two postings never block
  -- each other on it.
  perform 1 from clara.firms f where f.id = p_firm for key share;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_obo and m.firm_id = p_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1
   for share;
  if v_role is null or v_member_status <> 'active' then
    raise exception 'the initiating member is no longer active in this firm' using errcode='CLR04',
      detail='{"reason":"obo_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'the initiating member no longer holds the bookkeeper floor'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  -- 2b · THE HUMAN IS THE WORK'S OWN RESPONSIBLE HUMAN, not merely SOME live bookkeeper of the
  -- firm. Reviewed finding (#623): the two arms above ask whether `p_obo` still holds authority,
  -- and the wrapper asks whether the credential is pinned to this client -- neither asks whether
  -- this is the human who ASKED for the entry. So an `interactive_client` credential minted OBO any
  -- other active bookkeeper of the firm could commit this Work, and the receipt's `on_behalf_of` --
  -- the estate's record of WHOSE AUTHORITY was rechecked -- would attribute the posting to a human
  -- who never authorised it. This is an authority check, not an input check: CLR04.
  --
  -- #630 · AND `initiator` NOW MEANS "the human this Work is executed as" (0184 §A), so after a
  -- takeover this arm binds the COLLEAGUE and refuses the person who admitted it -- which is exactly
  -- right, because they are the one who lost authority. The reason token is deliberately unchanged:
  -- `obo_not_initiator` is in the DEPLOY-LOCKED claraWork.v1.errors.ts roster and renaming it would
  -- make a run classify its own refusal as an unmapped fault.
  if p_obo is distinct from w.initiator then
    raise exception 'this operation is bound to the human who admitted it; the credential names another'
      using errcode='CLR04', detail='{"reason":"obo_not_initiator"}';
  end if;

  -- 3 · THE CLIENT, now.
  select c.status into v_client_status from clara.clients c
   where c.id = p_client and c.firm_id = p_firm;
  if v_client_status is distinct from 'active' then
    raise exception 'client is not active -- no posting' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;

  -- 4 · THE BASIS'S SHAPE, then its CANONICAL FORM — and everything below reads the canonical
  -- form, never the raw echo. THE POSTED ENTRY MUST BE THE THING THE DIGEST DESCRIBES: the
  -- runtime echoes the basis back out of its own object graph, so the text that arrives can
  -- differ in key order, in padding around an account code, in the case of the currency. The
  -- digest already forgives exactly those differences, so if the WRITE read the raw echo instead,
  -- a padded account code would satisfy the digest and then land in clara.journal_lines with its
  -- padding — a stored line disagreeing with the identity that authorised it.
  perform clara._assert_journal_basis(p_basis);
  v_canon := clara._journal_basis_canonical(p_basis);

  -- ---- #643 INSERTION 1 · THE TYPED PARTICULARS' SHAPE, from the WORK ROW ----------------
  -- Read from `w.adjustment_basis`, never from an argument: the particulars are frozen at
  -- admission and the run has no way to name them. Asserted again here rather than trusted
  -- because this core is the last door before the books move, and 0178 §D's rule — admission and
  -- commit share one definition of well-formed — applies to the particulars exactly as it does to
  -- the basis. BEFORE `clara._reserve_op`, so a malformed set leaves the identity unspent.
  perform clara._assert_adjustment_basis(w.purpose, w.adjustment_basis);
  v_adj_canon := clara._adjustment_basis_canonical(w.purpose, w.adjustment_basis);
  -- ---- #643 INSERTION 1 ends -------------------------------------------------------------

  -- 5 · IDEMPOTENCY, TYPED -- AND IT COMES BEFORE THE ADMITTED-BASIS COMPARISON.
  -- Order is behaviour here, not taste. With the comparison first, a SECOND call under an
  -- identity that already committed would answer `basis_mismatch` -- true, but the wrong
  -- diagnosis: the operative fact is that this identity ALREADY RECORDED a different payload,
  -- which is a conflict the runtime settles the Work `refused` on, not an input error it may
  -- hand back to the model. Reserving first makes the two distinguishable and BOTH reachable.
  --
  -- #643 · THE PAYLOAD GAINS THE PARTICULARS, AND ONLY FOR THE NEW PURPOSES. A journal entry's
  -- payload bytes are the 0178 shape verbatim, so every reservation and every `clara.op_receipts`
  -- row already in the estate still hashes to what it hashed to. A periodic adjustment's payload
  -- describes the WHOLE operation, because its identity is the lines AND the particulars.
  if w.adjustment_basis is null then
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon));
  else
    v_payload := clara._hash(jsonb_build_object('client', p_client, 'basis', v_canon,
      'adjustment', v_adj_canon));
  end if;
  select r.request_hash into v_prior_hash from clara.op_receipts r
   where r.firm_id = p_firm and r.fn = 'record_journal_entry' and r.op_key = p_logical_op_id;
  if found and v_prior_hash is distinct from v_payload then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end if;
  begin
    v_dedupe := clara._reserve_op(p_firm, 'record_journal_entry', p_logical_op_id, v_payload);
  exception when sqlstate 'CLR10' then
    raise exception 'this operation identity already recorded a different journal basis'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','operation_payload_conflict',
          'logical_op_id', p_logical_op_id)::text;
  end;
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this operation identity is held by an in-flight sibling'
        using errcode='CLR13', detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe || '{"replayed":true}'::jsonb;
  end if;

  -- 5b · THE BASIS IS THE ADMITTED BASIS. A run may echo the basis back, never author a new
  -- one: the digest is recomputed here from the ECHO and compared with the one admission stored.
  v_digest := encode(clara._hash(v_canon), 'hex');   -- identical to clara._journal_basis_digest
  if v_digest is distinct from w.basis_digest then
    raise exception 'the posted basis is not the admitted basis for this work'
      using errcode='CLR10', detail='{"reason":"basis_mismatch"}';
  end if;

  -- ---- #643 INSERTION 2 · THE LINES SAY WHAT THE PARTICULARS SAY --------------------------
  -- C-29's rung, and the reason a periodic adjustment cannot be an anonymous balancing journal.
  -- Immediately after the echo wall above, so a drifted echo is still diagnosed `basis_mismatch`
  -- (see this section's header).
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', false);
  -- ---- #643 INSERTION 2 ends -------------------------------------------------------------

  -- 6 · THE CHART, AT COMMIT. Absent and INACTIVE answer the same way on purpose: neither is a
  -- postable account, and telling them apart would say whether a code the caller guessed once
  -- existed.
  select l.code, l.idx into v_bad_code, v_bad_idx from (
    select x.elem->>'account_code' as code, x.idx::int as idx
      from jsonb_array_elements(v_canon->'lines') with ordinality as x(elem, idx)) l
   where not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = l.code and a.is_active)
   order by l.idx limit 1;
  if v_bad_code is not null then
    raise exception 'line % codes to an account this client does not have active: %', v_bad_idx, v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','unknown_account',
        'field', 'lines[' || v_bad_idx || '].account_code', 'account_code', v_bad_code)::text;
  end if;

  -- 7 · THE CONTROL-LEG RULE. B14's ground, restated by value because the rung is an inline query
  -- inside clara._agent_post_entry_core with no extractable predicate: an open item is a claim
  -- about who owes what, a documentless generic basis is the weakest anchor in the estate, and a
  -- weak anchor may not corroborate a subledger consequence.
  --
  -- #643 · UNCHANGED, AND IT STILL BITES THE NEW PURPOSES. The CHECK on
  -- `clara.coa_accounts.account_class` admits only 'payable'/'receivable'/null (0015:199-200), so
  -- an inventory account, a statutory payable and a staff-advance account are NOT control legs by
  -- this rule and pass through — which is correct: a periodic adjustment carries typed
  -- particulars and a named producer, so it is not the weak anchor this arm exists to refuse. An
  -- adjustment that DID name a trade-payable leg is refused here exactly as a journal entry is.
  select a.account_code into v_bad_code from clara.coa_accounts a
   where a.client_id = p_client and a.account_class in ('payable','receivable')
     and a.account_code in (select x.elem->>'account_code'
                              from jsonb_array_elements(v_canon->'lines') as x(elem))
   order by a.account_code limit 1;
  if v_bad_code is not null then
    raise exception 'a generic journal entry may not carry the control-account leg %', v_bad_code
      using errcode='CLR10', detail=jsonb_build_object('reason','generic_control_leg',
        'account_code', v_bad_code)::text;
  end if;

  -- 7b · #634 · THE EVIDENCE, AT COMMIT. Admission checked the document; seconds or minutes pass
  -- before a run reaches this line, and in that window the filing can be retired, the document
  -- can be re-filed to another client, or a SECOND Work can post against it. The commit therefore
  -- re-reads it from the WORK'S OWN admitted refs (never from the echo) and refuses by name.
  --
  -- IT SITS AFTER THE RESERVATION ON PURPOSE. A replay of an identity that already committed
  -- returns its stored receipt at step 5 and never reaches here.
  v_source_document := clara._journal_source_document(w.source_refs);
  if v_source_document is not null then
    if not clara._journal_document_filed(p_firm, p_client, v_source_document) then
      raise exception 'the document this work cites is no longer an active verified filing of this client'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'constraint','not_filed')::text;
    end if;
    v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
    if v_posted_entry is not null then
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end if;
  end if;

  -- ---- #643 INSERTION 3 · THE PARTICULARS' WORLD, RE-READ AT COMMIT -----------------------
  -- The same shape 7b has, for the same reason: an account retired, a staff-advance enrolment
  -- withdrawn, a fiscal year sealed or the correction target corrected by somebody else between
  -- admission and this line are all facts about the world, and the run must not post through
  -- them. AFTER the reservation, so a replay of a committed identity never re-runs it.
  perform clara._assert_adjustment_relationships(p_client, w.purpose, w.adjustment_basis,
    v_canon -> 'lines', true);
  -- ---- #643 INSERTION 3 ends -------------------------------------------------------------

  -- 8 · THE RUN THIS RECEIPT BELONGS TO. `clara._wake_task_id()` is the credential-bound answer
  -- and is preferred wherever it exists; the `interactive_client` mint (0133) binds NO task, so
  -- the fallback is the Work's OWN current run. Both are SERVER-DERIVED: this core never accepts
  -- a caller-supplied task id.
  v_task := coalesce(clara._wake_task_id(), w.current_task_id);
  if v_task is null then
    raise exception 'this operation has no run to attribute its receipt to' using errcode='CLR03',
      detail='{"reason":"wake_task_unbound"}';
  end if;

  -- 9 · THE EFFECT. DRAFT THEN APPROVE, deliberately: `t_je_agent_post_receipt` is an AFTER
  -- UPDATE trigger, so a single approved INSERT would slip past the one wall that makes the
  -- receipt structural. #634: the entry's own `document_id` stays NULL even when this Work cites
  -- a document.
  --
  -- ---- #643 INSERTION 4 · THE MARKER, ON THE DRAFT INSERT ---------------------------------
  -- `flags` is written HERE and nowhere else, because `clara._tf_entry_immutable`'s
  -- approved→approved allowset is {reversed_by, reversal_reason, updated_at}: a flag added after
  -- approval would be refused, and the draft→approved UPDATE below may not carry it either. The
  -- key is the ONE the close gate has always read (`closing_stock`), and its payload is the
  -- adjustment's own period so a reader of the entry can see what the marker claims without
  -- joining anything. A payroll obligation carries `payroll_obligation` on the same footing: no
  -- gate reads it today, and an entry that moved a statutory liability should say so on its face.
  v_flags := case
    when w.purpose = 'periodic_stock_adjustment' then jsonb_build_object('closing_stock',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'method', w.adjustment_basis->>'method'))
    when w.purpose = 'payroll_obligation' then jsonb_build_object('payroll_obligation',
      jsonb_build_object('period_start', w.adjustment_basis->>'period_start',
        'period_end', w.adjustment_basis->>'period_end',
        'obligation_kind', w.adjustment_basis->>'obligation_kind'))
    else '{}'::jsonb end;
  -- ---- #643 INSERTION 4 ends -------------------------------------------------------------
  v_lines := clara._validate_entry_lines(p_client, v_canon->'lines');
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor,
      flags)
    values (p_client, 'draft', (v_canon->>'posting_date')::date, v_canon->>'memo',
      'agent', clara.agent_user_id(), v_flags)
    returning id into v_entry;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents,
      description)
    select v_entry, x.idx, x.elem->>'account_code',
      (x.elem->>'debit_cents')::bigint, (x.elem->>'credit_cents')::bigint,
      x.elem->>'description'
    from jsonb_array_elements(v_lines) with ordinality as x(elem, idx);
  perform clara._assert_balanced(v_entry);
  update clara.journal_entries
     set status = 'approved', checker_actor = clara.agent_user_id(), approved_at = now(),
         updated_at = now()
   where id = v_entry;
  select je.revision_token into v_token from clara.journal_entries je where je.id = v_entry;

  -- #634 · the receipt NAMES ITS EVIDENCE. `entry_id` is still the effect the outcome-shape
  -- CHECK and the widened post-receipt wall read; `document_id` is added only when there is one.
  v_effects := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token);
  if v_source_document is not null then
    v_effects := v_effects || jsonb_build_object('document_id', v_source_document);
  end if;
  -- #643 · …AND ITS ADJUSTMENT. The id is MINTED HERE rather than taken from the insert below,
  -- for the same reason `admit_journal_work` mints the Work id itself: `clara.operation_receipts`
  -- is append-only, the adjustment row's FK points AT the receipt, and a receipt whose `effects`
  -- named nothing until a follow-up UPDATE would be a receipt that could never name it at all.
  if w.adjustment_basis is not null then
    v_adjustment := gen_random_uuid();
    v_effects := v_effects || jsonb_build_object('adjustment_id', v_adjustment);
  end if;
  insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
      payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
      outcome, effects)
    -- #643 · the receipt's purpose IS the Work's purpose. It was the literal 'journal_entry'.
    values (p_firm, p_client, p_work, w.purpose, p_logical_op_id, encode(v_payload,'hex'),
      clara.agent_user_id(), p_obo, p_wake_kind, p_bundle_digest, p_run_id, v_task,
      'committed', v_effects)
    returning id into v_receipt;

  -- #634 · THE EVIDENCE LINK, born inside the posting transaction and naming its receipt. The
  -- SAME relation and the SAME shape the late door writes. THE INDEX'S OWN REFUSAL WEARS THE SAME
  -- NAME: a CONCURRENT sibling can post between 7b's read and this write, and then
  -- `uq_entry_evidence_links_document` is what stops the second row. Uncaught, that escaped as a
  -- raw 23505 with no `detail.reason`. A violation it cannot explain is RE-RAISED verbatim.
  if v_source_document is not null then
    begin
      insert into clara.entry_evidence_links(firm_id, client_id, entry_id, document_id, work_id,
          receipt_id, logical_op_id, attached_via, attached_by)
        values (p_firm, p_client, v_entry, v_source_document, p_work, v_receipt, p_logical_op_id,
          'work_commit', p_obo);
    exception when unique_violation then
      v_posted_entry := clara._document_posting_entry(p_client, v_source_document);
      if v_posted_entry is null then raise; end if;
      raise exception 'that document already backs a posted journal entry'
        using errcode='CLR13', detail=jsonb_build_object('reason','source_conflict',
          'document_id', v_source_document, 'entry_id', v_posted_entry,
          'constraint','already_posted', 'conflict', true)::text;
    end;
  end if;

  -- ---- #643 INSERTION 5 · THE DURABLE ADJUSTMENT ROW --------------------------------------
  -- Written INSIDE the posting transaction, beside the entry and the receipt it names, so the
  -- three are one fact or none. The particulars are stored CANONICAL — the Work row keeps the raw
  -- submission — so a reader never has to decide whether a padded code and a trimmed one are the
  -- same claim.
  if w.adjustment_basis is not null then
    v_corrects := nullif(btrim(coalesce(w.adjustment_basis->>'corrects_adjustment_id','')),'')::uuid;
    insert into clara.periodic_adjustments(id, firm_id, client_id, work_id, logical_op_id, purpose,
        period_start, period_end, basis, amount_cents, currency, entry_id, receipt_id,
        source_document_id, corrects_adjustment_id, recorded_by, on_behalf_of)
      values (v_adjustment, p_firm, p_client, p_work, p_logical_op_id, w.purpose,
        (w.adjustment_basis->>'period_start')::date, (w.adjustment_basis->>'period_end')::date,
        v_adj_canon, clara._adjustment_amount_cents(w.purpose, w.adjustment_basis),
        upper(btrim(w.adjustment_basis->>'currency')), v_entry, v_receipt,
        v_source_document, v_corrects, clara.agent_user_id(), p_obo);
    -- THE BACK-POINTER, stamped by the CORRECTING row in the same transaction — the one update
    -- `t_periodic_adjustments_append_only` admits. `uq_periodic_adjustments_corrects` is the
    -- structural half: two Works correcting one adjustment cannot both land, and the second one
    -- raises a unique violation rather than silently overwriting the first chain.
    if v_corrects is not null then
      update clara.periodic_adjustments set corrected_by_adjustment_id = v_adjustment
       where id = v_corrects and client_id = p_client;
    end if;
  end if;
  -- ---- #643 INSERTION 5 ends -------------------------------------------------------------

  -- #643 · THE ANSWER SHAPE IS ONE SHAPE PER LANE, and the key is emitted only when there IS an
  -- adjustment (adversarial migration-safety review, S2). Carried unconditionally, a fresh
  -- `journal_entry` commit answered `"adjustment_id": null` while a REPLAYED pre-0194 one — whose
  -- payload `clara._finish_op` stored before this migration existed — carried no such key at all:
  -- two shapes for one lane, distinguishable only by whether the caller happened to replay. The
  -- `||` fold is the same one `v_effects` above already uses for `document_id`, so the receipt,
  -- the Work's result and the returned answer now agree on one rule: name the effect you had.
  update clara.accounting_work
     set result = jsonb_build_object('entry_id', v_entry, 'receipt_id', v_receipt,
                                     'posted_at', now(), 'document_id', v_source_document)
                  || case when v_adjustment is null then '{}'::jsonb
                          else jsonb_build_object('adjustment_id', v_adjustment) end
   where id = p_work;

  perform clara._audit(p_firm, clara.agent_user_id(), p_obo, p_wake_kind,
    'record_journal_entry', v_entry,
    jsonb_build_object('work', p_work, 'logical_op_id', p_logical_op_id, 'run_id', p_run_id,
      'receipt', v_receipt, 'bundle_digest', p_bundle_digest, 'rationale', p_rationale,
      'document_id', v_source_document, 'purpose', w.purpose, 'adjustment_id', v_adjustment));

  -- …AND THE RETURNED ANSWER FOLLOWS THE SAME RULE as the Work's `result` above (S2).
  v_result := jsonb_build_object('posted', true, 'entry_id', v_entry, 'revision_token', v_token,
    'receipt_id', v_receipt, 'logical_op_id', p_logical_op_id, 'work_id', p_work,
    'document_id', v_source_document, 'replayed', false)
    || case when v_adjustment is null then '{}'::jsonb
            else jsonb_build_object('adjustment_id', v_adjustment) end;
  return clara._finish_op(p_firm, 'record_journal_entry', p_logical_op_id, v_result);
end $$;

comment on function clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text) is
  'The accounting-work posting core, RESTORED BY 0196 to its 0194 text as the database half of the 0188..0195 release rollback. 0195''s model-egress wall (CLR13 egress_not_authorized, bound to clara._work_egress_event_seq, with pre-v3 bundles grandfathered) is GONE from this body; #643''s periodic-adjustment arms and every earlier arm are carried unchanged. The frontier does NOT move back: rollback-preflight still refuses any image without claraWork_v3 (frontier_requires_body). Parked claraWork_v3 runs post WITHOUT the wall under this body -- that is what a rollback costs.';

-- =====================================================================================
-- SECTION 2 — clara.persist_document_extraction RESTORED to its 0123 body.
--
-- FULL BODY, copied byte for byte out of packages/db/migrations/0123_f_a7_gamma_egress.sql. Its
-- sha256 is 8ba95a5210ad839d510729baebff3863862b6073691bf6efaaa7f6e38b8e2354, which is 0191's own
-- prestate pin. The ONE thing this removes is 0191's spliced
-- `perform clara._assert_field_path(elem->>'field_path');` at the top of the region loop.
--
-- clara._assert_field_path(text) SURVIVES, with its grants and its comment: it is still the
-- canonical grammar, and a later re-cutover is a NEW migration that splices the call back in.
-- Nothing else about 0191 is touched — clara.document_capabilities, clara.document_fact_validations,
-- clara.get_document_state and the registry rows all stay.
-- =====================================================================================
create or replace function clara.persist_document_extraction(p_task uuid, p_status text, p_page_count integer, p_envelope jsonb, p_regions jsonb, p_error_code text, p_vendor_op_ref text, p_op_key text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'clara', 'pg_temp'
 as $$
declare
  t record; v_dedupe jsonb; v_ext uuid; v_event text; elem jsonb; v_ekind text;
  v_opening_fact jsonb; v_opening_account text; v_opening_side text;
  v_opening_amount bigint; v_region_money bigint; v_derived record;
  v_derived_found boolean; v_client_scoped boolean;
begin
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if not found then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_op_key is null or btrim(p_op_key)='' then raise exception 'op_key is required' using errcode='CLR10'; end if;
  -- 0026 Q1 (O-round confirmation, Q-round finding): the lane admission guard moves
  -- AHEAD of _reserve_op — t.lane is task-intrinsic and never changes for a given task,
  -- so a structurally invalid call must be refused on EVERY invocation, replay included.
  -- Before this fix, the guard sat AFTER _reserve_op (below), and _reserve_op's own
  -- replay branch returns an EXISTING successful receipt for a repeated op_key before
  -- any business check runs. A pre-0026 op_key that had already succeeded against a
  -- misrouted facts task — back when the old code silently mapped it onto
  -- engine_kind='structured_parse' instead of refusing — would replay that STALE SUCCESS
  -- forever, never reaching the new guard at all. 'none' and 'classify' keep their own
  -- specific, later refusals unchanged (they never had this vulnerability — they have
  -- always refused, never silently mis-mapped) — this early check only widens to catch
  -- the facts lanes (invoice_facts/local_facts) and any future lane value this function
  -- has no opinion on, before _reserve_op ever sees the call.
  if t.lane not in ('ocr','structured_parse','none','classify') then
    raise exception 'persist_document_extraction only settles ocr/structured_parse tasks — % tasks are settled by persist_invoice_facts', t.lane
      using errcode='CLR16';
  end if;
  v_dedupe:=clara._reserve_op(t.firm_id,'persist_document_extraction',p_op_key,
    clara._hash(jsonb_build_object('task',p_task,'status',p_status,'pages',p_page_count,
      'envelope',p_envelope,'regions',p_regions,'error',p_error_code,'vendor',p_vendor_op_ref)));
  if v_dedupe is not null then return v_dedupe; end if;
  if t.status<>'running' then raise exception 'processing task is not running' using errcode='CLR16'; end if;
  if p_status not in ('done','failed') then raise exception 'extraction status must be done/failed' using errcode='CLR10'; end if;
  if t.lane='none' then raise exception 'store-only tasks do not create extractions' using errcode='CLR16'; end if;
  -- 0016 P3: classify verdicts are settled ONLY by classify_document (the
  -- audited writer) — never through the generic persist path (which would
  -- stamp an attribution-visible engine_kind).
  if t.lane='classify' then
    raise exception 'classify tasks are settled by classify_document' using errcode='CLR16';
  end if;
  v_ekind:=case when t.lane='ocr' then 'ocr' else 'structured_parse' end;
  -- F-A7 gamma (design SS3.5, cell 36): THE FIRM-NARROW OUTPUT WALL. A firm-narrow-only
  -- authorization may never settle a fact-generation extraction (invoice_facts/
  -- statement_facts/llm_text_facts/llm_vision_facts) -- see the file header's HONEST NOTE:
  -- v_ekind above can only be 'ocr' or 'structured_parse' given the lane guard already
  -- passed, so this conjunct is unreachable under every caller live today. Wired now so the
  -- wall exists the moment a future lane's engine_kind could ever reach this function.
  -- [B/F1 review fold] the predicate is purpose-CONSTRAINED to 'document_processing' -- the
  -- one client-scoped purpose gamma's classify->facts hand-off actually authorizes. MEASURED
  -- (review adversarial cell H3): unconstrained, ANY live client-scoped purpose (wiki_synthesis
  -- included) satisfied this exists() -- a client consented ONLY to wiki synthesis would have
  -- passed a wall named for document processing. Fixed while the wall is still INERT under
  -- every live caller, before a future lane ever makes it reachable.
  if p_status='done' and v_ekind in ('invoice_facts','statement_facts','llm_text_facts','llm_vision_facts') then
    v_client_scoped := exists(
      select 1 from clara.document_filings df
        join clara.client_egress_purpose_activations a on a.client_id=df.client_id and a.firm_id=df.firm_id
        join clara.client_egress_purpose_consents c
          on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id and c.purpose=a.purpose
       where df.document_id=t.document_id and df.retired_at is null
         and a.purpose='document_processing'
         and a.deactivated_at is null and c.revoked_at is null);
    if not v_client_scoped then
      raise exception 'a firm-narrow-only authorization cannot settle a fact-generation extraction'
        using errcode='CLR28',detail='{"reason":"firm_narrow_output_forbidden"}';
    end if;
  end if;
  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,v_ekind,
      t.version_n,p_status,p_page_count,coalesce(p_envelope,'{}'::jsonb))
    on conflict(document_id,engine_id,version_n,engine_kind) do nothing returning id into v_ext;
  if v_ext is null then
    -- 0026: engine_kind joins the key (document_extractions' unique key widened to
    -- (document_id,engine_id,version_n,engine_kind)) — a conflict here is now a genuine
    -- same-kind duplicate, never a cross-lane/cross-kind collision. The exact colliding row
    -- must exist.
    select id into v_ext from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id and version_n=t.version_n
        and engine_kind=v_ekind;
    if v_ext is null then
      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,kind=%) but no row exists at that key',
        t.document_id,t.engine_id,t.version_n,v_ekind using errcode='CLR35';
    end if;
  elsif p_status='done' then
    for elem in select value from jsonb_array_elements(coalesce(p_regions,'[]'::jsonb)) loop
      if v_ekind='structured_parse'
         and (lower(coalesce(elem->>'field_path','')) like '%tin%'
           or lower(coalesce(elem->>'field_path','')) like '%ssm%'
           or lower(coalesce(elem->>'field_path','')) like '%brn%'
           or lower(coalesce(elem->>'field_path','')) like '%account%')
         and lower(coalesce(elem->>'field_path','')) not in
             ('myinvois.supplier_tin','myinvois.supplier_brn') then
        raise exception 'structured_parse attribution field_path % is not on the allowlist',
          elem->>'field_path'
          using errcode='CLR10',detail='{"reason":"attribution_field_not_allowed"}';
      end if;
      -- [R3-F1] Derive the fact from the stored evidence first.
      v_opening_fact:=null; v_opening_account:=null; v_opening_side:=null;
      v_opening_amount:=null; v_region_money:=null;
      begin
        v_region_money:=nullif(elem->>'monetary_cents','')::bigint;
      exception when others then
        raise exception 'opening extraction monetary evidence is malformed'
          using errcode='CLR31',
            detail='{"reason":"opening_extraction_evidence_malformed"}';
      end;
      select * into v_derived from clara._derive_opening_region_fact(
        elem->>'field_path',elem->>'text_content',v_region_money);
      v_derived_found:=found;
      if elem ? 'opening_fact' then
        v_opening_fact:=elem->'opening_fact';
        if jsonb_typeof(v_opening_fact)<>'object' then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        begin
          v_opening_account:=nullif(btrim(v_opening_fact->>'account_code'),'');
          v_opening_side:=nullif(v_opening_fact->>'side','');
          v_opening_amount:=nullif(v_opening_fact->>'amount_cents','')::bigint;
        exception when others then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end;
        if v_opening_account is null
           or v_opening_side not in ('debit','credit')
           or v_opening_amount is null or v_opening_amount<=0 then
          raise exception 'opening extraction fact is malformed'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_malformed"}';
        end if;
        if not v_derived_found then
          raise exception 'opening extraction fact has no independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_unverifiable"}';
        end if;
        if v_opening_account is distinct from v_derived.account_code
           or v_opening_amount is distinct from v_derived.amount_cents
           or v_opening_side is distinct from v_derived.side then
          raise exception 'opening extraction fact contradicts independent evidence'
            using errcode='CLR31',
              detail='{"reason":"opening_extraction_fact_mismatch"}';
        end if;
      end if;
      if v_derived_found then
        v_opening_account:=v_derived.account_code;
        v_opening_amount:=v_derived.amount_cents;
        v_opening_side:=v_derived.side;
      else
        v_opening_account:=null; v_opening_amount:=null; v_opening_side:=null;
      end if;
      insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
          text_content,engine_confidence,monetary_raw,monetary_cents,
          opening_account_code,opening_amount_cents,opening_side)
        values(t.firm_id,v_ext,elem->>'locator_kind',coalesce(elem->'locator','{}'::jsonb),
          elem->>'field_path',elem->>'text_content',(elem->>'engine_confidence')::numeric,
          elem->>'monetary_raw',
          coalesce(v_region_money,v_opening_amount),
          v_opening_account,v_opening_amount,v_opening_side);
    end loop;
  end if;
  update clara.document_processing_tasks set status=p_status,error_code=case when p_status='failed' then p_error_code end,
    vendor_op_ref=p_vendor_op_ref,finished_at=now() where id=p_task;
  update clara.documents set extraction_status=p_status,page_count=p_page_count where id=t.document_id;
  if p_status='done' then perform clara._settle_document_reservation(t.firm_id,p_task,coalesce(p_page_count,0));
  else perform clara._refund_document_reservation(t.firm_id,
    (select intake_id from clara.document_ingest_reservations where task_id=p_task),coalesce(p_error_code,'engine_error')); end if;
  perform clara._audit(t.firm_id,null,null,null,'persist_document_extraction',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,'status',p_status,'op_key',p_op_key));
  v_event:=case when p_status='done' then 'document.extraction_completed' else 'document.extraction_failed' end;
  perform clara._append_event(t.firm_id,v_event,null,null,null,null,null,t.document_id,null,
    jsonb_build_object('extraction_id',v_ext,'engine_id',t.engine_id,'version_n',t.version_n));
  return clara._finish_op(t.firm_id,'persist_document_extraction',p_op_key,
    jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status',p_status));
end $$;

comment on function clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text) is
  'The one document-region writer that takes field_path verbatim, RESTORED BY 0196 to its 0123 text as part of the 0188..0195 release rollback. 0191''s spliced clara._assert_field_path call is GONE from this body, so a pre-release structured worker''s XLSX r= paths land again instead of raising CLR10 (runbook 6d(ii)). clara._assert_field_path itself is untouched and remains the canonical grammar; re-arming it is a NEW migration, never an edit to 0191 or to this file.';

-- =====================================================================================
-- SECTION 3 — TAIL CENSUS. Every claim SECTIONS 1 and 2 made, re-READ from the committed catalog:
-- the owner, the DEFINER posture, the search_path, the EXACT proacl (compared against SECTION 0's
-- snapshot, not against a literal), and the restored body shas. Then the two textual claims: the
-- wall's own vocabulary is GONE from the core while #643's arms are still there, and the field
-- path assertion is GONE from persist while every pre-existing limb 0191 listed is still there.
-- =====================================================================================
do $r0196_tail$
declare v_sha text; v_src text; v_needle text; v_n int; v_sig text;
begin
  -- (T.1) OWNER / prosecdef / proconfig / EXACT proacl, unchanged across both replacements.
  for v_sig in select sig from pg_temp._r0196_prestate order by sig loop
    if not exists (
      select 1 from pg_proc p join pg_temp._r0196_prestate s on s.sig = p.oid::regprocedure::text
       where s.sig = v_sig
         and p.proowner = s.proowner
         and p.prosecdef = s.prosecdef
         and p.proconfig is not distinct from s.proconfig
         and p.proacl is not distinct from s.proacl) then
      raise exception '0196 tail: % moved its owner, DEFINER posture, search_path or ACL across the replace -- CREATE OR REPLACE must carry all four', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;
  -- …and the absolute posture, said independently of "unchanged", because a prestate that was
  -- already wrong would make "unchanged" a comfortable lie.
  select count(*)::int into v_n from pg_proc p
   where p.oid in ('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure,
                   'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure)
     and p.proowner = 'clara_fn_owner'::regrole
     and p.prosecdef
     and array_to_string(p.proconfig, ',') like '%search_path=%'
     and not has_function_privilege('public', p.oid, 'EXECUTE');
  if v_n <> 2 then
    raise exception '0196 tail: only % of the 2 restored bodies are clara_fn_owner-owned SECURITY DEFINER with a pinned search_path and no EXECUTE for public', v_n
      using errcode = 'CLR10';
  end if;

  -- (T.2) THE RESTORED BODY SHAS. The whole file reduces to these two values.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  if v_sha <> 'eca58b99c45b53fe3c36dcd1b238a1d94b2b8c01a305e8debc4f0a6ca03d4ade' then
    raise exception '0196 tail: the restored core is % -- NOT the pinned 0194 body; this file installed a text nobody measured', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  if v_sha <> '8ba95a5210ad839d510729baebff3863862b6073691bf6efaaa7f6e38b8e2354' then
    raise exception '0196 tail: the restored persist_document_extraction is % -- NOT the pinned 0123 body', v_sha
      using errcode = 'CLR10';
  end if;

  -- (T.3) THE WALL IS GONE FROM THE CORE, by vocabulary rather than by trusting the sha alone.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure;
  foreach v_needle in array array['egress_not_authorized','_work_egress_event_seq',
                                  'egress_dispatch_authorizations','clara-work/v1','clara-work/v2',
                                  'client_egress_purpose_consents','client_egress_purpose_activations'] loop
    if position(v_needle in v_src) <> 0 then
      raise exception '0196 tail: the restored core still names % -- 0195''s insertion was not fully removed', v_needle
        using errcode = 'CLR10';
    end if;
  end loop;
  -- …AND #643's ARMS ARE STILL THERE. This is the half that distinguishes a restore to the 0194
  -- body from a restore to the 0184 body, which is the decision this file's header argues.
  foreach v_needle in array array['periodic_adjustments','adjustment_basis','work_cancelled',
                                  'work_settled','obo_not_initiator','basis_mismatch',
                                  'generic_control_leg','source_conflict',
                                  'operation_payload_conflict','unknown_account','client_inactive'] loop
    if position(v_needle in v_src) = 0 then
      raise exception '0196 tail: the restored core LOST the arm named % -- this is the 0184 body, not the 0194 body', v_needle
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (T.4) THE FIELD-PATH ASSERTION IS GONE FROM persist, and nothing else in it moved. The limb
  -- list is 0191's own splice-poststate list, read in the opposite direction.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure;
  if position('clara._assert_field_path' in v_src) <> 0 then
    raise exception '0196 tail: the restored persist_document_extraction still calls clara._assert_field_path'
      using errcode = 'CLR10';
  end if;
  if position('classify tasks are settled by classify_document' in v_src) = 0
     or position('persist_document_extraction only settles ocr/structured_parse tasks' in v_src) = 0
     or position('store-only tasks do not create extractions' in v_src) = 0
     or position('attribution_field_not_allowed' in v_src) = 0
     or position('firm_narrow_output_forbidden' in v_src) = 0
     or position('document.extraction_completed' in v_src) = 0
     or position('opening_extraction_fact_unverifiable' in v_src) = 0 then
    raise exception '0196 tail: a pre-existing gate or limb of persist_document_extraction is missing from the restored body'
      using errcode = 'CLR10';
  end if;
  if (length(v_src) - length(replace(v_src, 'v_ekind:=', ''))) / length('v_ekind:=') <> 1 then
    raise exception '0196 tail: v_ekind is no longer assigned exactly once in the restored body'
      using errcode = 'CLR10';
  end if;

  -- (T.5) THE GRAMMAR ITSELF SURVIVES. This file removed a CALL, not a definition.
  if to_regprocedure('clara._assert_field_path(text)') is null then
    raise exception '0196 tail: clara._assert_field_path was dropped -- this file must remove the call only'
      using errcode = 'CLR10';
  end if;

  -- (T.6) NOTHING ELSE IN THE RELEASE WAS UNDONE. The append-only half stands: the sixth purpose
  -- is still on all three CHECKs, the trace relation is still there, and the nine KEPT bodies are
  -- still the bodies the decision table described.
  select count(*)::int into v_n from pg_constraint con
   where con.conname in ('ck_client_egress_purpose_consents_purpose_f_a1',
                         'ck_client_egress_purpose_activations_purpose_f_a1',
                         'ck_egress_dispatch_authorizations_purpose_f_a1')
     and position('accounting_work' in pg_get_constraintdef(con.oid)) <> 0;
  if v_n <> 3 then
    raise exception '0196 tail: the sixth purpose is on only % of the 3 typed CHECKs -- this file must not narrow the vocabulary', v_n
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.work_execution_traces') is null
     or to_regprocedure('clara.prepare_work_egress_dispatch(uuid,text)') is null
     or to_regprocedure('clara._work_egress_event_seq(uuid,text)') is null then
    raise exception '0196 tail: an object 0195 added and this file KEEPS is gone' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from (values
      ('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)','f051fe1ff8cacfe15e570b668413e43d41e562b78f0f99524d03bf0889dcb3a9'),
      ('clara.grant_client_egress_purpose(uuid,text,uuid,text,text)','9801ab7107805cdef673de82bebc5191734d995d3c0c274da31dccf429b8e012'),
      ('clara.activate_client_egress_purpose(uuid,text,uuid,text)','b2657c488c3412fd42d8495e71b41530dd542dc7cf9cf84417546a04df473cca'),
      ('clara.deactivate_client_egress_purpose(uuid,text,text,text)','6463184d56f8ed33caf5d6201d8959c93cf36c40bbb226176e86f73d82f4499c'),
      ('clara.revoke_client_egress_purpose(uuid,text,text,text)','86473b60b8a15043afbe43e0fa89fa2703ece61e08110ce8f70ea1f28710b54d'),
      ('clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)','011cfeedd4fe30ba37d34630fa43ad12ecd17a5e0f8e6abffe18f872e0697114'),
      ('clara._close_gate_closing_stock(uuid,uuid)','f221da9f04dda021ee12fd6edc1474af57846e9d2fe51e9b0fba2932b6fbbba0'),
      ('clara._tf_accounting_work_immutable()','7a68e97cf22053ea429a930deb7ff418fe7fb673397920b5a56c3f3520ba7f5d'),
      ('clara.save_my_preferences(int,jsonb,text)','613ef6f8b4402280689b86ec4004e25778d19e79ff979a99d60e315bf3aacdb9')
    ) as x(sig, want)
   where to_regprocedure(x.sig) is not null
     and (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
           where p.oid = to_regprocedure(x.sig)) is distinct from x.want;
  if v_n <> 0 then
    raise notice '0196 tail: % KEPT body/bodies differ from the released text this file''s decision table describes (they were already drifting before this file ran -- SECTION 0 said so)', v_n;
  end if;

  raise notice '0196 tail: the 0188..0195 release rollback is installed -- clara._record_journal_entry_core at its 0194 body (eca58b99…, no egress wall, #643 arms intact) and clara.persist_document_extraction at its 0123 body (8ba95a52…, no field_path assertion), both with owner/ACL/DEFINER posture unchanged. THE FRONTIER IS NOW 0196: rollback-preflight still REFUSES any image without claraWork_v3 (frontier_requires_body), so the compatibility image released next MUST carry it.';
end
$r0196_tail$;
