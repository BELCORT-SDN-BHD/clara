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
-- ==================== DEVIATIONS FROM THE DESIGN — DECLARED, NOT SLIPPED ====================
--
-- (1) clara._adj_period_lines TAKES (schedule, lines), NOT THE TEMPLATE ROW. Design §5.2 and
--     Annex H.4 name `_adj_period_lines(p_template_row, p_period_start, p_period_end)`.
--     *** THAT SIGNATURE IS UNCALLABLE FROM BOTH OF ITS LIVE CALL SITES. *** Each holds the
--     template in a plpgsql variable declared `record` (0045:4446, :5629), and PostgreSQL answers
--
--         ERROR 42846: cannot cast type record to adjustment_templates
--
--     A bare `record` has NO COMPOSITE TYPE TO CAST FROM, so no column-shape argument could have
--     rescued it. CONDUCTOR-RATIFIED 2026-08-27 as a forced deviation: the replacement is
--     semantics-identical and strictly smaller-coupled — the resolver no longer depends on the
--     table's row type at all, so a later ALTER on clara.adjustment_templates cannot reach it.
--
--     AN ALTERNATIVE DID EXIST, and the register says so rather than implying none did: declaring
--     the two call sites' `t` variables as `clara.adjustment_templates%rowtype` instead of `record`
--     makes the row-type parameter callable, and the review lane RAN that and it succeeds. It was
--     not chosen because it is the LARGER coupling -- it edits two more live bodies' declarations
--     inside the D1 window to keep a parameter shape that binds the resolver to the table's row
--     type, where the jsonb-pair form binds it to nothing. Smaller blast radius, and a later ALTER
--     on clara.adjustment_templates cannot reach it.
--
--     AND THE HONEST HALF, recorded because it is the more useful lesson: §A2.2's own comment
--     originally argued the OPPOSITE — that passing the record was safe "because BOTH sites
--     populate it with a bare single-table `select *`" — and §TAIL even CENSUSED that property.
--     The conclusion was reachable, the reasoning was wrong, and censusing the wrong reason made
--     it look verified. It was caught only by cell W35, the one cell that drives the real posting
--     belt rather than calling the resolver with a genuine table row. A right-conclusion-wrong-
--     reason finding about my own instrument, and the record says so.
--
--     The design docs still name the row-type form; truing them is a named obligation on the
--     review round (fa4-pr2-design §5.2 / Annex H.4), so design and migration do not disagree.
--
-- (2) Pre-rung (b) SKIPS THE SELF-TWIN. Design §6.2a asked it unconditionally, which collided with
--     D-25 / cell B-11's replay contract. RULED and recorded at design §13.2; the derivation and
--     the discriminator (the delegate's own sub-key) are at the rung itself in §F.
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

  select count(*)::int into v_n from pg_attribute
   where attrelid = 'clara.adjustment_templates'::regclass
     and attname = 'proposed_request_digest' and not attisdropped;
  if v_n <> 0 then
    raise exception 'F-A4 PR-2a prestate: adjustment_templates.proposed_request_digest already exists — this file is the one that mints the replay identity, so a column already standing means something else defines it and §TAIL would be censusing a stranger'
      using errcode = 'CLR10', detail = '{"reason":"prestate_request_digest_column_present"}';
  end if;

  foreach v_sig in array array[
      'clara._adj_canon_schedule(jsonb)',
      'clara._adj_period_lines(jsonb,jsonb,date,date)',
      'clara._record_document_service_period_core(jsonb,uuid,date,date,text,text)',
      'clara.record_document_service_period(uuid,date,date,text,text)',
      'clara.prepayment_schedule_v1(uuid,uuid)',
      'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)',
      'clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)',
      'clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
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
-- OWNERSHIP. Everything this file creates is owned by clara_fn_owner, exactly as 0138:316 does it.
-- THIS IS A SECURITY BOUNDARY, NOT A TIDINESS RULE: a SECURITY DEFINER function runs with its
-- OWNER's privileges, so one created by the migration role would run as that role and BYPASS RLS
-- ENTIRELY. Caught here by probing the ACL of an already-applied section rather than by reading —
-- the first cut of this file omitted the set-role and every definer body it created came out owned
-- by the migration role. `reset role` is at the foot of the file, before §TAIL's census, so the
-- census reads the catalog as the migration role and cannot be fooled by the owner's own view.
-- =================================================================================================
set role clara_fn_owner;

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
  -- C4: FINITE AND BOUNDED, at the TABLE as well as at the door. `date` admits 'infinity' and
  -- years in the millions; an infinite term poisons every later extract()/interval read, and an
  -- absurd one would have the evaluator emit one JSON entry per month. The door refuses these BY
  -- NAME so a caller gets a reason -- these two exist so no OTHER writer, now or later, can get
  -- past them. 120 months is a conductor-set default (2026-08-27): it covers every ordinary
  -- prepayment, and widening it is a one-line PR.
  -- THE PRODUCT DOMAIN, IN PURE DATE COMPARISON, BEFORE ANY INTERVAL ARITHMETIC (Codex P4a).
  -- isfinite() alone was not enough: a FINITE 5874897-AD date passes it and then OVERFLOWS the
  -- timestamp domain inside `period_start + interval '120 months'` -- the guard blew up before the
  -- typed refusal it was guarding could speak. Bounds first, in date-vs-date comparison, which
  -- cannot overflow. 1900-01-01 and 2200-12-31 are the product's own domain: no Malaysian
  -- accounting record predates the former, and nothing this product plans for reaches the latter.
  constraint ck_dsp_finite check (isfinite(period_start) and isfinite(period_end)),
  constraint ck_dsp_domain check (
    period_start >= date '1900-01-01' and period_start <= date '2200-12-31'
    and period_end >= date '1900-01-01' and period_end <= date '2200-12-31'),
  -- THE LIMIT BINDS ON THE PERIOD COUNT THE RULED PREDICATE DERIVES, not on a date subtraction
  -- (Codex P4b). `period_end <= period_start + 120 months` admitted EXACTLY 120 months, and a
  -- day-one endpoint pair then yields 121 charged periods -- the ruled predicate counts a month
  -- whenever the term covers its first day, so the arithmetic that bounds it must be the same
  -- arithmetic. n is inlined here exactly as clara.prepayment_schedule_v1 computes it: the first
  -- charged month, the last charged month, months between, inclusive.
  constraint ck_dsp_max_periods check (
    ((extract(year from date_trunc('month', period_end))::int * 12
      + extract(month from date_trunc('month', period_end))::int)
     - (extract(year from case when period_start = date_trunc('month', period_start)::date
                               then date_trunc('month', period_start)
                               else date_trunc('month', period_start) + interval '1 month' end)::int * 12
        + extract(month from case when period_start = date_trunc('month', period_start)::date
                                  then date_trunc('month', period_start)
                                  else date_trunc('month', period_start) + interval '1 month' end)::int)
     + 1) <= 120),
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

-- -------------------------------------------------------------------------------------------------
-- THE REQUEST DIGEST -- the replay identity's own column, and the reason it exists is a class worth
-- naming: *** AN IDENTITY MUST RIDE AN INJECTIVE, TRANSFORM-STABLE ENCODING -- NEVER A DISPLAY
-- STRING. ***
--
-- The replay comparison used to run over the acted receipt's composed rationale, which is a DISPLAY
-- string, and it failed that rule in BOTH directions at once:
--   * NOT INJECTIVE -- it is `rationale || ' | target account ' || account || ': ' || basis`, so
--     (rationale = A, basis = B∥D∥C) and (rationale = A∥D∥B, basis = C) compose to IDENTICAL BYTES.
--     Two genuinely different requests read as the same one, and a CHANGED-ARGUMENT retry would
--     SILENTLY REPLAY. A false ACCEPT -- strictly worse than the false refuse below, because the
--     refusal is loud and this is not.
--   * NOT TRANSFORM-STABLE -- clara._agent_close_receipt stores `left(..., 4000)` (0138:1366) while
--     B2 bounds only the RAW rationale, so a composed string within ~40 characters of the ceiling
--     is stored TRUNCATED and every later replay compares a full string against a truncated one and
--     false-refuses `op_key_reused_with_different_args`. Fail-closed, but it breaks the very
--     idempotency guarantee the replay path exists to provide.
--
-- Both symptoms are ONE seam, so this is one wall rather than two patches. The fix has TWO
-- independent parts, and they are worth separating because they answer different objections:
--   * THE ENCODING carries the INJECTIVITY. jsonb_build_array delimits its elements STRUCTURALLY
--     rather than by a character that can also occur inside an element, so the straddle pair above
--     becomes two distinct texts. That property belongs to the array, not to any hash.
--   * THE HASH carries the COLLISION RESISTANCE, and the choice is load-bearing. This started as
--     md5, which was wrong: md5 admits PRACTICAL chosen-prefix collisions, so a comment claiming an
--     injective identity while riding md5 asserted more than the primitive delivers. `rationale` is
--     MODEL-INFLUENCED TEXT and therefore an adversarial input surface, however remote the reach.
--     It is now sha256 in the ESTATE'S OWN CANONICAL FORM --
--     `encode(sha256(convert_to(<text>, 'UTF8')), 'hex')` -- the same spelling the evaluator freeze
--     closure and the migration-body pins use above (:1170, :336), so there is one hashing idiom
--     here and not two. 64 hex characters, fixed-width regardless of what it encodes, so nothing
--     downstream can truncate it into agreement with something else.
--
-- IT IS FROZEN FOR FREE, and that is not luck: clara._tf_adjustment_template_transition compares
-- `to_jsonb(new) - v_frozen` against `to_jsonb(old) - v_frozen` where v_frozen is ONLY the eight
-- lifecycle stamps, so it is DENY-BY-DEFAULT over every other column -- a new one inherits the
-- immutability with no change to the trigger. §5.3 already leans on exactly this property for
-- `schedule`; the identity of a signed request now leans on it too, which is the right place for it.
alter table clara.adjustment_templates add column proposed_request_digest text;

comment on column clara.adjustment_templates.proposed_request_digest is
  'F-A4 PR-2a: 64 hex characters -- encode(sha256(convert_to(...,''UTF8'')),''hex'') over an INJECTIVE encoding of the agent request that produced this template, jsonb_build_array(target_account, target_basis, rationale, model_name, model_version). TWO separate properties, deliberately: the ARRAY carries the injectivity (elements are delimited structurally, so no element can imitate the separator) and SHA-256 carries the collision resistance (md5 was the first cut and was wrong -- its chosen-prefix collisions are practical, and rationale is model-influenced text). The spelling is the estate''s canonical one, shared with the evaluator freeze closure and the migration-body pins. Set at INSERT beside proposed_op_key and frozen by clara._tf_adjustment_template_transition''s deny-by-default rule. It exists because the replay identity previously rode the receipt''s COMPOSED RATIONALE, a display string that is neither injective (a delimiter can occur inside an element, so two different requests compose to identical bytes and a changed-argument retry replays silently) nor transform-stable (the receipt stores left(...,4000), so a near-ceiling request false-refuses every replay). An identity must ride an injective, transform-stable encoding -- never a display string. NULL on every human-proposed template: only the agent lane sets it.';

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
-- IT TAKES THE TWO jsonb VALUES IT NEEDS, NOT THE TEMPLATE ROW — a FORCED correction to the
-- design's `p_template_row` shape, and the reason is a hard type error rather than a preference.
--
-- The design specifies `clara._adj_period_lines(p_template_row, p_period_start, p_period_end)`.
-- THAT SIGNATURE CANNOT BE CALLED FROM EITHER OF ITS TWO LIVE CALL SITES. Both hold the template in
-- a plpgsql variable declared `record` (0045:4446, :5629), and PostgreSQL answers
--     ERROR 42846: cannot cast type record to adjustment_templates
-- when such a variable is passed to a composite-typed parameter. It is not a question of the column
-- list matching — a bare `record` has no composite type to cast FROM, so no `select *` shape could
-- have saved it. An earlier draft of this comment reasoned the opposite and was WRONG.
--
-- CAUGHT BY THE END-TO-END BOOKS CELL (W35) and by nothing else: every other cell passes a genuine
-- clara.adjustment_templates value and never meets the wall, while W35 is the only one that drives
-- the real posting belt. Without it this train would have shipped an adjustment belt that could not
-- post a single occurrence.
--
-- Taking (schedule, lines) is also the SMALLER COUPLING: the resolver no longer depends on the
-- table's row type at all, so a later ALTER on clara.adjustment_templates cannot reach it, and a
-- caller holding only those two columns can use it. Reported to the conductor as a forced
-- deviation, with this evidence.
-- -------------------------------------------------------------------------------------------------
create function clara._adj_period_lines(p_schedule jsonb, p_lines jsonb,
    p_period_start date, p_period_end date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_lines jsonb;
begin
  if p_schedule is null then
    return clara._adj_canon_lines(p_lines);
  end if;
  select clara._adj_canon_lines(x.value -> 'lines') into v_lines
    from jsonb_array_elements(p_schedule) as x(value)
   where (x.value ->> 'period_start')::date = p_period_start
     and (x.value ->> 'period_end')::date   = p_period_end;
  if v_lines is null then
    raise exception 'this template carries a schedule that does not cover the period being posted'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'schedule_period_uncovered',
                                    'period_start', p_period_start,
                                    'period_end', p_period_end)::text;
  end if;
  return v_lines;
end $$;
revoke all on function clara._adj_period_lines(jsonb, jsonb, date, date) from public;

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
  v_first date; v_last date; v_n int;
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
  -- C4: FINITE AND BOUNDED. `date` admits 'infinity' and years in the millions, and a bookkeeper
  -- keys this by hand. An infinite or absurd term poisons every later extract()/interval
  -- arithmetic that reads it, and the evaluator would try to emit one JSON entry per month --
  -- millions of them -- before anything downstream could refuse. Both walls are here AND on the
  -- table (ck_dsp_finite / ck_dsp_max_term): the door so the caller gets a reason, the table so no
  -- other writer can ever get past it.
  --
  -- 120 MONTHS is a CONDUCTOR-SET DEFAULT (2026-08-27), named as a constant with its reason rather
  -- than buried as a literal: it covers every ordinary prepayment an accounting firm meets, and
  -- widening it is a one-line PR. It goes to the owner in the next batch as a set default, not as
  -- a silent choice.
  -- ORDER IS LOAD-BEARING (Codex P4a): finiteness, then the DOMAIN in pure date comparison, and
  -- only THEN anything that does interval arithmetic. A finite 5874897-AD date passes isfinite and
  -- then OVERFLOWS the timestamp domain inside `p_period_start + interval '120 months'` -- the
  -- guard blew up before the typed refusal it was guarding could speak, so the caller got a raw
  -- 22008 instead of a reason.
  if not isfinite(p_period_start) or not isfinite(p_period_end) then
    raise exception 'a service period must carry finite dates'
      using errcode = 'CLR10', detail = '{"reason":"service_period_dates_not_finite"}';
  end if;
  if p_period_start < date '1900-01-01' or p_period_start > date '2200-12-31'
     or p_period_end < date '1900-01-01' or p_period_end > date '2200-12-31' then
    raise exception 'a service period must fall inside 1900-01-01 .. 2200-12-31'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'service_period_dates_out_of_domain',
          'domain_from', date '1900-01-01', 'domain_to', date '2200-12-31',
          'period_start', p_period_start, 'period_end', p_period_end)::text;
  end if;
  if p_period_end < p_period_start then
    raise exception 'a service period ends on or after it starts'
      using errcode = 'CLR10', detail = '{"reason":"service_period_dates_inverted"}';
  end if;
  -- THE LIMIT BINDS ON THE PERIOD COUNT, not a date subtraction (Codex P4b). The previous form
  -- admitted EXACTLY 120 months, and a day-one endpoint pair then charges 121 periods -- the ruled
  -- predicate counts a month whenever the term covers its FIRST DAY, so the bound must count the
  -- same way the evaluator does. n is computed here exactly as clara.prepayment_schedule_v1 does.
  v_first := case when p_period_start = date_trunc('month', p_period_start)::date
                  then p_period_start
                  else (date_trunc('month', p_period_start) + interval '1 month')::date end;
  v_last  := date_trunc('month', p_period_end)::date;
  v_n := ((extract(year from v_last)::int * 12 + extract(month from v_last)::int)
        - (extract(year from v_first)::int * 12 + extract(month from v_first)::int)) + 1;
  if v_n > 120 then
    raise exception 'a service period spanning % charged months exceeds this carrier''s limit of 120', v_n
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'service_period_term_too_long',
          'max_periods', 120, 'derived_periods', v_n,
          'period_start', p_period_start, 'period_end', p_period_end)::text;
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

-- -------------------------------------------------------------------------------------------------
-- §C.1 — THE FREEZE REGISTRATION, single-member by construction.
--
-- THE search_path HERE IS LOAD-BEARING, NOT COSMETIC (0059:243-245's recorded reason, which 0091
-- restates): verify_evaluator_freeze() reproduces the closure hash under pg_catalog,pg_temp, so a
-- registration performed under ANY OTHER search_path stores a hash the verifier CANNOT reproduce
-- and every later apply reds. It is set immediately before and restored immediately after.
--
-- ONE MEMBER, deliberately (design §5.1). Registering a closure freezes EVERY member body
-- estate-wide -- verify_evaluator_freeze() ignores the `deployed` flag and hashes the full
-- pg_get_functiondef -- so an N-member registration is N bodies a later lane can never recut
-- without reding an apply. clara.prepayment_schedule_v1 calls no other clara function precisely so
-- that this list can honestly have one entry.
--
-- deployed = false: the runtime half is PR-2b (design §13 item 1). The freeze binds regardless,
-- which is the point -- the flag is about traffic, not about immutability.
-- -------------------------------------------------------------------------------------------------
set local search_path = pg_catalog, pg_temp;
do $fa4pr2a_freeze$
declare e uuid; h bytea;
begin
  select sha256(convert_to(string_agg(
           encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), 'hex'),
           '' order by o), 'UTF8')) into h
    from (values (0, 'clara.prepayment_schedule_v1(uuid,uuid)')) m(o, s);
  insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
      closure_sha256, migration_version, deployed)
    values ('prepayment_schedule', 1, 'clara.prepayment_schedule_v1(uuid,uuid)', h,
      -- *** CLAIMED AT MERGE: this literal is the file's own name and MUST be trued when the
      -- migration number is claimed (.claude/rules/db-migrations.md). It is named in the header's
      -- merge checklist so it cannot be forgotten. ***
      'UNNUMBERED_f_a4_pr_2a_prepayment_limb', false)
    returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
      body_sha256, firm_id)
    select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text, 'UTF8')), null::uuid
      from (values (0, 'clara.prepayment_schedule_v1(uuid,uuid)')) m(o, s);
end $fa4pr2a_freeze$;
set local search_path = clara, pg_temp;

comment on function clara.prepayment_schedule_v1(uuid, uuid) is
  'F-A4 PR-2a: the versioned deterministic evaluator behind wrapper 12. Amounts are DB-derived from the source entry''s own prepaid-asset leg; the emitted period_lines carry that ASSET half only, and the judged EXPENSE account is applied by clara._agent_prepayment_schedule_core under F2''s three walls. Whole-calendar-month straight line, remainder wholly in the final period. A calendar month is charged iff the term covers that month''s FIRST day (the uniform reading of law 20''s split-month doctrine, ruled 2026-08-27). Calls no other clara function, which is what keeps its evaluator_versions closure at ONE member and the freeze meaningful; a changed formula is _v2, never an edit.';

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
    p_schedule jsonb default null, p_request_digest text default null)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $core$
declare
  c_firm uuid; c_actor uuid; v_sched jsonb; v_shape_t text[]; v_shape_s text[];
  v_sd bigint; v_sc bigint; v_prev date; v_first_ps date; v_last_pe date; y jsonb; v_walk date;
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
    --
    -- THE SORT IS BY THE EXPRESSION, NOT `order by 1`. Inside an AGGREGATE, a bare integer in
    -- ORDER BY is a CONSTANT, not a positional column reference -- so `array_agg(x order by 1)`
    -- does not sort at all and silently compares ARRIVAL ORDER. The first cut did exactly that,
    -- while the design asks for a MULTISET: a perfectly lawful schedule that listed its two lines
    -- in the opposite order to `lines` would have been refused at propose. Caught by W34's own
    -- mutant, which reverses the line order and must still be accepted.
    select array_agg((e ->> 'account_code') || case when (e ->> 'debit_cents')::bigint > 0 then ':D' else ':C' end
             order by (e ->> 'account_code') || case when (e ->> 'debit_cents')::bigint > 0 then ':D' else ':C' end)
      into v_shape_t from jsonb_array_elements(v_lines) as t(e);
    -- COVERAGE IS UNDEFINABLE WITHOUT AN END DATE: an open-ended template has no last period to
    -- match, so a schedule cannot be proven to cover it. Refuse rather than validate half of it.
    if p_end_date is null then
      raise exception 'a template that carries a schedule must declare its end date'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'schedule_coverage_gap', 'axis', 'open_ended')::text;
    end if;
    v_walk := clara._adj_period_start(p_client, p_cadence, p_start_date);
    for y in select value from jsonb_array_elements(v_sched) loop
      -- (a0) PER-LINE SHAPE -- Codex C1(a). The multiset and the aggregate balance are both blind
      -- to a line that carries BOTH sides positive (or both zero): two such lines can agree on
      -- shape and sum to an equal total, so a schedule containing them PROPOSES, a human SIGNS it,
      -- and the poster then aborts at journal insertion. A poisoned template goes LIVE, and the
      -- refusal arrives after the signature. Every scheduled line therefore meets the same rule a
      -- flat line meets: nonnegative integer cents, exactly one positive side.
      if exists (
        select 1 from jsonb_array_elements(y -> 'lines') as t(e)
         where coalesce((e ->> 'debit_cents')::bigint, 0) < 0
            or coalesce((e ->> 'credit_cents')::bigint, 0) < 0
            or (coalesce((e ->> 'debit_cents')::bigint, 0) > 0)
               = (coalesce((e ->> 'credit_cents')::bigint, 0) > 0)) then
        raise exception 'a schedule line must carry exactly one positive side in nonnegative cents'
          using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'schedule_line_invalid',
              'period_start', y ->> 'period_start', 'lines', y -> 'lines')::text;
      end if;
      select array_agg((e ->> 'account_code') || case when (e ->> 'debit_cents')::bigint > 0 then ':D' else ':C' end
             order by (e ->> 'account_code') || case when (e ->> 'debit_cents')::bigint > 0 then ':D' else ':C' end)
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
      -- (c) COVERAGE AT CADENCE BOUNDARIES -- not merely contiguous, EXACT.
      -- Codex C1(b): contiguity plus a matching span is NOT enough. Jan1-31 / Feb1-10 / Feb11-Mar31
      -- is contiguous and spans the declared range exactly, yet carries no exact February and no
      -- exact March period. January posts, then February's occurrence resolves to nothing and
      -- raises schedule_period_uncovered -- STRANDING the prepaid asset mid-schedule, after a human
      -- has already signed. The wall must therefore compare each entry against the period the
      -- occurrence runner will actually derive, which is what _adj_period_start/_adj_period_end
      -- return, and must consume the whole range with NO missing and NO extraneous entry.
      -- NO EXTRANEOUS TRAILING PERIOD (Codex P1). The walk alone did not close this: once it had
      -- consumed the declared range it kept advancing, so a Jan-Feb template carrying Jan+Feb+MAR
      -- entries had its March entry compared against March's own derived period -- which matches --
      -- and the final short-check then passed too, because Apr-1 > Feb-28. The schedule covered
      -- MORE than the template declares, and every period-by-period comparison agreed. The walk
      -- must therefore consume EXACTLY the derived range: an entry that begins after the range is
      -- already exhausted is refused here, before its boundaries are even compared.
      if v_walk > p_end_date then
        raise exception 'the schedule carries a period beyond the template''s own end date'
          using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'schedule_coverage_gap', 'axis', 'extraneous',
              'entry_start', y ->> 'period_start', 'entry_end', y ->> 'period_end',
              'template_end', p_end_date)::text;
      end if;
      if (y ->> 'period_start')::date is distinct from v_walk
         or (y ->> 'period_end')::date
            is distinct from clara._adj_period_end(p_client, p_cadence, v_walk) then
        raise exception 'a schedule period does not match the cadence period the poster will run'
          using errcode = 'CLR10',
            detail = jsonb_build_object('reason', 'schedule_coverage_gap', 'axis', 'boundary',
              'entry_start', y ->> 'period_start', 'entry_end', y ->> 'period_end',
              'expected_start', v_walk,
              'expected_end', clara._adj_period_end(p_client, p_cadence, v_walk))::text;
      end if;
      v_walk := clara._adj_period_end(p_client, p_cadence, v_walk) + 1;
    end loop;
    -- THE WALK MUST CONSUME THE RANGE **EXACTLY** -- an EQUALITY, not a lower bound (Codex P1 /
    -- native N2, converged blind). `v_walk <= p_end_date` rejects only a SHORT schedule; a walk
    -- that ran PAST the end satisfies it, which is how a Jan-Feb template carrying Jan+Feb+Mar
    -- passed every period-by-period comparison and this check too.
    --
    -- THE TWO FAILURES ARE DISTINGUISHED AXES, because they are different defects with different
    -- harms and a reader should not have to infer which one happened.
    --   'short'      -- a period the template declares has no entry: the occurrence resolves to
    --                   nothing and the prepaid asset is STRANDED mid-schedule, after signature.
    --   'extraneous' -- an entry beyond the declared range. This one is INERT AT POSTING
    --                   (clara._adj_run_occurrence_core refuses an out-of-range period at
    --                   0045:4558), so no wrong number is ever posted -- but it RIDES INTO
    --                   content_hash, so the human signs a schedule containing periods that can
    --                   never run. The signature attests to something the product cannot honour,
    --                   which is why an inert defect is still refused at the door.
    if v_walk <> p_end_date + 1 then
      raise exception 'the schedule does not consume the template''s declared range exactly'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'schedule_coverage_gap',
            'axis', case when v_walk <= p_end_date then 'short' else 'extraneous' end,
            'walk_stopped_at', v_walk, 'template_end', p_end_date)::text;
    end if;
    -- CLAUSE (c) NOW BINDS THE CEILING AN EARLIER CUT ONLY DECLARED. That cut said the validation
    -- "does not prove that its entry boundaries coincide with the boundaries the occurrence runner
    -- will derive", and left _adj_period_lines' typed refusal as the structural wall. That refusal
    -- is still the wall at POST time -- but a wall that fires only after a signature has stranded
    -- an asset is not where this belongs. Comparing against _adj_period_start/_adj_period_end makes
    -- the boundaries provably the runner's own, for every cadence and not only for monthly.
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
        replaces_template_id, lineage_root_id, proposed_by, proposed_op_key, schedule,
        proposed_request_digest)
      values (c_firm, p_client, 'proposed', btrim(p_name), p_cadence, p_start_date, p_end_date,
        p_auto_reverse, v_lines, p_memo_template, v_hash, p_replaces,
        case when p_replaces is null then null else v_repl_root end, c_actor, p_op_key, v_sched,
        p_request_digest)
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
revoke all on function clara._propose_adjustment_template_core(jsonb, uuid, text, text, date, date, boolean, jsonb, text, text, uuid, jsonb, text) from public;

comment on function clara._propose_adjustment_template_core(jsonb, uuid, text, text, date, date, boolean, jsonb, text, text, uuid, jsonb, text) is
  'F-A4 PR-2a §D: the extracted body of clara.propose_adjustment_template, harvested from the live catalog and ctx-substituted (two fields). UNGRANTED -- its callers are the door above it and clara._agent_prepayment_schedule_core. Carries §5.2a''s congruence validation, which is what keeps six other live t.lines readers correct under a schedule and holds the D1 inventory at four bodies instead of six. It takes ONE argument the human door does not: p_request_digest, the agent lane''s replay identity (W45). That asymmetry is deliberate -- the door stays at eleven arguments, so a human caller who can already choose p_op_key cannot also stamp the digest and plant a twin the agent would then replay.';

-- THE DOOR, now a thin delegate.
--
-- DROP-AND-CREATE, NOT create-or-replace — and this was a REAL DEFECT caught by probing the applied
-- catalog rather than by reading the diff. `create or replace` with an ADDED argument does not
-- replace anything: it creates a SECOND overload. The first cut of this section left the shipped
-- ten-argument door standing with its original inline body and its clara_authenticated grant, while
-- the new eleven-argument one arrived at DEFAULT ACL — which for a function means PUBLIC EXECUTE.
-- Three things were wrong at once: the extraction never took effect for any existing caller, a
-- ten-argument call became ambiguous between two candidates, and a definer body was left callable
-- by PUBLIC. The overload trap was correctly anticipated for _adj_template_hash in §D2 and simply
-- not carried across to the door — the same lesson, one scope too narrow.
--
-- SAFE TO DROP: censused at the live catalog, not assumed. No clara body CALLS the ten-argument
-- door — the three that mention the name (_adj_oldest_unmet_period, _adj_run_occurrence_core,
-- _wdb_template_ancestry) do so only in COMMENTS, read and confirmed. The dashboard calls it by RPC
-- with ten arguments, which resolves unambiguously to the eleven-argument form once the old one is
-- gone: that is precisely why the house rule (0045:6707-6711) puts a new argument LAST WITH A
-- DEFAULT.
--
-- THE ACL IS RE-ESTABLISHED EXPLICITLY to the shape §0 harvested (clara_authenticated only, no
-- PUBLIC, no wake role, no runtime role); §TAIL compares it against that pin rather than trusting
-- this grant to have been right.
drop function clara.propose_adjustment_template(uuid, text, text, date, date, boolean, jsonb,
  text, text, uuid);

create function clara.propose_adjustment_template(p_client uuid, p_name text,
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
    -- THE DIGEST IS NOT THE HUMAN DOOR'S TO SET. It is the AGENT lane's replay identity, computed
    -- by _agent_prepayment_schedule_core over the request it is about to act on; a human proposer
    -- has no such request and no business stamping one. Widening this door would also hand a
    -- caller who can already choose p_op_key the OTHER half of a forged twin -- a template the
    -- agent would then REPLAY instead of acting. It defaults to NULL here, which is exactly what a
    -- human-proposed template should carry.
    p_memo_template, p_op_key, p_replaces, p_schedule);
end $door$;
revoke all on function clara.propose_adjustment_template(uuid, text, text, date, date, boolean, jsonb, text, text, uuid, jsonb) from public;
grant execute on function clara.propose_adjustment_template(uuid, text, text, date, date, boolean, jsonb, text, text, uuid, jsonb) to clara_authenticated;

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

-- =================================================================================================
-- §D3 — F1: THE TWO POSTING BODIES RESOLVE PER-PERIOD LINES [D1] (design §5.2, Annex H.4).
--
-- These are the two bodies that make this window matter: clara._adj_run_occurrence_core is THE
-- DAILY UNATTENDED ADJUSTMENT BELT, and clara._adj_on_approve fires at EVERY approve of an
-- occurrence. Both are harvested from the live catalog and carry EXACTLY ONE counted substitution
-- each — "two call sites change, and only two" (Annex H.4), asserted by the generator rather than
-- believed.
--
-- WHAT IS DELIBERATELY *NOT* CHANGED, and why that is the whole D1 argument: the OTHER t.lines
-- reads in these bodies stay exactly as they are — the _wdb_line_shape read and the
-- _adj_line_eligibility_breach read in the occurrence core, and the eligibility read in
-- _adj_on_approve. Every one is AMOUNT-BLIND, and §5.2a's shape-congruence clause makes them
-- correct BY CONSTRUCTION under a schedule (Annex H.3 censuses all six such readers estate-wide).
-- The generator ASSERTS those reads survived — 3 in the occurrence core, 1 in _adj_on_approve — so
-- a substitution that reached too far reds at generation time instead of in production.
--
-- NULL-STABILITY, structurally: with schedule null — every row in the estate on the day this
-- applies, guaranteed by §0's absence pin — clara._adj_period_lines returns
-- clara._adj_canon_lines(t.lines), which is byte-identical to the expression each line replaced.
-- Cells W36/W37 are the rig proof of that; they are the belt, not the argument.
--
-- BOTH RESOLVE ON (v_ps, v_pe), THE DERIVED PERIOD — not on the caller's requested date. In the
-- occurrence core those come from clara._adj_period_start/_adj_period_end; in _adj_on_approve they
-- are read off the entry's own recurring_adjustment flags, and that body already asserts the two
-- agree. Resolving on anything else would let a schedule entry match a period the run did not post.
-- =================================================================================================
CREATE OR REPLACE FUNCTION clara._adj_run_occurrence_core(p_client uuid, p_template uuid, p_period_start date, p_period_end date, p_op_key text, p_actor uuid, p_firm uuid, p_verb text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $d3occ$
declare
  v_dedupe jsonb; v_approve_key text; v_mirror_key text; t record; r record;
  v_ps date; v_pe date; v_entry uuid; v_rev uuid; v_actor uuid; v_breach jsonb;
  v_corr_breach jsonb; v_shape text[]; v_remedy text; v_collide text;
  v_pred jsonb; v_pred_txt text; v_own jsonb;
  -- [round 10, lane P1] the RECORDED lineage half of the same refusal: the ancestry answer, the
  -- ancestor ids as text (the census speaks jsonb, the stamp speaks uuid), the subset of them that
  -- actually has something standing, the sentence built from that subset, and the last period it
  -- charged (the date a non-doubling replacement must start after).
  v_anc jsonb; v_anc_ids text[]; v_repl_ids text[]; v_repl_txt text; v_repl_last text;
  -- [R11 FIX 2026-08-04] admission predicate (5)'s subject: what a generation this template replaces
  -- still has standing IN THE PERIOD being run. The shape gate's own use of v_repl_txt/v_repl_last
  -- is one branch further down and cannot collide -- (5) raises before it is reached.
  v_repl_std jsonb;
  -- ...and the same question over the template's WHOLE BOOKABLE WINDOW, which is the reachability
  -- predicate term (a) was missing.
  v_repl_win jsonb;
  -- Whether the entry the shape gate names was written by a generation this template replaces.
  -- The two facts were composed as if they were one, and on the finding's scenario they were not.
  v_blocker_is_ancestor boolean;
  v_dr bigint; v_cr bigint; v_ramp boolean; v_high boolean; v_catch_up boolean;
  v_mode text; v_status text; v_label text; v_memo text; v_watermark timestamptz;
  v_run uuid; v_rev_entry uuid; v_amount bigint;
begin
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(p_firm, p_verb, p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'template', p_template,
      'ps', p_period_start, 'pe', p_period_end)));
  if v_dedupe is not null then return v_dedupe; end if;

  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(p_firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('template', p_template, 'ps', p_period_start,
         'pe', p_period_end, 'role', 'occurrence'))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode = 'CLR10', detail = '{"reason":"approve_key_collision"}';
  end if;
  v_mirror_key := p_op_key || ':mirror:approve';
  if clara._reserve_op(p_firm, 'approve_entry', v_mirror_key,
       clara._hash(jsonb_build_object('template', p_template, 'ps', p_period_start,
         'pe', p_period_end, 'role', 'reversal'))) is not null then
    raise exception 'the derived mirror approve op key is already in use'
      using errcode = 'CLR10', detail = '{"reason":"approve_key_collision"}';
  end if;

  -- THE CLIENT RUNG, BEFORE ANY TEMPLATE OR ENTRY READ (the 0041 poster's law restated).
  -- It is what makes the admission decision, the mode decision, the post and any concurrent
  -- correction ONE lock-holding transaction -- which is why ramp flap is impossible rather
  -- than merely unlikely.
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select * into t from clara.adjustment_templates a
    where a.id = p_template and a.client_id = p_client;
  if not found or t.status <> 'live' then
    raise exception 'this adjustment template is not live for this client'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'template_not_live',
          'template_id', p_template)::text;
  end if;
  v_actor := coalesce(p_actor, t.signed_by);

  -- THE NON-AUTO_REVERSE BRANCH CLOSES THE MIRROR KEY (ABI SSE closer column). Done as soon
  -- as the branch is knowable, with an honest deferral marker: nothing will ever spend it.
  if not t.auto_reverse then
    perform clara._finish_op(p_firm, 'approve_entry', v_mirror_key,
      jsonb_build_object('deferred', true, 'reason', 'template_not_auto_reverse',
        'template_id', p_template));
  end if;

  -- THE PERIOD BOUNDS ARE INSIDE THE SUPPORTED DATE DOMAIN (round 8), asked BEFORE the cadence
  -- algebra runs on them. clara.run_adjustment_manual takes both bounds from a human, so this
  -- door lets dates in independently of propose's window check -- and a period stamp outside
  -- clara._wdb_iso_date_supported's range makes the re-run gate read that entry as in-set for
  -- the client's whole calendar. Refused with the poster's own period_request_invalid grammar
  -- (CLR38 + an axis), not propose's, because a shared asserter would have had to be handed both
  -- families' error codes. The measurement is at clara._wdb_iso_date_supported.
  if not clara._wdb_iso_date_supported(p_period_start)
     or not clara._wdb_iso_date_supported(p_period_end) then
    raise exception 'the period % .. % is outside the supported date range 0001-01-01 .. 9999-12-31 (AD)', p_period_start, p_period_end
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_request_invalid',
          'axis', 'date_unsupported', 'period_start', p_period_start,
          'period_end', p_period_end, 'supported_from', date '0001-01-01',
          'supported_to', date '9999-12-31')::text;
  end if;
  -- THE PERIOD IS THE CADENCE'S, NOT THE CALLER'S (WD-R8 consumed; the 0041 poster's shape).
  v_ps := clara._adj_period_start(p_client, t.cadence, p_period_start);
  v_pe := clara._adj_period_end(p_client, t.cadence, p_period_start);
  if v_ps is distinct from p_period_start or v_pe is distinct from p_period_end then
    raise exception 'this template''s % cadence runs % .. %, not % .. %', t.cadence, v_ps, v_pe, p_period_start, p_period_end
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_request_invalid',
          'axis', 'not_cadence_aligned', 'cadence', t.cadence,
          'period_start', v_ps, 'period_end', v_pe)::text;
  end if;
  -- A PERIOD IS RUNNABLE ONLY ONCE IT HAS ENDED, IN MALAYSIA. clara._fa_today() is the house
  -- MYT legal date (0041:1012): a UTC runtime between 00:00 and 08:00 MYT is a calendar day
  -- BEHIND the books it is posting into, and this file never asks the session zone.
  if v_pe >= clara._fa_today() then
    raise exception 'the period % .. % has not ended yet (MYT %)', v_ps, v_pe, clara._fa_today()
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_request_invalid', 'axis', 'not_ended',
          'period_end', v_pe)::text;
  end if;

  -- ------------------------------------------------------------------------------------
  -- THE ADMISSION LAW (design SS2.3), three predicates, each with its own token.
  -- ------------------------------------------------------------------------------------
  -- (1) THE WINDOW: [start_date, coalesce(end_date, infinity)]. Both bounds are cadence
  -- boundaries (validated at propose and re-validated at sign), so comparing the period's own
  -- ends against them is exact.
  if v_ps < t.start_date or (t.end_date is not null and v_pe > t.end_date) then
    raise exception 'the period % .. % lies outside this template''s window (% .. %)', v_ps, v_pe, t.start_date, coalesce(t.end_date::text, 'open')
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_out_of_window',
          'template_id', p_template, 'period_start', v_ps, 'period_end', v_pe,
          'start_date', t.start_date, 'end_date', t.end_date)::text;
  end if;
  -- (2) UNMET: no APPROVED, UN-REVERSED role='occurrence' entry exists for this
  -- (template, period). Entries are the truth -- receipts are never read for eligibility
  -- (the 0041:695-697 law restated), because a pair-corrected period must become unmet again
  -- and its receipt legitimately survives. Written as TEXT comparisons on the two expressions
  -- the ABI SSC index ix_je_adj_occurrence is built over, so this rides the index instead of
  -- casting its way off it (the D-a F10 measured law).
  if exists (select 1 from clara.journal_entries je
             where je.flags ? 'recurring_adjustment'
               and (je.flags -> 'recurring_adjustment' ->> 'template_id') = p_template::text
               and (je.flags -> 'recurring_adjustment' ->> 'period_start')
                     = to_char(v_ps, 'YYYY-MM-DD')
               and (je.flags -> 'recurring_adjustment' ->> 'role') = 'occurrence'
               and je.status = 'approved' and je.reversed_by is null) then
    raise exception 'this template already has an approved, un-reversed occurrence for % .. %', v_ps, v_pe
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'period_already_met',
          'template_id', p_template, 'period_start', v_ps, 'period_end', v_pe)::text;
  end if;
  -- (3) NOT BLOCKED: draft-N blocks N+1, per template (never client-wide -- two templates on
  -- one client are independent lanes). This is blocked[]'s TRANSIENT reason; the due oracle
  -- also reports template_line_ineligible, which is the eligibility refusal just below.
  if clara._adj_occurrence_outstanding(p_client, p_template) then
    raise exception 'an occurrence draft for this template is outstanding; approve or withdraw it before running another period'
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'occurrence_draft_outstanding',
          'template_id', p_template)::text;
  end if;
  -- (4) THE PERIOD IS SOUND TO RE-RUN [as-built ladder round 5 -- THE CORRECT-AND-RE-RUN
  -- DOUBLE]. (2) proves the period is UNMET; this proves it is unmet SOUNDLY -- that whatever
  -- made it unmet actually left the period's own books flat. Without it, the two settled laws
  -- this file and clara.reverse_entry each hold correctly compose into a permanent doubling of
  -- a statutory year-end balance: measured at RM100,000.00 of FY2025 expense (and RM100,000.00
  -- of FY2025 accrual liability) against a RM50,000.00 accrual, on BOTH lanes, with this very
  -- oracle re-proposing the period on every sweep.
  --
  -- IT IS ADDITIVE AND LAST AMONG THE ADMISSION PREDICATES, deliberately: the window /
  -- period_already_met / occurrence_draft_outstanding trio keeps its pinned order, wording and
  -- precedence exactly (round 4 measured three regressions in this body's admission law and
  -- the lesson was to add beside, never to reorder). It sits ABOVE the eligibility
  -- re-derivation for one reason: a period that cannot lawfully be re-run at all must not be
  -- reported as an ACCOUNT problem, and clara._adj_oldest_unmet_period asks the two in exactly
  -- this order so the verb and the oracle can never name different reasons for one period.
  --
  -- THE REMEDY NAMES ONLY ACTS THAT EXIST (WDB-R2: "if a message cannot honestly promise an
  -- outcome, it must not promise it"). An earlier cut of this refusal said "book the correction
  -- into the period by hand" -- and that is the right ACCOUNTING act, but it does NOT clear
  -- this gate and could never have: a hand-booked entry sets no reversed_by, the original's
  -- reversed_by still names the out-of-period correction, and clara.reverse_entry refuses to
  -- re-reverse an already-reversed entry. The state is TERMINAL for the automatic lane, and
  -- exactly one act reaches it: retiring the template, which stops the period being advertised
  -- and hands the books to a human. So that is what is named, in the detail as a machine-
  -- readable `remedy` key as well as in the sentence. (`period_correction_unsound` is terminal
  -- for the PERIOD in the same way template_line_ineligible is terminal for the TEMPLATE.)
  --
  -- The refusal names BOTH entries and BOTH dates, because the one thing a human cannot
  -- reconstruct from a token is which two dates disagreed.
  --
  -- ASKED WITH THE TEMPLATE'S ACCOUNT SHAPE, NOT ITS ID [round 6]. (2) above is the
  -- template-keyed met-ness test and it keeps its exact pinned wording and precedence -- but it
  -- can only ever see THIS template's own occurrences, and [WDB-G13] says an edit IS a new
  -- template. Asking the shared gate with clara._wdb_line_shape(t.lines) is what makes the
  -- question the books' rather than the register-of-templates': "does this client's overlapping
  -- calendar already carry a posting that moves ANY of these accounts in the same direction?"
  -- (round 8: ANY, not ALL -- the equality form was an identity test a one-sen edit could vary).
  v_shape := clara._wdb_line_shape(t.lines);
  v_corr_breach := clara._wdb_rerun_breach(p_client, 'recurring_adjustment', v_shape, v_ps, v_pe);
  if v_corr_breach is not null and (v_corr_breach ->> 'axis') = 'shape_already_met' then
    -- A DIFFERENT REFUSAL FROM period_correction_unsound, because it is a different fact with a
    -- different remedy. Nothing here is unsound: a posting that moves at least one of this
    -- template's accounts in the same direction is standing, correctly, in a period overlapping
    -- this one, under another authority. (2) has already proved it is not this template's, so it
    -- is either the generation this template replaces -- correct that entry, in its own period,
    -- and this period reopens by itself -- or a genuinely separate live template sharing an
    -- account with this one, in which case the books cannot tell the two charges on that account
    -- apart and neither can any reader; give it its own code. BOTH remedies are acts that exist
    -- and that clear this gate (WDB-R2).
    --
    -- THE PRODUCT LAW THIS REFUSAL ENFORCES, written down at the gate so nobody has to infer it
    -- from the key: at most one standing machine-posted charge per (client, overlapping calendar,
    -- account, side) is the designed grain [round 8]. Two templates that genuinely accrue
    -- different things but SHARE an account -- audit fees and legal fees, both crediting one
    -- "Accruals" code -- ARE refused here, deliberately: the books record two charges on that
    -- code and no reader, human or machine, can attribute them afterwards. The professional's
    -- remedy is a distinct accrual account per liability class, and under the round-8
    -- intersection test it is actually SUFFICIENT -- under round 7's equality key, distinct codes
    -- on the debit side alone still left the shared accrual carrying both charges and the gate
    -- said nothing.
    --
    -- ...AND IT IS OFFERED WITH THE MEASUREMENT BESIDE IT, WHICH IS ROUND 10's REPAIR OF ROUND
    -- 9's REPAIR OF ROUND 8's SENTENCE. "Give this template distinct account codes" clears THIS
    -- gate in every case -- and on a [WDB-G13] EDIT it clears it by booking the charge a second
    -- time on fresh codes while the retired generation's entry stays standing on the old ones
    -- (measured, probe y1/p1-reclass.mjs: five months, RM30,000 against an RM15,000 intention).
    -- Round 9 answered that by CONDITIONING the clause on the standing writer's template status
    -- -- prohibiting the act, and asserting "it is the generation this one replaces". Round 10
    -- measured that assertion wrong in both directions, each with money: on a retired SIBLING the
    -- prohibition forbade the correct act and the one remaining instruction erased RM6,000 of a
    -- legitimate audit accrual (z1/p1-retired-sibling.mjs, z1/p1b-follow-the-only-remedy.mjs),
    -- and on the natural propose-then-retire ORDER the status read `live` and reprinted the
    -- doubling instruction anyway (z1/p5-order-bypass.mjs: RM18,000 against RM6,000, blocked:[]).
    --
    -- SO THE SENTENCE NOW NEITHER ASSERTS NOR PROHIBITS WHAT ONLY LINEAGE CAN PROVE. Three
    -- clauses, each keyed on something the books can actually show:
    --   1. correct the standing entry in its own period, with the verb the door named -- ALWAYS
    --      offered, unchanged;
    --   2. give this template distinct account codes -- ALWAYS offered as an ACT, because it is
    --      lawful and, on the designed audit-fee/legal-fee collision, it is the CORRECT act
    --      (measured: 401 books both months clean, every figure right, nothing doubled);
    --   3. ...carrying the CAUTION whenever this client has a sibling template whose shape
    --      collides with this one AND which already has standing charges -- naming that sibling,
    --      its status, how many periods it carries and which. The consequence is stated
    --      conditionally ("IF this template replaces that one, ...") because the professional is
    --      the only party who knows whether it does, and this file has no state that can.
    -- The census is clara._wdb_overlapping_siblings -- ONE body, consulted here, at the
    -- template_line_ineligible refusal below (the cross-family re-cut road) and at
    -- clara.propose_adjustment_template, so the three doors that promise this outcome cannot
    -- drift (WDB-R2).
    --
    -- ...AND WHERE THE LINEAGE IS RECORDED, THE CAUTION BECOMES AN ASSERTION [round 10, lane P1;
    -- the OWNER took option (b) on 2026-08-04]. The three clauses above are what this file can say
    -- when it is GUESSING at lineage. It no longer always has to: a professional who declares
    -- `p_replaces` at propose writes an immutable edge, and where that edge reaches a generation
    -- with charges still standing, clause 3 stops being conditional -- the refusal says "this
    -- template REPLACES that one", FORBIDS the distinct-codes act, and offers the two acts that do
    -- not double (correct the standing entry; or start the replacement after that generation's
    -- last charged period). The discriminant is the recorded edge and NOTHING ELSE -- never the
    -- status, never the shape, never which member of the window the scan reached first -- which is
    -- what makes it immune to the click order that defeated round 9. The walk is
    -- clara._wdb_template_ancestry (ONE body, shared with propose's validation, WDB-R2), and the
    -- fallback when no edge exists is lane O1's caution, VERBATIM and permanently reachable: every
    -- template proposed without a declaration lands there.
    --
    -- THE SENTENCE NAMES THE COLLIDING CODES. `colliding_elements` comes off the gate's own
    -- membership derivation (clara._wdb_shape_overlap), so "these collide" is always accompanied
    -- by "on WHAT" -- with three-line templates there are up to three candidate codes to re-cut
    -- and a reader who is not told which one cannot follow the remedy at all.
    --
    -- THE FIRST CLAUSE NAMES THE VERB THE GATE WAS TOLD, NOT ONE THIS BODY GUESSED (round 7,
    -- WDB-R2; round 8 moved the derivation into clara._adj_correction_door so the run-receipt
    -- card and this refusal cannot drift). Round 6 hard-coded clara.reverse_entry here, and for a
    -- [WDB-G13] edit of an AUTO-REVERSE template (the commonest case this gate fires on) that
    -- verb refuses CLR39 adjustment_pair_locked: the refusal handed the reader a door that
    -- refuses them. Where the door body names a wall it cannot translate into a verb -- including
    -- pair_already_active, the SECOND walled corridor, found inside round 7's own repair -- the
    -- sentence says so instead of inventing one.
    -- THE jsonb_typeof GUARD IS NOT DECORATION. `colliding_elements` is to_jsonb(text[]), and a
    -- NULL array serialises to the jsonb SCALAR `null` (which the p_shape-is-null read produces),
    -- on which jsonb_array_elements_text raises 22023. A cast or an extraction that can throw
    -- inside a refusal path turns a diagnosis into an error -- the same argument the gate's own
    -- regex-not-cast handler carries.
    v_collide := coalesce(nullif(array_to_string(
      array(select jsonb_array_elements_text(
        case when jsonb_typeof(v_corr_breach -> 'colliding_elements') = 'array'
             then v_corr_breach -> 'colliding_elements' else '[]'::jsonb end)), ', '), ''),
      'these accounts');
    v_remedy := case
      when (v_corr_breach ->> 'correction_verb') is not null then
        'Correct entry ' || (v_corr_breach ->> 'correction_entry') || ' within its own period with '
        || (v_corr_breach ->> 'correction_verb')
        || ' (a correction of a period-dated posting is now dated with the entry it corrects)'
      else
        -- THE WALL'S OWN SENTENCE RIDES WITH ITS TOKEN [round 10, Codex finding 1]. This
        -- clause used to end at "so clear that first", which names a token and no act: when
        -- the wall is the advance register's (a run whose halves move a code that has since
        -- been enrolled as a staff advance), "clear that first" is not something a bookkeeper
        -- can do without being told WHAT. `correction_wall_advice` is composed by the body
        -- that OWNS the wall and is carried through clara._adj_correction_door untouched, so
        -- this sentence can only ever say what that body actually says -- never a second
        -- opinion of it (WDB-R2).
        'Entry ' || (v_corr_breach ->> 'correction_entry')
        || ' cannot be corrected directly (' || coalesce(v_corr_breach ->> 'correction_wall', 'blocked')
        || ')'
        || coalesce(': ' || (v_corr_breach ->> 'correction_wall_advice'), '')
        || ', so clear that first' end;
    -- THE SECOND CLAUSE, AND THE MEASUREMENT THAT RIDES IT WHEN THERE IS ONE. The census is
    -- asked ONCE and both the sentence and the machine payload are built from that one answer,
    -- so "why was I cautioned" and "which templates were you looking at" can never disagree.
    -- Siblings with NOTHING standing are dropped here rather than inside the census: a template
    -- that has never posted (or whose occurrences are all corrected) cannot leave a charge behind
    -- a re-cut, and cautioning about it would be the unearned assertion this round deleted.
    -- THE RECORDED LINEAGE IS ASKED FIRST, AND IT OUTRANKS THE CENSUS [round 10, lane P1; the
    -- OWNER's option (b), ruled 2026-08-04]. The census can only ever say "these collide and this
    -- much stands under them"; clara.adjustment_templates.replaces_template_id says "and THAT one
    -- is the generation I replace", because the professional declared it at propose and the column
    -- is immutable. Where the declaration reaches the standing charge in the way, the sentence
    -- below stops cautioning and states it -- which is the whole difference between round 10's
    -- honest minimum and a gate that can actually stop the double.
    --
    -- THE ANCESTORS ARE TAKEN AS TEXT because the two sources speak different types: the census
    -- returns `template_id` as a jsonb string and clara._wdb_rerun_breach carries
    -- `standing_template_id` as the raw stamp text (which may be MALFORMED -- that is the whole
    -- point of the regex-not-cast reader at the v_met branch). Comparing as text can never raise
    -- 22P02 inside a refusal path; casting could, and a diagnosis that turns into an error is the
    -- defect this file guards against in four other places.
    v_anc := clara._wdb_template_ancestry(p_client, p_template);
    select coalesce(array_agg(a #>> '{}'), '{}'::text[]) into v_anc_ids
      from jsonb_array_elements(v_anc -> 'ancestors') as t(a);
    -- [R11 FIX 2026-08-04] IS THE ENTRY IN THE WAY ONE OF MINE TO REPLACE? Compared as TEXT, never cast:
    -- `standing_template_id` is the raw recurring_adjustment stamp and may be malformed, which is
    -- the whole reason the gate's own reader is a regex. A NULL stamp (an unattributable charge)
    -- coalesces to FALSE -- a charge these books cannot attribute to any template cannot be
    -- attributed to an ANCESTOR either, which is the same rule the census rows already follow.
    v_blocker_is_ancestor := coalesce(
      (v_corr_breach ->> 'standing_template_id') = any (v_anc_ids), false);

    -- THE CENSUS ROWS, EACH CARRYING THE LINEAGE FACT ABOUT ITSELF. `replaced` is reported on
    -- every candidate (never omitted on the false ones -- a key a reader has to test for existence
    -- before trusting is a key they will one day forget), and it is what lets a surface render
    -- "the generation you replace" and "a sibling that merely collides" as the different things
    -- they are. The unattributed row's `template_id` is jsonb null, and `null = any(...)` is NULL,
    -- so it is coalesced to FALSE explicitly: a charge these books cannot attribute to any
    -- template cannot be attributed to an ANCESTOR either.
    select jsonb_agg(e || jsonb_build_object('replaced',
             coalesce((e ->> 'template_id') = any (v_anc_ids), false))
             order by (e ->> 'standing')::int desc, e ->> 'template_id') into v_pred
      from jsonb_array_elements(
             clara._wdb_overlapping_siblings(p_client, p_template, v_shape)) as t(e)
     where (e ->> 'standing')::int > 0;

    -- WHICH RECORDED GENERATIONS A RE-CUT WOULD PROVABLY DOUBLE. Two sources, unioned, and the
    -- union is what makes the answer ORDER-INDEPENDENT -- the defect round 9 died of:
    --   (a) any colliding sibling with standing charges that is a recorded ancestor. Not "the one
    --       the refusal happens to name": which member of the window the scan reached first is an
    --       artefact of `order by posting_date, id`, and a prohibition that switches off because a
    --       different row sorted first is round 9's status snapshot wearing a new hat.
    --   (b) the writer of the entry this refusal NAMES, when that writer is a recorded ancestor --
    --       even if the census counted 0 for it. The census counts role='occurrence' only (its
    --       money argument is at clara._wdb_template_standing_charges), so an ancestor whose
    --       standing member here is its auto-reversal MIRROR would otherwise slip out of the set
    --       while its money is demonstrably standing in this very window. That is the mirror arm
    --       of Z1's probe 2, and it needs no separate branch -- only this second term.
    -- [R11 FIX 2026-08-04 -- W1 finding 2, HIGH] TERM (a) IS KEYED ON THE MONEY THIS TEMPLATE CAN
    -- ACTUALLY REACH. It used to admit any colliding ancestor with `standing > 0` counted over ALL
    -- PERIODS, with no reachability predicate anywhere -- and clara._wdb_template_standing_charges
    -- has none either, by design. MEASURED (probe w1d-period-blind-assert.mjs): gen1 charged
    -- 2026-01 and 2026-02 and was retired; gen2 honestly DECLARED it and started 2026-05-01 --
    -- FORWARD-ONLY, after gen1's last charged period, the lawful edit this file's own note calls
    -- safe. The 2026-05 run collided with a genuinely SEPARATE live template on a shared accrual
    -- code (the designed grain this file documents), and the refusal ASSERTED that gen2's distinct
    -- codes "would book 2026-01 .. 2026-02 a SECOND time". False: gen2 starts 2026-05-01 and can
    -- never book them. Following the forbidden act was measured CORRECT to the sen; following the
    -- FIRST remedy erased RM900 of an unrelated legitimate accrual, permanently.
    -- THE WINDOW IS THE TEMPLATE'S OWN, not this period's: the assertion's claim is "distinct codes
    -- would re-charge periods that generation carries", and the periods this template could ever
    -- re-charge are exactly [start_date, coalesce(end_date, the far horizon)]. Asking the same
    -- authority admission predicate (5) asks, with a wider window, is what keeps the wall and the
    -- sentence from ever disagreeing about whose money is in the way (WDB-R2).
    -- TERM (b) NEEDS NO PREDICATE and gets none: it names the writer of the entry THIS refusal is
    -- raised on, which is in this period by construction.
    v_repl_win := clara._wdb_replaced_generation_standing(p_client, p_template,
                    t.start_date, coalesce(t.end_date, date '9999-12-31'));
    select array_agg(distinct x order by x) into v_repl_ids
      from unnest(v_anc_ids) x
     where x = (v_corr_breach ->> 'standing_template_id')
        or exists (select 1 from jsonb_array_elements(coalesce(v_pred, '[]'::jsonb)) as t(e)
                    where (e ->> 'template_id') = x
                      and coalesce((e ->> 'replaced')::boolean, false)
                      and exists (select 1 from jsonb_array_elements(v_repl_win) as t2(g)
                                   where (g ->> 'template_id') = x));
    -- THE UN-NAMED ROW GETS A SENTENCE OF ITS OWN [round 10, Codex finding 3]. The census's
    -- second term reports standing charges no template of this client can claim, with
    -- `template_id` NULL -- and `'template ' || NULL` is NULL, which string_agg DROPS, so the
    -- caution would have gone silent on exactly the case it was widened for. The two spellings
    -- are branch-distinct here rather than papered over with a coalesce: "some template you can
    -- go and look at" and "a charge whose writer these books cannot identify" are different
    -- facts and a professional has to be able to tell them apart.
    select string_agg(
             case when (e ->> 'template_id') is null
               then 'a standing charge these books cannot attribute to any template of this '
                    || 'client (its recurring_adjustment stamp names none)'
               else 'template ' || (e ->> 'template_id') || ' ("' || (e ->> 'name') || '", '
                    || (e ->> 'status') || ', ' || (e ->> 'containment') || ' shape)' end
             || ' already carries ' || (e ->> 'standing') || ' standing charge(s) for '
             || coalesce(e ->> 'first_period', 'an unstated period') || ' .. '
             || coalesce(e ->> 'last_period', 'an unstated period'), '; ')
      into v_pred_txt
      from jsonb_array_elements(coalesce(v_pred, '[]'::jsonb)) as t(e);
    -- THE ASSERTED SENTENCE'S OWN FACTS [round 10, lane P1]. Built with a LEFT JOIN rather than
    -- from the census alone, because term (b) above can name a generation the census dropped (a
    -- standing MIRROR): that arm gets the honest shorter phrase -- "wrote the standing charge named
    -- above" -- instead of a fabricated count. The period bound is the max over the replaced
    -- generations under collate "C" (ISO text, the same collation every other comparison of these
    -- stamps uses), and it is the date a replacement may start after without re-charging anything.
    if v_repl_ids is not null then
      select string_agg(
               'template ' || x
               || coalesce(' ("' || (c.e ->> 'name') || '", ' || (c.e ->> 'status') || ', '
                           || (c.e ->> 'containment') || ' shape)', '')
               || case when c.e is null then ', which wrote the standing charge named above'
                       else ', which already carries ' || (c.e ->> 'standing')
                            || ' standing charge(s) for '
                            || coalesce(c.e ->> 'first_period', 'an unstated period') || ' .. '
                            || coalesce(c.e ->> 'last_period', 'an unstated period') end,
               '; ' order by x)
        into v_repl_txt
        from unnest(v_repl_ids) x
        left join lateral (select e from jsonb_array_elements(coalesce(v_pred, '[]'::jsonb)) as t(e)
                            where (e ->> 'template_id') = x) c on true;
      -- [R11 FIX 2026-08-04 -- W1 finding 2] THE BOUND IS THE MAX OVER THE GENERATIONS THIS REFUSAL
      -- ACTUALLY ASSERTS ON, not over every replaced candidate the census returned. Under the old
      -- form `start_after_replaced_generation` was measured VACUOUS in the finding's own scenario:
      -- it printed 2026-02-28 at a template that already started 2026-05-01, so the "other act
      -- that does not double" was an act the professional had already taken. It is also taken
      -- from clara._wdb_template_standing_charges rather than from the census row, because the
      -- date a replacement may safely start after is the generation's LAST CHARGE, full stop --
      -- an in-window bound would name a date that still re-charges the months after it.
      -- THE CAST IS SAFE HERE AND NOWHERE ELSE IN THIS BODY: v_repl_ids is a subset of v_anc_ids,
      -- which comes from the ancestry walk's own uuid rows -- never from a recurring_adjustment
      -- STAMP, which may be malformed and which this file therefore only ever compares as text.
      select max((clara._wdb_template_standing_charges(p_client, x::uuid) ->> 'last_period')
                 collate "C") into v_repl_last
        from unnest(v_repl_ids) x;
    end if;
    -- THREE SPELLINGS OF THE SECOND CLAUSE, ONE PER STATE OF WHAT THIS FILE ACTUALLY KNOWS.
    --   * NOTHING COLLIDING STANDS -> offer the act plainly (round 8's sentence, untouched).
    --   * SOMETHING STANDS AND MIGHT BE A PREDECESSOR -> offer the act WITH the measurement and a
    --     CONDITIONAL consequence (round 10 lane O1's caution, kept verbatim: it is what the books
    --     can prove and no more, and it is the branch every template proposed before this column
    --     existed will always land on).
    --   * A RECORDED GENERATION THIS TEMPLATE REPLACES HAS CHARGES STANDING -> ASSERT and FORBID.
    --     This is the one branch round 9 reached for and had no state to earn: the doubling is not
    --     a possibility here, it is arithmetic -- the professional declared the lineage, the
    --     declaration is immutable, and fresh codes would re-charge every period that generation
    --     already carries while its charge stays where it is.
    -- THE PROHIBITION IS NOT A DEAD END, and this file may not let it be one (the walled-corridor
    -- class, the ladder's most-repeated defect): the sentence carries TWO acts that do not double
    -- -- correct the standing entry in its own period (clause 1, the verb the door named, printed
    -- above), and start the replacement after the last period that generation charged. Both are
    -- acts a professional can take today with the verbs they already hold.
    --
    -- ...AND A THIRD, WHICH IS THE ONE ROUND 9's GHOST COMES BACK THROUGH IF IT IS LEFT OUT.
    -- Round 9 forbade a lawful act on a lineage the SYSTEM inferred wrongly. This branch forbids
    -- it on a lineage the PROFESSIONAL declared -- and a professional can be wrong too. Work the
    -- z1/p1 scenario with one slip: the retired AUDIT template is declared as the predecessor of a
    -- genuinely separate LEGAL-fee template. The assertion is then false in exactly round 9's way,
    -- the distinct-codes act (which here is the CORRECT one -- measured, x42.r10p1e) is forbidden,
    -- and the two acts above are useless: correcting the standing entry destroys a legitimate
    -- audit accrual, and starting later does not give the legal fee the months it is owed. The
    -- declaration is IMMUTABLE, so there is no un-declaring it, and a corridor whose only exits
    -- are wrong is the defect family this ladder exists to kill. So the sentence NAMES THE
    -- RECOVERY: retire this template and propose it again without naming a predecessor. That act
    -- is available (the run was refused, so no occurrence draft is outstanding to block the
    -- retire; the retired row frees its content_hash slot, so the identical proposal is admitted),
    -- it restores lane O1's caution branch with both acts offered, and it leaves BOTH declarations
    -- in the audit trail rather than editing a claim in place. Celled end-to-end, with the four
    -- balances asserted after the recovery: x42.r10p1h.
    --
    -- WHAT THIS PROHIBITION IS NOT, STATED PLAINLY RATHER THAN LEFT TO BE DISCOVERED [round 10,
    -- lane P1; probe p1/probes/pA-lineage-assert.mjs]. It is a SENTENCE, not a wall. A
    -- professional who reads it and re-cuts anyway -- proposing a THIRD template on free codes,
    -- declaring the same predecessor -- is not stopped: that template's shape is disjoint from the
    -- standing charges, clara._wdb_rerun_breach is keyed on shape intersection, and the four
    -- already-charged months run as ordinary catch-up drafts (MEASURED on this rig: EXPA 1,200,000
    -- standing plus EXPB 600,000 booked, against a 600,000 intention). Closing THAT needs a
    -- membership term keyed on the recorded lineage rather than on the shape, which is a NEW
    -- admission law with its own refusal token, its own blocked[] word and its own surface gloss --
    -- an adjudication, not a fix lane's call. It is recorded here, at the sentence that names the
    -- act, so the next reader inherits a measurement instead of a surprise. What was measured and
    -- REJECTED as the cheap version: folding the ancestors' accounts into the shape this gate is
    -- asked about. It is over-broad in a way that parks healthy templates -- a lawful FORWARD-ONLY
    -- re-code (a replacement on fresh codes starting after the predecessor's last period) would be
    -- refused whenever any unrelated template happens to charge the predecessor's OLD accounts in
    -- a period the replacement covers, and a shape argument cannot say "only for the periods that
    -- generation actually charged".
    v_remedy := v_remedy || case
      when v_repl_txt is not null then
        '. Do NOT give this template distinct account codes: this template was PROPOSED AS THE '
        || 'REPLACEMENT FOR ' || v_repl_txt || ' -- that lineage is RECORDED on this template '
        || '(replaces_template_id, declared at propose and immutable since), not inferred -- so '
        || 'distinct codes would book those periods a SECOND time while that charge stays standing '
        || 'on ' || v_collide || '. '
        -- [R11 FIX 2026-08-04 -- W1 finding 2 (the remedy[0] half) and finding 4] CLAUSE 1 AND CLAUSE 2
        -- ARE NO LONGER COMPOSED AS IF THEY CONCERNED THE SAME MONEY. The entry clause 1 names is
        -- whichever standing charge blocks THIS period; the generation clause 2 asserts on is
        -- whichever ancestor this template declared. MEASURED (probe w1f-corridor-exits.mjs): on a
        -- shared accrual code those are DIFFERENT templates, the first machine remedy named an
        -- entry belonging to an unrelated LIVE template, and following it erased RM900 of a
        -- legitimate accrual and left that template's own period refused forever. So when the
        -- blocker is not an ancestor, the sentence says so instead of implying that correcting a
        -- stranger's entry is the act this prohibition calls for.
        -- AND THE REOPEN PROMISE IS CONDITIONAL ON THE CENSUS. "Correct the entry named above and
        -- this period reopens by itself" was made unconditionally; MEASURED (probe w1h-promise.mjs)
        -- with two standing charges that collide with this shape on DIFFERENT elements, the first
        -- correction did not reopen the period and the refusal made the same promise again about
        -- the second. The payload already carried both rows -- only the sentence lied -- so the
        -- count is read from it rather than promised away.
        -- THE TAIL CLAUSE KEEPS ITS EXACT CANONICAL SHAPE ("; the only other act that does not
        -- double them is a replacement starting after <date>") -- only the clause BEFORE it moves.
        -- Cell x42.r10p1a pins that sentence verbatim, and a fix that re-punctuated a contract
        -- test's subject while repairing a different clause would be a delta nobody adjudicated.
        || case
             when not v_blocker_is_ancestor then
               'The entry named above was written by a template this one does NOT replace, so '
               || 'correcting it is not what this prohibition asks of you -- it is somebody '
               || 'else''s charge standing in your way and has to be dealt with on its own terms; '
               || 'what this prohibition is about is the generation named here'
             when jsonb_array_length(coalesce(v_pred, '[]'::jsonb)) > 1 then
               'Correct the standing entry named above -- and measure before you expect the '
               || 'period back: ' || jsonb_array_length(coalesce(v_pred, '[]'::jsonb))::text
               || ' colliding templates carry standing charges here, so this period reopens only '
               || 'once every one of them is corrected'
             else 'Correct the standing entry named above and this period reopens by itself'
           end
        || '; the only other act that does not double them is a replacement starting '
        || 'after ' || coalesce(v_repl_last, 'the last period that generation charged')
        || '. If this template does NOT in fact replace that generation, retire it '
        || '(clara.retire_adjustment_template) and propose it again without naming a predecessor: '
        || 'a recorded lineage is a claim about these books and is corrected by making it again, '
        || 'never by editing it.'
      when v_pred_txt is null then ', or give this template distinct account codes.'
      else ', or give this template distinct account codes -- BUT MEASURE FIRST: ' || v_pred_txt
        || '. IF this template replaces that one, distinct codes would book those periods a '
        || 'second time while that charge stays standing on ' || v_collide
        || ': reverse those charges first, or keep these codes and correct the standing entry '
        || 'named above. If the two templates genuinely accrue different things (the same '
        || 'accrual code for two liabilities), distinct codes is the right act.' end;
    raise exception 'period % .. % already carries an approved posting on % (entry %, dated %) booked under another authority; a second one would leave the figure standing twice. %', v_ps, v_pe, v_collide, v_corr_breach ->> 'entry_id', v_corr_breach ->> 'posting_date', v_remedy
      using errcode = 'CLR38',
        detail = (jsonb_build_object('reason', 'period_shape_already_met',
          'template_id', p_template, 'period_start', v_ps, 'period_end', v_pe,
          'account_shape', to_jsonb(v_shape),
          -- THE MACHINE KEY IS THE COMPOSED REMEDY, BRANCH-DISTINCT (round 10, ABI delta). It
          -- was the scalar `correct_the_standing_entry_in_period` in BOTH round-9 branches, so
          -- no consumer could ever learn that a second act was offered -- or withheld. It is now
          -- the ORDERED LIST of the acts the sentence actually offers: clause 1's token is kept
          -- verbatim and is always first, and the second element says which spelling of the
          -- distinct-codes act was printed. `predecessor_candidates` carries the facts the
          -- caution was composed from, so a surface can render them without re-deriving them.
          -- [round 10, lane P1] Position 2 stays what lane O1 defined it to be -- WHICH SPELLING of
          -- the distinct-codes clause was printed -- and gains its third value,
          -- `distinct_codes_forbidden_replaced_generation`, for the branch where the act is
          -- refused by grammar. A THIRD element joins ONLY on that branch, because on that branch
          -- the sentence offers a second act (start the replacement after the replaced
          -- generation's last charged period) and a machine list that hid an act the human
          -- sentence offers is exactly the drift O1's defect was, one round on.
          'remedy', jsonb_build_array('correct_the_standing_entry_in_period',
            case when v_repl_txt is not null then 'distinct_codes_forbidden_replaced_generation'
                 when v_pred_txt is null then 'distinct_codes'
                 else 'distinct_codes_with_predecessor_caution' end)
            || case when v_repl_txt is not null
                    then jsonb_build_array('start_after_replaced_generation',
                                           're_propose_without_predecessor')
                    else '[]'::jsonb end,
          'predecessor_candidates', coalesce(v_pred, '[]'::jsonb),
          -- THE PROOF, SEPARATELY MACHINE-READABLE. `replaced_generations` is the subset of this
          -- template's RECORDED ancestry that the refusal proved has charges standing -- the facts
          -- the prohibition rests on, so a consumer can render or audit the prohibition without
          -- re-deriving it (and, when it is empty, can see that the caution branch was a caution
          -- and not a hidden assertion). `lineage_truncated` says the upward walk stopped before a
          -- root: unreachable through these verbs (propose refuses to extend a chain to the cap),
          -- so a true here is a forged or restored register and worth a census of its own. Both
          -- keys are ALWAYS present -- empty array, false -- for this file's stable-shape rule.
          'replaced_generations', to_jsonb(coalesce(v_repl_ids, '{}'::text[])),
          'lineage_truncated', coalesce((v_anc ->> 'truncated')::boolean, false))
          || v_corr_breach)::text;
  end if;
  if v_corr_breach is not null then
    raise exception 'period % .. % cannot be run again: entry % is dated % but its correction is dated %, so the period''s own balance never cleared and re-running it would leave the figure standing twice. This period must be finished by hand; retire this template (clara.retire_adjustment_template) to stop it being proposed.', v_ps, v_pe, v_corr_breach ->> 'entry_id', v_corr_breach ->> 'posting_date', coalesce(v_corr_breach ->> 'correction_posting_date', 'nothing -- the half is still standing un-corrected')
      using errcode = 'CLR38',
        detail = (jsonb_build_object('reason', 'period_correction_unsound',
          'template_id', p_template, 'period_start', v_ps, 'period_end', v_pe,
          'remedy', 'retire_adjustment_template')
          || v_corr_breach)::text;
  end if;

  -- (5) THE PERIOD IS NOT ONE A GENERATION THIS TEMPLATE REPLACES HAS ALREADY CHARGED
  -- [R11 FIX 2026-08-04 -- as-built ladder round 11; W1 finding 1 HIGH, Codex r11 finding 1 HIGH].
  --
  -- THIS IS THE WALL THE SENTENCE WAS NOT. The prohibition one screen down is a SENTENCE inside
  -- the shape gate's refusal, and this file said so in as many words: "a professional who reads it
  -- and re-cuts anyway ... is not stopped: that template's shape is disjoint from the standing
  -- charges, clara._wdb_rerun_breach is keyed on shape intersection, and the four already-charged
  -- months run as ordinary catch-up drafts". Round 11 MEASURED both halves of that note as live
  -- money -- RM18,000 of expense against an RM6,000 intention, declared and undeclared alike, with
  -- warnings [] and blocked [] -- and the owned adjudication ruled the sentence insufficient. The
  -- note also named what the fix must be ("a membership term keyed on the recorded lineage rather
  -- than on the shape ... a NEW admission law with its own refusal token, its own blocked[] word
  -- and its own surface gloss -- an adjudication, not a fix lane's call"). It was adjudicated, and
  -- this is it, with all three of those pieces.
  --
  -- IT IS ADDITIVE AND LAST, exactly as (4) was: the window / period_already_met /
  -- occurrence_draft_outstanding trio and the re-run gate keep their pinned order, wording and
  -- precedence to the character (round 4 measured three regressions in this body's admission law
  -- and the lesson was to add beside, never to reorder). Being last also makes its blast radius
  -- exactly what it should be: where the shape gate already refuses -- every [WDB-G13] edit that
  -- keeps its accounts -- the reader still gets (4)'s refusal with its remedy grammar, unchanged.
  -- What reaches HERE is the case nothing else could see: the RE-CODE, whose shape is disjoint by
  -- construction.
  --
  -- IT SITS ABOVE THE ELIGIBILITY RE-DERIVATION for (4)'s own reason, restated: a period that
  -- cannot lawfully be run at all must not be reported as an ACCOUNT problem, and
  -- clara._adj_oldest_unmet_period asks the two in exactly this order so the verb and the oracle
  -- can never name different reasons for one period.
  --
  -- WHAT IT CANNOT DO, STATED SO NOBODY EXPECTS IT TO. It keys on the RECORDED edge and nothing
  -- else -- never the status, never the shape, never the click order (that immunity is the whole
  -- point of round 10's column). A professional who declares nothing gets no wall here; what
  -- reaches them is propose's term (c) advisory, at the door where the start date is still one
  -- edit from being right. That asymmetry is deliberate and it is why BOTH were built: a wall
  -- that guessed at lineage would be round 9's defect a third time.
  --
  -- THE FALSE-POSITIVE PROOF THAT MAKES IT SAFE TO BUILD (W1 probe w1b-lawful-recode.mjs, both
  -- lawful re-code roads, measured): (1) FORWARD-ONLY -- gen1 charged 2026-03/04, gen2 declared
  -- and starting 2026-05 -- both months RAN and the books are exactly right, because gen1's
  -- standing periods do not overlap the periods gen2 books, so this predicate does not fire;
  -- (2) CORRECT-THEN-RECUT -- reversing gen1's occurrences in their own periods drops its standing
  -- count to zero, after which the disjoint re-cut books every month exactly once. Every lawful
  -- re-code is already covered by acts the professional holds today, and this wall parks neither.
  v_repl_std := clara._wdb_replaced_generation_standing(p_client, p_template, v_ps, v_pe);
  if jsonb_array_length(v_repl_std) > 0 then
    select string_agg('template ' || (g ->> 'template_id')
                      || coalesce(' ("' || (g ->> 'name') || '", ' || (g ->> 'status') || ')', '')
                      || ' carries ' || (g ->> 'standing_in_window')
                      || ' standing charge(s) in this period (entry ' || (g ->> 'entry_id')
                      || '), and last charged anything at '
                      || coalesce(g ->> 'last_period_any', 'an unstated period'),
                      '; ' order by g ->> 'template_id'),
           max((g ->> 'last_period_any') collate "C")
      into v_repl_txt, v_repl_last
      from jsonb_array_elements(v_repl_std) as t(g);
    raise exception 'period % .. % is already charged by a generation this template REPLACES, so running it would book those months a second time: %. That lineage is RECORDED on this template (replaces_template_id, declared at propose and immutable since), not inferred, and the account codes are irrelevant to it -- a replacement on fresh codes doubles the figure just as exactly as one on the same codes. Two acts do not double: correct that standing entry within its own period (the run receipt names the verb that admits it today), or retire this template and propose it again starting after %. If this template does NOT in fact replace that generation, retire it (clara.retire_adjustment_template) and propose it again without naming a predecessor -- a recorded lineage is a claim about these books and is corrected by making it again, never by editing it.', v_ps, v_pe, v_repl_txt, coalesce(v_repl_last, 'that generation''s last charged period')
      using errcode = 'CLR38',
        detail = jsonb_build_object('reason', 'replaced_generation_period_standing',
          'template_id', p_template, 'period_start', v_ps, 'period_end', v_pe,
          -- THE FACTS THE PROHIBITION RESTS ON, SEPARATELY MACHINE-READABLE, in the same two
          -- spellings the shape gate uses -- `replaced_generations` as bare ids for a consumer
          -- that only needs to know WHO, and the full rows for one that renders the measurement.
          'replaced_generations', (select coalesce(jsonb_agg(g ->> 'template_id'
                                                    order by g ->> 'template_id'), '[]'::jsonb)
                                     from jsonb_array_elements(v_repl_std) as t(g)),
          'standing_in_period', v_repl_std,
          'start_after', v_repl_last,
          'remedy', jsonb_build_array('correct_the_standing_entry_in_period',
                                      'start_after_replaced_generation',
                                      're_propose_without_predecessor'),
          'lineage_truncated', coalesce(
            (clara._wdb_template_ancestry(p_client, p_template) ->> 'truncated')::boolean,
            false))::text;
  end if;

  -- ELIGIBILITY IS RE-DERIVED AT EVERY OCCURRENCE (design SS2.1), not only at propose: an
  -- account can be deactivated, re-classed, bound to a bank account or enrolled into a
  -- register between the signature and the run. Refusing here (rather than at approve) keeps
  -- the honest state visible in the due oracle instead of minting a draft that can only die.
  v_breach := clara._adj_line_eligibility_breach(p_client, t.lines);
  if v_breach is not null then
    -- THE OTHER ROAD TO THE SAME DOUBLING, AND THE ONE ROUND 9 LEFT UNWARNED (round 10,
    -- finding 3). This refusal NAMES A REMEDY -- "retire this template and propose a corrected
    -- one" -- and a remedy that names an act is asserting something about that act's
    -- consequences (WDB-R2). MEASURED (probes z2/p5-fa-claims-template-code.mjs and
    -- z2/p6-realistic-recut.mjs, re-run on this rig): a live RM500/month accrual Dr EXPA / Cr
    -- ACCR with May and June standing (EXPA 100000, ACCR -100000); an admin binds EXPA as a
    -- fixed-asset profile's expense role on the /assets screen -- an ordinary act on another
    -- family's door, admitted silently -- and this template goes terminally blocked. The
    -- bookkeeper follows the printed remedy, and the replacement necessarily lands on FREE codes
    -- (the old one is claimed), so its shape is FULLY DISJOINT from the standing charges and
    -- clara._wdb_rerun_breach -- which is keyed on shape intersection -- cannot see them: the
    -- sweep offered May, June and July, all three arrived as ordinary catch-up drafts with
    -- blocked:[], and the books carried EXPA 100000 + EXPB 150000 against an intention of
    -- 150000. The sibling refusal above has warned about exactly this since round 9, but only
    -- inside a branch that REQUIRES an overlap to fire -- and this road is the one where an
    -- overlap is impossible by construction.
    --
    -- SO THE CAUTION RIDES HERE TOO, MEASURED, FROM THE SAME CENSUS BODY. And here it needs no
    -- lineage inference at all: the predecessor of the replacement this refusal is asking for is
    -- THIS template, by construction, so what its own standing charges are is a fact rather than
    -- a guess. It is a caution and not a refusal because retire-and-re-propose IS the right act
    -- -- there is no other -- and the periods only double if the replacement's start date reaches
    -- back over them.
    v_own := clara._wdb_template_standing_charges(p_client, p_template);
    raise exception 'template line account % is no longer eligible (%); retire this template and propose a corrected one%', v_breach ->> 'account_code', v_breach ->> 'axis',
      case when coalesce((v_own ->> 'standing')::int, 0) = 0 then ''
           else '. MEASURE FIRST: this template already carries ' || (v_own ->> 'standing')
             || ' standing charge(s) for ' || coalesce(v_own ->> 'first_period', 'an unstated period')
             || ' .. ' || coalesce(v_own ->> 'last_period', 'an unstated period')
             || '; a replacement whose start date reaches back over them re-charges those '
             || 'periods, and because the replacement must use FREE account codes it shares no '
             || 'account with these charges, so the re-run gate cannot see the double. Start the '
             || 'replacement after ' || coalesce(v_own ->> 'last_period', 'the last charged period')
             || ', or reverse those charges first.' end
      using errcode = 'CLR38',
        detail = (jsonb_build_object('reason', 'template_line_ineligible',
          'template_id', p_template,
          'standing_charges', coalesce((v_own ->> 'standing')::int, 0),
          'standing_first_period', v_own ->> 'first_period',
          'standing_last_period', v_own ->> 'last_period') || v_breach)::text;
  end if;

  -- ------------------------------------------------------------------------------------
  -- THE DRAFT (SS9.5 direct INSERT; the SS2.3 column recipe).
  -- ------------------------------------------------------------------------------------
  -- HEADERS ARE FALSE, ALWAYS [L5/3]: a template is an ORDINARY periodic adjustment.
  -- Year-end and tax-affecting adjustments are hand-draft territory in v1 -- a stated
  -- boundary -- which is what makes the template lane's CLR05 exposure amount-driven only.
  v_label := clara._adj_period_label(t.cadence, v_pe);
  v_memo := t.memo_template || ' — ' || v_label;   -- ABI SSC memo grammar (U+2014 em dash)
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      is_opening_balance, is_year_end, tax_affecting, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', v_pe, v_memo, 'scheduled_run',
      false, false, false, v_actor,
      -- THE SIGNER STAMP (the 0041 poster's law): with last_human_editor NULL,
      -- clara._approve_entry_core accepts ANY approver plus an attestation and WD-R8's
      -- distinct-checker intent would not bind at all on a machine-born high-stakes
      -- adjustment. Stamping the TEMPLATE SIGNER puts that signer on the distinct-checker arm.
      t.signed_by,
      jsonb_build_object('recurring_adjustment', jsonb_build_object(
        'template_id', p_template, 'op_key', p_op_key, 'role', 'occurrence',
        'auto_reverse', t.auto_reverse,
        -- The mirror's posting date, stated on the occurrence so /queue can disclose the
        -- pair before it exists (the [L1/24] G2 disclosure item). NULL when the template does
        -- not auto-reverse: the key stays present so the flags schema is stable, and it says
        -- honestly that no mirror is coming.
        'reversal_date', case when t.auto_reverse then v_pe + 1 end,
        'period_start', v_ps, 'period_end', v_pe)))
    returning id into v_entry;

  for r in select (x.value ->> 'account_code') as code,
                  coalesce((x.value ->> 'debit_cents')::bigint, 0) as dr,
                  coalesce((x.value ->> 'credit_cents')::bigint, 0) as cr,
                  nullif(btrim(coalesce(x.value ->> 'description', '')), '') as descr,
                  x.ord::int as n
           from jsonb_array_elements(clara._adj_period_lines(t.schedule, t.lines, v_ps, v_pe)) with ordinality as x(value, ord)
           order by x.ord loop
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description)
      values (v_entry, r.n, r.code, r.dr, r.cr, r.descr);
  end loop;

  -- EXACT EQUALITY BEFORE THE VALIDATOR (the 0041 poster's law). clara._validate_entry_lines
  -- tolerates a five-sen rounding residue and would silently route it to a rounding account;
  -- a signed template that does not balance to the sen is a defect, not a rounding event.
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0) into v_dr, v_cr
    from clara.journal_lines where entry_id = v_entry;
  if v_dr <> v_cr then
    raise exception 'the occurrence does not balance exactly (% vs %)', v_dr, v_cr
      using errcode = 'CLR07';
  end if;
  perform clara._assert_balanced(v_entry);

  -- ------------------------------------------------------------------------------------
  -- THE MODE DECISION (design SS2.3). post IFF ramp-earned AND NOT high-stakes AND NOT
  -- catch-up. All three are decided HERE, under the rung, and the answer is STAMPED into the
  -- flags [L5/8] -- the hook re-checks the stamp against the two facts that can still be
  -- true at approve (forced-draft, high-stakes) and NEVER re-derives the ramp.
  -- ------------------------------------------------------------------------------------
  -- THE UNIFIED RAMP CLOCK [L6/1 -- the round-6 money defect]. A correction on EITHER lane
  -- resets the template's clock: a COMPLETED pair reversal (auto-reverse templates) and a
  -- plain clara.reverse_entry on a SOLO occurrence (non-auto-reverse templates). Without the
  -- second term the sweep would re-post the very occurrence a human had just corrected.
  -- GREATEST ignores NULLs, so a template with only one kind of correction still reads its
  -- own clock correctly, and a template with none coalesces to -infinity.
  select coalesce(greatest(
           (select max(pr.completed_at) from clara.adjustment_pair_reversals pr
             where pr.template_id = p_template and pr.status = 'completed'),
           (select max(m.approved_at) from clara.journal_entries m
              join clara.journal_entries o on o.id = m.reversal_of
             where m.status = 'approved'
               and o.flags ? 'recurring_adjustment'
               and (o.flags -> 'recurring_adjustment' ->> 'template_id') = p_template::text
               and (o.flags -> 'recurring_adjustment' ->> 'role') = 'occurrence')),
         '-infinity'::timestamptz)
    into v_watermark;
  -- THE RAMP IS DERIVED, PER TEMPLATE, WITH NO COLUMN AND NO RECEIPT JOIN: autonomy is earned
  -- iff at least one OTHER approved, un-reversed occurrence of THIS template was approved
  -- strictly after the watermark. Occurrence #1 always drafts; a corrected period's re-run
  -- drafts; a mirror never earns (role='reversal' is excluded by the predicate itself).
  v_ramp := exists (select 1 from clara.journal_entries j
                    where j.client_id = p_client
                      and j.flags ? 'recurring_adjustment'
                      and (j.flags -> 'recurring_adjustment' ->> 'template_id') = p_template::text
                      and (j.flags -> 'recurring_adjustment' ->> 'role') = 'occurrence'
                      and j.status = 'approved' and j.reversed_by is null
                      and j.id <> v_entry
                      and j.approved_at > v_watermark);

  -- CATCH-UP OCCURRENCES ALL DRAFT [WDB-G4]. A period that had already ENDED, in Malaysia,
  -- when the template was signed is history being written -- it gets a human's eyes every
  -- time, however earned the ramp is. The boundary is strict: a period ending ON the MYT sign
  -- date was not "already ended at signing" and follows the normal ramp law [L1/E3].
  v_catch_up := (v_pe < (t.signed_at at time zone 'Asia/Kuala_Lumpur')::date);

  -- HIGH STAKES IS ASKED OF THE ENTRY, NOT RE-DERIVED. clara.is_high_stakes is the product's
  -- single definition of the term and it takes an entry id, so the stamp is a SECOND
  -- statement on the draft: `flags` is in the draft->draft allowset of
  -- clara._tf_entry_immutable (0015:1057-1059), which is exactly what that allowset is for.
  -- Re-deriving the threshold arithmetic here to fit the stamp into the INSERT would put a
  -- second copy of the high-stakes law in the file, and the copy would be the one that rots.
  v_high := clara.is_high_stakes(v_entry);
  v_mode := case when v_ramp and not v_high and not v_catch_up then 'post' else 'draft' end;
  update clara.journal_entries
     set flags = jsonb_set(flags, '{recurring_adjustment,mode}', to_jsonb(v_mode), true),
         updated_at = now()
   where id = v_entry;

  -- The revision token is read AFTER both the line inserts (t_jl_rotate_token rotates it) and
  -- the mode stamp, so the value handed to the approve core is the live one.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if v_mode = 'post' then
    -- The CLR26 open-question block or any other core refusal leaves the entry a DRAFT and
    -- the period due, honestly -- the transaction rolls back and nothing half-lands.
    perform clara._approve_entry_core(
      jsonb_build_object('actor', t.signed_by, 'firm', p_firm, 'receipt_preheld', true),
      v_entry, v_rev, null, v_approve_key);
    v_status := 'posted';
    -- The receipt and the mirror were minted by clara._adj_on_approve inside that call; the
    -- envelope reports what the hook actually wrote rather than what this verb intended.
    select ar.id, ar.reversal_entry_id, ar.amount_cents
      into v_run, v_rev_entry, v_amount
      from clara.adjustment_runs ar where ar.entry_id = v_entry;
  else
    v_status := 'drafted';
    v_amount := v_dr;
  end if;

  perform clara._audit(p_firm, v_actor, null, null, p_verb, v_entry,
    jsonb_build_object('client', p_client, 'template', p_template, 'period_start', v_ps,
      'period_end', v_pe, 'period_label', v_label, 'mode', v_mode, 'status', v_status,
      'ramp_earned', v_ramp, 'catch_up', v_catch_up, 'high_stakes', v_high,
      'amount_cents', v_amount, 'op_key', p_op_key));
  return clara._finish_op(p_firm, p_verb, p_op_key,
    jsonb_build_object('status', v_status, 'entry_id', v_entry, 'mode', v_mode)
      || case when v_run is not null then jsonb_build_object('run_id', v_run)
              else '{}'::jsonb end
      || case when v_rev_entry is not null
              then jsonb_build_object('reversal_entry_id', v_rev_entry)
              else '{}'::jsonb end);
end
$d3occ$;

CREATE OR REPLACE FUNCTION clara._adj_on_approve(p_entry uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $d3app$
declare
  e record; t record; pr record; rl record; ln record;
  v_prop jsonb; v_role text; v_ps date; v_pe date; v_mode text; v_actor uuid;
  v_attest text; v_mirror uuid; v_rev uuid; v_run uuid; v_amount bigint;
  v_want jsonb; v_have jsonb; v_breach jsonb; v_sug jsonb;
  v_derived jsonb; v_actual jsonb;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  v_prop := e.flags -> 'recurring_adjustment';
  v_role := v_prop ->> 'role';

  -- -----------------------------------------------------------------------------------
  -- (0) THE AUTO-REVERSAL MIRROR. It exists ONLY to keep arm (2) off the mirror -- nothing
  -- else. This is NOT a soft-birth exemption and must never be read as one [L4/9]:
  -- clara._fa_on_approve has already run by the time we are called, and SECTION S3's
  -- clara._adv_on_approve runs after us regardless, so nothing here could suppress a register
  -- birth even if it wanted to. The mirror's immunity is carried by SS2.1 line eligibility
  -- ALONE -- a template line is never an enrolled FA cost account and never an enrolled
  -- advance account, at propose, at every occurrence and again at axis (2g) below. An
  -- eligibility violation therefore RAISES up there; it is never skipped down here.
  -- -----------------------------------------------------------------------------------
  if v_role = 'reversal' then
    return;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (1) THE PAIR DEFENSE (design SS2.4). A pair correction is born by
  -- clara._pair_reverse_core carrying reversal_of and NO D-b flags -- which is exactly why
  -- reversal_of is the right discriminator here and why the (0)(1)(2)(3) order stands.
  --
  -- THE RECEIPT IS THE AUTHORIZATION CHANNEL [L4/1]. This hook has a one-argument signature
  -- and cannot see who called it, so the pair verbs transition their receipt into the
  -- transaction-only `approving` state BEFORE their core calls, and we refuse any pair
  -- correction whose receipt is not in it. An ordinary clara.approve_entry on one half
  -- therefore cannot break the pair apart; the remedy names the atomic verbs.
  -- -----------------------------------------------------------------------------------
  if e.reversal_of is not null then
    select * into pr from clara.adjustment_pair_reversals r
      where r.occurrence_correction_id = p_entry or r.mirror_correction_id = p_entry
      limit 1;
    if found and pr.status <> 'approving' then
      raise exception 'this draft is one half of an adjustment pair reversal and cannot be approved on its own; use clara.approve_pair_reversal (or clara.cancel_pair_reversal to abandon both halves)'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'pair_draft_locked', 'entry_id', p_entry,
            'pair_id', pr.id, 'pair_status', pr.status)::text;
    end if;
    return;
  end if;

  -- -----------------------------------------------------------------------------------
  -- (2) THE OCCURRENCE. Seven axes re-validated under the locks the approve core already
  -- holds, then the mirror, then the receipt, then the event. Same doctrine as the D-a
  -- depreciation arm: the stored proposal is a statement about a world, and if the world
  -- moved the honest answer is one named refusal whose remedy is stated.
  -- -----------------------------------------------------------------------------------
  if v_role = 'occurrence' then
    v_actor := coalesce(e.checker_actor, e.maker_actor);
    v_ps := (v_prop ->> 'period_start')::date;
    v_pe := (v_prop ->> 'period_end')::date;

    -- (2a) ORIGIN. The proposal and the origin are one fact; a recurring-adjustment proposal
    -- on a manual entry would be a forged machine post wearing a human's clothes.
    if e.origin <> 'scheduled_run' then
      raise exception 'a recurring-adjustment proposal may only ride an origin=scheduled_run entry'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'adjustment_stale', 'axis', 'origin',
            'entry_id', p_entry)::text;
    end if;

    -- (2b) THE ISSUER BINDING THAT SURVIVES THE MAKER-CHECKER GAP. A flags blob alone proves
    -- nothing about who wrote it; a durable op receipt does. clara.op_receipts carries no
    -- client column, but clara._reserve_op stores the REQUEST HASH and the poster hashes
    -- exactly (client, template, ps, pe) -- so re-deriving that hash from this entry's own
    -- client and the period the proposal names turns a firm-wide receipt lookup into an exact
    -- match on the act that minted it. A receipt belonging to a SIBLING CLIENT, a sibling
    -- template, or a sibling period no longer authenticates this proposal.
    if not exists (select 1 from clara.op_receipts r
                   where r.firm_id = e.firm_id
                     and r.fn in ('run_adjustment_occurrence', 'run_adjustment_manual')
                     and r.op_key = v_prop ->> 'op_key'
                     and r.request_hash = clara._hash(jsonb_build_object(
                           'client', e.client_id,
                           'template', (v_prop ->> 'template_id')::uuid,
                           'ps', v_ps, 'pe', v_pe))) then
      raise exception 'this adjustment proposal carries no issuer op-key receipt for this client, template and period; withdraw the draft and re-run the period'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'adjustment_stale', 'axis', 'issuer_receipt',
            'entry_id', p_entry)::text;
    end if;

    -- (2c) THE TEMPLATE IS STILL LIVE, and still this client's.
    select * into t from clara.adjustment_templates a
      where a.id = (v_prop ->> 'template_id')::uuid;
    if not found or t.client_id <> e.client_id or t.status <> 'live' then
      raise exception 'the adjustment template this occurrence names is not live for this client; withdraw the draft'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'adjustment_stale', 'axis', 'template_retired',
            'template_id', v_prop ->> 'template_id')::text;
    end if;

    -- (2d) THE LINE SET IS BYTE-EQUAL TO THE TEMPLATE'S. Templates are immutable outside
    -- their transitions, so this axis catches the OTHER direction: a draft whose lines were
    -- edited between the run and the approval. (clara.revise_entry refuses a D-b proposal
    -- draft outright -- SECTION S5 -- so this is defense in depth, and it is cheap.)
    -- F-A4 PR-2a §D3: axis (2d) resolves THE ENTRY'S OWN PERIOD rather than the flat template
    -- lines. v_ps/v_pe were read off this entry's own recurring_adjustment flags above, so the
    -- comparison is against what THIS occurrence was supposed to post. A null-schedule template
    -- resolves to the canonicalised template lines -- byte-identical to the line replaced here.
    -- (Spelled in prose: written as code, this comment would be counted by the generator's own
    -- surviving-reads assertion and would inflate it.)
    v_want := clara._adj_period_lines(t.schedule, t.lines, v_ps, v_pe);
    select coalesce(jsonb_agg(jsonb_build_object(
             'account_code', jl.account_code,
             'debit_cents', jl.debit_cents,
             'credit_cents', jl.credit_cents,
             'description', jl.description) order by jl.line_no), '[]'::jsonb)
      into v_have from clara.journal_lines jl where jl.entry_id = p_entry;
    if v_want is distinct from v_have then
      raise exception 'this occurrence''s lines no longer equal its template''s; withdraw the draft and re-run the period'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'adjustment_stale', 'axis', 'lines_changed',
            'template_id', t.id)::text;
    end if;

    -- (2e) THE PERIOD IS STILL A CADENCE PERIOD, AND IT HAS ENDED. The FY end is client data
    -- and can move between the run and the approval, which is precisely what this axis
    -- catches for an ANNUAL template. posting_date is asserted against period_end in the same
    -- axis: it is the one column of the recipe a proposal could otherwise misstate.
    if clara._adj_period_start(e.client_id, t.cadence, v_ps) is distinct from v_ps
       or clara._adj_period_end(e.client_id, t.cadence, v_ps) is distinct from v_pe
       or e.posting_date is distinct from v_pe
       or v_pe >= clara._fa_today() then
      raise exception 'the period % .. % is no longer a valid, ended % period for this client', v_ps, v_pe, t.cadence
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'adjustment_stale', 'axis', 'period_invalid',
            'cadence', t.cadence, 'period_start', v_ps, 'period_end', v_pe)::text;
    end if;

    -- (2f) THE MODE STAMP [L5/8]. The ramp is NEVER re-derived here (the sequencing law
    -- freezes it for the draft's whole life: a second run is refused while a draft is
    -- outstanding). What CAN still become true between the run and the approval is
    -- forced-draft (a template signed later than this period ended cannot happen -- signed_at
    -- is immutable -- but the predicate is re-measured anyway) and HIGH STAKES (the firm's
    -- threshold is firm data and can be lowered). A 'post' stamp under either is refused.
    v_mode := v_prop ->> 'mode';
    if v_mode is null or v_mode not in ('post', 'draft') then
      raise exception 'this occurrence carries no lawful mode stamp'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'adjustment_stale', 'axis', 'mode',
            'mode', v_mode)::text;
    end if;
    if v_mode = 'post'
       and (v_pe < (t.signed_at at time zone 'Asia/Kuala_Lumpur')::date
            or clara.is_high_stakes(p_entry)) then
      raise exception 'this occurrence was stamped for auto-posting but now requires a human checker; withdraw the draft and re-run the period'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'adjustment_stale', 'axis', 'mode',
            'mode', v_mode, 'high_stakes', clara.is_high_stakes(p_entry))::text;
    end if;

    -- (2g) LINE ELIGIBILITY -- the SEVENTH axis [L4/9], and the load-bearing one: it is the
    -- SOLE guarantee that the mirror born below cannot soft-birth a register row anywhere.
    -- The cell that proves it: enrol or reserve one of the template's accounts DURING the
    -- draft window, then approve.
    -- THE BREACH'S OWN `axis` IS RE-KEYED, NEVER MERGED OVER THE ARM'S. ABI SSF pins the
    -- arm-(2) vocabulary exactly -- axis IN origin, issuer_receipt, template_retired,
    -- lines_changed, period_invalid, mode, line_eligibility -- and jsonb `||` lets the
    -- right operand win, so a bare concat let _adj_line_eligibility_breach's finer-grained
    -- axis ('account_reserved', 'account_inactive', 'control_account', 'bank_account',
    -- 'account_unknown') CLOBBER the ABI's own token. The two axes are at different
    -- altitudes and both are worth keeping: `axis` answers "which of the seven", and
    -- `eligibility_axis` answers "which of the five conditions inside the seventh".
    -- The other two callers (propose CLR10 / poster CLR38) raise `template_line_ineligible`,
    -- for which the ABI names no axis at all, so they keep the breach's axis verbatim.
    v_breach := clara._adj_line_eligibility_breach(e.client_id, t.lines);
    if v_breach is not null then
      raise exception 'template line account % is no longer eligible to back an adjustment (%); withdraw this draft', v_breach ->> 'account_code', v_breach ->> 'axis'
        using errcode = 'CLR39',
          detail = (jsonb_build_object('reason', 'adjustment_stale', 'axis', 'line_eligibility',
            'template_id', t.id, 'eligibility_axis', v_breach ->> 'axis')
            || (v_breach - 'axis'))::text;
    end if;

    -- ---------------------------------------------------------------------------------
    -- THE MIRROR (design SS2.4; [WDB-G1] hook-born at approve, dated next-period day 1;
    -- [WDB-G2] ONE act births the approved pair).
    -- ---------------------------------------------------------------------------------
    if coalesce((v_prop ->> 'auto_reverse')::boolean, false) then
      -- THE ATTESTATION IS RE-READ AFTER THE OUTER UPDATE [L4/10]. clara._approve_entry_core
      -- stamps self_approval_attestation on the occurrence and THEN calls the subledger hook,
      -- so the value is already durable when we arrive -- but it is re-selected explicitly
      -- rather than taken from the `e` snapshot, because the whole point of the G2 one-act law
      -- under high stakes is that the occurrence's attestation is the mirror's attestation.
      select je.self_approval_attestation into v_attest
        from clara.journal_entries je where je.id = p_entry;

      -- THE 13-COLUMN RECIPE, adapted from clara.reverse_entry's mirror: the three HEADER
      -- booleans are copied VERBATIM from the occurrence so clara.is_high_stakes is provably
      -- equal on both halves and CLR05 cannot diverge across the pair [L4/10]. maker_actor and
      -- last_human_editor are the TEMPLATE SIGNER (not the checker), which keeps the
      -- distinct-checker arm binding on the mirror exactly as it binds on the occurrence.
      -- LINKAGE IS ONE-WAY [L2/4]: the mirror carries auto_reversal_of (FK, UNIQUE) and the
      -- occurrence carries no column at all -- no immutability-trigger recut, boundary clean.
      insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
          resolution_id, is_opening_balance, is_year_end, tax_affecting,
          maker_actor, last_human_editor, flags, auto_reversal_of)
        values (e.client_id, 'draft', v_pe + 1, 'Auto-reversal: ' || coalesce(e.memo, ''),
          'scheduled_run', e.resolution_id,
          e.is_opening_balance, e.is_year_end, e.tax_affecting,
          t.signed_by, t.signed_by,
          jsonb_build_object('recurring_adjustment', jsonb_build_object(
            'template_id', t.id, 'op_key', v_prop ->> 'op_key', 'role', 'reversal',
            'auto_reverse', true, 'reversal_date', v_pe + 1,
            'period_start', v_ps, 'period_end', v_pe, 'mode', v_mode)),
          p_entry)
        returning id into v_mirror;
      insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
          credit_cents, description, counterparty_id)
        select v_mirror, jl.line_no, jl.account_code, jl.credit_cents, jl.debit_cents,
               jl.description, jl.counterparty_id
        from clara.journal_lines jl where jl.entry_id = p_entry order by jl.line_no;
      perform clara._assert_balanced(v_mirror);
      select je.revision_token into v_rev from clara.journal_entries je where je.id = v_mirror;

      -- THE MIRROR FLIPS THROUGH THE CORE, PREHELD, ON THE POSTER-RESERVED KEY [L3/1]. Never
      -- a direct UPDATE to 'approved': routing through clara._approve_entry_core is what keeps
      -- the approve-path census at FOUR, restores CLR05 on the mirror, and makes the mirror's
      -- own subledger hook run exactly as a human approval's would. ANY refusal in here aborts
      -- the WHOLE approving statement, so no committed half-pair can exist -- that is the
      -- intended semantics, by construction rather than by cleanup.
      perform clara._approve_entry_core(
        jsonb_build_object('actor', v_actor, 'firm', e.firm_id, 'receipt_preheld', true),
        v_mirror, v_rev, v_attest, (v_prop ->> 'op_key') || ':mirror:approve');
    end if;

    -- ---------------------------------------------------------------------------------
    -- THE RECEIPT, MINTED AFTER THE MIRROR (design SS2.5) so reversal_entry_id is a birth
    -- fact and never an UPDATE on an immutable row [L2/18]. mode is READ FROM THE FLAGS
    -- STAMP, not re-decided: the receipt records what the poster ruled.
    -- ---------------------------------------------------------------------------------
    select coalesce(sum(jl.debit_cents), 0) into v_amount
      from clara.journal_lines jl where jl.entry_id = p_entry;
    insert into clara.adjustment_runs(firm_id, client_id, template_id, period_start,
        period_end, mode, entry_id, reversal_entry_id, amount_cents, op_key)
      values (e.firm_id, e.client_id, t.id, v_ps, v_pe, v_mode, p_entry, v_mirror, v_amount,
        v_prop ->> 'op_key')
      returning id into v_run;

    -- THE EVENT, LAST OF THE THREE (ABI SSG payload -- identifiers and figures the receipt
    -- already holds, nothing else). EVENT ORDER IS LAW AND IT IS STRUCTURAL: the mirror's
    -- events were emitted inside the core call above, this one is emitted here, and the
    -- OCCURRENCE's own entry.approved is emitted by the outer clara._approve_entry_core only
    -- after this hook returns. So the mirror's events precede the occurrence's, always, with
    -- no ordering code anywhere.
    perform clara._append_event(e.firm_id, 'adjustment.posted', e.client_id, v_actor,
      null, null, p_entry, null, null,
      jsonb_build_object('template_id', t.id, 'run_id', v_run,
        'period_start', v_ps, 'period_end', v_pe, 'amount_cents', v_amount,
        'reversal_entry_id', v_mirror));
  end if;

  -- -----------------------------------------------------------------------------------
  -- (3) THE BANK-RULE SUGGESTION (design SS5). Hosted HERE rather than as a fifth splice:
  -- the approve-time re-validation of a suggestion draft is the same kind of act as arm (2)
  -- and adding a splice would move the hook-caller census for no gain [L4/9].
  --
  -- SIX axes, one token (suggestion_stale) with a named axis -- the design's five plus the
  -- ROLE-ELIGIBILITY axis the as-built ladder ruled in (round 2). The draft's own legs are
  -- re-derived from the LIVE line and the LIVE rule through clara._wdb_suggestion_lines --
  -- the same body clara.accept_bank_rule_suggestion mints from -- so "the rule still says
  -- this" is one definition in one place, and the accept verb and this arm can never disagree.
  -- -----------------------------------------------------------------------------------
  if e.flags ? 'bank_rule_suggested' then
    v_sug := e.flags -> 'bank_rule_suggested';
    select * into rl from clara.bank_rules br where br.id = (v_sug ->> 'rule_id')::uuid;
    if not found or rl.client_id <> e.client_id or rl.status <> 'signed'
       or rl.kind <> 'coding' then
      raise exception 'the bank rule this suggestion names is no longer a signed coding rule for this client; withdraw the draft'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'suggestion_stale', 'axis', 'rule',
            'rule_id', v_sug ->> 'rule_id')::text;
    end if;
    select l.* into ln from clara.bank_statement_lines l where l.id = (v_sug ->> 'line_id')::uuid;
    if not found or ln.client_id <> e.client_id then
      raise exception 'the statement line this suggestion names is not this client''s'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'suggestion_stale', 'axis', 'line',
            'line_id', v_sug ->> 'line_id')::text;
    end if;
    if not exists (select 1 from clara.bank_statements bs
                   where bs.id = ln.statement_id and bs.status = 'live') then
      raise exception 'the statement carrying this line is no longer live; withdraw the draft'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'suggestion_stale', 'axis', 'statement',
            'statement_id', ln.statement_id)::text;
    end if;
    -- UNMATCHED AND UN-EXCEPTED, at exactly the 0040 list_bank_line_suggestions predicate:
    -- ANY exception on the line disqualifies it (not merely an open one), because an excepted
    -- line's booking is the exception machinery's business, not a coding rule's.
    if exists (select 1 from clara.bank_match_line_members m
               where m.line_id = ln.id and m.group_status in ('pending', 'live'))
       or exists (select 1 from clara.bank_line_exceptions ex where ex.line_id = ln.id) then
      raise exception 'this statement line is now matched or excepted; withdraw the draft'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'suggestion_stale', 'axis', 'line_claimed',
            'line_id', ln.id)::text;
    end if;
    if not clara._wdb_suggestion_rule_hit(ln.id, rl.id) then
      raise exception 'this rule no longer matches this statement line; withdraw the draft'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'suggestion_stale', 'axis', 'predicate',
            'rule_id', rl.id, 'line_id', ln.id)::text;
    end if;
    v_derived := clara._wdb_suggestion_lines(e.client_id, ln.id, rl.id);
    select coalesce(jsonb_agg(jsonb_build_object(
             'account_code', jl.account_code,
             'debit_cents', jl.debit_cents,
             'credit_cents', jl.credit_cents) order by jl.line_no), '[]'::jsonb)
      into v_actual from clara.journal_lines jl where jl.entry_id = p_entry;
    if v_derived is distinct from v_actual then
      raise exception 'this draft''s legs no longer equal what the rule derives for this line; withdraw the draft'
        using errcode = 'CLR39',
          detail = jsonb_build_object('reason', 'suggestion_stale', 'axis', 'legs',
            'rule_id', rl.id, 'line_id', ln.id)::text;
    end if;
    -- THE SIXTH AXIS -- THE PROPOSED ACCOUNT IS STILL ELIGIBLE (as-built ladder round 2, the
    -- PHANTOM STAFF ADVANCE). clara.accept_bank_rule_suggestion asks this at its door, and this
    -- arm re-asks it here for the same reason it re-asks the other five: an account can be
    -- ENROLLED between the accept and the approval. A DEBIT leg on a code enrolled as a staff
    -- advance is SOFT-BIRTHED by SECTION S3's clara._adv_on_approve arm (3) -- so the register
    -- would say a named person owes the firm money they never received, while the GL, the
    -- entry and clara.staff_advance_tie all agree to the sen and no instrument fires. (An FA
    -- cost/accum/expense role is the same defect from the other family.)
    --
    -- THE SAME BODY THE DOOR READS, over the SAME account clara._wdb_suggestion_lines derives
    -- from -- the rule's own `proposal ->> 'account_code'` -- so the two sites cannot drift.
    -- The CONTRA leg ALONE is asked: the other derived leg IS this client's bank account, and
    -- clara._adj_line_eligibility_breach would refuse it on its own `bank_account` axis. The
    -- axis is LAST, deliberately: the five axes above keep their pinned precedence, and the
    -- `legs` axis immediately above has already proved this draft equals what the rule derives,
    -- so the account asked about here is provably one of the draft's own two.
    --
    -- THE BREACH'S OWN `axis` IS RE-KEYED, never merged over this arm's (the arm-(2g) idiom):
    -- `axis` answers "which of the six", `eligibility_axis` "which of the five conditions".
    v_breach := clara._adj_line_eligibility_breach(e.client_id,
      jsonb_build_array(jsonb_build_object('account_code',
        nullif(btrim(coalesce(rl.proposal ->> 'account_code', '')), ''))));
    if v_breach is not null then
      raise exception 'the account bank rule % proposes is no longer eligible to carry a coding suggestion (%); withdraw the draft', rl.id, v_breach ->> 'axis'
        using errcode = 'CLR39',
          detail = (jsonb_build_object('reason', 'suggestion_stale', 'axis', 'line_eligibility',
            'rule_id', rl.id, 'line_id', ln.id, 'eligibility_axis', v_breach ->> 'axis')
            || (v_breach - 'axis'))::text;
    end if;
  end if;
end
$d3app$;

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
-- §F — WRAPPER 12: clara.wake_establish_prepayment_schedule + its agent core (design §6.2).
--
-- THE PARK IS OVER. 0138's deviation (1) named two blockers; R6 dissolved the first (one core, not
-- two — §D) and §A/§B built the second (the DB-owned term carrier). §0 confirmed both parked
-- objects ABSENT at the moment this file began; §TAIL inverts 0138's T.9 into a presence census.
--
-- ORDINAL, SETTLED (N6): THIS VERB IS WRAPPER 12. An earlier cut of the design said 13; that was
-- wrong. close-key-1-annexes-2-record.md:33 says 12 and 0138 says 12 TWICE (:1790, :2435) while
-- numbering wake_mint_month_snapshot 13. Nothing keys on the ordinal — the allowlist and every
-- census key on the NAME — which is exactly why a wrong one can sit unnoticed. Counts are a
-- different quantity and DO move: twelve wrappers existed, this is the THIRTEENTH.
--
-- TIER DISCIPLINE, and it is the whole reason this shape looks the way it does. A RAISE inside an
-- agent core aborts the transaction AND TAKES THE RECEIPT WITH IT — a judgement act leaving no
-- trace, which is the silent-daily-log failure F-A4 exists to end. So everything below the Tier-A
-- line becomes a RUNG and a refused receipt, never a raise.
--
-- THE FIVE PRE-RUNGS (design §6.2a, review finding F3) are the delegate's own raise paths, asked
-- HERE as rungs BEFORE the delegate is called. THEY ARE COURTESIES, NOT WALLS, and this file says
-- so rather than letting a later reader assume otherwise: pre-rung (c) reads the eligibility helper
-- without the client:fa-roles leaf the delegate takes immediately before its own check, and (b)'s
-- durable half is a partial unique index — both race a concurrent writer. THE DELEGATE'S RAISE
-- REMAINS THE STRUCTURAL WALL, Tier D captures the abort, and NO CELL MAY ASSERT that the pre-rungs
-- make the raise unreachable (Annex F.3).
--
-- F2's THREE WALLS ride here (design §5.3): (1) deterministic validation of the judged account,
-- (2) the judgement receipted with its stated basis, (3) visible at the sign door — §D4's half.
-- THE MAXIM: facts get anchored, judgements get receipted. The TERM is a fact and came through §B's
-- human door; the ACCOUNT is a judgement and arrives here as an argument, validated and receipted.
-- =================================================================================================
create function clara._agent_prepayment_schedule_core(p_ctx jsonb, p_client uuid,
    p_source_entry uuid, p_target_account text, p_target_basis text, p_rationale text,
    p_model jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $agent$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_rungs jsonb; v_receipt uuid; v_sched jsonb; v_pl jsonb; v_refusal text;
  v_acct record; v_breach jsonb; v_lines jsonb; v_tmpl_sched jsonb := '[]'::jsonb;
  v_start date; v_end date; v_total bigint; v_n int; v_name text; v_memo text;
  v_hash text; v_twin uuid; v_result jsonb; v_template uuid; x jsonb; v_base bigint;
  v_sub text; v_prior_acct text; v_prior_receipt uuid; v_prior_digest text;
  v_expect_digest text; v_prior_status text;
begin
  -- ---- TIER A (raises, writes nothing) -------------------------------------------------------
  -- A receipt row needs a NON-NULL subject, and this verb's refusal subject IS the source entry.
  -- With no entry there is no subject to name and no receipt that could honestly be written, so
  -- this raises in the tier whose contract is "RAISES, writes nothing" (0138:1272-1273) rather than
  -- inventing a stand-in subject (law 2: a derived subject is not evidence of the real one).
  if p_source_entry is null then
    raise exception 'a prepayment schedule names the source entry it amortises'
      using errcode = 'CLR10', detail = '{"reason":"prepayment_source_required"}';
  end if;

  -- ---- THE OWN-KEY REPLAY, ANSWERED BEFORE ANY MUTABLE RUNG (Codex C2) -----------------------
  -- D-25 / cell B-11 make a same-task retry a REPLAY of the stored outcome. The self-twin
  -- exclusion alone did not deliver that, because it lived inside pre-rung (b) -- AFTER every
  -- MUTABLE rung. Deactivate the chosen expense account after the act and retry the same key, and
  -- F2 wall 1 refuses `prepayment_target_ineligible` before the replay is ever considered: the
  -- lane reads a FRESH REFUSAL for work that already succeeded. The world moved; the answer to a
  -- retry must not.
  --
  -- IDENTIFIED POSITIVELY, on what is already PERSISTED and IMMUTABLE -- not on a re-derivation.
  -- The delegate stamps its own sub-key into adjustment_templates.proposed_op_key, and that row's
  -- `lines` carry the judged account; both are frozen by
  -- clara._tf_adjustment_template_transition. So the twin is found by the sub-key, and the request
  -- is validated against the stored row rather than against anything recomputed from a world that
  -- may since have changed. This is the estate's own op_receipts idiom read one layer up.
  --
  -- THE REQUEST DIGEST IS COMPUTED HERE, ONCE, AND THE SAME VALUE IS BOTH COMPARED ON A REPLAY AND
  -- PERSISTED ON THE ACT. Two computations that "must agree" are a divergence waiting to happen --
  -- the whole point of an identity is that ONE expression defines it. jsonb_build_array is the
  -- encoding because it is INJECTIVE: the array's structure separates the fields, so no field's
  -- content can imitate the separator (a `|` inside a rationale is just a character), and jsonb's
  -- own text form escapes what it must. SHA-256 then does two things the encoding cannot: it makes
  -- the value FIXED-WIDTH (64 hex characters, so nothing downstream can truncate it into agreement
  -- with something else) and it supplies the COLLISION RESISTANCE the word "identity" implies. The
  -- first cut used md5 and that was a real defect, not a style point: md5's chosen-prefix collisions
  -- are practical, `p_rationale` is model-influenced text, and a comment claiming injectivity over a
  -- primitive that does not deliver it is the kind of claim law 3 exists to catch. The spelling is
  -- the estate's canonical one (:1170, :336) so there is ONE hashing idiom in this file, not two.
  v_expect_digest := encode(sha256(convert_to(jsonb_build_array(
    btrim(coalesce(p_target_account, '')), btrim(coalesce(p_target_basis, '')),
    p_rationale, p_model ->> 'name', p_model ->> 'version')::text, 'UTF8')), 'hex');

  v_sub := p_op_key || ':' || p_source_entry::text;
  select t.id, t.proposed_request_digest into v_twin, v_prior_digest
    from clara.adjustment_templates t
   where t.client_id = p_client and t.proposed_op_key = v_sub limit 1;
  if v_twin is not null then
    select (e ->> 'account_code') into v_prior_acct
      from clara.adjustment_templates t, jsonb_array_elements(t.lines) as z(e)
     where t.id = v_twin and (e ->> 'debit_cents')::bigint > 0 limit 1;
    -- THE STORED ACTED RECEIPT, read BEFORE the identity comparison, because the receipt is where
    -- the rest of the request was persisted. If it is absent the act did not complete the way a
    -- replay would be claiming it did, so this FAILS CLOSED rather than minting a fresh receipt
    -- for an old act (law 2).
    select r.id into v_prior_receipt
      from clara.agent_act_receipts r
     where r.firm_id = v_firm and r.act_kind = 'prepayment_schedule'
       and r.subject_kind = 'adjustment_template' and r.subject_id = v_twin
       and r.verdict = 'acted' limit 1;
    if v_prior_receipt is null then
      raise exception 'a template stands for this op key but its acted receipt does not'
        using errcode = 'CLR08', detail = '{"reason":"prepayment_replay_receipt_absent"}';
    end if;

    -- CHANGED ARGS UNDER THE SAME KEY ARE A REUSE REFUSAL, over the WHOLE REQUEST (Codex P2).
    -- Comparing only the target account left target_basis, rationale and model free to change and
    -- SILENTLY REPLAY -- and the basis is not incidental: it is the stated grounds of a JUDGEMENT,
    -- durable receipt content that wall 2 exists to carry. A retry that supplies different grounds
    -- for the same account is a different act, and answering it with the first one's receipt would
    -- record grounds nobody gave.
    --
    -- COMPARED DIGEST TO DIGEST -- *** AN IDENTITY MUST RIDE AN INJECTIVE, TRANSFORM-STABLE
    -- ENCODING, NEVER A DISPLAY STRING. *** This comparison used to rebuild the receipt's COMPOSED
    -- RATIONALE and compare that, which failed the rule twice over and in opposite directions:
    --   * NOT INJECTIVE -- `rationale | target account <code>: <basis>` joins on characters that can
    --     occur INSIDE the fields, so (rationale = A, basis = B∥D∥C) and (rationale = A∥D∥B,
    --     basis = C) compose to identical bytes. A genuinely CHANGED request read as the same one
    --     and REPLAYED SILENTLY -- a false ACCEPT, and worse than any false refuse because a
    --     refusal is loud and this is not.
    --   * NOT TRANSFORM-STABLE -- the receipt stores left(...,4000) (0138:1366) while B2 bounds only
    --     the RAW rationale, so a composed string near the ceiling is stored TRUNCATED and every
    --     replay compared a full string against a truncated one and false-refused. Fail-closed, but
    --     it broke the idempotency guarantee this path exists to provide.
    -- Both are one seam, so this is one wall: the digest is computed over a jsonb ARRAY (structural
    -- delimitation, so no field's content can imitate the separator) and is fixed-width (so no
    -- storage transform can shorten it). B2's raw length bound stays as the DoS guard; the
    -- receipt's composed rationale reverts to what it always should have been -- display only.
    --
    -- A NULL stored digest REFUSES, because `is distinct from` is the comparison: no template this
    -- verb wrote can carry NULL there (the INSERT sets it on the same row, in the same statement),
    -- so a NULL is a row this verb did not write and must not answer for. Law 2 -- absence is not
    -- evidence -- taken to its fail-closed branch.
    if v_prior_digest is distinct from v_expect_digest then
      raise exception 'op_key reused with different args'
        using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'op_key_reused_with_different_args',
            'template_id', v_twin, 'stored_request_digest', v_prior_digest,
            'supplied_request_digest', v_expect_digest,
            'stored_target_account', v_prior_acct,
            'supplied_target_account', btrim(coalesce(p_target_account, '')))::text;
    end if;
    -- status is READ, not asserted (native C2 nit): the twin lookup has no status filter, so a
    -- retired template's replay would otherwise report 'proposed' as a literal and lie in that one
    -- field.
    select t.content_hash, t.status into v_hash, v_prior_status
      from clara.adjustment_templates t where t.id = v_twin;
    return jsonb_build_object('status', 'acted', 'receipt_id', v_prior_receipt,
      'template_id', v_twin, 'status_of_template', v_prior_status, 'replayed', true,
      'target_account', v_prior_acct, 'content_hash', v_hash);
  end if;

  -- ---- TIER B (rungs; typed non-act receipt, no raise) ---------------------------------------
  v_rungs := clara._close_tier_b_common(p_client, p_rationale, p_model);

  -- B10 / B10' -- the evaluator derives the term and the amounts from DB-owned inputs, or refuses
  -- by name. Its refusals are RETURNED, never raised, precisely so they can land as rungs.
  if jsonb_array_length(v_rungs) = 0 then
    v_sched := clara.prepayment_schedule_v1(p_client, p_source_entry);
    v_refusal := v_sched ->> 'refusal';
    if v_refusal is not null then
      v_rungs := v_rungs || jsonb_build_array(
        jsonb_build_object('rung', case when v_refusal = 'prepayment_source_unfit' then 'B10p' else 'B10' end,
                           'token', v_refusal) || (v_sched - 'refusal' - 'schedule_version'));
    end if;
  end if;

  -- F2 WALL 1 -- DETERMINISTIC VALIDATION OF THE JUDGED ACCOUNT. The model names the account; the
  -- DB decides whether it is admissible, by the estate's OWN existing rule rather than a new one.
  if jsonb_array_length(v_rungs) = 0 then
    if p_target_account is null or btrim(p_target_account) = '' then
      -- The no-plausible-account arm, NOT the default path (design §5.3). A lane that refused
      -- whenever it was unsure of a classification would never charge anything -- over-caution
      -- wearing a safety property's clothes.
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10t',
        'token', 'prepayment_target_underivable',
        'detail', 'no expense account was proposed for the amortisation charge'));
    else
      select ca.account_code, ca.account_type, ca.is_active into v_acct
        from clara.coa_accounts ca
       where ca.client_id = p_client and ca.account_code = btrim(p_target_account);
      if v_acct.account_code is null then
        v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10t',
          'token', 'prepayment_target_ineligible', 'axis', 'account_unknown',
          'account_code', btrim(p_target_account)));
      elsif v_acct.account_type <> 'expense' then
        -- P&L / expense-class: an amortisation charge is an expense. A balance-sheet target would
        -- move the prepayment sideways and never charge it.
        v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10t',
          'token', 'prepayment_target_ineligible', 'axis', 'not_expense_class',
          'account_code', v_acct.account_code, 'account_type', v_acct.account_type));
      else
        -- THE SAME HELPER THE PROPOSE DOOR AND THE POSTER ALREADY USE, so a bank-class or otherwise
        -- ineligible account refuses by the estate's own existing rule. This is also the axis W41's
        -- wired bank-account fixture exercises.
        v_breach := clara._adj_line_eligibility_breach(p_client,
          jsonb_build_array(jsonb_build_object('account_code', v_acct.account_code,
            'debit_cents', 1, 'credit_cents', 0)));
        if v_breach is not null then
          v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10t',
            'token', 'prepayment_target_ineligible') || v_breach);
        end if;
      end if;
    end if;
    if p_target_basis is null or btrim(p_target_basis) = '' then
      -- F2 WALL 2's precondition: a judgement with NO RECORDED BASIS is what TA-P4 exists to
      -- prevent. Refuse rather than receipt an unexplained classification.
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10t',
        'token', 'prepayment_target_underivable', 'axis', 'basis_missing',
        'detail', 'the target account was proposed without its stated grounds'));
    end if;
  end if;

  -- ---- ASSEMBLE THE TEMPLATE, then ask the five pre-rungs over it ----------------------------
  if jsonb_array_length(v_rungs) = 0 then
    v_pl    := v_sched -> 'period_lines';
    v_total := (v_sched ->> 'total_cents')::bigint;
    v_n     := (v_sched ->> 'period_count')::int;
    v_start := (v_pl -> 0 ->> 'period_start')::date;
    v_end   := (v_pl -> (v_n - 1) ->> 'period_end')::date;
    v_base  := (v_pl -> 0 ->> 'credit_cents')::bigint;
    v_name  := 'Prepayment amortisation ' || substr(p_source_entry::text, 1, 8);
    v_memo  := 'Prepayment amortisation';

    -- C3: THE AMOUNT MUST REACH THE GRANULARITY OF ITS OWN SCHEDULE, asked BEFORE the delegate.
    -- One cent over two months truncates to a base of 0, so the schedule is [0, 1] and this core's
    -- REPRESENTATIVE flat lines (built from period 1) go zero-sided. Zero-amount journal lines are
    -- refused estate-wide, so the delegate raises a RAW CLR10 -- which aborts the transaction and
    -- takes the receipt with it, leaving no trace of WHY the lane could not act. That is the
    -- silent-daily-log failure F-A4 exists to end, so it becomes a typed rung like every other
    -- foreseeable refusal.
    --
    -- REFUSAL IS THE RIGHT ARM, not a zero-period design: an amortisation that cannot charge every
    -- period a positive amount is not a schedule this product should draft, and the human's remedy
    -- (a shorter term, or simply expensing it) is a judgement they should make knowingly.
    if v_base <= 0 then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10g',
        'token', 'prepayment_amount_below_period_granularity',
        'total_cents', v_total, 'period_count', v_n, 'base_cents', v_base));
    end if;
  end if;

  if jsonb_array_length(v_rungs) = 0 then

    -- THE JUDGED ACCOUNT IS APPLIED HERE, at lines-assembly, and NOWHERE ELSE. The evaluator emits
    -- the prepaid-ASSET half with the account read off the source entry's own leg; this core pairs
    -- each period with the DEBIT on the judged expense account. That is what keeps the evaluator
    -- amounts-only and hard constraint 2 exact: no model NUMERAL reaches a durable artifact, a
    -- model CLASSIFICATION does -- receipted here, shown at §D4's projection, signed by a human.
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_acct.account_code, 'debit_cents', v_base,
                         'credit_cents', 0, 'description', v_memo),
      jsonb_build_object('account_code', v_sched ->> 'prepaid_account_code', 'debit_cents', 0,
                         'credit_cents', v_base, 'description', v_memo));
    for x in select value from jsonb_array_elements(v_pl) loop
      v_tmpl_sched := v_tmpl_sched || jsonb_build_array(jsonb_build_object(
        'period_start', x ->> 'period_start', 'period_end', x ->> 'period_end',
        'lines', jsonb_build_array(
          jsonb_build_object('account_code', v_acct.account_code,
                             'debit_cents', (x ->> 'credit_cents')::bigint,
                             'credit_cents', 0, 'description', v_memo),
          jsonb_build_object('account_code', x ->> 'account_code', 'debit_cents', 0,
                             'credit_cents', (x ->> 'credit_cents')::bigint,
                             'description', v_memo))));
    end loop;

    -- (a) template_alignment_unmet -- RECLASSIFIED, not deleted (Annex F.1). Under F1's ruled
    -- convention monthly IS calendar-month at the bytes, so the template's start_date is a period
    -- start BY CONSTRUCTION and this can no longer fire on ordinary caller input. It is kept as a
    -- SELF-CHECK ON OUR OWN OUTPUT, because a silent misalignment would post a schedule against the
    -- wrong periods, and it costs one comparison. Cell W38.
    if clara._adj_period_start(p_client, 'monthly', v_start) is distinct from v_start then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10a',
        'token', 'template_alignment_unmet', 'start_date', v_start,
        'period_start', clara._adj_period_start(p_client, 'monthly', v_start)));
    end if;
    -- (e) template_lines_unbalanced -- a SELF-CHECK on the evaluator's own output. A red here is a
    -- fault in clara.prepayment_schedule_v1, not in the caller, and it must STILL land as a receipt
    -- rather than an abort: a broken evaluator that leaves no evidence is strictly worse than one
    -- that refuses loudly.
    if (select coalesce(sum((e ->> 'debit_cents')::bigint), 0)
             <> coalesce(sum((e ->> 'credit_cents')::bigint), 0)
          from jsonb_array_elements(v_lines) as t(e)) then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10e',
        'token', 'template_lines_unbalanced'));
    end if;
    -- (d) template_date_unsupported -- the DERIVED first period end is domain-checked, not the
    -- supplied dates (the distinction 0045's own round-9 comment draws).
    if not clara._wdb_iso_date_supported(clara._adj_period_end(p_client, 'monthly', v_start)) then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10d',
        'token', 'template_date_unsupported', 'derived_period_end',
        clara._adj_period_end(p_client, 'monthly', v_start)));
    end if;
    -- (c) template_line_ineligible -- the same helper, the same payload, asked before the delegate.
    v_breach := clara._adj_line_eligibility_breach(p_client, v_lines);
    if v_breach is not null then
      v_rungs := v_rungs || jsonb_build_array(
        jsonb_build_object('rung', 'B10c', 'token', 'template_line_ineligible') || v_breach);
    end if;
    -- (b) template_duplicate_pending -- THE RUNG A RE-WAKE HITS: the lane drafted this schedule
    -- yesterday, nobody signed it, and today's pass would otherwise ABORT on the delegate's raise.
    -- Same hash over the same canonical content, same partial-unique population, and the twin's id
    -- rides in the payload so the receipt says WHICH template already stands.
    --
    -- THE SELF-TWIN IS EXCLUDED -- CONDUCTOR RULING, 2026-08-27 (design §13.1). §6.2a as written
    -- collided with D-25 and cell B-11, which make a SAME-TASK retry a REPLAY of the stored
    -- outcome: asked unconditionally, this rung fires on the lane's OWN prior act, so an idempotent
    -- retry answered `refused` and named the template that very task had just drafted. Nothing was
    -- double-drafted, but the ANSWER was dishonest -- the same class FIX-1 spent a fix round
    -- killing, milder only because the twin id is named. §6.2a simply failed to carve the self-twin
    -- case; excluding it is a design-internal consistency completion, not new behaviour.
    --
    -- THE DISCRIMINATOR IS THE DELEGATE'S OWN SUB-KEY, which is what makes "this task's own prior
    -- act" a fact rather than an inference: propose_adjustment_template stamps proposed_op_key with
    -- the key it was called under, and this core always calls it with
    -- `p_op_key || ':' || p_source_entry`. A twin bearing THAT key is this act's own replay and is
    -- skipped here so _reserve_op can answer with the stored receipt; a twin bearing any other key
    -- (a genuinely different task, or a human's own proposal) still meets the rung with its id,
    -- exactly as §6.2a intends.
    v_hash := clara._adj_template_hash(btrim(v_name), 'monthly', v_start, v_end, false,
      v_lines, v_memo, v_tmpl_sched);
    select t.id into v_twin from clara.adjustment_templates t
     where t.client_id = p_client and t.content_hash = v_hash
       and t.status in ('proposed', 'live')
       and t.proposed_op_key is distinct from (p_op_key || ':' || p_source_entry::text)
     limit 1;
    if v_twin is not null then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B10b',
        'token', 'template_duplicate_pending', 'template_id', v_twin));
    end if;
  end if;

  -- ---- THE REFUSED RECEIPT -------------------------------------------------------------------
  -- SUBJECT = THE SOURCE ENTRY, and that is not cosmetic (Annex E). The derived op key is per
  -- (task, verb, CLIENT), so two source entries in ONE wake task share it. A client-subject refusal
  -- would collide on uq_aar and hand entry B the receipt minted for entry A -- FIX-1's defect,
  -- re-opened by a subject too coarse to tell two acts apart. Cell W14.
  if jsonb_array_length(v_rungs) > 0 then
    v_receipt := clara._agent_close_receipt(v_firm, p_client, 'prepayment_schedule', 'journal_entry',
      p_source_entry, p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid,
      (p_ctx ->> 'task_id')::uuid, p_rationale, p_model, 'refused', v_rungs, p_op_key);
    return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
  end if;

  -- ---- THE ACTED PATH ------------------------------------------------------------------------
  -- THE DELEGATE TAKES A SUB-KEY. propose_adjustment_template holds its OWN _reserve_op slot
  -- (0045:3864), so two entries in one task need two keys there. The depreciation catch-up already
  -- solves this exact problem the same way (0138:2399 against :2379-2381).
  v_result := clara._propose_adjustment_template_core(
    jsonb_build_object('firm', v_firm, 'actor', clara.agent_user_id()),
    p_client, v_name, 'monthly', v_start, v_end, false, v_lines, v_memo,
    p_op_key || ':' || p_source_entry::text, null, v_tmpl_sched, v_expect_digest);
  v_template := (v_result ->> 'template_id')::uuid;
  -- FAIL CLOSED rather than substitute a stand-in subject: a delegate answer with no template_id
  -- means the proposal did not happen the way this receipt is about to claim it did. The
  -- _agent_mint_month_snapshot_core precedent (0138), verbatim in spirit.
  if v_template is null then
    raise exception 'the template proposal returned no template_id; the receipt has no subject to name'
      using errcode = 'CLR08', detail = '{"reason":"prepayment_subject_unresolvable"}';
  end if;

  -- SUBJECT = THE TEMPLATE. Differing subjects across verdicts is the shipped idiom (the fix order
  -- records begin_close / open_fy / mint_snapshot as "safe by differing subject"), and it is what
  -- keeps an acted and a refused receipt for the same entry from ever contending.
  -- F2 WALL 2: the judged account AND ITS STATED BASIS ride the receipt, through the law-79
  -- machinery that already carries model name, version and rationale.
  v_receipt := clara._agent_close_receipt(v_firm, p_client, 'prepayment_schedule',
    'adjustment_template', v_template, p_ctx ->> 'wake_kind',
    nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale || ' | target account ' || v_acct.account_code || ': ' || btrim(p_target_basis),
    p_model, 'acted', '[]'::jsonb, p_op_key);

  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt,
    'template_id', v_template, 'status_of_template', 'proposed',
    'schedule_version', v_sched ->> 'schedule_version', 'total_cents', v_total,
    'period_count', v_n, 'target_account', v_acct.account_code,
    'target_basis', btrim(p_target_basis), 'content_hash', v_hash);
end $agent$;
revoke all on function clara._agent_prepayment_schedule_core(jsonb, uuid, uuid, text, text, text, jsonb, text) from public;

-- THE WRAPPER. No DML text in its body -- it names ITSELF in its _close_wake_ctx call and delegates,
-- which is what every census in the estate keys on.
create function clara.wake_establish_prepayment_schedule(p_client uuid, p_source_entry uuid,
    p_target_account text, p_target_basis text, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $wake$
declare v_ctx jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_establish_prepayment_schedule', 'client', p_client, p_op_key);
  return clara._agent_prepayment_schedule_core(v_ctx, p_client, p_source_entry, p_target_account,
    p_target_basis, p_rationale, p_model, p_op_key);
end $wake$;
revoke all on function clara.wake_establish_prepayment_schedule(uuid, uuid, text, text, text, jsonb, text) from public;

-- THE ALLOWLIST ROW -- the THIRTEENTH close_prep entry. §0 measured the pre-count at 12 and §TAIL
-- asserts the delta, so the flip is a measured change rather than a literal restated.
-- The writable column is function_name; fn_name is GENERATED from it (measured on the rig, not
-- read off a design line -- the first cut of this INSERT named the generated column and was
-- refused, which is the storage layer doing exactly what it should).
insert into clara.wake_fn_allowlist(wake_kind, function_name)
  values ('close_prep', 'wake_establish_prepayment_schedule');

-- THE ONE NEW PRIVILEGE IN THIS ENTIRE TRAIN (NON-GOAL 3: no floor moves anywhere).
grant execute on function clara.wake_establish_prepayment_schedule(uuid, uuid, text, text, text, jsonb, text)
  to clara_wake_interactive;

comment on function clara.wake_establish_prepayment_schedule(uuid, uuid, text, text, text, jsonb, text) is
  'F-A4 PR-2a: wrapper 12, unparked. DRAFT-ONLY BY CONSTRUCTION, not by promise -- this verb reaches only clara._propose_adjustment_template_core, and adjustment_templates.status moves to ''live'' in exactly ONE body, clara.sign_adjustment_template, which opens the ADMIN floor and holds no grant to any wake role (R6). The judged expense account arrives as an argument with its stated basis, is validated deterministically, receipted, and shown at the sign door; the AMOUNTS come only from clara.prepayment_schedule_v1. Facts get anchored, judgements get receipted.';

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
-- §H — MED-8: THE SUPERSEDE-CHURN GUARD [declared, provably idle] (design §8; derivation Annex D).
--
-- This body was created by 0138 and is reachable only through its own wrapper under a close_prep
-- credential; §0 read the close_prep wake sources POSITIVELY at enabled = false across the WHOLE
-- wake_kind population, so this CoR and §H2's ride ONE declared idle slot rather than buying a
-- window. That read is the evidence; absence of traffic would not have been (review law 2).
--
-- WHY B11b RATHER THAN CANONICAL COVERAGE (Annex D). Requiring a proposal to bind every outstanding
-- check_key would close the churn as a side effect and be structurally cleaner — and it would also
-- REFUSE AN HONEST PARTIAL OFFER. The carrier's content is drafted attestation texts per
-- outstanding item; an agent with defensible language for three of five items and offering three is
-- doing the right thing, and a professional adopting three of five is an ordinary act. B11b closes
-- the churn without taking that latitude away.
--
-- WHAT THIS DELIBERATELY LEAVES WITHOUT A DOOR, named rather than left as a gap: the legitimate
-- correction that DROPS a pair. A silent supersede is the wrong way to perform a retraction, and
-- B11b now refuses it — so until clara.withdraw_close_proposal_item ships (NON-GOAL 10, its shape
-- sketched in design §8), the retraction path is the human one that already exists:
-- clara.settle_close_proposal(..., 'withdrawn'), after which the next wake proposes cleanly against
-- no live row.
-- =================================================================================================
CREATE OR REPLACE FUNCTION clara._agent_close_proposal_core(p_ctx jsonb, p_close_run uuid, p_drafted jsonb, p_narrative text, p_rationale text, p_model jsonb, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $hmed8$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_client uuid := (p_ctx ->> 'client_id')::uuid;
  v_run record; v_rungs jsonb; v_receipt uuid; v_keys text[]; v_dry jsonb;
  v_bound jsonb := '{}'::jsonb; v_stale jsonb := '[]'::jsonb; v_k text;
  v_fresh text; v_recorded text; v_id uuid; v_live uuid; v_live_bound jsonb;
  v_live_drafted jsonb; v_pairs_new jsonb[]; v_pairs_live jsonb[];
  v_moved text[]; v_dropped jsonb[]; v_added jsonb[]; v_arm text;
begin
  v_rungs := clara._close_tier_b_common(v_client, p_rationale, p_model);
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.id is null then
    v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'A', 'token', 'fiscal_year_not_in_firm'));
  else
    if v_run.state <> 'in_progress' then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B4',
        'token', 'close_not_in_progress', 'state', v_run.state));
    end if;
    if p_drafted is null or jsonb_typeof(p_drafted) <> 'array' or jsonb_array_length(p_drafted) = 0
       or nullif(btrim(coalesce(p_narrative, '')), '') is null then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B2',
        'token', 'receipt_incomplete', 'class', 'proposal_shape'));
    else
      -- Every drafted element names a check_key, an item_key and a non-blank text. A malformed
      -- element is refused HERE rather than stored and discovered at adoption time.
      if exists (select 1 from jsonb_array_elements(p_drafted) x(el)
                  where nullif(btrim(coalesce(x.el ->> 'check_key', '')), '') is null
                     or nullif(btrim(coalesce(x.el ->> 'item_key', '')), '') is null
                     or nullif(btrim(coalesce(x.el ->> 'text', '')), '') is null) then
        v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B2',
          'token', 'receipt_incomplete', 'class', 'drafted_element'));
      -- DUPLICATE ITEMS ARE A SHAPE REFUSAL, NOT A RAISE (FIX-8). t_close_proposal_drafted_unique
      -- is the structural backstop under every writer, but a trigger raise escaping this core
      -- would abort the transaction and leave no receipt — breaking Tier B's "a typed non-act, no
      -- raise" contract for what is only a malformed request. The rung answers it first, so the
      -- lane gets a durable, readable refusal and the trigger stays the wall for anything that
      -- reaches the table another way.
      elsif (select count(*) from jsonb_array_elements(p_drafted) x(el))
            is distinct from (select count(distinct jsonb_build_array(x.el ->> 'check_key', x.el ->> 'item_key'))
                                from jsonb_array_elements(p_drafted) x(el)) then
        v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B2',
          'token', 'receipt_incomplete', 'class', 'drafted_duplicate_item'));
      else
        select array_agg(distinct x.el ->> 'check_key') into v_keys
          from jsonb_array_elements(p_drafted) x(el);
        -- B12 -- FRESHNESS. For every bound check_key: the dry run taken NOW must agree with the
        -- run's own latest recorded measurement. Disagreement means the measurement MOVED since
        -- the run recorded it, so any attestation adopted from this proposal would be stale on
        -- arrival.
        v_dry := clara._close_dry_run_core(v_client, v_run.fiscal_year_id);
        foreach v_k in array v_keys loop
          select el ->> 'measured_digest' into v_fresh
            from jsonb_array_elements(v_dry -> 'checks') y(el)
           where el ->> 'check_key' = v_k limit 1;
          select g.measured_digest into v_recorded
            from clara.close_gate_results g
           where g.close_run_id = p_close_run and g.check_key = v_k
           order by g.seq desc limit 1;
          -- THE VECTOR IS BUILT OVER EVERY REQUESTED KEY, stale ones included. Building it only
          -- from the FRESH keys would make a stale two-key request collapse onto the one-key
          -- vector a live proposal already holds, and B11 would then report "a live proposal
          -- stands at the same digest vector" about a vector that was never asked for -- a false
          -- sentence on a durable record, caught by this file's own battery. Staleness is tracked
          -- separately, in v_stale.
          if v_fresh is null or v_recorded is null or v_fresh is distinct from v_recorded then
            v_stale := v_stale || jsonb_build_array(jsonb_build_object('check_key', v_k,
              'fresh_digest', v_fresh, 'recorded_digest', v_recorded));
          end if;
          v_bound := v_bound || jsonb_build_object(v_k, coalesce(v_recorded, '(unmeasured)'));
        end loop;
        if jsonb_array_length(v_stale) > 0 then
          v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B12',
            'token', 'close_proposal_stale', 'moved', v_stale));
        end if;
      end if;
    end if;
    -- B11 -- a live proposal already stands for this run AT THE SAME DIGEST VECTOR. A live
    -- proposal at a DIFFERENT vector is not a duplicate: it is a superseded one, and the act below
    -- supersedes it rather than refusing (supersede-never-mutate, law 6's reverse-not-delete).
    -- FOR UPDATE (FIX-8): the live row is read under a lock, so the settle door cannot terminate
    -- it between this read and the supersede below. Without the lock the two writers could each
    -- see `open`, and the loser would stamp `superseded` over a row a reviewer had just adopted —
    -- the settle-only trigger would refuse it, but only after the lane had already decided it was
    -- superseding a live proposal. Locking here makes the two lifecycle writers take turns.
    select cp.id, cp.bound_digests, cp.drafted into v_live, v_live_bound, v_live_drafted
      from clara.close_proposals cp
      where cp.close_run_id = p_close_run and cp.state = 'open' limit 1 for update;
    if v_live is not null and v_live_bound is not distinct from v_bound then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B11',
        'token', 'close_proposal_exists', 'proposal_id', v_live));
    elsif v_live is not null then
      -- ===== F-A4 PR-2a §H -- RUNG B11b, MED-8's CHURN GUARD (design §8, Annex D) =====
      -- THE DEFECT: v_bound is built over the keys THE AGENT CHOSE, and B11 refuses only on an
      -- EXACT jsonb match. So a fresh task drafting a strict SUBSET of a live proposal's keys skips
      -- B11 and stamps that proposal `superseded` with a fixed literal saying the gate vector
      -- moved. NOTHING MOVED -- the measurement is identical on the shared key and the request
      -- simply shrank. A FALSE SENTENCE ON A DURABLE RECORD, found by a reviewer who was about to
      -- adopt the proposal it quietly buried.
      --
      -- THE GUARD: an incoming proposal may supersede a live one only if at least one holds --
      --   (1) A MOVED DIGEST: some check_key present in BOTH binds a different digest; or
      --   (2) STRICT SUPERSET OF THE PAIR SET: the incoming (check_key, item_key) pairs are a
      --       PROPER superset of the live proposal's pairs.
      -- Neither => typed refusal naming the live proposal, and the live proposal stays `open`.
      --
      -- ARM (2) IS OVER PAIRS, NOT check_keys, and the distinction is load-bearing (N5): at
      -- check_key granularity a live {(A,i1)} and an incoming {(A,i1),(A,i2)} share the key set
      -- {A}, so a check_key reading would REFUSE a proposal adding a genuinely new item under an
      -- existing check -- legitimate growth, which is exactly what arm (2) exists to admit.
      --
      -- AND IT IS STRICT SUPERSET, NOT "at least one new pair" -- the review killed that reading.
      -- Under a merely-non-empty-new-pairs test, an incoming set that adds one pair AND DROPS THREE
      -- still supersedes, so a rotation across overlapping subsets burns live proposals one after
      -- another whenever the complement is non-empty: the same churn B11b exists to stop, wearing a
      -- different shape. STRICT SUPERSET ADMITS GROWTH AND REFUSES TRADE.
      -- THE PAIR KEY IS A TWO-ELEMENT COMPOSITE, NOT A JOINED STRING -- 0138:496's own idiom, and
      -- law 3 exactly. item_key is only non-blank-validated, so it may contain any character: under
      -- a `check_key || '|' || item_key` key, ("A", "x|y") and ("A|x", "y") produce the SAME text
      -- and are read as one pair. That is not merely untidy -- in the ROTATION direction it can
      -- make v_dropped come back empty when a pair really was dropped, and B11b would then
      -- SUPERSEDE on the strict-superset arm where it should refuse. A separator is a spelling of
      -- a pair, not the pair; jsonb_build_array carries the two fields as two fields.
      select coalesce(array_agg(distinct jsonb_build_array(x.el ->> 'check_key', x.el ->> 'item_key')), '{}')
        into v_pairs_new from jsonb_array_elements(p_drafted) x(el);
      select coalesce(array_agg(distinct jsonb_build_array(x.el ->> 'check_key', x.el ->> 'item_key')), '{}')
        into v_pairs_live from jsonb_array_elements(coalesce(v_live_drafted, '[]'::jsonb)) x(el);
      select coalesce(array_agg(k order by k), '{}') into v_moved
        from jsonb_object_keys(v_bound) k
       where v_live_bound ? k and (v_live_bound ->> k) is distinct from (v_bound ->> k);
      select coalesce(array_agg(p order by p), '{}') into v_dropped
        from unnest(v_pairs_live) p where not (p = any (v_pairs_new));
      select coalesce(array_agg(p order by p), '{}') into v_added
        from unnest(v_pairs_new) p where not (p = any (v_pairs_live));
      if coalesce(array_length(v_moved, 1), 0) > 0 then
        v_arm := 'moved_digest';
      elsif coalesce(array_length(v_added, 1), 0) > 0
            and coalesce(array_length(v_dropped, 1), 0) = 0 then
        v_arm := 'strict_superset';
      else
        v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B11b',
          'token', 'close_proposal_no_state_change', 'proposal_id', v_live,
          'dropped_pairs', to_jsonb(v_dropped), 'added_pairs', to_jsonb(v_added)));
      end if;
    end if;
  end if;
  if jsonb_array_length(v_rungs) > 0 then
    v_receipt := clara._agent_close_receipt(v_firm, v_client, 'propose_close', 'close_run', p_close_run,
      p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
      p_rationale, p_model, 'refused', v_rungs, p_op_key);
    return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
  end if;
  -- SUPERSEDE, NEVER MUTATE AND NEVER DELETE: an outstanding proposal at a moved vector is stamped
  -- `superseded` with its reason, and the successor is a NEW row. The partial unique index makes
  -- the ordering mandatory rather than merely intended.
  if v_live is not null then
    update clara.close_proposals
      set state = 'superseded', settled_by = clara.agent_user_id(), settled_at = now(),
          -- THE REASON IS NOW TRUE OF THE ACT THAT HAPPENED, not a fixed literal (Annex D.2).
          -- ARM (1) CAN DROP COVERAGE -- a moved digest rightly supersedes, but nothing forces the
          -- successor to cover as much as its predecessor, so an honest re-measurement can quietly
          -- carry fewer pairs. The guard permits it (the measurement really moved), so THE RECORD
          -- CARRIES IT: the reason names the moved check_keys AND every dropped pair. A reviewer
          -- must not have to diff two proposals to discover what a supersession took away.
          -- ARM (2) loses nothing by construction, so its sentence is simply what was added.
          -- The pairs are RENDERED for the reader as `check_key / item_key` rather than dumped as
          -- raw jsonb: the comparison key is a composite (above), but a durable sentence a
          -- professional reads should not make them parse an array literal.
          settle_reason = case v_arm
            when 'moved_digest' then
              'superseded on a moved gate vector: ' || array_to_string(v_moved, ', ')
              || case when coalesce(array_length(v_dropped, 1), 0) > 0
                      then '; coverage dropped for: '
                           || (select string_agg((p ->> 0) || ' / ' || (p ->> 1), ', ' order by p)
                                 from unnest(v_dropped) p)
                      else '; coverage retained in full' end
            when 'strict_superset' then
              'superseded by a strict superset of its drafted items; newly covered: '
              || (select string_agg((p ->> 0) || ' / ' || (p ->> 1), ', ' order by p)
                    from unnest(v_added) p)
            else 'superseded by a fresh proposal' end
      where id = v_live;
  end if;
  insert into clara.close_proposals(firm_id, client_id, fiscal_year_id, close_run_id, state,
      proposed_by, bound_digests, drafted, narrative, model_name, model_version, rationale)
    values (v_firm, v_client, v_run.fiscal_year_id, p_close_run, 'open',
      clara.agent_user_id(), v_bound, p_drafted, p_narrative,
      btrim(p_model ->> 'name'), btrim(p_model ->> 'version'), p_rationale)
    returning id into v_id;
  perform clara._append_event(v_firm, 'close.proposed', v_client, clara.agent_user_id(),
    null, null, null, null, null,
    jsonb_build_object('close_run_id', p_close_run, 'proposal_id', v_id,
      'fiscal_year_id', v_run.fiscal_year_id, 'drafted_items', jsonb_array_length(p_drafted)));
  v_receipt := clara._agent_close_receipt(v_firm, v_client, 'propose_close', 'close_run', p_close_run,
    p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key);
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt,
    'result', jsonb_build_object('proposal_id', v_id, 'close_run_id', p_close_run,
      'superseded_proposal_id', v_live, 'bound_digests', v_bound));
end
$hmed8$;

-- =================================================================================================
-- §H2 — F4: THE MINT-SNAPSHOT RECEIPT COLLISION, FIXED (design §6.3a; derivation Annex G).
--
-- THE SHIPPED DEFECT, derived rather than suspected. clara._agent_mint_month_snapshot_core takes
-- p_month_start — the act is MONTH-GRAIN — but pins its REFUSED receipt to ('mint_snapshot',
-- 'client', p_client) while _close_wake_ctx derives the op key per (task, verb, CLIENT). So for two
-- refusals of two DIFFERENT months inside ONE wake task, every one of uq_aar's seven columns is
-- equal — THE MONTH APPEARS IN NONE OF THEM. _agent_close_receipt's `on conflict do nothing`
-- read-back then finds the standing row, its identity guard compares task, actor, client, wake kind
-- and vector and finds them ALL EQUAL, and it returns THE FIRST MONTH'S RECEIPT ID FOR THE SECOND
-- MONTH'S REFUSAL. Same defect class as FIX-1, shipped and undetected.
--
-- IT NEEDS IDENTICAL RUNG VECTORS, AND THAT DOES NOT SAVE IT: the ordinary way to reach this is a
-- live hold or an incomplete model triple — conditions of the TASK, which produce exactly the same
-- vector for every month in the pass.
--
-- WHY THE SHAPE DIFFERS FROM WRAPPER 12'S. There the subject could carry the grain (journal_entry /
-- adjustment_template, both uuids). A month start is a DATE and subject_id is `uuid not null` —
-- there is nothing to name. So the discriminator moves to the op_key COLUMN, which is already in
-- the key: both receipt calls take p_op_key || ':' || p_month_start, the same sub-key idiom the
-- depreciation catch-up already uses (0138:2399).
--
-- THE ACTED PATH IS ALREADY SAFE by its minted snapshot_id, but it takes the month-scoped key TOO —
-- a receipt row for this verb should say which month it was about whichever way the act went.
--
-- THE DELEGATE CALL IS DELIBERATELY LEFT ALONE, and the generator asserts it survived intact:
-- clara._mint_month_snapshot_core has its own _reserve_op slot and its own replay identity, and
-- re-keying it would change behaviour F4 never asked about and nothing has measured.
--
-- BLAST RADIUS: no wall, no floor, no grant moves. This changes what a receipt is KEYED and
-- LABELLED by, on a verb no live credential can currently reach. Cell W32; its mutant reverts to
-- the bare key and reproduces the shipped defect.
-- =================================================================================================
CREATE OR REPLACE FUNCTION clara._agent_mint_month_snapshot_core(p_ctx jsonb, p_client uuid, p_month_start date, p_rationale text, p_model jsonb, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $h2mint$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_rungs jsonb; v_receipt uuid; v_result jsonb;
begin
  v_rungs := clara._close_tier_b_common(p_client, p_rationale, p_model);
  if jsonb_array_length(v_rungs) > 0 then
    v_receipt := clara._agent_close_receipt(v_firm, p_client, 'mint_snapshot', 'client', p_client,
      p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
      p_rationale, p_model, 'refused', v_rungs, p_op_key || ':' || p_month_start::text);
    return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
  end if;
  v_result := clara._mint_month_snapshot_core(v_firm, clara.agent_user_id(), p_client,
    p_month_start, p_op_key);
  -- FAIL CLOSED rather than substitute a stand-in subject: a delegate answer with no snapshot_id
  -- means the mint did not happen the way this receipt is about to claim it did (law 2 — a derived
  -- subject is not evidence of the real one).
  if (v_result ->> 'snapshot_id') is null then
    raise exception 'the snapshot mint returned no snapshot_id; the receipt has no subject to name'
      using errcode = 'CLR08', detail = '{"reason":"mint_snapshot_subject_unresolvable"}';
  end if;
  v_receipt := clara._agent_close_receipt(v_firm, p_client, 'mint_snapshot', 'snapshot',
    (v_result ->> 'snapshot_id')::uuid, p_ctx ->> 'wake_kind',
    nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key || ':' || p_month_start::text);
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt, 'result', v_result);
end
$h2mint$;

-- =================================================================================================
-- §D4 — F2 WALL 3, THE VISIBLE HALF [live-body CoR, NOT a D1 correctness hazard].
--
-- clara._adj_template_json is genuinely live: ungranted itself, but reached by
-- clara.list_adjustment_templates (called 0045:6647, granted to clara_authenticated at 0045:6721),
-- so a human panel really does execute it. It therefore takes its own prosrc pin and its own CoR.
--
-- BUT IT IS A READ PROJECTION, and the distinction is stated rather than blurred (design §9, M1):
-- a call spanning this migration returns the OLD SHAPE, which is STALE, NOT WRONG — a panel that
-- renders without the schedule column for one request, never a number posted against the wrong
-- body. It cannot post anything at all. So it does NOT join the four D1 correctness hazards, and
-- §9's "four bodies" headline stays true while the CoR set is five. A conductor counting bodies and
-- one counting hazards should both get a true answer from this file.
--
-- WHY IT IS IN SCOPE AT ALL: the owner ruled the judged account "visible and changeable at the
-- admin sign door". VISIBLE is implemented literally here — without this projection the ruling is
-- not implementable. CHANGEABLE is decline-and-re-propose, never edit-at-signature, and that is not
-- merely a policy preference: clara._tf_adjustment_template_transition (0045:1323-1350) freezes
-- every column outside the eight lifecycle stamps and raises CLR38 on any other difference, so THE
-- STORAGE LAYER ALREADY REFUSES a sign-time edit. Because `schedule` is a NEW column and is not in
-- that frozen set, it inherits that immutability with NO CHANGE TO THE TRIGGER AT ALL — §0 pins the
-- trigger's sha and §TAIL re-reads it, so "we did not widen it" is proven, not promised.
-- =================================================================================================
CREATE OR REPLACE FUNCTION clara._adj_template_json(p_template uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $d4json$
declare t clara.adjustment_templates%rowtype; v_draft uuid;
begin
  select * into t from clara.adjustment_templates where id = p_template;
  if not found then return null; end if;
  -- The oldest outstanding occurrence draft for this template, if any. Same predicate
  -- clara._adj_occurrence_outstanding uses (status='draft' + the ABI SSB stamp), so the row
  -- and the oracle can never disagree about whether a draft is in the way.
  select je.id into v_draft from clara.journal_entries je
   where je.client_id = t.client_id and je.status = 'draft'
     and je.flags ? 'recurring_adjustment'
     and (je.flags -> 'recurring_adjustment' ->> 'template_id') = t.id::text
   order by je.created_at, je.id limit 1;
  return jsonb_build_object(
    'template_id', t.id, 'client_id', t.client_id, 'status', t.status, 'name', t.name,
    'cadence', t.cadence, 'start_date', t.start_date, 'end_date', t.end_date,
    'auto_reverse', t.auto_reverse, 'lines', t.lines, 'memo_template', t.memo_template,
    'content_hash', t.content_hash, 'proposed_by', t.proposed_by, 'signed_by', t.signed_by,
    'signed_at', t.signed_at, 'retired_by', t.retired_by, 'retired_at', t.retired_at,
    'retired_reason', t.retired_reason, 'created_at', t.created_at,
    -- [R11 FIX 2026-08-04 -- W1 finding 3 / Codex r11 finding 2] THE RECORDED DECLARATION IS PROJECTED.
    -- The gate ASSERTS on this column and forbids an act on the strength of it; a professional who
    -- cannot see it on the row has no way to check the claim the refusal will one day make about
    -- their books, and no way to notice a mis-declaration until it refuses. jsonb null when
    -- nothing was declared -- ALWAYS present, this file's stable-shape rule.
    'replaces_template_id', t.replaces_template_id,
    'occurrence_draft_entry_id', v_draft,
    -- F-A4 PR-2a §D4 -- F2 WALL 3, THE VISIBLE HALF. The owner ruled that Clara's judged
    -- expense account must be VISIBLE at the admin sign door. Without these keys "visible" is
    -- not implementable at all, which is why this read projection is explicitly in PR-2a scope.
    -- ALWAYS PRESENT, jsonb null when absent -- this file's own stable-shape rule.
    'schedule', t.schedule,
    -- The judged target is the DEBITED account on the template's own lines. Projected as an
    -- ARRAY always, plus a scalar that is non-null ONLY when there is exactly one -- a
    -- projection must not resolve an ambiguity it can only guess at, and a surface that showed
    -- one of two debited accounts as "the" target would be lying quietly.
    'target_accounts', coalesce((select jsonb_agg(distinct e ->> 'account_code')
                                   from jsonb_array_elements(t.lines) as x(e)
                                  where (e ->> 'debit_cents')::bigint > 0), '[]'::jsonb),
    'target_account', (select case when count(*) = 1 then min(e ->> 'account_code') end
                         from jsonb_array_elements(t.lines) as x(e)
                        where (e ->> 'debit_cents')::bigint > 0));
end
$d4json$;

-- =================================================================================================
-- §I — THE CATALOG-COMMENT TRUINGS (Annex B.4, B.5).
--
-- WHY THE CATALOG AND NOT THE FILE. The fix order asked for two "comment truings" in 0138. THEY
-- CANNOT LAND WHERE IT SAYS: the runner records each migration file's sha256 and an edit to an
-- APPLIED file trips a checksum-drift error (.claude/rules/db-migrations.md). So the truing lands
-- where a reader actually QUERIES it — the catalog — and this file's header records the
-- correction. That is the 0052 principle: put the reasoning where the next pg_get_functiondef
-- reader will find it, not only in a file that reader may never open.
-- =================================================================================================

-- B.4 -- 0138:1331 spells uq_aar as SIX columns. The live constraint is SEVEN: `verdict` and
-- `rung_digest` are in it (0138:396), and they are the whole reason FIX-1's identity guard can tell
-- two outcomes apart. A reader who trusts the six-column prose would conclude that two refusals
-- differing only in their rung vector must collide -- and would then "fix" a defect that is not
-- there, or miss the one that is.
comment on constraint uq_aar on clara.agent_act_receipts is
  'The receipt identity key is SEVEN columns: (firm_id, act_kind, subject_kind, subject_id, op_key, verdict, rung_digest). The six-column spelling in the prose at 0138:1331 is SUPERSEDED -- it predates FIX-1, which added verdict and rung_digest so that each distinct OUTCOME of an act is its own durable row rather than being answered with a standing row''s id. Two refusals of the same act differing in ANY rung therefore occupy separate rows; they collide only on byte-identical rung vectors, which is exactly the case F-A4 PR-2a''s receipt subjects are chosen to discriminate.';

-- B.5 -- FIX-7's comment on the settle door OVER-CLAIMS, and the gap is real: clara.close_attestations
-- carries no from-proposal column, so the `adopted` arm proves *a live agent-authored attestation on
-- the run for that key pair*, NOT one naming THIS proposal. A superseded predecessor's attestation
-- can therefore cover a successor's item. The column is carried to PR-3 by name (NON-GOAL 7): writing
-- it means recutting clara.attest_close_exception -- the estate's most-reviewed close writer --
-- inside a window sized for one layer, to close a PROVENANCE BLUR rather than a wrong number. The
-- professional's signed words live on the attestation row itself; what mis-binds is which proposal
-- the `adopted` stamp credits. Cell W28 demonstrates the blur so it cannot go quiet.
comment on function clara.settle_close_proposal(uuid, text, text, text) is
  'The reviewer''s terminal door on a close proposal: admits ''adopted'' and ''withdrawn'' only, at the bookkeeper floor plus close_and_attest, op-key idempotent, reverse-never-delete. PRECISE STRENGTH OF THE ''adopted'' ARM, trued by F-A4 PR-2a (fix order residual 5): it proves that a LIVE AGENT-AUTHORED ATTESTATION EXISTS ON THE RUN for each drafted (check_key, item_key) pair -- it does NOT prove that attestation names THIS proposal, because clara.close_attestations carries no from_proposal_id column. A superseded predecessor''s attestation can satisfy a successor''s item. That column is a named PR-3 carry; after PR-2a''s B11b churn guard supersession is rarer, which narrows the window without shutting it.';

reset role;

-- =================================================================================================
-- §TAIL — THE CENSUS A REVIEWER READS. A migration whose tail only says "OK" has proven nothing.
-- It runs AFTER `reset role` deliberately: as the migration role, not as the owner, so it cannot be
-- fooled by the owner's own view of its objects.
-- =================================================================================================
do $tail$
declare
  v_n int; v_m int; v_txt text; v_sig text; v_pre text; v_post text;
  v_missing text[] := '{}'; v_pub text[] := '{}'; v_frozen int;
  k_new_fns text[] := array[
    'clara._adj_canon_schedule(jsonb)',
    'clara._adj_period_lines(jsonb,jsonb,date,date)',
    'clara._record_document_service_period_core(jsonb,uuid,date,date,text,text)',
    'clara.record_document_service_period(uuid,date,date,text,text)',
    'clara.prepayment_schedule_v1(uuid,uuid)',
    'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)',
    'clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)',
    'clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)',
    'clara._tf_document_service_period_region_congruent()',
    'clara._tf_dsp_supersede_only()'];
  -- The internals this file adds that NO application role may call. Includes
  -- _tf_close_proposal_drafted_unique, which residual 4 found missing from BOTH closed sets in
  -- 0138 -- the rig-meta half joins that cohort separately; THIS half is censused here, because
  -- 0138's own k_ungranted lives in an APPLIED file and applied files are immutable.
  k_ungranted text[] := array[
    'clara._adj_canon_schedule(jsonb)',
    'clara._adj_period_lines(jsonb,jsonb,date,date)',
    'clara._record_document_service_period_core(jsonb,uuid,date,date,text,text)',
    'clara.prepayment_schedule_v1(uuid,uuid)',
    'clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb,text)',
    'clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)',
    'clara._tf_document_service_period_region_congruent()',
    'clara._tf_dsp_supersede_only()',
    'clara._tf_close_proposal_drafted_unique()'];
begin
  -- ---- T.1 EVERY NEW OBJECT RESOLVES AT ITS EXACT SIGNATURE (law 3: never a bare name) --------
  foreach v_sig in array k_new_fns loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception 'F-A4 PR-2a tail: % declared object(s) did not resolve: %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ')
      using errcode = 'CLR10', detail = '{"reason":"tail_object_missing"}';
  end if;
  if to_regclass('clara.document_service_periods') is null then
    raise exception 'F-A4 PR-2a tail: clara.document_service_periods absent' using errcode = 'CLR10';
  end if;

  -- ---- T.2 EXACTLY ONE PROPOSE DOOR, AND NO FUNCTION THIS FILE TOUCHES IS PUBLIC-EXECUTE ------
  -- This is the census that would have caught the overload defect: `create or replace` with an
  -- added argument creates a SECOND overload rather than replacing, leaving the shipped body live
  -- and the new one at DEFAULT ACL -- which for a function means PUBLIC EXECUTE.
  select count(*)::int into v_n from pg_proc
   where pronamespace = 'clara'::regnamespace and proname = 'propose_adjustment_template';
  if v_n <> 1 then
    raise exception 'F-A4 PR-2a tail: % overload(s) of propose_adjustment_template -- the extraction left the shipped body standing', v_n
      using errcode = 'CLR10', detail = '{"reason":"tail_propose_overloaded"}';
  end if;
  -- THE REPLACED BODIES ARE IN THIS CENSUS TOO (Codex C6). "No function this file touches is
  -- PUBLIC-EXECUTE" has to mean every body this file CREATES *or REPLACES*: a `create or replace`
  -- that lost its REVOKE would leave a definer body callable by PUBLIC just as surely as a new one,
  -- and an earlier cut enumerated only the new ten plus two. All five recut bodies are named here.
  foreach v_sig in array (k_new_fns || array[
      'clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)',
      'clara._adj_template_hash(text,text,date,date,boolean,jsonb,text,jsonb)',
      'clara._adj_run_occurrence_core(uuid,uuid,date,date,text,uuid,uuid,text)',
      'clara._adj_on_approve(uuid)',
      'clara._adj_template_json(uuid)',
      'clara._agent_close_proposal_core(jsonb,uuid,jsonb,text,text,jsonb,text)',
      'clara._agent_mint_month_snapshot_core(jsonb,uuid,date,text,jsonb,text)']) loop
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl,
                 acldefault('f', p.proowner))) a
                where p.oid = to_regprocedure(v_sig) and a.grantee = 0) then
      v_pub := v_pub || v_sig;
    end if;
  end loop;
  if array_length(v_pub, 1) is not null then
    raise exception 'F-A4 PR-2a tail: % function(s) executable by PUBLIC: %',
      array_length(v_pub, 1), array_to_string(v_pub, ', ')
      using errcode = 'CLR10', detail = '{"reason":"tail_public_execute"}';
  end if;

  -- ---- T.3 EVERY NEW BODY IS OWNED BY clara_fn_owner -----------------------------------------
  -- A SECURITY DEFINER body owned by the migration role runs as that role and BYPASSES RLS. Read
  -- positively here rather than trusted to the set-role above.
  select count(*)::int into v_n from pg_proc p
   where p.oid = any (array(select to_regprocedure(s)::oid from unnest(k_new_fns) s))
     and pg_get_userbyid(p.proowner) <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception 'F-A4 PR-2a tail: % new function(s) are NOT owned by clara_fn_owner -- a definer body would run with the wrong privileges', v_n
      using errcode = 'CLR10', detail = '{"reason":"tail_wrong_owner"}';
  end if;

  -- ---- T.4 THE UNGRANTED SET IS CLOSED --------------------------------------------------------
  v_missing := '{}';
  foreach v_sig in array k_ungranted loop
    if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl,
                 acldefault('f', p.proowner))) a
                where p.oid = to_regprocedure(v_sig)
                  and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE') then
      v_missing := v_missing || v_sig;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception 'F-A4 PR-2a tail: % internal(s) hold an EXECUTE grant they must not: %',
      array_length(v_missing, 1), array_to_string(v_missing, ', ')
      using errcode = 'CLR10', detail = '{"reason":"tail_internal_granted"}';
  end if;

  -- ---- T.5 THE UNTOUCHED BODIES ARE BYTE-UNCHANGED (the R6 scope cut, PROVEN) -----------------
  foreach v_sig in array array['sign_adjustment_template', '_adj_canon_lines',
                               '_tf_adjustment_template_transition'] loop
    select v into v_pre from _fa4_pr2a_prestate where k = 'untouched_sha:' || v_sig;
    select encode(sha256(p.prosrc::bytea), 'hex') into v_post from pg_proc p
     where p.oid = to_regprocedure(case v_sig
       when 'sign_adjustment_template' then 'clara.sign_adjustment_template(uuid,uuid,text)'
       when '_adj_canon_lines' then 'clara._adj_canon_lines(jsonb)'
       else 'clara._tf_adjustment_template_transition()' end);
    if v_pre is distinct from v_post then
      raise exception 'F-A4 PR-2a tail: % was MODIFIED (pre % / post %) -- NON-GOAL 2/13 broken', v_sig, v_pre, v_post
        using errcode = 'CLR10', detail = '{"reason":"tail_untouched_body_moved"}';
    end if;
  end loop;

  -- ---- T.6 THE ACL/OWNERSHIP/search_path TRIPLES ARE BYTE-UNMOVED where they must be ----------
  -- W4: the extraction must leave the door's ACL exactly as harvested. _adj_template_hash keeps
  -- its NON-definer, NO-search_path triple -- a from-memory rebuild would have promoted it.
  -- THE PROPOSE DOOR'S OWN TRIPLE, compared EXPLICITLY (Codex C6). §0 harvested the ten-argument
  -- door's ACL before the drop; the eleven-argument door that replaces it must carry the SAME one.
  -- W4 asserts this from the battery, but the tail is what a ceremony conductor reads, and an
  -- extraction that silently widened or narrowed the door's grant is precisely the thing this file
  -- must not be able to do quietly. Compared here against the pre-image, not merely re-granted.
  select v into v_pre from _fa4_pr2a_prestate
   where k = 'acl:clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid)';
  select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') into v_post
    from pg_proc p
   where p.oid = to_regprocedure('clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)');
  if v_pre is distinct from v_post then
    raise exception 'F-A4 PR-2a tail: the propose door''s ACL moved across the extraction (pre % / post %)', v_pre, v_post
      using errcode = 'CLR10', detail = '{"reason":"tail_propose_acl_moved"}';
  end if;
  select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '(none)')
                           || '|' || pg_get_userbyid(p.proowner) into v_post
    from pg_proc p
   where p.oid = to_regprocedure('clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)');
  select v into v_pre from _fa4_pr2a_prestate
   where k = 'triple:clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid)';
  if v_pre is distinct from v_post then
    raise exception 'F-A4 PR-2a tail: the propose door''s secdef/search_path/owner triple moved (pre % / post %)', v_pre, v_post
      using errcode = 'CLR10', detail = '{"reason":"tail_propose_triple_moved"}';
  end if;

  select v into v_pre from _fa4_pr2a_prestate
   where k = 'acl:clara.sign_adjustment_template(uuid,uuid,text)';
  select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') into v_post
    from pg_proc p where p.oid = to_regprocedure('clara.sign_adjustment_template(uuid,uuid,text)');
  if v_pre is distinct from v_post then
    raise exception 'F-A4 PR-2a tail: sign_adjustment_template''s ACL moved (pre % / post %)', v_pre, v_post
      using errcode = 'CLR10', detail = '{"reason":"tail_acl_moved"}';
  end if;
  select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '(none)') into v_post
    from pg_proc p
   where p.oid = to_regprocedure('clara._adj_template_hash(text,text,date,date,boolean,jsonb,text,jsonb)');
  if v_post is distinct from 'false|(none)' then
    raise exception 'F-A4 PR-2a tail: _adj_template_hash was promoted to % -- it must stay a plain sql function', v_post
      using errcode = 'CLR10', detail = '{"reason":"tail_hash_promoted"}';
  end if;

  -- ---- T.7 subject_kind EXTENDED, NEVER REWRITTEN --------------------------------------------
  select pg_get_constraintdef(c.oid) into v_txt from pg_constraint c
   where c.conrelid = 'clara.agent_act_receipts'::regclass and c.conname = 'ck_aar_subject_kind';
  select v into v_pre from _fa4_pr2a_prestate where k = 'subject_kind_check';
  foreach v_sig in array array['client', 'fiscal_year', 'close_run', 'close_receipt',
                               'journal_entry', 'snapshot', 'adjustment_template'] loop
    if position('''' || v_sig || '''' in v_txt) = 0 then
      raise exception 'F-A4 PR-2a tail: subject_kind no longer admits % -- this was an EXTENSION, not a rewrite', v_sig
        using errcode = 'CLR10', detail = '{"reason":"tail_subject_kind_lost"}';
    end if;
  end loop;

  -- ---- T.8 THE POLICY CENSUS READS EXPRESSIONS, NOT COUNTS (residual 3 / Annex B.2) -----------
  -- 0138's T.1 counted policies = 2 per table and read nothing about them, so FIX-6's own rank
  -- conjunct was never census-pinned and neither would §G's mirrors be. This reads polcmd, the
  -- resolved role names and the qual EXPRESSION, and asserts the rank conjunct by expression.
  -- QUALIFIED BY (RELATION, POLICY), never by polname alone (Codex C6). A policy name is unique
  -- per TABLE, not per database: a same-named policy on some other relation would satisfy a
  -- name-only probe, and the census would be reading a stranger's rule. Law 3 again -- a name is a
  -- projection of the thing.
  for v_sig in select unnest(array[
      'close_proposals|p_cp_human', 'close_prep_holds|p_cph_human',
      'document_service_periods|p_dsp_human']) loop
    select pg_get_expr(pol.polqual, pol.polrelid) into v_txt
      from pg_policy pol join pg_class c on c.oid = pol.polrelid
     where c.relnamespace = 'clara'::regnamespace
       and c.relname = split_part(v_sig, '|', 1)
       and pol.polname = split_part(v_sig, '|', 2);
    if v_txt is null then
      raise exception 'F-A4 PR-2a tail: policy % is absent', v_sig using errcode = 'CLR10';
    end if;
    if position('jwt_firm' in v_txt) = 0 then
      raise exception 'F-A4 PR-2a tail: policy % lost its firm predicate: %', v_sig, v_txt
        using errcode = 'CLR10', detail = '{"reason":"tail_policy_firm_lost"}';
    end if;
    if position('actor_role_rank' in v_txt) = 0 or position('bookkeeper' in v_txt) = 0 then
      raise exception 'F-A4 PR-2a tail: policy % carries no bookkeeper rank conjunct: %', v_sig, v_txt
        using errcode = 'CLR10', detail = '{"reason":"tail_policy_rank_missing"}';
    end if;
    if (select pol.polcmd from pg_policy pol join pg_class c on c.oid = pol.polrelid
         where c.relnamespace = 'clara'::regnamespace
           and c.relname = split_part(v_sig, '|', 1)
           and pol.polname = split_part(v_sig, '|', 2)) <> 'r' then
      raise exception 'F-A4 PR-2a tail: policy % is not SELECT-only', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- ---- T.9 THE INDEX CENSUS PINS relation + KEY COLUMNS + PREDICATE (residual 2 / Annex B.1) --
  -- 0138's T.1b pinned by relname + indisunique + "indpred is not null" -- a same-named index on
  -- ANOTHER table over OTHER columns with ANY predicate satisfies all three. Law 3: a name is a
  -- projection of the thing, not the thing.
  select count(*)::int into v_n from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
   where ic.relname = 'uq_document_service_period_live'
     and i.indrelid = 'clara.document_service_periods'::regclass
     and i.indisunique
     and pg_get_expr(i.indpred, i.indrelid) = '(superseded_at IS NULL)'
     and (select array_agg(a.attname::text order by a.attnum)
            from pg_attribute a
           where a.attrelid = i.indrelid and a.attnum = any (i.indkey::smallint[]))
         = array['document_id']::text[];
  if v_n <> 1 then
    raise exception 'F-A4 PR-2a tail: uq_document_service_period_live does not match its pinned relation/columns/predicate'
      using errcode = 'CLR10', detail = '{"reason":"tail_index_unpinned"}';
  end if;

  -- ---- T.10 THE THIRTEEN-COUNT FLIPS MOVE TOGETHER --------------------------------------------
  select v::int into v_n from _fa4_pr2a_prestate where k = 'allowlist_close_prep_pre';
  select count(*)::int into v_m from clara.wake_fn_allowlist where wake_kind = 'close_prep';
  if v_m <> v_n + 1 then
    raise exception 'F-A4 PR-2a tail: close_prep allowlist went % -> % (expected +1)', v_n, v_m
      using errcode = 'CLR10', detail = '{"reason":"tail_allowlist_delta"}';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist
   where wake_kind = 'close_prep' and to_regproc('clara.' || function_name) is null;
  if v_n <> 0 then
    raise exception 'F-A4 PR-2a tail: % close_prep allowlist row(s) name a function that does not exist', v_n
      using errcode = 'CLR10', detail = '{"reason":"tail_allowlist_dead"}';
  end if;
  -- 0138's T.9 proved the parked pair ABSENT by a positive read. This is that gate FLIPPED, at
  -- exact signatures (never a bare name), which the fold-seam law requires when a defect is fixed.
  if to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)') is null
     or to_regprocedure('clara.prepayment_schedule_v1(uuid,uuid)') is null then
    raise exception 'F-A4 PR-2a tail: the unparked pair does not resolve at its exact signatures'
      using errcode = 'CLR10', detail = '{"reason":"tail_unpark_absent"}';
  end if;
  -- WRAPPER 12 HOLDS EXACTLY ONE APPLICATION GRANT, and it is the interactive wake role.
  -- COUNTED, NOT MERELY FILTERED (Codex C6). The earlier form asked only whether a grant BEYOND
  -- clara_wake_interactive existed, which is satisfied by ZERO grants -- a wrapper nobody can call
  -- would have passed a census whose headline says "exactly one". Both directions now bind.
  select count(*)::int into v_n from pg_proc p, aclexplode(p.proacl) a
   where p.oid = to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)')
     and a.grantee <> p.proowner and a.privilege_type = 'EXECUTE';
  if v_n <> 1 then
    raise exception 'F-A4 PR-2a tail: wrapper 12 holds % application grant(s), expected exactly 1', v_n
      using errcode = 'CLR10', detail = '{"reason":"tail_wrapper_grant_count"}';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)')
                and a.grantee <> p.proowner
                and a.grantee::regrole::text <> 'clara_wake_interactive') then
    raise exception 'F-A4 PR-2a tail: wrapper 12 holds a grant beyond clara_wake_interactive'
      using errcode = 'CLR10', detail = '{"reason":"tail_wrapper_overgranted"}';
  end if;

  -- PR-2a's CLOSURE SHIPS DARK, and the tail pins it (Codex C6). deployed = false is a CLAIM this
  -- train makes -- that the runtime half is PR-2b's -- and an unpinned claim is one a later lane
  -- can flip without any cell noticing.
  if (select ev.deployed from clara.evaluator_versions ev
       where ev.evaluator_name = 'prepayment_schedule' and ev.version = 1) is distinct from false then
    raise exception 'F-A4 PR-2a tail: the prepayment_schedule v1 closure is not registered undeployed -- it must ship DARK until PR-2b''s own ceremony'
      using errcode = 'CLR10', detail = '{"reason":"tail_closure_not_dark"}';
  end if;

  -- ---- T.11 THE EVALUATOR'S CLOSURE IS GENUINELY SINGLE-MEMBER --------------------------------
  -- The structural half of W11, and the half that BINDS. The prosrc half (no clara.<name>( call
  -- site) is a SPELLING instrument and is stated in §C with its ceiling; this is the fact.
  select count(*)::int into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions ev on ev.id = m.evaluator_version_id
   where ev.evaluator_name = 'prepayment_schedule' and ev.version = 1;
  if v_n <> 1 then
    raise exception 'F-A4 PR-2a tail: the prepayment_schedule v1 closure has % member(s), not 1 -- an N-member registration freezes N bodies estate-wide', v_n
      using errcode = 'CLR10', detail = '{"reason":"tail_closure_not_single"}';
  end if;

  -- ---- T.12 THE RESOLVER'S SHIPPED CONTRACT, censused rather than assumed ---------------------
  -- REWRITTEN (Codex C7). This census used to describe the COMPOSITE-PARAMETER form and the
  -- `select *` property that made passing a `record` to it safe. That contract is gone: the
  -- row-type form was uncallable (deviations register, deviation (1)) and the shipped resolver
  -- takes (schedule, lines, period_start, period_end). A census describing a signature the estate
  -- does not have is worse than none -- it tells a reader the wrong thing WITH the authority of a
  -- passing gate. What it censuses now is the contract that actually ships:
  --   * the jsonb-pair signature resolves, and the row-type one does NOT exist to be called;
  --   * exactly two callers, the occurrence poster and the approve axis.
  if to_regprocedure('clara._adj_period_lines(jsonb,jsonb,date,date)') is null then
    raise exception 'F-A4 PR-2a tail: the resolver does not resolve at its shipped jsonb-pair signature'
      using errcode = 'CLR10', detail = '{"reason":"tail_resolver_signature"}';
  end if;
  if to_regprocedure('clara._adj_period_lines(clara.adjustment_templates,date,date)') is not null then
    raise exception 'F-A4 PR-2a tail: the uncallable row-type resolver overload exists -- a caller could bind to it and fail at runtime'
      using errcode = 'CLR10', detail = '{"reason":"tail_resolver_rowtype_overload"}';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.prosrc ~ '_adj_period_lines\s*\('
     and p.proname <> '_adj_period_lines';
  if v_n <> 2 then
    raise exception 'F-A4 PR-2a tail: _adj_period_lines has % caller(s), expected exactly 2 (the occurrence poster and the approve axis)', v_n
      using errcode = 'CLR10', detail = '{"reason":"tail_resolver_callers"}';
  end if;

  -- ---- T.12b THE REPLAY IDENTITY'S COLUMN, and the freeze it inherits ------------------------
  -- Two claims, because the column is worth nothing without the second one. A digest a signer could
  -- UPDATE is not an identity -- it is a suggestion, and the replay comparison built on it would be
  -- comparing against whatever was written last.
  --   (1) the column EXISTS and is text -- the replay reads it and the propose INSERT writes it.
  --       The VALUE it is meant to hold is 64 hex characters (sha256, the estate's canonical
  --       spelling); the column stays plain `text` rather than char(64) because the estate hashes
  --       into `text` everywhere else and a width constraint here would be a second, weaker place
  --       for the same fact to be stated. The 64-character shape is asserted where it can be
  --       measured on a real act -- cell W45-frozen, on a digest the verb actually wrote;
  --   (2) it is FROZEN. Read the polarity carefully: v_frozen in
  --       clara._tf_adjustment_template_transition is the set of columns EXEMPTED from the
  --       immutability compare (the lifecycle stamps), so the proof of immutability is ABSENCE from
  --       that array, not presence in it. The trigger is deny-by-default over everything else, and
  --       T.7's differential separately proves its body is byte-identical to the prestate sha -- so
  --       this asserts the ONE thing that differential cannot: that the new column did not land
  --       inside the exemption. Cell W45 proves the behaviour from the outside.
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.adjustment_templates'::regclass
                    and a.attname = 'proposed_request_digest' and a.atttypid = 'text'::regtype
                    and a.attnum > 0 and not a.attisdropped) then
    raise exception 'F-A4 PR-2a tail: adjustment_templates.proposed_request_digest is absent or not text -- the replay identity has nothing to ride'
      using errcode = 'CLR10', detail = '{"reason":"tail_request_digest_column"}';
  end if;
  -- THE PRIMITIVE IS CENSUSED, because this file's first cut got it wrong. The digest must be
  -- sha256 in the estate's canonical spelling, and md5 must not appear in the agent core at all --
  -- a later hand reaching for the shorter idiom would silently weaken an identity while every
  -- behavioural cell stayed green (the shape assertions would still pass at 32 characters if they
  -- were written loosely). This is a SPELLING instrument and says so; W45-frozen carries the
  -- behavioural half, measuring 64 hex characters on a digest the verb actually wrote.
  select p.prosrc into v_txt from pg_proc p
   where p.oid = to_regprocedure('clara._agent_prepayment_schedule_core(jsonb,uuid,uuid,text,text,text,jsonb,text)');
  -- COMMENTS ARE MASKED BEFORE THE SCAN, and that is not tidiness: this body's own comment EXPLAINS
  -- why md5 was rejected, so an un-masked scan would fire on the explanation and this census would
  -- have failed on the very file that fixed the defect. The estate has met that class before (the
  -- wiki gate reading a CoR comment); the answer is the same one -- strip `--` runs, then read.
  v_txt := regexp_replace(coalesce(v_txt, ''), '--[^\n]*', '', 'g');
  if v_txt = '' or v_txt !~ 'encode\(sha256\(convert_to\(' or v_txt ~ 'md5\(' then
    raise exception 'F-A4 PR-2a tail: the agent core''s request digest is not the estate''s canonical sha256 form (or md5 has reappeared in its CODE)'
      using errcode = 'CLR10', detail = '{"reason":"tail_request_digest_primitive"}';
  end if;

  select p.prosrc into v_txt from pg_proc p
   where p.oid = to_regprocedure('clara._tf_adjustment_template_transition()');
  if v_txt is null then
    raise exception 'F-A4 PR-2a tail: the adjustment-template transition trigger body did not resolve'
      using errcode = 'CLR10', detail = '{"reason":"tail_transition_body_absent"}';
  end if;
  if v_txt ~ '''proposed_request_digest''' then
    raise exception 'F-A4 PR-2a tail: proposed_request_digest is named inside the transition trigger -- if it entered v_frozen it is EXEMPT from the immutability compare and a signer could rewrite the replay identity'
      using errcode = 'CLR10', detail = '{"reason":"tail_request_digest_not_frozen"}';
  end if;

  -- ---- T.13 CONSTRAINT 15: the frozen schemas ------------------------------------------------
  -- REPORTED, NOT ASSERTED AT ZERO. On live those schemas hold the Slice-0 parked run, so a census
  -- that reads green only because the fixture is empty is the vacuous-green class. What this file
  -- can claim is that it created nothing outside `clara`, and that is what is measured.
  select count(*)::int into v_frozen from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname in ('workflow', 'graphile_worker', 'spike');
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('workflow', 'graphile_worker', 'spike')
     and (p.proname like 'wake!_%' escape '!' or p.proname like '!_adj!_%' escape '!'
          or p.proname like 'prepayment!_%' escape '!' or p.proname like '!_record!_document%' escape '!');
  if v_n <> 0 then
    raise exception 'F-A4 PR-2a tail: % PR-2a function(s) landed in a frozen schema', v_n
      using errcode = 'CLR10', detail = '{"reason":"tail_frozen_schema"}';
  end if;
  if (select ns.nspname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where c.oid = to_regclass('clara.document_service_periods')) is distinct from 'clara' then
    raise exception 'F-A4 PR-2a tail: document_service_periods was created outside schema clara'
      using errcode = 'CLR10';
  end if;

  raise notice 'F-A4 PR-2a tail: OK — the park is OVER. Wrapper 12 (clara.wake_establish_prepayment_schedule) and clara.prepayment_schedule_v1 both resolve at their EXACT signatures, inverting 0138 T.9''s positive-absence gate; the close_prep allowlist moved % -> % (a MEASURED delta, not a literal) with 0 rows naming a dead function, and wrapper 12 holds exactly ONE application grant, to clara_wake_interactive. 10 new functions + clara.document_service_periods all resolve, ALL owned by clara_fn_owner (a definer body owned by the migration role would bypass RLS), and ZERO functions this file creates or replaces are executable by PUBLIC. EXACTLY ONE overload of propose_adjustment_template survives at eleven arguments with its harvested ACL — the extraction REPLACED the door rather than shadowing it. 9 internals hold no EXECUTE grant beyond their owner, _tf_close_proposal_drafted_unique among them (residual 4''s migration half; its rig-meta half joins the PR-1c cohort separately, because 0138''s own closed set lives in an APPLIED file and applied files are immutable). The R6 SCOPE CUT IS PROVEN, not promised: sign_adjustment_template, _adj_canon_lines and _tf_adjustment_template_transition are byte-identical to their prestate shas, and _adj_template_hash is still a plain sql function with no definer and no search_path. subject_kind EXTENDED to seven values with all six originals intact. Three human-read policies carry BOTH the firm predicate and the bookkeeper rank conjunct, asserted by EXPRESSION and not by count, and all three are SELECT-only. uq_document_service_period_live is pinned by relation, key column and predicate text rather than by name. The prepayment_schedule v1 closure has exactly ONE member, so the freeze means this body and no other. clara._adj_period_lines has exactly 2 callers. adjustment_templates.proposed_request_digest exists as text (sha256 in the estate''s canonical spelling, 64 hex characters -- NOT md5, whose chosen-prefix collisions are practical and whose use here would have claimed more than it delivers) and is NOT named inside the transition trigger — absence from v_frozen is what makes it immutable, so the replay identity cannot be rewritten by a later signer. FROZEN SCHEMAS (constraint 15): all 3 checks positive — nothing this file created lives outside clara — and the % relation(s) workflow/graphile_worker/spike hold are REPORTED, not asserted (on live that is the Slice-0 parked run and is expected to be non-zero).',
    (select v from _fa4_pr2a_prestate where k = 'allowlist_close_prep_pre'),
    (select count(*) from clara.wake_fn_allowlist where wake_kind = 'close_prep'),
    v_frozen;
end $tail$;

