-- UNNUMBERED_wake_open_firm_question_kind_wall.sql -- PROGRESS.md "Known issues" (3a),
-- minted at #425/0148's own review: 0148 closed the STRUCTURAL duplicate-open gap on
-- BOTH agent proposal doors, but named a successor it does NOT close --
-- clara.wake_open_firm_question can still mint the FIRST 'onboarding_proposed' question
-- with a caller-supplied kind and candidates, bypassing DOOR 2's own protections:
-- clara.wake_propose_client_onboarding's egress authorisation (CLR28), the A14
-- name-family wall, and 裁-22's basis resolution. Number CLAIMED at merge (standing law,
-- AGENTS.md + .claude/rules/db-migrations.md).
--
-- =====================================================================================
-- THE GAP, MEASURED
-- =====================================================================================
-- clara.wake_open_firm_question (0126:1541-1586) takes a CALLER-SUPPLIED p_kind and
-- validates it against nothing but the table CHECK, which 0142:222 widened to admit
-- 'onboarding_proposed'. It delegates straight to the ungranted, shared
-- clara._firm_question_core (0103, recut by 0148 for the duplicate-open wall) -- which
-- runs NONE of the following, all of which are Door 2's OWN, in
-- clara.wake_propose_client_onboarding (0143:521-654):
--   * the document FOR UPDATE lock (0143:586) and Door 2's own duplicate-open body check
--     (0143:599-604) -- though 0148's uq_firm_open_questions_onboarding_open index
--     already backstops the DUPLICATE half of this, structurally, for every writer;
--   * clara.name_family_is_ambiguous, the A14 negative-acceptance step (0143:547-554),
--     which refuses a proposed name that collides with an existing client/counterparty
--     family family BEFORE any receipt is written;
--   * the firm-narrow CLR28 egress authorization -- live, admissible-purpose, bound to
--     THIS document's sha256 and the 'attribution' moment (0143:563-576) -- and its
--     consumption (0143:578-579);
--   * 裁-22's basis resolution machinery is Door 1's, not Door 2's -- Door 2 carries no
--     basis resolution of its own to bypass; this file's header text above therefore
--     narrows to the two Door-2 protections that are actually Door 2's: A14 + CLR28.
--     (PROGRESS's own phrasing bundles a third clause that belongs to Door 1's page;
--     re-read against the live bodies here rather than restated uncritically -- review
--     law 2, absence/derivation is not evidence, cuts the other way here too: a body
--     that isn't there cannot be "bypassed".)
-- So a wake credential that can call wake_open_firm_question at all (clara_wake_filing,
-- the same role Door 2 grants) can open an 'onboarding_proposed' question on ANY
-- document in its firm with an ARBITRARY proposed name and candidates, no name-family
-- check, no egress authorization, and no document lock -- a full side door around every
-- rung Door 2 was built to enforce.
--
-- SCOPE -- WIDENED PER FOLD REVIEW (Codex FIX-REQUIRED HIGH on #447, ruled 2026-08-30).
-- The first cut of this file denied exactly 'onboarding_proposed' and admitted everything
-- else by default -- a single-name DENY list. The review's own attack: an
-- onboarding-shaped candidates payload (a proposed_name + basis) minted under
-- p_kind='promotion_proposed', or a from/to-client pair minted under
-- p_kind='correction_proposed', would still be ADMITTED by that deny list and land a
-- durable, real firm_open_questions + agent_filing_receipts row -- spoofing the SHAPE of
-- a real proposal card through a door that runs none of the checks the real proposal
-- doors do. No accept verb reads those candidates as a fact TODAY (measured: neither kind
-- has a live consumer), but "no consumer exists yet" is an ABSENCE, and review law 2 says
-- absence is not evidence -- it is not evidence that one never will, and a future accept
-- path built to read `correction_proposed` candidates by SHAPE rather than by the
-- question's own typed carrier identity would silently trust a forged card. So the wall
-- is now a POSITIVE, fail-closed ALLOW list, not a deny list: this verb admits EXACTLY
-- the four kinds the attribution ladder itself DERIVES as a real ladder run's own
-- verdict -- unattributed, collision, contradiction, identity_document (0126:1435,
-- clara._agent_file_document_core's own case dispatch) -- and refuses every other live
-- vocabulary member as door-owned:
--   * onboarding_proposed -- clara.wake_propose_client_onboarding (Door 2)'s own kind,
--     PROGRESS 3a's original finding (the A14 name-family wall + firm-narrow CLR28
--     egress authorization this generic verb cannot see);
--   * correction_proposed -- the wrong-client-correction proposal's own kind (0126:1926),
--     which authorises off a real, resolved destination-attribution judgement
--     (`client_resolutions... method in ('human','rule','judgement')`) this verb never
--     checks;
--   * promotion_proposed -- a live CHECK member with NO writer in the catalog today
--     (measured: zero literal writes across every migration) -- walled anyway, per the
--     review's own instruction, because "no door claims it yet" is exactly the absence
--     review law 2 refuses to treat as permission; a future door that DOES claim it must
--     widen THIS roster deliberately, in its own PR, rather than inherit an open-by-
--     default admission it never asked for.
-- The four admitted kinds remain reachable ad hoc, matching this verb's own documented
-- purpose ("TA-P4 A applies to every agent act, including one that opens a question
-- without an attribution attempt behind it (e.g. triage could not even produce a
-- candidate)", 0126, wake_open_firm_question's own header) -- they are DERIVED verdicts
-- with no dedicated proposal door of their own to bypass. A FUTURE CHECK value (an
-- eighth kind added by some later migration) is refused by this roster BY DEFAULT until
-- a door claims it and a later PR deliberately widens the admit list -- fail closed, not
-- fail open, on the axis that matters: a kind this verb has never heard of is never
-- assumed safe.
--
-- =====================================================================================
-- WHAT THIS FILE SHIPS
-- =====================================================================================
-- ONE typed, structural refusal inside clara.wake_open_firm_question (CREATE OR REPLACE
-- at the UNCHANGED 7-arg signature, so the ACL and the filing-allowlist row are preserved
-- by construction): unless p_kind is EXACTLY one of the four admitted ladder-derived
-- kinds, refuse CLR10/door_owned_kind before ANY other work -- ahead of the op-key
-- reservation, alongside the verb's other early structural checks (op_key/rationale/
-- model), so a caller spends no reservation on a request this verb will never honour.
-- The membership test is exact-string, case-sensitive `IN`, so NULL, an unknown spelling,
-- a whitespace variant, and a differently-cased spelling of an admitted kind ALL fail it
-- and refuse -- none of those four failure shapes needs its own branch; the same one test
-- catches all of them by construction. Every prior wall string is byte-preserved; the
-- ONLY change is this one new early check.
--
-- NOT a duplicate-open wall (0148 already ships that, structurally, for every writer
-- including this one) -- this is an AUTHORITY wall: it does not ask "does one already
-- exist", it asks "is this the right door", closing the side door itself rather than
-- limiting how many times it can be used.
--
-- =====================================================================================
-- D1 WRITE-QUIESCE INVENTORY -- ONE LIVE AUDITED WRITER BODY REPLACED
-- =====================================================================================
-- clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text) -- credential class:
-- clara_wake_filing EXCLUSIVELY (ACL measured in the prestate below). CREATE OR REPLACE
-- at an unchanged signature: no overload shadowed, no ACL moves, no allowlist row
-- touched. SEVERITY: a call that spans this migration finishes on the OLD body, which
-- has no kind wall -- so in the one narrow window where an in-flight call ALSO happens
-- to be a door-owned-kind side-door attempt (onboarding_proposed, correction_proposed,
-- or promotion_proposed), it would still succeed on the old body. No row is corrupted
-- and no OTHER wall is skipped; the exposure is exactly this one gap, unclosed for one
-- more call. A D1 window is still taken: the obligation is mechanical (packages/db/
-- README.md "Deploy contract"), not severity-tiered.
--
-- NO NEW `clara_authenticated` DOOR. .claude/rules/db-migrations.md's frontend-home rule
-- does not engage: this file adds no function, no table, and grants no role anything new.
-- Its one recut body is invisible to the toolface except as a refusal that already had a
-- name (CLR10) -- the wake-side agent surface, not clara_authenticated.

set local statement_timeout = '5min';

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $pre$
declare
  v_src text; v_def text; v_n int; v_acl text;
begin
  -- 0.1 Dependencies -- NOT a frontier equality (sibling lanes claim numbers
  -- concurrently): this file names the migrations whose OBJECTS it edits.
  if not exists (select 1 from clara.schema_migrations where version = '0148_promotion_dup_open_wall') then
    -- LINEAGE, corrected (fold FIND-3 / LOW): 0148 recut clara._firm_question_core, the
    -- shared UNGRANTED core this wrapper delegates to -- it never recut this wrapper
    -- itself. Repository history shows no wrapper CREATE OR REPLACE between 0126 (birth)
    -- and this file. Named here because this file's own tail re-verifies 0148's duplicate-
    -- open handler is still present in that CORE, not in the wrapper this file edits.
    raise exception 'wake_open_firm_question_kind_wall prestate: 0148_promotion_dup_open_wall is not applied -- this file edits the wrapper that delegates to clara._firm_question_core, the shared core 0148 recut for the duplicate-open handler'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.schema_migrations where version = '0142_fa7b_pr_a_client_onboarding_open') then
    raise exception 'wake_open_firm_question_kind_wall prestate: 0142_fa7b_pr_a_client_onboarding_open is not applied -- onboarding_proposed does not exist in the kind vocabulary without it'
      using errcode = 'CLR10';
  end if;

  -- 0.2 THE CENTRAL MEASURED CLAIM: the live kind vocabulary is the exact 7-value world
  -- this file's header narrates, read byte-exact from pg_constraint -- never assumed.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.firm_open_questions'::regclass and conname = 'firm_open_questions_kind_check';
  if v_def is distinct from
     'CHECK ((kind = ANY (ARRAY[''unattributed''::text, ''collision''::text, ''contradiction''::text, ''identity_document''::text, ''correction_proposed''::text, ''promotion_proposed''::text, ''onboarding_proposed''::text])))' then
    raise exception 'wake_open_firm_question_kind_wall prestate: firm_open_questions_kind_check is not the live 7-value world this file was authored against (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;

  -- 0.3 The one body this file edits, pinned by exact prosrc sha256 (the 0090/0143/0148
  -- idiom), and its exact overload count + ACL, so the tail's before/after is a real
  -- comparison rather than a re-assertion of an expectation.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception 'wake_open_firm_question_kind_wall prestate: the live wake_open_firm_question is GONE' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') <> '3d6c6d8ada9ac43f326cb8ffb14da41e2dae77a1d8e1600564fe014ba331cf46' then
    raise exception 'wake_open_firm_question_kind_wall prestate: wake_open_firm_question prosrc sha256 mismatch (got %, expected 3d6c6d8ada9ac43f326cb8ffb14da41e2dae77a1d8e1600564fe014ba331cf46) -- the body moved since this file was authored, refusing rather than splicing text that no longer applies',
      encode(sha256(convert_to(v_src,'UTF8')),'hex') using errcode = 'CLR10';
  end if;
  -- THE GAP ITSELF, measured rather than assumed: today's body names 'onboarding_proposed'
  -- nowhere in its own text -- there is no refusal to duplicate.
  if position('onboarding_proposed' in v_src) <> 0 then
    raise exception 'wake_open_firm_question_kind_wall prestate: wake_open_firm_question ALREADY names onboarding_proposed -- the gap this file closes may already be closed, refusing rather than double-walling'
      using errcode = 'CLR10';
  end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = 'wake_open_firm_question';
  if v_n <> 1 then
    raise exception 'wake_open_firm_question_kind_wall prestate: expected exactly ONE wake_open_firm_question overload, found %', v_n
      using errcode = 'CLR10';
  end if;

  create temp table _kw_pre(k text primary key, v text);
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  insert into _kw_pre values ('acl', v_acl);
  if v_acl is distinct from 'clara_fn_owner=EXECUTE,clara_wake_filing=EXECUTE' then
    raise exception 'wake_open_firm_question_kind_wall prestate: wake_open_firm_question ACL is % , expected exactly clara_fn_owner=EXECUTE,clara_wake_filing=EXECUTE', v_acl
      using errcode = 'CLR10';
  end if;

  -- 0.4 wake_propose_client_onboarding (Door 2) is still live and still the sole other
  -- caller of the shared core that writes onboarding_proposed -- this file narrows the
  -- generic verb rather than replacing Door 2, so Door 2 must still exist to be the
  -- honest recourse this refusal's HINT points a caller toward.
  if to_regprocedure('clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)') is null then
    raise exception 'wake_open_firm_question_kind_wall prestate: clara.wake_propose_client_onboarding is GONE -- this file''s refusal would point callers at a door that does not exist'
      using errcode = 'CLR10';
  end if;

  raise notice 'wake_open_firm_question_kind_wall prestate: clean -- 0142 and 0148 applied; firm_open_questions_kind_check is the exact live 7-value world; wake_open_firm_question resolves at exactly 1 overload, its prosrc sha256 matches the pinned pre-image, it names onboarding_proposed NOWHERE in its own text today, and its ACL is exactly % ; wake_propose_client_onboarding (Door 2) is live to be the refusal''s honest recourse.', v_acl;
end
$pre$;

-- =====================================================================================
-- SECTION 1 -- THE RECUT. CREATE OR REPLACE at the UNCHANGED 7-arg signature, so the ACL
-- and the filing-allowlist row are preserved by construction. Every rung of 0126's body
-- is byte-preserved; the ONLY change is one new early refusal, positioned alongside the
-- verb's other early structural checks (op_key/rationale/model), strictly BEFORE
-- _reserve_op -- so a refused call spends no op-key reservation.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.wake_open_firm_question(
    p_document uuid, p_kind text, p_question text, p_candidates jsonb, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare w record; v_dedupe jsonb; v_receipt_id uuid; v_question_id uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_open_firm_question');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'op_key is required' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then
    raise exception 'an unattended firm question must state its rationale' using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  if p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model->>'provider','')),'') is null
     or nullif(btrim(coalesce(p_model->>'model','')),'') is null
     or nullif(btrim(coalesce(p_model->>'version','')),'') is null then
    raise exception 'an unattended firm question must name its model (provider, model, version)'
      using errcode='CLR10',
      detail='{"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"}';
  end if;
  -- PROGRESS.md Known-issues 3a / this migration, WIDENED per fold review (Codex
  -- FIX-REQUIRED HIGH on #447, ruled 2026-08-30): a POSITIVE, fail-closed roster -- admit
  -- EXACTLY the four kinds the attribution ladder itself DERIVES as a real ladder run's
  -- own verdict (unattributed, collision, contradiction, identity_document -- 0126:1435's
  -- own case dispatch), refuse every other live kind as door-owned: onboarding_proposed
  -- (Door 2's -- the A14 name-family wall + firm-narrow CLR28 egress authorization this
  -- generic verb cannot see), correction_proposed (the wrong-client-correction proposal's
  -- own resolved-destination authority), and promotion_proposed (no writer exists today --
  -- review law 2: absence is not evidence it never will, so it is walled anyway). The
  -- membership test is exact-string, case-sensitive `in`, so NULL, an unknown spelling, a
  -- whitespace variant, and a differently-cased admitted kind all fail it by the SAME one
  -- test. Refused here, BEFORE the op-key reservation, so a refused attempt settles no
  -- receipt. A FUTURE eighth CHECK value is refused by default until a later PR
  -- deliberately widens this roster -- fail closed, never open by default.
  if p_kind is null or p_kind not in ('unattributed','collision','contradiction','identity_document') then
    raise exception 'a firm question of this kind must be opened through its own purpose-built door, not the generic wake_open_firm_question verb'
      using errcode='CLR10',
      detail=jsonb_build_object('reason','door_owned_kind','class','kind','kind',p_kind)::text;
  end if;
  v_dedupe := clara._reserve_op(w.firm_id,'wake_open_firm_question',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'kind',p_kind,'question',p_question)));
  if v_dedupe is not null then return v_dedupe; end if;
  insert into clara.agent_filing_receipts(firm_id, document_id, client_id, filing_id,
      model, model_version, rationale, verdict, failing_rungs, via_wake_kind,
      trigger_kind, trigger_id, acting_actor, on_behalf_of)
    values (w.firm_id, p_document, null, null,
      p_model->>'model', p_model->>'version', p_rationale,
      jsonb_build_object('citations','[]'::jsonb, 'note','standalone firm question, no ladder run'),
      -- NOT a borrowed Annex A.2 rung token (a first draft used attribution_no_basis, which
      -- would over-count B3's failure rate the moment design SS7's re-measurement runs -- MEASURED
      -- by independent review, corrected). This IS a ladder-external act, so it gets its own,
      -- honestly-named, out-of-vocabulary marker that no rung ever emits.
      array['not_a_ladder_run']::text[], w.wake_kind, 'wake_task', w.credential_id::text,
      clara.agent_user_id(), w.on_behalf_of)
    returning id into v_receipt_id;
  v_question_id := clara._firm_question_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of,
    w.wake_kind, p_document, p_kind, p_question, coalesce(p_candidates,'[]'::jsonb), v_receipt_id::text);
  return clara._finish_op(w.firm_id,'wake_open_firm_question',p_op_key,
    jsonb_build_object('question_id', v_question_id, 'receipt_id', v_receipt_id));
end $fn$;
comment on function clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text) is
  'PROGRESS 3a, WIDENED per fold review (Codex FIX-REQUIRED HIGH on #447): admits EXACTLY '
  'the four ladder-derived kinds (unattributed, collision, contradiction, '
  'identity_document) and refuses every other live kind -- onboarding_proposed, '
  'correction_proposed, promotion_proposed -- as door-owned (CLR10/door_owned_kind), '
  'before op-key reservation. NULL/unknown/whitespace/case variants all fail the same '
  'exact-string membership test. A future CHECK value fails closed until a door claims '
  'it and a later PR widens this roster. Every prior wall (op_key/rationale/model shape, '
  'TA-P4 A receipt-first-then-question) is byte-preserved from the pre-existing 0126 '
  'body. Delegates to the shared, UNGRANTED clara._firm_question_core (born 0103, RECUT '
  'by 0148 for the duplicate-open handler -- 0148 never touched this wrapper), reachable '
  'by clara_wake_filing only.';

reset role;

-- =====================================================================================
-- SECTION 2 -- TAIL. Every claim re-read from the live catalog, BY PROPERTY, never by
-- name alone -- a function that "gained a wall" that turns out to be a comment is exactly
-- the failure this census exists to catch.
-- =====================================================================================
do $tail$
declare
  v_src text; v_sha text; v_n int; v_acl text; v_pre text;
  v_reach text;
begin
  -- (1) exactly one overload, still SECURITY DEFINER + pinned search_path + owned by
  -- clara_fn_owner, ACL byte-unchanged from the prestate capture.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = 'wake_open_firm_question';
  if v_n <> 1 then
    raise exception 'wake_open_firm_question_kind_wall tail: expected exactly ONE wake_open_firm_question overload, found %', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'wake_open_firm_question_kind_wall tail: wake_open_firm_question is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  select v from _kw_pre where k = 'acl' into v_pre;
  if v_acl is distinct from v_pre then
    raise exception 'wake_open_firm_question_kind_wall tail: wake_open_firm_question ACL moved (pre %, post %)', v_pre, v_acl using errcode = 'CLR10';
  end if;

  -- ...and, read as a REACHABILITY fact rather than an ACL string: EXACTLY clara_wake_filing,
  -- derived from pg_roles rather than a hand-written list (0148's own lesson: a literal
  -- list rots the moment a role is added or renamed).
  select coalesce(string_agg(t.role, ','), '(none)') into v_reach
    from (select rolname as role from pg_roles where rolname like 'clara\_%' and rolname <> 'clara_fn_owner'
          union all select 'public') t
   where has_function_privilege(t.role, 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure, 'execute');
  if v_reach <> 'clara_wake_filing' then
    raise exception 'wake_open_firm_question_kind_wall tail: wake_open_firm_question reachability is % , expected exactly clara_wake_filing', v_reach using errcode = 'CLR10';
  end if;

  -- (2) every prior wall string survives, byte-exact, and the new wall is present and
  -- positioned BEFORE _reserve_op (a refusal spends no reservation).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure;
  if position('perform clara.assert_wake_allowed(w.wake_kind, ''wake_open_firm_question'')' in v_src) = 0
     or position('no valid wake credential' in v_src) = 0
     or position('an unattended firm question must state its rationale' in v_src) = 0
     or position('an unattended firm question must name its model (provider, model, version)' in v_src) = 0
     or position('not_a_ladder_run' in v_src) = 0
     or position('insert into clara.agent_filing_receipts' in v_src) = 0 then
    raise exception 'wake_open_firm_question_kind_wall tail: the recut wake_open_firm_question lost a pre-existing wall string' using errcode = 'CLR10';
  end if;
  if position('if p_kind is null or p_kind not in (''unattributed'',''collision'',''contradiction'',''identity_document'') then' in v_src) = 0
     or position('jsonb_build_object(''reason'',''door_owned_kind'',''class'',''kind'',''kind'',p_kind)::text' in v_src) = 0 then
    raise exception 'wake_open_firm_question_kind_wall tail: the recut wake_open_firm_question is missing its new positive-roster door-owned-kind refusal' using errcode = 'CLR10';
  end if;
  if position('if p_kind is null or p_kind not in (''unattributed'',''collision'',''contradiction'',''identity_document'') then' in v_src)
     >= position('v_dedupe := clara._reserve_op(w.firm_id,''wake_open_firm_question''' in v_src) then
    raise exception 'wake_open_firm_question_kind_wall tail: the new refusal is not positioned before the op-key reservation' using errcode = 'CLR10';
  end if;

  -- (1b) fold FIND-3 / LOW: the recut is BYTE-IDENTICAL to the 3d6c6d8a... preimage
  -- OUTSIDE the one ruled splice -- a marker census (checking that wall strings and
  -- prior wall strings are present) can be fooled by a recut that keeps every marker AND
  -- adds the wall AND changes something else nearby (e.g. drops a provenance comment);
  -- this cannot. Removing EXACTLY this splice must reproduce the preimage with NOTHING
  -- else different, or it raises (0144's own "surgical-delta strip-the-block" idiom).
  declare
    v_inserted_block text; v_stripped text; v_postimage_sha text;
  begin
    v_inserted_block := $blk$  -- PROGRESS.md Known-issues 3a / this migration, WIDENED per fold review (Codex
  -- FIX-REQUIRED HIGH on #447, ruled 2026-08-30): a POSITIVE, fail-closed roster -- admit
  -- EXACTLY the four kinds the attribution ladder itself DERIVES as a real ladder run's
  -- own verdict (unattributed, collision, contradiction, identity_document -- 0126:1435's
  -- own case dispatch), refuse every other live kind as door-owned: onboarding_proposed
  -- (Door 2's -- the A14 name-family wall + firm-narrow CLR28 egress authorization this
  -- generic verb cannot see), correction_proposed (the wrong-client-correction proposal's
  -- own resolved-destination authority), and promotion_proposed (no writer exists today --
  -- review law 2: absence is not evidence it never will, so it is walled anyway). The
  -- membership test is exact-string, case-sensitive `in`, so NULL, an unknown spelling, a
  -- whitespace variant, and a differently-cased admitted kind all fail it by the SAME one
  -- test. Refused here, BEFORE the op-key reservation, so a refused attempt settles no
  -- receipt. A FUTURE eighth CHECK value is refused by default until a later PR
  -- deliberately widens this roster -- fail closed, never open by default.
  if p_kind is null or p_kind not in ('unattributed','collision','contradiction','identity_document') then
    raise exception 'a firm question of this kind must be opened through its own purpose-built door, not the generic wake_open_firm_question verb'
      using errcode='CLR10',
      detail=jsonb_build_object('reason','door_owned_kind','class','kind','kind',p_kind)::text;
  end if;
$blk$;
    v_stripped := replace(v_src, v_inserted_block, '');
    if encode(sha256(convert_to(v_stripped,'UTF8')),'hex') <> '3d6c6d8ada9ac43f326cb8ffb14da41e2dae77a1d8e1600564fe014ba331cf46' then
      raise exception 'wake_open_firm_question_kind_wall tail: stripping the exactly-one-inserted splice from the new body does not reproduce the 3d6c6d8a... preimage byte-for-byte -- the recut touched something beyond the ruled wall (e.g. a dropped provenance comment), or this check''s own splice text has drifted from the live body' using errcode = 'CLR10';
    end if;
    v_postimage_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_postimage_sha <> 'a592b6128da3fda2ef5497eae82331ddb382b3650abfc842ef710a6f59871964' then
      raise exception 'wake_open_firm_question_kind_wall tail: the reviewed postimage prosrc sha256 mismatch (got %, expected a592b6128da3fda2ef5497eae82331ddb382b3650abfc842ef710a6f59871964) -- the live body no longer matches the exact text the fold review reviewed', v_postimage_sha using errcode = 'CLR10';
    end if;
  end;

  -- (3) the sole other kind-vocabulary writer this file is scoped around, unmoved: Door 2
  -- still exists, still carries its own body check, name-family wall and egress auth.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)'::regprocedure;
  if v_src is null
     or position('clara.name_family_is_ambiguous(w.firm_id, v_name)' in v_src) = 0
     or position('no live, admissible-purpose egress authorization for this proposal' in v_src) = 0
     or position('an onboarding proposal is already open for this document' in v_src) = 0 then
    raise exception 'wake_open_firm_question_kind_wall tail: wake_propose_client_onboarding lost a wall this file''s refusal points callers toward -- this file must not have touched it' using errcode = 'CLR10';
  end if;

  -- (4) firm_open_questions_kind_check is unmoved -- this file adds no new kind and drops
  -- none; the wall is a verb-side refusal, not a vocabulary change.
  declare v_def text;
  begin
    select pg_get_constraintdef(oid) into v_def from pg_constraint
     where conrelid = 'clara.firm_open_questions'::regclass and conname = 'firm_open_questions_kind_check';
    if v_def is distinct from
       'CHECK ((kind = ANY (ARRAY[''unattributed''::text, ''collision''::text, ''contradiction''::text, ''identity_document''::text, ''correction_proposed''::text, ''promotion_proposed''::text, ''onboarding_proposed''::text])))' then
      raise exception 'wake_open_firm_question_kind_wall tail: firm_open_questions_kind_check moved -- this file is a verb-side refusal only, expected 0148''s exact 7-value text (got %)', coalesce(v_def,'(none)') using errcode = 'CLR10';
    end if;
  end;

  raise notice 'wake_open_firm_question_kind_wall tail: OK -- wake_open_firm_question resolves at exactly ONE overload, SECURITY DEFINER + pinned search_path + clara_fn_owner-owned, its ACL and its REACHABILITY (measured through has_function_privilege, not an ACL string) both byte/set-unchanged at clara_wake_filing exclusively; every prior wall string (credential/op_key/rationale/model/receipt-first) survives verbatim; the new refusal (CLR10/door_owned_kind on p_kind=''onboarding_proposed'') is present and positioned strictly BEFORE the op-key reservation, so a refused attempt settles no receipt; clara.wake_propose_client_onboarding (Door 2) is untouched and still carries its own body check, A14 name-family wall and CLR28 egress authorization -- the honest recourse this refusal points a caller toward; firm_open_questions_kind_check is unmoved at its exact 7-value text (this is a verb-side refusal, not a vocabulary change). No table in workflow/graphile_worker/spike touched.';
end
$tail$;
