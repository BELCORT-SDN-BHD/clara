-- =================================================================================================
-- F-A4 · Close key ① · PR-1c — THE CLOSE-DOMAIN AGENT LIMB (ADDITIVE; no D1 write-quiesce window).
--
-- Design of record: docs/plan/active/close-key-1-design.md v2 (gate 2 folded,
-- close-key-1-gate-record.md), §5 step 4: "PR-1c — ADDITIVE, no ceremony. The three new tables and
-- their triggers · the read extractions · the two new evaluators · the F14 siblings ·
-- _adjustment_run_due_core if OQ-9 rules (a) · the thirteen wrappers, allowlist rows,
-- roster/census surfaces and the tail census."
-- Annexes: close-key-1-annexes-1-mechanics.md (A the ladder · B the evaluators · C the wake-kind
-- census · D the battery) and close-key-1-annexes-2-record.md (E shapes/signatures/vocabulary ·
-- F the D1 lists · G the decision register · I the doors and the T17 pins).
--
-- WHAT LANDS HERE, section by section (every object cites the design line that ruled it):
--   §0  prestate — every claim this file makes about what it is editing, measured before it edits
--   §A  the three new tables (Annex E.3 agent_act_receipts · E.4 close_proposals ·
--       E.5 close_prep_holds) + their triggers, forced RLS and policy pairs
--   §B  Tier C — the deferred agent-receipt wall on clara.close_runs (design §3.2 Tier C)
--   §C  F14's two siblings: clara._wake_task_id() + clara.mint_wake_credential_for_task(...) (D-13)
--   §D  the three read extractions, CoR'd but WINDOW-FREE (Annex F.3): _list_fiscal_years_core
--       (D-17) · _close_readiness_core · _verify_close_core
--   §E  OQ-9(a)/R-L11: the additive ungranted clara._adjustment_run_due_core below the live
--       oracle's own admission; clara.adjustment_run_due becomes a thin delegate (D-26)
--   §F  the due oracle clara.close_prep_due() (Annex B.1)
--   §G  the shared Tier-A/Tier-B machinery + the one receipt writer
--   §H  the TWELVE wake wrappers and their agent cores (§3.1's table)
--   §I  the human doors: hold_close_prep / release_close_prep / list_agent_act_receipts
--   §J  the wake_fn_allowlist rows + the EXECUTE grants
--   §TAIL the census a reviewer reads
--
-- ============================ FOUR DEVIATIONS, DECLARED NOT SLIPPED ============================
--
-- Numbered (1) (4) (3) (2) below, in the order they were discovered rather than renumbered: the
-- FA-oracle correction (4) was measured after the first three were written, and renumbering a
-- deviation after a review has cited it is how a citation quietly comes to mean other work. The
-- count in this banner is trued; the numbers deliberately are not.
--
-- (1) TWELVE WRAPPERS, NOT THIRTEEN. `wake_establish_prepayment_schedule` (§3.1 row 12) and its
--     evaluator `clara.prepayment_schedule_v1` (Annex B.2) are PARKED, with two measured blockers:
--       (a) §3.1 routes the wrapper through "the live propose/sign template cores". THERE ARE NO
--           SUCH CORES. `clara.propose_adjustment_template` opens `_human_ctx(role_rank(
--           'bookkeeper'))` as its first statement (0045:3757) and `clara.sign_adjustment_template`
--           opens `_human_ctx(role_rank('admin'))` (0045:4269); neither has an extracted core
--           anywhere in the estate. Building the verb therefore means recutting TWO deployed
--           audited writers (both INSERT/UPDATE clara.adjustment_templates, both _audit and
--           _append_event) — a D1 write-quiesce obligation absent from BOTH of Annex F's windows,
--           inside the one PR the design calls "ADDITIVE, no ceremony". It is the same class of
--           finding gate 2 raised as GB-2 for snapshot_state/propose_fiscal_year, in a row the
--           gate did not re-derive.
--       (b) Annex B.2 derives the term from "the bound document's facts". No such fact exists:
--           clara.documents (0003:64-77) carries no service period, there is no document-fact
--           register, and clara.client_facts (0055:386) is client-grain, not entry-grain. With no
--           DB-owned term carrier, OQ-4's ruled fail-closed answer (`prepayment_term_underivable`,
--           never a 12-month default) is the ONLY answer the evaluator could return today — and
--           registering a v1 closure in clara.evaluator_versions freezes that body permanently
--           (law 9 applied to evaluators, Annex B.2's own words), so the real shape would have to
--           ship as `_v2`.
--     Neither is a builder's call: (a) needs a window and an authority ruling (may the clocked lane
--     reach an ADMIN-floor signing act?), (b) needs a design answer about which DB-owned fact
--     carries a prepayment term. Both are reported, not guessed. `wake_establish_prepayment_schedule`
--     and `clara.prepayment_schedule_v1` are named-absent here so a later reader finds the reason
--     rather than the absence (law 31's dead-member discipline). Every count in this file's census
--     is TWELVE and says so.
--
-- (2) THE GRANTS SHIP HERE, not with their consumer's PR. Annex I.2 rules that "grants ride with
--     their consumer's PR"; its own gate note (GB-2/GB-3) then conditions the roster row on cells
--     C-19/C-21/C-22 being green — and those three cells are PR-1c's OWN. Weighed against that: the
--     estate's every shipped agent limb grants its wrappers in the migration that creates them
--     (F-A3 PR-1b 0121:5211ff → clara_wake_bank; F-A5 PR-2; F-A7 beta 0126; F-A5b PR-1), and
--     WITHOUT the grant no battery cell can drive a wrapper through a real wake session at all —
--     every behavioural cell would have to call as superuser, which bypasses the ACL and proves
--     nothing about the wall (review law 2). The grants are one `revoke` and one roster line to
--     reverse if the review lane rules the other way. Declared here so that ruling is cheap.
--
-- (4) THE FA DUE ORACLE GETS OQ-9(a)'s EXTRACTION TOO — a MEASURED CORRECTION to the design's own
--     byte-claim, not a widening. Gate finding G1 reads clara.depreciation_run_due at
--     `0041:3617-3630` and rules it "unaffected" because that text "compares a non-null jwt_firm()
--     only". At the LIVE catalog that body is gone: 0042's WDB-R1/WDB-R2 recut (owner ruling
--     2026-08-03) replaced the null-tolerant guard with `perform clara._assert_due_read_ctx(v_firm)`
--     precisely so the two-member due family "can no longer drift apart" — a superseded-body cite.
--     MEASURED on the rig: the live verb raises CLR03 `no valid read context` from a wake session,
--     so rung B13's arm 1 counted DUE (`fa_oracle_inevaluable`) on every clean year and the limb
--     refused every clocked close it exists to perform. §E.2 therefore applies R-L11's own shape to
--     the sibling: an additive ungranted `_depreciation_run_due_core` BELOW the admission, the live
--     verb keeping its own `_assert_due_read_ctx`. No answer, no grant and no admission moves for
--     any existing caller, and x42.d8's closed census ("exactly two bodies consult the shared
--     predicate") reads exactly as before — the tail asserts it. Design §7's non-goal, as narrowed
--     by D-26, is "no change to what the oracles ANSWER"; this changes none. **Design cells C-17
--     and C-19's FA twin must be re-cut**: C-17 pins `depreciation_run_due`'s prosrc "exactly as at
--     cfa0710" and C-19's twin claims it "answers on the same session both before and after" —
--     both were written from the stale cite and are false at the frontier, before this file and
--     after it.
--
-- (3) EVERY WRAPPER TAKES THE RECEIPT TRIPLE, reads included. Annex E.1's signature table gives
--     wrappers 1-6 `p_op_key` alone — but Annex E.3 makes `model_name`, `model_version` and
--     `rationale` NOT NULL and non-blank on every agent_act_receipts row, and rung B2 applies to
--     "every verb" (design §3.2). A read wrapper with no triple cannot write the receipt E.1's own
--     sentence says it mints. The three arguments are therefore uniform across all twelve. One
--     spelling for one discipline.
--
-- ================== CARRIED FORWARD BY NAME, not by silence (FIX-10) ==================
-- One battery gap is knowingly carried into PR-2/PR-3 acceptance rather than closed here, and it
-- is named so a later reader finds the reason instead of the absence:
--
--   * RUNG B13, ARM 1 (reason `fa_period_due`) -- the STRANDED-PRIOR-YEAR half of D-22. Arm 2 (an
--     outstanding belt draft dated at or before the FY end) is proven both polarities by cell
--     fa4c.B1b, and arm 3 (the ADJ oracle) by fa4c.F1. Arm 1 needs a real FA register carrying a
--     period stranded in an EARLIER fiscal year -- the fixture the design itself prices at cell
--     C-20 (i) -- and standing one up here would make a close cell an FA cell wearing its name.
--     The arm FAILS CLOSED by construction (an inevaluable or anomalous due-probe answer counts
--     as DUE and refuses the freeze), so the carried risk is a freeze that refuses when it need
--     not, never one that proceeds when it must not.
--
-- Everything else the review named as unfired is now driven: B3 (fa4c.R1, with a clean control
-- year as its mutant), B14 (fa4c.R2, which also proves the rung and clara.close_prep_due() read
-- the SAME population in both directions), and C-5 (fa4c.R5, the ACTED catch-up with its receipt
-- census asserted afterward).
--
-- ================ THE DOCS THIS FILE FALSIFIES — the exact lines owed a re-cut ================
-- Conductor ruling (this train): deviation (4) is ACCEPTED as inside R-L11, and the DESIGN-SIDE
-- truing folds into this train's PR. These are the lines, enumerated here so the docs pass is a
-- transcription rather than a re-derivation. EVERY ONE of them rests on the SAME superseded cite
-- (`0041:3617-3630`), and every one is false BEFORE this file and after it — this migration did not
-- break them, it measured that 0042's WDB-R1/WDB-R2 recut already had.
--
--   · docs/plan/active/close-key-1-design.md:88 — gate finding G1's own row ends
--     "`depreciation_run_due` (`0041:3617-3630`) is unaffected". It is affected: the live body
--     carries `perform clara._assert_due_read_ctx(v_firm)` and raises CLR03 on a wake session.
--   · docs/plan/active/close-key-1-annexes-1-mechanics.md:118-119 — Annex A.3's rung-B13 arm 1
--     opens "clara.depreciation_run_due(p_client) is wake-safe (`0041:3617-3630` compares a
--     non-null jwt_firm() only, and jwt_firm() is null here)". Both halves of that parenthesis
--     describe a body that no longer exists.
--   · docs/plan/active/close-key-1-annexes-1-mechanics.md:515 — cell C-19's closing sentence,
--     "Twin: `depreciation_run_due` answers on the same session both before and after". It answers
--     on NEITHER. (The cell's main clause about `adjustment_run_due` also needs one word of care:
--     at the live frontier clara_wake_interactive holds no EXECUTE on that verb at all, so the ACL
--     refuses 42501 one rung EARLIER than the admission's CLR03. Both codes mean "unreachable from
--     this lane", which is what GB-1 rests on; the battery asserts the disjunction and records
--     which one fired.)
--   · docs/plan/active/close-key-1-annexes-1-mechanics.md:520 — cell C-17 pins the `prosrc` of
--     `depreciation_run_due(uuid)` "exactly as at `cfa0710`". This file recuts it into a thin
--     delegate; the other three names in that cell (`adjustment_run_due` aside, which D-26 already
--     exempts) are untouched and the pin on them stands.
--   · docs/plan/active/close-key-1-gate-record.md:67 — "The FA twin is fine (`0041:3617-3630`
--     compares a non-null `jwt_firm()` only)."
--   · docs/plan/active/close-key-1-gate-record.md:448 — the GB-1 verification recipe's "the twin
--     call to `depreciation_run_due` answers".
--
-- WHAT THE RE-CUT MUST NOT SAY: that the FA oracle was ever *changed by F-A4* to carry the
-- admission. It was carrying it before this lane opened. The design read a two-year-old line
-- number; the estate had moved. That is the finding, and it is the reason the review brief's
-- MUST-VERIFY is "human-session answers byte-unchanged for BOTH oracles" — cells fa4c.F1 and
-- §TAIL T.6 both measure it, and the four EXECUTE grants are counted, not assumed.
--
-- LOCK INVENTORY (there is no D1 row here; this line exists so nobody has to derive it):
--   · §B installs a CONSTRAINT TRIGGER on the LIVE table clara.close_runs — ACCESS EXCLUSIVE on
--     that table for the length of the DDL statement. No writer BODY is replaced, so PostgreSQL's
--     in-flight-call hazard (the D1 rule, .claude/rules/db-migrations.md) does not arise. A
--     `lock_timeout` is set below so the migration fails fast rather than queueing behind a live
--     close.
--   · §D and §E CREATE OR REPLACE five bodies — clara.list_fiscal_years, clara.get_close_readiness,
--     clara.verify_close (all three `stable`, write nothing, reached from no writer's transaction —
--     Annex F.3's own carve-out), clara.adjustment_run_due (likewise `stable`, D-26/R-L11) and
--     clara.depreciation_run_due (likewise `stable`; deviation (4) below states why it joins them).
--     Each is pinned at prestate and re-proven at the tail; none is a D1 row by Annex F's own
--     definition — no audited WRITER's body is replaced anywhere in this file.
--   · Everything else in this file is CREATE-only over objects that did not exist.
--
-- G1's INSERT-AND-FLIP OBLIGATION IS **NOT** DISCHARGED HERE, deliberately. 0133 already seeded
-- clara.wake_engine_sources' `close_prep` row with enabled=false (0133:788-792,
-- carrier='direct_queue', task_kind='close_prep', workflow_export='closePrep'). The flip is
-- `set_wake_source_enabled`'s and belongs to the PR that ships the closePrep.v1 workflow body
-- (PR-2) — flipping a source whose workflow does not exist would register a claimable source with
-- nothing to execute it. The tail below ASSERTS the row is still enabled=false.
--
-- SUPERSEDED DESIGN FACT, recorded rather than silently absorbed: Annex C's `mint_wake_credential`
-- row says the live body "keeps its FOUR-kind list and refuses close_prep". Gate G1 changed that —
-- 0133:713 admits 'close_prep' in the live body's early kind gate and 0133:753-761 carries its own
-- per-kind arm. The sibling `mint_wake_credential_for_task` therefore exists for the ONE thing the
-- live body still cannot do: record `wake_credentials.agent_task_id` (F14/D-13's binding). The
-- live five-arg body is byte-untouched by this file, and the tail pins it.
-- =================================================================================================

set local statement_timeout = '20min';   -- PRECAUTIONARY (nothing here is heavy).
set local lock_timeout = '15s';          -- LOAD-BEARING: §B takes ACCESS EXCLUSIVE on close_runs.

-- =================================================================================================
-- §0 · PRESTATE — measure every claim, abort on a false premise.
-- =================================================================================================
create temporary table _fa4_pr1c_pre (k text primary key, v text) on commit drop;

do $pre$
declare v_def text; v_n int;
begin
  insert into _fa4_pr1c_pre(k, v) values
    ('session_user', current_user), ('current_role', current_role);

  -- 0.1 · PR-1b's six ALTERs are LIVE (this file authors against them).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_kind_0011';
  if v_def is null or position('close_prep' in v_def) = 0 then
    raise exception 'F-A4 PR-1c prestate: ck_wake_credentials_kind_0011 does not admit close_prep (%); PR-1b (0120) is not applied', coalesce(v_def, '<absent>')
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.wake_credentials'::regclass and c.conname = 'ck_wake_credentials_client_0011';
  if v_def is null or position('close_prep' in v_def) = 0 then
    raise exception 'F-A4 PR-1c prestate: ck_wake_credentials_client_0011 does not pin close_prep to a client' using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.agent_tasks'::regclass and c.conname = 'ck_agent_tasks_kind_0011';
  if v_def is null or position('close_prep' in v_def) = 0 then
    raise exception 'F-A4 PR-1c prestate: agent_tasks.kind does not admit close_prep' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'clara' and table_name = 'wake_credentials'
                    and column_name = 'agent_task_id') then
    raise exception 'F-A4 PR-1c prestate: wake_credentials.agent_task_id is absent — F14 has no carrier' using errcode = 'CLR10';
  end if;

  -- 0.2 · The delegates this file's wrappers reach MUST already exist, by EXACT signature
  -- (law 3: a name is a projection of the thing, an exact regprocedure IS the thing).
  foreach v_def in array array[
      'clara._begin_close_core(uuid,uuid,uuid,text)',
      'clara._abandon_close_core(uuid,uuid,uuid,text,text)',
      'clara._open_fiscal_year_core(uuid,uuid,uuid,text,date,date,text,text,text)',
      'clara._propose_fiscal_year_core(uuid,uuid,date)',
      'clara._mint_month_snapshot_core(uuid,uuid,uuid,date,text)',
      'clara._close_dry_run_core(uuid,uuid)',
      'clara._measure_one_gate(text,uuid,uuid)',
      'clara._snapshot_state_core(uuid)',
      'clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)',
      'clara.get_close_plan(uuid)',
      'clara.depreciation_run_due(uuid)',
      'clara.adjustment_run_due(uuid)',
      'clara._close_gate_drafts(uuid,uuid)',
      'clara.attest_close_exception(uuid,text,text,text,text,uuid)']
  loop
    if to_regprocedure(v_def) is null then
      raise exception 'F-A4 PR-1c prestate: delegate % does not resolve at its pinned signature', v_def using errcode = 'CLR10';
    end if;
  end loop;

  -- 0.3 · attest_close_exception's p_from_proposal arm ALREADY reads clara.close_proposals
  -- (0120:1010-1041). Pin the exact column vocabulary it reads, so §A's table cannot ship a shape
  -- that arm cannot consume. This is a POSITIVE read of the live body, not an assumption.
  select p.prosrc into v_def from pg_proc p
    where p.oid = 'clara.attest_close_exception(uuid,text,text,text,text,uuid)'::regprocedure;
  if position('from clara.close_proposals cp, jsonb_array_elements(cp.drafted) x(el)' in v_def) = 0
     or position('cp.bound_digests ->> p_check_key' in v_def) = 0
     or position('cp.id = p_from_proposal and cp.close_run_id = p_close_run' in v_def) = 0
     or position('(x.el ->> ''check_key'') = p_check_key and (x.el ->> ''item_key'') = v_item' in v_def) = 0
     or position('select cp.state, x.el ->> ''text''' in v_def) = 0 then
    raise exception 'F-A4 PR-1c prestate: attest_close_exception''s p_from_proposal arm does not read the pinned close_proposals shape — the carrier below would not satisfy it'
      using errcode = 'CLR10';
  end if;

  -- 0.4 · The three read bodies §D extracts, and the ADJ oracle §E extracts, pinned by prosrc sha
  -- so the tail can prove ONLY the intended change moved (the F-A3/PR-1b superseded-body lesson).
  insert into _fa4_pr1c_pre(k, v)
    select 'prosrc_sha:' || s,
           encode(sha256(convert_to((select p.prosrc from pg_proc p where p.oid = s::regprocedure), 'UTF8')), 'hex')
      from unnest(array['clara.list_fiscal_years(uuid)', 'clara.get_close_readiness(uuid,uuid)',
                        'clara.verify_close(uuid)', 'clara.adjustment_run_due(uuid)',
                        'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)',
                        'clara.wake_context()',
                        'clara._close_gate_uncoded(uuid,uuid)']) s;
  -- The four bodies about to be REPLACED must each carry the tail we are moving out, verbatim —
  -- otherwise the extraction below is being written against a body that is no longer live.
  select p.prosrc into v_def from pg_proc p where p.oid = 'clara.adjustment_run_due(uuid)'::regprocedure;
  if position('perform clara._assert_due_read_ctx(v_firm);' in v_def) = 0 then
    raise exception 'F-A4 PR-1c prestate: adjustment_run_due no longer opens with _assert_due_read_ctx — OQ-9(a)''s cut line has moved' using errcode = 'CLR10';
  end if;
  -- MEASURED, NOT ASSUMED — and it REFUTES the design's own byte-claim (see §E.2's header):
  -- clara.depreciation_run_due carries the SAME admission. Gate finding G1 read it at 0041:3617-3630
  -- ("compares a non-null jwt_firm() only") and concluded it "is unaffected"; 0042's WDB-R1/WDB-R2
  -- recut replaced that guard with _assert_due_read_ctx, so the design's cite is a superseded-body
  -- cite. If a future frontier moves it again, this pin fails loudly rather than letting §E.2's
  -- extraction be written against a body that is no longer live.
  select p.prosrc into v_def from pg_proc p where p.oid = 'clara.depreciation_run_due(uuid)'::regprocedure;
  if position('perform clara._assert_due_read_ctx(v_firm);' in v_def) = 0 then
    raise exception 'F-A4 PR-1c prestate: depreciation_run_due does not open with _assert_due_read_ctx — re-derive §E.2 against the live body' using errcode = 'CLR10';
  end if;

  -- 0.5 · The three new tables must NOT already exist.
  foreach v_def in array array['agent_act_receipts', 'close_proposals', 'close_prep_holds'] loop
    if to_regclass('clara.' || v_def) is not null then
      raise exception 'F-A4 PR-1c prestate: clara.% already exists', v_def using errcode = 'CLR10';
    end if;
  end loop;

  -- 0.6 · The close gate catalog is FOURTEEN rows (census C15, PR-1a's own extension).
  select count(*)::int into v_n from clara.close_gate_checks;
  if v_n <> 14 then
    raise exception 'F-A4 PR-1c prestate: close_gate_checks carries % rows, expected 14 (census C15)', v_n using errcode = 'CLR10';
  end if;

  -- 0.7 · G1's close_prep registry row is present and DISABLED; this file leaves it that way.
  if not exists (select 1 from clara.wake_engine_sources
                  where source_key = 'close_prep' and enabled = false) then
    raise exception 'F-A4 PR-1c prestate: the close_prep wake_engine_sources row is absent or already enabled' using errcode = 'CLR10';
  end if;

  -- 0.8 · The wake allowlist carries ZERO close_prep rows today (§J adds exactly twelve), and the
  -- OTHER kinds' population is captured so the tail can prove extend-only by an actual difference
  -- rather than by a total (N1).
  select count(*)::int into v_n from clara.wake_fn_allowlist where wake_kind = 'close_prep';
  if v_n <> 0 then
    raise exception 'F-A4 PR-1c prestate: wake_fn_allowlist already carries % close_prep row(s)', v_n using errcode = 'CLR10';
  end if;
  insert into _fa4_pr1c_pre(k, v)
    select 'allowlist_other_kinds', count(*)::text from clara.wake_fn_allowlist where wake_kind <> 'close_prep';

  raise notice 'F-A4 PR-1c prestate: OK — PR-1b''s six ALTERs live, 14 delegates resolve at pinned signatures, attest_close_exception''s p_from_proposal arm reads the pinned close_proposals shape, 7 prosrc shas pinned, 3 target tables absent, 14 gate-catalog rows, close_prep source registered-and-disabled, 0 close_prep allowlist rows.';
end $pre$;

set role clara_fn_owner;

-- =================================================================================================
-- §A · THE THREE NEW TABLES (Annex E.3 / E.4 / E.5).
-- =================================================================================================

-- -------------------------------------------------------------------------------------------------
-- A.1 · clara.agent_act_receipts — TA-P4's ONE carrier for every agent judgement act (design §3.8,
-- Annex E.3, D-05). Deliberately GENERIC so F-A5/F-A6/F-A8 adopt it rather than each minting their
-- own; F-A2's entry_post_receipts and F-A3's bank_agent_receipts stay as shipped (risk R-4 —
-- convergence is a Wave-G question, never a mid-wave recut of a live table).
--
-- WHY NEITHER audit_log NOR close_receipts (Annex E.3's own paragraph, restated because a reviewer
-- should not have to open a second file): audit_log has no model/version/rationale column and its
-- `outcome` CHECK admits only 'ok' (0002:285), so a REFUSED act cannot be recorded there at all;
-- close_receipts is minted only by finalize and reopen — two HUMAN acts — and its belt requires a
-- `closing_position` (0056:1547) no agent act has.
--
-- `via_wake_kind` IS NOT NULL HERE and NULL on audit_log at BOTH entrances, deliberately (gate
-- GR-2): a human act has no wake kind, and on the agent path the wake context lives on this row.
-- The contract's "via_wake_kind stops being NULL" is discharged HERE, on TA-P4's carrier.
-- -------------------------------------------------------------------------------------------------
create table clara.agent_act_receipts (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null references clara.firms(id),
  client_id       uuid        not null,
  -- CLOSED; extend, never rewrite. 'prepayment_schedule' is present and CURRENTLY HAS NO WRITER:
  -- its verb (wake_establish_prepayment_schedule) is parked on the two blockers in this file's
  -- header. It is listed rather than dropped because the design ruled it in and the value is a
  -- SHAPE, not a live claim — a later PR that unparks the verb extends nothing.
  act_kind        text        not null check (act_kind in ('close_read', 'close_dry_run', 'open_fy',
                                'begin_close', 'abandon_close', 'propose_close',
                                'depreciation_catchup', 'prepayment_schedule', 'mint_snapshot')),
  subject_kind    text        not null check (subject_kind in ('client', 'fiscal_year', 'close_run',
                                'close_receipt', 'journal_entry', 'snapshot')),
  subject_id      uuid        not null,
  acting_actor    uuid        not null references clara.users(id),
  -- NULL on the clocked lane and NEVER inferred (law 68). A close_prep credential is minted with
  -- on_behalf_of NULL by construction (mint_wake_credential's own close_prep arm, 0133:753-761).
  on_behalf_of    uuid        references clara.users(id),
  via_wake_kind   text        not null check (btrim(via_wake_kind) <> ''),
  -- TA-P4 (2)'s MECHANICAL binding. Read from clara._wake_task_id() inside the wrapper, NEVER a
  -- caller argument — a caller-supplied task id is the model asserting its own provenance.
  wake_task_id    uuid        not null references clara.agent_tasks(id),
  model_name      text        not null check (btrim(model_name) <> ''),
  model_version   text        not null check (btrim(model_version) <> ''),
  rationale       text        not null check (btrim(rationale) <> '' and length(rationale) <= 4000),
  verdict         text        not null check (verdict in ('acted', 'refused')),
  -- The FULL failing vector, not the first failure: a refusal explains everything wrong at once
  -- rather than one thing per wake (design §3.2 Tier B's closing paragraph).
  rung_vector     jsonb       not null default '[]'::jsonb check (jsonb_typeof(rung_vector) = 'array'),
  -- The failing vector's canonical digest, STORED so it can carry a unique key (FIX-1). jsonb's
  -- ::text rendering is canonical for a given value — same vector, same digest, always — so this
  -- is a deterministic restatement of rung_vector and never an independent fact that could drift
  -- from it.
  rung_digest     text        generated always as (md5(rung_vector::text)) stored,
  op_key          text        not null check (btrim(op_key) <> ''),
  created_at      timestamptz not null default now(),
  -- Annex E.3's uq_aar, firm-scoped: an op_key string is client-chosen and was never meant to be
  -- globally unique across every firm on the estate (F-A3's own B3 correction, applied at birth).
  --
  -- THE OUTCOME JOINS THE KEY (FIX-1, both review lanes). Annex E.3 spells uq_aar without it, and
  -- the first cut followed the annex — which made a same-task retry whose OUTCOME had changed
  -- collide with the standing row, so ON CONFLICT DO NOTHING returned the OTHER outcome's receipt
  -- id under this call's status. Rig-reproduced both directions: refused->acted answered
  -- `status='acted'` while naming a REFUSED receipt (for the depreciation catch-up, real journal
  -- entries with the ledger denying them), and acted->refused returned the earlier ACTED row so
  -- the refusal left no trace at all.
  --
  -- The key therefore carries `verdict` AND `rung_digest`, and the second is not belt-and-braces:
  -- with verdict alone, a task that refuses for one reason and then refuses for a DIFFERENT one
  -- (a hold set between two calls) still collides, and the honest second refusal would have to
  -- either overwrite the first (mutation, forbidden) or abort the transaction — losing exactly
  -- the trace this fix exists to keep. Keyed on the digest, each distinct outcome is its own
  -- durable row and the identity guard in _agent_close_receipt can then be strict without ever
  -- refusing an honest act.
  --
  -- Design semantics are unchanged: D-25 / cell B-11 make a same-task retry of the SAME outcome a
  -- REPLAY, and that is exactly what still happens — identical vector, identical digest, one row,
  -- the stored id returned. What can no longer happen is one outcome wearing another's receipt.
  constraint uq_aar unique (firm_id, act_kind, subject_kind, subject_id, op_key, verdict, rung_digest),
  constraint ck_aar_vector check ((verdict = 'acted') = (jsonb_array_length(rung_vector) = 0)),
  constraint fk_aar_client foreign key (client_id, firm_id) references clara.clients (id, firm_id)
);
comment on table clara.agent_act_receipts is
  'F-A4 (TA-P4 A, design §3.8, Annex E.3): ONE row per agent judgement act on the close domain — '
  'acted or refused, both durable. Written only inside an agent core, in the same transaction as '
  'the act, so a rollback takes the receipt with it. Append-only, FORCE RLS, ZERO DML grant to '
  'every role (the close_write_permits posture, 0056:626-630); read is through '
  'clara.list_agent_act_receipts only. Deliberately GENERIC (D-05) so F-A5/F-A6/F-A8 adopt it.';

create index ix_aar_client on clara.agent_act_receipts (client_id, created_at desc);
create index ix_aar_subject on clara.agent_act_receipts (subject_kind, subject_id, created_at desc);
create index ix_aar_task on clara.agent_act_receipts (wake_task_id);

alter table clara.agent_act_receipts enable row level security;
alter table clara.agent_act_receipts force row level security;
create policy p_aar_owner on clara.agent_act_receipts
  for all to clara_fn_owner using (true) with check (true);
-- THE BOOKKEEPER FLOOR HOLDS ON THE DIRECT PATH TOO (FIX-6). TA-P4 (4) puts this surface at
-- bookkeeper+, and clara.list_agent_act_receipts enforces that — but a plain
-- `select * from clara.agent_act_receipts` never goes through the reader, so a firm VIEWER with a
-- JWT could read every model name, rationale, wake task and failing-rung vector the lane has ever
-- written. The floor therefore lives in the POLICY, where it binds every reader rather than the
-- one that happens to be polite. Consumers censused before choosing this over revoking SELECT:
-- the gated reader is the only consumer in the estate today (the dashboard panel is PR-3's), so
-- folding the rank in costs no live caller and leaves the table readable for the bookkeeper+
-- surfaces that are coming.
create policy p_aar_human on clara.agent_act_receipts
  for select to clara_authenticated
  using (firm_id = clara.jwt_firm()
         and clara.actor_role_rank() >= clara.role_rank('bookkeeper'));
grant select on clara.agent_act_receipts to clara_authenticated;
create trigger t_aar_append_only before update or delete on clara.agent_act_receipts
  for each row execute function clara._tf_append_only();
create trigger t_aar_no_truncate before truncate on clara.agent_act_receipts
  for each statement execute function clara._tf_no_truncate();

-- -------------------------------------------------------------------------------------------------
-- A.2 · clara.close_proposals — the durable carrier for "Clara proposes a close" (design §3.7,
-- Annex E.4, D-06). NOT an open_questions extension: that table's scope CHECK admits no fiscal-year
-- subject (0011:822-829), resolve_open_question records text only (0011:2007), and neither a digest
-- vector nor a drafted attestation set has anywhere to live — a proposal whose staleness cannot be
-- tested is one nobody should act on.
--
-- THE SHAPE IS NOT NEGOTIABLE HERE: clara.attest_close_exception's p_from_proposal arm (0120:
-- 1010-1041, SHIPPED, pinned in §0.3) already reads `cp.state`, `cp.bound_digests ->> check_key`,
-- and `jsonb_array_elements(cp.drafted) -> 'text'` keyed by ('check_key','item_key'), scoped by
-- `cp.id = p_from_proposal and cp.close_run_id = p_close_run`. Every column below is the column
-- that arm reads, spelled the way it reads it.
--
-- SUPERSEDE-NEVER-MUTATE (the close_attestations discipline, 0056:500-502; law 6's reverse-not-
-- delete). There is NO delete path and no UPDATE except the one settle stamp.
-- -------------------------------------------------------------------------------------------------
create table clara.close_proposals (
  id              uuid        primary key default gen_random_uuid(),
  firm_id         uuid        not null references clara.firms(id),
  client_id       uuid        not null,
  fiscal_year_id  uuid        not null,
  close_run_id    uuid        not null,
  state           text        not null default 'open'
                    check (state in ('open', 'adopted', 'withdrawn', 'superseded')),
  proposed_by     uuid        not null references clara.users(id),
  -- {check_key: measured_digest} — THE STALENESS TARGET. A moved measurement invalidates the
  -- proposal, and attest_close_exception tests exactly this against the fresh measurement it took
  -- in the same transaction (0120:1033-1039).
  bound_digests   jsonb       not null check (jsonb_typeof(bound_digests) = 'object'),
  -- [{check_key, item_key, text}] — the drafted attestation texts, per outstanding item.
  drafted         jsonb       not null check (jsonb_typeof(drafted) = 'array'),
  narrative       text        not null check (btrim(narrative) <> ''),
  model_name      text        not null check (btrim(model_name) <> ''),
  model_version   text        not null check (btrim(model_version) <> ''),
  rationale       text        not null check (btrim(rationale) <> ''),
  settled_by      uuid        references clara.users(id),
  settled_at      timestamptz,
  settle_reason   text,
  created_at      timestamptz not null default now(),
  -- The settle stamp is ONE act: an open proposal has none of it, a settled one has both halves.
  constraint ck_cp_settle_paired check ((settled_by is null) = (settled_at is null)),
  constraint ck_cp_state_settled check ((state = 'open') = (settled_at is null)),
  constraint fk_cp_client foreign key (client_id, firm_id) references clara.clients (id, firm_id),
  constraint fk_cp_fy foreign key (fiscal_year_id, firm_id) references clara.fiscal_years (id, firm_id),
  constraint fk_cp_run foreign key (close_run_id, firm_id) references clara.close_runs (id, firm_id)
);
-- ONE LIVE PROPOSAL PER CLOSE RUN — the uq_close_runs_one_live idiom (0056:429). Rung B11 refuses
-- before ever reaching this index; the index is what makes the rung structurally true.
create unique index uq_close_proposal_live on clara.close_proposals (close_run_id) where state = 'open';
create index ix_cp_run on clara.close_proposals (close_run_id, created_at desc);

-- ONE DRAFTED TEXT PER (proposal, check_key, item_key) — FIX-8. `drafted` is a jsonb array and
-- nothing stopped it carrying the same item twice with two different texts; attest_close_exception
-- resolves the adoption with `limit 1` over an unordered array, so which of the two the reviewer
-- ends up signing would have been a coin flip, and the receipt would name a text the card may not
-- have shown. The uniqueness is expressed where jsonb cannot express it: a trigger that projects
-- the array and refuses a duplicate key, checked on the ONE insert path the carrier has.
create function clara._tf_close_proposal_drafted_unique() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_total int; v_distinct int;
begin
  select count(*)::int,
         count(distinct jsonb_build_array(x.el ->> 'check_key', x.el ->> 'item_key'))::int
    into v_total, v_distinct
    from jsonb_array_elements(new.drafted) x(el);
  if v_total is distinct from v_distinct then
    raise exception 'a close proposal drafts at most one text per (check_key, item_key); this one carries % element(s) over % key(s)', v_total, v_distinct
      using errcode = 'CLR10', detail = '{"reason":"close_proposal_drafted_duplicate_item"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_close_proposal_drafted_unique() from public;
create trigger t_close_proposal_drafted_unique before insert on clara.close_proposals
  for each row execute function clara._tf_close_proposal_drafted_unique();
comment on table clara.close_proposals is
  'F-A4 (design §3.7, Annex E.4): the durable carrier for a proposed close — the gate digest vector '
  'it binds, the drafted attestation text per (check_key, item_key), the narrative and the model '
  'triple. One LIVE proposal per close run (partial unique). Supersede-never-mutate: the only '
  'lawful UPDATE is the settle stamp (open -> adopted|withdrawn|superseded), there is no DELETE '
  'path, and clara.attest_close_exception''s p_from_proposal arm is its shipped consumer.';

-- The ONE lawful update is the settle stamp; everything else is immutable, and a settled proposal
-- is immutable outright (the _tf_fcg_revoke_only shape, 0056:1078-1097, and the client_facts
-- supersede-only trigger, applied to this carrier).
create function clara._tf_close_proposals_settle_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.state <> 'open' then
    raise exception 'a settled close proposal is immutable (this one is %)', old.state
      using errcode = 'CLR10', detail = '{"reason":"close_proposal_immutable"}';
  end if;
  if new.state = 'open' or new.settled_by is null or new.settled_at is null
     or new.id             is distinct from old.id
     or new.firm_id        is distinct from old.firm_id
     or new.client_id      is distinct from old.client_id
     or new.fiscal_year_id is distinct from old.fiscal_year_id
     or new.close_run_id   is distinct from old.close_run_id
     or new.proposed_by    is distinct from old.proposed_by
     or new.bound_digests  is distinct from old.bound_digests
     or new.drafted        is distinct from old.drafted
     or new.narrative      is distinct from old.narrative
     or new.model_name     is distinct from old.model_name
     or new.model_version  is distinct from old.model_version
     or new.rationale      is distinct from old.rationale
     or new.created_at     is distinct from old.created_at then
    raise exception 'a close proposal admits exactly one update: its settlement (state + settled_by/at + reason)'
      using errcode = 'CLR10', detail = '{"reason":"close_proposal_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_close_proposals_settle_only() from public;
create trigger t_close_proposals_settle_only before update on clara.close_proposals
  for each row execute function clara._tf_close_proposals_settle_only();
create trigger t_close_proposals_no_delete before delete on clara.close_proposals
  for each row execute function clara._tf_append_only();
create trigger t_close_proposals_no_truncate before truncate on clara.close_proposals
  for each statement execute function clara._tf_no_truncate();

alter table clara.close_proposals enable row level security;
alter table clara.close_proposals force row level security;
create policy p_cp_owner on clara.close_proposals
  for all to clara_fn_owner using (true) with check (true);
-- The close_runs policy shape (0056:463) exactly. NO agent policy: she reaches this table through
-- her own wrapper, as a definer, never as a role with a row-level view of it.
create policy p_cp_human on clara.close_proposals
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.close_proposals to clara_authenticated;

-- -------------------------------------------------------------------------------------------------
-- A.3 · clara.close_prep_holds — the LIVE brake (design §3.3's "notice and hold, together and
-- without delay"; Annex E.5, Annex A.7). A hold stops the AGENT lane at its next write, mid-run
-- included; it never blocks a human. Releasing is a stamp, never a delete: the history of who
-- paused what and why is permanent (the firm_capability_grants revoke-only idiom, 0056:1078-1097).
--
-- Purposes are a CLOSED world so a typo cannot silently fail to hold anything.
-- -------------------------------------------------------------------------------------------------
create table clara.close_prep_holds (
  id             uuid        primary key default gen_random_uuid(),
  firm_id        uuid        not null references clara.firms(id),
  client_id      uuid        not null,
  purpose        text        not null check (purpose in ('close_prep')),
  held_by        uuid        not null references clara.users(id),
  reason         text        not null check (btrim(reason) <> ''),
  held_at        timestamptz not null default now(),
  released_by    uuid        references clara.users(id),
  released_at    timestamptz,
  release_reason text,
  constraint ck_hold_release_paired check ((released_by is null) = (released_at is null)),
  constraint fk_cph_client foreign key (client_id, firm_id) references clara.clients (id, firm_id)
);
create unique index uq_hold_active on clara.close_prep_holds (client_id, purpose) where released_at is null;
create index ix_cph_client on clara.close_prep_holds (client_id, held_at desc);
comment on table clara.close_prep_holds is
  'F-A4 (design §3.3, Annex E.5/A.7): the human brake on the clocked close-prep lane, per (client, '
  'purpose). Rung B1 of EVERY F-A4 verb reads it through clara._close_prep_hold_active, and so does '
  'clara.close_prep_due(); no human verb reads it at all. Append-only apart from the release stamp '
  '— a released hold stays on the record forever. Purposes are a closed world, extended by later '
  'items that adopt the brake.';

create function clara._tf_close_prep_holds_release_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if old.released_at is not null then
    raise exception 'a released close-prep hold is immutable'
      using errcode = 'CLR10', detail = '{"reason":"close_prep_hold_immutable"}';
  end if;
  if new.released_by is null or new.released_at is null
     or new.id        is distinct from old.id
     or new.firm_id   is distinct from old.firm_id
     or new.client_id is distinct from old.client_id
     or new.purpose   is distinct from old.purpose
     or new.held_by   is distinct from old.held_by
     or new.reason    is distinct from old.reason
     or new.held_at   is distinct from old.held_at then
    raise exception 'a close-prep hold admits exactly one update: the release stamp'
      using errcode = 'CLR10', detail = '{"reason":"close_prep_hold_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_close_prep_holds_release_only() from public;
create trigger t_close_prep_holds_release_only before update on clara.close_prep_holds
  for each row execute function clara._tf_close_prep_holds_release_only();
create trigger t_close_prep_holds_no_delete before delete on clara.close_prep_holds
  for each row execute function clara._tf_append_only();
create trigger t_close_prep_holds_no_truncate before truncate on clara.close_prep_holds
  for each statement execute function clara._tf_no_truncate();

alter table clara.close_prep_holds enable row level security;
alter table clara.close_prep_holds force row level security;
create policy p_cph_owner on clara.close_prep_holds
  for all to clara_fn_owner using (true) with check (true);
create policy p_cph_human on clara.close_prep_holds
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.close_prep_holds to clara_authenticated;

-- A.3b · the table's ONE reader (Annex A.3, rung B1). Declared here beside the table rather than
-- with the rest of the ladder, because clara.close_prep_due() (§F) reads it too and one body must
-- answer "is this lane held" for BOTH the clock and the rung (TA-P11).
--
-- ARM-0 FIRST (law 68): a NULL client is its OWN first branch and returns TRUE — a hold check that
-- cannot identify its subject must refuse, never pass. The same for a NULL purpose: an unnameable
-- purpose is not "no purpose", it is an unanswerable question.
create function clara._close_prep_hold_active(p_client uuid, p_purpose text) returns boolean
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  if p_client is null or nullif(btrim(coalesce(p_purpose, '')), '') is null then
    return true;
  end if;
  return exists (select 1 from clara.close_prep_holds h
                  where h.client_id = p_client and h.purpose = p_purpose
                    and h.released_at is null);
end $$;
revoke all on function clara._close_prep_hold_active(uuid, text) from public;
comment on function clara._close_prep_hold_active(uuid, text) is
  'F-A4 (Annex A.3 rung B1): the ONE reader of clara.close_prep_holds — called from every F-A4 '
  'verb''s Tier-B vector and from clara.close_prep_due(). ARM-0 first: a NULL client or a blank '
  'purpose returns TRUE (held), because a hold check that cannot identify its subject must refuse.';

-- =================================================================================================
-- §B · TIER C — the deferred agent-receipt wall (design §3.2 Tier C, TA-P4 (3)). "Act and receipt
-- are written in ONE transaction inside the protected region; a deferred constraint trigger fires
-- at COMMIT and requires exactly one receipt row per agent-authored close-lifecycle transition.
-- NO RECEIPT, NO ACT — structural, not prompt-level."
--
-- SCOPE, stated so nobody has to derive it: clara.close_runs, which carries BOTH close-lifecycle
-- transitions the agent can author — the INSERT that begins a run (started_by) and the settlement
-- UPDATE that abandons one (ended_by). open_fiscal_year and mint_month_snapshot are NOT close-run
-- transitions and are NOT walled here; their cores write their receipts unconditionally and the
-- battery proves it behaviourally. Narrowing the wall to what its own sentence names is deliberate:
-- a wall over a table nothing agent-authored writes would be a wall that never fires.
--
-- ARM-0 FIRST (law 68, the F-A3 0121:4571 shape): an unresolvable acting identity REFUSES; it never
-- assumes a human and passes.
-- =================================================================================================
create function clara._tf_assert_close_agent_receipt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_is_agent boolean; v_kind text; v_n int;
begin
  -- CLASSIFICATION IS A CLOSED WORLD IN BOTH DIRECTIONS (FIX-3). The first cut read INSERT as
  -- begin_close unconditionally and UPDATE as abandon-or-nothing, so a run born already terminal
  -- classified as a begin, and every UPDATE that was not an abandon fell out of the wall entirely
  -- — including a transition nobody has written yet. Both arms now enumerate what they admit and
  -- REFUSE the rest, which is what makes this a wall rather than a filter.
  if tg_op = 'INSERT' then
    if new.state is distinct from 'in_progress'
       or new.ended_by is not null or new.ended_at is not null or new.end_reason is not null then
      raise exception 'a close run is born in_progress with no terminal fields; this one is born % (ended_by %, ended_at %)', new.state, new.ended_by, new.ended_at
        using errcode = 'CLR08', detail = '{"reason":"close_run_birth_shape_invalid"}';
    end if;
    v_actor := new.started_by; v_kind := 'begin_close';
  elsif tg_op = 'UPDATE' then
    if new.state = old.state then
      -- No lifecycle transition at all (the settlement columns moving without the state is
      -- already refused by t_close_runs_lifecycle); nothing is owed.
      return null;
    elsif new.state = 'abandoned' then
      v_actor := new.ended_by; v_kind := 'abandon_close';
    elsif new.state = 'finalized' then
      -- A finalize is key ②'s, a HUMAN act by law 71 — no agent receipt is owed and none is
      -- sought. Named explicitly rather than reached by falling off the end.
      return null;
    else
      raise exception 'close run % attempted an unclassified transition % -> %; the agent-receipt wall refuses what it cannot adjudicate', new.id, old.state, new.state
        using errcode = 'CLR08', detail = jsonb_build_object('reason', 'close_run_transition_unclassified',
          'from', old.state, 'to', new.state)::text;
    end if;
  else
    raise exception 'the close agent-receipt wall saw tg_op %, which it does not adjudicate', tg_op
      using errcode = 'CLR08', detail = '{"reason":"close_agent_receipt_unknown_tg_op"}';
  end if;
  -- ARM-0: a settled run with no acting actor cannot be adjudicated at all. Refuse.
  if v_actor is null then
    raise exception 'close run % records no acting actor for its % transition; the agent-receipt wall cannot resolve the acting identity', new.id, v_kind
      using errcode = 'CLR08', detail = '{"reason":"close_agent_receipt_arm0_null_actor"}';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id = v_actor;
  if not found or v_is_agent is null then
    raise exception 'the acting identity % is unresolvable; the close agent-receipt wall refuses rather than assuming a human', v_actor
      using errcode = 'CLR08', detail = '{"reason":"close_agent_receipt_arm0_unresolvable_actor"}';
  end if;
  -- A HUMAN transition writes no agent receipt. That is the whole condition (t_je_agent_post_receipt's
  -- own shape) — and it is a POSITIVE read of users.is_agent, never a name (law 3).
  if not v_is_agent then return null; end if;
  -- THE SUBJECT IS THE RUN, for BOTH transitions, and that is load-bearing rather than tidy: a
  -- fiscal year can lawfully be begun, abandoned and begun again, so an FY-keyed count would read
  -- TWO acted begin receipts on the second lawful begin and raise on a correct act. The run id is
  -- unique per transition, so the count is exactly one or the wall has found a real gap. (An
  -- agent core writes its REFUSED begin receipt against the fiscal year instead — there is no run
  -- to name when the freeze never happened — which is why this read pins subject_kind too.)
  --
  -- THE MATCH IS BOUND TO THE ACT, NOT MERELY TO THE SUBJECT (FIX-4). act_kind + subject + verdict
  -- alone is satisfied by ANY acted receipt naming this run — including one pre-planted in another
  -- firm, or by another actor, or with no task behind it. The wall now also requires the receipt's
  -- FIRM to be this run's, its ACTING ACTOR to be the very identity this transition records, and
  -- its wake task to resolve — so satisfying it means the act really was receipted by the actor the
  -- run names, in the tenant the run belongs to.
  select count(*)::int into v_n from clara.agent_act_receipts r
    where r.act_kind = v_kind and r.subject_kind = 'close_run'
      and r.subject_id = new.id and r.verdict = 'acted'
      and r.firm_id = new.firm_id
      and r.client_id = new.client_id
      and r.acting_actor = v_actor
      and r.wake_task_id is not null;
  if v_n <> 1 then
    raise exception 'an agent-authored % on close run % carries exactly one ACTED agent_act_receipts row bound to this firm, client, actor and a wake task; it carries %', v_kind, new.id, v_n
      using errcode = 'CLR08', detail = jsonb_build_object('reason', 'close_agent_receipt_missing',
        'close_run_id', new.id, 'act_kind', v_kind, 'receipts', v_n)::text;
  end if;
  return null;
end $$;
revoke all on function clara._tf_assert_close_agent_receipt() from public;

create constraint trigger t_close_run_agent_receipt after insert or update on clara.close_runs
  deferrable initially deferred
  for each row execute function clara._tf_assert_close_agent_receipt();

-- THE SCHEDULE BYPASS, CLOSED STRUCTURALLY (FIX-5). A deferred constraint trigger can be forced
-- IMMEDIATE by the session itself (`SET CONSTRAINTS ... IMMEDIATE`), which fires the count while
-- it still reads exactly one and lets a SECOND matching acted receipt land afterwards — the wall
-- passes and the record ends up with two acted receipts for one transition. A trigger cannot
-- defend against a caller who chooses when the trigger runs, so the "exactly one" half is ALSO
-- expressed as an index, which no scheduling verb can move: at most one ACTED receipt may exist
-- per (close-run subject, act kind) for the two close-run transitions. The trigger keeps proving
-- the OTHER half — that at least one exists, bound to the right firm/client/actor/task — which an
-- index cannot express.
create unique index uq_aar_one_acted_close_run_transition
  on clara.agent_act_receipts (subject_id, act_kind)
  where subject_kind = 'close_run' and verdict = 'acted'
    and act_kind in ('begin_close', 'abandon_close');

-- =================================================================================================
-- §C · F14's TWO SIBLINGS — the credential↔task binding (design §3.8's closing paragraph, D-13).
--
-- The binding TA-P4 (2) demands is built from SIBLINGS, never a wake_context() recut: that body is
-- the widest-reach object in the wake estate (read by every wake wrapper there is), and widening
-- its five-column return to satisfy one item's receipt is the widest possible change for the
-- narrowest gain. wake_context() and mint_wake_credential's live five-arg body are byte-untouched
-- by this file, and §0.4's shas plus the tail prove it rather than claiming it.
--
-- A credential naming NO task makes every F-A4 wrapper refuse `wake_task_unbound` — no binding,
-- no act.
-- =================================================================================================

-- C.1 · the ungranted resolver. Reads the SAME session secret wake_context() reads, against the
-- SAME liveness predicate, and returns the one column wake_context() does not carry. Written as a
-- sibling rather than as a second reading of "is this credential live": the predicate below is
-- wake_context()'s own, verbatim, so the two bodies cannot drift about which credential is live.
create function clara._wake_task_id() returns uuid
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_raw text; v_hash bytea; v_task uuid;
begin
  v_raw := current_setting('clara.wake_secret', true);
  if v_raw is null or v_raw = '' then return null; end if;
  v_hash := sha256(convert_to(v_raw, 'UTF8'));
  select c.agent_task_id into v_task
    from clara.wake_credentials c
    where c.secret_hash = v_hash and c.revoked_at is null and c.consumed_at is null
      and c.expires_at > statement_timestamp()
      and (c.on_behalf_of is null or exists (
        select 1 from clara.firm_memberships m
        where m.user_id = c.on_behalf_of and m.firm_id = c.firm_id
          and m.status = 'active'
          and clara.role_rank(m.role) >= clara.role_rank('bookkeeper')))
    limit 1;
  return v_task;
end $$;
revoke all on function clara._wake_task_id() from public;
comment on function clara._wake_task_id() is
  'F-A4 (F14/D-13): the task half of the wake binding, read off the same session secret '
  'wake_context() reads and under the same liveness predicate. UNGRANTED — reachable only from a '
  'definer chain. NULL means the credential names no task, which every F-A4 wrapper turns into '
  'CLR03 wake_task_unbound: no binding, no act.';

-- C.2 · the minting sibling. mint_wake_credential's live body already ADMITS close_prep (0133:713,
-- :753-761 — gate G1 changed what Annex C recorded, see this file's header); what it cannot do is
-- write agent_task_id, and widening its signature is exactly the recut D-13 refuses. This sibling
-- carries the identical close_prep admission arm PLUS the task binding, and is the ONLY minter of
-- a task-bound credential.
create function clara.mint_wake_credential_for_task(p_wake_kind text, p_firm uuid, p_client uuid,
    p_agent_task uuid, p_ttl interval default '00:15:00'::interval)
  returns table(credential_id uuid, secret text)
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_secret text; v_id uuid; v_task record;
begin
  -- The clocked kinds ONLY. This sibling is not a second door onto the legacy kinds: those have
  -- no task to bind and mint_wake_credential remains their one minter.
  if p_wake_kind is null or p_wake_kind not in ('close_prep') then
    raise exception 'bad wake_kind for a task-bound mint' using errcode = 'CLR10',
      detail = '{"reason":"wake_kind_not_task_bound"}';
  end if;
  if p_firm is null or not exists (select 1 from clara.firms where id = p_firm) then
    raise exception 'unknown firm' using errcode = 'CLR10';
  end if;
  -- close_prep's own shape, byte-identical in meaning to the live body's arm (0133:753-761): a
  -- firm-congruent ACTIVE client is required, and on_behalf_of is FORBIDDEN by construction —
  -- there is no directing human on the clocked lane, so the NULL is structural, never inferred
  -- (law 68). This sibling does not even take an on_behalf_of argument.
  if p_client is null or not exists (
      select 1 from clara.clients where id = p_client and firm_id = p_firm and status = 'active') then
    raise exception 'close_prep wake requires a firm-congruent active client'
      using errcode = 'CLR10', detail = '{"reason":"close_prep_client_incongruent"}';
  end if;
  -- THE TASK IS MANDATORY AND MUST BE THE RIGHT TASK. Congruence is read positively (firm, client
  -- and kind all measured on the row), never assumed from the caller having supplied an id.
  if p_agent_task is null then
    raise exception 'a task-bound wake credential requires its agent task'
      using errcode = 'CLR10', detail = '{"reason":"wake_task_unbound"}';
  end if;
  select t.id, t.firm_id, t.client_id, t.kind into v_task
    from clara.agent_tasks t where t.id = p_agent_task;
  if v_task.id is null or v_task.firm_id is distinct from p_firm
     or v_task.client_id is distinct from p_client or v_task.kind is distinct from p_wake_kind then
    raise exception 'the named agent task is not a % task for this firm and client', p_wake_kind
      using errcode = 'CLR11', detail = '{"reason":"wake_task_incongruent"}';
  end if;
  v_secret := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into clara.wake_credentials(wake_kind, firm_id, on_behalf_of, client_id,
      secret_hash, expires_at, agent_task_id)
    values (p_wake_kind, p_firm, null, p_client,
      sha256(convert_to(v_secret, 'UTF8')), statement_timestamp() + p_ttl, p_agent_task)
    returning id into v_id;
  return query select v_id, v_secret;
end $$;
revoke all on function clara.mint_wake_credential_for_task(text, uuid, uuid, uuid, interval) from public;
comment on function clara.mint_wake_credential_for_task(text, uuid, uuid, uuid, interval) is
  'F-A4 (F14/D-13): the SIBLING minter that records wake_credentials.agent_task_id. Mirrors '
  'mint_wake_credential''s close_prep arm exactly (firm-congruent active client, on_behalf_of '
  'structurally absent) and adds the mandatory, congruence-checked task binding. Its shipped '
  'consumer is the leader belt''s credential mint (packages/runtime/lib/pools.mjs, PR-2).';

-- =================================================================================================
-- §D · THE THREE READ EXTRACTIONS (design §3.1, D-17; Annex F.3's window-free carve-out).
--
-- Each of clara.list_fiscal_years, clara.get_close_readiness and clara.verify_close opens
-- `_human_ctx` as its first act (0056:2670, :2623, :2535), which on a wake session is "either dark
-- or a cross-tenant read" (0064:29-38, survey F1). The fix is the estate's containment idiom: the
-- body below the ctx line moves into an ungranted core taking p_firm as an argument, and the human
-- verb becomes a thin delegate.
--
-- WHY EXTRACTION AND NOT A HAND-WRITTEN AGENT PROJECTION (gate GM-2 → D-17): a second FY list is a
-- second computation of one fact, and `has_active_reopen_receipt` (0056:2681-2682) is the first key
-- that would drift. One body, two entrances — the same reasoning D-03 applies to the dry run.
-- Parity is PROVEN by cell C-21, not asserted here.
--
-- NOT A D1 ROW (Annex F.3, stated positively): all three are `stable`, write nothing, and are
-- reached from no writer's transaction, so PostgreSQL's in-flight-body hazard cannot apply. Each
-- carries a prestate prosrc pin (§0.4) and a tail re-read instead.
-- =================================================================================================

create function clara._verify_close_core(p_firm uuid, p_receipt uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_r record; v_fy record; v_strict jsonb := '[]'::jsonb;
  v_pos jsonb; v_diffs jsonb; v_probe jsonb; v_successor text; v_pl_diffs jsonb;
begin
  select * into v_r from clara.close_receipts cr where cr.id = p_receipt;
  if v_r.id is null or v_r.firm_id <> p_firm then
    raise exception 'close receipt not found in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  select * into v_fy from clara.fiscal_years fy where fy.id = v_r.fiscal_year_id;
  for v_probe in
    select p2 from unnest(array[
      clara.ar_control_tie(v_r.client_id, v_fy.ends_on),
      clara.ap_control_tie(v_r.client_id, v_fy.ends_on),
      clara.fa_control_tie_out(v_r.client_id, v_fy.id),
      clara.bank_recon_close_state(v_r.client_id, v_fy.id)]) u(p2)
  loop
    v_strict := v_strict || jsonb_build_object('state', v_probe ->> 'state', 'probe', v_probe);
  end loop;
  select coalesce(jsonb_object_agg(t.account_code, (t.debit_cents - t.credit_cents)), '{}'::jsonb)
    into v_pos
    from clara.trial_balance_as_of(v_r.client_id, v_fy.ends_on) t
    join clara.coa_accounts a on a.client_id = v_r.client_id
     and a.account_code = t.account_code
    where a.account_type in ('asset', 'liability', 'equity')
      and (t.debit_cents - t.credit_cents) <> 0;
  select coalesce(jsonb_agg(jsonb_build_object('account_code', d.code,
           'pinned_cents', d.pin, 'recomputed_cents', d.cur) order by d.code), '[]'::jsonb)
    into v_diffs
    from (
      select coalesce(p.key, q.key) as code,
             coalesce((p.value)::text::bigint, 0) as pin,
             coalesce((q.value)::text::bigint, 0) as cur
        from jsonb_each(coalesce(v_r.snapshot -> 'closing_position', '{}'::jsonb)) p(key, value)
        full outer join jsonb_each(v_pos) q(key, value) on q.key = p.key
    ) d
    where d.pin <> d.cur;
  select coalesce(jsonb_agg(jsonb_build_object('account_code', t.account_code,
           'net_cents', t.net) order by t.account_code), '[]'::jsonb)
    into v_pl_diffs
    from (
      select tb.account_code, (tb.debit_cents - tb.credit_cents)::bigint as net
        from clara.trial_balance_as_of(v_r.client_id, v_fy.ends_on) tb
        join clara.coa_accounts ca on ca.client_id = v_r.client_id
             and ca.account_code = tb.account_code
        where ca.account_type in ('income', 'expense')
          and (tb.debit_cents - tb.credit_cents) <> 0
    ) t;
  select case when exists (select 1 from clara.close_receipts nxt
                 join clara.fiscal_years nfy on nfy.id = nxt.fiscal_year_id
                 where nfy.prior_fy_id = v_r.fiscal_year_id
                   and nxt.kind = 'close' and nxt.status = 'active')
              then 'consumed_by_successor_close' else 'pinned_not_yet_consumed' end
    into v_successor;
  return jsonb_build_object(
    'receipt_id', p_receipt, 'fiscal_year_id', v_r.fiscal_year_id,
    'receipt_status', v_r.status, 'receipt_kind', v_r.kind,
    'verified', (jsonb_array_length(v_diffs) = 0
      and jsonb_array_length(v_pl_diffs) = 0
      and not exists (select 1 from jsonb_array_elements(v_strict) s(el)
            where s.el ->> 'state' in ('mismatch', 'unknown', 'error'))),
    'strict', jsonb_build_object('probes', v_strict, 'closing_position_diffs', v_diffs,
      'pl_zero_diffs', v_pl_diffs),
    'successor_tie', v_successor,
    'informational', jsonb_build_object('gate_summary_stored', v_r.snapshot -> 'gates'));
end $$;
revoke all on function clara._verify_close_core(uuid, uuid) from public;

create or replace function clara.verify_close(p_receipt uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  return clara._verify_close_core(c.firm, p_receipt);
end $$;

create function clara._close_readiness_core(p_firm uuid, p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_run record;
begin
  perform 1 from clara.clients cl where cl.id = p_client and cl.firm_id = p_firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select * into v_run from clara.close_runs r
    where r.fiscal_year_id = p_fy and r.client_id = p_client
    order by r.started_at desc limit 1;
  return jsonb_build_object(
    'fiscal_year_id', p_fy, 'close_run_id', v_run.id, 'run_state', v_run.state,
    'fy_end_source', (select fy.fy_end_source from clara.fiscal_years fy
       where fy.id = p_fy and fy.client_id = p_client),
    'gates', coalesce((
      select jsonb_agg(jsonb_build_object('check_key', g.check_key, 'drawer', g.drawer,
          'state', g.state, 'measured', g.measured, 'measured_digest', g.measured_digest,
          'attested', not exists (
              select 1 from unnest(
                case when coalesce(array_length(
                       clara._gate_outstanding_items(g.check_key, g.measured), 1), 0) = 0
                     then array['__gate__']
                     else clara._gate_outstanding_items(g.check_key, g.measured) end) x(k)
              where not exists (select 1 from clara.close_attestations a
                      join clara.close_gate_results gr on gr.id = a.gate_result_id
                      where a.close_run_id = v_run.id and a.check_key = g.check_key
                        and a.item_key = x.k and a.superseded_at is null
                        and gr.measured_digest = g.measured_digest)))
        order by g.drawer, g.check_key)
        from (select distinct on (r2.check_key) r2.* from clara.close_gate_results r2
               where r2.close_run_id = v_run.id
               order by r2.check_key, r2.seq desc) g), '[]'::jsonb));
end $$;
revoke all on function clara._close_readiness_core(uuid, uuid, uuid) from public;

create or replace function clara.get_close_readiness(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  return clara._close_readiness_core(c.firm, p_client, p_fy);
end $$;

create function clara._list_fiscal_years_core(p_firm uuid, p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.clients cl where cl.id = p_client and cl.firm_id = p_firm;
  if not found then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('fiscal_year_id', fy.id,
      'label', fy.label, 'ordinal', fy.ordinal, 'starts_on', fy.starts_on,
      'ends_on', fy.ends_on, 'status', fy.status, 'fy_end_source', fy.fy_end_source,
      'has_active_reopen_receipt', exists (select 1 from clara.close_receipts cr
        where cr.fiscal_year_id = fy.id and cr.kind = 'reopen' and cr.status = 'active'))
    order by fy.ordinal)
    from clara.fiscal_years fy where fy.client_id = p_client), '[]'::jsonb);
end $$;
revoke all on function clara._list_fiscal_years_core(uuid, uuid) from public;

create or replace function clara.list_fiscal_years(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  return clara._list_fiscal_years_core(c.firm, p_client);
end $$;

-- =================================================================================================
-- §E · OQ-9(a) / R-L11 / D-26 — the ADJ oracle's additive extraction.
--
-- THE PROBLEM, at the bytes (gate blocker GB-1/G1): clara.adjustment_run_due calls
-- clara._assert_due_read_ctx as its FIRST act (0045:5525). That body admits only clara_runtime when
-- jwt_sub() is null (0042:441-451, raise at :447), and the wake pool is clara_wake_write_login ->
-- clara_wake_interactive with no JWT (pools.mjs:58, :373). So rung B13's ADJ half would RAISE CLR03
-- inside the freezing transaction — aborting it, producing NO receipt, the exact opposite of Tier
-- B's contract.
--
-- THE RULING (orchestrator, 2026-08-22, R-L11 = option (a)): an ADDITIVE ungranted core BELOW the
-- admission. The live oracle keeps its own _assert_due_read_ctx, its own grants and its own answer
-- for every existing caller — the admission is unmoved, and cell C-19 is the positive control that
-- proves it (the live verb still raises CLR03 on a real wake session; the core answers).
-- §7's blanket "no edit to 0041/0045" narrows to "no change to what the oracles ANSWER" (D-26).
--
-- NOT A D1 ROW: adjustment_run_due is `stable`, writes nothing and is reached from no writer's
-- transaction. It carries a prestate prosrc pin (§0.4) and a tail re-read.
-- =================================================================================================
create function clara._adjustment_run_due_core(p_client uuid, p_firm uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  tp record; v_one jsonb; v_blocked jsonb := '[]'::jsonb;
  v_best_template uuid; v_best_ps date; v_best_pe date;
begin
  if p_firm is null then
    return jsonb_build_object('due', false, 'reason', 'client_not_found', 'blocked', '[]'::jsonb);
  end if;
  for tp in select a.id from clara.adjustment_templates a
            where a.client_id = p_client and a.status = 'live'
            order by a.created_at, a.id loop
    v_one := clara._adj_oldest_unmet_period(p_client, tp.id);
    if (v_one ->> 'reason') in ('occurrence_draft_outstanding', 'template_line_ineligible',
                                'period_correction_unsound', 'period_shape_already_met',
                                'replaced_generation_period_standing') then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'template_id', tp.id, 'reason', v_one ->> 'reason'));
    elsif coalesce((v_one ->> 'due')::boolean, false)
          and (v_best_ps is null or (v_one ->> 'period_start')::date < v_best_ps) then
      v_best_template := tp.id;
      v_best_ps := (v_one ->> 'period_start')::date;
      v_best_pe := (v_one ->> 'period_end')::date;
    end if;
  end loop;
  if v_best_template is null then
    return jsonb_build_object('due', false, 'reason',
      case when jsonb_array_length(v_blocked) > 0 then 'all_blocked' else 'nothing_due' end,
      'blocked', v_blocked);
  end if;
  return jsonb_build_object('due', true, 'template_id', v_best_template,
    'period_start', v_best_ps, 'period_end', v_best_pe, 'blocked', v_blocked);
end $$;
revoke all on function clara._adjustment_run_due_core(uuid, uuid) from public;
comment on function clara._adjustment_run_due_core(uuid, uuid) is
  'F-A4 (OQ-9(a) / R-L11 / D-26): the answer half of clara.adjustment_run_due, extracted BELOW its '
  '_assert_due_read_ctx admission so rung B13 can evaluate the ADJ oracle from the wake lane '
  'without raising CLR03 inside the freezing transaction. UNGRANTED. Changes no answer and no '
  'admission for any existing caller — cell C-19 is the positive control.';

create or replace function clara.adjustment_run_due(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  -- ADMISSION BEFORE ANSWERING ANYTHING -- INCLUDING 'client_not_found'. UNMOVED by the
  -- extraction: the lookup still runs first only because the predicate needs the firm to compare
  -- against, and the verdict is still reached before ANY branch returns, so an unadmitted caller
  -- still cannot use this oracle to probe which client ids exist.
  perform clara._assert_due_read_ctx(v_firm);
  return clara._adjustment_run_due_core(p_client, v_firm);
end $$;

-- -------------------------------------------------------------------------------------------------
-- §E.2 · THE SAME EXTRACTION ON THE **FA** ORACLE — a MEASURED CORRECTION to the design, not a
-- widening of its scope.
--
-- THE DESIGN'S CLAIM, and why it is false at the live frontier. Gate finding G1 reads
-- clara.depreciation_run_due at `0041:3617-3630` and concludes it "is unaffected" because that
-- text "compares a non-null jwt_firm() only"; Annex A.3's arm 1 and cell C-19's twin both rest on
-- it. At the LIVE catalog the body is NOT 0041's: 0042's WDB-R1/WDB-R2 recut (owner ruling
-- 2026-08-03) replaced the null-tolerant firm guard with `perform clara._assert_due_read_ctx(v_firm)`
-- so that "this two-member family can no longer drift apart" -- the 0045 header says so in as many
-- words, and 0045's own adjustment_run_due comment names depreciation_run_due as its sibling
-- THROUGH THE SAME BODY. A superseded-body cite, exactly the class the estate has been bitten by
-- before. MEASURED on the rig, not reasoned: calling clara.depreciation_run_due from the wake lane
-- raises CLR03 `no valid read context`, so rung B13's arm 1 would have counted DUE
-- (`fa_oracle_inevaluable`) on EVERY clean year forever -- the limb would have refused every
-- clocked close it was built to perform, permanently and silently-by-design.
--
-- THE FIX IS R-L11's OWN SHAPE, applied to the sibling the ruling's reasoning already covers: an
-- ADDITIVE UNGRANTED CORE BELOW THE ADMISSION. It changes no answer, no grant and no admission for
-- any existing caller; the live verb keeps its own _assert_due_read_ctx, so x42.d8's closed census
-- ("exactly two bodies consult the shared predicate") reads EXACTLY as before -- the two cores are
-- not members of it, because they do not consult it. §7's non-goal, as narrowed by D-26, is "no
-- change to what the oracles ANSWER"; this changes none.
--
-- NOT A D1 ROW: `stable`, writes nothing, reached from no writer's transaction. Prestate pin above,
-- tail re-read below. The 0042 postcheck's own rule is respected: no literal of the retired
-- null-tolerant guard is reintroduced by either body.
-- -------------------------------------------------------------------------------------------------
create function clara._depreciation_run_due_core(p_client uuid, p_firm uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  if p_firm is null then
    return jsonb_build_object('due', false, 'reason', 'client_not_found');
  end if;
  return clara._fa_oldest_unmet_period(p_client);
end $$;
revoke all on function clara._depreciation_run_due_core(uuid, uuid) from public;
comment on function clara._depreciation_run_due_core(uuid, uuid) is
  'F-A4 (OQ-9(a) / R-L11''s shape, applied to the FA sibling after MEASURING that 0042''s '
  'WDB-R1/WDB-R2 recut gave clara.depreciation_run_due the SAME _assert_due_read_ctx admission the '
  'design believed only adjustment_run_due carried): the answer half, extracted BELOW the '
  'admission so rung B13 arm 1 can evaluate it from the wake lane without raising CLR03 inside the '
  'freezing transaction. UNGRANTED. Changes no answer and no admission for any existing caller.';

create or replace function clara.depreciation_run_due(p_client uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_firm uuid;
begin
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  -- ADMISSION BEFORE ANY ANSWER, byte-unmoved from 0042's own recut (owner ruling 2026-08-03,
  -- WDB-R1/WDB-R2): the shared predicate discriminates the CALLER, and it is the SAME body
  -- clara.adjustment_run_due consults, so this two-member family cannot drift apart. Only the
  -- ANSWER moved out, into the ungranted core above; every existing caller sees the identical
  -- admission and the identical envelope.
  perform clara._assert_due_read_ctx(v_firm);
  return clara._depreciation_run_due_core(p_client, v_firm);
end $$;

-- =================================================================================================
-- §F · clara.close_prep_due() — TA-P5's ONE time-triggered wake source (design §3.3, Annex B.1).
--
-- "The due oracle, in the DB" (F11's law: the runtime must not compute a period, because a period
-- is a figure). EVERY DATE IS COMPUTED HERE. The belt asks and mints; the belt computes nothing.
--
-- THE DATA GATE LIVES HERE TOO (TA-P5's "wake and look"): this oracle answers "a year has ended
-- and nobody has started", never "the books are ready". Readiness is the dry run's answer, taken
-- AFTER she wakes. A client with nothing to work on wakes, looks and chases — the ruled behaviour,
-- not a wasted wake.
--
-- OQ-1's cadence, on the recommendation the build proceeds under: the day after ends_on, re-asked
-- DAILY until a run exists or a hold is set. The idempotency window is therefore one book-day, and
-- it is keyed on the CLIENT (not the FY) deliberately: the ordering rung means at most one of a
-- client's years is admissible at a time, and wake_credentials carries a client but no fiscal year
-- (0002:230-240 + 0011's client column), so a client-keyed window is the honest key rather than a
-- join to a column that does not exist.
-- =================================================================================================
create function clara.close_prep_due()
  returns table(firm_id uuid, client_id uuid, fiscal_year_id uuid, ends_on date, reason text)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  return query
    select fy.firm_id, fy.client_id, fy.id, fy.ends_on,
           -- (6) the reason, so the notice card can SAY why without deriving it.
           case when exists (select 1 from clara.agent_act_receipts r
                              where r.subject_kind = 'fiscal_year' and r.subject_id = fy.id
                                and r.verdict = 'refused')
                then 'retry_after_refusal' else 'fy_end_passed' end
      from clara.fiscal_years fy
      join clara.clients cl on cl.id = fy.client_id and cl.firm_id = fy.firm_id
     where cl.status = 'active'
       -- (1) open, OR reopened with NO CORRECTION IN FLIGHT (D-20 re-cutting D-08). TA-P1 C gives
       -- Clara the re-freeze, so the clock may not refuse a reopened year outright; what it must
       -- not do is fire while the human's correction is on the bench. The predicate is rung B14's,
       -- evaluated through _close_gate_drafts' OWN population (0056:1316) so the clock and the rung
       -- admit exactly the same years -- if they could disagree, the clock would wake her for a
       -- freeze B14 then refuses, every single day (TA-P11).
       and (fy.status = 'open'
            or (fy.status = 'reopened'
                and jsonb_array_length(coalesce(
                      clara._close_gate_drafts(fy.client_id, fy.id) -> 'drafts', '[]'::jsonb)) = 0))
       -- (2) the BOOK clock, never current_date (the x42 clock law applies to a new body too).
       and fy.ends_on <= clara._book_today()
       -- (3) no live hold on this (client, purpose).
       and not clara._close_prep_hold_active(fy.client_id, 'close_prep')
       -- (4) no live run, and the year is not already closed.
       and not exists (select 1 from clara.close_runs r
                        where r.fiscal_year_id = fy.id and r.state = 'in_progress')
       and not exists (select 1 from clara.close_receipts cr
                        where cr.fiscal_year_id = fy.id and cr.kind = 'close' and cr.status = 'active')
       -- (5) the idempotency that stops a herd: no close_prep credential minted for this client
       -- inside the cadence window.
       and not exists (select 1 from clara.wake_credentials wc
                        where wc.wake_kind = 'close_prep' and wc.client_id = fy.client_id
                          and wc.created_at > statement_timestamp() - interval '1 day')
     order by fy.firm_id, fy.client_id, fy.ordinal;
end $$;
revoke all on function clara.close_prep_due() from public;
comment on function clara.close_prep_due() is
  'F-A4 (TA-P5 A, design §3.3, Annex B.1): the ONE time-triggered close-prep due oracle. Returns '
  'one row per (firm, client, fiscal_year) whose ends_on has passed on the BOOK clock, that is '
  'open (or reopened with no correction in flight, D-20), carries no live hold, has no run in '
  'progress and no active close receipt, and has had no close_prep credential minted inside the '
  'cadence window. Answers "a year has ended and nobody has started" -- never "the books are '
  'ready". clara_runtime ONLY: the wake roles never ask.';

-- =================================================================================================
-- §G · THE SHARED LADDER (design §3.2; Annex A.1 the wrapper skeleton, A.3 the rungs that are not
-- one-liners). Written ONCE and reviewed ONCE — every wrapper and every agent core below reaches
-- the same bodies, so no two verbs can drift about what a rung means.
-- =================================================================================================

-- G.1 · THE SUBJECT RESOLVER (Annex A.1's second bullet). One body, one dispatch, so the client-pin
-- assertion is written once. ARM-0: an unknown subject kind and an unresolvable id BOTH return
-- NULL, which the pin then refuses — absence never resolves to "fine".
create function clara._close_subject_client(p_subject_kind text, p_subject_id uuid) returns uuid
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_client uuid;
begin
  if p_subject_kind is null or p_subject_id is null then return null; end if;
  case p_subject_kind
    when 'client' then
      select c.id into v_client from clara.clients c where c.id = p_subject_id;
    when 'fiscal_year' then
      select fy.client_id into v_client from clara.fiscal_years fy where fy.id = p_subject_id;
    when 'close_run' then
      select r.client_id into v_client from clara.close_runs r where r.id = p_subject_id;
    when 'close_receipt' then
      select cr.client_id into v_client from clara.close_receipts cr where cr.id = p_subject_id;
    when 'snapshot' then
      select ps.client_id into v_client from clara.period_snapshots ps where ps.id = p_subject_id;
    else
      return null;   -- ARM-0: an unknown subject kind is unanswerable, never permissive.
  end case;
  return v_client;
end $$;
revoke all on function clara._close_subject_client(text, uuid) from public;

-- G.2 · THE OP-KEY DERIVATION (D-25, gate GN-4; Annex A.1's fourth bullet). sha256(wake_task_id ‖
-- verb ‖ subject_id). One key per (task, verb, subject) makes a RETRY inside one wake a replay of
-- _reserve_op's stored outcome, and a NEW wake task a NEW operation — so a released hold or a
-- cleared catch-up is re-MEASURED, never replayed. The wrapper recomputes and CHECKS rather than
-- minting (a wrapper-minted key defeats _reserve_op's retry semantics) and rather than accepting a
-- free-form one (a caller could reuse yesterday's key to replay a dead outcome, or mint a fresh key
-- inside one task to escape the dedupe). Cell B-11 proves both directions.
create function clara._close_expected_op_key(p_task uuid, p_verb text, p_subject uuid) returns text
  language sql immutable as $$
  select encode(sha256(convert_to(p_task::text || ':' || p_verb || ':' || p_subject::text, 'UTF8')), 'hex')
$$;
revoke all on function clara._close_expected_op_key(uuid, text, uuid) from public;

-- G.3 · TIER A, in one body (design §3.2 Tier A; Annex A.1's skeleton). RAISES, writes nothing —
-- an act that cannot even establish who is asking has nothing durable to say. Rung order is the
-- design's own: credential -> allowlist -> client pin -> bound task -> op key non-blank -> op key
-- derived -> subject in the credential's firm.
--
-- WHY THE CAPABILITY GATE IS DELIBERATELY NOT A RUNG HERE (§3.1's entrance seam, D-15): the human
-- entrance's authority wall is _human_ctx(bookkeeper) + _has_capability(...,'close_and_attest');
-- the agent entrance's is the close_prep credential + the allowlist row + the client pin + the
-- bound wake task. NEITHER entrance reaches the other's wall, and the shared core carries neither.
create function clara._close_wake_ctx(p_verb text, p_subject_kind text, p_subject_id uuid, p_op_key text)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare w record; v_task uuid; v_client uuid; v_firm uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03',
      detail = '{"reason":"no_wake_credential"}';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, p_verb);
  -- THE CLIENT PIN. A close_prep credential is client-bound by its own CHECK; the subject must
  -- resolve to THAT client or the call is refused. This is why the READS are wrappers and not a
  -- one-line grant on get_close_plan (D-04): a firm-scoped grant would let a client-pinned lane
  -- read every client's plan in the firm.
  v_client := clara._close_subject_client(p_subject_kind, p_subject_id);
  if w.client_id is null or v_client is null or w.client_id is distinct from v_client then
    raise exception 'wake close authority is not pinned to this subject' using errcode = 'CLR03',
      detail = '{"reason":"wake_client_pin_mismatch"}';
  end if;
  -- THE MECHANICAL BINDING (TA-P4 (2), F14). Never a wrapper argument: a caller-supplied task id
  -- is the model asserting its own provenance.
  v_task := clara._wake_task_id();
  if v_task is null then
    raise exception 'this wake credential names no agent task' using errcode = 'CLR03',
      detail = '{"reason":"wake_task_unbound"}';
  end if;
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'an unattended act needs its idempotency key' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  if p_op_key is distinct from clara._close_expected_op_key(v_task, p_verb, p_subject_id) then
    raise exception 'the supplied op_key is not the derived key for this (task, verb, subject)'
      using errcode = 'CLR10', detail = '{"reason":"op_key_not_derived"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = v_client;
  if v_firm is null or v_firm is distinct from w.firm_id then
    raise exception 'the subject is not in this credential''s firm' using errcode = 'CLR11',
      detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  return jsonb_build_object('firm_id', w.firm_id, 'client_id', v_client,
    'wake_kind', w.wake_kind, 'on_behalf_of', w.on_behalf_of, 'task_id', v_task);
end $$;
revoke all on function clara._close_wake_ctx(text, text, uuid, text) from public;

-- G.4 · THE ONE RECEIPT WRITER (design §3.8, TA-P4). Every agent core writes EXACTLY one row
-- through this, in its own transaction, so the shape is centralised once and a Tier-C rollback
-- takes the receipt with it. The receipt is written for BOTH verdicts — a refusal that leaves no
-- trace is the silent-daily-log-line failure F-A4 exists to end.
--
-- REPLAY, AND THE IDENTITY PROOF THE FIRST CUT ONLY CLAIMED (FIX-1, both review lanes).
-- uq_aar is (firm_id, act_kind, subject_kind, subject_id, op_key, VERDICT) — see the table's own
-- note for why verdict is in the key. A retried op_key inside one wake task replays the delegate's
-- own _reserve_op outcome and would then try to insert a SECOND receipt; ON CONFLICT DO NOTHING
-- keeps the table append-only and idempotent.
--
-- THE READ-BACK NOW ACTUALLY COMPARES. The first cut selected `verdict` into a record and never
-- looked at it — a law-3 guard that was designed, commented, and never written; both reviewers
-- found it and the native lane reproduced the consequence on two rigs. The standing row must BE
-- this act: same verdict (structural now, since verdict is in the conflict target), same wake
-- task, same acting actor, same client, same wake kind, same failing-rung vector. Anything else
-- means an op key is being pointed at a different act, and this body RAISES rather than returning
-- an id that would misdescribe what happened. Raising inside an agent core aborts the whole
-- transaction, so nothing durable can carry a lying receipt; the lane's next wake is a new task,
-- a new derived op key, and an honest re-measurement (D-25 / cell B-11's own semantics).
--
-- WHY BOTH HALVES AND NOT JUST ONE. Verdict-in-the-key alone would let a foreign or pre-planted
-- row satisfy a read-back; the comparison alone would abort the legitimate outcome-changed retry
-- that ought to leave a second, honest trace. Together: every outcome is durable, and the row this
-- function returns is provably the act its caller just performed.
create function clara._agent_close_receipt(p_firm uuid, p_client uuid, p_act_kind text,
    p_subject_kind text, p_subject_id uuid, p_wake_kind text, p_on_behalf_of uuid, p_task uuid,
    p_rationale text, p_model jsonb, p_verdict text, p_rung_vector jsonb, p_op_key text)
  returns uuid language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_id uuid; v_existing record; v_name text; v_version text; v_rationale text; v_incomplete boolean;
begin
  -- THE receipt_incomplete PARADOX, caught by this file's own battery before it shipped: rung B2
  -- exists to turn an incomplete model/rationale triple into a DURABLE typed refusal -- but the
  -- carrier's own NOT-NULL/non-blank CHECKs would reject that very row, so the refusal would have
  -- died as a raw 23514 and left NOTHING on the record. The three columns are therefore normalised
  -- to a stated placeholder, and the placeholder is admissible ONLY on a refusal whose own vector
  -- says the triple was incomplete. An ACTED receipt can never carry one: the guard below re-raises
  -- rather than recording a model name nobody supplied.
  v_name := coalesce(nullif(btrim(coalesce(p_model ->> 'name', '')), ''), '(unstated)');
  v_version := coalesce(nullif(btrim(coalesce(p_model ->> 'version', '')), ''), '(unstated)');
  v_rationale := left(coalesce(nullif(btrim(coalesce(p_rationale, '')), ''), '(unstated)'), 4000);
  v_incomplete := exists (
    select 1 from jsonb_array_elements(coalesce(p_rung_vector, '[]'::jsonb)) x(el)
     where x.el ->> 'token' = 'receipt_incomplete');
  if (v_name = '(unstated)' or v_version = '(unstated)' or v_rationale = '(unstated)')
     and not (p_verdict = 'refused' and v_incomplete) then
    raise exception 'an agent act receipt may carry a placeholder triple ONLY on a receipt_incomplete refusal'
      using errcode = 'CLR10', detail = '{"reason":"receipt_triple_placeholder_misuse"}';
  end if;
  insert into clara.agent_act_receipts(firm_id, client_id, act_kind, subject_kind, subject_id,
      acting_actor, on_behalf_of, via_wake_kind, wake_task_id, model_name, model_version,
      rationale, verdict, rung_vector, op_key)
    values (p_firm, p_client, p_act_kind, p_subject_kind, p_subject_id,
      clara.agent_user_id(), p_on_behalf_of, p_wake_kind, p_task,
      v_name, v_version, v_rationale, p_verdict, coalesce(p_rung_vector, '[]'::jsonb), p_op_key)
    on conflict (firm_id, act_kind, subject_kind, subject_id, op_key, verdict, rung_digest) do nothing
    returning id into v_id;
  if v_id is null then
    select id, verdict, wake_task_id, acting_actor, client_id, via_wake_kind, rung_vector
      into v_existing from clara.agent_act_receipts
      where firm_id = p_firm and act_kind = p_act_kind and subject_kind = p_subject_kind
        and subject_id = p_subject_id and op_key = p_op_key and verdict = p_verdict
        and rung_digest = md5(coalesce(p_rung_vector, '[]'::jsonb)::text);
    -- ARM-0 (law 68): the insert conflicted, so a row MUST be there. If the read-back cannot see
    -- one, something is wrong that this body must not paper over with a NULL receipt id.
    if v_existing.id is null then
      raise exception 'the agent-act receipt for op_key % conflicted but cannot be read back', p_op_key
        using errcode = 'CLR08', detail = '{"reason":"receipt_readback_absent"}';
    end if;
    if v_existing.verdict      is distinct from p_verdict
       or v_existing.wake_task_id is distinct from p_task
       or v_existing.acting_actor is distinct from clara.agent_user_id()
       or v_existing.client_id    is distinct from p_client
       or v_existing.via_wake_kind is distinct from p_wake_kind
       or v_existing.rung_vector  is distinct from coalesce(p_rung_vector, '[]'::jsonb) then
      raise exception 'op_key % already names a DIFFERENT act; a replayed key must never return another act''s receipt', p_op_key
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'op_key_identity_mismatch',
          'act_kind', p_act_kind, 'subject_kind', p_subject_kind, 'subject_id', p_subject_id,
          'standing_verdict', v_existing.verdict, 'incoming_verdict', p_verdict)::text;
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end $$;
revoke all on function clara._agent_close_receipt(uuid, uuid, text, text, uuid, text, uuid, uuid,
  text, jsonb, text, jsonb, text) from public;

-- G.5 · TIER B's two UNIVERSAL rungs (B1 · B2), evaluated on EVERY call of every F-A4 verb. Returns
-- the failing vector; an empty array means "these two rungs are clear", never "the act may proceed"
-- (each verb appends its own rungs before deciding). Every rung is evaluated on every call and the
-- receipt carries the FULL failing vector, so a refusal explains everything wrong at once rather
-- than one thing per wake.
create function clara._close_tier_b_common(p_client uuid, p_rationale text, p_model jsonb)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v jsonb := '[]'::jsonb;
begin
  -- B1 — no live hold on this (client, purpose).
  if clara._close_prep_hold_active(p_client, 'close_prep') then
    v := v || jsonb_build_array(jsonb_build_object('rung', 'B1', 'token', 'close_prep_held'));
  end if;
  -- B2 — the receipt triple is complete: model name + version + a non-blank rationale. Checked
  -- HERE as a typed non-act rather than left to the table's NOT NULL, so an incomplete triple
  -- produces a durable, readable refusal instead of a raw constraint violation.
  -- The length bound is part of the rung, not left to the carrier's CHECK: a rationale longer than
  -- the column admits must REFUSE with a readable token rather than be silently shortened into the
  -- durable record (the receipt writer truncates only on the placeholder path this rung produces).
  if nullif(btrim(coalesce(p_rationale, '')), '') is null
     or length(p_rationale) > 4000
     or p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model ->> 'name', '')), '') is null
     or nullif(btrim(coalesce(p_model ->> 'version', '')), '') is null then
    v := v || jsonb_build_array(jsonb_build_object('rung', 'B2', 'token', 'receipt_incomplete'));
  end if;
  return v;
end $$;
revoke all on function clara._close_tier_b_common(uuid, text, jsonb) from public;

-- G.6 · RUNG B3 — drawer 1 is clean on a FRESH dry run (design §3.5, Annex A.3). Reads
-- _close_dry_run_core and requires every MEASURABLE drawer-1 check to be `pass`. `unknown`,
-- `error` and `not_measurable_before_finalize` ALL refuse: `unknown` because an unevaluated
-- identity has not passed (0056:2070's own words), `not_measurable_before_finalize` because
-- absence is not evidence (law 27(2) applied to our own read). B3 therefore tests only the
-- MEASURABLE drawer-1 set — the two in-body checks (pl_retained_earnings_roll,
-- opening_continuity_tie) are computed inside finalize_close (0056:396-397) and can never be
-- measured before it, which is registered risk R-6, not a gap.
create function clara._close_drawer1_unclean(p_client uuid, p_fy uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_dry jsonb; v_bad jsonb;
begin
  v_dry := clara._close_dry_run_core(p_client, p_fy);
  select coalesce(jsonb_agg(jsonb_build_object('check_key', el ->> 'check_key', 'state', el ->> 'state')
           order by el ->> 'check_key'), '[]'::jsonb)
    into v_bad
    from jsonb_array_elements(v_dry -> 'checks') x(el)
   where (el ->> 'drawer')::int = 1
     and el ->> 'state' <> 'pass'
     and el ->> 'state' <> 'not_measurable_before_finalize';
  return v_bad;
end $$;
revoke all on function clara._close_drawer1_unclean(uuid, uuid) from public;

-- G.7 · RUNG B13 — `belt_period_unrun` (F13; re-cut at gate 2 by GM-3 + G1 → D-22/D-26; Annex A.3).
-- THREE ARMS, in this order, inside the freezing transaction, NONE of which may RAISE.
--
--  1. FA due, through §E.2's ungranted core. THE DESIGN SAYS "depreciation_run_due is wake-safe
--     (0041:3617-3630 compares a non-null jwt_firm() only)" AND THAT IS FALSE AT THE LIVE
--     FRONTIER -- 0042's WDB-R1/WDB-R2 recut gave it _assert_due_read_ctx, measured on the rig,
--     so calling the live verb here would raise CLR03 and abort the freeze. §E.2 extracts the
--     answer half exactly as R-L11 ruled for the ADJ sibling. Refuse when due=true AND
--     period_end <= fy.ends_on.
--     "AT OR BEFORE the FY end", never "inside the FY": the oracle delegates to
--     _fa_oldest_unmet_period (0041:1904-1958) whose loop keeps the GLOBAL minimum, so a period
--     stranded in an earlier year is pinned OUTSIDE every later FY forever and the "inside the FY"
--     test passes for good — F13 reproduced by the rung written to prevent it.
--  2. FA draft outstanding. The oracle answers {due:false,'period_draft_outstanding'} whenever ANY
--     depreciation draft stands (0041:1918-1921), hiding a draft CLR19 will refuse forever once
--     the year freezes. B13 reads the draft ITSELF with the oracle's own predicate copied verbatim
--     — status='draft' and flags ? 'depreciation_charges' — PLUS the date bound the oracle lacks,
--     posting_date <= fy.ends_on. One reading of "outstanding draft", not two.
--  3. ADJ due. OQ-9(a) is RULED (R-L11), so this arm evaluates FOR REAL against the additive
--     ungranted _adjustment_run_due_core (§E) on the same "at or before ends_on" test as arm 1.
--     It STILL sits inside its own begin…exception block and an inevaluable answer STILL counts as
--     DUE (`adj_oracle_inevaluable`) — the fail-closed default is not withdrawn by the ruling, it
--     is the floor beneath it.
--
-- ARM-0 ACROSS ALL THREE: an answer that is not the documented {due:boolean,…} shape counts as DUE
-- (refuse), never as clear — the belt's own `?? {}` fallback (reconciler-fa.mjs:114-127) is the
-- concealment this rung must not inherit.
create function clara._close_belt_period_unrun(p_client uuid, p_firm uuid, p_ends_on date) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_fa jsonb; v_adj jsonb; v_reasons jsonb := '[]'::jsonb;
begin
  if p_client is null or p_ends_on is null then
    return jsonb_build_array('subject_unresolvable');   -- ARM-0.
  end if;
  -- ARM 1/2 -- the FA oracle, through §E.2's ungranted core for the SAME reason arm 3 uses §E.1's:
  -- the live verb's _assert_due_read_ctx admission (0042's WDB-R1/WDB-R2 recut, MEASURED) refuses a
  -- wake session, and a raise here would abort the freezing transaction and produce no receipt.
  begin
    v_fa := clara._depreciation_run_due_core(p_client, p_firm);
  exception when others then
    v_fa := null;
  end;
  if v_fa is null or jsonb_typeof(v_fa) <> 'object' or (v_fa -> 'due') is null
     or jsonb_typeof(v_fa -> 'due') <> 'boolean' then
    v_reasons := v_reasons || jsonb_build_array('fa_oracle_inevaluable');
  elsif (v_fa ->> 'due')::boolean
        and (v_fa ->> 'period_end') is not null
        and (v_fa ->> 'period_end')::date <= p_ends_on then
    v_reasons := v_reasons || jsonb_build_array('fa_period_due');
  end if;
  if exists (select 1 from clara.journal_entries je
              where je.client_id = p_client and je.status = 'draft'
                and je.flags ? 'depreciation_charges'
                and je.posting_date <= p_ends_on) then
    v_reasons := v_reasons || jsonb_build_array('fa_draft_outstanding');
  end if;
  -- ARM 3 -- the ADJ oracle, through OQ-9(a)'s ungranted core.
  begin
    v_adj := clara._adjustment_run_due_core(p_client, p_firm);
  exception when others then
    v_adj := null;
  end;
  if v_adj is null or jsonb_typeof(v_adj) <> 'object' or (v_adj -> 'due') is null
     or jsonb_typeof(v_adj -> 'due') <> 'boolean' then
    v_reasons := v_reasons || jsonb_build_array('adj_oracle_inevaluable');
  elsif (v_adj ->> 'due')::boolean
        and (v_adj ->> 'period_end') is not null
        and (v_adj ->> 'period_end')::date <= p_ends_on then
    v_reasons := v_reasons || jsonb_build_array('adj_period_due');
  end if;
  return v_reasons;
end $$;
revoke all on function clara._close_belt_period_unrun(uuid, uuid, date) from public;

-- G.8 · RUNG B14 — `reopen_correction_in_flight` (new at gate 2, D-20). Applies to
-- wake_begin_close ONLY when the year is `reopened`: refuse while any unapproved FY-dated draft
-- stands. Re-freezing after a human reopens IS hers (D-20) — but blocking a human's own fix behind
-- CLR19 is not, so the freeze waits until the correction is posted.
--
-- THE SAME POPULATION _close_gate_drafts MEASURES (0056:1316, gate unapproved_drafts_in_period),
-- read THROUGH that evaluator, so the freeze and the gate cannot disagree about "a correction is
-- in flight" (TA-P11) — and clara.close_prep_due() applies the identical predicate through the
-- identical body, so the clock and the rung admit the same years.
--
-- ARM-0: a NULL FY status is its own branch and refuses.
create function clara._close_reopen_correction_in_flight(p_client uuid, p_fy uuid, p_status text)
  returns boolean language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  if p_client is null or p_fy is null or p_status is null then return true; end if;
  if p_status <> 'reopened' then return false; end if;
  return jsonb_array_length(coalesce(clara._close_gate_drafts(p_client, p_fy) -> 'drafts', '[]'::jsonb)) > 0;
end $$;
revoke all on function clara._close_reopen_correction_in_flight(uuid, uuid, text) from public;

-- =================================================================================================
-- §I · THE HUMAN DOORS (design §3.11's minimal doors; Annex I.1 rows 5 and 6).
--
-- Pressing the brake must be CHEAPER than any act it stops, so both hold verbs sit at the
-- bookkeeper floor — the same floor as the lane they pause. The receipt panel is bookkeeper+ too:
-- a receipt nobody can read is not an audit control (TA-P4 (4)).
-- =================================================================================================

create function clara.hold_close_prep(p_client uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'holding the close-prep lane requires its reason -- who paused this and why'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'hold_close_prep', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- A SECOND hold on an already-held lane is not an error and not a second row: the partial unique
  -- index is the authority, and a caller who presses the brake twice gets the standing hold back.
  select h.id into v_id from clara.close_prep_holds h
    where h.client_id = p_client and h.purpose = 'close_prep' and h.released_at is null;
  if v_id is null then
    insert into clara.close_prep_holds(firm_id, client_id, purpose, held_by, reason)
      values (c.firm, p_client, 'close_prep', c.actor, p_reason)
      returning id into v_id;
    perform clara._audit(c.firm, c.actor, null, null, 'hold_close_prep', null,
      jsonb_build_object('client', p_client, 'hold_id', v_id, 'reason', p_reason, 'op_key', p_op_key));
  end if;
  return clara._finish_op(c.firm, 'hold_close_prep', p_op_key,
    jsonb_build_object('hold_id', v_id, 'client_id', p_client, 'purpose', 'close_prep', 'held', true));
end $$;
revoke all on function clara.hold_close_prep(uuid, text, text) from public;

create function clara.release_close_prep(p_client uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_firm uuid; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'releasing the close-prep lane requires its reason'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'release_close_prep', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RELEASE IS A STAMP, NEVER A DELETE (Annex A.7): the history of who paused what and why is
  -- permanent.
  update clara.close_prep_holds
    set released_by = c.actor, released_at = now(), release_reason = p_reason
    where client_id = p_client and purpose = 'close_prep' and released_at is null
    returning id into v_id;
  if v_id is null then
    raise exception 'no live close-prep hold stands for this client'
      using errcode = 'CLR10', detail = '{"reason":"close_prep_hold_absent"}';
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'release_close_prep', null,
    jsonb_build_object('client', p_client, 'hold_id', v_id, 'reason', p_reason, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'release_close_prep', p_op_key,
    jsonb_build_object('hold_id', v_id, 'client_id', p_client, 'purpose', 'close_prep', 'held', false));
end $$;
revoke all on function clara.release_close_prep(uuid, text, text) from public;

-- -------------------------------------------------------------------------------------------------
-- I.1b · clara.settle_close_proposal — THE PROPOSAL'S OWN TERMINAL DOOR (conductor ruling, this
-- train). Annex I.1's review card offers the reviewer two actions — "adopt" and "decline with a
-- reason" — but no PR's list named a DB door for either, and clara.attest_close_exception READS a
-- proposal without settling it (0120:1010-1041, measured). Without this verb `adopted` and
-- `withdrawn` are UNREACHABLE values on a live CHECK: a proposal stays `open` for ever after the
-- reviewer has walked every attestation, and uq_close_proposal_live then blocks the lane from ever
-- proposing again on that run. A carrier with a known-stuck lifecycle is not a carrier.
--
-- THE FLOOR IS attest_close_exception's, MIRRORED RATHER THAN INVENTED (0120:931-936, read at the
-- bytes): `_human_ctx(role_rank('bookkeeper'))` THEN `_has_capability(…,'close_and_attest')`.
-- Adopting is what the reviewer does in the same sitting as the attestations it authorises, and
-- declining is the refusal of that same key-② work — a lower floor here would be a side door onto
-- a decision the capability model already governs. §3.1's entrance seam is untouched: the AGENT
-- entrance cannot satisfy this wall (cell fa4c.D1 proves she holds no capability row anywhere and
-- no wake role holds EXECUTE on this verb).
--
-- ONLY TWO STATES ARE ADMISSIBLE. `superseded` is the LANE's own stamp — _agent_close_proposal_core
-- writes it when it replaces its own predecessor at a moved gate vector — and a human who wants a
-- fresh proposal asks the lane for one rather than re-labelling the old row. `open` is a birth
-- state and never a destination. Anything else is a typed CLR10, so a caller's typo is a readable
-- refusal rather than a CHECK violation.
--
-- LAW 6, STRUCTURALLY: this verb performs the ONE update _tf_close_proposals_settle_only admits
-- and there is no delete path anywhere. The trigger is the backstop; the positive state read below
-- is the MESSAGE (a reviewer should read "already adopted", not "immutable").
-- -------------------------------------------------------------------------------------------------
create function clara.settle_close_proposal(p_proposal uuid, p_state text, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_p record; v_reason text; v_missing int;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then
    raise exception 'settling a close proposal takes the close_and_attest capability (key 2)'
      using errcode = 'CLR04',
        detail = '{"reason":"capability_missing","capability":"close_and_attest"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_state is null or p_state not in ('adopted', 'withdrawn') then
    raise exception 'a close proposal settles to adopted or withdrawn, never %', coalesce(p_state, 'null')
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'close_proposal_state_invalid', 'state', p_state)::text;
  end if;
  -- abandon_close's own shape (0120:1167-1170): the refusing act is the one that must say why.
  -- An adoption needs no reason -- the attestations it authorises carry their own, per item.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_state = 'withdrawn' and v_reason is null then
    raise exception 'declining a close proposal requires its reason -- who declined this and why'
      using errcode = 'CLR10', detail = '{"reason":"fact_basis_missing"}';
  end if;
  select * into v_p from clara.close_proposals cp where cp.id = p_proposal;
  if v_p.id is null or v_p.firm_id <> c.firm then
    raise exception 'close proposal not found in your firm'
      using errcode = 'CLR11', detail = '{"reason":"fiscal_year_not_in_firm"}';
  end if;
  -- RESERVED AFTER the firm check, so a foreign id can never burn an op key (and the CLR11 stays
  -- an honest not-found rather than becoming a replayable outcome).
  v_dedupe := clara._reserve_op(c.firm, 'settle_close_proposal', p_op_key,
    clara._hash(jsonb_build_object('proposal', p_proposal, 'state', p_state, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- SERIALIZED AGAINST THE ATTESTATION FLOW (FIX-8). The state was read above WITHOUT a lock, so
  -- two settles — or a settle racing an attest_close_exception(p_from_proposal) that is checking
  -- `cp.state = 'open'` — could both pass their read and both proceed. Re-read FOR UPDATE and
  -- decide on the LOCKED row: from here the proposal cannot change under this transaction, and a
  -- concurrent attestation either committed before us (and is counted below) or waits and then
  -- finds the settled state its own guard refuses.
  select * into v_p from clara.close_proposals cp where cp.id = p_proposal for update;
  if v_p.state <> 'open' then
    raise exception 'close proposal % is already %; a settled proposal is terminal', p_proposal, v_p.state
      using errcode = 'CLR41',
        detail = jsonb_build_object('reason', 'close_proposal_already_settled',
          'state', v_p.state)::text;
  end if;
  -- ADOPTION MUST PROVE ITS ATTESTATIONS (FIX-7). "Adopted" is a claim about work a professional
  -- actually did: that every drafted item was signed through attest_close_exception naming THIS
  -- proposal. Stamping it on a proposal with no linked attestations would put a false professional
  -- record on a close, which is the exact class TA-P4 exists to prevent — so the door counts the
  -- LIVE attestations that cite this proposal, in the same transaction that settles it, and every
  -- drafted (check_key, item_key) must be covered. A withdrawal proves nothing: declining is the
  -- refusal of that work.
  if p_state = 'adopted' then
    select count(*)::int into v_missing
      from jsonb_array_elements(v_p.drafted) x(el)
     where not exists (
       select 1 from clara.close_attestations a
        where a.close_run_id = v_p.close_run_id
          and a.check_key = (x.el ->> 'check_key')
          and a.item_key = (x.el ->> 'item_key')
          and a.authored_by = 'agent'
          and a.superseded_at is null);
    if v_missing > 0 then
      raise exception 'this proposal cannot be adopted: % of its drafted item(s) carry no live agent-authored attestation on the run', v_missing
        using errcode = 'CLR41',
          detail = jsonb_build_object('reason', 'close_proposal_attestations_missing',
            'uncovered_items', v_missing)::text;
    end if;
  end if;
  update clara.close_proposals
    set state = p_state, settled_by = c.actor, settled_at = now(), settle_reason = v_reason
    where id = p_proposal;
  perform clara._audit(c.firm, c.actor, null, null, 'settle_close_proposal', null,
    jsonb_build_object('proposal_id', p_proposal, 'close_run_id', v_p.close_run_id,
      'fiscal_year_id', v_p.fiscal_year_id, 'state', p_state, 'reason', v_reason,
      'op_key', p_op_key));
  perform clara._append_event(c.firm, 'close.proposal_settled', v_p.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('proposal_id', p_proposal, 'close_run_id', v_p.close_run_id,
      'fiscal_year_id', v_p.fiscal_year_id, 'state', p_state));
  return clara._finish_op(c.firm, 'settle_close_proposal', p_op_key,
    jsonb_build_object('proposal_id', p_proposal, 'close_run_id', v_p.close_run_id,
      'state', p_state, 'settled_by', c.actor, 'settled_at', now(), 'settle_reason', v_reason));
end $$;
revoke all on function clara.settle_close_proposal(uuid, text, text, text) from public;
comment on function clara.settle_close_proposal(uuid, text, text, text) is
  'F-A4 (Annex I.1''s review card, built at the conductor''s ruling): the proposal carrier''s '
  'terminal human door. Bookkeeper floor + close_and_attest, mirroring attest_close_exception''s '
  'own gate; admits ONLY adopted/withdrawn (superseded is the lane''s own stamp, open is a birth '
  'state); a withdrawal must state its reason. Settling FREES uq_close_proposal_live, so the lane '
  'may propose again on the same run. There is no delete path.';

-- TA-P4 (4): the bookkeeper+ read surface. One row per agent act — kind, subject, model + version,
-- rationale, verdict, and the failing-rung vector when refused.
create function clara.list_agent_act_receipts(p_client uuid, p_since timestamptz default null)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'receipt_id', r.id, 'act_kind', r.act_kind, 'subject_kind', r.subject_kind,
        'subject_id', r.subject_id, 'verdict', r.verdict, 'rung_vector', r.rung_vector,
        'model', jsonb_build_object('name', r.model_name, 'version', r.model_version),
        'rationale', r.rationale, 'via_wake_kind', r.via_wake_kind,
        'wake_task_id', r.wake_task_id, 'on_behalf_of', r.on_behalf_of,
        'created_at', r.created_at)
      order by r.created_at desc, r.id)
    from clara.agent_act_receipts r
    where r.client_id = p_client and r.firm_id = c.firm
      and (p_since is null or r.created_at >= p_since)), '[]'::jsonb);
end $$;
revoke all on function clara.list_agent_act_receipts(uuid, timestamptz) from public;

-- =================================================================================================
-- §H · THE TWELVE WAKE WRAPPERS AND THEIR AGENT CORES (design §3.1's table, Annex E.1's
-- signatures). Wrapper 12 of the design's thirteen — wake_establish_prepayment_schedule — is
-- PARKED on two measured blockers; see this file's header, deviation (1).
--
-- THE WRAPPER SHAPE IS Annex A.1's, exactly: resolve Tier A through the ONE shared body, then
-- delegate. NO DML TEXT IN A WRAPPER BODY (0077:22-29's own reason: a granted body carrying DML
-- against a censused table breaks that census by construction).
--
-- THE AGENT CORE SHAPE, uniform across all twelve:
--   Tier B's universal rungs -> the verb's own rungs -> if the vector is non-empty, write a
--   REFUSED receipt and RETURN (never raise: the transaction COMMITS so the reason is durable) ->
--   otherwise call the shared delegate and write an ACTED receipt in the SAME transaction.
-- Every rung is EVALUATED on every call and the receipt carries the FULL failing vector.
--
-- LOCK ORDER (Annex A.2): the agent cores take NO locks of their own. Each shared delegate takes
-- the estate's own two, in the estate's own order — pg_advisory_xact_lock(203005004, client) then
-- (203005007, client) — because a lane that invents its own order opens an ABBA against a
-- concurrent human act (F-A2's R-L2 lesson). wake_mint_month_snapshot's delegate takes
-- 203005007-EXCLUSIVE alone, the BOTTOM of that order, and is never called nested inside a close
-- verb's transaction.
-- =================================================================================================

-- -------------------------------------------------------------------------------------------------
-- H.1 · THE FIVE READS (wrappers 1-5) + THE DRY RUN (wrapper 6).
--
-- All six mint a receipt (TA-P4 extends the discipline to reads), so all six carry the triple —
-- see this file's header, deviation (3). All six are `stable`: nothing here writes a books row.
-- The RECEIPT is not a books row and its INSERT is what makes these cores VOLATILE, which is why
-- the cores below are plain (volatile) functions delegating to `stable` reads.
-- -------------------------------------------------------------------------------------------------

-- THE GATE RUNS BEFORE THE READ, and that ordering is load-bearing rather than tidy. A read
-- wrapper that handed its payload to the receipt-writer as an ARGUMENT would evaluate the read
-- even on a refusal — and if that read then RAISED (a receipt whose fiscal year has gone, a gate
-- evaluator that errors), the raise would escape instead of becoming the typed non-act receipt
-- Tier B promises ("A TYPED NON-ACT RECEIPT, no raise; the transaction COMMITS so the reason is
-- durable"). So each read wrapper asks this gate FIRST, returns its answer when it is non-null,
-- and only then reaches its own extracted core. NULL means "the two universal rungs are clear".
create function clara._close_read_gate(p_ctx jsonb, p_act_kind text, p_subject_kind text,
    p_subject_id uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_client uuid := (p_ctx ->> 'client_id')::uuid;
  v_rungs jsonb; v_receipt uuid;
begin
  v_rungs := clara._close_tier_b_common(v_client, p_rationale, p_model);
  if jsonb_array_length(v_rungs) = 0 then return null; end if;
  v_receipt := clara._agent_close_receipt((p_ctx ->> 'firm_id')::uuid, v_client, p_act_kind,
    p_subject_kind, p_subject_id, p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid,
    (p_ctx ->> 'task_id')::uuid, p_rationale, p_model, 'refused', v_rungs, p_op_key);
  return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
end $$;
revoke all on function clara._close_read_gate(jsonb, text, text, uuid, text, jsonb, text) from public;

create function clara._agent_close_read_core(p_ctx jsonb, p_act_kind text, p_subject_kind text,
    p_subject_id uuid, p_payload jsonb, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_receipt uuid;
begin
  v_receipt := clara._agent_close_receipt((p_ctx ->> 'firm_id')::uuid, (p_ctx ->> 'client_id')::uuid,
    p_act_kind, p_subject_kind, p_subject_id, p_ctx ->> 'wake_kind',
    nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key);
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt, 'result', p_payload);
end $$;
revoke all on function clara._agent_close_read_core(jsonb, text, text, uuid, jsonb, text, jsonb, text) from public;
comment on function clara._agent_close_read_core(jsonb, text, text, uuid, jsonb, text, jsonb, text) is
  'F-A4: the acted half of the six read wrappers. THE PAYLOAD IS COMPUTED BY THE WRAPPER, not '
  'here, so each wrapper names its own already-extracted core (the read is a stable body; only the '
  'receipt insert is volatile) — a single dispatching body would have had to branch on a verb '
  'string to choose a reader, which is a second reading of "which read is this". The refusal half '
  'is clara._close_read_gate, called BEFORE the payload is evaluated.';

-- wrapper 1 · wake_list_fiscal_years -> _list_fiscal_years_core (D-17). Client-pinned by Tier A.
create function clara.wake_list_fiscal_years(p_client uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_gate jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_list_fiscal_years', 'client', p_client, p_op_key);
  v_gate := clara._close_read_gate(v_ctx, 'close_read', 'client', p_client, p_rationale, p_model, p_op_key);
  if v_gate is not null then return v_gate; end if;
  return clara._agent_close_read_core(v_ctx, 'close_read', 'client', p_client,
    clara._list_fiscal_years_core((v_ctx ->> 'firm_id')::uuid, p_client),
    p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_list_fiscal_years(uuid, text, jsonb, text) from public;

-- wrapper 2 · wake_get_close_plan -> clara.get_close_plan(uuid) UNCHANGED (D-04). The plan body
-- resolves its firm through clara.actor_firm_id() (0064:166), which is coalesce(wake_firm(),
-- jwt_firm()) — so it already answers under a wake session and needs no extraction at all. The pin
-- is asserted in the wrapper: get_close_plan is FIRM-scoped, and a bare grant would let a
-- client-pinned lane read every client's plan in the firm.
create function clara.wake_get_close_plan(p_fiscal_year_id uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_gate jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_get_close_plan', 'fiscal_year', p_fiscal_year_id, p_op_key);
  v_gate := clara._close_read_gate(v_ctx, 'close_read', 'fiscal_year', p_fiscal_year_id, p_rationale, p_model, p_op_key);
  if v_gate is not null then return v_gate; end if;
  return clara._agent_close_read_core(v_ctx, 'close_read', 'fiscal_year', p_fiscal_year_id,
    clara.get_close_plan(p_fiscal_year_id), p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_get_close_plan(uuid, text, jsonb, text) from public;

-- wrapper 3 · wake_get_close_readiness -> _close_readiness_core.
create function clara.wake_get_close_readiness(p_client uuid, p_fy uuid, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_gate jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_get_close_readiness', 'fiscal_year', p_fy, p_op_key);
  -- The (client, fiscal year) pair is congruent BY THE PIN: Tier A resolved the FY's own client
  -- and matched it to the credential, so a p_client naming a different client is refused here
  -- rather than silently measured against another client's year.
  if p_client is distinct from (v_ctx ->> 'client_id')::uuid then
    raise exception 'the named client is not this fiscal year''s client' using errcode = 'CLR11',
      detail = '{"reason":"fiscal_year_client_mismatch"}';
  end if;
  v_gate := clara._close_read_gate(v_ctx, 'close_read', 'fiscal_year', p_fy, p_rationale, p_model, p_op_key);
  if v_gate is not null then return v_gate; end if;
  return clara._agent_close_read_core(v_ctx, 'close_read', 'fiscal_year', p_fy,
    clara._close_readiness_core((v_ctx ->> 'firm_id')::uuid, p_client, p_fy),
    p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_get_close_readiness(uuid, uuid, text, jsonb, text) from public;

-- wrapper 4 · wake_verify_close -> _verify_close_core.
create function clara.wake_verify_close(p_receipt uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_gate jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_verify_close', 'close_receipt', p_receipt, p_op_key);
  v_gate := clara._close_read_gate(v_ctx, 'close_read', 'close_receipt', p_receipt, p_rationale, p_model, p_op_key);
  if v_gate is not null then return v_gate; end if;
  return clara._agent_close_read_core(v_ctx, 'close_read', 'close_receipt', p_receipt,
    clara._verify_close_core((v_ctx ->> 'firm_id')::uuid, p_receipt),
    p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_verify_close(uuid, text, jsonb, text) from public;

-- wrapper 5 · wake_snapshot_state -> the PRE-EXISTING ungranted clara._snapshot_state_core
-- (0057:564). NO live-body recut at all (D-16, gate G2 corrected v1's "unchanged, and fine" for
-- the wrong reason): the human clara.snapshot_state opens _human_ctx, but its pure core already
-- exists, so the firm check is simply re-expressed here on the wake side.
create function clara.wake_snapshot_state(p_snapshot uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_gate jsonb; v_firm uuid;
begin
  v_ctx := clara._close_wake_ctx('wake_snapshot_state', 'snapshot', p_snapshot, p_op_key);
  v_gate := clara._close_read_gate(v_ctx, 'close_read', 'snapshot', p_snapshot, p_rationale, p_model, p_op_key);
  if v_gate is not null then return v_gate; end if;
  select ps.firm_id into v_firm from clara.period_snapshots ps where ps.id = p_snapshot;
  if v_firm is null or v_firm is distinct from (v_ctx ->> 'firm_id')::uuid then
    raise exception 'snapshot is not in your firm' using errcode = 'CLR11';
  end if;
  return clara._agent_close_read_core(v_ctx, 'close_read', 'snapshot', p_snapshot,
    jsonb_build_object('snapshot_id', p_snapshot, 'state', clara._snapshot_state_core(p_snapshot)),
    p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_snapshot_state(uuid, text, jsonb, text) from public;

-- wrapper 6 · wake_dry_run_close_readiness -> _close_dry_run_core (design §3.5). MEASURES WITHOUT
-- ARMING THE WALL: it opens no run, writes no close_gate_results row and never touches
-- fiscal_years.status, so an ordinary human approve_entry on an FY-dated draft still succeeds
-- after it (cell A-7). That is F4's whole repair.
create function clara.wake_dry_run_close_readiness(p_client uuid, p_fy uuid, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb; v_gate jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_dry_run_close_readiness', 'fiscal_year', p_fy, p_op_key);
  if p_client is distinct from (v_ctx ->> 'client_id')::uuid then
    raise exception 'the named client is not this fiscal year''s client' using errcode = 'CLR11',
      detail = '{"reason":"fiscal_year_client_mismatch"}';
  end if;
  v_gate := clara._close_read_gate(v_ctx, 'close_dry_run', 'fiscal_year', p_fy, p_rationale, p_model, p_op_key);
  if v_gate is not null then return v_gate; end if;
  return clara._agent_close_read_core(v_ctx, 'close_dry_run', 'fiscal_year', p_fy,
    clara._close_dry_run_core(p_client, p_fy), p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_dry_run_close_readiness(uuid, uuid, text, jsonb, text) from public;

-- -------------------------------------------------------------------------------------------------
-- H.2 · wrapper 7 · wake_open_fiscal_year (design §3.11, gate G2's three-body chain).
--
-- HERS ONLY ON THE NARROW PATH THE SITTING DREW (OQ-A4-9): the client file already carries an FY
-- end and she accepts the system's computation UNCHANGED. Rung B8 refuses `fy_end_not_on_file`
-- otherwise, because choosing a fiscal-year end is an assertion about the client's constitution
-- and stays human.
--
-- THE VERB TAKES NO p_ends_on, DELIBERATELY (Annex E.1's note): supplying an end date IS the
-- assertion the sitting reserved. The core reaches _propose_fiscal_year_core (the extraction below
-- 0056:1634's _human_ctx, NOT the granted human verb) and uses its computed end.
--
-- THE HONESTY LABEL IS AN ARGUMENT, never a guess: the human entrance passes its own `case`
-- verbatim; this entrance passes `asserted_by_file` — "on file, accepted unchanged, not asserted
-- by a human at this moment".
-- -------------------------------------------------------------------------------------------------
create function clara._agent_open_fiscal_year_core(p_ctx jsonb, p_client uuid, p_label text,
    p_starts_on date, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_rungs jsonb; v_receipt uuid; v_proposal jsonb; v_result jsonb;
begin
  v_rungs := clara._close_tier_b_common(p_client, p_rationale, p_model);
  -- B8 — the file carries an FY end AND the proposal's FALLBACK is unused. Both halves matter:
  -- _propose_fiscal_year_core answers with fy_end.fallback=true when clients.fy_end_month is NULL
  -- and it defaulted to 31 December (0120:1239-1241), and accepting a DEFAULT is not "the file
  -- already carries an end".
  begin
    v_proposal := clara._propose_fiscal_year_core(v_firm, p_client, p_starts_on);
  exception when others then
    v_proposal := null;
  end;
  if v_proposal is null or (v_proposal #>> '{fy_end,fallback}') is null
     or (v_proposal #>> '{fy_end,fallback}')::boolean
     or (v_proposal ->> 'ends_on') is null then
    v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B8',
      'token', 'fy_end_not_on_file'));
  end if;
  if jsonb_array_length(v_rungs) > 0 then
    v_receipt := clara._agent_close_receipt(v_firm, p_client, 'open_fy', 'client', p_client,
      p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
      p_rationale, p_model, 'refused', v_rungs, p_op_key);
    return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
  end if;
  v_result := clara._open_fiscal_year_core(v_firm, clara.agent_user_id(), p_client, p_label,
    p_starts_on, (v_proposal ->> 'ends_on')::date, null, p_op_key, 'asserted_by_file');
  v_receipt := clara._agent_close_receipt(v_firm, p_client, 'open_fy', 'fiscal_year',
    (v_result ->> 'fiscal_year_id')::uuid, p_ctx ->> 'wake_kind',
    nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key);
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt, 'result', v_result);
end $$;
revoke all on function clara._agent_open_fiscal_year_core(jsonb, uuid, text, date, text, jsonb, text) from public;

create function clara.wake_open_fiscal_year(p_client uuid, p_label text, p_starts_on date,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_open_fiscal_year', 'client', p_client, p_op_key);
  return clara._agent_open_fiscal_year_core(v_ctx, p_client, p_label, p_starts_on,
    p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_open_fiscal_year(uuid, text, date, text, jsonb, text) from public;

-- -------------------------------------------------------------------------------------------------
-- H.3 · wrapper 8 · wake_begin_close — THE FREEZE, WALLED (design §3.4).
--
-- "wake_begin_close is the LAST act of preparation, not the first" (F4). B3/B4/B5/B13/B14 mean she
-- flips the year only when drawer 1 is clean on a FRESH dry run, the ordering law holds, no belt
-- period is unrun and no reopen correction is in flight. The flip, the run insert and
-- _evaluate_close_gates are the live core's own statements, unchanged.
--
-- B4 and B5 REUSE the estate's own token strings (`close_already_in_progress`,
-- `close_ordering_violation`, D-12): the human verbs already raise them for the same facts
-- (0056:1756, :1768). A second spelling for one fact is how read surfaces begin to lie.
-- -------------------------------------------------------------------------------------------------
create function clara._agent_begin_close_core(p_ctx jsonb, p_fy uuid, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_client uuid := (p_ctx ->> 'client_id')::uuid;
  v_fy record; v_rungs jsonb; v_receipt uuid; v_bad jsonb; v_belt jsonb; v_result jsonb;
begin
  v_rungs := clara._close_tier_b_common(v_client, p_rationale, p_model);
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- ARM-0: an unresolvable year is not a clean one.
  if v_fy.id is null then
    v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'A', 'token', 'fiscal_year_not_in_firm'));
  else
    -- B3 — drawer 1 clean on a FRESH dry run (the measurable set; R-6 prices the other two).
    v_bad := clara._close_drawer1_unclean(v_client, p_fy);
    if jsonb_array_length(v_bad) > 0 then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B3',
        'token', 'drawer1_not_clean', 'failing', v_bad));
    end if;
    -- B4 — no close_runs row is in_progress for this FY.
    if exists (select 1 from clara.close_runs r where r.fiscal_year_id = p_fy and r.state = 'in_progress') then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B4',
        'token', 'close_already_in_progress'));
    end if;
    -- B5 — every earlier FY of the client is `closed`.
    if exists (select 1 from clara.fiscal_years earlier
                where earlier.client_id = v_fy.client_id and earlier.ordinal < v_fy.ordinal
                  and earlier.status <> 'closed') then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B5',
        'token', 'close_ordering_violation'));
    end if;
    -- B13 — no belt-due period at or before ends_on, and no outstanding belt draft dated there.
    v_belt := clara._close_belt_period_unrun(v_client, v_firm, v_fy.ends_on);
    if jsonb_array_length(v_belt) > 0 then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B13',
        'token', 'belt_period_unrun', 'reasons', v_belt));
    end if;
    -- B14 — the reopen's correction is not in flight.
    if clara._close_reopen_correction_in_flight(v_client, p_fy, v_fy.status) then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B14',
        'token', 'reopen_correction_in_flight'));
    end if;
  end if;
  if jsonb_array_length(v_rungs) > 0 then
    -- A REFUSED begin names the FISCAL YEAR: there is no run to name when the freeze never
    -- happened. §B's wall reads subject_kind='close_run', so this row can never be mistaken for
    -- the acted receipt a run owes.
    v_receipt := clara._agent_close_receipt(v_firm, v_client, 'begin_close', 'fiscal_year', p_fy,
      p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
      p_rationale, p_model, 'refused', v_rungs, p_op_key);
    return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
  end if;
  v_result := clara._begin_close_core(v_firm, clara.agent_user_id(), p_fy, p_op_key);
  v_receipt := clara._agent_close_receipt(v_firm, v_client, 'begin_close', 'close_run',
    (v_result ->> 'close_run_id')::uuid, p_ctx ->> 'wake_kind',
    nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key);
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt, 'result', v_result);
end $$;
revoke all on function clara._agent_begin_close_core(jsonb, uuid, text, jsonb, text) from public;

create function clara.wake_begin_close(p_fy uuid, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_begin_close', 'fiscal_year', p_fy, p_op_key);
  return clara._agent_begin_close_core(v_ctx, p_fy, p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_begin_close(uuid, text, jsonb, text) from public;

-- -------------------------------------------------------------------------------------------------
-- H.4 · wrapper 9 · wake_abandon_close — ANY run, walled by the attestations on it (TA-P1 C, D-20).
--
-- close_runs.started_by is still READ and recorded on the receipt — the COLUMN, never a name and
-- never users.is_agent (law 27(3)) — but it NO LONGER REFUSES: TA-P1 C hands her "abandoning a
-- close including one she did not open". `close_not_agent_run` is RETIRED, listed struck in Annex
-- E.2 rather than silently deleted.
--
-- WHAT REFUSES IS B6: a LIVE close_attestations row on the run — abandoning a run voids the
-- drawer-2 statements a professional signed against it, and voiding a human's signature is not an
-- act the register hands anyone.
--
-- An abandon on a `reopened` year is PERMITTED (B7 withdrawn, number retired): at the bytes the
-- tell survives the flatten, because list_fiscal_years computes has_active_reopen_receipt from
-- close_receipts (0056:2681-2682) and an abandon touches no receipt.
-- -------------------------------------------------------------------------------------------------
create function clara._agent_abandon_close_core(p_ctx jsonb, p_close_run uuid, p_reason text,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_client uuid := (p_ctx ->> 'client_id')::uuid;
  v_run record; v_fy_status text; v_rungs jsonb; v_receipt uuid; v_result jsonb;
begin
  v_rungs := clara._close_tier_b_common(v_client, p_rationale, p_model);
  select * into v_run from clara.close_runs r where r.id = p_close_run;
  if v_run.id is null then
    v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'A', 'token', 'fiscal_year_not_in_firm'));
  else
    -- B6 — ARM-0 first (a NULL run argument would already have failed the pin, but the rung
    -- declares its own fail-closed branch rather than inheriting one).
    if exists (select 1 from clara.close_attestations a
                where a.close_run_id = p_close_run and a.superseded_at is null) then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B6',
        'token', 'close_run_attested'));
    end if;
    if v_run.state <> 'in_progress' then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B4',
        'token', 'close_not_in_progress', 'state', v_run.state));
    end if;
    select fy.status into v_fy_status from clara.fiscal_years fy where fy.id = v_run.fiscal_year_id;
  end if;
  if jsonb_array_length(v_rungs) > 0 then
    v_receipt := clara._agent_close_receipt(v_firm, v_client, 'abandon_close', 'close_run', p_close_run,
      p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
      p_rationale, p_model, 'refused', v_rungs, p_op_key);
    return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
  end if;
  v_result := clara._abandon_close_core(v_firm, clara.agent_user_id(), p_close_run, p_reason, p_op_key);
  v_receipt := clara._agent_close_receipt(v_firm, v_client, 'abandon_close', 'close_run', p_close_run,
    p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key);
  -- started_by and the pre-abandon FY status ride the ANSWER (the design's "the receipt records
  -- flattened_from='reopened'"), read as columns, never as names.
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt,
    'started_by', v_run.started_by, 'flattened_from', v_fy_status, 'result', v_result);
end $$;
revoke all on function clara._agent_abandon_close_core(jsonb, uuid, text, text, jsonb, text) from public;

create function clara.wake_abandon_close(p_close_run uuid, p_reason text, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_abandon_close', 'close_run', p_close_run, p_op_key);
  return clara._agent_abandon_close_core(v_ctx, p_close_run, p_reason, p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_abandon_close(uuid, text, text, jsonb, text) from public;

-- -------------------------------------------------------------------------------------------------
-- H.5 · wrapper 10 · wake_propose_close — the PROPOSAL, and nothing beyond it (design §3.7).
--
-- LAW 71's WALL, stated where a builder would be tempted to cross it: this verb WRITES A PROPOSAL.
-- It does not attest, it does not finalize, and it holds neither key ② nor key ③. Adoption is
-- clara.attest_close_exception's — a HUMAN door at the bookkeeper floor behind the close_and_attest
-- capability (0120:931-936) — walked once per item by the review card, with p_from_proposal naming
-- this row so the door itself records `authored_by='agent'` and whether the text changed.
-- Deriving adoption by string comparison afterwards is what law 27(2) refuses; this is why the
-- proposal is a durable row and not a sentence in chat.
--
-- B11 · no live proposal stands for this run at the same gate digest.
-- B12 · the gate digests the proposal binds are the FRESH ones — DIGEST EQUALITY, never row
--       identity, the rule finalize_close already uses (0056:2092-2100). The freshness reference
--       is a dry run taken inside THIS transaction, compared against the run's own recorded
--       measurement, because that recorded digest is exactly what attest_close_exception will
--       compare the bound value to (0120:1033-1039).
-- -------------------------------------------------------------------------------------------------
create function clara._agent_close_proposal_core(p_ctx jsonb, p_close_run uuid, p_drafted jsonb,
    p_narrative text, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_client uuid := (p_ctx ->> 'client_id')::uuid;
  v_run record; v_rungs jsonb; v_receipt uuid; v_keys text[]; v_dry jsonb;
  v_bound jsonb := '{}'::jsonb; v_stale jsonb := '[]'::jsonb; v_k text;
  v_fresh text; v_recorded text; v_id uuid; v_live uuid; v_live_bound jsonb;
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
    select cp.id, cp.bound_digests into v_live, v_live_bound from clara.close_proposals cp
      where cp.close_run_id = p_close_run and cp.state = 'open' limit 1 for update;
    if v_live is not null and v_live_bound is not distinct from v_bound then
      v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B11',
        'token', 'close_proposal_exists', 'proposal_id', v_live));
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
          settle_reason = 'superseded by a fresh proposal on a moved gate vector'
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
end $$;
revoke all on function clara._agent_close_proposal_core(jsonb, uuid, jsonb, text, text, jsonb, text) from public;

create function clara.wake_propose_close(p_close_run uuid, p_drafted jsonb, p_narrative text,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_propose_close', 'close_run', p_close_run, p_op_key);
  return clara._agent_close_proposal_core(v_ctx, p_close_run, p_drafted, p_narrative,
    p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_propose_close(uuid, jsonb, text, text, jsonb, text) from public;

-- -------------------------------------------------------------------------------------------------
-- H.6 · wrapper 11 · wake_run_depreciation_catchup -> clara._fa_run_period_core UNCHANGED (0041).
--
-- The core the human twin and the belt also use, "so a manually-run period and a swept one are the
-- same act with the same evidence" (0041:3595-3597). F-A4 adds NO automation here and claims none:
-- both calculable families already post unattended, daily, per active client (F12). Its point is
-- ORDERING — the periods must clear BEFORE wake_begin_close, because after the freeze they cannot
-- clear at all (F13).
--
-- B9 refuses unless a LIVE, HUMAN-SIGNED fa_depreciation_authorities row exists (0041:614): SHE
-- EXECUTES AN EXISTING AUTHORITY AND NEVER SIGNS ONE.
-- p_through beyond the book clock refuses: the scope of a catch-up is a choice, but a future period
-- is not a scope, it is an invented one.
-- -------------------------------------------------------------------------------------------------
create function clara._agent_depreciation_catchup_core(p_ctx jsonb, p_client uuid, p_through date,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_rungs jsonb; v_receipt uuid; v_due jsonb; v_result jsonb; v_ran jsonb := '[]'::jsonb;
  v_guard int := 0;
begin
  v_rungs := clara._close_tier_b_common(p_client, p_rationale, p_model);
  -- B9 — a live signed authority. Read POSITIVELY on the row (law 2: absence falls through to the
  -- fail-closed branch, which is exactly this refusal).
  if not exists (select 1 from clara.fa_depreciation_authorities a
                  where a.client_id = p_client and a.status = 'live') then
    v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B9',
      'token', 'depreciation_authority_absent'));
  end if;
  if p_through is null or p_through > clara._book_today() then
    v_rungs := v_rungs || jsonb_build_array(jsonb_build_object('rung', 'B2',
      'token', 'receipt_incomplete', 'class', 'through_date_beyond_book_today'));
  end if;
  if jsonb_array_length(v_rungs) > 0 then
    v_receipt := clara._agent_close_receipt(v_firm, p_client, 'depreciation_catchup', 'client', p_client,
      p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
      p_rationale, p_model, 'refused', v_rungs, p_op_key);
    return jsonb_build_object('status', 'refused', 'receipt_id', v_receipt, 'rung_vector', v_rungs);
  end if;
  -- THE PERIODS ARE THE ORACLE'S OWN ARITHMETIC, never this body's: it asks depreciation_run_due
  -- for the oldest unmet period and runs exactly that one, then asks again. The runtime must not
  -- compute a period, and neither may the agent limb (F11's law, applied to ourselves).
  -- The finite guard is the belt's own posture, not a magic number: at most twelve periods clear
  -- per wake, so a mis-answering oracle cannot spin this loop forever.
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 12;
    v_due := clara._depreciation_run_due_core(p_client, v_firm);
    exit when v_due is null or jsonb_typeof(v_due) <> 'object'
      or not coalesce((v_due ->> 'due')::boolean, false)
      or (v_due ->> 'period_end') is null
      or (v_due ->> 'period_end')::date > p_through;
    v_result := clara._fa_run_period_core(p_client, (v_due ->> 'period_start')::date,
      (v_due ->> 'period_end')::date,
      p_op_key || ':' || (v_due ->> 'period_end'), null, v_firm, 'run_depreciation_period');
    v_ran := v_ran || jsonb_build_array(jsonb_build_object(
      'period_start', v_due ->> 'period_start', 'period_end', v_due ->> 'period_end',
      'result', v_result));
  end loop;
  v_receipt := clara._agent_close_receipt(v_firm, p_client, 'depreciation_catchup', 'client', p_client,
    p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key);
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt,
    'result', jsonb_build_object('through', p_through, 'periods_run', v_ran,
      'still_due', clara._depreciation_run_due_core(p_client, v_firm)));
end $$;
revoke all on function clara._agent_depreciation_catchup_core(jsonb, uuid, date, text, jsonb, text) from public;

create function clara.wake_run_depreciation_catchup(p_client uuid, p_through date, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_run_depreciation_catchup', 'client', p_client, p_op_key);
  return clara._agent_depreciation_catchup_core(v_ctx, p_client, p_through, p_rationale, p_model, p_op_key);
end $$;
revoke all on function clara.wake_run_depreciation_catchup(uuid, date, text, jsonb, text) from public;

-- -------------------------------------------------------------------------------------------------
-- H.7 · wrapper 13 · wake_mint_month_snapshot (TA-P1 C's snapshot mint, D-21).
--
-- A DETERMINISTIC CAPTURE, not a judgement: it hashes _snapshot_dataset and records it, computing
-- nothing. Its walls are therefore §3.1's entrance seam plus B1/B2 alone — there is no B-rung to
-- invent for an act that decides nothing.
--
-- LOCK NOTE (Annex A.2), stated so a builder does not "helpfully" fold this into the begin-close
-- core and invent a 007 -> 004 path: _mint_month_snapshot_core takes 203005007-EXCLUSIVE as its own
-- serializer (0057:61), which is the BOTTOM of the close order. This wrapper is called as its OWN
-- act, never nested inside a close verb's transaction.
--
-- (Numbered 13 after the design's own table; wrapper 12 is parked — see the header.)
-- -------------------------------------------------------------------------------------------------
create function clara._agent_mint_month_snapshot_core(p_ctx jsonb, p_client uuid, p_month_start date,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid := (p_ctx ->> 'firm_id')::uuid;
  v_rungs jsonb; v_receipt uuid; v_result jsonb;
begin
  v_rungs := clara._close_tier_b_common(p_client, p_rationale, p_model);
  if jsonb_array_length(v_rungs) > 0 then
    v_receipt := clara._agent_close_receipt(v_firm, p_client, 'mint_snapshot', 'client', p_client,
      p_ctx ->> 'wake_kind', nullif(p_ctx ->> 'on_behalf_of', '')::uuid, (p_ctx ->> 'task_id')::uuid,
      p_rationale, p_model, 'refused', v_rungs, p_op_key);
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
    p_rationale, p_model, 'acted', '[]'::jsonb, p_op_key);
  return jsonb_build_object('status', 'acted', 'receipt_id', v_receipt, 'result', v_result);
end $$;
revoke all on function clara._agent_mint_month_snapshot_core(jsonb, uuid, date, text, jsonb, text) from public;

create function clara.wake_mint_month_snapshot(p_client uuid, p_month_start date, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_ctx jsonb;
begin
  v_ctx := clara._close_wake_ctx('wake_mint_month_snapshot', 'client', p_client, p_op_key);
  return clara._agent_mint_month_snapshot_core(v_ctx, p_client, p_month_start, p_rationale,
    p_model, p_op_key);
end $$;
revoke all on function clara.wake_mint_month_snapshot(uuid, date, text, jsonb, text) from public;

-- =================================================================================================
-- §I.2 · THE THREE NEW EVENT TYPES, on the register that VALIDATES them.
--
-- clara._append_event refuses an unregistered name outright ("unknown event_type"), so the DB half
-- of design §3.3's "a new event type on both registers" has to land in the migration that ships the
-- emitters. Caught by this file's own battery, not by reading: wake_propose_close's SUCCESS path
-- was the first thing in the estate to emit close.proposed, and every earlier cell only ever
-- reached a refusal, which emits nothing (the F-A3 §DDL-4 lesson, reproduced here).
--
-- `close.preparation_started` is registered AHEAD of its emitter, deliberately and by precedent
-- (0133's own bank_agent registry row does the same): design §3.3 gives it to the leader belt,
-- which is PR-2's, and PR-2 is a RUNTIME PR with no migration of its own to carry the row. An
-- unregistered name would make the belt's very first notice raise. It is inert until something
-- emits it.
--
-- `close.proposal_settled` arrived with clara.settle_close_proposal (the review card's terminal
-- door) and is emitted by it — the terminal half of close.proposed, and a DIFFERENT fact, so it
-- carries its own name rather than a second payload shape on the first.
-- =================================================================================================
with inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
    values
      ('close.proposed', true, 'clara.wake_propose_close recorded a durable close proposal (design §3.7) — the drafted attestations and the gate digest vector they bind'),
      ('close.preparation_started', true, 'the close-prep clock woke on a fiscal year whose end has passed (design §3.3) — the notice card''s own event; emitted by the leader belt (PR-2), registered here because clara._append_event validates the name'),
      ('close.proposal_settled', true, 'a reviewer adopted or declined a close proposal through clara.settle_close_proposal (Annex I.1''s review card) — the terminal half of close.proposed, and a DIFFERENT fact from it, so it gets its own name rather than a second payload shape on the first')
    on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, i.name, 'ignore', null from inserted_types i cross join clara.taxonomy_active a;

-- =================================================================================================
-- §J · THE ALLOWLIST ROWS AND THE EXECUTE GRANTS.
--
-- THE ALLOWLIST IS THE KIND GATE; THE GRANT IS THE ROLE GATE. They are two different walls and both
-- are needed: a chat-lane `interactive` credential holding EXECUTE on wake_begin_close still fails
-- clara.assert_wake_allowed('interactive','wake_begin_close') because no such row exists — only
-- `close_prep` rows are added here, and NO EXISTING ROW MOVES (extend-only, Annex C).
--
-- TWELVE ROWS, one per built wrapper. The design's thirteenth (wake_establish_prepayment_schedule)
-- is parked; it gets no row, because an allowlist row for a function that does not exist is a
-- permission naming nothing.
-- =================================================================================================
insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('close_prep', 'wake_list_fiscal_years'),
  ('close_prep', 'wake_get_close_plan'),
  ('close_prep', 'wake_get_close_readiness'),
  ('close_prep', 'wake_verify_close'),
  ('close_prep', 'wake_snapshot_state'),
  ('close_prep', 'wake_dry_run_close_readiness'),
  ('close_prep', 'wake_open_fiscal_year'),
  ('close_prep', 'wake_begin_close'),
  ('close_prep', 'wake_abandon_close'),
  ('close_prep', 'wake_propose_close'),
  ('close_prep', 'wake_run_depreciation_catchup'),
  ('close_prep', 'wake_mint_month_snapshot');

-- The wake role is clara_wake_interactive (Annex E.1's own grant column), reached by
-- clara_wake_write_login (pools.mjs:58, :373) — the pool a close_prep session runs on. F-A3 minted
-- its own clara_wake_bank because its design ruled a separate least-privilege role; F-A4's does
-- not, and inventing one here would be a second architecture for one lane's convenience.
grant execute on function clara.wake_list_fiscal_years(uuid, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_get_close_plan(uuid, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_get_close_readiness(uuid, uuid, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_verify_close(uuid, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_snapshot_state(uuid, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_dry_run_close_readiness(uuid, uuid, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_open_fiscal_year(uuid, text, date, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_begin_close(uuid, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_abandon_close(uuid, text, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_propose_close(uuid, jsonb, text, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_run_depreciation_catchup(uuid, date, text, jsonb, text) to clara_wake_interactive;
grant execute on function clara.wake_mint_month_snapshot(uuid, date, text, jsonb, text) to clara_wake_interactive;

-- The oracle is clara_runtime's and NOBODY else's (Annex B.1: "the wake roles never ask" — she
-- learns a year is due by being woken, never by asking).
grant execute on function clara.close_prep_due() to clara_runtime;
-- The sibling minter mirrors mint_wake_credential's own grant (0011:1196-1197). clara._wake_task_id()
-- stays UNGRANTED, deliberately: it is read from inside the definer chain, never by a caller.
grant execute on function clara.mint_wake_credential_for_task(text, uuid, uuid, uuid, interval) to clara_runtime;

-- The three human doors (Annex I.1 rows 5-6). clara_authenticated only — the agent identity and
-- both wake roles gain ZERO: a brake the agent lane can flip on itself is not a brake.
grant execute on function clara.hold_close_prep(uuid, text, text) to clara_authenticated;
grant execute on function clara.release_close_prep(uuid, text, text) to clara_authenticated;
grant execute on function clara.list_agent_act_receipts(uuid, timestamptz) to clara_authenticated;
-- The review card's terminal door. clara_authenticated ONLY, floor body-enforced -- and the wake
-- roles gain ZERO for the same reason the HOLD verbs do: the lane may propose, never settle its
-- own proposal.
grant execute on function clara.settle_close_proposal(uuid, text, text, text) to clara_authenticated;

reset role;

-- =================================================================================================
-- §TAIL · THE CENSUS. This is the evidence a reviewer reads — a migration whose tail only says
-- "OK" has proven nothing.
-- =================================================================================================
do $tail$
declare
  v_n int; v_m int; v_sig text; v_src text; v_def text; v_missing text[] := '{}';
  v_extra text[] := '{}'; v_role text;
  k_wrappers text[] := array[
    'clara.wake_list_fiscal_years(uuid,text,jsonb,text)',
    'clara.wake_get_close_plan(uuid,text,jsonb,text)',
    'clara.wake_get_close_readiness(uuid,uuid,text,jsonb,text)',
    'clara.wake_verify_close(uuid,text,jsonb,text)',
    'clara.wake_snapshot_state(uuid,text,jsonb,text)',
    'clara.wake_dry_run_close_readiness(uuid,uuid,text,jsonb,text)',
    'clara.wake_open_fiscal_year(uuid,text,date,text,jsonb,text)',
    'clara.wake_begin_close(uuid,text,jsonb,text)',
    'clara.wake_abandon_close(uuid,text,text,jsonb,text)',
    'clara.wake_propose_close(uuid,jsonb,text,text,jsonb,text)',
    'clara.wake_run_depreciation_catchup(uuid,date,text,jsonb,text)',
    'clara.wake_mint_month_snapshot(uuid,date,text,jsonb,text)'];
  k_names text[] := array[
    'wake_list_fiscal_years','wake_get_close_plan','wake_get_close_readiness','wake_verify_close',
    'wake_snapshot_state','wake_dry_run_close_readiness','wake_open_fiscal_year','wake_begin_close',
    'wake_abandon_close','wake_propose_close','wake_run_depreciation_catchup','wake_mint_month_snapshot'];
  k_ungranted text[] := array[
    'clara._wake_task_id()',
    'clara._close_subject_client(text,uuid)',
    'clara._close_expected_op_key(uuid,text,uuid)',
    'clara._close_wake_ctx(text,text,uuid,text)',
    'clara._close_prep_hold_active(uuid,text)',
    'clara._close_tier_b_common(uuid,text,jsonb)',
    'clara._close_drawer1_unclean(uuid,uuid)',
    'clara._close_belt_period_unrun(uuid,uuid,date)',
    'clara._close_reopen_correction_in_flight(uuid,uuid,text)',
    'clara._agent_close_receipt(uuid,uuid,text,text,uuid,text,uuid,uuid,text,jsonb,text,jsonb,text)',
    'clara._close_read_gate(jsonb,text,text,uuid,text,jsonb,text)',
    'clara._agent_close_read_core(jsonb,text,text,uuid,jsonb,text,jsonb,text)',
    'clara._agent_open_fiscal_year_core(jsonb,uuid,text,date,text,jsonb,text)',
    'clara._agent_begin_close_core(jsonb,uuid,text,jsonb,text)',
    'clara._agent_abandon_close_core(jsonb,uuid,text,text,jsonb,text)',
    'clara._agent_close_proposal_core(jsonb,uuid,jsonb,text,text,jsonb,text)',
    'clara._agent_depreciation_catchup_core(jsonb,uuid,date,text,jsonb,text)',
    'clara._agent_mint_month_snapshot_core(jsonb,uuid,date,text,jsonb,text)',
    'clara._list_fiscal_years_core(uuid,uuid)',
    'clara._close_readiness_core(uuid,uuid,uuid)',
    'clara._verify_close_core(uuid,uuid)',
    'clara._adjustment_run_due_core(uuid,uuid)',
    'clara._depreciation_run_due_core(uuid,uuid)',
    'clara._tf_close_proposals_settle_only()',
    'clara._tf_close_prep_holds_release_only()',
    'clara._tf_assert_close_agent_receipt()'];
begin
  if current_user <> (select v from _fa4_pr1c_pre where k = 'session_user')
     or current_role <> (select v from _fa4_pr1c_pre where k = 'current_role') then
    raise exception 'F-A4 PR-1c tail: role not reset (user %, role %)', current_user, current_role
      using errcode = 'CLR10';
  end if;

  -- T.1 · THE THREE TABLES: present, FORCE RLS, exactly the owner/read policy pair, and ZERO DML
  -- grant to any non-owner role (the close_write_permits posture — SELECT is the only privilege
  -- clara_authenticated holds on any of the three).
  foreach v_sig in array array['agent_act_receipts', 'close_proposals', 'close_prep_holds'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'clara' and c.relname = v_sig
                      and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'F-A4 PR-1c tail: clara.% is not FORCE RLS', v_sig using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = v_sig;
    if v_n <> 2 then
      raise exception 'F-A4 PR-1c tail: clara.% carries % policies, expected exactly 2 (owner + human read)', v_sig, v_n
        using errcode = 'CLR10';
    end if;
    select count(*)::int into v_n from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = v_sig
        and grantee <> 'clara_fn_owner' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
    if v_n <> 0 then
      raise exception 'F-A4 PR-1c tail: clara.% leaks % DML grant(s) to a non-owner role', v_sig, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.1b · close_proposals' partial unique index IS the "one live proposal per run" law, read from
  -- pg_index rather than inferred from the rung that depends on it.
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'uq_close_proposal_live' and i.indisunique
                    and pg_get_expr(i.indpred, i.indrelid) is not null) then
    raise exception 'F-A4 PR-1c tail: uq_close_proposal_live is absent or not a PARTIAL unique index'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'uq_hold_active' and i.indisunique
                    and pg_get_expr(i.indpred, i.indrelid) is not null) then
    raise exception 'F-A4 PR-1c tail: uq_hold_active is absent or not a PARTIAL unique index'
      using errcode = 'CLR10';
  end if;

  -- T.1b2 · THE PROPOSAL LIFECYCLE HAS NO STUCK STATE (conductor ruling). Three independent reads,
  -- because "the door exists" is not the claim -- "every value the CHECK admits has a writer" is.
  --   (i) the state domain is exactly the four Annex E.4 names;
  --  (ii) the settle-only trigger is installed (the structural backstop under the door);
  -- (iii) the HUMAN door names ONLY adopted/withdrawn as admissible, read positionally off its own
  --       prosrc -- so it can never reach `superseded` (the LANE's stamp, written by
  --       _agent_close_proposal_core) nor write `open` back over a settled row.
  -- SELECTED BY conname, NOT BY ITS OWN TEXT (N6). Matching on `like '%state = ANY%'` asks the
  -- constraint to describe itself and then trusts the description — so a future constraint that
  -- happened to render that way would be read instead, and this census would be measuring
  -- something it never meant to. The domain CHECK has a stable name; pin that, and fail loudly if
  -- it is gone rather than silently reading a neighbour.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conrelid = 'clara.close_proposals'::regclass and c.contype = 'c'
      and c.conname = 'close_proposals_state_check';
  if v_def is null then
    raise exception 'F-A4 PR-1c tail: close_proposals_state_check is absent' using errcode = 'CLR10';
  end if;
  foreach v_sig in array array['open', 'adopted', 'withdrawn', 'superseded'] loop
    if position('''' || v_sig || '''' in v_def) = 0 then
      raise exception 'F-A4 PR-1c tail: close_proposals.state does not admit %', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'close_proposals'
        and t.tgname = 't_close_proposals_settle_only' and not t.tgisinternal) then
    raise exception 'F-A4 PR-1c tail: t_close_proposals_settle_only is absent' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.settle_close_proposal(uuid,text,text,text)'::regprocedure;
  if position('p_state not in (''adopted'', ''withdrawn'')' in v_src) = 0 then
    raise exception 'F-A4 PR-1c tail: settle_close_proposal''s admissible-state gate is not the closed adopted/withdrawn pair'
      using errcode = 'CLR10';
  end if;
  if v_src ~ '''superseded''' then
    raise exception 'F-A4 PR-1c tail: the HUMAN settle door names ''superseded'' -- that stamp is the lane''s own'
      using errcode = 'CLR10';
  end if;
  -- It mirrors attest_close_exception's floor, read from BOTH bodies rather than asserted of one.
  if position('clara._has_capability(c.firm, c.actor, ''close_and_attest'')' in v_src) = 0
     or position('clara._human_ctx(clara.role_rank(''bookkeeper''))' in v_src) = 0 then
    raise exception 'F-A4 PR-1c tail: settle_close_proposal does not carry attest_close_exception''s own floor'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara.attest_close_exception(uuid,text,text,text,text,uuid)'::regprocedure;
  if position('clara._has_capability(c.firm, c.actor, ''close_and_attest'')' in v_src) = 0 then
    raise exception 'F-A4 PR-1c tail: attest_close_exception''s floor is not what the settle door was mirrored from'
      using errcode = 'CLR10';
  end if;

  -- T.1c · THE CARRIER SATISFIES THE SHIPPED CONSUMER. attest_close_exception's p_from_proposal arm
  -- (0120:1010-1041) reads five things off this table; each is proven to EXIST here by column, not
  -- by reading the arm's text a second time.
  foreach v_sig in array array['id', 'state', 'close_run_id', 'drafted', 'bound_digests'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'clara' and table_name = 'close_proposals' and column_name = v_sig) then
      raise exception 'F-A4 PR-1c tail: close_proposals.% is absent — attest_close_exception''s adoption arm cannot run', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.2 · TIER C: the deferred wall is installed on close_runs, DEFERRABLE INITIALLY DEFERRED.
  select count(*)::int into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname = 'close_runs'
      and t.tgname = 't_close_run_agent_receipt' and t.tgdeferrable and t.tginitdeferred;
  if v_n <> 1 then
    raise exception 'F-A4 PR-1c tail: t_close_run_agent_receipt is absent or not DEFERRABLE INITIALLY DEFERRED'
      using errcode = 'CLR10';
  end if;

  -- T.3 · THE TWELVE WRAPPERS: each resolves at its EXACT signature, is SECURITY DEFINER with a
  -- pinned search_path, owned by clara_fn_owner, holds EXECUTE for clara_wake_interactive and for
  -- NO other app role, and PUBLIC executes none of them.
  foreach v_sig in array k_wrappers loop
    if to_regprocedure(v_sig) is null then
      v_missing := v_missing || v_sig; continue;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = v_sig::regprocedure
                    and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                    and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
      raise exception 'F-A4 PR-1c tail: % is not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner', v_sig
        using errcode = 'CLR10';
    end if;
    if exists (select 1 from pg_proc f
                cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                where f.oid = v_sig::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'F-A4 PR-1c tail: PUBLIC executes %', v_sig using errcode = 'CLR10';
    end if;
    if not exists (select 1 from pg_proc f
                    cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                    where f.oid = v_sig::regprocedure
                      and a.grantee = 'clara_wake_interactive'::regrole and a.privilege_type = 'EXECUTE') then
      raise exception 'F-A4 PR-1c tail: clara_wake_interactive does not hold EXECUTE on %', v_sig
        using errcode = 'CLR10';
    end if;
    -- THE INVERTED TWIN (Annex C's roster row): zero EXECUTE for the agent read role, the runtime
    -- and the proactive wake role. A wrapper reachable from those is a lane nobody designed.
    foreach v_role in array array['clara_agent_ro', 'clara_runtime', 'clara_wake_proactive'] loop
      if exists (select 1 from pg_proc f
                  cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                  where f.oid = v_sig::regprocedure
                    and a.grantee = v_role::regrole and a.privilege_type = 'EXECUTE') then
        raise exception 'F-A4 PR-1c tail: % is executable by %, which no design admits', v_sig, v_role
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception 'F-A4 PR-1c tail: wrapper(s) missing at their pinned signature: %', array_to_string(v_missing, ', ')
      using errcode = 'CLR10';
  end if;

  -- T.3b · SPELLING IS NOT IDENTITY (law 3), applied to the ONE string a wrapper hands the shared
  -- Tier-A body: each wrapper's prosrc must name ITS OWN function name in its _close_wake_ctx call,
  -- read positionally. A copy-paste that left a sibling's name there would allowlist-check the
  -- wrong verb and be invisible to every behavioural cell that only ever calls the right one.
  for v_n in 1 .. array_length(k_wrappers, 1) loop
    select p.prosrc into v_src from pg_proc p where p.oid = k_wrappers[v_n]::regprocedure;
    if position('clara._close_wake_ctx(''' || k_names[v_n] || '''' in v_src) = 0 then
      raise exception 'F-A4 PR-1c tail: wrapper % does not name itself in its _close_wake_ctx call', k_wrappers[v_n]
        using errcode = 'CLR10';
    end if;
    -- NO DML TEXT IN A WRAPPER BODY (0077:22-29): a granted body carrying DML against a censused
    -- table breaks that census by construction. Measured on the wrapper's own source.
    if v_src ~* '\m(insert|update|delete|truncate)\s+(into\s+)?clara\.' then
      raise exception 'F-A4 PR-1c tail: wrapper % carries DML text in its body', k_wrappers[v_n]
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.4 · THE UNGRANTED INTERNALS: every core, helper and trigger function this file created is
  -- app-callable by NO role. Read as a closed set, so a stray grant is a finding rather than a
  -- shrug.
  foreach v_sig in array k_ungranted loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A4 PR-1c tail: internal % does not resolve at its pinned signature', v_sig
        using errcode = 'CLR10';
    end if;
    if exists (select 1 from pg_proc f
                cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
                where f.oid = v_sig::regprocedure and a.privilege_type = 'EXECUTE'
                  and a.grantee <> 'clara_fn_owner'::regrole) then
      raise exception 'F-A4 PR-1c tail: internal % holds an EXECUTE grant it should not', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.5 · THE ALLOWLIST: exactly TWELVE close_prep rows, one per wrapper, no more and no fewer —
  -- and EVERY OTHER KIND'S ROW COUNT IS UNMOVED. The extend-only half is now an ACTUAL DIFFERENCE
  -- (N1): the first cut said "proven by a difference" and then computed a total, which proves
  -- nothing about the other kinds. This measures the non-close_prep population against the count
  -- captured at prestate, so a row added to or removed from ANY other kind by this file fails here.
  select count(*)::int into v_n from clara.wake_fn_allowlist where wake_kind = 'close_prep';
  if v_n <> 12 then
    raise exception 'F-A4 PR-1c tail: wake_fn_allowlist carries % close_prep rows, expected 12', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_m from clara.wake_fn_allowlist where wake_kind <> 'close_prep';
  if v_m <> (select v::int from _fa4_pr1c_pre where k = 'allowlist_other_kinds') then
    raise exception 'F-A4 PR-1c tail: the OTHER wake kinds moved from % to % allowlist row(s) — this file extends, it does not touch them',
      (select v from _fa4_pr1c_pre where k = 'allowlist_other_kinds'), v_m using errcode = 'CLR10';
  end if;
  select array_agg(function_name order by function_name) into v_extra
    from clara.wake_fn_allowlist where wake_kind = 'close_prep'
      and function_name <> all (k_names);
  if array_length(v_extra, 1) is not null then
    raise exception 'F-A4 PR-1c tail: unexpected close_prep allowlist row(s): %', array_to_string(v_extra, ', ')
      using errcode = 'CLR10';
  end if;
  -- Every allowlisted name resolves at the wrapper's EXACT SIGNATURE (N/LOW-10, law 3): a bare
  -- proname match is satisfied by any overload, so a row naming a verb whose real signature had
  -- drifted would still read green. k_wrappers carries the pinned regprocedures.
  for v_n in 1 .. array_length(k_names, 1) loop
    if not exists (select 1 from clara.wake_fn_allowlist w
                    where w.wake_kind = 'close_prep' and w.function_name = k_names[v_n]) then
      raise exception 'F-A4 PR-1c tail: no close_prep allowlist row for %', k_names[v_n] using errcode = 'CLR10';
    end if;
    if to_regprocedure(k_wrappers[v_n]) is null then
      raise exception 'F-A4 PR-1c tail: allowlisted % does not resolve at its pinned signature %', k_names[v_n], k_wrappers[v_n]
        using errcode = 'CLR10';
    end if;
  end loop;

  -- T.6 · THE THREE EXTRACTED READS + THE ADJ ORACLE: each public verb is now a THIN delegate that
  -- still opens its own floor, and each core is the body that moved. Proven POSITIONALLY, not by a
  -- bare substring hit, and the human floors are re-read from the live bodies.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.list_fiscal_years(uuid)'::regprocedure;
  if position('clara._human_ctx(clara.role_rank(''viewer''))' in v_src) = 0
     or position('return clara._list_fiscal_years_core(c.firm, p_client);' in v_src) = 0 then
    raise exception 'F-A4 PR-1c tail: list_fiscal_years is not the thin viewer-floor delegate' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.get_close_readiness(uuid,uuid)'::regprocedure;
  if position('clara._human_ctx(clara.role_rank(''viewer''))' in v_src) = 0
     or position('return clara._close_readiness_core(c.firm, p_client, p_fy);' in v_src) = 0 then
    raise exception 'F-A4 PR-1c tail: get_close_readiness is not the thin viewer-floor delegate' using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.verify_close(uuid)'::regprocedure;
  if position('clara._human_ctx(clara.role_rank(''viewer''))' in v_src) = 0
     or position('return clara._verify_close_core(c.firm, p_receipt);' in v_src) = 0 then
    raise exception 'F-A4 PR-1c tail: verify_close is not the thin viewer-floor delegate' using errcode = 'CLR10';
  end if;
  -- THE ADMISSION IS UNMOVED FOR EVERY EXISTING CALLER (D-26's whole claim, and cell C-19's
  -- positive control): adjustment_run_due still calls _assert_due_read_ctx, and it still calls it
  -- BEFORE the delegate.
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.adjustment_run_due(uuid)'::regprocedure;
  if position('perform clara._assert_due_read_ctx(v_firm);' in v_src) = 0
     or position('perform clara._assert_due_read_ctx(v_firm);' in v_src)
        > position('return clara._adjustment_run_due_core(p_client, v_firm);' in v_src) then
    raise exception 'F-A4 PR-1c tail: adjustment_run_due no longer asserts its read context BEFORE delegating'
      using errcode = 'CLR10';
  end if;
  -- THE SAME, on the FA sibling (§E.2's measured correction).
  select p.prosrc into v_src from pg_proc p where p.oid = 'clara.depreciation_run_due(uuid)'::regprocedure;
  if position('perform clara._assert_due_read_ctx(v_firm);' in v_src) = 0
     or position('perform clara._assert_due_read_ctx(v_firm);' in v_src)
        > position('return clara._depreciation_run_due_core(p_client, v_firm);' in v_src) then
    raise exception 'F-A4 PR-1c tail: depreciation_run_due no longer asserts its read context BEFORE delegating'
      using errcode = 'CLR10';
  end if;
  -- x42.d8's CLOSED CENSUS IS UNMOVED: exactly TWO bodies in clara consult the shared admission
  -- predicate, and they are the two live oracles. The extracted cores are deliberately NOT members
  -- (they carry no admission at all), so the family that "cannot drift apart" still cannot.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.prokind = 'f'
      and p.prosrc like '%clara._assert_due_read_ctx(%';
  if v_n <> 2 then
    raise exception 'F-A4 PR-1c tail: % bodies consult _assert_due_read_ctx, expected exactly 2 (x42.d8''s closed census)', v_n
      using errcode = 'CLR10';
  end if;
  -- The FOUR GRANTS are byte-unmoved across BOTH CoRs (the extractions change no answer, no grant,
  -- no admission).
  select count(*)::int into v_n from pg_proc f
    cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
    where f.oid in ('clara.adjustment_run_due(uuid)'::regprocedure,
                    'clara.depreciation_run_due(uuid)'::regprocedure)
      and a.privilege_type = 'EXECUTE'
      and a.grantee in ('clara_authenticated'::regrole, 'clara_runtime'::regrole);
  if v_n <> 4 then
    raise exception 'F-A4 PR-1c tail: the two due oracles'' clara_authenticated/clara_runtime EXECUTE grants did not survive the CoRs (found %, expected 4)', v_n
      using errcode = 'CLR10';
  end if;

  -- T.7 · THE BODIES THIS FILE PROMISED NOT TO TOUCH, re-read and compared to their prestate shas.
  -- wake_context() and mint_wake_credential's five-arg body are D-13's whole point;
  -- _close_gate_uncoded is D-18's.
  foreach v_sig in array array['clara.mint_wake_credential(text,uuid,uuid,interval,uuid)',
                               'clara.wake_context()',
                               'clara._close_gate_uncoded(uuid,uuid)'] loop
    if encode(sha256(convert_to((select p.prosrc from pg_proc p where p.oid = v_sig::regprocedure), 'UTF8')), 'hex')
       is distinct from (select v from _fa4_pr1c_pre where k = 'prosrc_sha:' || v_sig) then
      raise exception 'F-A4 PR-1c tail: % moved, and this file promised it would not', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;
  -- wake_context() still returns FIVE columns (census C14): the task id arrives via the sibling,
  -- never by widening the widest-reach body in the wake estate.
  select count(*)::int into v_n from pg_proc p, unnest(p.proargmodes) m
    where p.oid = 'clara.wake_context()'::regprocedure and m = 't';
  if v_n <> 5 then
    raise exception 'F-A4 PR-1c tail: wake_context() returns % table columns, expected 5', v_n
      using errcode = 'CLR10';
  end if;

  -- T.8 · G1's close_prep source is STILL registered-and-DISABLED. The flip belongs to the PR that
  -- ships the closePrep.v1 workflow body; enabling a source with nothing to execute it would be a
  -- claimable queue and no claimant.
  if not exists (select 1 from clara.wake_engine_sources where source_key = 'close_prep' and enabled = false) then
    raise exception 'F-A4 PR-1c tail: the close_prep wake_engine_sources row is no longer registered-and-disabled'
      using errcode = 'CLR10';
  end if;

  -- T.9 · THE PARKED THIRTEENTH IS ABSENT, read positively rather than assumed from the fact that
  -- this file never created it (the F-A1 pre-rename-name precedent). If a later branch lands it,
  -- this cell is where the count re-derivation starts.
  if to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,jsonb,text)') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'clara' and p.proname = 'prepayment_schedule_v1') then
    raise exception 'F-A4 PR-1c tail: the PARKED prepayment half is present — the twelve/thirteen census is stale'
      using errcode = 'CLR10';
  end if;

  -- T.9b · The three new event types are REGISTERED, and each carries a trigger_taxonomy
  -- disposition at the ACTIVE version (an unregistered name makes _append_event raise; an
  -- untriaged one makes the taxonomy census incomplete).
  select count(*)::int into v_n from clara.event_types
    where name in ('close.proposed', 'close.preparation_started', 'close.proposal_settled');
  if v_n <> 3 then
    raise exception 'F-A4 PR-1c tail: % of the 3 new event types are registered', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy tt
    join clara.taxonomy_active a on a.version = tt.version
    where tt.event_type in ('close.proposed', 'close.preparation_started', 'close.proposal_settled');
  if v_n <> 3 then
    raise exception 'F-A4 PR-1c tail: % of the 3 new event types carry an active taxonomy disposition', v_n
      using errcode = 'CLR10';
  end if;

  -- T.9c · THE FOUR HUMAN DOORS: clara_authenticated and NOTHING else. Read as a closed set over
  -- all four, so a stray wake/agent/runtime grant on any of them is a finding -- the brake and the
  -- settle door in particular, which the lane must never be able to work on itself.
  foreach v_sig in array array['clara.hold_close_prep(uuid,text,text)',
                               'clara.release_close_prep(uuid,text,text)',
                               'clara.list_agent_act_receipts(uuid,timestamptz)',
                               'clara.settle_close_proposal(uuid,text,text,text)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A4 PR-1c tail: human door % does not resolve', v_sig using errcode = 'CLR10';
    end if;
    select array_agg(a.grantee::regrole::text order by 1) into v_extra from pg_proc f
      cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
      where f.oid = v_sig::regprocedure and a.privilege_type = 'EXECUTE'
        and a.grantee <> 'clara_fn_owner'::regrole;
    if v_extra is distinct from array['clara_authenticated'] then
      raise exception 'F-A4 PR-1c tail: % is executable by %, expected clara_authenticated alone',
        v_sig, coalesce(array_to_string(v_extra, ', '), '(nobody)') using errcode = 'CLR10';
    end if;
  end loop;

  -- T.10 · The gate catalog is still FOURTEEN rows and this file added none (census C15 unmoved).
  select count(*)::int into v_n from clara.close_gate_checks;
  if v_n <> 14 then
    raise exception 'F-A4 PR-1c tail: close_gate_checks moved to % rows', v_n using errcode = 'CLR10';
  end if;

  -- T.11 · The frozen schemas (hard constraint 15) — ASSERTED HONESTLY (N5). The first cut printed
  -- the relation count with "(0 expected)", which is true on a rig built from migrations alone and
  -- FALSE on live, where the Slice-0 spike's parked run lives in exactly those schemas: a census
  -- that reads green only because the fixture is empty is the vacuous-green class. What this file
  -- can actually claim is that it created nothing outside `clara`, so that is what is measured —
  -- every object it mints is checked for its namespace, and the frozen-schema population is
  -- REPORTED rather than asserted at zero.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('workflow', 'graphile_worker', 'spike');
  foreach v_sig in array array['agent_act_receipts', 'close_proposals', 'close_prep_holds'] loop
    if (select n.nspname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.oid = to_regclass('clara.' || v_sig)) is distinct from 'clara' then
      raise exception 'F-A4 PR-1c tail: % was created outside schema clara', v_sig using errcode = 'CLR10';
    end if;
  end loop;
  select count(*)::int into v_m from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('workflow', 'graphile_worker', 'spike')
      and (p.proname like 'wake!_%' escape '!' or p.proname like '!_close%' escape '!'
           or p.proname like '!_agent!_close%' escape '!');
  if v_m <> 0 then
    raise exception 'F-A4 PR-1c tail: % close-limb function(s) landed in a frozen schema', v_m using errcode = 'CLR10';
  end if;

  raise notice 'F-A4 PR-1c tail: OK — 3 new tables (agent_act_receipts / close_proposals / close_prep_holds), each FORCE RLS with exactly the owner+human-read policy pair and ZERO DML grant to any non-owner role; close_proposals carries the five columns attest_close_exception''s shipped p_from_proposal arm reads, plus its partial one-live-proposal index; the deferred Tier-C wall t_close_run_agent_receipt is installed on close_runs (DEFERRABLE INITIALLY DEFERRED). The proposal lifecycle has NO STUCK STATE: the state domain is exactly the four Annex E.4 names, the settle-only trigger is installed, and clara.settle_close_proposal (bookkeeper + close_and_attest, mirrored from attest_close_exception''s own floor and proven against BOTH bodies) admits adopted/withdrawn and never names ''superseded''. The four human doors are executable by clara_authenticated ALONE. TWELVE wake wrappers resolve at their exact signatures, all SECURITY DEFINER / search_path-pinned / clara_fn_owner-owned, each naming ITSELF in its _close_wake_ctx call, none carrying DML text, all holding EXECUTE for clara_wake_interactive and ZERO for clara_agent_ro / clara_runtime / clara_wake_proactive, PUBLIC on none. % internals resolve and are app-callable by no role. wake_fn_allowlist gained exactly 12 close_prep rows, every one naming a live function, and no existing row moved. list_fiscal_years / get_close_readiness / verify_close are thin viewer-floor delegates over their new cores; BOTH due oracles still assert _assert_due_read_ctx BEFORE delegating to their additive ungranted cores, exactly TWO bodies in clara consult that predicate (x42.d8''s closed census, unmoved), and all four EXECUTE grants survived. mint_wake_credential, wake_context (still 5 columns) and _close_gate_uncoded are byte-identical to their prestate shas. The close_prep wake_engine_sources row is still registered-and-DISABLED (the flip is PR-2''s). The PARKED thirteenth verb and its evaluator are provably absent. close_gate_checks is still 14 rows. % relation(s) in workflow/graphile_worker/spike (0 expected, untouched by this file).',
    array_length(k_ungranted, 1), v_n;
end $tail$;
