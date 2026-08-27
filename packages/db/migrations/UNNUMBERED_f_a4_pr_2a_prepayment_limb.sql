-- =================================================================================================
-- F-A4 · Close key ① · PR-2a — WRAPPER 12'S UNPARK + THE CLOSE-LIMB DEBT BATCH.
--
-- *** THIS FILE CARRIES A D1 WRITE-QUIESCE OBLIGATION. Read "THE D1 WINDOW" below before deploy. ***
--
-- Design of record, APPROVED-FOR-BUILD after a four-pass review arc, on branch `f-a4/pr-2-design`
-- (PR #372, tip cd33d42 — the provenance this file is built against):
--   docs/plan/active/fa4-pr2-design-2026-08-27.md        §§0-5  (the ruling · scope · verb census ·
--                                                                the carrier · the evaluator)
--   docs/plan/active/fa4-pr2-design-part2-2026-08-27.md  §§6-14 (wrapper 12 · the debt batch ·
--                                                                §9 the section plan · the rulings)
--   docs/plan/active/fa4-pr2-annexes-2026-08-27.md       B-C    (measurements · the OCR follow-up)
--   docs/plan/active/fa4-pr2-derivations-2026-08-27.md   D-H    (MED-8 · the receipt subject ·
--                                                                the pre-rungs · F4 · F1's surgery)
--   docs/plan/active/fa4-pr2-battery-2026-08-27.md       A      (the 44 walls, each with a mutant)
-- Section numbers run CONTINUOUSLY across the design pair: a cite of "§13 item 4" resolves in part 2.
-- Ancestry: 0138 (the close agent limb, which PARKED this verb) and its records
-- docs/plan/active/fa4-pr1c-fix-order-2026-08-27.md · fa4-pr1c-codex-review-2026-08-27.md.
--
-- THE RULING THIS FILE IS BUILT ON — R6, the law of this train (design §0):
--   "The clocked lane may draft/propose admin-floor material (reversible, receipted), but
--    establishing/signing stays a human act at its ADMIN floor; no floor is ever lowered for the
--    agent."
-- Read against 0138's park, R6 does not merely authorize the unpark — it SHRINKS it. The park
-- (0138:39-48, deviation (1)(a)) rests partly on routing wrapper 12 through "the live propose/sign
-- template cores", which would mean recutting TWO deployed audited writers. Under R6 the SIGN half
-- has no agent consumer, now or ever: clara.sign_adjustment_template opens
-- _human_ctx(role_rank('admin')) (0045:4269), precisely the floor R6 says is never lowered. An
-- extracted sign core would be a PERMANENT DEAD MEMBER (law 31) and would double the D1 window for
-- nothing. Therefore: ONE core extraction, not two — CONDUCTOR-RATIFIED 2026-08-27 (design §13).
-- *** A LATER BUILD LANE MUST NOT "RESTORE" THE SIGN EXTRACTION. *** The agent drafts a `proposed`
-- template; the human admin signs it through the UNTOUCHED clara.sign_adjustment_template, whose
-- content_hash freeze at signature (0045:1151) is what makes a professional's signature bind a
-- specific set of lines.
--
-- WHAT LANDS HERE, section by section — design part 2 §9's apply-order plan, executed literally:
--   §0   prestate — every claim this file makes about what it edits, MEASURED before it edits, plus
--        the absence of every object it creates and a POSITIVE read of the close_prep wake source
--        at enabled = false
--   §A   clara.document_service_periods — the DB-owned term carrier (design §4), its
--        region-congruence trigger (§4.1a/F6), indexes, forced RLS and policies
--   §A2  F1's carrier surgery, additive half — adjustment_templates.schedule +
--        clara._adj_canon_schedule + clara._adj_period_lines (§5.2)
--   §B   the human door clara.record_document_service_period, built DOOR -> CORE from birth (§4.2)
--   §C   clara.prepayment_schedule_v1 + its deliberately SINGLE-MEMBER evaluator_versions
--        registration (§5, §5.1)
--   §D   THE EXTRACTION — clara._propose_adjustment_template_core, then the door as a thin
--        delegate, now also carrying p_schedule (§6.1)                                    [D1]
--   §D2  F1 — clara._adj_template_hash at eight arguments, null-stable (§5.2, Annex H.5)   [D1]
--   §D3  F1 — clara._adj_run_occurrence_core and clara._adj_on_approve resolve per-period
--        lines through the new resolver (§5.2, Annex H.4)                                  [D1]
--   §E   agent_act_receipts.subject_kind admits 'adjustment_template' — extend, never rewrite (§6.3)
--   §F   wrapper 12 — clara._agent_prepayment_schedule_core +
--        clara.wake_establish_prepayment_schedule + allowlist row 13 + the one grant (§6.2)
--   §G   residual 1 — the bookkeeper conjunct mirrored into two read policies (§7)
--   §H   MED-8 — clara._agent_close_proposal_core CoR: rung B11b + the truthful settle_reason (§8)
--   §H2  F4 — clara._agent_mint_month_snapshot_core CoR: the month-scoped receipt op key (§6.3a)
--   §D4  F2 wall 3, visible half — clara._adj_template_json projects schedule + the target account
--        (§5.3). A live body, so it takes the prosrc pin and the CoR — but a READ PROJECTION, so an
--        in-flight call is STALE, never WRONG (§5.2's M1 distinction)
--   §I   the catalog-comment truings (Annex B.4, B.5)
--   §TAIL the strengthened index/policy censuses, the closed ungranted set, the thirteen-count
--        flips, and the frozen-schema check (constraint 15)
--
-- ============================== THE D1 WINDOW — READ BEFORE DEPLOY ==============================
--
-- FOUR BODIES ARE GENUINELY LIVE and are replaced here, so a call spanning this migration runs the
-- OLD body (PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it STARTED with):
--   * clara.propose_adjustment_template   — hot
--   * clara._adj_template_hash            — one caller (0045:3850)
--   * clara._adj_run_occurrence_core      — THE DAILY UNATTENDED ADJUSTMENT BELT
--   * clara._adj_on_approve               — every approve of an occurrence
-- Standard quiesce from docs/ops/, the CA-pinned bridge of docs/ops/dsn-bridge.md, FROM MERGED
-- `main`, NEVER a branch.
--
-- WHAT BOUNDS THE WIDENED RADIUS IS STRUCTURAL NULL-STABILITY — this is the sentence the ceremony
-- conductor is meant to read (design §9, N9; Annex H.4). It does NOT rest on a survey of existing
-- rows finding them all null. It rests on §0's prestate, which pins the ABSENCE OF EVERY OBJECT
-- THIS FILE CREATES, `adjustment_templates.schedule` among them: a column that does not exist until
-- this file runs cannot hold a non-null value in any row when it does. Every template is therefore
-- `schedule is null` BY CONSTRUCTION on the day this applies, and each of the four recut bodies is
-- observably unchanged BY CONSTRUCTION — not by a survey that happened to find no counterexample
-- (review law 2, applied to our own claim). Cells W36/W37 are the rig proof of a fact the prestate
-- already guarantees: they are the belt, not the argument.
--
-- IT IS STILL **ONE** WINDOW. These four are one layer — the adjustment carrier and its readers —
-- which is what D-24's severance law asks a window to be.
--
-- THE FOUR-BODY COUNT IS **EARNED**, not free (design §5.2a, N1). It holds only because §A2/§D's
-- congruence constraint (validated AT PROPOSE) makes six OTHER live `t.lines` readers correct by
-- construction. Without clause (a) — shape congruence — the D1 inventory is **SIX** bodies, not
-- four; Annex H.3 censuses all six with their sites. The number rests on a validation the propose
-- door performs, not on those readers being incurious.
--
-- FOUR IS THE COUNT OF D1 *CORRECTNESS HAZARDS*; THE CoR SET IS **FIVE** (design §9, M1). §D4
-- recuts clara._adj_template_json — genuinely live (ungranted itself, but reached by
-- clara.list_adjustment_templates, called 0045:6647 and granted to clara_authenticated at
-- 0045:6721, so a human panel really does execute it). But it is a READ PROJECTION: a call spanning
-- this migration returns the OLD SHAPE, which is STALE, NOT WRONG — a panel that renders without
-- the schedule column for one request, never a number posted against the wrong body. It therefore
-- takes its own prosrc pin and its own CoR, and it does NOT join the correctness four. Stated
-- rather than blurred, because a conductor counting bodies and one counting hazards should both get
-- a true answer.
--
-- THE OTHER TWO RECUT BODIES ARE DECLARED AND PROVABLY IDLE. clara._agent_close_proposal_core (§H)
-- and clara._agent_mint_month_snapshot_core (§H2) are each reachable only through their own wrapper
-- under a close_prep credential, and the close_prep clara.wake_engine_sources row ships
-- `enabled = false`. §0 reads that flag POSITIVELY and REFUSES TO APPLY if it is true: absence of
-- traffic is not evidence, a read of the disabled flag is (review law 2). ONE idle-slot argument
-- covers both, which is the whole reason F4 is cheaper to fix here than to carry.
--
-- ========================== CARRIED FORWARD BY NAME, not by silence ==========================
-- Named so a later reader finds the reason instead of the absence (law 31, the 0138:100-111 shape):
--   * clara.withdraw_close_proposal_item — the NAMED retraction act design §8 sketches. B11b admits
--     growth and refuses trade, which leaves the legitimate correction-that-DROPS-a-pair with no
--     door. It does not ship here: it is a fourteenth wrapper with its own allowlist row, grant,
--     ladder and battery — a second verb's worth of surface in a train whose window is already
--     sized for one layer (D-24). Until it lands, a proposal that must lose a drafted pair is
--     withdrawn by a human through clara.settle_close_proposal(..., 'withdrawn') (0138:1671ff).
--   * close_attestations.from_proposal_id — Annex B.5's recommendation, carried to PR-3 by name.
--     §I recuts the over-claiming comment instead; the residual gap is a PROVENANCE BLUR, not a
--     wrong number, and closing it means recutting clara.attest_close_exception — the estate's
--     most-reviewed close writer — inside a window sized for one layer. Cell W28 keeps the blur
--     visible so it cannot go quiet.
--   * The OCR half of the service period — Annex C. basis_kind = 'extracted' ships here with NO
--     WRITER, deliberately: a declared SHAPE, not a live claim (the 0138:342-345 idiom, quoted
--     exactly), so a later PR that unparks it extends nothing. Its four steps and the three reasons
--     it is not in PR-2a are in Annex C; a table comment in §A says so at the catalog.
--   * B13 arm 1 (reason `fa_period_due`) — still parked, carried from 0138:104-111. It needs a real
--     FA register with a period stranded in an EARLIER fiscal year, and it FAILS CLOSED.
--
-- =================================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file does no
                                        -- backfill and no bulk scan. The one added column is
                                        -- nullable with no default, so the ALTER is a catalog-only
                                        -- operation; the cost here is the CoR set, not data.

-- =================================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
--
-- Two kinds of claim live here and they are NOT interchangeable:
--   (i)  STRUCTURAL claims — an overload count, an ACL, a secdef/config triple, the ABSENCE of an
--        object. These are re-derived here from the live catalog every time the file runs.
--   (ii) IDENTITY claims — the prosrc sha256 of each body this file replaces. These are pinned as
--        literals (the 0124:38-41 tripwire shape) and are read BY RIG REPLAY against
--        pg_get_functiondef, never from a migration's file text and never from a design's line
--        cite. The F-A3/PR-1b lesson is the reason: a CoR built from a migration's FILE TEXT
--        silently erased a LATER migration's own dynamic patch on that body.
-- =================================================================================================
do $prestate$
declare
  v_n      int;
  v_txt    text;
  v_sha    text;
  v_enabled boolean;
  v_sig    text;
begin
  -- ---------------------------------------------------------------------------------------------
  -- §0.1 — THE ABSENCE OF EVERY OBJECT THIS FILE CREATES.
  -- This is not hygiene. It is the LOAD-BEARING PREMISE of the whole D1 argument (Annex H.4): if
  -- `adjustment_templates.schedule` does not exist now, then no row can carry a non-null schedule
  -- when this file runs, and the four recut bodies are null-stable BY CONSTRUCTION rather than by
  -- survey. If any of these already exists, the premise is false and we must not proceed.
  -- ---------------------------------------------------------------------------------------------
  if to_regclass('clara.document_service_periods') is not null then
    raise exception 'F-A4 PR-2a prestate: clara.document_service_periods already exists'
      using errcode = 'CLR10', detail = '{"reason":"prestate_object_present"}';
  end if;

  select count(*)::int into v_n from pg_attribute
   where attrelid = 'clara.adjustment_templates'::regclass
     and attname = 'schedule' and not attisdropped;
  if v_n <> 0 then
    raise exception 'F-A4 PR-2a prestate: adjustment_templates.schedule already exists — the null-stability premise (Annex H.4) is FALSE and the D1 argument does not hold'
      using errcode = 'CLR10', detail = '{"reason":"prestate_schedule_column_present"}';
  end if;

  foreach v_sig in array array[
      'clara._adj_canon_schedule(jsonb)',
      'clara._adj_period_lines(clara.adjustment_templates,date,date)',
      'clara._record_document_service_period_core(jsonb,uuid,date,date,text,text)',
      'clara.record_document_service_period(uuid,date,date,text,text)',
      'clara.prepayment_schedule_v1(uuid,uuid)',
      'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)',
      'clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,jsonb,text)',
      'clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,jsonb,text)',
      'clara._tf_document_service_period_region_congruent()'
    ] loop
    if to_regprocedure(v_sig) is not null then
      raise exception 'F-A4 PR-2a prestate: % already exists', v_sig
        using errcode = 'CLR10', detail = '{"reason":"prestate_function_present"}';
    end if;
  end loop;

  -- 0138's T.9 (:2944-2951) proved the parked half ABSENT by a positive pg_proc read. This is the
  -- other end of that gate: PR-2a is the PR that flips it, and §TAIL carries the converse. Read
  -- here so the flip is anchored at BOTH ends of the same file (the fold-seam law).
  raise notice 'F-A4 PR-2a prestate: the parked pair (wake_establish_prepayment_schedule, prepayment_schedule_v1) is confirmed ABSENT — 0138 T.9''s claim still holds at the moment this file begins, and §TAIL inverts it.';

  -- ---------------------------------------------------------------------------------------------
  -- §0.2 — THE close_prep WAKE SOURCE IS DISABLED, READ POSITIVELY.
  -- §H and §H2 recut two bodies created by 0138. Their "declared but provably idle" status is what
  -- lets them ride one declared slot instead of buying their own window. ABSENCE OF TRAFFIC IS NOT
  -- EVIDENCE (review law 2) — a READ OF THE DISABLED FLAG is. If it is enabled, this file must not
  -- apply: the idle-slot argument would be false and §H/§H2 would owe a real window.
  -- ---------------------------------------------------------------------------------------------
  -- (i) The NAMED row, read positively. Keyed on source_key, which is this table's identity column
  -- (wake_kind is NOT unique — see (ii)).
  select enabled into v_enabled from clara.wake_engine_sources where source_key = 'close_prep';
  if not found then
    raise exception 'F-A4 PR-2a prestate: no close_prep row in clara.wake_engine_sources — 0138''s registration is missing, so the idle-slot premise cannot be read at all'
      using errcode = 'CLR10', detail = '{"reason":"prestate_wake_source_absent"}';
  end if;
  if v_enabled is distinct from false then
    raise exception 'F-A4 PR-2a prestate: the close_prep wake source is ENABLED (%) — §H/§H2''s declared-but-idle argument is FALSE and those two CoRs owe their own D1 window', v_enabled
      using errcode = 'CLR10', detail = '{"reason":"prestate_wake_source_enabled"}';
  end if;

  -- (ii) THE WHOLE close_prep POPULATION, which is what the argument actually rests on — a
  -- STRENGTHENING over the design's wording, and the rig is why it is here. §H/§H2's bodies are
  -- reachable through ANY source that can mint a close_prep credential, not only through the row
  -- that happens to be named 'close_prep'. wake_kind is NOT unique: this rig carries a second
  -- close_prep-kind source (a G1 test registration), and on any estate a later lane may add one.
  -- Reading only the named row would therefore answer a NARROWER question than the one the D1
  -- argument asks, and would read green while a sibling source was live. Absence of traffic is not
  -- evidence (review law 2); this is the read that makes "provably idle" true rather than likely.
  select count(*)::int into v_n from clara.wake_engine_sources
   where wake_kind = 'close_prep' and enabled;
  if v_n <> 0 then
    raise exception 'F-A4 PR-2a prestate: % wake_engine_sources row(s) of wake_kind close_prep are ENABLED — §H/§H2''s declared-but-idle argument is FALSE even though the row named close_prep is disabled', v_n
      using errcode = 'CLR10', detail = '{"reason":"prestate_wake_kind_enabled"}';
  end if;
  select count(*)::int into v_n from clara.wake_engine_sources where wake_kind = 'close_prep';
  raise notice 'F-A4 PR-2a prestate: close_prep wake source read POSITIVELY at enabled = false, AND all % source(s) of wake_kind close_prep are disabled — §H/§H2 ride one declared idle slot (design §9), proven over the whole population rather than one named row.', v_n;

  -- ---------------------------------------------------------------------------------------------
  -- §0.3 — THE FIVE LIVE BODIES: exactly one overload each, at the pinned signature.
  -- Read law 3 (spelling is not identity): a bare proname would match any overload, so every probe
  -- below resolves the exact regprocedure AND asserts the overload count is one, which is what makes
  -- the later `create or replace` provably hit the body we measured.
  -- ---------------------------------------------------------------------------------------------
  foreach v_sig in array array[
      'clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid)',
      'clara._adj_template_hash(text,text,date,date,boolean,jsonb,text)',
      'clara._adj_run_occurrence_core(uuid,uuid,date,date,text,uuid,uuid,text)',
      'clara._adj_on_approve(uuid)',
      'clara._adj_template_json(uuid)'
    ] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A4 PR-2a prestate: % does not resolve — the body this file replaces is not where the design measured it', v_sig
        using errcode = 'CLR10', detail = '{"reason":"prestate_target_absent"}';
    end if;
  end loop;

  -- The ACL/ownership/search_path triple on the two human writers, captured for §TAIL's byte
  -- comparison (cell W4). Annex B.0c measured both as clara_authenticated ONLY — no wake role, no
  -- runtime role, no PUBLIC — granted through 0045's bulk loop at :6712 and :6713.
  create temp table _fa4_pr2a_prestate(k text primary key, v text) on commit drop;

  insert into _fa4_pr2a_prestate(k, v)
  select 'acl:' || p.oid::regprocedure::text,
         coalesce(array_to_string(p.proacl::text[], '|'), '(default)')
    from pg_proc p
   where p.oid in (
     to_regprocedure('clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid)'),
     to_regprocedure('clara.sign_adjustment_template(uuid,uuid,text)'),
     to_regprocedure('clara._adj_template_hash(text,text,date,date,boolean,jsonb,text)'),
     to_regprocedure('clara._adj_run_occurrence_core(uuid,uuid,date,date,text,uuid,uuid,text)'),
     to_regprocedure('clara._adj_on_approve(uuid)'),
     to_regprocedure('clara._adj_template_json(uuid)'));

  insert into _fa4_pr2a_prestate(k, v)
  select 'triple:' || p.oid::regprocedure::text,
         p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '(none)')
                           || '|' || pg_get_userbyid(p.proowner)
    from pg_proc p
   where p.oid in (
     to_regprocedure('clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid)'),
     to_regprocedure('clara.sign_adjustment_template(uuid,uuid,text)'),
     to_regprocedure('clara._adj_template_hash(text,text,date,date,boolean,jsonb,text)'),
     to_regprocedure('clara._adj_run_occurrence_core(uuid,uuid,date,date,text,uuid,uuid,text)'),
     to_regprocedure('clara._adj_on_approve(uuid)'),
     to_regprocedure('clara._adj_template_json(uuid)'));

  -- The PRE-IMAGE prosrc sha of each replaced body, captured for §TAIL's differential. The tail
  -- proves the moved text is unchanged MODULO the ruled edits — a byte-diff against a pre-edit
  -- pull, which is the only instrument that catches the "successor silently erased a predecessor's
  -- dynamic patch" class (F-A3/PR-1b).
  insert into _fa4_pr2a_prestate(k, v)
  select 'prosrc_sha:' || p.oid::regprocedure::text, encode(sha256(p.prosrc::bytea), 'hex')
    from pg_proc p
   where p.oid in (
     to_regprocedure('clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid)'),
     to_regprocedure('clara._adj_template_hash(text,text,date,date,boolean,jsonb,text)'),
     to_regprocedure('clara._adj_run_occurrence_core(uuid,uuid,date,date,text,uuid,uuid,text)'),
     to_regprocedure('clara._adj_on_approve(uuid)'),
     to_regprocedure('clara._adj_template_json(uuid)'));

  -- clara.sign_adjustment_template is UNTOUCHED by this train (NON-GOAL 2, R6). Its sha is pinned
  -- here and re-read byte-identical in §TAIL — a positive proof that the scope cut HELD, rather
  -- than a promise that it did.
  select encode(sha256(p.prosrc::bytea), 'hex') into v_sha from pg_proc p
   where p.oid = to_regprocedure('clara.sign_adjustment_template(uuid,uuid,text)');
  insert into _fa4_pr2a_prestate(k, v) values ('untouched_sha:sign_adjustment_template', v_sha);

  -- Likewise clara._adj_canon_lines: NON-GOAL 13 says the schedule is a SIBLING structure and this
  -- helper is not touched, which is the single biggest reason this stays a four-body recut rather
  -- than an estate-wide one (Annex H.3).
  select encode(sha256(p.prosrc::bytea), 'hex') into v_sha from pg_proc p
   where p.oid = to_regprocedure('clara._adj_canon_lines(jsonb)');
  if v_sha is null then
    raise exception 'F-A4 PR-2a prestate: clara._adj_canon_lines(jsonb) does not resolve — §A2''s resolver delegates to it'
      using errcode = 'CLR10', detail = '{"reason":"prestate_target_absent"}';
  end if;
  insert into _fa4_pr2a_prestate(k, v) values ('untouched_sha:_adj_canon_lines', v_sha);

  -- Likewise clara._tf_adjustment_template_transition (0045:1323-1350). Design §5.3 leans on it:
  -- it freezes every column outside the eight lifecycle stamps and raises CLR38
  -- adjustment_template_immutable on any other difference — so a sign-time edit is not merely
  -- forbidden by policy, THE STORAGE LAYER REFUSES IT. Because `schedule` is a NEW column and is
  -- not in that frozen set, it inherits that immutability with NO CHANGE TO THE TRIGGER AT ALL.
  -- Pinned so §TAIL can prove we did not quietly widen it.
  select encode(sha256(p.prosrc::bytea), 'hex') into v_sha from pg_proc p
   where p.oid = to_regprocedure('clara._tf_adjustment_template_transition()');
  insert into _fa4_pr2a_prestate(k, v) values ('untouched_sha:_tf_adjustment_template_transition', v_sha);

  -- ---------------------------------------------------------------------------------------------
  -- §0.4 — THE RECEIPT CARRIER'S SHAPE, as 0138 left it. §E extends subject_kind by exactly one
  -- value; this reads the CURRENT closed set so the extension is provably an EXTENSION and not a
  -- rewrite that happens to look like one.
  -- ---------------------------------------------------------------------------------------------
  -- SELECTED BY conname, never by a LIKE over the definition (the T.1b2 / settle-door S3 lesson:
  -- a predicate that matches on spelling picks up whatever else happens to contain the word).
  -- The name is the one POSTGRES generated, because 0138 wrote subject_kind's CHECK inline on the
  -- column rather than as a named table constraint — measured on the rig, not guessed from the
  -- file. §E replaces it with an EXPLICITLY named constraint so the next lane can select it by a
  -- name it chose rather than one the system did.
  select pg_get_constraintdef(c.oid) into v_txt
    from pg_constraint c
   where c.conrelid = 'clara.agent_act_receipts'::regclass
     and c.conname  = 'agent_act_receipts_subject_kind_check';
  if v_txt is null then
    raise exception 'F-A4 PR-2a prestate: agent_act_receipts_subject_kind_check not found on clara.agent_act_receipts'
      using errcode = 'CLR10', detail = '{"reason":"prestate_constraint_absent"}';
  end if;
  if position('adjustment_template' in v_txt) > 0 then
    raise exception 'F-A4 PR-2a prestate: subject_kind already admits adjustment_template'
      using errcode = 'CLR10', detail = '{"reason":"prestate_already_extended"}';
  end if;
  insert into _fa4_pr2a_prestate(k, v) values ('subject_kind_check', v_txt);

  -- The two policies §G mirrors the bookkeeper conjunct into. Captured so §TAIL can assert the
  -- firm predicate SURVIVED and the rank conjunct was ADDED — not that the expression merely
  -- changed (residual 3 / Annex B.2: a policy census that counts policies reads nothing).
  insert into _fa4_pr2a_prestate(k, v)
  select 'policy:' || pol.polname, pg_get_expr(pol.polqual, pol.polrelid)
    from pg_policy pol
   where pol.polname in ('p_cp_human', 'p_cph_human');

  select count(*)::int into v_n from _fa4_pr2a_prestate where k like 'policy:%';
  if v_n <> 2 then
    raise exception 'F-A4 PR-2a prestate: expected 2 policies to mirror (p_cp_human, p_cph_human), found %', v_n
      using errcode = 'CLR10', detail = '{"reason":"prestate_policy_count"}';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- §0.5 — THE ALLOWLIST'S PRE-COUNT. §F adds the THIRTEENTH close_prep row. Captured so §TAIL's
  -- flip is a measured DELTA rather than a literal restated (0138's own tail lesson).
  -- ---------------------------------------------------------------------------------------------
  select count(*)::int into v_n from clara.wake_fn_allowlist where wake_kind = 'close_prep';
  if v_n <> 12 then
    raise exception 'F-A4 PR-2a prestate: expected 12 close_prep allowlist rows, found % — the twelve/thirteen flip is keyed on this', v_n
      using errcode = 'CLR10', detail = '{"reason":"prestate_allowlist_count"}';
  end if;
  insert into _fa4_pr2a_prestate(k, v) values ('allowlist_close_prep_pre', v_n::text);

  raise notice 'F-A4 PR-2a prestate: OK — 9 new objects absent, adjustment_templates.schedule absent (the null-stability premise HOLDS), close_prep wake source read positively at enabled=false, 5 replaced bodies resolve at their exact signatures with their ACL/secdef/config triples and prosrc shas captured, sign_adjustment_template + _adj_canon_lines + _tf_adjustment_template_transition pinned as UNTOUCHED, subject_kind''s closed set captured pre-extension, 2 policies captured pre-mirror, 12 close_prep allowlist rows.';
end $prestate$;

-- =================================================================================================
-- §A — clara.document_service_periods — THE DB-OWNED TERM CARRIER (design §4).
--
-- WHY A TABLE AND NOT TWO COLUMNS ON clara.documents (design §4.1). Two bare date columns would be
-- the smaller diff and the wrong answer. Those rows are UPDATEd by several unattended writers
-- (0026:916, 0009:2104, persist_witness_facts in 0096) with NO immutability discipline; a date pair
-- with no basis, no recorded actor and no supersession story is exactly "a fact the storage layer
-- asserts on and a professional can rewrite" — the sentence 0045:1206-1210 minted for the lineage
-- column. A prepayment term feeds a number that enters a client's books. It needs the client_facts
-- discipline (0055:386-424, ADR-062), at DOCUMENT grain.
--
-- WHY DOCUMENT-GRAIN AND FIRM-SCOPED rather than client-scoped: client_id was DROPPED from
-- clara.documents at 0007:1105-1106 — a document's client comes from clara.document_filings
-- (0007:63-83). Annex B.0a carries that measurement.
-- =================================================================================================
create table clara.document_service_periods (
  id                 uuid        primary key default gen_random_uuid(),
  firm_id            uuid        not null references clara.firms(id),
  document_id        uuid        not null,
  period_start       date        not null,
  period_end         date        not null,
  -- CLOSED, extend-never-rewrite. 'extracted' SHIPS WITH NO WRITER, deliberately — a declared
  -- SHAPE, not a live claim (the 0138:342-345 idiom, quoted exactly), so the later PR that unparks
  -- the OCR route (Annex C) EXTENDS NOTHING. See the table comment below.
  basis_kind         text        not null check (basis_kind in ('human_stated', 'extracted')),
  -- The free-text justification is NOT optional and NOT defaulted -- 0055:392-396's rule verbatim.
  basis              text        not null check (btrim(basis) <> ''),
  evidence_region_id uuid,
  recorded_by        uuid        not null references clara.users(id),
  recorded_at        timestamptz not null default now(),
  -- DEFERRABLE so the door can stamp the predecessor with the successor's id and insert the
  -- successor in ONE transaction (checked at commit) — clara.client_facts' own idiom, 0055:401-403.
  superseded_by      uuid        references clara.document_service_periods(id) deferrable initially deferred,
  superseded_at      timestamptz,
  constraint ck_dsp_period_order check (period_end >= period_start),
  -- The stamp is ONE act: both columns or neither (0055:405-408).
  constraint ck_dsp_supersession_paired check (
    (superseded_by is null) = (superseded_at is null)),
  -- A region rides an EXTRACTED basis, and ONLY an extracted basis -- two-way, the
  -- ck_client_facts_document_basis shape (0055:409-413). A stray region id on a human_stated row
  -- would be provenance theatre; a missing one on an 'extracted' row would be a claim with no page.
  constraint ck_dsp_evidence_basis check (
    (basis_kind = 'extracted') = (evidence_region_id is not null)),
  -- TENANCY IS STRUCTURAL, not a trusted column: the (document, firm) pair is ONE fact, enforced by
  -- the composite FK onto uq_documents_id_firm (0007:58) -- the fk_client_facts_client idiom
  -- (0055:414-419). RLS trusts firm_id while every reader keys on document_id, and this constraint
  -- is what makes those two views of the row provably the same tenant.
  constraint fk_dsp_document foreign key (document_id, firm_id)
    references clara.documents (id, firm_id),
  -- The composite FK onto document_regions(id, firm_id) (0007:217) proves the region belongs to the
  -- same FIRM -- and NOTHING ELSE. document_regions hangs off extraction_id, not off a document
  -- (0007:203-220), so a period on document A could cite a region extracted from document B and
  -- every DECLARED constraint here would pass. That hole is closed by the trigger below, not by
  -- this FK; the FK is named here so a reader does not mistake it for the wall.
  constraint fk_dsp_evidence_region foreign key (evidence_region_id, firm_id)
    references clara.document_regions (id, firm_id)
);

-- ONE LIVE PERIOD PER DOCUMENT. Partial-unique on the live population, exactly the uq_client_fact_live
-- shape (0055:422-423). A superseded row does not contend.
create unique index uq_document_service_period_live on clara.document_service_periods (document_id)
  where superseded_at is null;
create index ix_document_service_periods_document
  on clara.document_service_periods (document_id, recorded_at desc);

-- -------------------------------------------------------------------------------------------------
-- §A.1 — THE REGION-CONGRUENCE TRIGGER (design §4.1a, review finding F6; derivation Annex B.0d).
--
-- THE HOLE IT CLOSES: the composite FK above proves the FIRM and nothing else, because
-- clara.document_regions is keyed to an EXTRACTION, not to a document. So without this wall a
-- period on document A could cite a region extracted from document B — provenance theatre of
-- exactly the kind §4.1 rejects two-columns-on-documents for, and WORSE here, because the whole
-- reason basis_kind='extracted' exists is to say *this fact was read off THIS page*.
--
-- It fires ONLY when evidence_region_id is non-null, so the human_stated path never meets it.
-- Cell W33 plants a region from a second document on the same firm; its mutant drops this trigger
-- and watches the forged row LAND — which is what proves the composite FK never saw it.
-- -------------------------------------------------------------------------------------------------
create function clara._tf_document_service_period_region_congruent() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_doc uuid;
begin
  if new.evidence_region_id is null then
    return new;
  end if;
  -- Resolve region -> extraction -> the document that extraction was run against. Read positively:
  -- if the chain does not resolve we REFUSE (fail-closed), never "assume congruent" (review law 2).
  select x.document_id into v_doc
    from clara.document_regions r
    join clara.document_extractions x
      on x.id = r.extraction_id and x.firm_id = r.firm_id
   where r.id = new.evidence_region_id and r.firm_id = new.firm_id;
  if v_doc is null or v_doc is distinct from new.document_id then
    raise exception 'the cited evidence region was extracted from a different document'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'service_period_evidence_foreign_document',
                                    'document_id', new.document_id,
                                    'evidence_region_id', new.evidence_region_id,
                                    'region_document_id', v_doc)::text;
  end if;
  return new;
end $$;
revoke all on function clara._tf_document_service_period_region_congruent() from public;

create trigger t_dsp_region_congruent before insert or update on clara.document_service_periods
  for each row execute function clara._tf_document_service_period_region_congruent();

-- -------------------------------------------------------------------------------------------------
-- §A.2 — SUPERSEDE-ONLY + APPEND-ONLY. The ONE lawful update is the supersession stamp; everything
-- else on the row is immutable from INSERT, and a row already superseded is immutable outright.
-- Mirrors clara._tf_client_facts_supersede_only (0055:428-455) column for column.
-- -------------------------------------------------------------------------------------------------
create function clara._tf_dsp_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded service period is immutable'
      using errcode = 'CLR10', detail = '{"reason":"service_period_immutable"}';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id                 is distinct from old.id
     or new.firm_id            is distinct from old.firm_id
     or new.document_id        is distinct from old.document_id
     or new.period_start       is distinct from old.period_start
     or new.period_end         is distinct from old.period_end
     or new.basis_kind         is distinct from old.basis_kind
     or new.basis              is distinct from old.basis
     or new.evidence_region_id is distinct from old.evidence_region_id
     or new.recorded_by        is distinct from old.recorded_by
     or new.recorded_at        is distinct from old.recorded_at then
    raise exception 'document_service_periods admits exactly one update: the supersession stamp (superseded_by and superseded_at together, set once)'
      using errcode = 'CLR10', detail = '{"reason":"service_period_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_dsp_supersede_only() from public;

create trigger t_dsp_supersede_only before update on clara.document_service_periods
  for each row execute function clara._tf_dsp_supersede_only();
create trigger t_dsp_no_delete before delete on clara.document_service_periods
  for each row execute function clara._tf_append_only();
create trigger t_dsp_no_truncate before truncate on clara.document_service_periods
  for each statement execute function clara._tf_no_truncate();

-- -------------------------------------------------------------------------------------------------
-- §A.3 — FORCED RLS + THE POLICY PAIR.
-- The human read carries the BOOKKEEPER FLOOR, not the bare firm predicate: this table holds a
-- professional's STATED BASIS, the same data class FIX-6 walled off on agent_act_receipts
-- (0138:424-427). Spelled identically to that policy so the close-limb tables read as ONE rule.
-- -------------------------------------------------------------------------------------------------
alter table clara.document_service_periods enable row level security;
alter table clara.document_service_periods force row level security;
create policy p_dsp_owner on clara.document_service_periods
  for all to clara_fn_owner using (true) with check (true);
create policy p_dsp_human on clara.document_service_periods
  for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and clara.actor_role_rank() >= clara.role_rank('bookkeeper'));
grant select on clara.document_service_periods to clara_authenticated;

comment on table clara.document_service_periods is
  'F-A4 PR-2a: the DB-OWNED term carrier for a prepayment/service period, at DOCUMENT grain, on the clara.client_facts fact-with-a-basis discipline (ADR-062). basis_kind is a CLOSED set and ''extracted'' SHIPS WITH NO WRITER ON PURPOSE — a declared SHAPE, not a live claim, so the OCR route named in fa4-pr2-annexes-2026-08-27.md Annex C extends nothing when it lands. The two lawful producers are a human through clara.record_document_service_period and (later) a deterministic promotion of a stored extraction region; a model-derived period is NOT an anchored fact and hard constraint 2 forbids it entering a durable artifact (design §13 item 3, CONFIRMED AS LAW). Supersede-never-mutate; one live period per document.';
comment on column clara.document_service_periods.evidence_region_id is
  'Only ever set when basis_kind = ''extracted'' (ck_dsp_evidence_basis, two-way). The composite FK proves the FIRM only — clara.document_regions hangs off extraction_id, not off a document — so the wall that proves the region was extracted from THIS document is the trigger t_dsp_region_congruent, not the FK.';

-- =================================================================================================
-- §A2 — F1'S CARRIER SURGERY, THE ADDITIVE HALF (design §5.2; derivation Annex H).
--
-- THE DEFECT THE OWNER'S F1 RULING CLOSES. clara.adjustment_templates.lines is ONE line array, and
-- _adj_run_occurrence_core materialises it VERBATIM for every period (0045:5181-5191). A schedule
-- whose final period carries the rounding remainder therefore has two available spellings and BOTH
-- POST WRONG BOOKS: put the base in `lines` and the remainder is never charged; put total_cents in
-- `lines` and n occurrences charge n x total. That is why it was an owner question, not a builder's
-- call.
--
-- THE SHAPE RULED AND CHOSEN: PER-OCCURRENCE SCHEDULE LINES, IN A SIBLING COLUMN — not a
-- final-occurrence override, and not a widened `lines`. Reasoning, because a reviewer should find
-- the argument and not just the result (Annex H.2):
--   * An override is SUFFICIENT for v1 (the ruled convention needs only two distinct amounts) and is
--     genuinely the smaller diff. It loses on the EXTENSION PATH, which is ruled rather than
--     speculative: pro-rata is the named second policy, and under day-count pro-rata EVERY period
--     can differ. An override would then be torn out and replaced — a SECOND surgery on the same two
--     unattended posting bodies and a SECOND D1 window, paid later at a worse time.
--   * Per-occurrence lines SUBSUME both conventions: straight-line is a schedule whose entries happen
--     to be equal-but-one; pro-rata is a schedule whose entries are not. Under this shape the ruled
--     extension lands as an evaluator _v2 and NOTHING ELSE — no carrier change, no CoR, no window.
--   * SIBLING, not widened: `lines` is read well outside this train (_wdb_line_shape 0045:4629,
--     _adj_line_eligibility_breach 0045:5109, the overlap advisory). Widening the meaning of a
--     structure many bodies read is how a narrow change becomes an estate-wide one. NON-GOAL 13:
--     clara._adj_canon_lines is NOT touched.
-- =================================================================================================
alter table clara.adjustment_templates add column schedule jsonb;

comment on column clara.adjustment_templates.schedule is
  'F-A4 PR-2a (owner ruling F1): OPTIONAL per-occurrence line schedule, [{period_start, period_end, lines:[...]}]. NULL means "this template posts `lines` verbatim for every period" — exactly the pre-PR-2a behaviour, which is why every body that resolves lines does so through clara._adj_period_lines and is null-stable BY CONSTRUCTION. Validated AT PROPOSE for shape congruence, per-period balance and full coverage (design §5.2a); that validation is what keeps six other live `lines` readers correct and holds the D1 inventory at four bodies instead of six. NOT in clara._tf_adjustment_template_transition''s frozen-stamp set, so it inherits that trigger''s immutability with no change to it — a sign-time edit to a schedule is refused by the storage layer.';

-- -------------------------------------------------------------------------------------------------
-- §A2.1 — THE SCHEDULE CANONICALISER. Same role _adj_canon_lines (0045:1930-1939) plays for `lines`:
-- a deterministic spelling so the content hash is stable across equivalent inputs. Period entries
-- sort by period_start; each entry's lines go through the UNTOUCHED _adj_canon_lines, so a schedule
-- and a flat line array canonicalise their lines the SAME way (which is what makes §5.2a clause (a)
-- a comparison of like with like).
-- -------------------------------------------------------------------------------------------------
create function clara._adj_canon_schedule(p_schedule jsonb) returns jsonb
  language sql stable as $$
  select case when p_schedule is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'period_start', (x.value ->> 'period_start')::date,
             'period_end',   (x.value ->> 'period_end')::date,
             'lines',        clara._adj_canon_lines(x.value -> 'lines'))
           order by (x.value ->> 'period_start')::date, (x.value ->> 'period_end')::date)
    from jsonb_array_elements(p_schedule) as x(value)), '[]'::jsonb) end $$;
revoke all on function clara._adj_canon_schedule(jsonb) from public;

-- -------------------------------------------------------------------------------------------------
-- §A2.2 — THE RESOLVER. ONE new function carries the WHOLE behaviour change (Annex H.4):
--   * t.schedule IS NULL  -> clara._adj_canon_lines(t.lines), i.e. EXACTLY today's answer;
--   * otherwise           -> the matching entry's lines, canonicalised through the same helper.
--
-- THE NO-MATCH BRANCH IS A TYPED REFUSAL, NEVER AN EMPTY SET (design §5.2, N10). A period the
-- schedule does not cover raises `schedule_period_uncovered` rather than returning '[]', because an
-- empty line array would post a ZERO-LINE OCCURRENCE that balances trivially and charges nothing —
-- the silent-nothing this branch exists to prevent. W43's mutant makes it return '[]' and watches
-- an occurrence post nothing at all.
--
-- ON THE COMPOSITE PARAMETER, measured rather than assumed: both live call sites hold the template
-- in a plpgsql variable declared `record` (0045:4446 and :5629), not %rowtype. Passing a record to a
-- composite-typed parameter is only safe while that record's column list matches the table's
-- exactly — and it does, because BOTH sites populate it with a bare single-table `select *`
-- (0045:4498-4499, :5720-5721) with no join. That is a property of those bodies, not a guarantee of
-- the language, so §TAIL censuses it: a future body that loads a SUBSET of columns and passes it
-- here would fail at runtime, and the census is how that gets caught at review instead.
-- -------------------------------------------------------------------------------------------------
create function clara._adj_period_lines(p_template clara.adjustment_templates,
    p_period_start date, p_period_end date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_lines jsonb;
begin
  if p_template.schedule is null then
    return clara._adj_canon_lines(p_template.lines);
  end if;
  select clara._adj_canon_lines(x.value -> 'lines') into v_lines
    from jsonb_array_elements(p_template.schedule) as x(value)
   where (x.value ->> 'period_start')::date = p_period_start
     and (x.value ->> 'period_end')::date   = p_period_end;
  if v_lines is null then
    raise exception 'this template carries a schedule that does not cover the period being posted'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'schedule_period_uncovered',
                                    'template_id', p_template.id,
                                    'period_start', p_period_start,
                                    'period_end', p_period_end)::text;
  end if;
  return v_lines;
end $$;
revoke all on function clara._adj_period_lines(clara.adjustment_templates, date, date) from public;

-- =================================================================================================
-- §B — THE HUMAN DOOR, BUILT door -> core FROM BIRTH (design §4.2).
--
-- WHY A CORE FOR ONE CALLER. There is exactly one caller today, on purpose. 0138'S PARK IS THE
-- MEASURED COST OF NOT DOING THIS: two writers born without cores (propose/sign_adjustment_template)
-- put a whole wrapper on ice and bought this train its D1 window. The core is UNGRANTED; Annex C's
-- deterministic promoter is its named second consumer.
--
-- UNDER R6 THERE IS NO WAKE WRAPPER FOR THIS DOOR AND NO AGENT PATH TO IT — CONFIRMED AS LAW by the
-- conductor (design §13 item 3), on hard-constraint-2 grounds: a service period read off a document
-- by a model is a MODEL-GENERATED VALUE, and no such value enters a durable artifact. OCR's
-- financial_date precedent (0026:916) does NOT transfer, because that value anchors to a stored
-- region with a locator and a confidence. The agent's role here is to REFUSE AND SAY WHAT IS
-- MISSING (§F's rung B10 names this table and the document id). The interim cost is accepted and
-- owner-visible: a human keys the period before Clara can draft.
--
-- THE MAXIM BOTH HALVES OF THIS TRAIN TURN ON (design §5.0), recorded where a builder will meet it:
--   *** FACTS GET ANCHORED, JUDGEMENTS GET RECEIPTED. ***
-- A service period is a FACT read off a document — it gets anchored (this section). An expense
-- classification is a JUDGEMENT — it gets receipted, shown and signed (§F). The two never swap
-- lanes, and that is why §B and §F look nothing alike.
--
-- NO EVENT TYPE IS MINTED. _audit carries the act; nothing downstream is designed to wake on a
-- recorded service period, and this file does not manufacture a consumer for one (the 0024 §B
-- "ignore" posture, and law 31's dead-member discipline applied before the member exists).
-- =================================================================================================
create function clara._record_document_service_period_core(p_ctx jsonb, p_document uuid,
    p_period_start date, p_period_end date, p_basis text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core$
declare
  c_firm uuid; c_actor uuid; v_dedupe jsonb; v_doc_firm uuid; v_prior uuid; v_new uuid;
begin
  -- The 0124 substitution shape verbatim: the two ctx fields ride as jsonb, and NOTHING else off
  -- the caller's _human_ctx record is read (Annex B.0c measured the same two-field surface on the
  -- propose body, which is why §D's extraction is the same substitution).
  c_firm  := (p_ctx ->> 'firm')::uuid;
  c_actor := (p_ctx ->> 'actor')::uuid;
  if c_firm is null or c_actor is null then
    raise exception 'the service-period core requires a firm and an actor in its ctx'
      using errcode = 'CLR10', detail = '{"reason":"ctx_incomplete"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;

  -- THE 0021 RULE (the 0022:203-206 door idiom): absent and foreign answer with ONE refusal, so
  -- this door is not an existence oracle for another firm's documents.
  select d.firm_id into v_doc_firm from clara.documents d where d.id = p_document;
  if v_doc_firm is null or v_doc_firm <> c_firm then
    raise exception 'document is not in your firm' using errcode = 'CLR11';
  end if;

  -- RESERVE-BEFORE-MUTABLE-VALIDATION (the 0055:518-524 placement, same reasoning): the replay
  -- short-circuit sits after identity/authz and before anything reading mutable world state, so a
  -- retry of a SUCCEEDED call returns its stored receipt even though the world moved. A FIRST call
  -- that fails a later validation raises, and the raise rolls back the reservation with it.
  v_dedupe := clara._reserve_op(c_firm, 'record_document_service_period', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'period_start', p_period_start,
      'period_end', p_period_end, 'basis', p_basis)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- WHO/BASIS/WHEN is the ruled trio (ADR-062): a fact without its basis is REFUSED, never
  -- defaulted. The table CHECK says the same thing; this is the door saying it by name first, so
  -- the caller gets a reason rather than a constraint violation.
  if p_basis is null or btrim(p_basis) = '' then
    raise exception 'a service period requires its basis -- who said so, on what evidence'
      using errcode = 'CLR10', detail = '{"reason":"service_period_basis_missing"}';
  end if;
  if p_period_start is null or p_period_end is null then
    raise exception 'a service period requires both of its dates'
      using errcode = 'CLR10', detail = '{"reason":"service_period_dates_missing"}';
  end if;
  if p_period_end < p_period_start then
    raise exception 'a service period ends on or after it starts'
      using errcode = 'CLR10', detail = '{"reason":"service_period_dates_inverted"}';
  end if;

  -- SUPERSESSION, NEVER UPDATE (0055:610-623's idiom). Lock the live predecessor, stamp it with the
  -- successor's id (the FK is deferred to commit), then insert the successor. Two humans racing on
  -- the same document serialize on the row lock; the second re-reads a superseded row, finds no live
  -- predecessor, and its insert then meets uq_document_service_period_live -- a loud unique-violation
  -- abort, never a silent double-live state.
  select sp.id into v_prior from clara.document_service_periods sp
    where sp.document_id = p_document and sp.superseded_at is null
    for update;
  v_new := gen_random_uuid();
  if v_prior is not null then
    update clara.document_service_periods
      set superseded_by = v_new, superseded_at = now()
      where id = v_prior;
  end if;
  -- basis_kind is 'human_stated' STRUCTURALLY, not by parameter: this door is the human producer,
  -- and 'extracted' ships with no writer (§A's table comment). A door that accepted the kind as an
  -- argument would be one refactor away from letting a caller CLAIM an extraction it never did.
  insert into clara.document_service_periods(id, firm_id, document_id, period_start, period_end,
      basis_kind, basis, evidence_region_id, recorded_by)
    values (v_new, c_firm, p_document, p_period_start, p_period_end,
      'human_stated', p_basis, null, c_actor);

  -- args stay REDACTED (ids and dates, never the basis text -- the basis lives on the row, which is
  -- the record of record; 0002's audit_log doctrine, 0055:629-630).
  perform clara._audit(c_firm, c_actor, null, null, 'record_document_service_period', null,
    jsonb_build_object('document', p_document, 'service_period_id', v_new,
      'superseded_id', v_prior, 'period_start', p_period_start, 'period_end', p_period_end,
      'op_key', p_op_key));

  return clara._finish_op(c_firm, 'record_document_service_period', p_op_key,
    jsonb_build_object('service_period_id', v_new, 'document_id', p_document,
      'period_start', p_period_start, 'period_end', p_period_end,
      'basis_kind', 'human_stated', 'basis', p_basis,
      'superseded_id', v_prior, 'recorded_by', c_actor));
end $core$;
revoke all on function clara._record_document_service_period_core(jsonb, uuid, date, date, text, text) from public;

-- THE DOOR — a THIN DELEGATE. The floor lives HERE because this is the public verb, not the core
-- (0055:507-509's rule). BOOKKEEPER: recording the term stated on an invoice is day-book work, not
-- a signing act -- and the agent cannot reach it at any rank, because there is no wake wrapper.
create function clara.record_document_service_period(p_document uuid, p_period_start date,
    p_period_end date, p_basis text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $door$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._record_document_service_period_core(
    jsonb_build_object('firm', c.firm, 'actor', c.actor),
    p_document, p_period_start, p_period_end, p_basis, p_op_key);
end $door$;
revoke all on function clara.record_document_service_period(uuid, date, date, text, text) from public;
grant execute on function clara.record_document_service_period(uuid, date, date, text, text)
  to clara_authenticated;

comment on function clara.record_document_service_period(uuid, date, date, text, text) is
  'F-A4 PR-2a: the ONE human door that anchors a prepayment/service term to a document, at the bookkeeper floor. HUMAN-ONLY BY LAW (design §13 item 3): there is no wake wrapper and no agent path, because a period read off a document by a model is a model-generated value and hard constraint 2 forbids it entering a durable artifact. Writes basis_kind=''human_stated'' structurally -- the kind is not a parameter. Supersede-never-mutate. The clocked lane''s role is to REFUSE and name this door: rung B10 of clara.wake_establish_prepayment_schedule returns {missing:''document_service_periods'', document_id: ...}.';

-- =================================================================================================
-- §C — clara.prepayment_schedule_v1 — THE VERSIONED DETERMINISTIC EVALUATOR (design §5).
--
-- Signature and semantics are close-key-1-annexes-1-mechanics.md B.2's (:400-432), unchanged.
-- STABLE, SECURITY DEFINER, search_path pinned, and UNGRANTED — it is reached only from §F's agent
-- core; no consumer exists for a human grant and law 31 says do not mint one.
--
-- THE FREEZE, AND THE CLOSURE KEPT AT ONE MEMBER (design §5.1). Registering a closure in
-- clara.evaluator_versions freezes EVERY member body estate-wide: verify_evaluator_freeze() ignores
-- the `deployed` flag and hashes the full pg_get_functiondef, so an N-member registration is N
-- bodies a later lane can never recut without reding an apply. THEREFORE THIS BODY CALLS NO OTHER
-- clara FUNCTION — it reads tables and does its own arithmetic inline (no _adj_period_start, no
-- _adj_period_end, no _hash). The registration below is then a genuine single-member closure and
-- the freeze means what it says: this body, this version, this receipt. A changed formula is a
-- _v2, never an edit (law 9 applied to evaluators).
--
-- NOTE FOR THE CENSUS CELL (W11), because the instrument's ceiling decides how it must be written:
-- a prosrc scan for the bare string 'clara.' WOULD MATCH THE QUALIFIED TABLE NAMES BELOW and report
-- call sites that do not exist. The cell must match a CALL SHAPE — `clara.<identifier>(` — and even
-- then it is a SPELLING instrument, not an identity one (law 3), which is why W11 pairs it with the
-- structural fact that the registration carries exactly one evaluator_version_members row. That
-- structural half is the claim that actually binds.
--
-- ================================ THE MONTH PREDICATE — RULED ================================
-- The design states the START rule (law 20's split-month doctrine: "a day-1 start gives the month
-- to the successor, day-2+ leaves it with the predecessor") and defines n only as "the term's
-- months". It never states the END rule. CONDUCTOR RULING, 2026-08-27, adopting the uniform
-- predicate and recording its derivation here because a builder must find the reasoning:
--
--     *** A calendar month M is a period of this schedule IF AND ONLY IF the term covers M's
--         FIRST day:   period_start <= first_day(M) <= period_end.  ***
--
-- WHY THIS AND NOT A SECOND CONVENTION. The ruled start rule's underlying principle is that A MONTH
-- BELONGS TO WHOEVER HOLDS ITS DAY 1. Applied uniformly, that single predicate:
--   * reproduces the ruled start behaviour EXACTLY — a day-1 start includes its own month; a day-2
--     start excludes it, because the term does not cover that month's first day (cell W10: the same
--     span from day 1 and from day 2 yields DIFFERENT first periods);
--   * settles the end with no new rule — the last period is the last month whose first day the term
--     covers, so a term ending mid-month still charges that month, which is simply what "no
--     day-level pro-rating" means (W10's companion cell pins this end behaviour);
--   * and — THE DECISIVE CHECK — makes n equal the term's months for EVERY start day. A 12-month
--     term starting 15 Mar yields Apr..Mar = exactly 12 periods: the partial START month is
--     excluded and the partial END month is included, so exactly ONE of the two split months
--     charges and they net to the term's length. The prepaid asset therefore reaches EXACTLY ZERO,
--     which is what cell W35 asserts end to end.
-- The rejected alternative — charge the last month only when the term runs to its final day —
-- yields n-1 charges on every day-2+ start and STRANDS the asset. Refused on that ground.
-- =================================================================================================
create function clara.prepayment_schedule_v1(p_client uuid, p_source_entry uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $eval$
declare
  v_entry     record;
  v_leg       record;
  v_legs      int;
  v_period    record;
  v_fy        record;
  v_first     date;
  v_last      date;
  v_n         int;
  v_base      bigint;
  v_rem       bigint;
  v_lines     jsonb := '[]'::jsonb;
  v_ps        date;
  v_pe        date;
  v_amt       bigint;
  i           int;
begin
  -- -----------------------------------------------------------------------------------------
  -- FITNESS OF THE SOURCE. Absent and foreign answer with ONE refusal — this evaluator is not an
  -- existence oracle for another client's entries (the 0021 rule).
  -- -----------------------------------------------------------------------------------------
  select je.id, je.status, je.document_id, je.posting_date, je.client_id
    into v_entry
    from clara.journal_entries je
   where je.id = p_source_entry and je.client_id = p_client;
  if v_entry.id is null then
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_source_unfit',
      'reason', 'the source entry is not this client''s', 'source_entry', p_source_entry);
  end if;
  if v_entry.status <> 'approved' then
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_source_unfit',
      'reason', 'a prepayment schedule amortises a POSTED entry; this one is ' || v_entry.status,
      'source_entry', p_source_entry, 'status', v_entry.status);
  end if;

  -- THE PREPAID-ASSET LEG must be UNAMBIGUOUS: exactly one debited asset line. Zero or many is a
  -- refusal, never a guess — picking one of two candidate legs would be the model choosing a
  -- number, which is exactly what hard constraint 2 forbids.
  select count(*)::int into v_legs
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';
  if v_legs <> 1 then
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_source_unfit',
      'reason', case when v_legs = 0 then 'the source entry debits no asset account'
                     else 'the source entry debits more than one asset account, so its prepaid leg is ambiguous' end,
      'source_entry', p_source_entry, 'candidate_legs', v_legs);
  end if;
  select jl.account_code, jl.debit_cents into v_leg
    from clara.journal_lines jl
    join clara.coa_accounts ca
      on ca.client_id = jl.client_id and ca.account_code = jl.account_code
   where jl.entry_id = p_source_entry and jl.debit_cents > 0 and ca.account_type = 'asset';

  -- -----------------------------------------------------------------------------------------
  -- THE TERM. ck_je_basis (0003:127) permits a MEMO-ONLY entry, so the absence of a bound document
  -- is a FIRST-CLASS REFUSAL, not an error — and the refusal NAMES what to record and where, so the
  -- human's next act is one call to clara.record_document_service_period (design §6.2a).
  -- -----------------------------------------------------------------------------------------
  if v_entry.document_id is null then
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_term_underivable',
      'reason', 'the source entry is memo-based and binds no document, so no term can be read',
      'missing', 'journal_entries.document_id', 'source_entry', p_source_entry);
  end if;
  select sp.period_start, sp.period_end into v_period
    from clara.document_service_periods sp
   where sp.document_id = v_entry.document_id and sp.superseded_at is null;
  if v_period.period_start is null then
    -- OQ-4's ruled answer: a term the document does not state is a TYPED REFUSAL, never a 12-month
    -- default. The payload is the actionable half — which fact, on which document.
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_term_underivable',
      'reason', 'no live service period is recorded for the document this entry binds',
      'missing', 'document_service_periods', 'document_id', v_entry.document_id,
      'source_entry', p_source_entry);
  end if;

  -- THE FY ARM. Refuse when the term runs past the FY the entry sits in and the client has no
  -- OPENED successor year. This is a SELF-HEALABLE state, not a dead end (design §13 item 4): under
  -- R6/HIGH-1 the clocked lane may open the successor year itself through wake_open_fiscal_year and
  -- re-run, which is what cell W31 drives rather than assumes.
  select fy.id, fy.starts_on, fy.ends_on, fy.ordinal into v_fy
    from clara.fiscal_years fy
   where fy.client_id = p_client
     and v_entry.posting_date between fy.starts_on and fy.ends_on;
  if v_fy.id is null then
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_term_underivable',
      'reason', 'the source entry does not sit inside any opened fiscal year for this client',
      'missing', 'fiscal_years', 'source_entry', p_source_entry);
  end if;
  if v_period.period_end > v_fy.ends_on
     and not exists (select 1 from clara.fiscal_years nx
                      where nx.client_id = p_client and nx.starts_on > v_fy.ends_on
                        and nx.status in ('open', 'reopened')) then
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_term_underivable',
      'reason', 'the term runs past this fiscal year and no successor year is open yet',
      'missing', 'fiscal_years.successor', 'fy_ends_on', v_fy.ends_on,
      'period_end', v_period.period_end, 'source_entry', p_source_entry);
  end if;

  -- -----------------------------------------------------------------------------------------
  -- THE PERIODS — the ruled predicate, spelled directly: the first charged month is the first whose
  -- day 1 the term covers; the last is the last whose day 1 the term covers.
  -- -----------------------------------------------------------------------------------------
  v_first := case when v_period.period_start = date_trunc('month', v_period.period_start)::date
                  then v_period.period_start
                  else (date_trunc('month', v_period.period_start) + interval '1 month')::date end;
  v_last  := date_trunc('month', v_period.period_end)::date;
  v_n := ((extract(year from v_last)::int * 12 + extract(month from v_last)::int)
        - (extract(year from v_first)::int * 12 + extract(month from v_first)::int)) + 1;
  if v_n < 1 then
    return jsonb_build_object('schedule_version', 'v1', 'refusal', 'prepayment_term_underivable',
      'reason', 'the term covers no calendar month''s first day, so it charges no whole month',
      'period_start', v_period.period_start, 'period_end', v_period.period_end,
      'source_entry', p_source_entry);
  end if;

  -- base truncated toward zero; the remainder lands WHOLLY in the final period, so the emitted
  -- amounts sum to total_cents EXACTLY. Stated because "round each period" loses sen.
  v_base := v_leg.debit_cents / v_n;
  v_rem  := v_leg.debit_cents - (v_base * v_n);

  for i in 0 .. v_n - 1 loop
    v_ps := (v_first + (i || ' months')::interval)::date;
    v_pe := ((v_first + ((i + 1) || ' months')::interval) - interval '1 day')::date;
    v_amt := v_base + case when i = v_n - 1 then v_rem else 0 end;
    -- THE EMITTED LINE IS THE PREPAID-ASSET HALF ONLY, and its account_code is read off the source
    -- entry's own leg — DB-OWNED, never judged. §F's agent core pairs each of these with a DEBIT on
    -- the F2-judged EXPENSE account for the same amount. That split is what keeps this evaluator
    -- amounts-only (design §5.3, Annex H.6) and hard constraint 2 exact: no model-generated NUMERAL
    -- reaches a durable artifact; a model-generated CLASSIFICATION does, receipted and signed.
    -- CONDUCTOR-RATIFIED 2026-08-27 as the reading of §5.3/H.6.
    v_lines := v_lines || jsonb_build_object(
      'period_start', v_ps, 'period_end', v_pe,
      'debit_cents', 0, 'credit_cents', v_amt, 'account_code', v_leg.account_code);
  end loop;

  return jsonb_build_object(
    'schedule_version', 'v1',
    'period_lines', v_lines,
    'total_cents', v_leg.debit_cents,
    'period_count', v_n,
    'prepaid_account_code', v_leg.account_code,
    'term_start', v_period.period_start, 'term_end', v_period.period_end,
    'remainder_placement', 'final_period');
end $eval$;
revoke all on function clara.prepayment_schedule_v1(uuid, uuid) from public;

comment on function clara.prepayment_schedule_v1(uuid, uuid) is
  'F-A4 PR-2a: the versioned deterministic evaluator behind wrapper 12. Amounts are DB-derived from the source entry''s own prepaid-asset leg; the emitted period_lines carry that ASSET half only, and the judged EXPENSE account is applied by clara._agent_prepayment_schedule_core under F2''s three walls. Whole-calendar-month straight line, remainder wholly in the final period. A calendar month is charged iff the term covers that month''s FIRST day (the uniform reading of law 20''s split-month doctrine, ruled 2026-08-27). Calls no other clara function, which is what keeps its evaluator_versions closure at ONE member and the freeze meaningful; a changed formula is _v2, never an edit.';

-- =================================================================================================
-- §E — agent_act_receipts.subject_kind ADMITS 'adjustment_template' (design §6.3, Annex E).
--
-- EXTEND, NEVER REWRITE. act_kind already admits 'prepayment_schedule' (0138:346-348 — a declared
-- SHAPE 0138 shipped for exactly this verb) but subject_kind admits no template. The new set is the
-- existing SIX values plus one; §0 captured the old definition so §TAIL can prove the six survived
-- rather than trusting that they did.
--
-- WHY THE SUBJECT DIFFERS BY VERDICT, and why that is not cosmetic (Annex E). The derived op key is
-- per (task, verb, CLIENT) — _close_expected_op_key hashes task || verb || subject (0138:1266-1269)
-- and wrapper 12 pins its ctx subject to the client. So two source entries in ONE wake task carry
-- the SAME op key. If the refusal receipt named the CLIENT as its subject, two entries refusing for
-- the same reason would collide on uq_aar (firm, act_kind, subject_kind, subject_id, op_key,
-- verdict, rung_digest — 0138:396), the read-back's identity guard would find every compared field
-- equal, and entry B's refusal would be answered with ENTRY A'S RECEIPT ID. That is FIX-1's defect
-- exactly, re-opened not by a missing comparison but by a subject too coarse to tell two acts apart.
-- Hence: refused -> ('journal_entry', p_source_entry); acted -> ('adjustment_template', template).
-- Both discriminate per entry, and the split across verdicts is the shipped idiom (the fix order
-- records begin_close/open_fy/mint_snapshot as "safe by differing subject").
--
-- THE COLLISION IS NARROWER THAN A LOOSE READING SUGGESTS, WHICH IS WHY IT SURVIVED REVIEW:
-- rung_digest is in uq_aar, so two refusals collide only when their rung VECTORS are byte-identical.
-- That is not a corner — the ordinary path walks straight into it. Two prepaid entries on one
-- client, neither carrying a service period, both refuse with the same single-element B10 vector.
-- A narrow window the common case walks into is the worst kind.
-- =================================================================================================
alter table clara.agent_act_receipts drop constraint agent_act_receipts_subject_kind_check;
alter table clara.agent_act_receipts add constraint ck_aar_subject_kind check (
  subject_kind in ('client', 'fiscal_year', 'close_run', 'close_receipt', 'journal_entry',
                   'snapshot', 'adjustment_template'));

comment on constraint ck_aar_subject_kind on clara.agent_act_receipts is
  'F-A4 PR-2a: the six kinds 0138 shipped plus ''adjustment_template'', which wrapper 12''s ACTED receipt names. EXPLICITLY NAMED, replacing the system-generated agent_act_receipts_subject_kind_check that 0138 produced by writing the CHECK inline on the column — so a later lane can select this constraint by a name someone chose rather than by a LIKE over its definition (the T.1b2 lesson: a predicate that matches on spelling picks up whatever else contains the word).';

-- =================================================================================================
-- §G — RESIDUAL 1: the bookkeeper conjunct mirrored into two read policies (design §7).
--
-- THE MEASURED DEFECT (fix order, post-re-verification follow-up 1): a firm VIEWER reads
-- model_name / model_version / rationale / narrative straight off clara.close_proposals — the exact
-- data class FIX-6 walled off on agent_act_receipts. p_cp_human (0138:558-559) and p_cph_human
-- (0138:625-626) check firm_id = clara.jwt_firm() and NOTHING ELSE.
--
-- THE CONSUMER CENSUS WAS RUN BEFORE CHOOSING THE WALL — Annex B.0b carries it row by row, and its
-- second cut names the four readers the first cut MISSED (a consumer census that misses readers is
-- the instrument failure it exists to prevent). Its result: two definer doors that read under the
-- OWNER policy and are unaffected; ZERO apps/web row reads (the close panel deliberately reads
-- nothing); six rig readers, four as clara_fn_owner and two as superuser. Not one is a
-- clara_authenticated row read, which is the only population this conjunct can touch. No legitimate
-- consumer breaks.
--
-- close_prep_holds carries a WEAKER data class (a hold reason, not a model's rationale) and is
-- walled anyway — stated here rather than left to inference: its own doors are bookkeeper-floored
-- (0138:1573, :1608), so a record readable BELOW the floor of the act that wrote it is an
-- inconsistency waiting to be found.
--
-- Spelled IDENTICALLY to 0138:427 and to §A's p_dsp_human, so every close-limb table reads as ONE
-- rule rather than four similar ones.
-- =================================================================================================
drop policy p_cp_human on clara.close_proposals;
create policy p_cp_human on clara.close_proposals
  for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and clara.actor_role_rank() >= clara.role_rank('bookkeeper'));

drop policy p_cph_human on clara.close_prep_holds;
create policy p_cph_human on clara.close_prep_holds
  for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and clara.actor_role_rank() >= clara.role_rank('bookkeeper'));

-- =================================================================================================
-- §D — THE EXTRACTION [D1 WRITE-QUIESCE]. clara._propose_adjustment_template_core, then the door as
-- a thin delegate (design §6.1). This is the ONE core extraction R6 leaves standing;
-- clara.sign_adjustment_template is UNTOUCHED (NON-GOAL 2) because signing stays a human ADMIN act
-- and an extracted sign core would be a permanent dead member.
--
-- BUILT BY HARVEST, NEVER BY RE-TYPING. The body below was produced by running
-- pg_get_functiondef on the LIVE catalog and applying COUNTED substitutions to that text — the
-- 0046 S7.1 / 0048 S1 law 0052 restates at its own SECTION 1. It is the direct remedy for the
-- F-A3/PR-1b class, where a CoR built from a migration's FILE TEXT silently erased a LATER
-- migration's dynamic patch on that body. §2's census says this body carries no later patch; THE
-- HARVEST IS WHAT PROVES THAT RATHER THAN ASSUMING IT.
--
-- THE SUBSTITUTION IS EXACTLY TWO FIELDS WIDE, asserted by exact count at generation time:
--   the firm field  x5   ->  c_firm       (read from p_ctx)
--   the actor field x2   ->  c_actor      (read from p_ctx)
-- plus three structural edits (the ctx declaration, the _human_ctx call, the hash call), two INSERT
-- lines for the new column, and §5.2a's validation block. THE MOVE WAS A MOVE: a line-level
-- differential of the harvested body against this one removes exactly TEN lines, and every one of
-- them is a named substitution site. Nothing else changed. Cell W1 re-derives that differential.
--
-- THE FLOOR MOVED TO THE DOOR, which is where a floor belongs (0055:507-509): the core is UNGRANTED
-- and reads its ctx from the caller; the door opens _human_ctx(role_rank('bookkeeper')) exactly as
-- the shipped body did, so W2's viewer still refuses and W2's bookkeeper still succeeds.
--
-- p_schedule RIDES LAST WITH A DEFAULT, per 0045:6707-6711's own house rule, so no existing caller
-- moves and the grant string is the only other line that changes.
-- =================================================================================================
create function clara._propose_adjustment_template_core(p_ctx jsonb, p_client uuid, p_name text,
    p_cadence text, p_start_date date, p_end_date date, p_auto_reverse boolean, p_lines jsonb,
    p_memo_template text, p_op_key text, p_replaces uuid default null,
    p_schedule jsonb default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core$
declare
  c_firm uuid; c_actor uuid; v_sched jsonb; v_shape_t text[]; v_shape_s text[];
  v_sd bigint; v_sc bigint; v_prev date; v_first_ps date; v_last_pe date; y jsonb;
  v_dedupe jsonb; v_firm uuid; v_id uuid; v_lines jsonb; v_hash text;
  v_dr bigint := 0; v_cr bigint := 0; v_n int; v_breach jsonb; x jsonb;
  v_d bigint; v_k bigint; v_warn jsonb := '[]'::jsonb;
  v_repl_status text; v_anc jsonb;
  v_repl_root uuid;    -- [R12 FIX 2026-08-04] the predecessor's lineage root, read with its status
  v_constraint text;   -- [R11 FIX 2026-08-04] which of this table's partial uniques raised -- three now
begin
  -- EXTRACTED (F-A4 PR-2a §D). The floor this line used to open lives in the DOOR now; a core
  -- is ungranted and reads its ctx from the caller. Exactly two fields, which is the whole
  -- surface Annex B.0c measured on this body: the firm field five times, the actor field
  -- twice -- re-measured at the LIVE catalog by the generator that produced this text and
  -- asserted by an exact count, not taken from the annex on trust.
  -- (The two field names are spelled out in prose here on purpose: written literally, this
  -- comment would itself be rewritten by the substitution it describes.)
  c_firm  := (p_ctx ->> 'firm')::uuid;
  c_actor := (p_ctx ->> 'actor')::uuid;
  if c_firm is null or c_actor is null then
    raise exception 'the propose core requires a firm and an actor in its ctx'
      using errcode = 'CLR10', detail = '{"reason":"ctx_incomplete"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;

  -- ARGUMENT VALIDATION RUNS BEFORE THE RESERVATION, because the op-key request hash is
  -- ('client', p_client, 'hash', content_hash) (ABI SSE) and the content hash is only
  -- computable once the lines canonicalise. A malformed proposal therefore never occupies an
  -- op_receipts slot at all.
  if p_name is null or btrim(p_name) = '' then
    raise exception 'a template name is required'
      using errcode = 'CLR10', detail = '{"reason":"template_name_required"}';
  end if;
  if p_memo_template is null or btrim(p_memo_template) = '' then
    raise exception 'a memo template is required -- it is the memo every occurrence carries'
      using errcode = 'CLR10', detail = '{"reason":"template_memo_required"}';
  end if;
  -- [WDB-G3] the cadence vocabulary is monthly + annual, and nothing else.
  if p_cadence is null or p_cadence not in ('monthly', 'annual') then
    raise exception 'template cadence must be monthly or annual (WDB-G3)'
      using errcode = 'CLR10', detail = '{"reason":"template_cadence_invalid"}';
  end if;
  if p_auto_reverse is null then
    raise exception 'auto_reverse must be stated true or false'
      using errcode = 'CLR10', detail = '{"reason":"template_auto_reverse_required"}';
  end if;
  if p_start_date is null then
    raise exception 'a start date is required'
      using errcode = 'CLR10', detail = '{"reason":"template_start_required"}';
  end if;
  -- THE SUPPORTED DATE DOMAIN, AT THE DOOR THAT LETS A DATE IN (round 8). Every period bound
  -- this family ever derives descends from start_date, and every one of them is serialised into
  -- an entry's period stamp and compared as ISO text by clara._wdb_rerun_breach -- whose
  -- four-digit form can faithfully carry AD 0001-01-01 .. 9999-12-31 and nothing else. Refusing
  -- HERE rather than teaching the gate about eras is the root fix: a BC or five-digit stamp is
  -- not a comparison problem, it is a date this product has no accounting meaning for, and one
  -- accepted at propose brings the client's WHOLE calendar into every gate's set (measured: a
  -- BC-dated occurrence made May 2026 read as shape_already_met). The full measurement is at
  -- clara._wdb_iso_date_supported.
  if not clara._wdb_iso_date_supported(p_start_date) then
    raise exception 'the start date % is outside the supported range 0001-01-01 .. 9999-12-31 (AD)', p_start_date
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_date_unsupported', 'axis', 'start_date',
          'supported_from', date '0001-01-01', 'supported_to', date '9999-12-31')::text;
  end if;
  if not clara._wdb_iso_date_supported(p_end_date) then
    raise exception 'the end date % is outside the supported range 0001-01-01 .. 9999-12-31 (AD)', p_end_date
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_date_unsupported', 'axis', 'end_date',
          'supported_from', date '0001-01-01', 'supported_to', date '9999-12-31')::text;
  end if;
  if p_end_date is not null and p_end_date < p_start_date then
    raise exception 'the end date precedes the start date'
      using errcode = 'CLR10', detail = '{"reason":"template_window_invalid"}';
  end if;

  -- THE LINE SHAPE (ABI SSC): an array of at least two rows; exactly one of debit/credit
  -- positive per row; balanced to the sen. An occurrence ALWAYS carries a charge, which is
  -- why the zero-charge noop branch the 0041 poster needs does not exist here [L3/11].
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'template lines must be a JSON array'
      using errcode = 'CLR10', detail = '{"reason":"template_lines_invalid","axis":"shape"}';
  end if;
  v_n := jsonb_array_length(p_lines);
  if v_n < 2 then
    raise exception 'a template needs at least two lines'
      using errcode = 'CLR10', detail = '{"reason":"template_lines_invalid","axis":"too_few"}';
  end if;
  for x in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(x) <> 'object' or nullif(btrim(coalesce(x ->> 'account_code', '')), '') is null then
      raise exception 'every template line needs an account_code'
        using errcode = 'CLR10',
          detail = '{"reason":"template_lines_invalid","axis":"account_code"}';
    end if;
    v_d := coalesce((x ->> 'debit_cents')::bigint, 0);
    v_k := coalesce((x ->> 'credit_cents')::bigint, 0);
    if v_d < 0 or v_k < 0 or (v_d > 0) = (v_k > 0) then
      raise exception 'every template line carries exactly one positive side (debit or credit), in cents'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_lines_invalid', 'axis', 'one_side',
            'account_code', x ->> 'account_code')::text;
    end if;
    v_dr := v_dr + v_d;
    v_cr := v_cr + v_k;
  end loop;
  if v_dr <> v_cr then
    raise exception 'template lines must balance exactly to the sen (debit % vs credit %)', v_dr, v_cr
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_lines_invalid', 'axis', 'unbalanced',
          'debit_cents', v_dr, 'credit_cents', v_cr)::text;
  end if;

  v_lines := clara._adj_canon_lines(p_lines);

  -- ===== F-A4 PR-2a §5.2a -- THE CONGRUENCE CONSTRAINT, VALIDATED AT PROPOSE (review N1) =====
  -- THIS IS WHAT EARNS THE FOUR-BODY D1 INVENTORY. Six other live bodies read t.lines as a stand-in
  -- for WHAT AN OCCURRENCE POSTS (Annex H.3 censuses them with sites). Under a schedule that is no
  -- longer trivially true -- unless every period agrees with `lines` on everything those readers
  -- look at. So the door validates it here, once, instead of six bodies each learning to read a
  -- schedule. WITHOUT CLAUSE (a) THE D1 INVENTORY IS SIX BODIES, NOT FOUR.
  v_sched := clara._adj_canon_schedule(p_schedule);
  if v_sched is not null then
    -- (c) COVERAGE. An empty schedule is refused EXPLICITLY: it would leave every occurrence to the
    -- resolver's no-match branch after signature.
    if jsonb_array_length(v_sched) = 0 then
      raise exception 'a template schedule cannot be empty'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'schedule_coverage_gap', 'axis', 'empty')::text;
    end if;
    -- (a) SHAPE CONGRUENCE -- every period's (account_code, direction) MULTISET equals `lines`'.
    -- This is exactly the projection clara._wdb_line_shape computes: it emits code||':D'/':C' keyed
    -- on debit_cents > 0 and DISCARDS EVERY MAGNITUDE (0045:2054-2062). Amount-blind readers are
    -- therefore correct BY CONSTRUCTION, not by luck.
    select array_agg((e ->> 'account_code') || case when (e ->> 'debit_cents')::bigint > 0 then ':D' else ':C' end order by 1)
      into v_shape_t from jsonb_array_elements(v_lines) as t(e);
    v_prev := null; v_first_ps := null; v_last_pe := null;
    for y in select value from jsonb_array_elements(v_sched) loop
      select array_agg((e ->> 'account_code') || case when (e ->> 'debit_cents')::bigint > 0 then ':D' else ':C' end order by 1)
        into v_shape_s from jsonb_array_elements(y -> 'lines') as t(e);
      if v_shape_s is distinct from v_shape_t then
        raise exception 'a schedule period posts a different set of accounts than the template lines declare'
          using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'schedule_shape_incongruent',
              'period_start', y ->> 'period_start', 'template_shape', v_shape_t,
              'period_shape', v_shape_s)::text;
      end if;
      -- (b) PER-PERIOD BALANCE -- so the poster's own exact-equality check (0045:5196-5199) can
      -- never be reached with an unbalanced occurrence.
      select coalesce(sum((e ->> 'debit_cents')::bigint), 0), coalesce(sum((e ->> 'credit_cents')::bigint), 0)
        into v_sd, v_sc from jsonb_array_elements(y -> 'lines') as t(e);
      if v_sd <> v_sc then
        raise exception 'a schedule period does not balance to the sen (debit % vs credit %)', v_sd, v_sc
          using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'schedule_period_unbalanced',
              'period_start', y ->> 'period_start', 'debit_cents', v_sd, 'credit_cents', v_sc)::text;
      end if;
      -- (c) continued: contiguous, non-overlapping, in order. _adj_canon_schedule sorted them, so
      -- a gap or an overlap is a comparison against the previous period's end.
      if v_prev is not null and (y ->> 'period_start')::date <> v_prev + 1 then
        raise exception 'the schedule leaves a gap or overlaps between periods'
          using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'schedule_coverage_gap', 'axis', 'discontiguous',
              'previous_period_end', v_prev, 'next_period_start', y ->> 'period_start')::text;
      end if;
      if v_first_ps is null then v_first_ps := (y ->> 'period_start')::date; end if;
      v_prev := (y ->> 'period_end')::date;
      v_last_pe := v_prev;
    end loop;
    -- (c) continued: the run must span the DECLARED template range exactly at both ends.
    if v_first_ps <> p_start_date or (p_end_date is not null and v_last_pe <> p_end_date) then
      raise exception 'the schedule does not span the template''s own date range'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'schedule_coverage_gap', 'axis', 'span',
            'schedule_start', v_first_ps, 'schedule_end', v_last_pe,
            'template_start', p_start_date, 'template_end', p_end_date)::text;
    end if;
    -- THE HONEST CEILING, stated rather than implied (the Annex F.3 discipline): clauses (a)-(c)
    -- prove the schedule is well-formed and spans the DECLARED range contiguously. They do not
    -- prove that its entry boundaries coincide with the boundaries the occurrence runner will
    -- derive for a cadence whose periods are not the entries' own. For F1's ruled convention
    -- (monthly = calendar month) they do coincide by construction. For anything else,
    -- clara._adj_period_lines' typed schedule_period_uncovered refusal remains the STRUCTURAL wall,
    -- and no cell may assert that this validation makes it unreachable.
  end if;
  v_hash := clara._adj_template_hash(btrim(p_name), p_cadence, p_start_date, p_end_date,
    p_auto_reverse, v_lines, p_memo_template, v_sched);

  -- THE LINEAGE DECLARATION IS PART OF THE REQUEST'S IDENTITY, and it has to be [round 10, lane
  -- P1]. content_hash covers {name, cadence, start, end, auto_reverse, lines, memo} and NOT the
  -- declaration, so without this term two proposals that differ ONLY in what they say they replace
  -- hash identically: a caller who retried one op_key with a CORRECTED p_replaces would be handed
  -- the first receipt and would believe a declaration that was never written. clara._reserve_op
  -- already has the right refusal for that shape ('op_key reused with different args', CLR10) --
  -- it just needs to be able to SEE the difference.
  --
  -- THE TERM IS CONDITIONAL SO ABI SSE IS UNTOUCHED FOR EVERY EXISTING CALLER: with p_replaces
  -- NULL the object is byte-for-byte the ('client', 'hash') pair ABI SSE pins, so no receipt this
  -- product has ever minted changes shape. Only a proposal that MAKES a declaration carries it.
  v_dedupe := clara._reserve_op(c_firm, 'propose_adjustment_template', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'hash', v_hash)
      || case when p_replaces is null then '{}'::jsonb
              else jsonb_build_object('replaces', p_replaces) end));
  if v_dedupe is not null then return v_dedupe; end if;

  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c_firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;

  -- THE CLIENT RUNG, THEN THE LEAF (the pinned order for every role-claiming writer). The
  -- rung is what makes the FY read below and the reservation read under the leaf ONE
  -- lock-holding transaction against a concurrent clara.set_client_fy_end or enrolment.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- START AND END ARE CADENCE BOUNDARIES, VALIDATED AGAINST THE CLIENT'S CURRENT FY
  -- [L2/23, L7/3]. start_date MUST be a period START (the first eligible period begins at
  -- it, so a mid-period start would silently shift every window); end_date, when stated,
  -- MUST be a period END (else the last occurrence would straddle a partial period and the
  -- admission window would never close cleanly). For an ANNUAL template both are FY-relative,
  -- which is why clara.set_client_fy_end refuses while a live annual template exists and why
  -- sign re-validates: the propose -> FYE-change -> sign window is the one gap left, and
  -- sign closes it.
  if clara._adj_period_start(p_client, p_cadence, p_start_date) is distinct from p_start_date then
    raise exception 'the start date % is not the first day of a % period for this client', p_start_date, p_cadence
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_fy_stale', 'axis', 'start_date',
          'cadence', p_cadence, 'expected',
          clara._adj_period_start(p_client, p_cadence, p_start_date))::text;
  end if;
  if p_end_date is not null
     and clara._adj_period_end(p_client, p_cadence, p_end_date) is distinct from p_end_date then
    raise exception 'the end date % is not the last day of a % period for this client', p_end_date, p_cadence
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_fy_stale', 'axis', 'end_date',
          'cadence', p_cadence, 'expected',
          clara._adj_period_end(p_client, p_cadence, p_end_date))::text;
  end if;

  -- THE DATE THE CADENCE DERIVES IS ASKED THE SAME QUESTION AS THE DATE THE HUMAN SUPPLIED
  -- (round 9, Codex finding 2). Round 8 domain-checked start_date and end_date -- the two dates a
  -- caller can type -- and a template's periods are DERIVED from start_date, not typed. MEASURED:
  -- a client with FYE 30 November and an ANNUAL template starting 9999-12-01 proposes and SIGNS
  -- live, because 9999-12-01 is inside the domain AND is a genuine annual period start; its first
  -- period then ENDS 10000-11-30, and every run of it is refused CLR38
  -- period_request_invalid/date_unsupported, forever. A template that signs live and can never
  -- run is a walled corridor in time, and the door that let the date in is this one.
  --
  -- THE FIRST DERIVED END IS SUFFICIENT, and this is the whole of "any end the cadence can derive
  -- inside the template's own life": with end_date STATED, it is itself domain-checked above and
  -- is a period end, so every derived end in between is <= it; with end_date NULL, the only
  -- derived end that can leave the domain is the first one, because every later period opens the
  -- day after its predecessor closes and the poster refuses any period that has not ENDED in MYT
  -- (v_pe >= clara._fa_today()) long before the calendar could reach year 10000. The cadence
  -- algebra itself does not overflow -- Postgres DATE runs to 5874897-12-31 -- so this is a
  -- DOMAIN refusal, not an arithmetic guard.
  --
  -- IT IS ASKED HERE, AFTER THE FY ALIGNMENT, because the derivation needs the client's financial
  -- year and therefore the 203005004 rung, and because a start date that is not a period start at
  -- all deserves its own refusal (template_fy_stale) before this one.
  if not clara._wdb_iso_date_supported(clara._adj_period_end(p_client, p_cadence, p_start_date)) then
    raise exception 'this template''s first % period would end % , which is outside the supported range 0001-01-01 .. 9999-12-31 (AD)', p_cadence, clara._adj_period_end(p_client, p_cadence, p_start_date)
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_date_unsupported',
          'axis', 'derived_period_end', 'cadence', p_cadence, 'period_start', p_start_date,
          'period_end', clara._adj_period_end(p_client, p_cadence, p_start_date),
          'supported_from', date '0001-01-01', 'supported_to', date '9999-12-31')::text;
  end if;

  -- LEAF-LAST. propose CLAIMS the line accounts for this template, so it serialises against
  -- every other role-claiming writer on this client through the one `client:fa-roles` leaf.
  perform clara._fa_lock_roles(p_client);

  v_breach := clara._adj_line_eligibility_breach(p_client, v_lines);
  if v_breach is not null then
    raise exception 'template line account % cannot back a recurring adjustment (%)', v_breach ->> 'account_code', v_breach ->> 'axis'
      using errcode = 'CLR10',
        detail = (jsonb_build_object('reason', 'template_line_ineligible') || v_breach)::text;
  end if;

  -- THE FRIENDLY DUPLICATE REFUSAL. The partial unique index is the durable half; this is the
  -- half that names the twin, so a human sees which template they already have.
  if exists (select 1 from clara.adjustment_templates t
             where t.client_id = p_client and t.content_hash = v_hash
               and t.status in ('proposed', 'live')) then
    raise exception 'this client already has a proposed or live template with identical content; retire it before proposing the same one again'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_duplicate', 'content_hash', v_hash)::text;
  end if;

  -- ------------------------------------------------------------------------------------
  -- THE LINEAGE DECLARATION (round 10, lane P1; the OWNER's option (b)). FAIL-CLOSED: a
  -- declaration this body cannot verify is REFUSED, never stored and never softened into a
  -- warning -- because the gate downstream will ASSERT on it and forbid a lawful act, and an
  -- assertion is only allowed to rest on a fact that was checked at the door that wrote it.
  --
  -- IT IS VALIDATED HERE, AFTER THE RESERVATION AND UNDER THE CLIENT RUNG, and that placement is
  -- deliberate rather than lazy: every term of it is a READ of this client's template register
  -- (existence, tenancy, status, chain depth), so it cannot run before the firm check that
  -- establishes the caller may read that register at all, and it must run under the 203005004 rung
  -- so a concurrent clara.retire_adjustment_template cannot move the predecessor's status between
  -- the read and the INSERT. It sits with the other two register-reading refusals
  -- (template_line_ineligible, template_duplicate) for exactly that reason.
  --
  -- THREE TERMS, EACH REFUSED BY NAME, and each refusal names an act the caller can actually take
  -- (WDB-R2 -- the remedy in a refusal is a promise about another door):
  --   (i)   THE PREDECESSOR MUST BE A TEMPLATE OF THIS CLIENT. The read is client-scoped, so a
  --         forged id, a deleted-and-restored id and ANOTHER CLIENT'S template all land here as
  --         one fact -- "these books have no such template" -- rather than three, and none of them
  --         can be used to probe whether some other client owns that id (the CLR11 read-shape
  --         discipline this file already keeps at clara.get_adjustment_run).
  --   (ii)  IT MUST BE RETIRED. [WDB-G13]'s edit is retire-and-re-propose, and a replacement for
  --         something still LIVE is not a replacement, it is a second live template moving the
  --         same accounts -- the state the poster refuses every month and the state O1's propose
  --         advisory already warns about. Refusing here is what keeps the recorded fact TRUE:
  --         "replaces" must mean the predecessor stopped.
  --         WHAT THIS COSTS THE PROPOSE-FIRST ORDER, MEASURED RATHER THAN WAVED AWAY [R12 FIX
  --         2026-08-04 -- confirming round, Codex CXR1]. The sentence that stood here said the
  --         propose-first order "keeps working exactly as lane O1 shipped it, WITHOUT p_replaces
  --         and with its warning". The warning was the false half: round 11's term (c) scanned
  --         RETIRED siblings only, and in this order the predecessor is LIVE at propose -- so
  --         the pair got no declaration (refused here), no wall (predicate (5) needs a recorded
  --         edge) and no advisory (no retired subject) AT ONCE. MEASURED end to end: four
  --         already-charged months re-ran on fresh codes for RM1,800,000 against an RM600,000
  --         intention, with `warnings: []`, `blocked: []` and the sweep advertising it as due.
  --         The order is still lawful and still refused nothing; what changed is that the
  --         advisory now covers LIVE siblings too (clara._wdb_period_overlap_advisory) and is
  --         re-asked at SIGN, the last human moment before money can move. The two acts that
  --         make the declaration itself possible are unchanged: retire, then propose -- or
  --         propose, retire, and re-propose with the stamp.
  --   (iii) THE CHAIN MUST STILL HAVE ROOM. The gate walks this chain upward under a cap
  --         (clara._wdb_template_ancestry, which OWNS the number); refusing to EXTEND a chain that
  --         is already at it is the root fix -- it means a walk can never truncate on a history
  --         these verbs built, and truncation stays what it should be: a signal of a forged or
  --         restored graph. `truncated` is refused for the same reason and with the same act: a
  --         predecessor whose own ancestry cannot be walked to a root is not a foundation to
  --         assert on.
  -- SELF-REFERENCE IS NOT A TERM HERE because it is not reachable here: `id` is minted by the
  -- table's own default at INSERT, so p_replaces cannot name it. The S1 CHECK stands over the
  -- storage layer for a hand-written row, which is the only writer that could ever try.
  if p_replaces is not null then
    -- [R12 FIX 2026-08-04] The predecessor's LINEAGE ROOT is read with its status, in one statement under
    -- the rung: the root is what term (v) below tests and what this row will carry for the rest of
    -- the chain's life, and reading it twice would be two answers to one question.
    select t.status, coalesce(t.lineage_root_id, t.id)
      into v_repl_status, v_repl_root
      from clara.adjustment_templates t
      where t.id = p_replaces and t.client_id = p_client;
    if v_repl_status is null then
      raise exception 'the template this one says it replaces (%) is not a template of this client; propose it without naming a predecessor, or name one from this client''s own register', p_replaces
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_replaces_unknown',
            'replaces_template_id', p_replaces)::text;
    end if;
    if v_repl_status <> 'retired' then
      raise exception 'the template this one says it replaces (%) is still %; retire it first (clara.retire_adjustment_template) and propose this one again, or propose it now without naming a predecessor', p_replaces, v_repl_status
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_replaces_not_retired',
            'replaces_template_id', p_replaces, 'replaces_status', v_repl_status)::text;
    end if;
    -- (iv) IT MUST NOT ALREADY HAVE A SUCCESSOR [R11 FIX 2026-08-04 -- Codex round-11 finding 4].
    -- MEASURED: two concurrent sessions each proposed a different child of one retired
    -- predecessor; B waited correctly behind A's 203005004 rung and then also succeeded, both
    -- signed, and the predecessor ended with TWO LIVE DIRECT SUCCESSORS. That is a lineage FORK,
    -- and every consumer of the walk is written for a chain -- "the ancestors" as an ordered list,
    -- a cap that counts "generations", a prohibition that says "the generation this template
    -- replaces" in the singular. Read under the rung with the status read above, so a concurrent
    -- proposer cannot slip between the two; the partial unique index at SS1.1 is the belt for the
    -- writer the rung cannot serialise. The refusal names both acts that exist: take the existing
    -- successor's place by retiring it first, or propose without the declaration.
    if exists (select 1 from clara.adjustment_templates s
                where s.replaces_template_id = p_replaces and s.client_id = p_client
                  and s.status in ('proposed', 'live')) then
      raise exception 'the template this one says it replaces (%) already has a successor on this client; retire that successor first (clara.retire_adjustment_template) and propose this one again, or propose it now without naming a predecessor -- one generation may be replaced once', p_replaces
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_replaces_already_succeeded',
            'replaces_template_id', p_replaces,
            'successor_template_id', (select s.id from clara.adjustment_templates s
                                       where s.replaces_template_id = p_replaces
                                         and s.client_id = p_client
                                         and s.status in ('proposed', 'live')
                                       order by s.created_at, s.id limit 1))::text;
    end if;
    -- (v) NO OTHER TEMPLATE OF THIS LINEAGE MAY BE UNRETIRED [R12 FIX 2026-08-04 -- confirming round,
    -- Codex CXR2]. MEASURED: P retired, A replaces P, A retired, B replaces A and goes LIVE, C
    -- replaces P -- and (iv) admits C, because P's only DIRECT successor A is retired. The
    -- lineage ends with TWO LIVE LEAVES, B and C, and on disjoint codes neither branch can see
    -- the other: both book the same months, and every consumer of the walk (an ordered ancestor
    -- list, a cap that counts generations, a prohibition in the singular) is true of one branch
    -- and silent about the other. E30's recorded intent is ONE ACTIVE CONTINUATION per lineage,
    -- which is a fact about the ROOT and cannot be expressed one edge at a time.
    -- THE ROOT IS THE PREDECESSOR'S, INHERITED: coalesce(its own root, itself). Read under the
    -- same 203005004 rung as the status above, so a concurrent proposer cannot slip between the
    -- two; uq_adjustment_templates_one_live_leaf is the belt for the writer the rung cannot
    -- serialise. The refusal NAMES the live template in the way, because "some other template in
    -- this lineage" is not a remedy anyone can follow.
    if exists (select 1 from clara.adjustment_templates s
                where s.client_id = p_client
                  and coalesce(s.lineage_root_id, s.id) = v_repl_root
                  and s.status in ('proposed', 'live')) then
      raise exception 'another template of this lineage (%) is still %; a generation may have only one unretired continuation -- retire that one first (clara.retire_adjustment_template) and propose this again, or propose it now without naming a predecessor', (select s.id from clara.adjustment_templates s where s.client_id = p_client and coalesce(s.lineage_root_id, s.id) = v_repl_root and s.status in ('proposed', 'live') order by s.created_at, s.id limit 1), (select s.status from clara.adjustment_templates s where s.client_id = p_client and coalesce(s.lineage_root_id, s.id) = v_repl_root and s.status in ('proposed', 'live') order by s.created_at, s.id limit 1)
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_lineage_root_occupied',
            'replaces_template_id', p_replaces,
            'lineage_root_id', v_repl_root,
            'occupying_template_id', (select s.id from clara.adjustment_templates s
                                       where s.client_id = p_client
                                         and coalesce(s.lineage_root_id, s.id) = v_repl_root
                                         and s.status in ('proposed', 'live')
                                       order by s.created_at, s.id limit 1))::text;
    end if;
    v_anc := clara._wdb_template_ancestry(p_client, p_replaces);
    if (v_anc ->> 'depth')::int >= (v_anc ->> 'cap')::int
       or (v_anc ->> 'truncated')::boolean then
      raise exception 'the template this one says it replaces (%) already stands on a chain of % recorded generation(s) (the limit is %); propose this one without naming a predecessor', p_replaces, v_anc ->> 'depth', v_anc ->> 'cap'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_replaces_chain_too_long',
            'replaces_template_id', p_replaces,
            'axis', case when (v_anc ->> 'truncated')::boolean then 'unwalkable' else 'depth' end,
            'depth', (v_anc ->> 'depth')::int, 'cap', (v_anc ->> 'cap')::int)::text;
    end if;
  end if;

  begin
    -- [R12 FIX 2026-08-04] lineage_root_id is v_repl_root -- the predecessor's own root, or the
    -- predecessor itself when it is one -- and NULL when nothing was declared, which is this
    -- column's spelling for "I am my own root" (argued at the column). It is set here and never
    -- again: the transition trigger's frozen-set subtraction makes it immutable from this moment.
    insert into clara.adjustment_templates(firm_id, client_id, status, name, cadence,
        start_date, end_date, auto_reverse, lines, memo_template, content_hash,
        replaces_template_id, lineage_root_id, proposed_by, proposed_op_key, schedule)
      values (c_firm, p_client, 'proposed', btrim(p_name), p_cadence, p_start_date, p_end_date,
        p_auto_reverse, v_lines, p_memo_template, v_hash, p_replaces,
        case when p_replaces is null then null else v_repl_root end, c_actor, p_op_key, v_sched)
      returning id into v_id;
  exception when unique_violation then
    -- The index caught a twin the precheck could not see (a concurrent proposer inside the
    -- same rung is impossible, but a re-apply against a restored database is not). Same token
    -- either way -- a caller must never have to tell the two apart.
    -- [R11 FIX 2026-08-04] ...BUT THERE ARE NOW TWO PARTIAL UNIQUES ON THIS TABLE, so this handler asks
    -- WHICH ONE bit instead of assuming. Before the single-successor index existed, `unique_
    -- violation` here could only ever mean the content-hash slot; today a lineage fork raced past
    -- the precheck lands here too, and reporting it as `template_duplicate` would send a
    -- professional to look for an identical template that does not exist. `constraint_name` is
    -- the only fact that tells them apart, and it is read rather than inferred from the message.
    -- [R12 FIX 2026-08-04] ...AND THERE ARE NOW THREE. uq_adjustment_templates_one_live_leaf is the
    -- root-keyed belt, and a race past term (v) lands here exactly as a race past term (iv) does.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'uq_adjustment_templates_one_live_leaf' then
      raise exception 'another template of this lineage is still unretired; a generation may have only one unretired continuation -- retire that one first (clara.retire_adjustment_template) and propose this again, or propose it now without naming a predecessor'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_lineage_root_occupied',
            'replaces_template_id', p_replaces, 'lineage_root_id', v_repl_root,
            'axis', 'storage_layer')::text;
    end if;
    if v_constraint = 'uq_adjustment_templates_one_successor' then
      raise exception 'the template this one says it replaces (%) already has a successor on this client; retire that successor first (clara.retire_adjustment_template) and propose this one again, or propose it now without naming a predecessor -- one generation may be replaced once', p_replaces
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'template_replaces_already_succeeded',
            'replaces_template_id', p_replaces, 'axis', 'storage_layer')::text;
    end if;
    raise exception 'this client already has a proposed or live template with identical content'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'template_duplicate', 'content_hash', v_hash)::text;
  end;

  -- THE DECLARATION IS AUDITED WITH THE PROPOSAL [round 10, lane P1]. The column is immutable, so
  -- the row itself is already the durable record -- but the audit line is where a reviewer reads
  -- WHO declared the lineage the gate later asserts on, and a fact that drives a prohibition
  -- belongs in the trail beside the actor who stated it. The key is always present (jsonb null
  -- when nothing was declared) for the same reason the propose receipt's `warnings` always is.
  perform clara._audit(c_firm, c_actor, null, null, 'propose_adjustment_template', null,
    jsonb_build_object('client', p_client, 'template', v_id, 'cadence', p_cadence,
      'start_date', p_start_date, 'end_date', p_end_date, 'auto_reverse', p_auto_reverse,
      'content_hash', v_hash, 'replaces_template_id', p_replaces, 'op_key', p_op_key));

  -- ------------------------------------------------------------------------------------
  -- THE ADVISORY WARNINGS (round 10). ADVISORY, NOT REFUSALS -- the distinction is the whole
  -- design of this block and it is deliberate on both counts.
  --
  -- (a) A LIVE SIBLING THIS ONE COLLIDES WITH. [WDB-G13] says an edit IS retire + propose
  -- again, and NOTHING in this product requires the retire to come first: propose-then-retire
  -- is the order a professional actually works in (confirm the replacement is right, then
  -- withdraw the old one). MEASURED (probe z1/p5-order-bypass.mjs): worked in that order, the
  -- poster's refusal reads the predecessor as `live`, prints the plain distinct-codes clause,
  -- and following it ran four already-charged months onto fresh codes with blocked:[] --
  -- RM18,000 of expense against an RM6,000 intention. The propose-first ORDER IS LAWFUL AND
  -- MUST STAY, so this is not a refusal; what was missing is that nobody was ever told the
  -- collision exists at the moment they create it. The warning names the sibling id, so the
  -- reader can act on it before the sweep ever runs.
  --
  -- IT FIRES ONLY ON A CONTAINMENT OVERLAP (identical / contains / contained), never on a
  -- PARTIAL one: two liabilities sharing one accrual code is the DESIGNED grain (argued at
  -- clara._wdb_line_shape) and warning on it would be noise the reader must learn to ignore --
  -- which is how a warning stops being read. The three containment shapes are exactly the three
  -- an edit takes: the same accounts (a figure changed), a leg added, a leg removed.
  --
  -- (a) DOES NOT WARN ON A RETIRED SIBLING, and that is term (c)'s subject rather than an
  -- oversight -- [R11 FIX 2026-08-04]. THE JUSTIFICATION THAT STOOD HERE WAS MEASURED FALSE AND HAS BEEN
  -- DELETED RATHER THAN SOFTENED (this file's own rule, stated at clara._wdb_rerun_breach: a
  -- comment that argues a falsehood is worse than no comment). It read: "retire-then-propose is
  -- the lawful order, THE REPLACEMENT IS REFUSED ON THE PREDECESSOR'S STANDING PERIODS rather than
  -- doubling them". Round 11 measured that the replacement was refused on nothing at all once the
  -- codes differed: this advisory returns only SHAPE-COLLIDING siblings and then filters them to
  -- `status='live'`, and clara._wdb_rerun_breach is keyed on shape intersection -- so a RE-CODED
  -- replacement, the commonest [WDB-G13] edit after a figure change, was invisible to every
  -- defence in this file. RM18,000 of expense stood against an RM6,000 intention with
  -- `warnings: []` and `blocked: []` (probe w1i-no-declaration.mjs, no lineage feature used at
  -- all -- the only call shape the dashboard could send).
  -- THE SENTENCE IS TRUE NOW, and it is true because two things were built: admission predicate
  -- (5) in clara._adj_run_occurrence_core actually refuses a replaced generation's standing
  -- periods, and term (c) below tells the professional at the door where the edit is still one
  -- act away from being right.
  --
  -- (b) A START DATE NO MALAYSIAN CLIENT'S BOOKS CAN REACH. Round 8 ruled the supported date
  -- domain AD 0001-01-01 .. 9999-12-31 and that ruling is not touched here: this is a
  -- PLAUSIBILITY floor, not a grammar. MEASURED (probe z1/p3-domain-and-scale.mjs): a monthly
  -- template starting 0001-01-01 -- an ordinary typo for 2001 -- proposes, signs, and
  -- clara.adjustment_run_due advertises {due:true, period 0001-01-01..0001-01-31, blocked:[]},
  -- so the sweep drafts an occurrence dated in the first millennium. Nothing posts unattended
  -- (it is catch-up, so it drafts, and draft-N-blocks-N+1 then parks the template in front of a
  -- human) which is why this is a WARNING and not a refusal: refusing would invent a date law
  -- the design has not ruled, and the smallest honest act is to say so at the door where the
  -- typo is still one edit away from being fixed.
  select coalesce(jsonb_agg(jsonb_build_object(
           'axis', 'colliding_live_sibling',
           'template_id', e ->> 'template_id',
           'name', e ->> 'name',
           'status', e ->> 'status',
           'containment', e ->> 'containment',
           'colliding_elements', e -> 'colliding_elements',
           'standing_charges', (e ->> 'standing')::int,
           'first_period', e ->> 'first_period',
           'last_period', e ->> 'last_period',
           'message', 'template ' || (e ->> 'template_id') || ' ("' || (e ->> 'name')
             || '") is LIVE on this client and '
             || case when (e ->> 'containment') = 'identical'
                       then 'carries exactly this template''s account shape'
                     when (e ->> 'containment') = 'contains'
                       then 'carries a shape this one fully contains (a leg was added)'
                     else 'carries a shape that fully contains this one (a leg was removed)' end
             || '; every period both cover will be refused '
             || 'period_shape_already_met until one of them is retired or re-coded. It already '
             || 'carries ' || (e ->> 'standing') || ' standing charge(s)'
             || case when coalesce((e ->> 'standing')::int, 0) = 0 then ''
                     else ' for ' || coalesce(e ->> 'first_period', 'an unstated period') || ' .. '
                          || coalesce(e ->> 'last_period', 'an unstated period') end
             || '. IF this template replaces that one, retire it and correct those charges: '
             || 'giving this template distinct codes instead would book those periods twice.')
           order by e ->> 'template_id'), '[]'::jsonb)
    into v_warn
    from jsonb_array_elements(
           clara._wdb_overlapping_siblings(p_client, v_id,
             clara._wdb_line_shape(v_lines))) as t(e)
   where (e ->> 'status') = 'live' and (e ->> 'containment') <> 'partial';
  -- (c) A GENERATION WHOSE STANDING MONTHS THIS PROPOSAL REACHES BACK OVER
  -- [R11 FIX 2026-08-04 -- W1 finding 1, the propose-side half of the silent re-code double;
  --  R12 FIX 2026-08-04 -- the confirming round widened its subject from RETIRED to RETIRED-OR-LIVE and
  --  moved it into clara._wdb_period_overlap_advisory, which is now asked at SIGN as well].
  --
  -- THE WHOLE ARGUMENT LIVES AT THE BODY (S2.1a-6b), including why the retired arm has no shape
  -- requirement, why the live arm has one, and what was measured when the term was retired-only.
  -- What belongs HERE is only the caller's window and its own row: this proposal's bookable
  -- window is [p_start_date, p_end_date], its shape is v_lines', and it may not warn about
  -- itself.
  v_warn := v_warn || clara._wdb_period_overlap_advisory(p_client, v_id,
    clara._wdb_line_shape(v_lines), p_start_date, p_end_date);

  if p_start_date < date '1900-01-01' then
    v_warn := v_warn || jsonb_build_array(jsonb_build_object(
      'axis', 'implausible_start_date',
      'start_date', p_start_date,
      'plausible_from', date '1900-01-01',
      'message', 'the start date ' || p_start_date
        || ' is before 1900 -- no Malaysian client''s books begin there, so this is almost '
        || 'certainly a typo. The sweep will offer the first period from that date as catch-up '
        || 'and the template will then park behind that draft. Retire this template and propose '
        || 'one with the intended start date.'));
  end if;

  -- THE KEY IS ALWAYS PRESENT, empty array and all: a caller that has to test for the key's
  -- EXISTENCE before reading it is a caller that will one day forget, and the house rule for
  -- this migration's stamps is that a shape stays stable and says "nothing" honestly.
  return clara._finish_op(c_firm, 'propose_adjustment_template', p_op_key,
    jsonb_build_object('template_id', v_id, 'status', 'proposed', 'content_hash', v_hash,
      'warnings', v_warn));
end
$core$;
revoke all on function clara._propose_adjustment_template_core(jsonb, uuid, text, text, date, date, boolean, jsonb, text, text, uuid, jsonb) from public;

comment on function clara._propose_adjustment_template_core(jsonb, uuid, text, text, date, date, boolean, jsonb, text, text, uuid, jsonb) is
  'F-A4 PR-2a §D: the extracted body of clara.propose_adjustment_template, harvested from the live catalog and ctx-substituted (two fields). UNGRANTED -- its callers are the door above it and clara._agent_prepayment_schedule_core. Carries §5.2a''s congruence validation, which is what keeps six other live t.lines readers correct under a schedule and holds the D1 inventory at four bodies instead of six.';

-- THE DOOR, now a thin delegate. create-or-replace PRESERVES the existing ACL, which is what W4's
-- prestate-vs-tail comparison asserts byte-for-byte rather than re-granting and hoping.
create or replace function clara.propose_adjustment_template(p_client uuid, p_name text,
    p_cadence text, p_start_date date, p_end_date date, p_auto_reverse boolean, p_lines jsonb,
    p_memo_template text, p_op_key text, p_replaces uuid default null,
    p_schedule jsonb default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $door$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._propose_adjustment_template_core(
    jsonb_build_object('firm', c.firm, 'actor', c.actor),
    p_client, p_name, p_cadence, p_start_date, p_end_date, p_auto_reverse, p_lines,
    p_memo_template, p_op_key, p_replaces, p_schedule);
end $door$;

-- =================================================================================================
-- §D2 — F1: clara._adj_template_hash AT EIGHT ARGUMENTS, NULL-STABLE [D1] (design §5.2, Annex H.5).
--
-- THE DEFECT AVOIDED. The hash covers seven keys. Adding a `schedule` key UNCONDITIONALLY would
-- change EVERY recomputed hash, and the duplicate guard (0045:3948-3952) compares a recomputed hash
-- against STORED ones — so every pre-existing template would silently stop being recognised as its
-- own twin. The extension therefore folds the schedule in ONLY WHEN NON-NULL, leaving the null case
-- byte-identical to today. Cell W37 asserts exactly that against a template created BEFORE this
-- migration; its mutant folds unconditionally and watches the stored hashes mismatch.
--
-- THE CONDITIONAL-TERM IDIOM IS THIS FILE'S OWN NEIGHBOUR'S: propose_adjustment_template already
-- adds a lineage term to its reserve hash the same way (`|| case when p_replaces is null then
-- '{}'::jsonb else ... end`, 0045:122-126), for the same reason — a term that must not move an
-- existing receipt's shape. Reusing the shape rather than inventing one keeps the two readable
-- together.
--
-- WHY DROP-AND-CREATE RATHER THAN create-or-replace: an eighth argument WITH A DEFAULT does not
-- replace the seven-argument function, it ADDS AN OVERLOAD — and a seven-argument call would then
-- match both and fail "function is not unique". The old signature must go.
--
-- SAFE BECAUSE THE CALLER CENSUS IS CLOSED, and it was re-derived at the live catalog rather than
-- taken from the annex: exactly ONE body in clara references this function, and it is
-- clara.propose_adjustment_template — the body §D has already replaced above with one that calls
-- the eight-argument form. A two-line blast radius, as Annex H.5 predicted.
--
-- THE TRIPLE IS PRESERVED DELIBERATELY. The harvest recorded this body as
-- `prosecdef=false | proconfig=(none) | owner=clara_fn_owner` — it is `language sql stable`, NOT
-- security definer and carrying NO search_path. A from-memory rebuild would have quietly promoted
-- it to the definer/search_path shape every neighbouring function wears; §0 pinned the triple and
-- §TAIL compares it, so a promotion cannot pass unnoticed.
-- =================================================================================================
drop function clara._adj_template_hash(text, text, date, date, boolean, jsonb, text);

create function clara._adj_template_hash(p_name text, p_cadence text, p_start date,
    p_end date, p_auto boolean, p_lines jsonb, p_memo text, p_schedule jsonb default null)
  returns text
  language sql stable as $$
  select encode(clara._hash(
    jsonb_build_object(
      'name', p_name, 'cadence', p_cadence, 'start_date', p_start, 'end_date', p_end,
      'auto_reverse', p_auto, 'lines', clara._adj_canon_lines(p_lines),
      'memo_template', p_memo)
    || case when p_schedule is null then '{}'::jsonb
            else jsonb_build_object('schedule', clara._adj_canon_schedule(p_schedule)) end
  ), 'hex') $$;
revoke all on function clara._adj_template_hash(text, text, date, date, boolean, jsonb, text, jsonb) from public;

comment on function clara._adj_template_hash(text, text, date, date, boolean, jsonb, text, jsonb) is
  'F-A4 PR-2a §D2: the seven-key template content hash, plus an eighth `schedule` key folded in ONLY when the schedule is non-null. Null-stability is not a nicety -- the duplicate guard compares a RECOMPUTED hash against STORED ones, so an unconditional key would make every pre-existing template stop recognising its own twin (cell W37). Deliberately still `language sql stable` with NO security definer and NO search_path, exactly as harvested.';

-- ##FA4PR2A-APPEND-POINT##
