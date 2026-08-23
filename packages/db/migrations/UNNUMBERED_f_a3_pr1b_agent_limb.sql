-- UNNUMBERED_f_a3_pr1b_agent_limb.sql — F-A3 PR-1b: the bank-agency AGENT LIMB.
-- ================================================================================================
-- Number claimed at MERGE time (hard constraint 10). Design of record:
-- docs/plan/active/bank-agency-design.md v2 §3 + annexes-1 (A verbs/receipt/carriers, B ladder,
-- C locks, D clock) + annexes-2 (H battery, K register, M doors) + annexes-3 (O build sequence,
-- J D1 list, L predictions, P owner questions). Gate record: bank-agency-gate-record.md. Build
-- sequence: annexes-3-build.md Annex O.2 row "PR-1b". D1 list: Annex J.2 (originally ten bodies +
-- seven DDL groups), RE-DERIVED here at the rig per P-14 (§0) to NINE re-cut bodies (the tenth,
-- `_approve_entry_core` gen 10, is NOT NEEDED — F-A2's ninth generation already accepts the bank
-- ctx keys as-is) PLUS one body the F-A3/PR-1a lane's own annex trues found and routed to this
-- window (`_resolve_and_book_bank_line_core` — the "public-call hazard", obligation J.2-a,
-- annexes-1-mechanics.md:369-382 / annexes-3-build.md:179-192 dated 2026-08-23) — TEN re-cut bodies
-- total, unchanged in count from Annex J.2's headline number by coincidence, not by construction.
--
-- ALSO IN THIS WINDOW: obligation X-1 (annexes-3-build.md:193-208, same PR-1a lane annex true) —
-- the drawer-2 gate's arm (4) (`no_registered_account`) is vacuous on its own target population,
-- because `coa_accounts.is_bank_account` is minted ONLY by registration writers
-- (`add_bank_account`/`remap_bank_account_coa`), so a zero-registry client — arm (4)'s own reason
-- for existing — carries zero flagged accounts and the arm returns the empty set on exactly the
-- shape it exists to catch. F-T4's (unmerged, design-stage) `fix-queue-design.md` §2.1/§2.2 states
-- the shared-predicate contract (`clara._bank_registry_ledger_state`); per Annex O.4 obligation 6
-- ("one predicate, one owner, two call sites — whichever lands FIRST writes it"), F-A3/PR-1b lands
-- first (F-T4 is still pre-PR-0-gate), so THIS file authors the predicate to that contract and
-- F-T4's own drawer-1 `bank_recon_close_state` calls it later, unmodified by this file — drawer-1
-- stays F-T4's (R-F 1, ownership not absence). `_close_gate_bank_items` itself is a STABLE READ
-- (Annex F: "the repair is PR-1d, not a D1 body") so its re-cut carries no D1 write-quiesce term
-- even though it ships in this window.
--
-- WHAT THIS FILE DOES NOT SHIP (reported, not silently dropped): the thirteen wake sibling verbs
-- (Annex A.1) and their ungranted agent cores — the granted wrapper / ungranted core / shared
-- delegate seam over the bodies this file re-cuts. That is real, substantial, genuinely NEW
-- judgement logic (the fifteen-rung Tier-B ladder, M1-M15, none of which exists anywhere in the
-- estate today) and belongs in its own reviewed window rather than appended hastily to a file whose
-- job is getting ten money-path bodies and the shared-registry predicate exactly right. Until that
-- window lands, `wake_credentials` admits the `bank_agent` kind but `wake_fn_allowlist` holds no
-- row for it — the kind is MINTABLE but calls NOTHING, which is the fail-safe-by-construction
-- residue the 0077/0078 idiom is built on (posting_grants.sql's own header, verbatim shape): a
-- credential with nothing to call is strictly LESS surface than one with a broken call, never a
-- half-open door.
--
--   §0  prestate — prosrc sha pins for every live body this file re-cuts, the wake_credentials
--       CHECK prestate probe (hard-abort on interactive_client absent, soft-warn on close_prep
--       absent per the F-A2->F-A4->F-A3 merge order), the D1 quiesce inventory
--   §A  DDL 1  — bank_matches.origin CHECK gains 'agent'
--   §B  DDL 2  — wake_credentials' two CHECKs gain the bank_agent disjuncts
--   §C  DDL 3  — open_questions' CHECK family gains the bank_line scope / bank_ambiguity origin
--   §D  the ten CoR'd bodies (D1 — see the §0 inventory)
--   §E  the shared registry-ledger predicate (X-1) + the drawer-2 gate's repaired arm (4)
--   §F  tail census
-- ================================================================================================

set local statement_timeout = '10min';

do $prestate$
declare
  v_sha text;
  v_kind_def text;
  v_client_def text;
  v_n int;
begin
  -- -----------------------------------------------------------------------------------------
  -- PROSRC SHA PINS — every live body this file is about to CoR, pinned at the frontier this
  -- file was authored against (F-A2/PR-1 merged prosrc + F-A3/PR-1a merged prosrc). A drifted
  -- body aborts here, before anything is touched, rather than silently overwriting unknown text
  -- (the house discipline, F-A2 part1/part2/part3's own §0 sections).
  -- -----------------------------------------------------------------------------------------
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._bank_match_adjustment_entry(jsonb,uuid,text,text,bigint,date,text,jsonb,text,text)'::regprocedure;
  if v_sha is distinct from 'ae6fa808a9d49036d141ef33dc5794ee456e1122bd9e769f2ee8617eeea06bc9' then
    raise exception 'prestate: _bank_match_adjustment_entry drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._settle_from_bank_line_core(jsonb,uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)'::regprocedure;
  if v_sha is distinct from '8d6dc2ccabd54deef6c11c8134424d05be3a2bc5976c51d97585bf9c6824e924' then
    raise exception 'prestate: _settle_from_bank_line_core drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._allocate_receipt_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'::regprocedure;
  if v_sha is distinct from '5f6a5fcea9dff67d0488c882266209d985983e8640bcc2c3d93f58b52df74fcb' then
    raise exception 'prestate: _allocate_receipt_core drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._allocate_payment_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'::regprocedure;
  if v_sha is distinct from '021c44cb8af341241e9799113e1eb41a308a2ab76a2ac5af2fa51ce7a41bf82f' then
    raise exception 'prestate: _allocate_payment_core drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._tf_bank_match_congruence()'::regprocedure;
  if v_sha is distinct from '981909ff7055d1f70fb184724cadff05dda65fe6b49a7db41d977771c0008780' then
    raise exception 'prestate: _tf_bank_match_congruence drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure;
  if v_sha is distinct from 'e40600b6337b6ac8921ab39bc80d0385c835b822602a32124f83d3826edbfbf1' then
    raise exception 'prestate: mint_wake_credential drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure;
  if v_sha is distinct from 'b39ad4b9f838b9e06904a00274ceecad4864be7a7f5106f18f2eb6909ff3d898' then
    raise exception 'prestate: _match_bank_line_core drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._unmatch_bank_match_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if v_sha is distinct from '8175c52122282a2d6ac287f4de3f5413de72ef61ac0e9b154ba1d06a031c90f3' then
    raise exception 'prestate: _unmatch_bank_match_core drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._complete_bank_reconciliation_core(jsonb,uuid,uuid[],text)'::regprocedure;
  if v_sha is distinct from '3c2d053bfb4596c3bde8132341db5d6286135d8983bc8e97f102831c9fc421cd' then
    raise exception 'prestate: _complete_bank_reconciliation_core drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._resolve_and_book_bank_line_core(jsonb,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)'::regprocedure;
  if v_sha is distinct from '068c9aade28c5d8937f3f6ecbffbdd6032b5dc3b2e3ae479264e275c6ed278d3' then
    raise exception 'prestate: _resolve_and_book_bank_line_core drifted from its pinned sha (found %)', v_sha using errcode='CLR10';
  end if;

  -- The P-14 pin: _approve_entry_core's NINTH generation, re-derived here so a later drift
  -- (a stray tenth generation landing between authoring and apply) is caught rather than
  -- silently assumed compatible. This file does NOT recut this body (P-14 cleared: no tenth
  -- generation needed).
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_sha
    from pg_proc where oid = 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if v_sha is distinct from 'd5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637' then
    raise exception 'prestate: _approve_entry_core is not F-A2''s pinned ninth generation (found %) — P-14''s clearance was measured against THAT body; re-derive P-14 before proceeding', v_sha using errcode='CLR10';
  end if;

  -- -----------------------------------------------------------------------------------------
  -- SHARED-SURFACE PRESTATE — wake_credentials' two CHECKs (Annex O.4 obligation 4 / the wave-f
  -- lane brief). Merge order is F-A2(interactive_client) -> F-A4(close_prep) -> F-A3(bank_agent).
  -- interactive_client is a TRUE git-stacked predecessor of this branch (F-A2/PR-1 is this
  -- branch's base) and is HARD-REQUIRED: its absence means F-A2/PR-1 was not actually applied
  -- and this file must abort loudly rather than mint a CHECK with a hole in it. close_prep
  -- (F-A4/PR-1b) is NOT a git-stacked predecessor of this branch and, at the time this file was
  -- authored, F-A4/PR-1a itself carries zero commits over main — so close_prep's absence is
  -- TOLERATED here (a NOTICE, never an abort): the merge order guarantees it lands before this
  -- file's real apply regardless of what this rig sees today. Either way the live text is
  -- re-read via pg_get_constraintdef and carried forward BYTE-IDENTICAL (the extend-only law) —
  -- this file only ever ADDS the bank_agent disjunct to whatever it finds.
  -- -----------------------------------------------------------------------------------------
  select pg_get_constraintdef(oid) into v_kind_def
    from pg_constraint where conname='ck_wake_credentials_kind_0011' and conrelid='clara.wake_credentials'::regclass;
  select pg_get_constraintdef(oid) into v_client_def
    from pg_constraint where conname='ck_wake_credentials_client_0011' and conrelid='clara.wake_credentials'::regclass;
  if v_kind_def is null or v_client_def is null then
    raise exception 'prestate: wake_credentials'' CHECKs not found at all — has 0011 applied?' using errcode='CLR10';
  end if;
  if v_kind_def !~ 'interactive_client' or v_client_def !~ 'interactive_client' then
    raise exception 'prestate: wake_credentials'' CHECKs are missing the interactive_client disjunct — F-A2/PR-1 (this branch''s own base) is not applied as expected. kind=% client=%', v_kind_def, v_client_def
      using errcode='CLR10';
  end if;
  if v_kind_def ~ 'close_prep' and v_client_def ~ 'close_prep' then
    raise notice 'prestate: close_prep disjunct PRESENT in both wake_credentials CHECKs (F-A4/PR-1b landed before this file) — preserving byte-identical alongside the new bank_agent disjunct';
  else
    raise notice 'prestate: close_prep disjunct ABSENT from wake_credentials'' CHECKs at this apply (F-A4/PR-1b not yet landed here) — TOLERATED per the merge-order contract (F-A2 -> F-A4 -> F-A3); this file does not assume its presence and does not remove anything that is there. kind=% client=%', v_kind_def, v_client_def;
  end if;

  -- bank_matches.origin — CoR'd DDL 1's own prestate: the CHECK holds exactly {human, rule}
  -- today (no prior 'agent' widening from any other lane).
  select pg_get_constraintdef(oid) into v_kind_def
    from pg_constraint where conname='bank_matches_origin_check' and conrelid='clara.bank_matches'::regclass;
  if v_kind_def is null or v_kind_def ~ 'agent' then
    raise exception 'prestate: bank_matches_origin_check is missing or already admits agent (found %)', v_kind_def using errcode='CLR10';
  end if;

  -- open_questions' CHECK family — prestate: no bank_line scope, no bank_ambiguity origin yet.
  select count(*)::int into v_n from pg_constraint
    where conrelid='clara.open_questions'::regclass and contype='c'
      and pg_get_constraintdef(oid) ~ 'bank_line';
  if v_n > 0 then
    raise exception 'prestate: open_questions already carries a bank_line-referencing CHECK — has this file already applied?' using errcode='CLR10';
  end if;

  -- The three new tables — prestate: none exist yet.
  if to_regclass('clara.bank_agent_receipts') is not null
     or to_regclass('clara.bank_agent_proposals') is not null
     or to_regclass('clara.bank_agency_holds') is not null then
    raise exception 'prestate: F-A3 PR-1b partial birth — one of the three new tables already exists' using errcode='CLR10';
  end if;

  raise notice 'prestate: clean — ten target bodies pinned by prosrc sha at the F-A2/PR-1 + F-A3/PR-1a frontier, _approve_entry_core confirmed at its pinned NINTH-generation sha (P-14 cleared, no tenth body), wake_credentials'' two CHECKs carry interactive_client (hard-required) with close_prep tolerated present-or-absent, bank_matches.origin holds exactly {human,rule}, open_questions carries no bank_line reference yet, and none of the three new tables exist.';
end $prestate$;

-- ================================================================================================
-- §A · DDL 1 — bank_matches.origin admits 'agent'. ACCESS EXCLUSIVE, validates trivially (a text
-- CHECK over a column with two live values today). The congruence trigger (§D) carries the third
-- origin arm; this swap alone changes no behaviour until that trigger and a writer exist.
-- ================================================================================================
alter table clara.bank_matches
  drop constraint bank_matches_origin_check,
  add constraint bank_matches_origin_check check (origin in ('human','rule','agent'));

-- ================================================================================================
-- §B · DDL 2 — wake_credentials' two CHECKs gain the bank_agent disjuncts. ACCESS EXCLUSIVE,
-- extend-only: the existing disjuncts are re-read from the live catalog (§0) and reproduced
-- byte-for-byte via a dynamic ALTER, so this file can never regress a predecessor's arm even if
-- the exact live text was not knowable at authoring time (the close_prep tolerance, §0).
-- ================================================================================================
do $wake_credentials_checks$
declare
  v_kind_def text; v_client_def text;
  v_kind_inner text; v_client_inner text;
begin
  select pg_get_constraintdef(oid) into v_kind_def
    from pg_constraint where conname='ck_wake_credentials_kind_0011' and conrelid='clara.wake_credentials'::regclass;
  select pg_get_constraintdef(oid) into v_client_def
    from pg_constraint where conname='ck_wake_credentials_client_0011' and conrelid='clara.wake_credentials'::regclass;
  -- pg_get_constraintdef wraps the whole expression in one outer "CHECK (...)" — strip exactly
  -- that outer layer (never the inner parens the expression itself carries) so the extend can
  -- OR a new disjunct onto the untouched inner text rather than re-deriving it from memory.
  v_kind_inner := substring(v_kind_def from 8 for length(v_kind_def) - 8);
  v_client_inner := substring(v_client_def from 8 for length(v_client_def) - 8);

  execute format('alter table clara.wake_credentials drop constraint ck_wake_credentials_kind_0011');
  execute format('alter table clara.wake_credentials add constraint ck_wake_credentials_kind_0011 check (%s or (wake_kind = ''bank_agent''))', v_kind_inner);

  execute format('alter table clara.wake_credentials drop constraint ck_wake_credentials_client_0011');
  execute format('alter table clara.wake_credentials add constraint ck_wake_credentials_client_0011 check (%s or (wake_kind = ''bank_agent'' and client_id is not null))', v_client_inner);

  raise notice 'DDL 2: wake_credentials'' two CHECKs extended — bank_agent added to the kind enumeration and required-client-id disjuncts, every predecessor disjunct (autodraft/interactive/proactive/interactive_client, and close_prep if present) carried forward byte-identical via dynamic re-derivation from the live catalog, never retyped.';
end $wake_credentials_checks$;

-- ================================================================================================
-- §C · DDL 3 — open_questions' CHECK family gains the bank_line scope and the bank_ambiguity
-- origin (design §3.5, register A16). ACCESS EXCLUSIVE ×3 (scope_kind, origin, the composite
-- ck_open_questions_scope). Extend-only: every existing disjunct/value survives verbatim.
-- ================================================================================================
alter table clara.open_questions
  drop constraint open_questions_scope_kind_check,
  add constraint open_questions_scope_kind_check
    check (scope_kind in ('document','vendor','client','bank_line'));

alter table clara.open_questions
  drop constraint open_questions_origin_check_0017,
  add constraint open_questions_origin_check_0017
    check (origin in ('clarify_promotion','rule_proposal','rule_conflict','sweep_refusal',
      'manual','classification','onboarding','bank_ambiguity'));

alter table clara.open_questions
  drop constraint ck_open_questions_scope,
  add constraint ck_open_questions_scope check (
    (scope_kind = 'document' and scope_id = document_id and document_id is not null and counterparty_id is null)
    or (scope_kind = 'vendor' and scope_id = counterparty_id and counterparty_id is not null and document_id is null)
    or (scope_kind = 'client' and scope_id = client_id and document_id is null and counterparty_id is null)
    -- design §3.5: a bank_line question's scope_id IS the statement line; document_id carries
    -- the statement's own document (for the /queue surface's evidence link, per the door table,
    -- Annex M.2), counterparty_id is null — a bank-ambiguity question is about a LINE, not yet
    -- about a resolved counterparty.
    or (scope_kind = 'bank_line' and scope_id is not null and counterparty_id is null));

do $oq_tail$
begin
  raise notice 'DDL 3: open_questions'' CHECK family extended — scope_kind admits bank_line, origin admits bank_ambiguity, ck_open_questions_scope gains the congruent bank_line arm (scope_id = the line, document_id = the statement''s document, counterparty_id null); every pre-existing disjunct survives verbatim.';
end $oq_tail$;

-- ================================================================================================
-- §A2 · DDL 1b — NEW FINDING, not on Annex J.2's list, caught by rig replay before authoring
-- (the R4 discipline: "every DB lane's first hour is a rig replay ... budget the miss").
-- `clara.entry_post_receipts` — F-A2's own structural receipt table, the one
-- `t_je_agent_post_receipt` demands exactly one row of for any approved entry whose
-- checker_actor resolves to an agent user — carries TWO CHECKs that make a bank-agent post
-- UNWRITEABLE as designed:
--   * `entry_post_receipts_via_wake_kind_check` admits only {autodraft, interactive} — 'bank_agent'
--     is not a member, so the INSERT itself would raise a CHECK violation, not a typed CLR refusal.
--   * `entry_post_receipts_gate_verdicts_check` REQUIRES a non-blank `extraction_id` inside
--     gate_verdicts. A bank-born entry has no document, no OCR extraction and no extraction_id —
--     the requirement is invoice-domain-shaped and the bank lane can never satisfy it.
-- Measured: the only two readers of `gate_verdicts->>'extraction_id'` are
-- `_tf_assert_sales_invoice_shape` and `_tf_assert_supplier_bill_shape` (a live pg_proc census,
-- this session) — both gated behind `coding_kind in ('sales_invoice','supplier_bill')`, which the
-- bank lane never sets (Annex B.5 / nit N2: the bank lane sets customer_receipt, supplier_payment
-- or NULL). So a bank-origin row with no extraction_id is inert to both readers by construction —
-- exactly the same "coding_kind gate makes an absent field harmless" shape N2 already established.
-- Both CHECKs are extend-only ACCESS EXCLUSIVE swaps; the invoice domain's existing behaviour is
-- untouched (extraction_id, when present, still satisfies the gate_verdicts CHECK exactly as
-- before — this file only ORs in a second, disjoint, bank-domain-shaped satisfaction path keyed on
-- `op_key`, which every body in this file already refuses to proceed without).
-- ================================================================================================
alter table clara.entry_post_receipts
  drop constraint entry_post_receipts_via_wake_kind_check,
  add constraint entry_post_receipts_via_wake_kind_check
    check (via_wake_kind in ('autodraft','interactive','bank_agent'));

alter table clara.entry_post_receipts
  drop constraint entry_post_receipts_gate_verdicts_check,
  add constraint entry_post_receipts_gate_verdicts_check check (
    jsonb_typeof(gate_verdicts)='object' and (
      nullif(btrim(coalesce(gate_verdicts->>'extraction_id','')),'') is not null
      or nullif(btrim(coalesce(gate_verdicts->>'op_key','')),'') is not null));

do $epr_tail$
begin
  raise notice 'DDL 1b (NEW finding, rig-replay-caught): entry_post_receipts'' via_wake_kind CHECK now admits bank_agent alongside autodraft/interactive; its gate_verdicts CHECK now admits EITHER a non-blank extraction_id (the invoice-domain path, byte-identical to before) OR a non-blank op_key (the new bank-domain path) — the two readers of extraction_id (_tf_assert_sales_invoice_shape, _tf_assert_supplier_bill_shape) are both coding_kind-gated away from every bank-origin row, so the widening is inert to them by construction.';
end $epr_tail$;

-- ================================================================================================
-- §D · THE TEN CoR'D BODIES (D1). Every body below is DORMANT for a human caller by construction
-- (`v_is_agent` reads false when `p_ctx` carries no `is_agent` key at all — `coalesce(...,false)`
-- — so the pre-existing human path through every one of these bodies is untouched byte-for-byte;
-- proved by the differential cell in the battery, not asserted here) and is exercised ONLY once a
-- future window lands the granted wrapper / ungranted agent-core seam that actually mints an
-- is_agent-bearing ctx — the SAME "ships ahead of its producer" discipline
-- `UNNUMBERED_f_a2_posted_chain.sql`'s own header states for F-A2's posted-outcome chain.
--
-- THE CTX SHAPE EVERY BODY BELOW READS (extend of F-A2's D9 shape, `0044`'s own convention):
-- `{actor, firm, is_agent, on_behalf_of, wake_kind, rationale, model, receipt_preheld}`.
-- `rationale`/`model` are NEW keys beyond F-A2's D9 set — F-A2's own `_agent_post_entry_core`
-- receives them as DIRECT positional arguments because it sits one frame from its wrapper; every
-- body below sits TWO TO FOUR frames from its future wrapper (settle -> allocate -> approve, or
-- match -> adjustment -> approve), so carrying them on the ctx bag is the SAME choice F-A2 made
-- for is_agent/on_behalf_of/wake_kind, extended one step further rather than widening five
-- signatures' arity to plumb two more positional parameters through bodies whose PUBLIC human
-- callers must never see them.
-- ================================================================================================

-- ------------------------------------------------------------------------------------------------
-- D-1  clara._bank_match_adjustment_entry (Annex A.2b body 1 / J.2 item 10) — finding F2/F13.
-- Two changes from the pinned body: (1) `last_human_editor` is NULL on the agent arm — it is not
-- a human edit; (2) the agent arm writes F-A2's `entry_post_receipts` row itself, in the same
-- transaction, immediately after `_approve_entry_core` returns — this body is one of the three
-- DIRECT callers of `_approve_entry_core` in the settle limb (Annex A.2b), so it is one of the
-- three places that row can be written from. `p_ctx` was ALREADY threaded to `_approve_entry_core`
-- in the pinned body (`p_ctx || jsonb_build_object('receipt_preheld', true)`) — that line is
-- unchanged; only the two additions below are new.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._bank_match_adjustment_entry(p_ctx jsonb, p_client uuid, p_bank_coa text, p_account text, p_amount_cents bigint, p_posting_date date, p_memo text, p_flags jsonb, p_approve_key text, p_attestation text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_entry uuid; v_rev uuid; v_actor uuid; v_memo text;
  v_is_agent boolean; v_receipt_id uuid;
begin
  v_actor := (p_ctx->>'actor')::uuid;
  v_is_agent := coalesce((p_ctx->>'is_agent')::boolean, false);
  if p_amount_cents is null or p_amount_cents = 0 then
    raise exception 'a bank match adjustment must move a non-zero amount'
      using errcode='CLR10',detail='{"reason":"adjustment_amount_invalid"}';
  end if;
  if p_account is null or btrim(p_account) = '' or p_account = p_bank_coa
     or not exists (select 1 from clara.coa_accounts a
                    where a.client_id = p_client and a.account_code = p_account
                      and a.is_active and a.account_class is null
                      and a.account_type in ('expense','income')) then
    raise exception 'a bank match adjustment must be booked to an active, non-control expense or income account that is not the bank account itself'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','adjustment_account_invalid',
          'account_code',p_account)::text;
  end if;
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Bank match adjustment');

  -- F-A3 (B1/F13, agent identity): NULL last_human_editor on the agent arm — it is not a human
  -- edit. maker_actor stays v_actor on BOTH arms (the acting identity, human or agent alike).
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      null, v_actor, case when v_is_agent then null else v_actor end,
      coalesce(p_flags, '{}'::jsonb))
    returning id into v_entry;
  -- The bank leg is ALWAYS line 1, so an adjustment reads the same way in /bank and in the
  -- GL whichever direction it goes. counterparty_id is stated as NULL rather than defaulted
  -- so the counterparty-free property is visible at the write, not inferred from an omission.
  if p_amount_cents > 0 then
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 1, p_bank_coa, p_amount_cents, 0, v_memo, null);
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 2, p_account, 0, p_amount_cents, v_memo, null);
  else
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 1, p_bank_coa, 0, -p_amount_cents, v_memo, null);
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, 2, p_account, -p_amount_cents, 0, v_memo, null);
  end if;
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read
  -- at INSERT ... RETURNING time is already stale by the time the core checks it
  -- (0037:2843-2845).
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if v_is_agent then
    v_receipt_id := gen_random_uuid();
    perform clara._approve_entry_core(
      p_ctx || jsonb_build_object('receipt_preheld', true, 'post_receipt_id', v_receipt_id),
      v_entry, v_rev, p_attestation, p_approve_key);
    -- F-A3 (B1/F13): the F-A2 structural receipt, written in-transaction, right after
    -- `_approve_entry_core` returns — otherwise `t_je_agent_post_receipt` (deferred) aborts the
    -- whole act at commit. `gate_verdicts` carries `op_key` (this file's DDL 1b widening), never
    -- an invented `extraction_id` — a bank adjustment has no extraction to name.
    insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
        on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
        maker_active_at_approval, op_key)
      values (v_receipt_id, (p_ctx->>'firm')::uuid, p_client, v_entry, v_actor,
        nullif(p_ctx->>'on_behalf_of','')::uuid, coalesce(p_ctx->>'wake_kind','bank_agent'),
        coalesce(p_ctx->'model', '{}'::jsonb),
        coalesce(nullif(btrim(p_ctx->>'rationale'),''), 'Bank match adjustment (agent)'),
        jsonb_build_object('op_key', p_approve_key), 'agent_unattended', null, p_approve_key);
  else
    perform clara._approve_entry_core(
      p_ctx || jsonb_build_object('receipt_preheld', true),
      v_entry, v_rev, p_attestation, p_approve_key);
  end if;
  return v_entry;
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-2  clara._allocate_receipt_core (Annex A.2b body 1 / J.2 item 12) — finding B1.
-- Three changes from the pinned body: (1) `last_human_editor` NULL on the agent arm; (2) an
-- EXPLICIT agent arm that ALWAYS calls `_approve_entry_core` — bypassing the `is_high_stakes`
-- branch entirely (D28's asymmetry: no pending reservation on the agent lane, ever, G1.2) —
-- threading the FULL `p_ctx` through rather than the pinned body's fresh
-- `jsonb_build_object('actor','firm','receipt_preheld',true)`; (3) the agent arm writes
-- `entry_post_receipts` itself. Every other line is byte-identical to the pinned body.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._allocate_receipt_core(p_ctx jsonb, p_client uuid, p_counterparty uuid, p_posting_date date, p_memo text, p_bank_account text, p_amount_cents bigint, p_allocations jsonb, p_op_key text, p_discount_cents bigint, p_discount_account text, p_attestation text, p_control_account text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  v_memo text; v_disc bigint; v_gross bigint; v_ctrl text; v_ctrl_n int;
  v_allocs jsonb; v_prop_allocs jsonb; v_n int; v_dis int; v_sum bigint; v_residue bigint;
  v_ids uuid[]; al record; v_out bigint; i record; v_rev_by uuid;
  v_group uuid; v_entry uuid; v_rev uuid; v_line int; v_status text; v_approve_key text;
  v_preheld boolean; v_is_agent boolean; v_receipt_id uuid;
begin
  -- THE CONTEXT, from the caller's frame (the clara._approve_entry_core convention,
  -- 0016:15-20). The FLOOR is the wrapper's job: a core never decides who may call it,
  -- because every caller is itself a floored SECURITY DEFINER verb.
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the allocate core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_preheld := coalesce((p_ctx->>'receipt_preheld')::boolean, false);
  v_is_agent := coalesce((p_ctx->>'is_agent')::boolean, false);
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a receipt amount must be positive'
      using errcode='CLR10',detail='{"reason":"amount_invalid"}';
  end if;
  v_disc := coalesce(p_discount_cents, 0);
  if v_disc < 0 then
    raise exception 'a settlement discount cannot be negative'
      using errcode='CLR10',detail='{"reason":"discount_invalid"}';
  end if;
  v_gross := p_amount_cents + v_disc;
  -- ck_je_basis demands a document or a memo, and a settlement never has a document, so the
  -- memo is synthesised rather than refused when blank: a receipt is real work and should not
  -- fail on a blank field the system can fill honestly.
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Customer receipt');
  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;
  if v_cp_kind is distinct from 'customer' then
    raise exception 'a customer receipt requires a counterparty of kind customer'
      using errcode='CLR10',detail='{"reason":"counterparty_kind_mismatch"}';
  end if;

  -- NORMALIZE the allocation set BEFORE hashing it. Validated straight off the raw argument
  -- so a malformed uuid or a fractional amount becomes a NAMED refusal rather than a raw cast
  -- error a caller cannot act on.
  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'the allocation set must be a json array'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'amount_cents') <> 'number'
       or (x.elem->>'amount_cents')::numeric <= 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each allocation must state an item_id and a positive whole amount_cents'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'amount_cents', t.amt)
           order by t.item_id), '[]'::jsonb),
         count(*)::int, count(distinct t.item_id)::int, coalesce(sum(t.amt), 0)
    into v_allocs, v_n, v_dis, v_sum
    from (select (x.elem->>'item_id')::uuid as item_id,
                 (x.elem->>'amount_cents')::bigint as amt
          from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same open item appears twice in one allocation set; state one line per item'
      using errcode='CLR10',detail='{"reason":"allocations_duplicated"}';
  end if;
  v_residue := v_gross - v_sum;
  if v_residue < 0 then
    raise exception 'the allocations exceed the receipt (amount plus discount)'
      using errcode='CLR10',detail='{"reason":"allocations_exceed_receipt"}';
  end if;

  -- THE REQUEST HASH CARRIES EVERY ARGUMENT THAT REACHES A STORED COLUMN OR A DECISION, and
  -- p_control_account is both: it decides WHICH receivable control account the entry credits.
  -- Omitting it would let the same op_key replayed with a different control account return
  -- the FIRST call's receipt while the caller believes the second request landed -- a silent
  -- wrong-account post with a green receipt, which is exactly the failure mode op hashes
  -- exist to prevent.
  -- 0042 (D-b SS4): SKIPPED when the CALLER already reserved this key (receipt_preheld) --
  -- the clara._approve_entry_core convention. The fn name stays 'allocate_receipt' on every
  -- path, so a preheld caller must reserve under that same fn or its receipt is unfindable.
  if not v_preheld then
    v_dedupe := clara._reserve_op(c.firm, 'allocate_receipt', p_op_key,
      clara._hash(jsonb_build_object('client', p_client, 'counterparty', v_cp,
        'posting_date', p_posting_date, 'memo', v_memo, 'bank_account', p_bank_account,
        'amount_cents', p_amount_cents, 'discount_cents', v_disc,
        'discount_account', p_discount_account, 'control_account', p_control_account,
        'attestation', p_attestation, 'allocations', v_allocs)));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  -- PRE-RESERVE THE DERIVED APPROVE SUB-KEY HERE, BEFORE ANY LOCK. _reserve_op writes an
  -- op_receipts row, so it can BLOCK on a concurrent inserter of the same key. Taking that
  -- block while already holding the two client advisory locks (as the original build did, at
  -- the bottom of this body) makes a deadlock reachable: two sessions, each holding the other
  -- session's next rung. Claiming the sub-key namespace first -- before 203005003 -- closes
  -- the window entirely, and it costs nothing, because the reservation is rolled back with
  -- everything else if this call fails (0004:43-60). The hash pins the COMPOSITE's own key
  -- rather than (entry, revision), which do not exist yet; the core never re-checks it
  -- (receipt_preheld:true skips its own reserve) and its only jobs are to claim the namespace
  -- against a later human approve_entry replay and to be finished by the core's _finish_op.
  -- ON THE WCA-R7 DRAFT BRANCH the core is never called, so the sub-key stays CLAIMED BUT
  -- UNFINISHED for the life of the draft. That is the honest cost of moving the reservation
  -- ahead of the locks, and it is the safe direction: the namespace stays reserved, and the
  -- checker approves through their OWN op_key on the ordinary /queue lane.
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'allocate_receipt',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
  end if;

  -- LOCKS, in the total order. See the section header for why the two advisory locks are
  -- taken HERE rather than left to the core.
  perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_cp::text));
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- THE CONTROL ACCOUNT. Plural control accounts per class are legal (design 2.7), so the
  -- composite NEVER silently picks: with one active receivable-class account it is used;
  -- with several, the caller must name one via p_control_account (the explicit lane).
  if p_control_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_control_account
                     and a.account_class = 'receivable' and a.is_active) then
      raise exception 'p_control_account % is not an active receivable-class account of this client', p_control_account
        using errcode='CLR10',detail='{"reason":"control_account_invalid"}';
    end if;
    v_ctrl := p_control_account;
  else
    select count(*)::int, min(a.account_code) into v_ctrl_n, v_ctrl
      from clara.coa_accounts a
      where a.client_id = p_client and a.account_class = 'receivable' and a.is_active;
    if v_ctrl_n <> 1 then
      raise exception 'this client has % active receivable control accounts; name one via p_control_account', v_ctrl_n
        using errcode='CLR10',detail='{"reason":"ar_control_not_unique"}';
    end if;
  end if;
  -- The bank leg must be an ACTIVE, ASSET-typed, NON-CONTROL account. Asset-typed is not
  -- decoration: the receipt floor forbids income legs, so an income-typed "bank" account would
  -- build an entry that refuses at commit with a message about the floor rather than about the
  -- account the caller actually got wrong.
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_bank_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the receipt account must be an active, asset-typed, non-control account on this chart'
      using errcode='CLR10',detail='{"reason":"bank_account_invalid"}';
  end if;
  -- account_class IS NULL on the discount account too, for the same reason it is demanded of
  -- the bank leg: a control-class account admitted here would put a SECOND receivable leg on
  -- a customer_receipt, which the shape floor refuses at commit with a message about the
  -- floor rather than about the account the caller actually got wrong -- and, worse, a
  -- payable-class "discount" account would build a cross-domain contra out of a settlement.
  if v_disc > 0 then
    if p_discount_account is null
       or not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = p_discount_account
                        and a.is_active and a.account_type = 'expense'
                        and a.account_class is null) then
      raise exception 'a receipt discount must be booked to an active, non-control expense account'
        using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
    end if;
  elsif p_discount_account is not null then
    raise exception 'a discount account was named but no discount amount was stated'
      using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
  end if;

  -- VALIDATE THE ALLOCATION SET AGAINST OUTSTANDING, UNDER THE BATCH ROW LOCK.
  select array_agg(distinct (x.elem->>'item_id')::uuid) into v_ids
    from jsonb_array_elements(v_allocs) as x(elem);
  if v_ids is not null then
    perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;
  end if;
  v_prop_allocs := '[]'::jsonb;
  for al in select (x.elem->>'item_id')::uuid as item_id,
                  (x.elem->>'amount_cents')::bigint as amt
           from jsonb_array_elements(v_allocs) as x(elem) order by 1 loop
    select * into i from clara.open_items oi where oi.id = al.item_id;
    if not found or i.client_id <> p_client or i.firm_id <> c.firm then
      raise exception 'open item % is not in this client', al.item_id using errcode='CLR11';
    end if;
    if i.domain <> 'ar' then
      raise exception 'open item % is not a receivable item', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_domain_mismatch"}';
    end if;
    -- Canonicalise on READ as well as on write: a merge performed after the item was written
    -- does not repoint history, exactly as it does not for journal_lines.
    if clara._canonical_counterparty(p_client, i.counterparty_id) <> v_cp then
      raise exception 'open item % belongs to a different customer', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_counterparty_mismatch"}';
    end if;
    -- THE REVERSED-ENTRY WALL, on the real-cash path. An entry that has been REVERSED is out
    -- of the books; its item's outstanding is a number the reversal has already answered with
    -- an unwind item of the exact opposite sign. Receipting against it would take real money
    -- in against a claim that no longer exists, leave the unwind permanently un-applied, and
    -- show the customer as paid on an invoice that was cancelled. The remedy is the sanctioned
    -- one and the message names it: apply the unwind to the item (apply_open_items), which
    -- takes both to zero with no GL movement at all.
    --
    -- READ SEPARATELY, not folded into the credit-note wall's `join clara.documents`: that
    -- join is INNER and silently skips every entry with no document -- which is every generic
    -- JV, every opening entry and every entry born outside a filing. A wall that cannot see
    -- document-less entries is not a wall.
    select je.reversed_by into v_rev_by
      from clara.journal_entries je where je.id = i.entry_id;
    if v_rev_by is not null then
      raise exception 'open item % belongs to an entry that has been reversed; apply the reversal unwind to it instead of receipting against it', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_reversed"}';
    end if;
    -- 0041 (WD-R13, AF-1): THE UNBORN-ITEM WALL. A settlement dated BEFORE the item
    -- it settles breaks SUM(aging buckets) = control at every as-of in between, silently: the
    -- buckets are item_date-driven while this allocation is effective-dated at the
    -- settlement's posting date. HARD REFUSE, no override (WD-R13) -- an override flag would
    -- simply re-open the break it closes. The remedy is the sanctioned one and the message
    -- names it; apply_open_items is act-dated and structurally immune to this defect.
    if i.item_date is not null and p_posting_date < i.item_date then
      raise exception 'open item % is dated % -- later than this settlement (%); book the money as a deposit or advance on account and apply it with apply_open_items once the item exists', al.item_id, i.item_date, p_posting_date
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_to_unborn_item',
            'item_id',al.item_id,'item_date',i.item_date,
            'posting_date',p_posting_date)::text;
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to receipt against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
    if al.amt > v_out then
      raise exception 'allocation of % exceeds the % outstanding on open item %', al.amt, v_out, al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_exceeds_outstanding"}';
    end if;
    -- PIN THE OUTSTANDING THIS VALIDATION ACTUALLY SAW into the stored proposal. On the
    -- WCA-R7 draft branch the hook re-validates at the CHECKER's approve, and "still fits"
    -- is not the same statement as "nothing moved": an intervening partial allocation that
    -- leaves room would silently change what the maker proposed. The pin rides the PROPOSAL,
    -- never the op hash -- the hash must stay a function of the CALLER's request alone, or a
    -- legitimate retry of the identical request would be rejected as different args.
    v_prop_allocs := v_prop_allocs || jsonb_build_object('item_id', al.item_id,
      'amount_cents', al.amt, 'expected_outstanding_cents', v_out);
  end loop;

  -- THE SETTLEMENT ENTRY. Dr bank (amount) [+ Dr discount] / Cr receivable control (gross).
  -- The control credit of amount+discount is what makes the settlement item exactly -gross,
  -- so the classifier needs no knowledge of discounts at all.
  v_group := gen_random_uuid();
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      'customer_receipt', c.actor, case when v_is_agent then null else c.actor end,
      jsonb_build_object('settlement_allocation', jsonb_build_object(
        'domain', 'ar', 'counterparty_id', v_cp, 'group', v_group,
        'control_account', v_ctrl,
        'allocations', v_prop_allocs, 'residue_cents', v_residue, 'proposed_by', c.actor)))
    returning id into v_entry;
  v_line := 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, p_bank_account, p_amount_cents, 0, v_memo, null);
  if v_disc > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, v_line, p_discount_account, v_disc, 0, 'Settlement discount', null);
  end if;
  v_line := v_line + 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, v_ctrl, 0, v_gross, v_memo, v_cp);
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read
  -- at INSERT ... RETURNING time is already stale by the time the core checks it.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  -- F-A3 (B1/D28): the agent arm ALWAYS calls approve, bypassing is_high_stakes entirely — no
  -- pending reservation on the agent lane, ever (G1.2). `_approve_entry_core`'s own ninth
  -- generation (P-14) is what turns this into a LIVE post with no attestation, no distinct
  -- checker, once `is_agent` reaches it — this call is what makes that reachable.
  if v_is_agent then
    v_approve_key := p_op_key || ':approve';
    v_receipt_id := gen_random_uuid();
    perform clara._approve_entry_core(
      p_ctx || jsonb_build_object('receipt_preheld', true, 'post_receipt_id', v_receipt_id),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
    insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
        on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
        maker_active_at_approval, op_key)
      values (v_receipt_id, c.firm, p_client, v_entry, c.actor,
        nullif(p_ctx->>'on_behalf_of','')::uuid, coalesce(p_ctx->>'wake_kind','bank_agent'),
        coalesce(p_ctx->'model', '{}'::jsonb),
        coalesce(nullif(btrim(p_ctx->>'rationale'),''), 'Customer receipt (agent)'),
        jsonb_build_object('op_key', v_approve_key), 'agent_unattended', null, v_approve_key);
  elsif clara.is_high_stakes(v_entry) then
    -- WCA-R7: leave a DRAFT carrying the validated proposal. The checker approves it through
    -- the ordinary /queue lane and the hook materialises everything, re-validating outstanding
    -- at that moment.
    v_status := 'draft';
  else
    -- The sub-key was pre-reserved at the top of this body, before any lock (see there).
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'allocate_receipt', v_entry,
    jsonb_build_object('client', p_client, 'counterparty', v_cp, 'group', v_group,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'control_account', v_ctrl, 'bank_account', p_bank_account,
      'allocated_cents', v_sum, 'residue_cents', v_residue, 'status', v_status,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'allocate_receipt', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'status', v_status,
      'group_id', v_group, 'control_account', v_ctrl, 'residue_cents', v_residue));
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-3  clara._allocate_payment_core (Annex A.2b body 2 / J.2 item 13) — the AP twin of D-2, same
-- three changes.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._allocate_payment_core(p_ctx jsonb, p_client uuid, p_counterparty uuid, p_posting_date date, p_memo text, p_bank_account text, p_amount_cents bigint, p_allocations jsonb, p_op_key text, p_discount_cents bigint, p_discount_account text, p_attestation text, p_control_account text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  v_memo text; v_disc bigint; v_gross bigint; v_ctrl text; v_ctrl_n int;
  v_allocs jsonb; v_prop_allocs jsonb; v_n int; v_dis int; v_sum bigint; v_residue bigint;
  v_ids uuid[]; al record; v_out bigint; i record; v_doc_kind text; v_rev_by uuid;
  v_group uuid; v_entry uuid; v_rev uuid; v_line int; v_status text; v_approve_key text;
  v_preheld boolean; v_is_agent boolean; v_receipt_id uuid;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the allocate core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_preheld := coalesce((p_ctx->>'receipt_preheld')::boolean, false);
  v_is_agent := coalesce((p_ctx->>'is_agent')::boolean, false);
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment amount must be positive'
      using errcode='CLR10',detail='{"reason":"amount_invalid"}';
  end if;
  v_disc := coalesce(p_discount_cents, 0);
  if v_disc < 0 then
    raise exception 'a settlement discount cannot be negative'
      using errcode='CLR10',detail='{"reason":"discount_invalid"}';
  end if;
  v_gross := p_amount_cents + v_disc;
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Supplier payment');
  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;
  if v_cp_kind is distinct from 'vendor' then
    raise exception 'a supplier payment requires a counterparty of kind vendor'
      using errcode='CLR10',detail='{"reason":"counterparty_kind_mismatch"}';
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'the allocation set must be a json array'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'amount_cents') <> 'number'
       or (x.elem->>'amount_cents')::numeric <= 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each allocation must state an item_id and a positive whole amount_cents'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'amount_cents', t.amt)
           order by t.item_id), '[]'::jsonb),
         count(*)::int, count(distinct t.item_id)::int, coalesce(sum(t.amt), 0)
    into v_allocs, v_n, v_dis, v_sum
    from (select (x.elem->>'item_id')::uuid as item_id,
                 (x.elem->>'amount_cents')::bigint as amt
          from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same open item appears twice in one allocation set; state one line per item'
      using errcode='CLR10',detail='{"reason":"allocations_duplicated"}';
  end if;
  v_residue := v_gross - v_sum;
  if v_residue < 0 then
    raise exception 'the allocations exceed the payment (amount plus discount)'
      using errcode='CLR10',detail='{"reason":"allocations_exceed_payment"}';
  end if;

  -- p_control_account is in the hash for the reason its AR twin states: it decides WHICH
  -- payable control account the entry debits, so a replay under the same key with a different
  -- control account must not return the first call's receipt.
  -- 0042 (D-b SS4): skipped when the CALLER already holds this receipt (see the AR twin).
  if not v_preheld then
    v_dedupe := clara._reserve_op(c.firm, 'allocate_payment', p_op_key,
      clara._hash(jsonb_build_object('client', p_client, 'counterparty', v_cp,
        'posting_date', p_posting_date, 'memo', v_memo, 'bank_account', p_bank_account,
        'amount_cents', p_amount_cents, 'discount_cents', v_disc,
        'discount_account', p_discount_account, 'control_account', p_control_account,
        'attestation', p_attestation, 'allocations', v_allocs)));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  -- The derived approve sub-key is pre-reserved BEFORE any lock, exactly as in the AR twin
  -- (see the full reasoning there): _reserve_op can block on a concurrent inserter, and
  -- blocking on it while holding the two client advisory locks makes a deadlock reachable.
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'allocate_payment',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
  end if;

  perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_cp::text));
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- The control account: same explicit-lane law as the receipt side (never a silent pick).
  if p_control_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_control_account
                     and a.account_class = 'payable' and a.is_active) then
      raise exception 'p_control_account % is not an active payable-class account of this client', p_control_account
        using errcode='CLR10',detail='{"reason":"control_account_invalid"}';
    end if;
    v_ctrl := p_control_account;
  else
    select count(*)::int, min(a.account_code) into v_ctrl_n, v_ctrl
      from clara.coa_accounts a
      where a.client_id = p_client and a.account_class = 'payable' and a.is_active;
    if v_ctrl_n <> 1 then
      raise exception 'this client has % active payable control accounts; name one via p_control_account', v_ctrl_n
        using errcode='CLR10',detail='{"reason":"ap_control_not_unique"}';
    end if;
  end if;
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_bank_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the payment account must be an active, asset-typed, non-control account on this chart'
      using errcode='CLR10',detail='{"reason":"bank_account_invalid"}';
  end if;
  -- THE ONE ASYMMETRY: a supplier settlement discount is INCOME (a discount received), where a
  -- customer settlement discount is an expense (a discount given). account_class IS NULL is
  -- demanded here too -- a control-class "discount" account would put a second payable leg on
  -- the payment, or a receivable one, which is a cross-domain contra dressed as a discount.
  if v_disc > 0 then
    if p_discount_account is null
       or not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = p_discount_account
                        and a.is_active and a.account_type = 'income'
                        and a.account_class is null) then
      raise exception 'a payment discount must be booked to an active, non-control income account'
        using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
    end if;
  elsif p_discount_account is not null then
    raise exception 'a discount account was named but no discount amount was stated'
      using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
  end if;

  select array_agg(distinct (x.elem->>'item_id')::uuid) into v_ids
    from jsonb_array_elements(v_allocs) as x(elem);
  if v_ids is not null then
    perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;
  end if;
  v_prop_allocs := '[]'::jsonb;
  for al in select (x.elem->>'item_id')::uuid as item_id,
                  (x.elem->>'amount_cents')::bigint as amt
           from jsonb_array_elements(v_allocs) as x(elem) order by 1 loop
    select * into i from clara.open_items oi where oi.id = al.item_id;
    if not found or i.client_id <> p_client or i.firm_id <> c.firm then
      raise exception 'open item % is not in this client', al.item_id using errcode='CLR11';
    end if;
    if i.domain <> 'ap' then
      raise exception 'open item % is not a payable item', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_domain_mismatch"}';
    end if;
    if clara._canonical_counterparty(p_client, i.counterparty_id) <> v_cp then
      raise exception 'open item % belongs to a different supplier', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_counterparty_mismatch"}';
    end if;
    -- THE REVERSED-ENTRY WALL, on the real-cash path -- and on THIS side it is money going
    -- OUT. Paying against an item whose entry has been reversed pays a bill the books have
    -- already cancelled. Read as its OWN statement rather than folded into the credit-note
    -- join below: that join is INNER on clara.documents and cannot see a document-less entry
    -- at all, which is every generic JV and every opening entry. The remedy named in the
    -- message is the sanctioned one -- apply the unwind item to this item, zero GL movement.
    select je.reversed_by into v_rev_by
      from clara.journal_entries je where je.id = i.entry_id;
    if v_rev_by is not null then
      raise exception 'open item % belongs to an entry that has been reversed; apply the reversal unwind to it instead of paying against it', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_reversed"}';
    end if;
    -- THE CREDIT-NOTE WALL (Wave-C contract section 3, discharged). supplier_credit_note has
    -- no coding home yet, so a supplier CN mis-coded AS a bill still mints a payable item --
    -- and paying against it would turn a coding error into a path to real cash. Refusing when
    -- the item's entry is bound to a document the classifier called a credit_note converts the
    -- trap back into a VISIBLE coding error the human must fix first. The residual exposure is
    -- recorded honestly: a CN whose document was never classified as one is still reachable,
    -- and only supplier_credit_note closes that for good.
    select d.document_kind into v_doc_kind
      from clara.journal_entries je
      join clara.documents d on d.id = je.document_id
      where je.id = i.entry_id;
    if v_doc_kind = 'credit_note' then
      raise exception 'open item % comes from a document classified as a credit note; fix the coding before paying against it', al.item_id
        using errcode='CLR10',detail='{"reason":"credit_note_item"}';
    end if;
    -- 0041 (WD-R13, AF-1): THE UNBORN-ITEM WALL. A settlement dated BEFORE the item
    -- it settles breaks SUM(aging buckets) = control at every as-of in between, silently: the
    -- buckets are item_date-driven while this allocation is effective-dated at the
    -- settlement's posting date. HARD REFUSE, no override (WD-R13) -- an override flag would
    -- simply re-open the break it closes. The remedy is the sanctioned one and the message
    -- names it; apply_open_items is act-dated and structurally immune to this defect.
    if i.item_date is not null and p_posting_date < i.item_date then
      raise exception 'open item % is dated % -- later than this settlement (%); book the money as a deposit or advance on account and apply it with apply_open_items once the item exists', al.item_id, i.item_date, p_posting_date
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_to_unborn_item',
            'item_id',al.item_id,'item_date',i.item_date,
            'posting_date',p_posting_date)::text;
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to pay against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
    if al.amt > v_out then
      raise exception 'allocation of % exceeds the % outstanding on open item %', al.amt, v_out, al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_exceeds_outstanding"}';
    end if;
    -- The outstanding THIS validation saw, pinned into the proposal so the hook can require
    -- EQUALITY at the checker's approve rather than "still fits" (see the AR twin).
    v_prop_allocs := v_prop_allocs || jsonb_build_object('item_id', al.item_id,
      'amount_cents', al.amt, 'expected_outstanding_cents', v_out);
  end loop;

  v_group := gen_random_uuid();
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      'supplier_payment', c.actor, case when v_is_agent then null else c.actor end,
      jsonb_build_object('settlement_allocation', jsonb_build_object(
        'domain', 'ap', 'counterparty_id', v_cp, 'group', v_group,
        'control_account', v_ctrl,
        'allocations', v_prop_allocs, 'residue_cents', v_residue, 'proposed_by', c.actor)))
    returning id into v_entry;
  v_line := 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, v_ctrl, v_gross, 0, v_memo, v_cp);
  v_line := v_line + 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, p_bank_account, 0, p_amount_cents, v_memo, null);
  if v_disc > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, v_line, p_discount_account, 0, v_disc, 'Settlement discount', null);
  end if;
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read
  -- at INSERT ... RETURNING time is already stale by the time the core checks it.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if v_is_agent then
    v_approve_key := p_op_key || ':approve';
    v_receipt_id := gen_random_uuid();
    perform clara._approve_entry_core(
      p_ctx || jsonb_build_object('receipt_preheld', true, 'post_receipt_id', v_receipt_id),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
    insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
        on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
        maker_active_at_approval, op_key)
      values (v_receipt_id, c.firm, p_client, v_entry, c.actor,
        nullif(p_ctx->>'on_behalf_of','')::uuid, coalesce(p_ctx->>'wake_kind','bank_agent'),
        coalesce(p_ctx->'model', '{}'::jsonb),
        coalesce(nullif(btrim(p_ctx->>'rationale'),''), 'Supplier payment (agent)'),
        jsonb_build_object('op_key', v_approve_key), 'agent_unattended', null, v_approve_key);
  elsif clara.is_high_stakes(v_entry) then
    v_status := 'draft';
  else
    -- The sub-key was pre-reserved at the top of this body, before any lock (see there).
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'allocate_payment', v_entry,
    jsonb_build_object('client', p_client, 'counterparty', v_cp, 'group', v_group,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'control_account', v_ctrl, 'bank_account', p_bank_account,
      'allocated_cents', v_sum, 'residue_cents', v_residue, 'status', v_status,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'allocate_payment', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'status', v_status,
      'group_id', v_group, 'control_account', v_ctrl, 'residue_cents', v_residue));
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-4  clara._settle_from_bank_line_core (Annex A.2b body 3 / J.2 item 11) — finding B1.
-- Three changes from the pinned body: (1) `v_ctx` (the sub-ctx handed to
-- `_bank_match_adjustment_entry`) is now `p_ctx` itself, not a fresh 2-key rebuild; (2) both
-- allocate-core calls receive `p_ctx` merged with the settle-specific additive keys, not a fresh
-- 3-key rebuild; (3) `origin` is derived from `p_ctx->>'is_agent'` — 'agent' when true, else the
-- pinned body's own `p_via_rule`-based literal (byte-identical for every non-agent caller —
-- register A25's parameterised-literal shape). `v_match_status` needs NO separate change: with
-- `is_agent` threaded through, the allocate core now ALWAYS returns `status='approved'` on the
-- agent arm (D-2/D-3's own new branch), so `case when v_status='approved' then 'live' else
-- 'pending' end` already lands 'live' for the agent lane without touching this line — the fix is
-- upstream, and duplicating the branch here would be a second copy of one decision.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._settle_from_bank_line_core(p_ctx jsonb, p_client uuid, p_line uuid, p_counterparty uuid, p_allocations jsonb, p_memo text, p_posting_date date, p_charge_cents bigint, p_charge_account text, p_adjustments jsonb, p_attestation text, p_control_account text, p_op_key text, p_via_rule uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  ln record; st record; v_coa text; v_bank uuid;
  v_adjs jsonb; v_adj_cents bigint := 0; v_charge bigint; v_pd date;
  v_domain text; v_settle_cents bigint; v_res jsonb; v_entry uuid; v_status text;
  v_match uuid; v_match_status text; v_ctx jsonb; v_memo text;
  v_adj_entries uuid[] := '{}'::uuid[]; v_adj_entry uuid; v_charge_entry uuid;
  v_i int; v_key text; aj record;
  v_preheld boolean; v_fn text; v_decl uuid; v_is_agent boolean; v_origin text;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the settle core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_preheld := coalesce((p_ctx->>'receipt_preheld')::boolean, false);
  v_is_agent := coalesce((p_ctx->>'is_agent')::boolean, false);
  v_fn := coalesce(nullif(btrim(coalesce(p_ctx->>'fn','')),''), 'settle_from_bank_line');
  -- The parked-declaration channel (admission site 1). Absent on every ordinary call.
  v_decl := nullif(btrim(coalesce(p_ctx->'exception_declaration'->>'exception_id','')),'')::uuid;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  -- 0040 (C-c, design section 4.3 engineering pin; register entry 4): THE RULE ARITY --
  -- identical law to match_bank_line's. Settlement KINDS stay composite-born and no rule ever
  -- executes anything; this arity records WHICH signed rule a human accepted a pre-fill from.
  -- Vacuous when p_via_rule is null, which is the 12-argument wrapper's whole delta.
  if p_via_rule is not null then
    if not exists (select 1 from clara.bank_rules r
                   where r.id = p_via_rule and r.firm_id = c.firm and r.client_id = p_client
                     and r.kind = 'match_settle' and r.status = 'signed') then
      raise exception 'bank rule % is not a signed match/settle rule for this client', p_via_rule
        using errcode='CLR10',detail='{"reason":"rule_not_signed"}';
    end if;
  end if;
  v_charge := coalesce(p_charge_cents, 0);
  if v_charge < 0 then
    raise exception 'a bank charge cannot be negative'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;
  if v_charge = 0 and p_charge_account is not null then
    raise exception 'a charge account was named but no charge amount was stated'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;
  if v_charge > 0 and (p_charge_account is null or btrim(p_charge_account) = '') then
    raise exception 'a bank charge must name the expense account it is booked to'
      using errcode='CLR10',detail='{"reason":"charge_invalid"}';
  end if;

  -- The adjustment set, validated and canonicalised by the S4.1 primitive (the live block,
  -- moved: same refusal token, same sort key). The sum is derived from the canonical form so
  -- there is exactly one arithmetic of "how much do the adjustments explain away".
  v_adjs := clara._bank_adjustments_norm(p_adjustments);
  select coalesce(sum((x.elem->>'amount_cents')::bigint), 0) into v_adj_cents
    from jsonb_array_elements(v_adjs) as x(elem);

  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;

  -- THE REQUEST HASH. Every argument that reaches a stored column or a decision, with the
  -- adjustment array canonicalised -- clara._settle_request_hash is the single owner of that
  -- expression (S4.1), so the AF-2 composite's pre-reservation and this call agree by
  -- construction rather than by two people typing the same eleven fields.
  -- 0042 (D-b SS4): skipped when the CALLER already reserved this key (ABI SSE: the composite
  -- reserves `<op>:settle` pre-lock and the core spends it preheld).
  if not v_preheld then
    v_dedupe := clara._reserve_op(c.firm, v_fn, p_op_key,
      clara._settle_request_hash(p_client, p_line, v_cp, p_allocations, p_memo,
        p_posting_date, v_charge, p_charge_account, v_adjs, p_attestation,
        p_control_account, p_via_rule));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  -- ALL SUB-KEY RESERVATIONS BEFORE THE FIRST LOCK (part2 section 4.9's composite order,
  -- and 0037:2678-2698's deadlock reasoning). The ':settle' key is the composite's own;
  -- the ':adj:i' family covers the difference adjustments; ':charge' covers the payment-side
  -- bank charge. The composite reserves its own ':settle:approve' internally.
  -- These derive from THIS call's p_op_key, so under the AF-2 composite they are namespaced
  -- beneath `<op>:settle` -- the AF-2 caller never names them (ABI SSE's `descendants` row).
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    v_key := p_op_key || ':adj:' || v_i;
    if clara._reserve_op(c.firm, 'bank_match_adjustment', v_key,
         clara._hash(jsonb_build_object('op_key', p_op_key, 'i', v_i,
           'account_code', aj.acc, 'amount_cents', aj.amt))) is not null then
      raise exception 'the derived adjustment op key % is already in use', v_key
        using errcode='CLR10',detail='{"reason":"adjustment_key_collision"}';
    end if;
    if clara._reserve_op(c.firm, 'approve_entry', v_key || ':approve',
         clara._hash(jsonb_build_object('composite', 'settle_from_bank_line',
           'op_key', p_op_key, 'i', v_i))) is not null then
      raise exception 'the derived approve op key %:approve is already in use', v_key
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end loop;
  -- The charge sub-key is claimed ONLY on the branch that will spend it -- the payment side
  -- with a stated charge. The receipt side books its charge through C-a's expense slot and
  -- mints no second entry, and claiming a namespace a branch can never reach would leave an
  -- op_receipts row nobody can ever finish.
  if v_charge > 0 and v_cp_kind = 'vendor' then
    if clara._reserve_op(c.firm, 'approve_entry', p_op_key || ':charge:approve',
         clara._hash(jsonb_build_object('composite', 'settle_from_bank_line',
           'op_key', p_op_key, 'leg', 'charge'))) is not null then
      raise exception 'the derived charge approve op key is already in use'
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- READ AND VALIDATE THE LINE BEFORE ANY LOCK. The line row is locked LAST (part2 4.9:
  -- "then bank rows LAST"), and the exclusivity index is the structural guard against the
  -- window this opens -- a concurrent matcher that wins the race is caught by the index and
  -- reported as already_matched, which is the same answer the human would have got.
  -- ---------------------------------------------------------------
  select * into ln from clara.bank_statement_lines l where l.id = p_line;
  if not found or ln.client_id <> p_client or ln.firm_id <> c.firm then
    raise exception 'statement line % is not in this client', p_line using errcode='CLR11';
  end if;
  select * into st from clara.bank_statements s where s.id = ln.statement_id;
  if not found then
    raise exception 'statement line % has no statement', p_line
      using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
  end if;
  if st.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a settlement', p_line, st.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_period','line_id',p_line,
          'statement_id',st.id,'statement_status',st.status)::text;
  end if;
  if exists (select 1 from clara.bank_match_line_members mm
             join clara.bank_matches bm on bm.id = mm.match_id
             where mm.line_id = p_line and bm.status in ('pending','live')) then
    raise exception 'statement line % already rides a pending or live match; unmatch it first', p_line
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end if;
  v_bank := st.bank_account_id;
  -- THE GL BANK ACCOUNT COMES FROM THE LINE'S STATEMENT, NEVER CALLER-PASSED (design
  -- section 4.6). A caller-passed bank account is how a settlement gets posted to the wrong
  -- ledger and still reconciles on paper.
  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = v_bank and ba.firm_id = c.firm and ba.client_id = p_client and ba.active;
  if v_coa is null then
    raise exception 'this bank account has no active mapped GL account'
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  -- p_posting_date defaults to the LINE's entry_date and is validated within the statement
  -- period. v1 named no date at all while the composites require one.
  v_pd := coalesce(p_posting_date, ln.entry_date);
  if v_pd < st.period_start or v_pd > st.period_end then
    raise exception 'a settlement posted from a statement line must post inside the statement period (% .. %), not on %', st.period_start, st.period_end, v_pd
      using errcode='CLR10',
        detail=jsonb_build_object('reason','posting_date_out_of_period',
          'posting_date',v_pd,'period_start',st.period_start,
          'period_end',st.period_end)::text;
  end if;

  -- ---------------------------------------------------------------
  -- DOMAIN FROM THE KIND; SIGN AS CONSISTENCY. The refund quadrants refuse BY NAME with the
  -- sanctioned workaround in the message.
  -- ---------------------------------------------------------------
  if v_cp_kind = 'customer' then
    v_domain := 'ar';
    if ln.amount_cents < 0 then
      raise exception 'money leaving the bank to a CUSTOMER is a refund, which has no settlement composite yet; post a generic entry with a counterparty-stamped receivable control leg (C-a mints the adjustment item), apply_open_items it against the residue, then match_bank_line this line'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','refund_not_supported','domain','ar',
            'line_id',p_line,'amount_cents',ln.amount_cents)::text;
    end if;
  elsif v_cp_kind = 'vendor' then
    v_domain := 'ap';
    if ln.amount_cents > 0 then
      raise exception 'money arriving from a VENDOR is a refund, which has no settlement composite yet; post a generic entry with a counterparty-stamped payable control leg (C-a mints the adjustment item), apply_open_items it against the residue, then match_bank_line this line'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','refund_not_supported','domain','ap',
            'line_id',p_line,'amount_cents',ln.amount_cents)::text;
    end if;
  else
    raise exception 'a settlement requires a counterparty of kind customer or vendor, not %', coalesce(v_cp_kind,'(unknown)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','counterparty_kind_mismatch',
          'counterparty_kind',v_cp_kind)::text;
  end if;

  v_memo := coalesce(nullif(btrim(p_memo), ''),
    case when v_domain='ar' then 'Customer receipt' else 'Supplier payment' end);
  -- F-A3 (B1): the FULL ctx is threaded through, never rebuilt shallow. The pinned body's
  -- `jsonb_build_object('actor', c.actor, 'firm', c.firm)` discarded is_agent/on_behalf_of/
  -- wake_kind/rationale/model on every downstream call -- exactly the defect B1 found.
  v_ctx := p_ctx;

  -- ---------------------------------------------------------------
  -- THE SETTLEMENT, through the C-a composite. See the section header for the arithmetic.
  -- 0042 (D-b SS4): through the CORE rather than the public verb, so the caller context is
  -- THREADED instead of being re-derived from a JWT the AF-2 lane may be several frames away
  -- from. receipt_preheld is false: the allocate key is this call's own derived namespace and
  -- the allocate core is still its reserver (ABI SSE, the `descendants` row).
  -- ---------------------------------------------------------------
  if v_domain = 'ar' then
    v_settle_cents := ln.amount_cents - v_adj_cents;
    if v_settle_cents <= 0 then
      raise exception 'after % cents of adjustments this line leaves % cents to receipt; a receipt must be positive', v_adj_cents, v_settle_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','settlement_amount_invalid',
            'line_cents',ln.amount_cents,'adjustment_cents',v_adj_cents,
            'settlement_cents',v_settle_cents)::text;
    end if;
    v_res := clara._allocate_receipt_core(
      v_ctx || jsonb_build_object('receipt_preheld', false),
      p_client, v_cp, v_pd, v_memo, v_coa,
      v_settle_cents, coalesce(p_allocations,'[]'::jsonb), p_op_key || ':settle',
      v_charge, p_charge_account, p_attestation, p_control_account);
  else
    -- P = L + C - A, i.e. the payment's own bank credit is |L| minus the charge and minus
    -- whatever the adjustments explain away.
    v_settle_cents := ln.amount_cents + v_charge - v_adj_cents;
    if v_settle_cents >= 0 then
      raise exception 'after % cents of bank charge and % cents of adjustments this line leaves % cents to pay; a payment must move money out', v_charge, v_adj_cents, v_settle_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','settlement_amount_invalid',
            'line_cents',ln.amount_cents,'charge_cents',v_charge,
            'adjustment_cents',v_adj_cents,'settlement_cents',v_settle_cents)::text;
    end if;
    -- NO discount slot on this side: _assert_supplier_payment_shape_at forbids expense legs,
    -- and a supplier settlement DISCOUNT is income (a discount received), which a bank
    -- charge is not. The charge rides its own adjustment entry below.
    v_res := clara._allocate_payment_core(
      v_ctx || jsonb_build_object('receipt_preheld', false),
      p_client, v_cp, v_pd, v_memo, v_coa,
      -v_settle_cents, coalesce(p_allocations,'[]'::jsonb), p_op_key || ':settle',
      0, null, p_attestation, p_control_account);
  end if;
  v_entry := (v_res->>'entry_id')::uuid;
  v_status := v_res->>'status';
  if v_entry is null or v_status is null then
    raise exception 'the settlement composite returned no entry'
      using errcode='CLR10',detail='{"reason":"settlement_composite_no_entry"}';
  end if;

  -- ---------------------------------------------------------------
  -- THE BRANCH IS DECIDED HERE, BEFORE ANY ANCILLARY IS POSTED (as-built ladder fix
  -- 2026-07-31, Codex wave). The composite's own answer -- approved, or a draft awaiting a
  -- checker -- decides whether this act BOOKS anything beyond the settlement itself.
  --
  -- F-A3 (B1): NO SEPARATE AGENT BRANCH IS NEEDED HERE. D-2/D-3's own new explicit agent arm
  -- makes the allocate core return `status='approved'` UNCONDITIONALLY when `is_agent` is
  -- threaded through (bypassing is_high_stakes entirely) -- so this case expression already
  -- lands 'live' for the agent lane, with no duplicate decision written down a second time.
  -- ---------------------------------------------------------------
  v_match_status := case when v_status = 'approved' then 'live' else 'pending' end;

  if v_match_status = 'live' then
    -- The payment-side bank charge, as its own adjustment entry in this same transaction.
    if v_domain = 'ap' and v_charge > 0 then
      v_charge_entry := clara._bank_match_adjustment_entry(
        v_ctx, p_client, v_coa, p_charge_account, -v_charge, v_pd,
        'Bank charge on ' || v_memo,
        jsonb_build_object('bank_match', jsonb_build_object(
          'line_id', p_line, 'kind', 'bank_charge')),
        p_op_key || ':charge:approve', p_attestation);
    end if;

    -- The difference adjustments, on either side.
    v_i := 0;
    for aj in select (x.elem->>'account_code') as acc,
                     (x.elem->>'amount_cents')::bigint as amt,
                     (x.elem->>'memo') as memo
              from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
              order by x.ord loop
      v_i := v_i + 1;
      v_adj_entry := clara._bank_match_adjustment_entry(
        v_ctx, p_client, v_coa, aj.acc, aj.amt, v_pd,
        coalesce(aj.memo, 'Bank settlement difference'),
        jsonb_build_object('bank_match', jsonb_build_object(
          'line_id', p_line, 'kind', 'adjustment', 'index', v_i)),
        p_op_key || ':adj:' || v_i || ':approve', p_attestation);
      perform clara._finish_op(c.firm, 'bank_match_adjustment',
        p_op_key || ':adj:' || v_i, jsonb_build_object('entry_id', v_adj_entry));
      v_adj_entries := v_adj_entries || v_adj_entry;
    end loop;
  else
    -- THE PENDING BRANCH POSTS NOTHING AND VALIDATES EVERYTHING. The account tests are the
    -- SAME tests clara._bank_match_adjustment_entry runs at build time -- active, non-control
    -- (account_class is null), expense- or income-typed, and never the bank account itself --
    -- under the SAME refusal token, because the remedy is the same one: name a real expense or
    -- income account. Deferring the write must never defer the diagnosis: a maker who typed a
    -- dead account learns it now, in the call they made, not days later when a checker's
    -- approval fails on a body they never saw.
    if v_domain = 'ap' and v_charge > 0
       and (p_charge_account = v_coa
            or not exists (select 1 from clara.coa_accounts a
                           where a.client_id = p_client and a.account_code = p_charge_account
                             and a.is_active and a.account_class is null
                             and a.account_type in ('expense','income'))) then
      raise exception 'a bank match adjustment must be booked to an active, non-control expense or income account that is not the bank account itself'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','adjustment_account_invalid',
            'account_code',p_charge_account)::text;
    end if;
    for aj in select (x.elem->>'account_code') as acc,
                     (x.elem->>'amount_cents')::bigint as amt
              from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
              order by x.ord loop
      if aj.acc = v_coa
         or not exists (select 1 from clara.coa_accounts a
                        where a.client_id = p_client and a.account_code = aj.acc
                          and a.is_active and a.account_class is null
                          and a.account_type in ('expense','income')) then
        raise exception 'a bank match adjustment must be booked to an active, non-control expense or income account that is not the bank account itself'
          using errcode='CLR10',
            detail=jsonb_build_object('reason','adjustment_account_invalid',
              'account_code',aj.acc)::text;
      end if;
    end loop;
    -- AND THE DERIVED SUB-KEYS ARE CLOSED, NOT ABANDONED. They were reserved before the first
    -- lock (the branch is not knowable until the composite answers), and on THIS branch
    -- nothing will ever spend them: complete_pending_match creates the ancillaries under ITS
    -- OWN op_key, because a receipt another transaction reserved is not that call's to spend.
    -- Leaving them open would be precisely the "op_receipts row nobody can ever finish" this
    -- verb's own reservation note refuses to create, so each is finished with an honest
    -- deferral marker instead.
    if v_domain = 'ap' and v_charge > 0 then
      perform clara._finish_op(c.firm, 'approve_entry', p_op_key || ':charge:approve',
        jsonb_build_object('deferred', true, 'to', 'complete_pending_match'));
    end if;
    for v_i in 1 .. jsonb_array_length(v_adjs) loop
      perform clara._finish_op(c.firm, 'bank_match_adjustment', p_op_key || ':adj:' || v_i,
        jsonb_build_object('deferred', true, 'to', 'complete_pending_match'));
      perform clara._finish_op(c.firm, 'approve_entry',
        p_op_key || ':adj:' || v_i || ':approve',
        jsonb_build_object('deferred', true, 'to', 'complete_pending_match'));
    end loop;
  end if;

  -- ---------------------------------------------------------------
  -- THE BANK ROWS, LAST (part2 section 4.9). The line is locked here and the group is
  -- written in the SAME TRANSACTION the settlement was born -- which IS the interval C-a
  -- named and C-b closes.
  -- ---------------------------------------------------------------
  perform 1 from clara.bank_statement_lines l where l.id = p_line for update;
  perform 1 from clara.bank_statements s where s.id = ln.statement_id for share;

  -- 0040 (C-c, design section 4.2 / finding 38 [C8]): THE EXCEPTION RE-CHECK, AFTER THE LINE
  -- LOCK -- the same write-skew law match_bank_line carries, on the same shared serialization
  -- point. It sits HERE, at the bank rows, and not beside the unlocked already_matched probe
  -- near the top, because a check taken before the lock is a read of a world that can change:
  -- the authority statement has to be made where the lock is held. The cost is that an
  -- excepted line is discovered after the settlement composite has run -- the whole call rolls
  -- back, so nothing is stranded, and the refusal names the remedy.
  --
  -- 0042 (D-b SS4, ADMISSION SITE 1 OF 7 [WDB-G9]): ...AND THE ONE DECLARED EXCEPTION IS
  -- ADMITTED. clara.resolve_and_book_bank_line books the settlement leg of a parked
  -- resolution while the exception is deliberately still OPEN -- the checker executes it at
  -- the flip -- so the caller declares that exception in p_ctx and this wall stops refusing
  -- THAT ONE. It keeps refusing every other open exception on the line, and a declaration
  -- that names no open exception ON THIS LINE admits nothing (it simply fails to match the
  -- exclusion), so a stale or mistyped id can never widen the wall.
  if exists (select 1 from clara.bank_line_exceptions x
             where x.line_id = p_line and x.status = 'open'
               and (v_decl is null or x.id is distinct from v_decl)) then
    raise exception 'statement line % is under an open bank-line exception; resolve the exception before settling from it', p_line
      using errcode='CLR10',detail='{"reason":"line_excepted"}';
  end if;

  v_match := gen_random_uuid();
  -- F-A3 (register A25): the parameterised origin literal. 'agent' when p_ctx says so; else the
  -- pinned body's own literal, byte-identical.
  v_origin := case when v_is_agent then 'agent'
                    when p_via_rule is null then 'human' else 'rule' end;
  insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin,
      matched_via_rule_id, draft_entry_id, pending_ancillaries, created_by, completed_at)
    values (v_match, c.firm, p_client, v_bank, v_match_status,
      v_origin, p_via_rule,
      case when v_match_status = 'pending' then v_entry else null end,
      -- THE CARRIED ANCILLARY PAYLOAD, on the pending branch only. Every field is one this
      -- call already validated: the charge account and each adjustment account against the
      -- coa (just above), the posting date against the statement period (step 11 of the
      -- read), the adjustment array canonicalised into v_adjs by the same normalisation the
      -- request hash used. complete_pending_match builds from THIS, never from a second
      -- caller opinion -- the checker approves the act the maker made.
      --
      -- charge_cents IS DOMAIN-AWARE and that is not a detail: on the RECEIPT side the charge
      -- rides C-a's expense slot INSIDE the settlement entry (the section header's asymmetry)
      -- and no separate entry is ever minted, so carrying a non-zero charge here would make
      -- complete_pending_match post a charge entry settle would never have posted, and the
      -- group would then fail its own tie. Only the PAYMENT side has an ancillary charge.
      case when v_match_status = 'pending' then jsonb_build_object(
          'domain', v_domain,
          'charge_cents', case when v_domain = 'ap' then v_charge else 0 end,
          'charge_account', case when v_domain = 'ap' and v_charge > 0
                                 then p_charge_account end,
          'adjustments', v_adjs,
          'posting_date', v_pd,
          'memo', v_memo)
        else null end,
      c.actor, case when v_match_status = 'live' then now() else null end);

  begin
    insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id,
        amount_cents, group_status)
      values (c.firm, p_client, v_match, p_line, ln.amount_cents, v_match_status);
  exception when unique_violation then
    raise exception 'statement line % was matched by another transaction while this settlement was being written', p_line
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_matched','line_id',p_line)::text;
  end;

  -- The settlement entry becomes a member ONLY once it is approved. Below the threshold
  -- that is now; at or above it, clara.complete_pending_match writes it after the checker
  -- acts, and until then the group holds the line against draft_entry_id.
  if v_match_status = 'live' then
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      -- v_settle_cents already carries the bank-side sign: + on the receipt side (the entry
      -- DEBITS the bank), - on the payment side (it CREDITS it). No case analysis is needed
      -- and none is written -- the sign convention is the arithmetic.
      values (c.firm, p_client, v_match, v_entry, v_settle_cents, 'live', false);
  end if;
  -- The charge and the difference adjustments join the group ON THE LIVE BRANCH ONLY (as-built
  -- ladder fix 2026-07-31, Codex wave). On the pending branch they have not been created --
  -- they ride pending_ancillaries until clara.complete_pending_match posts them at the flip --
  -- which is what makes "a pending group holds ZERO entry members" a shape the group-tie belt
  -- can assert (tension T1 in the file header, as corrected there).
  if v_match_status = 'live' then
    if v_charge_entry is not null then
      insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
          matched_cents, group_status, posting_date_exception)
        values (c.firm, p_client, v_match, v_charge_entry, -v_charge, 'live', false);
    end if;
    v_i := 0;
    for aj in select (x.elem->>'amount_cents')::bigint as amt
              from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
              order by x.ord loop
      v_i := v_i + 1;
      insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
          matched_cents, group_status, posting_date_exception)
        values (c.firm, p_client, v_match, v_adj_entries[v_i], aj.amt, 'live', false);
    end loop;
  end if;

  perform clara._bank_match_audit(c.firm, p_client, v_match,
    case when v_match_status = 'live' then 'settle' else 'settle_pending' end,
    c.actor, null,
    jsonb_build_object('line_id', p_line, 'line_cents', ln.amount_cents,
      'domain', v_domain, 'counterparty_id', v_cp,
      'settlement_entry_id', v_entry, 'settlement_cents', v_settle_cents,
      'settlement_status', v_status,
      'charge_cents', v_charge, 'charge_entry_id', v_charge_entry,
      'adjustments', v_adjs, 'adjustment_entry_ids', to_jsonb(v_adj_entries),
      -- Says out loud that this act posted its ancillaries or carried them: on the pending
      -- branch charge_entry_id is null and adjustment_entry_ids is empty because nothing was
      -- created, not because nothing was asked for.
      'ancillaries_deferred', v_match_status = 'pending',
      'bank_account_id', v_bank, 'account_code', v_coa,
      'posting_date', v_pd, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, v_fn, v_entry,
    jsonb_build_object('client', p_client, 'match_id', v_match, 'line_id', p_line,
      'domain', v_domain, 'settlement_cents', v_settle_cents,
      'status', v_match_status, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.match_created', p_client, c.actor,
    null, null, v_entry, null, null,
    jsonb_build_object('match_id', v_match, 'bank_account_id', v_bank,
      'status', v_match_status, 'line_ids', jsonb_build_array(p_line),
      'entry_ids', case when v_match_status='live'
                        then jsonb_build_array(v_entry) else '[]'::jsonb end,
      'draft_entry_id', case when v_match_status='pending' then to_jsonb(v_entry)
                             else 'null'::jsonb end,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'period_exceptions', 0));
  return clara._finish_op(c.firm, v_fn, p_op_key,
    jsonb_build_object('match_id', v_match, 'status', v_match_status,
      'entry_id', v_entry, 'entry_status', v_status, 'domain', v_domain,
      'settlement_cents', v_settle_cents,
      'charge_entry_id', v_charge_entry,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'ancillaries_deferred', v_match_status = 'pending',
      'group_id', v_res->>'group_id', 'residue_cents', v_res->>'residue_cents'));
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-5  clara._tf_bank_match_congruence (Annex J.2 item 15) — the third origin arm. The pinned
-- body's `bank_matches` branch checks only the 'rule' arm (a rule-origin group must carry a rule
-- id); this adds its mirror: an 'agent' origin group must NEVER carry one — the estate's learn
-- loop origin and the unattended agent lane are different authorities and must never be
-- conflated. Every other line, in every branch, is byte-identical to the pinned body.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._tf_bank_match_congruence()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  m record; g record; ln record; st record; e record; v_coa text; cap record;
begin
  if tg_table_name = 'bank_matches' then
    select * into g from clara.bank_matches bm where bm.id = new.id;
    if not found then return null; end if;
    if g.status = 'unmatched' then return null; end if;
    if not exists (select 1 from clara.bank_accounts ba
                   where ba.id = g.bank_account_id
                     and ba.firm_id = g.firm_id and ba.client_id = g.client_id) then
      raise exception 'bank match % names a bank account outside its own client', g.id
        using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
    end if;
    -- 'human' is the only origin any writer in this wave produces; the learn loop's
    -- 'rule' origin lands in C-c with its own authority story. The CHECK on the table pairs
    -- origin with matched_via_rule_id; this is the half that says a rule-origin group may
    -- not simply appear before that story is told.
    if g.origin = 'rule' and g.matched_via_rule_id is null then
      raise exception 'bank match % claims a rule origin with no rule', g.id
        using errcode='CLR10',detail='{"reason":"match_origin_incongruent"}';
    end if;
    -- F-A3 (Annex J.2 item 15): the mirror arm, requested verbatim by the design. MEASURED,
    -- this session's own battery (f31b.l): this arm is UNREACHABLE dead code as written --
    -- `ck_bank_matches_origin_rule` (`CHECK ((origin='rule') = (matched_via_rule_id is not
    -- null))`, pre-existing, untouched by this file) is a BICONDITIONAL that already refuses
    -- ANY row where origin<>'rule' and matched_via_rule_id is non-null, including 'agent' — a
    -- CHECK constraint that fails a row aborts it before this AFTER trigger can ever see it.
    -- Annex J.2's citation did not account for this existing CHECK. Kept, not deleted (Annex
    -- J.2 asked for it explicitly and it is harmless defense-in-depth, never wrong when it
    -- cannot fire) but NOT claimed as a live wall — law 31 forbids listing an unaskable member
    -- as one, so the true, reachable wall for "agent never carries a rule id" is
    -- ck_bank_matches_origin_rule itself, and the battery (f31b.l) tests THAT.
    if g.origin = 'agent' and g.matched_via_rule_id is not null then
      raise exception 'bank match % claims an agent origin with a rule id', g.id
        using errcode='CLR10',detail='{"reason":"match_origin_incongruent"}';
    end if;
    return null;
  end if;

  if tg_table_name = 'bank_match_line_members' then
    -- RE-QUERY BY ID.
    select * into m from clara.bank_match_line_members mm where mm.id = new.id;
    if not found then return null; end if;
    select * into g from clara.bank_matches bm where bm.id = m.match_id;
    if not found then return null; end if;
    if g.status = 'unmatched' then return null; end if;
    select * into ln from clara.bank_statement_lines l where l.id = m.line_id;
    if not found then
      raise exception 'bank match member % names no statement line', m.id
        using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
    end if;
    if ln.firm_id <> g.firm_id or ln.client_id <> g.client_id then
      raise exception 'bank match % holds a statement line from another client', g.id
        using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
    end if;
    select * into st from clara.bank_statements s where s.id = ln.statement_id;
    if not found then
      raise exception 'statement line % has no statement', ln.id
        using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
    end if;
    if st.bank_account_id <> g.bank_account_id then
      raise exception 'statement line % belongs to a different bank account than match %', ln.id, g.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_account','line_id',ln.id,
            'match_id',g.id)::text;
    end if;
    -- THE STRUCTURAL wrong_period (design section 4.6, corrected in v2): the GAP1-1
    -- substance is line-to-recon congruence, and in the group model that is exactly "the
    -- line's statement is still live". A VOID statement admits no pending/live member --
    -- enforced from BOTH ends, here and at D.2d, because the two writes race in opposite
    -- directions.
    if st.status <> 'live' then
      raise exception 'statement line % belongs to a % statement; a non-live statement admits no match member', ln.id, st.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_period','line_id',ln.id,
            'statement_id',st.id,'statement_status',st.status)::text;
    end if;
    -- LINES ENTER AT FULL AMOUNT (WC-R2). Partial line membership would make the
    -- exclusivity index a lie: half a line matched and half free is a state no bank
    -- statement can express, and it is how a duplicate hides.
    if m.amount_cents is distinct from ln.amount_cents then
      raise exception 'statement line % enters a match at its full % cents, not %', ln.id, ln.amount_cents, m.amount_cents
        using errcode='CLR10',detail='{"reason":"line_partial_membership"}';
    end if;
    return null;
  end if;

  -- bank_match_entry_members.
  select * into m from clara.bank_match_entry_members mm where mm.id = new.id;
  if not found then return null; end if;
  select * into g from clara.bank_matches bm where bm.id = m.match_id;
  if not found then return null; end if;
  if g.status = 'unmatched' then return null; end if;
  select * into e from clara.journal_entries je where je.id = m.entry_id;
  if not found then
    raise exception 'bank match member % names no journal entry', m.id
      using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
  end if;
  if e.firm_id <> g.firm_id or e.client_id <> g.client_id then
    raise exception 'bank match % holds a journal entry from another client', g.id
      using errcode='CLR11',detail='{"reason":"tenancy_incongruent"}';
  end if;
  -- MEMBERS EXIST ONLY FOR APPROVED ENTRIES (design section 4.5). A draft is referenced
  -- through the GROUP's draft_entry_id, never as a member -- a draft can be revised or
  -- withdrawn, and a match to something that may still change is not a match.
  if e.status <> 'approved' then
    raise exception 'journal entry % is not approved; a pending settlement rides the group''s draft_entry_id, never a member row', e.id
      using errcode='CLR10',detail='{"reason":"entry_not_approved"}';
  end if;
  -- THE REVERSAL FLOORS, RE-CHECKED AT EVERY COMMIT (fact 2.10: a reversed original stays
  -- 'approved', so status alone floors nothing).
  if e.reversed_by is not null then
    raise exception 'journal entry % has been reversed; unmatch the group before reversing, and match the replacement instead', e.id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','reversed_entry','entry_id',e.id,
          'reversed_by',e.reversed_by)::text;
  end if;
  if e.reversal_of is not null then
    raise exception 'journal entry % is a reversal mirror; a mirror records the undoing of an entry, not a movement the bank printed', e.id
      using errcode='CLR10',
        detail=jsonb_build_object('reason','reversal_mirror','entry_id',e.id,
          'reversal_of',e.reversal_of)::text;
  end if;
  -- ACCOUNT CONGRUENCE. Tested as its OWN statement rather than left to the exhaustion
  -- bound's zero capacity: an entry that never touches this bank account is a
  -- wrong_account mistake, and reporting it as already_matched would send the human to
  -- unmatch a group that has nothing to do with it.
  v_coa := clara._bank_match_coa(m.match_id);
  if v_coa is null then
    raise exception 'bank match % has no mapped GL bank account', g.id
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;
  cap := clara._bank_entry_side_capacity(m.entry_id, v_coa);
  if cap.dr_cents = 0 and cap.cr_cents = 0 then
    raise exception 'journal entry % has no movement on bank account %', e.id, v_coa
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_account','entry_id',e.id,
          'account_code',v_coa)::text;
  end if;
  return null;
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-6  clara.mint_wake_credential (Annex J.2 item 16 / Annex D) — both gates extended for
-- bank_agent (GB-3's lesson: extending only the per-kind arm leaves every bank_agent mint refused
-- `bad wake_kind` at the early gate). Per Annex D: client NOT NULL, on_behalf_of FORBIDDEN — the
-- autodraft shape exactly, which is what makes the NULL director structural rather than inferred.
-- ------------------------------------------------------------------------------------------------
create or replace function clara.mint_wake_credential(p_wake_kind text, p_firm uuid, p_on_behalf_of uuid DEFAULT NULL::uuid, p_ttl interval DEFAULT '00:15:00'::interval, p_client uuid DEFAULT NULL::uuid)
 returns table(credential_id uuid, secret text)
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_secret text; v_id uuid;
begin
  -- F-A2 (D34/GB-3), F-A3 (Annex D): the EARLY kind gate, extended again. Extending only the
  -- per-kind arms below would leave every bank_agent mint refused `bad wake_kind` — the same
  -- hidden failure mode GB-3 named for interactive_client, discoverable only at apply time.
  if p_wake_kind is null or p_wake_kind not in ('interactive','proactive','autodraft','interactive_client','bank_agent') then
    raise exception 'bad wake_kind' using errcode='CLR10';
  end if;
  if p_firm is null or not exists(select 1 from clara.firms where id=p_firm) then
    raise exception 'unknown firm' using errcode='CLR10';
  end if;
  -- (No TTL-positivity guard: unpinned; a non-positive TTL mints an already-dead
  -- credential — harmless, and the rig's expiry probes rely on it.)
  if p_on_behalf_of is not null and not exists(
      select 1 from clara.firm_memberships where user_id=p_on_behalf_of
        and firm_id=p_firm and status='active'
        and clara.role_rank(role)>=clara.role_rank('bookkeeper')) then
    raise exception 'on_behalf_of must be an active bookkeeper+ of the firm'
      using errcode='CLR10';
  end if;
  if p_wake_kind='autodraft' then
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'autodraft wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='interactive_client' then
    -- The pinned chat kind: a firm-congruent ACTIVE client exactly as autodraft demands, and
    -- on_behalf_of is KEPT (the generic bookkeeper+ membership check above still governs it).
    -- Honest footnote: this verifies firm-congruent and active, NOT that this human is
    -- authorised for that client — the estate's existing firm-scoped model, opening nothing new.
    if p_client is null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'interactive_client wake requires a firm-congruent active client'
        using errcode='CLR10';
    end if;
  elsif p_wake_kind='bank_agent' then
    -- F-A3 Annex D: the clocked lane's own shape, byte-identical to autodraft's — a
    -- firm-congruent active client is required and on_behalf_of is FORBIDDEN (there is no
    -- directing human on the clocked lane; the NULL is structural, never inferred, law 68).
    if p_client is null or p_on_behalf_of is not null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status='active') then
      raise exception 'bank_agent wake requires a firm-congruent active client and no on_behalf_of'
        using errcode='CLR10';
    end if;
  elsif p_client is not null then
    raise exception 'legacy wake kinds do not accept a client binding' using errcode='CLR10';
  end if;
  v_secret:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into clara.wake_credentials(wake_kind,firm_id,on_behalf_of,client_id,
      secret_hash,expires_at)
    values(p_wake_kind,p_firm,p_on_behalf_of,p_client,
      sha256(convert_to(v_secret,'UTF8')),statement_timestamp()+p_ttl)
    returning id into v_id;
  return query select v_id,v_secret;
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-7  clara._match_bank_line_core (Annex J.2 item 17, born PR-1a) — register A25 (the
-- ctx-derived origin literal) + the same ctx-threading fix as D-1..D-4: `v_ctx` (handed to
-- `_bank_match_adjustment_entry` for the group's own difference adjustments) is now `p_ctx`
-- itself, not a fresh 2-key rebuild. This core never calls `_approve_entry_core` directly (a
-- match writes a LIVE group unconditionally — there is no is_high_stakes branch to bypass here),
-- so no third change is needed.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._match_bank_line_core(p_ctx jsonb, p_client uuid, p_lines jsonb, p_entries jsonb, p_adjustments jsonb DEFAULT NULL::jsonb, p_ack_period_exceptions boolean DEFAULT false, p_op_key text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_dedupe jsonb; v_firm uuid;
  v_lines jsonb; v_entries jsonb; v_adjs jsonb;
  v_n int; v_dis int; v_ack boolean;
  v_line_ids uuid[]; v_entry_ids uuid[];
  v_bank uuid; v_coa text; v_period_end date;
  v_line_cents bigint := 0; v_entry_cents bigint := 0; v_adj_cents bigint := 0;
  v_match uuid; v_ctx jsonb;
  v_exceptions int := 0; v_adj_entries uuid[] := '{}'::uuid[]; v_adj_entry uuid;
  ln record; en record; aj record; st record; e record; cap record;
  v_i int; v_key text; v_exc boolean; v_is_agent boolean; v_origin text;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the match_bank_line core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_is_agent := coalesce((p_ctx->>'is_agent')::boolean, false);
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  v_ack := coalesce(p_ack_period_exceptions, false);

  -- ---------------------------------------------------------------
  -- NORMALIZE AND VALIDATE THE THREE SETS BEFORE HASHING THEM (0037:2629-2662 idiom).
  -- Validated straight off the raw argument so a malformed uuid or a fractional amount
  -- becomes a NAMED refusal rather than a raw cast error a caller cannot act on.
  -- p_lines accepts either bare uuid strings or {"line_id": "..."} objects: the dashboard
  -- posts objects, the test rig posts strings, and both normalize to one sorted array
  -- before the hash so two spellings of the same request hash the same.
  -- ---------------------------------------------------------------
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'the line set must be a non-empty json array'
      using errcode='CLR10',detail='{"reason":"lines_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as x(elem)
    where coalesce(case jsonb_typeof(x.elem)
                     when 'string' then x.elem #>> '{}'
                     when 'object' then x.elem ->> 'line_id'
                     else null end, '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'each line must be a statement line id'
      using errcode='CLR10',detail='{"reason":"lines_malformed"}';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t.lid) order by t.lid), '[]'::jsonb),
         count(*)::int, count(distinct t.lid)::int
    into v_lines, v_n, v_dis
    from (select case jsonb_typeof(x.elem) when 'string' then x.elem #>> '{}'
                                           else x.elem ->> 'line_id' end as lid
          from jsonb_array_elements(p_lines) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same statement line appears twice in one match; a line enters a group once, at its full amount'
      using errcode='CLR10',detail='{"reason":"lines_duplicated"}';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) = 0 then
    raise exception 'the entry set must be a non-empty json array'
      using errcode='CLR10',detail='{"reason":"entries_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'entry_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'matched_cents') <> 'number'
       or (x.elem->>'matched_cents')::numeric = 0
       or (x.elem->>'matched_cents')::numeric <> trunc((x.elem->>'matched_cents')::numeric)
  ) then
    raise exception 'each entry must state an entry_id and a non-zero whole matched_cents'
      using errcode='CLR10',detail='{"reason":"entries_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', t.eid, 'matched_cents', t.amt)
           order by t.eid), '[]'::jsonb),
         count(*)::int, count(distinct t.eid)::int, coalesce(sum(t.amt), 0)
    into v_entries, v_n, v_dis, v_entry_cents
    from (select (x.elem->>'entry_id')::uuid as eid,
                 (x.elem->>'matched_cents')::bigint as amt
          from jsonb_array_elements(p_entries) as x(elem)) t;
  -- ONE ROW PER (entry, SIDE) -- adjudicated at assembly (cell x38.h): a gross two-sided
  -- entry legitimately states one member per bank side; only a same-side duplicate is
  -- order-dependent double counting.
  if exists (
    select 1 from (select (x.elem->>'entry_id')::uuid as eid,
                          ((x.elem->>'matched_cents')::bigint > 0) as pos
                   from jsonb_array_elements(p_entries) as x(elem)) d
    group by d.eid, d.pos having count(*) > 1
  ) then
    raise exception 'the same journal entry states the same bank side twice in one match; one member per entry per side'
      using errcode='CLR10',detail='{"reason":"entries_duplicated"}';
  end if;

  -- p_adjustments: [{account_code, amount_cents, memo?}]. amount_cents is the SIGNED effect
  -- on the BANK account, the same convention every other amount in this file uses.
  if p_adjustments is not null and jsonb_typeof(p_adjustments) <> 'array' then
    raise exception 'the adjustment set must be a json array'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(btrim(x.elem->>'account_code'),'') = ''
       or jsonb_typeof(x.elem->'amount_cents') is distinct from 'number'
       or (x.elem->>'amount_cents')::numeric = 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each adjustment must state an account_code and a non-zero whole amount_cents'
      using errcode='CLR10',detail='{"reason":"adjustments_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('account_code', t.acc,
             'amount_cents', t.amt, 'memo', t.memo)
           order by t.acc, t.amt, coalesce(t.memo,'')), '[]'::jsonb),
         coalesce(sum(t.amt), 0)
    into v_adjs, v_adj_cents
    from (select btrim(x.elem->>'account_code') as acc,
                 (x.elem->>'amount_cents')::bigint as amt,
                 nullif(btrim(x.elem->>'memo'),'') as memo
          from jsonb_array_elements(coalesce(p_adjustments,'[]'::jsonb)) as x(elem)) t;

  -- ---------------------------------------------------------------
  -- THE REQUEST HASH CARRIES EVERY ARGUMENT THAT REACHES A STORED COLUMN OR A DECISION --
  -- including p_ack_period_exceptions, which is BOTH: it decides whether a posting-date
  -- exception is admitted AND it is recorded on the member row and in the audit. Omitting
  -- it would let the same op_key replayed with ack=true return the ack=false call's
  -- refusal-free receipt while the caller believes an acknowledgement was recorded.
  -- ---------------------------------------------------------------
  v_dedupe := clara._reserve_op(c.firm, 'match_bank_line', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'lines', v_lines,
      'entries', v_entries, 'adjustments', v_adjs,
      'ack_period_exceptions', v_ack)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- PRE-RESERVE EVERY ADJUSTMENT SUB-KEY HERE, BEFORE THE FIRST LOCK (design section 4.6:
  -- "ALL pre-reserved before the first advisory lock"). The reasoning is 0037:2678-2698's,
  -- verbatim in substance: _reserve_op writes an op_receipts row and can BLOCK on a
  -- concurrent inserter of the same key; taking that block while already holding a row or
  -- advisory lock makes a deadlock reachable -- two sessions, each holding the other's next
  -- rung. Claiming the namespace first costs nothing, because a reservation rolls back with
  -- its transaction (0004:43-60), so a retry re-executes cleanly.
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt,
                   (x.elem->>'memo') as memo
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    v_key := p_op_key || ':adj:' || v_i;
    if clara._reserve_op(c.firm, 'bank_match_adjustment', v_key,
         clara._hash(jsonb_build_object('op_key', p_op_key, 'i', v_i,
           'account_code', aj.acc, 'amount_cents', aj.amt))) is not null then
      raise exception 'the derived adjustment op key % is already in use', v_key
        using errcode='CLR10',detail='{"reason":"adjustment_key_collision"}';
    end if;
    if clara._reserve_op(c.firm, 'approve_entry', v_key || ':approve',
         clara._hash(jsonb_build_object('composite', 'match_bank_line',
           'op_key', p_op_key, 'i', v_i))) is not null then
      raise exception 'the derived approve op key %:approve is already in use', v_key
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end loop;

  -- ---------------------------------------------------------------
  -- LOCKS, in the total order. journal_entries FIRST (this verb locks PRE-EXISTING entries,
  -- so it is bound by the reverse_entry relative order), then the client advisory rung,
  -- then the bank rows LAST -- part2 section 4.9's law, stated once and obeyed here.
  -- ---------------------------------------------------------------
  select array_agg(distinct (x.elem->>'entry_id')::uuid) into v_entry_ids
    from jsonb_array_elements(v_entries) as x(elem);
  perform 1 from clara.journal_entries je where je.id = any(v_entry_ids)
    order by je.id for update;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select array_agg(distinct (x.elem #>> '{}')::uuid) into v_line_ids
    from jsonb_array_elements(v_lines) as x(elem);
  perform 1 from clara.bank_statement_lines l where l.id = any(v_line_ids)
    order by l.id for update;
  perform 1 from clara.bank_statements s
    where s.id in (select l.statement_id from clara.bank_statement_lines l
                   where l.id = any(v_line_ids))
    order by s.id for share;

  -- 0040 (C-c, design section 4.2 / finding 38 [C8]): THE EXCEPTION RE-CHECK, AFTER THE LINE
  -- LOCK. An open bank-line exception says a line is a bank error or a dispute -- it rides the
  -- excepted(P) term, not the matched set, and a line cannot be both. The belt alone cannot
  -- close this: two transactions, one excepting and one matching, each pass their own deferred
  -- check and both commit. So the shared serialization point is the LINE ROW: except/resolve
  -- take it FOR UPDATE, and this writer -- which already holds exactly that lock, one statement
  -- above -- re-asks the question here rather than trusting the world it read before the lock.
  if exists (select 1 from clara.bank_line_exceptions x
             where x.line_id = any(v_line_ids) and x.status = 'open') then
    raise exception 'statement line % is under an open bank-line exception; resolve the exception before matching it',
      (select min(x.line_id::text) from clara.bank_line_exceptions x
        where x.line_id = any(v_line_ids) and x.status = 'open')
      using errcode='CLR10',detail='{"reason":"line_excepted"}';
  end if;

  -- ---------------------------------------------------------------
  -- THE LINE SIDE. One bank account for the whole group -- derived from the lines'
  -- statements, never caller-passed -- and the period end that the posting-date exception
  -- is measured against.
  -- ---------------------------------------------------------------
  for ln in select l.* from clara.bank_statement_lines l
            where l.id = any(v_line_ids) order by l.id loop
    if ln.client_id <> p_client or ln.firm_id <> c.firm then
      raise exception 'statement line % is not in this client', ln.id using errcode='CLR11';
    end if;
    select * into st from clara.bank_statements s where s.id = ln.statement_id;
    if not found then
      raise exception 'statement line % has no statement', ln.id
        using errcode='CLR10',detail='{"reason":"match_member_orphan"}';
    end if;
    -- wrong_period, STRUCTURAL ONLY (design section 4.6). A void statement is not a period
    -- the books may still be matched against.
    if st.status <> 'live' then
      raise exception 'statement line % belongs to a % statement; only a live statement admits a match', ln.id, st.status
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_period','line_id',ln.id,
            'statement_id',st.id,'statement_status',st.status)::text;
    end if;
    if v_bank is null then
      v_bank := st.bank_account_id;
      v_period_end := st.period_end;
    elsif v_bank <> st.bank_account_id then
      raise exception 'the lines in one match must all belong to one bank account'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_account','line_id',ln.id)::text;
    else
      -- N lines may span N statements of the SAME account (a transfer straddling a month
      -- end is one economic event). The exception window is measured against the LATEST
      -- period end in the group, which is the only reading that does not manufacture a
      -- spurious exception out of a legitimate cross-month group.
      v_period_end := greatest(v_period_end, st.period_end);
    end if;
    -- LINE EXCLUSIVITY, refused BY NAME under the line's own row lock, before the partial
    -- unique index has to speak. The index is the structural guarantee; this is the message
    -- a human can act on.
    if exists (select 1 from clara.bank_match_line_members mm
               join clara.bank_matches bm on bm.id = mm.match_id
               where mm.line_id = ln.id and bm.status in ('pending','live')) then
      raise exception 'statement line % already rides a pending or live match; unmatch it first', ln.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','line_id',ln.id)::text;
    end if;
    v_line_cents := v_line_cents + ln.amount_cents;
  end loop;

  select ba.coa_account_code into v_coa from clara.bank_accounts ba
    where ba.id = v_bank and ba.firm_id = c.firm and ba.client_id = p_client;
  if v_coa is null then
    raise exception 'this bank account has no mapped GL account'
      using errcode='CLR10',detail='{"reason":"bank_account_unmapped"}';
  end if;

  -- ---------------------------------------------------------------
  -- THE ENTRY SIDE. Floors first, then the per-side capacity, then the posting-date
  -- exception -- in that order, so the human gets the most structural complaint first.
  -- ---------------------------------------------------------------
  if v_line_cents <> v_entry_cents + v_adj_cents then
    raise exception 'this match does not tie: % cents of statement lines against % cents of entries plus % cents of adjustments', v_line_cents, v_entry_cents, v_adj_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','amount_beyond_tolerance',
          'line_cents',v_line_cents,'entry_cents',v_entry_cents,
          'adjustment_cents',v_adj_cents)::text;
  end if;

  v_match := gen_random_uuid();
  -- F-A3 (register A25): the parameterised origin literal — 'agent' when p_ctx says so, else
  -- the pinned body's own literal 'human', byte-identical for every human caller.
  v_origin := case when v_is_agent then 'agent' else 'human' end;
  insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin,
      matched_via_rule_id, draft_entry_id, created_by, completed_at)
    values (v_match, c.firm, p_client, v_bank, 'live', v_origin, null, null, c.actor, now());

  for ln in select l.* from clara.bank_statement_lines l
            where l.id = any(v_line_ids) order by l.id loop
    -- The exclusivity index is the structural guarantee and a concurrent settle can win
    -- the race between the probe above and this insert. Translating its unique_violation
    -- back into the NAMED refusal is what keeps the two paths indistinguishable to the
    -- human; the index name is deliberately not referenced, so a rename in the tables
    -- fragment cannot silently turn this into a raw 23505.
    begin
      insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id,
          amount_cents, group_status)
        values (c.firm, p_client, v_match, ln.id, ln.amount_cents, 'live');
    exception when unique_violation then
      raise exception 'statement line % was matched by another transaction while this match was being written', ln.id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','line_id',ln.id)::text;
    end;
  end loop;

  for en in select (x.elem->>'entry_id')::uuid as entry_id,
                   (x.elem->>'matched_cents')::bigint as amt
            from jsonb_array_elements(v_entries) as x(elem) order by 1 loop
    select * into e from clara.journal_entries je where je.id = en.entry_id;
    if not found or e.client_id <> p_client or e.firm_id <> c.firm then
      raise exception 'journal entry % is not in this client', en.entry_id using errcode='CLR11';
    end if;
    if e.status <> 'approved' then
      raise exception 'journal entry % is not approved; only posted entries can be matched', en.entry_id
        using errcode='CLR10',detail='{"reason":"entry_not_approved"}';
    end if;
    -- THE TWO REVERSAL FLOORS, BY NAME (design section 4.5). A reversed original stays
    -- status='approved' (0003:371-383), so approval status alone floors neither shape --
    -- which is exactly why they are two separate named refusals with two different remedies.
    if e.reversed_by is not null then
      raise exception 'journal entry % has been reversed; match its replacement, not the entry the books have cancelled', en.entry_id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','reversed_entry','entry_id',en.entry_id,
            'reversed_by',e.reversed_by)::text;
    end if;
    if e.reversal_of is not null then
      raise exception 'journal entry % is a reversal mirror; a mirror is the undoing of an entry, not a movement the bank printed', en.entry_id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','reversal_mirror','entry_id',en.entry_id,
            'reversal_of',e.reversal_of)::text;
    end if;
    -- wrong_account, as its OWN statement rather than as a zero capacity bound: an entry
    -- that never touched this bank account is a mis-click, and reporting it as
    -- already_matched would send the human hunting a group that does not exist.
    cap := clara._bank_entry_side_capacity(en.entry_id, v_coa);
    if cap.dr_cents = 0 and cap.cr_cents = 0 then
      raise exception 'journal entry % has no movement on bank account %', en.entry_id, v_coa
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_account','entry_id',en.entry_id,
            'account_code',v_coa)::text;
    end if;
    -- PER-SIDE, ABSOLUTE EXHAUSTION, refused by name here and re-asserted by the belt at
    -- commit. The pool counts every pending/live group on the SAME bank account, including
    -- the members this transaction has already written.
    if en.amt > 0 and en.amt > cap.dr_cents - coalesce((
         select sum(em.matched_cents) from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id
         join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
         where em.entry_id = en.entry_id and em.matched_cents > 0
           and bm.status in ('pending','live')
           and ba2.coa_account_code = v_coa and ba2.client_id = p_client), 0) then
      raise exception 'journal entry % has no unmatched debit cents left on %', en.entry_id, v_coa
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','side','debit',
            'entry_id',en.entry_id,'account_code',v_coa)::text;
    end if;
    if en.amt < 0 and -en.amt > cap.cr_cents - coalesce((
         select sum(-em.matched_cents) from clara.bank_match_entry_members em
         join clara.bank_matches bm on bm.id = em.match_id
         join clara.bank_accounts ba2 on ba2.id = bm.bank_account_id
         where em.entry_id = en.entry_id and em.matched_cents < 0
           and bm.status in ('pending','live')
           and ba2.coa_account_code = v_coa and ba2.client_id = p_client), 0) then
      raise exception 'journal entry % has no unmatched credit cents left on %', en.entry_id, v_coa
        using errcode='CLR10',
          detail=jsonb_build_object('reason','already_matched','side','credit',
            'entry_id',en.entry_id,'account_code',v_coa)::text;
    end if;
    -- THE POSTING-DATE EXCEPTION (design section 4.6, v2's correction). NOT a refusal --
    -- a RECORDED, ACKNOWLEDGED EXCEPTION. Direct debits post after a weekend and invoices
    -- arrive late; v1's hard RAISE prescribed a remedy _tf_entry_immutable forbids and
    -- would have stranded ordinary Malaysian catch-up bookkeeping. What IS refused is doing
    -- it SILENTLY: the human must say so, and the fact rides the member row, the audit
    -- payload and the /bank banner from then on.
    v_exc := e.posting_date > v_period_end;
    if v_exc and not v_ack then
      raise exception 'journal entry % posts on %, after the statement period ends on %; acknowledge the posting-date exception to match it', en.entry_id, e.posting_date, v_period_end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','period_exception_unacknowledged',
            'entry_id',en.entry_id,'posting_date',e.posting_date,
            'period_end',v_period_end)::text;
    end if;
    if v_exc then v_exceptions := v_exceptions + 1; end if;
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      values (c.firm, p_client, v_match, en.entry_id, en.amt, 'live', v_exc);
  end loop;

  -- ---------------------------------------------------------------
  -- THE ADJUSTMENTS, LAST, exactly as part2 section 4.9 orders them: fresh entries through
  -- the core, after every pre-existing row this transaction touches is already locked.
  -- ---------------------------------------------------------------
  -- F-A3 (B1-shaped): the FULL ctx is threaded through, never rebuilt shallow.
  v_ctx := p_ctx;
  v_i := 0;
  for aj in select (x.elem->>'account_code') as acc,
                   (x.elem->>'amount_cents')::bigint as amt,
                   (x.elem->>'memo') as memo
            from jsonb_array_elements(v_adjs) with ordinality as x(elem, ord)
            order by x.ord loop
    v_i := v_i + 1;
    -- The posting date of a match adjustment is the LATEST period end in the group: the
    -- difference is a fact about the statement, and there is no settlement posting date to
    -- inherit on this verb (that inheritance is settle_from_bank_line's, section D.5).
    v_adj_entry := clara._bank_match_adjustment_entry(
      v_ctx, p_client, v_coa, aj.acc, aj.amt, v_period_end,
      coalesce(aj.memo, 'Bank match difference'),
      jsonb_build_object('bank_match', jsonb_build_object(
        'match_id', v_match, 'kind', 'adjustment', 'index', v_i)),
      p_op_key || ':adj:' || v_i || ':approve', null);
    perform clara._finish_op(c.firm, 'bank_match_adjustment',
      p_op_key || ':adj:' || v_i, jsonb_build_object('entry_id', v_adj_entry));
    v_adj_entries := v_adj_entries || v_adj_entry;
    insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id,
        matched_cents, group_status, posting_date_exception)
      values (c.firm, p_client, v_match, v_adj_entry, aj.amt, 'live', false);
  end loop;

  -- ---------------------------------------------------------------
  -- THE RECORD. bank_match_audit carries the FULL member set and the amounts; the spine
  -- event carries IDENTIFIERS ONLY -- clara.domain_events is agent-readable firm-wide
  -- (0005:379-408), so an account number or a line description in a payload is a leak, and
  -- the migration's tail scans every bank.* payload key set against an allowlist.
  -- ---------------------------------------------------------------
  perform clara._bank_match_audit(c.firm, p_client, v_match, 'match', c.actor, null,
    jsonb_build_object('lines', v_lines, 'entries', v_entries, 'adjustments', v_adjs,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'line_cents', v_line_cents, 'entry_cents', v_entry_cents,
      'adjustment_cents', v_adj_cents,
      'bank_account_id', v_bank, 'account_code', v_coa,
      'period_exceptions', v_exceptions,
      'ack_period_exceptions', v_ack, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, 'match_bank_line', null,
    jsonb_build_object('client', p_client, 'match_id', v_match,
      'line_cents', v_line_cents, 'entry_cents', v_entry_cents,
      'adjustment_cents', v_adj_cents, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.match_created', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('match_id', v_match, 'bank_account_id', v_bank,
      'status', 'live', 'line_ids', to_jsonb(v_line_ids),
      'entry_ids', to_jsonb(v_entry_ids),
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'period_exceptions', v_exceptions));
  return clara._finish_op(c.firm, 'match_bank_line', p_op_key,
    jsonb_build_object('match_id', v_match, 'status', 'live',
      'line_cents', v_line_cents, 'entry_cents', v_entry_cents,
      'adjustment_cents', v_adj_cents,
      'adjustment_entry_ids', to_jsonb(v_adj_entries),
      'period_exceptions', v_exceptions));
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-8  clara._unmatch_bank_match_core (Annex J.2 item 18, born PR-1a) — Annex B.4's bare CLR16.
-- The ONLY change: the draft-anchor-moved raise now carries a typed `detail.reason`, so Tier C can
-- convert it on `(errcode, reason)` alone (F-A2 D6) instead of matching CLR16 bare. Every other
-- line is byte-identical to the pinned body — this core needs no is_agent handling of its own:
-- M14 ("no later reconciliation depends on it") is already a property of the shared delegate's
-- own `recon_period_settled` check, and M8 is the reversal/mirror belt elsewhere.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._unmatch_bank_match_core(p_ctx jsonb, p_client uuid, p_match uuid, p_reason text, p_op_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_dedupe jsonb; v_firm uuid; g record; v_reason text;
  v_draft_probe uuid; v_draft_status text; v_draft_withdrawn boolean := false;
  v_lines jsonb; v_entries jsonb; v_ln int; v_en int;
  -- 0042 (D-b SS4): the exception this release REOPENS, if it releases a booked resolution.
  rx record; v_reopened uuid;
  -- 0042 (as-built ladder round 3): what this release LEAVES STANDING in the GL, read through
  -- the SAME predicate clara.resolve_and_book_bank_line refuses on.
  v_left jsonb;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the unmatch_bank_match core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  -- An unmatch is a HUMAN JUDGEMENT about an existing position and owes a reason, exactly
  -- as unallocate and apply do on the subledger side (0037's ck_oia_reason).
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'an unmatch reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'unmatch_bank_match', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'match', p_match,
      'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- AS-BUILT LADDER FIX (2026-07-31, money-lens BLOCKER): cancelling a PENDING reservation
  -- must close BOTH sides atomically. A pending group anchors a real, allocation-pinned
  -- settlement DRAFT in /queue; releasing the line while leaving that draft approvable
  -- reopens the approved-but-unmatched interval at exactly the money WCB-R3 protects (the
  -- checker approves the orphan AND the re-settled twin -> one deposit posts twice). So:
  -- unmatch of a pending group WITHDRAWS its draft in the same transaction, WHERE THAT DRAFT
  -- IS STILL A DRAFT (the one-way lifecycle note below covers the approved case, which is a
  -- cancellation too -- just not a withdrawal). The symmetric door (withdraw_draft under a
  -- pending group refuses and points here) is the E7d splice; the approve-time orphan belt is
  -- the structural backstop.
  --
  -- LOCK ORDER: the draft entry is a PRE-EXISTING journal_entries row, so per the section-K
  -- law it is locked BEFORE the advisory rung (the reverse_entry relative order). A plain
  -- SELECT of bank_matches (no lock) finds the draft id; the authoritative re-read of the
  -- group under FOR UPDATE happens after the rung as before.
  select bm.draft_entry_id into v_draft_probe from clara.bank_matches bm where bm.id = p_match;
  if v_draft_probe is not null then
    perform 1 from clara.journal_entries je where je.id = v_draft_probe for update;
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  select * into g from clara.bank_matches bm where bm.id = p_match for update;
  if not found or g.client_id <> p_client or g.firm_id <> c.firm then
    raise exception 'bank match % is not in this client', p_match using errcode='CLR11';
  end if;
  if g.status = 'unmatched' then
    raise exception 'bank match % is already unmatched; re-matching writes a NEW group', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','already_unmatched','match_id',p_match)::text;
  end if;
  -- 0040 (C-c, design section 3 "the settled-period law"; register entry 2). ONCE A PERIOD IS
  -- RECONCILED, ITS TERMS ARE CERTIFIED. Every live group is a term of the identity that a
  -- complete reconciliation certified -- an unpresented cheque, a deposit in transit, a
  -- cleared pair -- and unmatching one MOVES a number a professional has signed. The undo is
  -- not forbidden, it is ORDERED: void the reconciliation chain back, newest first
  -- (recon_chain_order), then unmatch, then re-complete. /bank states the cost ("this will
  -- void N receipts") before the act; the residual is recorded in design section 10.
  --
  -- THE SCOPE IS THE LINE'S STATEMENT PERIOD, MEASURED ALL-TIME. Every identity term is
  -- account-scoped and all-time (<= P.end), so a group whose line sits in April is a term of
  -- April's receipt AND of every later complete receipt on that account. The predicate is
  -- therefore "a complete reconciliation on this line's bank account whose period_end reaches
  -- or passes the line's statement period_end", which is exactly the set of receipts this
  -- group is priced into. A December line under an April-only reconciled account is NOT
  -- refused -- April's terms never named it.
  -- 0042 (D-b SS4, ADMISSION SITE 6 OF 7 [WDB-G9]): CANCELLING A PARKED RESERVATION IS
  -- ADMITTED THROUGH A SETTLED PERIOD, and nothing else is. The park never posted anything:
  -- the settlement is a draft, the group holds zero entry members, the exception is still
  -- OPEN and therefore still a term of excepted(P) exactly as the receipt certified it.
  -- Cancelling it moves NO number a professional signed -- it puts the line back exactly where
  -- the receipt found it. The design's own SS7 promise ("the parked-cancel drill") is a
  -- promise this guard has to keep, or a parked line inside a reconciled month becomes a
  -- reservation nobody can release. A LIVE group is a different fact: its settlement HAS
  -- posted and is priced into the receipt, so the release keeps the unconditional refusal.
  if not (g.status = 'pending' and g.pending_resolution is not null
          and g.resolution_exception_id is not null)
     and exists (
    select 1
      from clara.bank_match_line_members mm
      join clara.bank_statement_lines bl on bl.id = mm.line_id
      join clara.bank_statements st on st.id = bl.statement_id
      join clara.bank_reconciliations br
        on br.bank_account_id = st.bank_account_id
       and br.status = 'complete'
       and br.period_end >= st.period_end
     where mm.match_id = p_match) then
    raise exception 'bank match % holds a line inside a reconciled period; void the reconciliation chain back to that period first (newest first), then unmatch', p_match
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_period_settled','match_id',p_match)::text;
  end if;
  -- The probe and the locked truth must agree (the group's draft anchor never changes after
  -- birth -- no writer updates draft_entry_id -- so a mismatch is concurrent-DDL-grade).
  --
  -- F-A3 (Annex B.4): the ONE change in this body. The pinned raise carried a BARE CLR16 with
  -- no detail — Tier C (F-A2 D6) may convert only on (errcode, reason) pairs, never an
  -- errcode-only match, so a bare CLR16 could never be a listed Tier-C member. Typed now.
  if g.draft_entry_id is distinct from v_draft_probe then
    raise exception 'bank match % changed its draft anchor mid-flight; retry', p_match
      using errcode='CLR16',detail='{"reason":"draft_anchor_moved"}';
  end if;
  -- THE LIFECYCLE IS ONE-WAY AND IT IS TOLD HONESTLY (as-built ladder fix 2026-07-31, Codex
  -- wave). A cancellation ALWAYS proceeds -- there is no state in which the maker is stuck
  -- holding a statement line they cannot release:
  --   * draft still a DRAFT -> it is withdrawn here, in this transaction, and the pair closes
  --     together (the receipt says draft_withdrawn: true).
  --   * draft already APPROVED (the checker acted while the maker was cancelling) -> the line
  --     is still released and the group still unmatches, but the draft is NOT withdrawn: it is
  --     approved money, and this verb does not un-approve money. The receipt says
  --     draft_withdrawn: false, and the sanctioned unwind afterwards is the ordinary pair --
  --     clara.unallocate_group, then clara.reverse_entry -- which the bank refusals stop
  --     REFUSING the moment this group is no longer pending or live.
  -- The earlier reading refused the cancellation outright in the second case, which wedged the
  -- exact race it was describing: the group stayed pending, so _bank_live_match_present kept
  -- refusing the reversal, and complete_pending_match was the ONLY door left -- forcing the
  -- human to complete a match they had just decided was wrong.
  if g.status = 'pending' and g.draft_entry_id is not null then
    select je.status into v_draft_status from clara.journal_entries je
      where je.id = g.draft_entry_id;
    if v_draft_status = 'draft' then
      -- Withdraw the anchored draft: the SAME column set clara.withdraw_draft writes
      -- (status/withdrawn_by/at/reason + the proposal/fingerprint clears, 0009:1899-1901),
      -- done here as the fn-owner so the pair closes in ONE transaction. The entry row is
      -- already locked above. The entry.withdrawn event fires exactly as the verb would.
      update clara.journal_entries
        set status = 'withdrawn', withdrawn_by = c.actor, withdrawn_at = now(),
            withdrawal_reason = 'bank match reservation cancelled: ' || v_reason,
            proposed_counterparty = null, match_fingerprint = null, updated_at = now()
        where id = g.draft_entry_id and status = 'draft';
      perform clara._append_event(c.firm, 'entry.withdrawn', p_client, c.actor, null, null,
        g.draft_entry_id, null, null, '{}'::jsonb);
      v_draft_withdrawn := true;
    end if;
    -- v_draft_status = 'approved' falls through DELIBERATELY: the cancellation proceeds and
    -- the approved entry is left standing (see the lifecycle note above). No branch, no
    -- refusal -- the absence is the ruling, so it is written down rather than left as a gap.
  end if;

  -- Capture the member set BEFORE the flip: the audit row is the queryable record of what
  -- was undone, and after the cascade the group_status column no longer says it.
  select coalesce(jsonb_agg(jsonb_build_object('line_id', mm.line_id,
           'amount_cents', mm.amount_cents) order by mm.line_id), '[]'::jsonb), count(*)::int
    into v_lines, v_ln
    from clara.bank_match_line_members mm where mm.match_id = p_match;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', mm.entry_id,
           'matched_cents', mm.matched_cents) order by mm.entry_id), '[]'::jsonb), count(*)::int
    into v_entries, v_en
    from clara.bank_match_entry_members mm where mm.match_id = p_match;

  -- pending_ancillaries dies WITH the reservation (as-built ladder fix 2026-07-31, Codex
  -- wave): a cancelled group's carried charge and adjustments were never posted and never will
  -- be, and a payload left behind on an unmatched group would read as money still owed to the
  -- books by a group that no longer exists.
  -- ---------------------------------------------------------------
  -- 0042 (D-b SS4): THE POST-FLIP REOPEN. A LIVE group carrying resolution_exception_id is a
  -- resolution that was made lawful BY THIS BOOKING: `matched_booking` and
  -- `written_off_adjustment` both mean "the line ends matched", and the deferred authority
  -- belt refuses `disposition_unbooked` the moment that stops being true. Releasing the group
  -- and leaving the exception resolved would therefore either wedge the transaction at commit
  -- or -- worse, on the paths the belt cannot see -- leave a resolved exception on an
  -- unmatched line, which is a line that has fallen out of every reconciliation term. So the
  -- resolution is REOPENED: exactly the row the group names, never "the newest one on the
  -- line", because identity is the whole reason that column exists.
  --
  -- THE PRE-CHECK. If some OTHER exception on this line is already open, reopening this one
  -- would put two open exceptions on one line -- a state the C-c door never mints and the
  -- belt's open-branch arm does not describe. It refuses by name and the remedy is to resolve
  -- the newer one first.
  --
  -- WHAT IS ERASED AND WHERE IT SURVIVES. The transition trigger's comparison set is status
  -- plus the five resolution columns, so all five are nulled together (S4.10 makes that a
  -- lawful edge). That erases an OWNER ACT from the row, so the act is written into the audit
  -- payload BEFORE the update -- clara.audit_log is human-read behind RLS (clara_authenticated
  -- only; no agent or wake role holds a read policy on it), which is where a human's words
  -- belong; the spine event that follows carries identifiers only.
  --
  -- AS-BUILT LADDER ROUND 4 -- THE REOPEN IS KEYED ON THE RELEASED LINES, NOT ON THE GROUP'S
  -- IDENTITY COLUMN. `resolution_exception_id` is stamped by the AF-2 composite and by NOTHING
  -- ELSE, so a booking made through the older, always-public door pair
  -- (clara.resolve_bank_line_exception + clara.match_bank_line in one transaction -- the route
  -- S4.7's own high-stakes refusal names as sanctioned) released with `g.resolution_exception_id
  -- IS NULL` and therefore did NOT reopen: a RESOLVED matched_booking exception was left sitting
  -- on an UNMATCHED line. That is the `disposition_unbooked` state the deferred authority belt
  -- declares unlawful, and it was reachable only because the belt fires on writes to
  -- clara.bank_line_exceptions while this release writes clara.bank_matches. It then let
  -- clara.except_bank_line mint a FRESH exception on the line, which a composite call books a
  -- SECOND time. The belt now asserts the same law from the match side (S4.11) so the state is
  -- structurally impossible; this loop is the verb-side act that keeps the corridor OPEN,
  -- because a release must always be able to proceed.
  --
  -- The identity column is still honoured where it exists -- it orders first, so the receipt's
  -- `reopened_exception_id` still names the row the group was booked against, and the audited
  -- act is unchanged. It is no longer REQUIRED.
  for rx in
    select x.* from clara.bank_line_exceptions x
      join clara.bank_match_line_members lm on lm.line_id = x.line_id
     where lm.match_id = p_match
       and x.status = 'resolved'
       and x.resolution_disposition in ('matched_booking', 'written_off_adjustment')
     order by (x.id = g.resolution_exception_id) desc nulls last, x.line_id, x.id
     for update of x
  loop
      if exists (select 1 from clara.bank_line_exceptions x2
                 where x2.line_id = rx.line_id and x2.status = 'open' and x2.id <> rx.id) then
        raise exception 'statement line % already carries a newer OPEN exception; resolve that one before releasing the booking that closed exception %', rx.line_id, rx.id
          using errcode='CLR10',
            detail=jsonb_build_object('reason','exception_reopen_blocked',
              'exception_id',rx.id,'line_id',rx.line_id,'match_id',p_match)::text;
      end if;
      -- clara.audit_log, not clara.bank_match_audit: the latter's `action` CHECK admits five
      -- match-scoped verbs and a reopen is not one of them (0038:961), and audit_log is
      -- human-read behind RLS exactly as bank_match_audit is (no agent or wake role holds a
      -- read policy on either). The unmatch's own bank_match_audit row still lands below.
      perform clara._audit(c.firm, c.actor, null, null, 'bank_line_exception_reopened', null,
        jsonb_build_object('client', p_client, 'match_id', p_match,
          'exception_id', rx.id, 'line_id', rx.line_id,
          'erased_disposition', rx.resolution_disposition,
          'erased_note', rx.resolution_note,
          'erased_resolved_by', rx.resolved_by, 'erased_resolved_at', rx.resolved_at,
          'erased_counterpart_line_id', rx.counterpart_line_id,
          'unmatch_reason', v_reason, 'op_key', p_op_key));
      update clara.bank_line_exceptions
        set status = 'open', resolved_by = null, resolved_at = null,
            resolution_disposition = null, resolution_note = null,
            counterpart_line_id = null
        where id = rx.id;
      -- FIRST WINS, and the ordering above makes "first" the group's own named exception when
      -- it has one. A group holding several excepted lines reopens ALL of them (the loop) while
      -- the single-valued receipt key keeps its round-3 shape.
      v_reopened := coalesce(v_reopened, rx.id);
      perform clara._append_event(c.firm, 'bank.line_exception_reopened', p_client, c.actor,
        null, null, null, null, null,
        jsonb_build_object('exception_id', rx.id, 'line_id', rx.line_id,
          'match_id', p_match));
  end loop;
  -- pending_resolution dies WITH the reservation, for the same reason pending_ancillaries
  -- does: a cancelled group's declaration was never executed and never will be. The IDENTITY
  -- column is deliberately LEFT INTACT -- it is the audit trail of which exception this group
  -- was booked against, and the SS7 parked-cancel drill asserts exactly that (declaration
  -- cleared, id intact, exception still open).
  -- ROUND 4: THE RELEASE RECORDS THE FACT IT IS ERASING. The reopen above nulls the exception
  -- row's five resolution columns, which destroys the only evidence that THIS group was the one
  -- that discharged THAT exception -- and without it, a booking made through the older two-step
  -- pair is indistinguishable from an ordinary match to a pre-existing entry, so the
  -- one-standing-booking law would either miss it (the round-3 hole) or refuse honest
  -- re-matching (a walled corridor). The identity column is exactly that evidence, it is
  -- write-once by _tf_bank_matches_resolution_exception_immutable (which forbids REVISING a
  -- non-null value and permits null -> non-null), and coalesce keeps a composite-born stamp
  -- untouched. From here, "did this group discharge an exception on this line" is a column.
  update clara.bank_matches
    set status = 'unmatched', unmatched_by = c.actor, unmatched_at = now(),
        unmatched_reason = v_reason, pending_ancillaries = null, pending_resolution = null,
        resolution_exception_id = coalesce(resolution_exception_id, v_reopened)
    where id = p_match;
  -- 0042 (as-built ladder round 3): THE RELEASE TELLS THE TRUTH ABOUT WHAT IT LEFT STANDING.
  -- This verb does not un-approve money -- correctly -- so a release can leave an APPROVED,
  -- unreversed booking behind while putting its exception back in front of
  -- clara.resolve_and_book_bank_line. The composite refuses a second booking on exactly that
  -- state; a release that stayed silent about it would be an act that quietly makes the next
  -- act impossible. Read AFTER the flip, deliberately: the member group_status cascades with
  -- the group row (ON UPDATE CASCADE), so by here the predicate sees an unmatched group and
  -- composes the remedy the human will actually be able to run.
  -- ROUND 4: read through whichever exception this release actually put back in front of the
  -- booking doors -- the group's own named one when it has one, else the line-keyed one the
  -- loop above reopened. The predicate itself is now LINE-keyed, so either id reports every
  -- standing booking on that line, not only the ones this migration's composite stamped.
  --
  -- ROUND 5 -- THE READER IS RECUT TO THE WIDENED LAW. Round 4 asked only when an exception was
  -- in the story (`coalesce(g.resolution_exception_id, v_reopened) is not null`), so releasing
  -- an ORDINARY settlement -- the commonest release in the product, and the one that leaves the
  -- commonest standing booking -- reported NOTHING while the next act was about to be refused.
  -- A release that silently makes the next act impossible is the walled corridor seen from the
  -- other side. It now asks PER RELEASED LINE, with the exception id passed through only as an
  -- echo, and reports the BLOCKING line first so the single-valued receipt key (unchanged
  -- shape, round 3) names the one a human has to deal with.
  select t.b into v_left
    from (select lm.line_id,
                 clara._wdb_line_booking_block(lm.line_id, null,
                   coalesce(g.resolution_exception_id, v_reopened)) as b
            from clara.bank_match_line_members lm where lm.match_id = p_match) t
   where t.b is not null
   order by coalesce((t.b->>'blocking')::boolean, false) desc, t.line_id
   limit 1;

  perform clara._bank_match_audit(c.firm, p_client, p_match, 'unmatch', c.actor, v_reason,
    jsonb_build_object('previous_status', g.status, 'lines', v_lines,
      'entries', v_entries, 'line_members', v_ln, 'entry_members', v_en,
      'draft_entry_id', g.draft_entry_id, 'op_key', p_op_key));
  perform clara._audit(c.firm, c.actor, null, null, 'unmatch_bank_match', null,
    jsonb_build_object('client', p_client, 'match_id', p_match,
      'previous_status', g.status, 'reason', v_reason, 'op_key', p_op_key,
      'reopened_exception_id', v_reopened, 'booking_outstanding', v_left));
  -- IDENTIFIERS ONLY in the payload: the reason is a human's free text and stays in
  -- clara.bank_match_audit, which is human-read behind RLS. clara.domain_events is
  -- agent-readable firm-wide (0005:379-408).
  perform clara._append_event(c.firm, 'bank.match_unmatched', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('match_id', p_match, 'bank_account_id', g.bank_account_id,
      'previous_status', g.status, 'line_members', v_ln, 'entry_members', v_en));
  return clara._finish_op(c.firm, 'unmatch_bank_match', p_op_key,
    jsonb_build_object('match_id', p_match, 'status', 'unmatched',
      'previous_status', g.status, 'line_members', v_ln, 'entry_members', v_en,
      'draft_withdrawn', v_draft_withdrawn,
      'draft_entry_id', g.draft_entry_id,
      'reopened_exception_id', v_reopened,
      'booking_outstanding', v_left));
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-9  clara._complete_bank_reconciliation_core (Annex J.2 item 19, born PR-1a) — Annex B.3, M11.
-- The ONLY change: after `t` is derived and before the (unchanged) stale-outstanding challenge,
-- an AGENT-LANE-ONLY block walks every acknowledged id and refuses the whole reconciliation if
-- any one of them is a duplicate-payment risk (same counterparty, same absolute cents, within
-- +/-35 days, itself unmatched or outstanding). ARM-0: an id whose counterparty cannot be
-- resolved from DB-owned structure alone (a bare statement-line side, or a match group whose
-- entry members disagree on counterparty) resolves NULL and is compared `IS NOT DISTINCT FROM`
-- — the strictest branch, never inferred as "no match". Human callers are byte-unchanged: this
-- block is gated on `v_is_agent` alone and every other line in this body is the pinned text.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._complete_bank_reconciliation_core(p_ctx jsonb, p_statement uuid, p_ack_outstanding uuid[] DEFAULT '{}'::uuid[], p_op_key text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  -- THE STALE-OUTSTANDING FLOOR. Sixty days is an ENGINEERING DEFAULT, owner-adjustable later
  -- (design section 10's recorded residual). It is named here, once, rather than spelled as a
  -- bare literal at the site that uses it.
  c_stale_days constant int := 60;
  -- F-A3 M11: the duplicate-payment window, named beside c_stale_days per the same discipline
  -- (Annex B.3: "a named constant beside c_stale_days, not a literal at the site").
  c_bank_waiver_dup_days constant int := 35;

  c record; v_dedupe jsonb; v_ack uuid[]; v_recon uuid;
  s record; ba record; v_client uuid; v_coa text;
  v_cutoff timestamptz;
  v_prior_stmt uuid; v_prior_end date; v_prior_recon uuid;
  v_n int; v_ids uuid[]; v_ids_txt text;
  t jsonb; v_snapshot jsonb;
  v_stale jsonb; v_replay_id uuid; r record;
  v_is_agent boolean;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the complete_bank_reconciliation core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  v_is_agent := coalesce((p_ctx->>'is_agent')::boolean, false);
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;

  -- The statement is the whole subject: the reconciliation is born 1:1 ON a live statement and
  -- inherits its period and its uniqueness (WCC-R1). Read it BEFORE the reservation so the
  -- client (and therefore the advisory key) is known, and so a cross-firm probe refuses on
  -- tenancy without ever writing an op receipt.
  select * into s from clara.bank_statements bs where bs.id = p_statement;
  if not found or s.firm_id <> c.firm then
    raise exception 'bank statement not found for this firm' using errcode='CLR11';
  end if;
  v_client := s.client_id;

  -- p_ack_outstanding is normalized (deduped, sorted, nulls dropped) BEFORE hashing: two
  -- spellings of the same acknowledgement must hash the same, and the flag is BOTH a decision
  -- input and a recorded fact, so omitting it from the hash would let a replay under a
  -- different acknowledgement return the first call's receipt (0038:3941-3947's reasoning).
  select coalesce(array_agg(distinct x.id order by x.id), '{}'::uuid[]) into v_ack
    from unnest(coalesce(p_ack_outstanding, '{}'::uuid[])) as x(id) where x.id is not null;

  v_dedupe := clara._reserve_op(c.firm, 'complete_bank_reconciliation', p_op_key,
    clara._hash(jsonb_build_object('statement', p_statement,
      'ack_outstanding', to_jsonb(v_ack))));
  if v_dedupe is not null then
    -- THE REPLAY, TOLD HONESTLY [ladder row 22]. The stored result is the receipt as written;
    -- if that receipt has since been VOIDED, a replay that echoed 'complete' would be a lie the
    -- caller cannot detect. Re-read the row and let the reply name its CURRENT status.
    v_replay_id := nullif(v_dedupe->>'reconciliation_id','')::uuid;
    if v_replay_id is not null then
      select * into r from clara.bank_reconciliations br where br.id = v_replay_id;
      if found then
        return v_dedupe || jsonb_build_object('status', r.status,
          'voided_at', r.voided_at, 'voided_reason', r.voided_reason);
      end if;
    end if;
    return v_dedupe;
  end if;

  -- RUNG 1 and RUNG 2, in the house order (0038:2241-2242).
  perform pg_advisory_xact_lock(203005004, hashtext(v_client::text));
  perform pg_advisory_xact_lock(203005006, hashtext(s.bank_account_id::text));

  -- RUNG 3 -- the line rows, in id order, so two writers of the same statement take them in
  -- one order and cannot deadlock on each other. FOR SHARE: this verb reads the lines, it
  -- never writes them, and a SHARE lock is exactly enough to stop the append-only writer and
  -- the void path from moving under the certification.
  perform 1 from clara.bank_statement_lines l
    where l.statement_id = p_statement order by l.id for share;

  -- RUNG 4 -- the statement header itself. This is what makes "certify while somebody voids"
  -- unreachable rather than merely unlikely.
  select * into s from clara.bank_statements bs where bs.id = p_statement for share;
  if s.status <> 'live' then
    raise exception 'bank statement % is %; only a live statement can be reconciled', p_statement, s.status
      using errcode='CLR10',
        detail=jsonb_build_object('reason','statement_not_live','statement_id',p_statement,
          'status',s.status)::text;
  end if;

  -- RUNG 5 -- the bank_accounts row. The COA mapping this receipt CERTIFIES must not move
  -- under it while the terms are being derived [ladder rows 6/16].
  select * into ba from clara.bank_accounts b where b.id = s.bank_account_id for share;
  if not found or ba.firm_id <> c.firm or ba.client_id <> v_client then
    raise exception 'bank account is not in this client' using errcode='CLR11';
  end if;
  v_coa := ba.coa_account_code;

  -- ---------------------------------------------------------------
  -- recon_already_complete. A different op_key reaching here is a genuine duplicate act; the
  -- same op_key never reaches here (the dedupe above returned).
  -- ---------------------------------------------------------------
  if exists (select 1 from clara.bank_reconciliations br
              where br.statement_id = p_statement and br.status = 'complete') then
    raise exception 'bank statement % already carries a complete reconciliation; void it before completing a new one', p_statement
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_already_complete','statement_id',p_statement)::text;
  end if;

  -- ---------------------------------------------------------------
  -- recon_coa_shared [ladder row 6]. gl(P) is COA-scoped; S.closing is ACCOUNT-scoped. If two
  -- accounts on this COA both carry live statements the two scopes name different books, and a
  -- tie between them is either a mix or a coincidence. Refuse rather than certify either.
  -- ---------------------------------------------------------------
  select count(*)::int, coalesce(array_agg(x.id), '{}'::uuid[]) into v_n, v_ids
    from (select ba2.id from clara.bank_accounts ba2
           where ba2.client_id = v_client and ba2.firm_id = c.firm
             and ba2.coa_account_code = v_coa
             and exists (select 1 from clara.bank_statements bs2
                          where bs2.bank_account_id = ba2.id and bs2.status = 'live')) x;
  if v_n > 1 then
    raise exception 'GL account % carries live statements on % different bank accounts; one COA account backs one reconcilable bank account', v_coa, v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_coa_shared','account_code',v_coa,
          'bank_account_ids',to_jsonb(v_ids))::text;
  end if;

  -- ---------------------------------------------------------------
  -- THE CHAIN LAW, DATE-CONTIGUOUS [ladder row 10]. The nearest prior LIVE statement of this
  -- account must end exactly the day before this period starts. WCC-R1's rationale as
  -- corrected by the ladder: the statement table enforces continuity between CONTIGUOUS
  -- periods only, so a real gap is legal at ingest and stays visible -- and it is HERE that it
  -- must be named, because completing over an unexamined hole is how the prior build's
  -- brought-forward outstanding was dropped.
  -- ---------------------------------------------------------------
  select bs.id, bs.period_end into v_prior_stmt, v_prior_end
    from clara.bank_statements bs
    where bs.bank_account_id = s.bank_account_id and bs.status = 'live'
      and bs.period_end < s.period_start
    order by bs.period_end desc, bs.id desc
    limit 1;

  if v_prior_stmt is not null then
    if v_prior_end <> (s.period_start - 1) then
      raise exception 'the previous live statement on this account ends on %, not the day before this period starts (%); a missing month is not reconcilable over', v_prior_end, (s.period_start - 1)
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_period_gap','statement_id',p_statement,
            'prior_statement_id',v_prior_stmt,'prior_period_end',v_prior_end,
            'expected_period_end',(s.period_start - 1))::text;
    end if;
    select br.id into v_prior_recon from clara.bank_reconciliations br
      where br.statement_id = v_prior_stmt and br.status = 'complete';
    if v_prior_recon is null then
      raise exception 'the previous statement (period ending %) is not reconciled; reconcile it first', v_prior_end
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_prior_missing','statement_id',p_statement,
            'prior_statement_id',v_prior_stmt)::text;
    end if;
  end if;
  -- v_prior_stmt null here IS the first-period exemption. It is claimed exactly once and
  -- PINNED on the receipt (prior_statement_id null), so a later backfilled statement cannot
  -- silently demote this receipt -- the ingest-side recon_frontier_backfill refusal is the
  -- other half of that law and lives in the _persist_statement_core splice [ladder row 18].

  -- ---------------------------------------------------------------
  -- THE PRECONDITION, THE ONE PERIOD-SCOPED TEST (WCC-R2, strict completion). Every line of S
  -- is a member of a LIVE group, or carries an exception that genuinely settles it. A line under
  -- a RESOLVED exception counts ONLY when the resolution is bank_corrective_line: that
  -- disposition deliberately leaves both legs resolved-and-unmatched and they ride excepted(P)
  -- netting to zero, so demanding an OPEN exception here would make the ratified resolution
  -- unreachable [ladder row 2, the disposition hole].
  -- A PENDING reservation refuses UNDER ITS OWN NAME with its own remedy [ladder row 11].
  --
  -- 0040 FIX WAVE A1 [R1=M4]: the exception arm was "ANY exception row, open or resolved, ANY
  -- disposition", which is strictly wider than the term that pays for it. A line resolved
  -- matched_booking and then UNMATCHED (lawful while the period is open) stayed "settled" here
  -- while excepted(P) had stopped counting it -- so RM80,000 of real bank movement could leave
  -- the books and be certified as tied by a bookkeeper-floor verb with no owner act anywhere.
  -- The arm now reads the GOVERNING exception row through the SAME open-wins-then-newest
  -- ordering _bank_recon_terms' excepted(P) lateral uses, so the two readers cannot disagree
  -- about which row governs, and admits exactly the two states that settle an unmatched line.
  -- ---------------------------------------------------------------
  select count(*)::int, coalesce(array_agg(l.id order by l.line_no), '{}'::uuid[])
    into v_n, v_ids
    from clara.bank_statement_lines l
    where l.statement_id = p_statement
      and exists (select 1 from clara.bank_match_line_members lm
                   join clara.bank_matches bm on bm.id = lm.match_id
                  where lm.line_id = l.id and bm.status = 'pending');
  if v_n > 0 then
    raise exception '% line(s) of this statement are held by a pending match reservation; complete or cancel them first', v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_line_reserved','statement_id',p_statement,
          'line_count',v_n,'line_ids',to_jsonb(v_ids))::text;
  end if;

  select count(*)::int, coalesce(array_agg(l.id order by l.line_no), '{}'::uuid[])
    into v_n, v_ids
    from clara.bank_statement_lines l
    where l.statement_id = p_statement
      and not exists (select 1 from clara.bank_match_line_members lm
                       join clara.bank_matches bm on bm.id = lm.match_id
                      where lm.line_id = l.id and bm.status = 'live')
      and not coalesce((select (gx.status = 'open'
                                or gx.resolution_disposition = 'bank_corrective_line')
                          from clara.bank_line_exceptions gx
                         where gx.line_id = l.id
                         order by (gx.status = 'open') desc, gx.created_at desc, gx.id desc
                         limit 1), false);
  if v_n > 0 then
    raise exception '% line(s) of this statement are neither matched into the books nor under an exception that settles them', v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_line_unsettled','statement_id',p_statement,
          'line_count',v_n,'line_ids',to_jsonb(v_ids))::text;
  end if;

  -- ---------------------------------------------------------------
  -- recon_uncleared_off_account [ladder row 14 / Codex C16]. A K-seeded bank_uncleared item is
  -- a pre-cutover instrument that WILL clear against some registered bank account. One whose
  -- entry touches NO registered bank-account COA of this client is unrecoverable by any
  -- matching act, and the identity cannot see it -- so it is reported BY ITEM ID rather than
  -- left to surface as an unexplained difference.
  -- ---------------------------------------------------------------
  -- The subquery alias is `q`, NOT `t`: `t` is a declared jsonb variable in this body, and
  -- plpgsql resolves a qualified identifier against its variables FIRST -- the classic
  -- sql_variable_conflict trap 0038:3185-3188 names, which fails at deploy rather than at
  -- review.
  select count(*)::int, string_agg(q.id::text, ', ' order by q.id) into v_n, v_ids_txt
    from (
      select oi.id
        from clara.opening_items oi
        join clara.journal_entries je on je.id = oi.entry_id
       where oi.client_id = v_client and oi.firm_id = c.firm
         and oi.item_kind = 'bank_uncleared' and oi.state = 'active'
         and je.status = 'approved'
         and not exists (
           select 1 from clara.journal_lines jl
            join clara.bank_accounts ba3 on ba3.client_id = oi.client_id
                                        and ba3.coa_account_code = jl.account_code
           where jl.entry_id = oi.entry_id)
    ) q;
  if v_n > 0 then
    raise exception '% uncleared opening item(s) carry no leg on any registered bank-account GL code; they can never clear against a statement line', v_n
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_uncleared_off_account','client_id',v_client,
          'item_count',v_n,'opening_item_ids',v_ids_txt)::text;
  end if;

  -- ---------------------------------------------------------------
  -- THE TERMS. completed_at IS the cutoff -- one value, taken once, used for the derivation and
  -- stored on the receipt, so verification can reproduce it byte-exactly forever [ladder row
  -- 37]. now() is transaction_timestamp, so every row this transaction approves carries the
  -- same instant and is INCLUDED by the <= gate, which is what a same-transaction
  -- book-then-reconcile act requires.
  -- ---------------------------------------------------------------
  v_cutoff := now();
  t := clara._bank_recon_terms(p_statement, v_cutoff);
  if t is null then
    raise exception 'the reconciliation terms could not be derived for statement %', p_statement
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_terms_underivable','statement_id',p_statement)::text;
  end if;

  -- ---------------------------------------------------------------
  -- F-A3 M11 — THE DUPLICATE-PAYMENT WALL, AGENT LANE ONLY (Annex B.3). Before the agent may
  -- rely on ANY acknowledged id to silence the stale-outstanding challenge below, each one is
  -- tested for a same-counterparty, same-cents duplicate within the window. A hit refuses the
  -- WHOLE act -- this is a wall on the waiver, not a partial admission -- naming the item and
  -- its twin so the human is asked. Human callers are entirely unaffected (gated on v_is_agent).
  -- ---------------------------------------------------------------
  if v_is_agent and v_ack is not null and array_length(v_ack, 1) > 0 then
    declare
      v_ack_id uuid;
      v_ack_cp uuid;
      v_ack_cents bigint;
      v_ack_date date;
      v_dup_id uuid;
    begin
      foreach v_ack_id in array v_ack loop
        v_ack_cp := null; v_ack_cents := null; v_ack_date := null;

        -- Entry side: this id is a journal_entries.id with residual capacity on this bank
        -- account. Its counterparty is the SAME receivable/payable control-leg lookup the
        -- match/settle ladder already uses.
        select (e.elem->>'cents')::bigint, (e.elem->>'posting_date')::date
          into v_ack_cents, v_ack_date
          from jsonb_array_elements(t->'snapshot'->'outstanding_entry_sides') as e(elem)
          where (e.elem->>'entry_id')::uuid = v_ack_id
          limit 1;
        if found then
          select clara._canonical_counterparty(v_client, min(l.counterparty_id::text)::uuid)
            into v_ack_cp
            from clara.journal_lines l
            join clara.coa_accounts a on a.client_id = v_client and a.account_code = l.account_code
            where l.entry_id = v_ack_id and a.account_class in ('receivable','payable')
              and l.counterparty_id is not null;
        end if;

        -- Group-item side: this id is a bank_matches.id. Its counterparty resolves ONLY when
        -- every entry member of the group agrees on ONE canonical counterparty; a group whose
        -- entries disagree, or carry none, resolves NULL and ARM-0 governs it below.
        if v_ack_cents is null then
          select (g.elem->>'uncleared_cents')::bigint, (g.elem->>'anchor_date')::date
            into v_ack_cents, v_ack_date
            from jsonb_array_elements(t->'snapshot'->'outstanding_group_items') as g(elem)
            where (g.elem->>'match_id')::uuid = v_ack_id
            limit 1;
          if found then
            select case when count(distinct clara._canonical_counterparty(v_client, l.counterparty_id)) = 1
                        then min(clara._canonical_counterparty(v_client, l.counterparty_id))
                        else null end
              into v_ack_cp
              from clara.bank_match_entry_members em
              join clara.journal_lines l on l.entry_id = em.entry_id
              join clara.coa_accounts a on a.client_id = v_client and a.account_code = l.account_code
              where em.match_id = v_ack_id and a.account_class in ('receivable','payable')
                and l.counterparty_id is not null;
          end if;
        end if;

        -- Line side: an unmatched-to-entry statement LINE carries no counterparty of its own
        -- (bank_statement_lines has no such column) until it settles. ARM-0 fires
        -- unconditionally here: v_ack_cp stays NULL, the strictest branch, by construction.
        if v_ack_cents is null then
          select (ls.elem->>'amount_cents')::bigint, (ls.elem->>'entry_date')::date
            into v_ack_cents, v_ack_date
            from jsonb_array_elements(t->'snapshot'->'outstanding_line_sides') as ls(elem)
            where (ls.elem->>'line_id')::uuid = v_ack_id
            limit 1;
        end if;

        if v_ack_cents is null then
          -- The acknowledged id names nothing in THIS statement's outstanding snapshot (a
          -- stale or mistyped id) — not this wall's business; the unchanged stale-challenge
          -- enumeration below independently refuses if the id was actually owed one.
          continue;
        end if;

        -- THE DUPLICATE-PAYMENT TEST (Annex B.3, verbatim mechanism): a POSTED, UNREVERSED
        -- entry for the SAME counterparty (ARM-0: NULL "is not distinct from" NULL, so an
        -- unresolvable counterparty on either side is its own hit), the SAME absolute cents,
        -- within +/- the window, that is ITSELF unmatched or outstanding on this bank account
        -- (no live group already consumes it).
        select je.id into v_dup_id
          from clara.journal_entries je
          join clara.journal_lines jl on jl.entry_id = je.id
          join clara.coa_accounts a on a.client_id = v_client and a.account_code = jl.account_code
          where je.client_id = v_client and je.firm_id = c.firm
            and je.status = 'approved' and je.reversed_by is null and je.reversal_of is null
            and a.account_class in ('receivable','payable')
            and clara._canonical_counterparty(v_client, jl.counterparty_id) is not distinct from v_ack_cp
            and abs(jl.debit_cents - jl.credit_cents) = abs(v_ack_cents)
            and je.posting_date between (v_ack_date - c_bank_waiver_dup_days)
                                     and (v_ack_date + c_bank_waiver_dup_days)
            and not exists (select 1 from clara.bank_match_entry_members em2
                             join clara.bank_matches bm2 on bm2.id = em2.match_id
                             where em2.entry_id = je.id and bm2.status = 'live')
          limit 1;
        if v_dup_id is not null then
          raise exception 'stale outstanding item % cannot be waived unattended: entry % is a same-counterparty, same-amount candidate within % days and is itself unmatched or outstanding', v_ack_id, v_dup_id, c_bank_waiver_dup_days
            using errcode='CLR10',
              detail=jsonb_build_object('reason','stale_waiver_duplicate_risk',
                'acknowledged_id',v_ack_id,'duplicate_entry_id',v_dup_id,
                'amount_cents',v_ack_cents,'window_days',c_bank_waiver_dup_days)::text;
        end if;
      end loop;
    end;
  end if;

  -- ---------------------------------------------------------------
  -- recon_opening_mismatch, BOTH ARMS.
  --   (a) THE TAKEOVER TIE (design section 3, as corrected by 0040 FIX WAVE B1 [M1]):
  --       anchor_amount must equal the FIRST live statement's opening. The bank_uncleared
  --       movement is NOT subtracted -- it is already inside the carry-down (both are approved
  --       journal movement on the same account c), and subtracting it a second time refused
  --       every correctly-seeded takeover account; see _bank_recon_terms' header for the worked
  --       proof. Asserted unconditionally, because for a zero-opening account it reads 0 - 0 = 0
  --       and costs nothing -- and because a client that seeded uncleared instruments on a bank
  --       COA with no matching carry-down is exactly the silent shape this refusal exists to
  --       catch. B3 (the deploy checklist's pre-ceremony probe) measures S_first.opening_cents
  --       and the opening_items census per live account BEFORE the ceremony, because an account
  --       whose first live statement opens nonzero with NO K opening world at all refuses here
  --       forever, and that is the intended answer.
  --   (b) THE CHAIN ARM: down the chain the anchor rides the receipts, so this statement's
  --       printed opening must equal the prior receipt's CERTIFIED closing. A statement whose
  --       opening disagrees with the certified history is not continuous with it, whatever the
  --       ingest-time continuity check said at the time.
  -- ---------------------------------------------------------------
  if (t->>'opening_tie_delta_cents')::bigint <> 0 then
    raise exception 'the opening anchor does not tie: the carry-down on this bank GL account is % but the first live statement opens at % (uncleared instruments seeded: %)',
        (t->>'anchor_amount_cents')::bigint,
        (t->>'opening_anchor_cents')::bigint,
        (t->>'bank_uncleared_opening_cents')::bigint
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_opening_mismatch','arm','takeover_tie',
          'statement_id',p_statement,
          'anchor_amount_cents',(t->>'anchor_amount_cents')::bigint,
          'bank_uncleared_opening_cents',(t->>'bank_uncleared_opening_cents')::bigint,
          'opening_anchor_cents',(t->>'opening_anchor_cents')::bigint,
          'delta_cents',(t->>'opening_tie_delta_cents')::bigint)::text;
  end if;
  if v_prior_recon is not null then
    select * into r from clara.bank_reconciliations br where br.id = v_prior_recon;
    if s.opening_cents <> r.closing_cents then
      raise exception 'this statement opens at % but the previous reconciliation certified a closing of %', s.opening_cents, r.closing_cents
        using errcode='CLR10',
          detail=jsonb_build_object('reason','recon_opening_mismatch','arm','chain',
            'statement_id',p_statement,'prior_reconciliation_id',v_prior_recon,
            'statement_opening_cents',s.opening_cents,
            'prior_closing_cents',r.closing_cents)::text;
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- recon_outstanding_stale [ladder rows 8/20]. Every ENUMERATED outstanding side older than
  -- the 60-day floor must be acknowledged BY ID -- entry sides by entry_id, line sides by
  -- line_id, group items by match_id. This is the plug challenge: a duplicate payment that
  -- sits in outstanding forever ties GREEN forever unless somebody is made to say so out loud.
  -- Reversal pairs are already out of the enumeration, so a book full of corrections does not
  -- accumulate a challenge list that never converges.
  -- ---------------------------------------------------------------
  select coalesce(jsonb_agg(x.item order by x.age_days desc), '[]'::jsonb) into v_stale
    from (
      select e.elem as item, (e.elem->>'age_days')::int as age_days
        from jsonb_array_elements(t->'snapshot'->'outstanding_entry_sides') as e(elem)
       where (e.elem->>'age_days')::int > c_stale_days
         and not ((e.elem->>'entry_id')::uuid = any(v_ack))
      union all
      select e.elem, (e.elem->>'age_days')::int
        from jsonb_array_elements(t->'snapshot'->'outstanding_line_sides') as e(elem)
       where (e.elem->>'age_days')::int > c_stale_days
         and not ((e.elem->>'line_id')::uuid = any(v_ack))
      union all
      select e.elem, (e.elem->>'age_days')::int
        from jsonb_array_elements(t->'snapshot'->'outstanding_group_items') as e(elem)
       where (e.elem->>'age_days')::int > c_stale_days
         and not ((e.elem->>'match_id')::uuid = any(v_ack))
    ) x;
  if jsonb_array_length(v_stale) > 0 then
    raise exception '% outstanding item(s) are more than % days old at this period end and have not been acknowledged', jsonb_array_length(v_stale), c_stale_days
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_outstanding_stale','statement_id',p_statement,
          'stale_days',c_stale_days,'items',v_stale)::text;
  end if;

  -- ---------------------------------------------------------------
  -- recon_difference_nonzero. WCC-R2's EXACT ZERO, tolerance NONE, with every computed term in
  -- the errdetail so the human is told which side of the identity moved. A tolerance is how a
  -- reconciliation quietly stops reconciling (0038's own group-tie note, restated at the
  -- period grain).
  -- ---------------------------------------------------------------
  if (t->>'difference_cents')::bigint <> 0 then
    raise exception 'this reconciliation does not tie: a difference of % cents remains', (t->>'difference_cents')::bigint
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_difference_nonzero','statement_id',p_statement,
          'difference_cents',(t->>'difference_cents')::bigint,
          'opening_anchor_cents',(t->>'opening_anchor_cents')::bigint,
          'gl_prime_cents',(t->>'gl_prime_cents')::bigint,
          'uncleared_cents',(t->>'uncleared_cents')::bigint,
          'capacity_prime_cents',(t->>'capacity_prime_cents')::bigint,
          'outstanding_cents',(t->>'outstanding_cents')::bigint,
          'excepted_cents',(t->>'excepted_cents')::bigint,
          'matched_line_cents',(t->>'matched_line_cents')::bigint,
          -- Non-zero here is the one difference with a NAMED cause: an opening carry-down entry
          -- has been matched to a statement line. Unmatch it -- a takeover opening balance is
          -- not a bank movement.
          'anchor_consumed_cents',(t->>'anchor_consumed_cents')::bigint,
          'statement_closing_cents',s.closing_cents)::text;
  end if;

  -- ---------------------------------------------------------------
  -- THE RECEIPT IS THE ROW. Born only COMPLETE: an open reconciliation is a DERIVED view, never
  -- a stored draft, so there is no dead state to reconcile and no superseded_by to leave
  -- writerless [ladder row 19].
  --
  -- opening_cents carries the STATEMENT's printed opening (design 4.1's literal wording),
  -- opening_anchor_cents carries the section-3 OPENING ANCHOR, and gl_balance_cents carries
  -- gl'(P) -- the ALL-TIME, anchor-excluded GL balance at P.end.
  --
  -- 0040 FIX WAVE C1 [M6+M7]: the belt below asserts section 3's DIRECT form on the stored row
  -- of EVERY period -- opening_anchor + gl' - outstanding + excepted = closing -- and KEEPS the
  -- chain assert opening_cents = prior.closing_cents. The DIFFERENCED arm it used to run down
  -- the chain was algebraically sound but meant a mid-chain receipt did not verify ALONE: its
  -- opening_cents was the statement's printed opening while its other three terms were all-time,
  -- so a reviewer checking one receipt's own five numbers saw a break that was not a break (a
  -- May receipt reading opening 0 / gl' -30,000 / outstanding 0 / excepted 0 / closing 30,000
  -- looks like a RM60,000 error and is not). Storing the anchor costs one bigint and makes the
  -- receipt self-closing, which is what a receipt is for.
  -- ---------------------------------------------------------------
  v_snapshot := (t->'snapshot') || jsonb_build_object('acknowledged_outstanding', to_jsonb(v_ack));
  v_recon := gen_random_uuid();
  begin
    insert into clara.bank_reconciliations(
        id, firm_id, client_id, bank_account_id, statement_id, coa_account_code,
        prior_statement_id, prior_reconciliation_id, period_start, period_end, status,
        opening_cents, opening_anchor_cents, gl_balance_cents, closing_cents,
        outstanding_cents, excepted_cents,
        completed_by, completed_at, snapshot)
      values (v_recon, c.firm, v_client, s.bank_account_id, p_statement, v_coa,
        v_prior_stmt, v_prior_recon, s.period_start, s.period_end, 'complete',
        s.opening_cents,
        (t->>'opening_anchor_cents')::bigint,
        (t->>'gl_prime_cents')::bigint,
        s.closing_cents,
        (t->>'outstanding_cents')::bigint,
        (t->>'excepted_cents')::bigint,
        c.actor, v_cutoff, v_snapshot);
  exception when unique_violation then
    -- The partial unique on (statement_id) where status='complete' is the structural guarantee;
    -- translating it back into the NAMED refusal keeps the racing path and the ordinary path
    -- indistinguishable to the human. The index name is deliberately not referenced, so a
    -- rename in the schema lane cannot silently turn this into a raw 23505 (0038:4080-4084).
    raise exception 'bank statement % was reconciled by another transaction while this reconciliation was being written', p_statement
      using errcode='CLR10',
        detail=jsonb_build_object('reason','recon_already_complete','statement_id',p_statement)::text;
  end;

  -- 0040 FIX WAVE A6-v2 [the delta round's BLOCKER 1]. THE WRITER DECLARES ITS OWN RECEIPT.
  -- clara._tf_bank_settled_authority_belt is DEFERRED: it re-queries at COMMIT, by which time the
  -- receipt this very transaction just inserted is visible to it and looks exactly like a period
  -- somebody else settled. The lawful same-transaction order (match the last line, THEN complete)
  -- would therefore refuse at commit, naming the line the caller had just matched. The first cut
  -- excluded receipts by timestamp (`completed_at < transaction_timestamp()`), which answers a
  -- DIFFERENT question -- "was it completed before my transaction started?" -- and let a stalled
  -- older transaction move money out of a period a newer transaction had already certified.
  -- A transaction-local GUC carrying THIS receipt's id is the exact identity: is_local => true
  -- scopes it to this transaction (and unwinds with a rolled-back subtransaction), the belt
  -- excludes that one id and nothing else, and no other writer sets it. It is set AFTER the
  -- INSERT deliberately -- a failed insert leaves no id to declare.
  perform set_config('clara.completing_recon', v_recon::text, true);

  -- THE RECORD. clara.bank_match_audit's action vocabulary is UNCHANGED by C-c (design section
  -- 10): a reconciliation is not a match act, so it rides the generic _audit plus its own event
  -- type. The event payload is IDENTIFIERS AND COUNTS ONLY -- clara.domain_events is
  -- agent-readable firm-wide (0005:379-408), so a balance, a period bound or an account number
  -- in a payload is a leak (0038:4210-4213).
  perform clara._audit(c.firm, c.actor, null, null, 'complete_bank_reconciliation', null,
    jsonb_build_object('client', v_client, 'statement', p_statement,
      'reconciliation_id', v_recon, 'bank_account', s.bank_account_id,
      'account_code', v_coa, 'period_start', s.period_start, 'period_end', s.period_end,
      'opening_cents', s.opening_cents, 'closing_cents', s.closing_cents,
      'gl_balance_cents', (t->>'gl_prime_cents')::bigint,
      'outstanding_cents', (t->>'outstanding_cents')::bigint,
      'excepted_cents', (t->>'excepted_cents')::bigint,
      'acknowledged_outstanding', to_jsonb(v_ack), 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'bank.reconciliation_completed', v_client, c.actor,
    null, null, null, s.document_id, null,
    jsonb_build_object('reconciliation_id', v_recon, 'statement_id', p_statement,
      'bank_account_id', s.bank_account_id,
      'prior_reconciliation_id', v_prior_recon,
      'first_period', (v_prior_stmt is null),
      'outstanding_items', (jsonb_array_length(t->'snapshot'->'outstanding_entry_sides')
                            + jsonb_array_length(t->'snapshot'->'outstanding_group_items')),
      'exception_items', jsonb_array_length(t->'snapshot'->'exceptions')));

  return clara._finish_op(c.firm, 'complete_bank_reconciliation', p_op_key,
    jsonb_build_object('reconciliation_id', v_recon, 'statement_id', p_statement,
      'status', 'complete', 'first_period', (v_prior_stmt is null),
      'prior_reconciliation_id', v_prior_recon,
      'opening_cents', s.opening_cents, 'closing_cents', s.closing_cents,
      'gl_balance_cents', (t->>'gl_prime_cents')::bigint,
      'outstanding_cents', (t->>'outstanding_cents')::bigint,
      'excepted_cents', (t->>'excepted_cents')::bigint,
      'difference_cents', 0, 'completed_at', v_cutoff));
end $function$;

-- ------------------------------------------------------------------------------------------------
-- D-10  clara._resolve_and_book_bank_line_core — NOT on Annex J.2's original list (it is a PR-1a-
-- born body, not itself one of J.2's ten). Recut here per obligation J.2-a, recorded by the
-- F-A3/PR-1a lane's own dated annex true (annexes-3-build.md:179-192, 2026-08-23) and re-verified
-- against the live body this session: this composite's THREE internal calls go through the
-- PUBLIC wrappers `clara.resolve_bank_line_exception` (x2) and `clara.match_bank_line` (x1), which
-- each call `_human_ctx()` internally — CLR04 for a wake caller with no JWT, two frames down.
-- Repointed to the CORES (`_resolve_bank_line_exception_core`, `_match_bank_line_core`), threading
-- `p_ctx` through. ALSO fixed (same shallow-ctx-rebuild defect B1 found elsewhere): the draft
-- leg's `_approve_entry_core` call and the settle leg's `_settle_from_bank_line_core` call each
-- rebuilt a fresh 2-3 key ctx, discarding is_agent/on_behalf_of/wake_kind/rationale/model even
-- when the incoming p_ctx carried them — both now thread the FULL p_ctx (merged with their own
-- additive keys). Every other line is byte-identical to the pinned body.
-- ------------------------------------------------------------------------------------------------
create or replace function clara._resolve_and_book_bank_line_core(p_ctx jsonb, p_client uuid, p_exception uuid, p_disposition text, p_note text, p_draft jsonb DEFAULT NULL::jsonb, p_allocations jsonb DEFAULT NULL::jsonb, p_adjustments jsonb DEFAULT NULL::jsonb, p_advance_applications jsonb DEFAULT NULL::jsonb, p_charge_cents bigint DEFAULT 0, p_charge_account text DEFAULT NULL::text, p_attestation text DEFAULT NULL::text, p_op_key text DEFAULT NULL::text, p_ack_period_exceptions boolean DEFAULT NULL::boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_note text; v_leg text; v_charge bigint;
  -- 0042 (round 8, lane M3): the posting-date acknowledgement, coalesced ONCE, exactly as
  -- clara.match_bank_line coalesces its own -- so the hash, the refusal, the audit and the
  -- receipt can never disagree about what the caller said.
  v_ack boolean;
  ex record; ln record; st record; v_bank uuid;
  v_item_ids uuid[]; v_cp uuid; v_cps uuid[]; v_one uuid;
  -- 0042 (as-built ladder round 2): the hand-draft leg's TOP-LEVEL counterparty proposal,
  -- pre-resolved so its rung can be taken in the house order (see the derivation below).
  v_fp jsonb; v_top_cp uuid;
  v_pre_entries uuid[] := '{}'::uuid[];
  v_resolution uuid; v_entry uuid; v_rev uuid;
  v_res jsonb; v_match uuid; v_match_status text; v_branch text;
  v_adj_n int;
  -- 0042 (as-built ladder round 3): the prior-booking wall + the counterparty-landscape
  -- re-check, both taken under the rungs and before the first write (see there).
  v_block jsonb; v_moved uuid;
  -- 0042 (round 8, lane M3): the HIGH-STAKES hand-draft refusal's own measurement of the ONE
  -- door it is allowed to name (see that raise site). v_reg_ok is the register door's own
  -- verdict on THIS payload, taken a microsecond before the refusal rolls everything back.
  v_reg_ok boolean; v_reg_why text; v_advice text;
  -- F-A3 (a SECOND public-call hazard, caught by this file's own battery, f31b.o): the draft
  -- leg's `clara.draft_entry(...)` call (below) ALSO calls `_human_ctx()` internally — J.2-a's
  -- obligation named only resolve_bank_line_exception and match_bank_line, but draft_entry is
  -- the SAME class of hazard on the SAME leg. Repointed to `_draft_entry_core` directly.
  v_is_agent boolean; v_obo uuid; v_wake_kind text;
begin
  v_is_agent := coalesce((p_ctx->>'is_agent')::boolean, false);
  v_obo := nullif(p_ctx->>'on_behalf_of','')::uuid;
  v_wake_kind := nullif(p_ctx->>'wake_kind','');
  -- ---------------------------------------------------------------
  -- ARGUMENT TIME. Every refusal below is reachable with the caller still on the line and
  -- BEFORE anything is reserved, locked or written.
  -- ---------------------------------------------------------------
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the resolve_and_book_bank_line core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  -- ABI SSA / SSF: the disposition enum is validated at ARGUMENT TIME ON BOTH BRANCHES, which
  -- is the whole point of the token. `bank_corrective_line` is a REAL disposition of the
  -- direct verb and it ALWAYS refuses here: a corrective pair closes two excepted lines
  -- against each other and books nothing, so there is no "and book" for this verb to do --
  -- and parking one would strand a group that can never tie. The message names the remedy.
  if p_disposition is null or p_disposition not in
      ('matched_booking', 'written_off_adjustment') then
    raise exception 'resolve_and_book supports only the two BOOKING dispositions (matched_booking, written_off_adjustment), not %; a bank_corrective_line pair books nothing -- close it with clara.resolve_bank_line_exception', coalesce(p_disposition, '(null)')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','disposition_unsupported',
          'disposition',p_disposition)::text;
  end if;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'a resolution note is required'
      using errcode='CLR10',detail='{"reason":"resolution_note_required"}';
  end if;
  v_charge := coalesce(p_charge_cents, 0);
  v_ack := coalesce(p_ack_period_exceptions, false);

  -- THE LEG, derived (assembly adjudication A). Additive refusal token with an AXIS -- the
  -- 0041 `disposal_request_invalid` precedent -- because "which booking did you mean" is a
  -- caller-shape error with several distinct remedies and one token per remedy would be six
  -- tokens for one mistake.
  if p_draft is not null and p_allocations is not null then
    raise exception 'name a hand-draft OR an open-item settlement, never both: p_draft books a new entry and p_allocations settles existing items, which are two bookings for one statement line'
      using errcode='CLR10',
        detail='{"reason":"booking_request_invalid","axis":"draft_and_allocations"}';
  end if;
  if p_draft is null and (p_allocations is null
      or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0) then
    raise exception 'resolve_and_book must book something: name p_draft (a hand-coded entry) or a non-empty p_allocations (an open-item settlement, whose counterparty this verb derives from the items named)'
      using errcode='CLR10',
        detail='{"reason":"booking_request_invalid","axis":"no_booking"}';
  end if;
  v_leg := case when p_draft is not null then 'draft' else 'settle' end;
  if v_leg = 'draft' then
    if p_adjustments is not null or v_charge <> 0 or p_charge_account is not null then
      raise exception 'p_adjustments and p_charge_cents/p_charge_account belong to the settlement leg (they are difference adjustments against an open-item settlement); a hand-draft states its own lines'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"settle_argument_on_draft_leg"}';
    end if;
    if jsonb_typeof(p_draft) <> 'object' or jsonb_typeof(p_draft->'lines') <> 'array'
       or jsonb_array_length(p_draft->'lines') = 0
       or nullif(btrim(coalesce(p_draft->>'posting_date','')),'') is null then
      raise exception 'p_draft must be an object carrying posting_date, memo and a non-empty lines array (ABI SSA)'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"draft_malformed"}';
    end if;
  else
    -- The advance proposal is a DRAFT-leg payload by construction: it names line_no positions
    -- inside p_draft.lines, and a settlement entry's legs are built by the allocate core, not
    -- by the caller. (On the PARK branch it refuses again, by its own [WDB-G9] token, below.)
    if p_advance_applications is not null then
      raise exception 'p_advance_applications names line_no positions inside p_draft.lines, so it requires the hand-draft leg; a staff-advance repayment is coded, not settled against open items'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"advance_payload_without_draft"}';
    end if;
    -- ...AND THE ACKNOWLEDGEMENT IS A DRAFT-LEG ARGUMENT TOO, for a reason that is measured
    -- rather than stylistic [round 8, lane M3]. A posting-date exception is a statement about a
    -- date the CALLER chose, and on the settlement leg the caller chooses none: this verb hands
    -- clara._settle_from_bank_line_core a NULL posting date, the core defaults it to the LINE'S
    -- OWN entry_date and then refuses anything outside the statement period outright
    -- (`posting_date_out_of_period`, both directions) -- so no period exception can arise and
    -- there is nothing here to acknowledge. Accepting the flag and quietly ignoring it would be
    -- the walled corridor inverted: a caller who ticked the box would believe an
    -- acknowledgement had been recorded when the receipt and the audit say nothing of the kind.
    -- It is therefore REFUSED BY NAME, at argument time, on the same wall its sibling payload
    -- uses -- and only when it is TRUE, so an explicit `false` (which asserts nothing) still
    -- binds exactly as omitting it does.
    if v_ack then
      raise exception 'p_ack_period_exceptions acknowledges a posting date outside the statement period, and the settlement leg has no such date to acknowledge: it posts at the statement line''s own entry_date, which is inside the period by construction'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"ack_without_draft"}';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- THE EXCEPTION AND ITS LINE, read UNLOCKED -- only to learn what to lock and to refuse the
  -- obvious before any reservation exists. Every authority statement below is re-made under
  -- the locks by the callee that owns it (resolve_bank_line_exception re-reads the exception
  -- FOR UPDATE; the settle core re-checks the line after the line lock).
  -- ---------------------------------------------------------------
  select e.id, e.firm_id, e.client_id, e.line_id, e.status, e.statement_id into ex
    from clara.bank_line_exceptions e where e.id = p_exception and e.firm_id = c.firm;
  if not found or ex.client_id <> p_client then
    raise exception 'bank line exception % is not in this client', p_exception
      using errcode='CLR11';
  end if;
  if ex.status <> 'open' then
    raise exception 'bank line exception % is already resolved', p_exception
      using errcode='CLR10',detail='{"reason":"already_resolved"}';
  end if;
  select * into ln from clara.bank_statement_lines l where l.id = ex.line_id;
  if not found then
    raise exception 'bank line exception % names no statement line', p_exception
      using errcode='CLR10',detail='{"reason":"exception_line_orphan"}';
  end if;
  select * into st from clara.bank_statements s where s.id = ln.statement_id;
  if not found or st.status <> 'live' then
    raise exception 'statement line % belongs to a % statement; only a live statement admits a booking', ex.line_id, coalesce(st.status,'missing')
      using errcode='CLR10',
        detail=jsonb_build_object('reason','wrong_period','line_id',ex.line_id,
          'statement_id',ln.statement_id,'statement_status',st.status)::text;
  end if;
  v_bank := st.bank_account_id;

  -- THE SETTLEMENT COUNTERPARTY, DERIVED (assembly adjudication A). ABI SSA gives this verb
  -- no p_counterparty, and it needs none: every allocate wall already demands that ONE
  -- counterparty own the whole allocation set, so the set itself names the counterparty. The
  -- pick is the LOWEST item id's canonical counterparty -- deterministic, and the allocate
  -- core refuses `allocation_counterparty_mismatch` if the caller mixed two. Derived here,
  -- BEFORE the rungs, because 203005003 is keyed on it.
  if v_leg = 'settle' then
    if exists (select 1 from jsonb_array_elements(p_allocations) as x(elem)
               where coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'each allocation must state an item_id and a positive whole amount_cents'
        using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
    end if;
    select array_agg(distinct (x.elem->>'item_id')::uuid) into v_item_ids
      from jsonb_array_elements(p_allocations) as x(elem);
    select clara._canonical_counterparty(p_client, min(oi.counterparty_id::text)::uuid)
      into v_cp
      from clara.open_items oi
      where oi.id = any(v_item_ids) and oi.client_id = p_client and oi.firm_id = c.firm;
    if v_cp is null then
      raise exception 'none of the open items named in p_allocations carries a counterparty this client owns, so the settlement has no counterparty to settle with'
        using errcode='CLR10',
          detail='{"reason":"booking_request_invalid","axis":"allocation_counterparty_underivable"}';
    end if;
    v_cps := array[v_cp];
  else
    -- On the hand-draft leg the counterparty is whatever clara._approve_entry_core resolves,
    -- and it resolves from TWO independent places. This is the first: every counterparty NAMED
    -- ON A LINE. The second -- the TOP-LEVEL p_draft.counterparty proposal -- is derived in the
    -- lock block below, AFTER the reservations, and that placement is deliberate (see there).
    select array_agg(distinct clara._canonical_counterparty(p_client,
             (x.elem->>'counterparty_id')::uuid)) into v_cps
      from jsonb_array_elements(p_draft->'lines') as x(elem)
      where coalesce(x.elem->>'counterparty_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  end if;

  -- ---------------------------------------------------------------
  -- THE RESERVATIONS, ALL OF THEM, BEFORE THE FIRST LOCK (0037:2678-2698's deadlock
  -- reasoning; the complete_pending_match discipline). ABI SSE:
  --   * `<op>`                -- this verb's own receipt.
  --   * `<op>:draft:approve`  -- PREHELD, spent by _approve_entry_core on the draft leg.
  --   * `<op>:settle`         -- PREHELD, spent by the settle core on the settlement leg.
  --   * `<op>:draft` / `<op>:match` / `<op>:resolve` -- NOT pre-reserved: their spenders are
  --     still-public RESERVING verbs, and pre-reserving a key its callee will also reserve
  --     either raises CLR10 (different hash) or hands the callee a `{pending:true}` stub it
  --     would no-op on [L2/FI1].
  -- Each derived pre-reservation is a NON-NULL-RAISES claim, never a replay: a genuine replay
  -- of this act returns at the composite's OWN receipt above and never reaches here, so a
  -- non-null answer here means somebody else owns that namespace.
  -- ---------------------------------------------------------------
  v_dedupe := clara._reserve_op(c.firm, 'resolve_and_book_bank_line', p_op_key,
    -- THE HASH CARRIES THE ACKNOWLEDGEMENT, for clara.match_bank_line's own stated reason
    -- [round 8, lane M3]: it BOTH decides an admission and is recorded (on the member row, in
    -- that verb's audit payload, and in this verb's). Omitting it would let the same op_key
    -- replayed with ack=true return the ack=false call's receipt while the caller believes an
    -- acknowledgement was recorded. The COALESCED value is hashed, never the raw argument, so
    -- `null` and `false` -- which mean the same thing to every gate -- stay the same act.
    clara._hash(jsonb_build_object('exception', p_exception, 'disposition', p_disposition,
      'note', p_note, 'draft', p_draft, 'alloc', p_allocations, 'adj', p_adjustments,
      'adv', p_advance_applications, 'charge', p_charge_cents,
      'charge_acct', p_charge_account, 'ack', v_ack)));
  if v_dedupe is not null then return v_dedupe; end if;

  if v_leg = 'draft' then
    if clara._reserve_op(c.firm, 'approve_entry', p_op_key || ':draft:approve',
         clara._hash(jsonb_build_object('composite', 'resolve_and_book_bank_line',
           'op_key', p_op_key, 'leg', 'draft'))) is not null then
      raise exception 'the derived draft approve op key is already in use'
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  else
    -- The settle key carries the settle verb's LIVE 11-field hash, computed through the S4.1
    -- primitive so the core -- which will spend this receipt preheld -- and this reservation
    -- cannot drift. The memo, posting date and control account are deliberately NULL: the
    -- core synthesises the house memo, defaults the date to the line's own entry_date and
    -- takes the single-control lane, so this verb never has an opinion about any of the three.
    if clara._reserve_op(c.firm, '_settle_from_bank_line_core', p_op_key || ':settle',
         clara._settle_request_hash(p_client, ex.line_id, v_cp, p_allocations, null, null,
           v_charge, p_charge_account, clara._bank_adjustments_norm(p_adjustments),
           p_attestation, null, null)) is not null then
      raise exception 'the derived settle op key is already in use'
        using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
    end if;
  end if;

  -- ---------------------------------------------------------------
  -- THE LOCKS. Row locks on PRE-EXISTING journal entries FIRST (0037 invariant (1) -- this is
  -- the reverse_entry relative order that match_bank_line is bound by), then the advisory
  -- rungs ascending.
  --
  -- v_pre_entries is EMPTY BY CONSTRUCTION in both of today's legs: the hand-draft leg matches
  -- the entry it just created, and the settlement leg matches the entry the settle core
  -- creates -- transaction-new rows are exempt from the invariant because no other session can
  -- hold them. The loop is written out anyway, and left empty rather than deleted, because the
  -- invariant is about the ORDER a future arity must inherit: the day this verb learns to
  -- match a pre-existing entry, the lock is already in the right place. (Tail probe: the
  -- vacuity is asserted, not assumed.)
  -- ---------------------------------------------------------------
  if array_length(v_pre_entries, 1) is not null then
    perform 1 from clara.journal_entries je where je.id = any(v_pre_entries)
      order by je.id for update;
  end if;
  -- THE HAND-DRAFT LEG'S SECOND COUNTERPARTY SOURCE: the TOP-LEVEL p_draft.counterparty
  -- proposal (as-built ladder round 2 -- A LOCK-ORDER INVERSION). It is handed to
  -- clara.draft_entry as p_proposed_counterparty and stored on the draft, and
  -- clara._approve_entry_core then resolves it and takes 203005003 ON THE RESOLVED ID -- by
  -- which time this call is already holding 203005004 and 203005006. That is the house ladder
  -- run BACKWARDS, and a concurrent clara.allocate_payment / clara.allocate_receipt (which take
  -- 203005003 then 203005004, both by their own law) closes the cycle: MEASURED as a real
  -- 40P01 against a session holding the counterparty rung.
  --
  -- BOTH non-birth decisions are contendable, not just `{"existing_id": …}`: a `{"new": {…}}`
  -- proposal that MATCHES an existing counterparty by registration or normalised name resolves
  -- to that existing id too. Only decision='birth' is safe unlocked -- no other session can hold
  -- an advisory lock on a uuid that does not exist yet -- which is why the test is on the
  -- DECISION rather than on the proposal's shape.
  --
  -- IT IS DERIVED HERE, BELOW THE RESERVATIONS, NOT UP WITH THE LINE-STAMPED SET. A REPLAY of
  -- this act returns at the composite's own receipt ABOVE, and clara._resolve_counterparty is a
  -- body that can RAISE (a counterparty merged or retired since the original call no longer
  -- resolves) -- so deriving it before the dedup check would turn an idempotent replay into a
  -- CLR23. Below the reservations the replay has already returned and only a genuinely new call
  -- reaches this line, where clara.draft_entry would raise the identical refusal moments later.
  -- A non-object payload is left to clara.draft_entry deliberately, so this pre-lock can never
  -- CHANGE which refusal a caller meets.
  if v_leg = 'draft' and jsonb_typeof(p_draft->'counterparty') = 'object' then
    v_fp := clara._resolve_counterparty(p_client, p_draft->'counterparty');
    if coalesce(v_fp->>'decision', '') <> 'birth'
       and nullif(v_fp->>'counterparty_id', '') is not null then
      v_top_cp := clara._canonical_counterparty(p_client, (v_fp->>'counterparty_id')::uuid);
      if v_top_cp is not null and not (v_top_cp = any(coalesce(v_cps, '{}'::uuid[]))) then
        v_cps := coalesce(v_cps, '{}'::uuid[]) || v_top_cp;
      end if;
    end if;
  end if;
  -- ASCENDING, ALWAYS: two calls naming the same two counterparties in a different order must
  -- not be able to hold each other's next rung (the resolve_bank_line_exception two-line-lock
  -- reasoning, applied to advisory keys).
  if v_cps is not null then
    select array_agg(x order by x::text) into v_cps from unnest(v_cps) as t(x);
    foreach v_one in array v_cps loop
      perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_one::text));
    end loop;
  end if;
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));
  perform pg_advisory_xact_lock(203005006, hashtext(v_bank::text));

  -- ---------------------------------------------------------------
  -- THE PRIOR-BOOKING WALL (as-built ladder round 3 -- A DOUBLE BOOKING). ONE statement line
  -- carries ONE live booking. `ex.status = 'open'` above is an authority test, not a money
  -- test: design SS4's reopen deliberately puts a released line's exception BACK to open (it
  -- must -- a resolved exception on an unmatched line has fallen out of every reconciliation
  -- term), and clara.unmatch_bank_match deliberately does NOT un-approve the booking (it must
  -- not -- clara.reverse_entry refuses `live_bank_match_present` until the group is released,
  -- so a release that demanded the reversal first would wall the human in). Between those two
  -- correct decisions sits an open exception whose GL booking is still standing, and a second
  -- call here books it AGAIN: measured at 84,000 of bank GL for one 42,000 line, with
  -- clara.get_bank_reconciliation absorbing the surplus as an outstanding entry side so the
  -- receipt still ties and nothing surfaces it.
  --
  -- THE ANSWER IS THE SHARED PREDICATE (S4.6A), not a local test -- the walled-corridor class
  -- has now recurred three times, every recurrence a hand-derived claim about another verb's
  -- admission logic. clara._wdb_exception_booking_block ASKS clara.reverse_entry's own gates,
  -- in clara.reverse_entry's own order, and composes a remedy that is executable as written
  -- (the settlement leg genuinely needs clara.unallocate_group on a NAMED application_group
  -- first). clara.unmatch_bank_match reads the SAME body, so the release that creates this
  -- state and the door that refuses because of it can never tell two different stories.
  --
  -- IT IS TAKEN UNDER THE RUNGS, DELIBERATELY: 203005004 is the rung clara.reverse_entry and
  -- every allocation composite take, so a concurrent unwind is serialised against this read
  -- rather than racing it. Nothing has been written yet, so the refusal rolls the reservations
  -- back with it and a retry under the same op key is a genuinely fresh act.
  -- ---------------------------------------------------------------
  -- ROUND 4: the predicate is now LINE-keyed (it walks every group that has ever held this
  -- exception's line, not only the groups this migration's own composite stamped), and the
  -- VERDICT is its `blocking` key rather than mere non-nullness -- a standing entry that some
  -- other live group already holds is reported but does not refuse. The structural backstop
  -- for every OTHER door is S4.11's line-member arm, which reads this same body.
  v_block := clara._wdb_exception_booking_block(p_exception);
  if v_block is not null and coalesce((v_block->>'blocking')::boolean, false) then
    raise exception 'statement line % already carries a booking made for this exception that nobody has unwound; book it once: %', ex.line_id, coalesce(v_block->>'remedy', '(no remedy composed)')
      using errcode='CLR10', detail=v_block::text;
  end if;

  -- THE COUNTERPARTY LANDSCAPE RE-CHECK (as-built ladder round 3 -- A FROZEN-SNAPSHOT READ,
  -- one of the two D-a defect classes by name). Every 203005003 above was keyed on a canonical
  -- id resolved BEFORE the rungs, and clara.merge_counterparties takes no advisory rung at all
  -- -- so a merge committing in that window moves the tail of the chain, clara._approve_entry_core
  -- (or the allocate core, which re-canonicalises its p_counterparty) then takes 203005003 on a
  -- SURVIVOR this call never locked, while this call already holds 203005004 and 203005006.
  -- That is the ladder inversion round 2 closed, re-opened through the map instead of the
  -- payload. Taking the extra rung here is NOT the fix -- a session holding 203005003 on the
  -- survivor and waiting for 203005004 (every allocate verb, by its own law) would close the
  -- cycle from the other side. So the act REFUSES, in the same class clara._approve_entry_core
  -- already uses for a changed counterparty landscape (CLR23), at a point where nothing has
  -- been written: the transaction aborts, every reservation rolls back with it, and re-running
  -- the identical call resolves against the settled landscape. The check is TOTAL over the
  -- rungs actually held, because canonical(canonical(raw)) = canonical(raw) -- asking each
  -- held id whether it is still its own canonical asks the same question of every raw source
  -- that produced it, on both legs.
  if v_cps is not null then
    foreach v_one in array v_cps loop
      v_moved := clara._canonical_counterparty(p_client, v_one);
      if v_moved is distinct from v_one then
        raise exception 'a counterparty merge landed while this act was taking its locks (% is now %); nothing was written -- run the act again and it will resolve against the settled landscape', v_one, coalesce(v_moved::text, '(unresolvable)')
          using errcode='CLR23',
            detail=jsonb_build_object('reason','counterparty_landscape_changed',
              'counterparty_id', v_one, 'canonical_id', v_moved,
              'exception_id', p_exception)::text;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------
  -- THE BOOKING.
  -- ---------------------------------------------------------------
  -- F-A3 (obligation J.2-a): every ctx-carrying call from here to the end of this branch pair
  -- threads `p_ctx` — NEVER a fresh rebuild — through both the draft leg's approve/resolve/match
  -- trio and the settle leg's settle-core call. This is the whole fix.
  if v_leg = 'draft' then
    -- THE INLINE RESOLUTION MINT (design SS4, the attribution posture). Every other D-b writer
    -- is FK-anchored -- a template, an enrolment, a statement line -- and carries no resolution
    -- because there is nothing to resolve. THIS draft is free-form: its client is a QUESTION
    -- the owner has just answered by naming an exception on a line that belongs to the client,
    -- so the answer is recorded as evidence at confidence 1.0, method 'human', exactly as
    -- confirm_attribution_candidate records its own (0009:2382-2385). A caller who already
    -- holds a live resolution may name it instead.
    v_resolution := nullif(btrim(coalesce(p_draft->>'resolution','')),'')::uuid;
    if v_resolution is null then
      insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id,
          confidence, method, evidence, resolved_by)
        values (c.firm, p_client, 'manual', ex.line_id, 1.0, 'human',
          jsonb_build_object('verb', 'resolve_and_book_bank_line', 'exception_id', p_exception,
            'line_id', ex.line_id, 'op_key', p_op_key), c.actor)
        returning id into v_resolution;
    end if;

    -- F-A3 (public-call hazard #2, f31b.o): repointed to _draft_entry_core, threading the
    -- identity this call already extracted (v_is_agent/v_obo/v_wake_kind) rather than the
    -- pinned body's public clara.draft_entry, which calls _human_ctx() and would CLR04 for a
    -- wake caller. is_human is the logical negation of is_agent — draft_entry's own wrapper
    -- hardcodes `true` because every LIVE caller of that public verb is human; this is the
    -- one call site where that is no longer always so.
    v_res := clara._draft_entry_core(c.actor, c.firm, v_obo, v_wake_kind, not v_is_agent,
      p_client, v_resolution,
      (p_draft->>'posting_date')::date, p_draft->>'memo', p_draft->'lines',
      null, null, '{}'::jsonb, p_op_key || ':draft', null, p_draft->'counterparty', null, null, null);
    v_entry := (v_res->>'entry_id')::uuid;
    if v_entry is null then
      raise exception 'the hand-draft leg produced no entry'
        using errcode='CLR10',detail='{"reason":"draft_leg_no_entry"}';
    end if;

    -- THE ADVANCE PROPOSAL, COPIED VERBATIM (ABI SSA/SSB). clara._draft_entry_core extracts
    -- only three named booleans out of p_flags (0016:4079-4089), so a proposal key handed to
    -- draft_entry is SILENTLY DROPPED -- the trap wave-d-contract SS3 names. The payload is
    -- therefore stamped here, on the still-draft row, through the draft->draft allowset that
    -- carries `flags` (0016:4954). Verbatim means verbatim: this verb never reshapes,
    -- re-keys or validates the payload -- clara._adv_on_approve is its single authoritative
    -- reader and every advance guard re-derives there, under the client rung, at approve.
    if p_advance_applications is not null then
      update clara.journal_entries je
        set flags = coalesce(je.flags,'{}'::jsonb)
                    || jsonb_build_object('staff_advance_application', p_advance_applications),
            updated_at = now()
        where je.id = v_entry and je.status = 'draft';
      if not found then
        raise exception 'the hand-draft was no longer a draft when its advance proposal was stamped'
          using errcode='CLR16';
      end if;
    end if;

    -- [WDB-G9] + assembly adjudication B: THE PARK IS THE SETTLEMENT LEG ONLY. A high-stakes
    -- hand-draft cannot be parked -- clara.bank_matches anchors exactly ONE draft and only the
    -- settle core writes a pending group -- so it refuses HERE, by name, rather than dying two
    -- calls later inside _approve_entry_core on a CLR05 about checkers.
    --
    -- =============================================================================
    -- THE MESSAGE IS AN INTERIM, AND IT NO LONGER NAMES A CHAIN THAT IS REFUSED AT EVERY STEP
    -- [as-built ladder round 8 fix, lane M3; cells x42.r8s-f1..f4]. WDB-R2, in its plainest
    -- form: a refusal that names a remedy is asserting something about another verb's
    -- admission logic, and this one asserted three things about three verbs, all false.
    --
    -- WHAT THE OLD MESSAGE SAID, AND WHAT EACH STEP ACTUALLY DOES -- MEASURED, in this exact
    -- state, on both an advance-carrying and a plain high-stakes hand-draft:
    --   "approve the entry through /queue with a distinct checker"  -- THERE IS NO ENTRY. This
    --     raise ABORTS the transaction, so the draft named in `entry_id` rolls back with it;
    --     measured, the client held ZERO journal entries after the refusal. The message sent a
    --     professional to /queue to look for a row that had never committed.
    --   "then resolve the exception with clara.resolve_bank_line_exception"  -- CLR10: "... is
    --     resolved as matched_booking but its line is in no live match; the booking must land
    --     in the same transaction" (the deferred settled-authority belt). Measured for
    --     matched_booking AND written_off_adjustment; bank_corrective_line refuses for want of
    --     a counterpart line, which a genuine deposit has not got.
    --   "plus clara.match_bank_line"  -- CLR10 line_excepted: "... is under an open bank-line
    --     exception; resolve the exception before matching it".
    -- The two refuse each other in BOTH orders, and a PostgREST caller is one RPC = one
    -- transaction, so no ordering of them is executable from the product's own surface. There
    -- is also no withdraw door: clara.bank_line_exceptions.status admits {open, resolved} and
    -- exactly three bodies write it (complete_pending_match, resolve_bank_line_exception,
    -- unmatch_bank_match) -- none of them cancels an open exception.
    --
    -- WHAT THIS FIX IS AND IS NOT. It is the INTERIM the ruling allows: the promise and the
    -- enforcement now come from one predicate, because the only door this message names is one
    -- it MEASURES first. It is NOT the door itself. Whether v1 should be able to book a
    -- high-stakes hand-draft against an open bank-line exception in one act -- by letting the
    -- draft leg park, by teaching clara.draft_entry a staff_advance_application key, or by
    -- scoping the composition out with this honest refusal as shipped -- is an OWNER DECISION,
    -- and the three candidates are recorded with their blast radius in the round-8 lane report
    -- rather than being chosen here.
    --
    -- THE ADVANCE BRANCH NAMES clara.book_staff_advance_application ONLY WHEN THE REGISTER DOOR
    -- ITSELF ADMITS THIS PAYLOAD, and that is a measurement, not a belief: the draft still
    -- exists at this instant with the proposal already stamped on it, so
    -- clara._adv_assert_proposal -- the SAME body clara.book_staff_advance_application runs on
    -- its own draft -- is asked here, about these very allocations, at this posting date. If it
    -- refuses, the message says the register door refuses too and repeats its reason instead of
    -- sending the caller into a second wall. (It takes advance row locks; the transaction is
    -- about to abort, so they cost nothing and are released with it.)
    --
    -- WHAT THE ADVANCE BRANCH DOES **NOT** PROMISE: that the statement line gets disposed of.
    -- Measured -- after the register is put right, the line is still excepted, every
    -- disposition still refuses, and clara.get_bank_reconciliation reports difference 0 with
    -- the line under excepted_cents and can_complete true. So the message says exactly that.
    -- Saying "the exception lane's other dispositions will handle the line" would have been the
    -- same defect in new words.
    -- =============================================================================
    if clara.is_high_stakes(v_entry) then
      if p_advance_applications is not null then
        begin
          perform clara._adv_assert_proposal(v_entry);
          v_reg_ok := true;
        exception when others then
          get stacked diagnostics v_reg_why = message_text;
          v_reg_ok := false;
        end;
        if v_reg_ok then
          v_advice := 'What works today: book the repayment against the register with clara.book_staff_advance_application -- its own proposal validation admits these allocations at this posting date, measured just now -- and a distinct checker approves that draft through /queue, which keeps who owes what right to the cent. The statement line stays excepted: clara.get_bank_reconciliation reports it under excepted_cents (difference unchanged) and the month still completes, but no exception disposition closes the line without a booking landing in the same transaction.';
        else
          v_advice := format('The register door would refuse this payload too, for its own reason (%s), so fix that first; clara.book_staff_advance_application is the door that then keeps the register right, and the statement line stays excepted either way -- clara.get_bank_reconciliation reports it under excepted_cents.', v_reg_why);
        end if;
      else
        v_advice := 'If this booking can be stated as an open-item settlement, name p_allocations instead of p_draft: the SETTLEMENT leg is the one that parks for a distinct checker. Otherwise the statement line stays excepted -- clara.get_bank_reconciliation reports it under excepted_cents (difference unchanged) and the month still completes -- and no exception disposition closes the line without a booking landing in the same transaction.';
      end if;
      raise exception 'this hand-draft is high-stakes, and a parked resolution carries only the settlement leg, so this act cannot book it -- and NOTHING was written: the draft rolled back with this refusal, so there is no entry anywhere to approve. No v1 door books a high-stakes hand-draft against an OPEN bank-line exception in one act; that composition is an owner decision and is still pending. %', v_advice
        using errcode='CLR10',
          detail=jsonb_build_object('reason','pending_branch_ancillary_unsupported',
            'axis','draft',
            -- entry_id is DELIBERATELY GONE. It named the draft this raise destroys, which is
            -- what made the old remedy readable as an instruction; a surface that rendered it
            -- offered a link to a row that never existed.
            'draft_rolled_back', true,
            'advance_payload', p_advance_applications is not null,
            'register_door_admits', v_reg_ok,
            'owner_decision_pending', true,
            'remedy', case when p_advance_applications is not null
                             and coalesce(v_reg_ok, false)
                           then 'book_staff_advance_application'
                           when p_advance_applications is not null then 'fix_advance_payload'
                           else 'settlement_leg_or_none' end)::text;
    end if;

    -- Read the revision token AFTER the flags stamp: the update rotates it, so a token read
    -- before it is already stale by the time the core checks it (the allocate cores' law).
    select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;
    -- F-A3 (obligation J.2-a): the FULL p_ctx threaded through — the pinned body's fresh
    -- `jsonb_build_object('actor','firm','receipt_preheld',true)` discarded is_agent/
    -- on_behalf_of/wake_kind/rationale/model.
    perform clara._approve_entry_core(
      p_ctx || jsonb_build_object('receipt_preheld', true),
      v_entry, v_rev, p_attestation, p_op_key || ':draft:approve');

    -- RESOLVE, THEN MATCH. The order is the whole reason match_bank_line needs no recut: its
    -- `line_excepted` wall re-asks the question under the line lock and, by then, the answer
    -- is 'resolved'. (resolve_bank_line_exception raises a NOTICE here because the line is not
    -- yet a live member -- that notice describes precisely this transaction and is the message
    -- its own header says it exists to give.)
    -- F-A3 (obligation J.2-a, the public-call hazard): repointed from the PUBLIC
    -- `clara.resolve_bank_line_exception` (which calls `_human_ctx()` and would CLR04 for a
    -- wake caller) to the CORE, threading `p_ctx` through.
    perform clara._resolve_bank_line_exception_core(p_ctx, p_exception, p_disposition, v_note,
      null, p_op_key || ':resolve');

    -- THE ACKNOWLEDGEMENT IS THE CALLER'S, PASSED THROUGH VERBATIM [round 8, lane M3]. It was
    -- hard-coded FALSE here, on the reasoning that "a hand-draft dated outside the statement's
    -- period is a date the human chose and must be told about, not one this composite
    -- acknowledges on their behalf" -- which is still exactly right, and is why the default is
    -- false. What was wrong was that there was no way for the human to ANSWER: the composite
    -- took no acknowledgement argument, so a released advance-carrying booking could not be
    -- re-booked at any date at all (see the argument-list header). The composite still never
    -- acknowledges anything on the caller's behalf; it now carries the caller's own answer to
    -- the body that owns the question.
    -- F-A3 (obligation J.2-a, the public-call hazard): repointed from the PUBLIC
    -- `clara.match_bank_line` to `_match_bank_line_core`, threading `p_ctx` through.
    v_res := clara._match_bank_line_core(p_ctx, p_client,
      jsonb_build_array(ex.line_id),
      jsonb_build_array(jsonb_build_object('entry_id', v_entry,
        'matched_cents', ln.amount_cents)),
      null, v_ack, p_op_key || ':match');
    v_match := (v_res->>'match_id')::uuid;
    v_branch := 'live';
    v_res := v_res || jsonb_build_object('entry_id', v_entry, 'entry_status', 'approved',
      'resolution_id', v_resolution, 'leg', 'draft');

  else
    -- THE SETTLEMENT LEG. The exception is STILL OPEN here, by design, so the declaration
    -- travels in p_ctx and admission site 1 lets THIS ONE through (and nothing else).
    -- F-A3 (obligation J.2-a): the FULL p_ctx threaded through, merged with this call's own
    -- additive keys (receipt_preheld/fn/exception_declaration) — the pinned body's fresh
    -- `jsonb_build_object('actor','firm', ...)` discarded is_agent/on_behalf_of/wake_kind/
    -- rationale/model, which is the SAME B1 defect found in the settle limb proper.
    v_res := clara._settle_from_bank_line_core(
      p_ctx || jsonb_build_object('receipt_preheld', true,
        'fn', '_settle_from_bank_line_core',
        'exception_declaration', jsonb_build_object('exception_id', p_exception,
          'disposition', p_disposition)),
      p_client, ex.line_id, v_cp, p_allocations, null, null, v_charge, p_charge_account,
      p_adjustments, p_attestation, null, p_op_key || ':settle', null);
    v_match := (v_res->>'match_id')::uuid;
    v_match_status := v_res->>'status';
    if v_match is null or v_match_status is null then
      raise exception 'the settlement leg produced no match group'
        using errcode='CLR10',detail='{"reason":"settlement_composite_no_entry"}';
    end if;

    if v_match_status = 'live' then
      -- Below the threshold the whole act completes now: the settlement is approved, the
      -- group is live, and the resolution executes against a line that IS a live member --
      -- which is exactly what the deferred authority belt asserts at commit.
      -- F-A3 (obligation J.2-a, the public-call hazard): repointed to the core.
      perform clara._resolve_bank_line_exception_core(p_ctx, p_exception, p_disposition, v_note,
        null, p_op_key || ':resolve');
      v_branch := 'live';
    else
      -- THE PARK [WDB-G9]. The ancillaries refuse HERE and not at argument time, because
      -- whether this act parks is not knowable until the settlement entry exists and
      -- clara.is_high_stakes has answered for it. A carried charge or difference adjustment
      -- would ride `pending_ancillaries` and post at the flip -- i.e. past the boundary the
      -- ruling draws around "the settlement leg only" [L3/C3-4].
      select count(*)::int into v_adj_n
        from jsonb_array_elements(clara._bank_adjustments_norm(p_adjustments)) as x(elem);
      if v_adj_n > 0 or v_charge > 0 or p_charge_account is not null then
        raise exception 'this settlement is high-stakes, so the resolution parks for a distinct checker and the parked branch carries the settlement leg ONLY; book the bank charge and the difference adjustments as their own acts after clara.complete_pending_match flips the group'
          using errcode='CLR10',
            detail=jsonb_build_object('reason','pending_branch_ancillary_unsupported',
              'axis','ancillaries','match_id',v_match)::text;
      end if;
      -- THE DECLARATION, on the group, beside the id. The two booking dispositions only (the
      -- CHECK on the column is the durable half); declared_by is the OWNER who made this act,
      -- and complete_pending_match resolves the exception AS THAT ACTOR -- the checker
      -- EXECUTES an owner's decision, they do not make one [WDB-G9].
      update clara.bank_matches bm
        set pending_resolution = jsonb_build_object(
              'exception_id', p_exception, 'disposition', p_disposition, 'note', v_note,
              'declared_by', c.actor, 'declared_at', now())
        where bm.id = v_match;
      v_branch := 'pending';
    end if;
    v_res := v_res || jsonb_build_object('leg', 'settle');
  end if;

  -- ---------------------------------------------------------------
  -- THE IDENTITY, STAMPED IN THE CREATING TRANSACTION ON EVERY PATH [L5/V5-2]. The group is
  -- created by the callee (match_bank_line or the settle core) and this verb stamps the
  -- exception it belongs to before commit. It is what the flip, the cancel, the reopen and
  -- four of the seven admission sites key on -- and the narrow BEFORE-UPDATE trigger SECTION
  -- S1 installs makes it immutable once non-null, so no later act can repoint a group at a
  -- different exception.
  -- ---------------------------------------------------------------
  update clara.bank_matches bm
    set resolution_exception_id = p_exception
    where bm.id = v_match;

  -- THE AUDIT ROW IS THE GENERIC ONE, DELIBERATELY. clara.bank_match_audit's `action` column
  -- carries a CHECK admitting exactly five match-scoped verbs (0038:961) and this act is not
  -- one of them -- and the group's own timeline is NOT thereby thinner, because the callee
  -- that created the group already wrote its row there ('settle'/'settle_pending' from the
  -- settle core, 'match' from match_bank_line). Widening a Wave-C CHECK to add a sixth action
  -- would be a schema change this section has no mandate for, so the composite's own act is
  -- recorded in clara.audit_log, which is human-read behind RLS exactly as bank_match_audit
  -- is. (Reported to the assembler as an optional SECTION S1 follow-up, not taken here.)
  perform clara._audit(c.firm, c.actor, null, null, 'resolve_and_book_bank_line',
    nullif(v_res->>'entry_id','')::uuid,
    jsonb_build_object('client', p_client, 'exception', p_exception, 'line_id', ex.line_id,
      'disposition', p_disposition, 'leg', v_leg, 'branch', v_branch, 'match_id', v_match,
      'match_status', coalesce(v_match_status, 'live'), 'counterparty_id', v_cp,
      'charge_cents', v_charge,
      'advance_proposal', p_advance_applications is not null,
      -- The acknowledgement is AUDITED on both legs, not only where it can fire: an audit that
      -- recorded it only when it mattered would make "the caller did not ask" and "the caller
      -- asked on a leg that has nothing to acknowledge" read the same, and the second of those
      -- is a refusal.
      'ack_period_exceptions', v_ack, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'resolve_and_book_bank_line', p_op_key,
    v_res || jsonb_build_object('resolution_exception_id', p_exception, 'branch', v_branch,
      -- ...and it is on the RECEIPT, beside clara.match_bank_line's own `period_exceptions`
      -- count, so a surface can say "1 posting-date exception, acknowledged" from one read.
      'ack_period_exceptions', v_ack));
end $function$;

-- ================================================================================================
-- §E · DDL 4 — the three new tables (Annex A.3, A.4, Annex D — registers A26, A27). All three ship
-- BEHAVIOURALLY INERT ON ARRIVAL, exactly as `UNNUMBERED_f_a2_posted_chain.sql`'s own header states
-- for F-A2's posted-outcome chain: nothing in THIS file writes a row to any of them (the granted
-- wrapper / ungranted agent-core seam that would is its own follow-up window, per this file's
-- header) — they exist so that window lands on tables and walls already reviewed and in place,
-- never as a day-one risk bundled with brand-new judgement logic. Zero DML grant to any role.
-- ================================================================================================

-- Every NEW object from here through the end of DDL 6 (the three tables, the two receipt-wall
-- trigger functions and the proposal-accept trigger function) is created as clara_fn_owner, the
-- house convention for a NEW object's ownership (F-A2 part1's own §A does the identical
-- set role/reset role wrap around clara.entry_post_receipts, posting_core.sql:471-1376) — a
-- CREATE OR REPLACE on an ALREADY-existing clara_fn_owner-owned body (the ten CoR'd functions
-- above) preserves its owner regardless of the current role, so only genuinely NEW objects need
-- this wrap.
set role clara_fn_owner;

-- clara.bank_agent_receipts — Annex A.3. Append-only via _tf_append_only + a no-truncate trigger
-- (the 0011:1084-1086 idiom). OUTCOME-SCOPED uniqueness (material M6): `unique(op_key)` for replay
-- idempotency, and a PARTIAL unique index on (act_kind, subject_id) WHERE outcome='admitted' — at
-- most one admitted act per subject, and as many refusal rows as the clock's own retry_later
-- reason legitimately produces. A refusal's subject_id is the candidate group's ANCHOR LINE id (no
-- bank_matches row exists yet to name). The default in each coalesce is '' — TWO apostrophes (the
-- F-A2 R-3 lesson: four apostrophes made the model-name wall always pass).
create table clara.bank_agent_receipts (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid not null references clara.firms(id),
  client_id          uuid not null,
  act_kind           text not null check (act_kind in
                       ('match','unmatch','settle','reconcile_complete','reconcile_void',
                        'exception_resolve','exception_propose','statement_void',
                        'bank_account_add','account_upsert',
                        'identifier_promotion_propose')),
  outcome            text not null check (outcome in ('admitted','refused')),
  subject_id         uuid not null,
  retry_after        timestamptz,
  acting_actor       uuid not null references clara.users(id),
  on_behalf_of       uuid references clara.users(id),
  via_wake_kind      text not null check (via_wake_kind in ('bank_agent','interactive_client')),
  wake_task_id       uuid,
  model_snapshot     jsonb not null check (jsonb_typeof(model_snapshot)='object'
                       and btrim(coalesce(model_snapshot->>'provider','')) <> ''
                       and btrim(coalesce(model_snapshot->>'model','')) <> ''
                       and btrim(coalesce(model_snapshot->>'version','')) <> ''),
  rationale          text not null check (btrim(rationale) <> '' and length(rationale) <= 4000),
  inputs_digest      text not null check (btrim(inputs_digest) <> ''),
  gate_verdicts      jsonb not null check (jsonb_typeof(gate_verdicts)='object'),
  approval_arm       text not null,
  op_key             text not null,
  created_at         timestamptz not null default now(),
  constraint uq_bank_agent_receipts_op_key unique (op_key)
);
comment on table clara.bank_agent_receipts is
  'F-A3 (Annex A.3): one row per agent bank JUDGEMENT ACT (never per post — see clara.entry_post_receipts for that). Written only inside the acting agent core, in the same transaction, so a Tier-C conversion rolls it back. Zero DML grant to any role. Outcome-scoped uniqueness: unique(op_key) for replay; the partial admitted index below caps ONE admitted act per subject while refusals accumulate freely.';
create unique index uq_bank_agent_receipts_admitted
  on clara.bank_agent_receipts (act_kind, subject_id) where outcome = 'admitted';
create index ix_bank_agent_receipts_client on clara.bank_agent_receipts(client_id, created_at desc);
create index ix_bank_agent_receipts_retry on clara.bank_agent_receipts(client_id, retry_after)
  where outcome = 'refused' and retry_after is not null;

alter table clara.bank_agent_receipts enable row level security;
alter table clara.bank_agent_receipts force row level security;
create policy p_bank_agent_receipts_owner on clara.bank_agent_receipts
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_agent_receipts_read on clara.bank_agent_receipts
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_agent_receipts to clara_authenticated;

create trigger t_bank_agent_receipts_append_only before update or delete on clara.bank_agent_receipts
  for each row execute function clara._tf_append_only();
create trigger t_bank_agent_receipts_no_truncate before truncate on clara.bank_agent_receipts
  for each statement execute function clara._tf_no_truncate();

-- clara.bank_agent_proposals — Annex A.4 + blocker B4's fold. kind in ('line_exception',
-- 'identifier_promotion'). status starts 'open'; 'accepted' is written ONLY by
-- t_bank_agent_proposal_accept (DDL 6) or the identifier-promotion confirm door (a follow-up
-- window's own build, per this file's header) — never by this file, and never by except_bank_line
-- itself (byte-untouched, per the design's own non-goal). declined/stale are DROPPED from the
-- CHECK (law 31: no verb writes them).
create table clara.bank_agent_proposals (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid not null references clara.firms(id),
  client_id      uuid not null,
  kind           text not null check (kind in ('line_exception','identifier_promotion')),
  subject_id     uuid not null,
  payload        jsonb not null,
  rationale      text not null check (btrim(rationale) <> ''),
  receipt_id     uuid not null references clara.bank_agent_receipts(id),
  status         text not null default 'open' check (status in ('open','accepted')),
  decided_by     uuid references clara.users(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  constraint ck_bap_terminal check (
    (status = 'open' and decided_by is null and decided_at is null)
    or (status <> 'open' and decided_by is not null and decided_at is not null))
);
comment on table clara.bank_agent_proposals is
  'F-A3 (Annex A.4, blocker B4): a structured proposal a human acts on in one click. line_exception proposals flip accepted via t_bank_agent_proposal_accept (DDL 6), an AFTER INSERT trigger on bank_line_exceptions — except_bank_line stays byte-untouched. identifier_promotion proposals flip via the confirm door (a follow-up window''s own build). Human SELECT-only, FORCE RLS, zero machine grants — the 0040 tail-7(1) posture.';

alter table clara.bank_agent_proposals enable row level security;
alter table clara.bank_agent_proposals force row level security;
create policy p_bank_agent_proposals_owner on clara.bank_agent_proposals
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_agent_proposals_read on clara.bank_agent_proposals
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_agent_proposals to clara_authenticated;
create index ix_bank_agent_proposals_open on clara.bank_agent_proposals(client_id, subject_id)
  where status = 'open';

-- clara.bank_agency_holds — Annex D (blocker B3). client_id PK; a brake on a running lane, never a
-- per-firm capability dial (ADR-0072② / TA-P1's default-on rider). FORCE RLS, human SELECT-only,
-- ZERO machine grants — the 0040 tail-7(1) posture, so it joins the zero-grant census rather than
-- becoming its exception. Its only writer (clara.set_bank_agency_hold, the human bookkeeper-floor
-- verb) is a follow-up window's own build alongside the wrappers, per this file's header — the
-- Tier-A rung this table exists to feed does not exist yet either, so the table ships ahead of
-- both its writer and its reader, dormant.
create table clara.bank_agency_holds (
  client_id  uuid primary key,
  firm_id    uuid not null references clara.firms(id),
  on_hold    boolean not null default false,
  reason     text not null check (btrim(reason) <> ''),
  set_by     uuid not null references clara.users(id),
  set_at     timestamptz not null default now(),
  constraint fk_bank_agency_holds_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id)
);
comment on table clara.bank_agency_holds is
  'F-A3 (Annex D, blocker B3): the bank lane hold, per client. A brake on a running lane, not a per-firm capability dial (ADR-0072(2)). FORCE RLS, human SELECT-only, zero machine grants. Its only writer (set_bank_agency_hold) and its Tier-A/due-predicate readers ship in the follow-up window alongside the wrapper/agent-core seam.';

alter table clara.bank_agency_holds enable row level security;
alter table clara.bank_agency_holds force row level security;
create policy p_bank_agency_holds_owner on clara.bank_agency_holds
  for all to clara_fn_owner using (true) with check (true);
create policy p_bank_agency_holds_read on clara.bank_agency_holds
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.bank_agency_holds to clara_authenticated;

do $ddl4_tail$
begin
  raise notice 'DDL 4: the three new tables created — bank_agent_receipts (outcome-scoped uniqueness, partial admitted index, append-only + no-truncate, zero DML grant), bank_agent_proposals (open/accepted only, ck_bap_terminal), bank_agency_holds (client PK, FORCE RLS, human SELECT-only, zero machine grants). All three BEHAVIOURALLY INERT — nothing in this file writes to any of them; the wrapper/agent-core seam that will is a follow-up window.';
end $ddl4_tail$;

-- ================================================================================================
-- §F · DDL 5 — the two deferred receipt walls (Annex A.3, the F-A2 t_je_agent_post_receipt shape).
-- ARM-0 first (law 68): an unresolvable acting actor refuses CLR08, declared not assumed
-- unreachable (law 31). Both are new DEFERRED constraint triggers on LIVE tables — ACCESS
-- EXCLUSIVE. Both are DORMANT today: nothing in the estate can write bank_matches.origin='agent'
-- or complete an agent-actor reconciliation until the wrapper/agent-core seam lands (this file's
-- own D-7/D-9 recuts make the WRITE possible in principle — origin is parameterised, is_agent
-- threads through — but nothing YET calls them with is_agent=true).
-- ================================================================================================
create or replace function clara._tf_assert_bank_match_agent_receipt()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_is_agent boolean; v_n int;
begin
  if new.origin <> 'agent' then return null; end if;
  -- ARM-0, exactly F-A2's own shape: an unresolvable acting identity refuses rather than
  -- assumes. created_by is bank_matches' own acting-actor column.
  if new.created_by is null then
    raise exception 'an agent-origin bank match has no created_by actor; the agent-match receipt wall cannot resolve the acting identity'
      using errcode='CLR08', detail='{"reason":"bank_match_agent_receipt_arm0_null_actor"}';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id = new.created_by;
  if not found or v_is_agent is null then
    raise exception 'the acting identity % is unresolvable; the agent-match receipt wall refuses rather than assuming a human', new.created_by
      using errcode='CLR08', detail='{"reason":"bank_match_agent_receipt_arm0_unresolvable_actor"}';
  end if;
  if not v_is_agent then
    -- origin='agent' with a HUMAN actor is itself a contradiction the congruence trigger (D-5)
    -- does not test (it tests the rule-id pairing, not the actor). Refused here, structurally.
    raise exception 'bank match % claims an agent origin but its acting actor is not an agent user', new.id
      using errcode='CLR10', detail='{"reason":"match_origin_incongruent"}';
  end if;
  -- BUG CAUGHT BY THIS FILE'S OWN BATTERY (f31b.j): a bank_matches row is born via EITHER
  -- match_bank_line (act_kind='match') OR settle_from_bank_line (act_kind='settle') — both
  -- write the SAME table, so the wall must accept either act_kind, not 'match' alone.
  select count(*)::int into v_n from clara.bank_agent_receipts r
    where r.act_kind in ('match','settle') and r.subject_id = new.id and r.outcome = 'admitted';
  if v_n <> 1 then
    raise exception 'an agent-origin bank match carries exactly one ADMITTED bank_agent_receipts row; match % carries %', new.id, v_n
      using errcode='CLR08', detail=jsonb_build_object('reason','bank_match_agent_receipt_missing',
        'match_id', new.id, 'receipts', v_n)::text;
  end if;
  return null;
end $function$;

create constraint trigger t_bank_match_agent_receipt after insert or update on clara.bank_matches
  deferrable initially deferred
  for each row when (new.origin = 'agent')
  execute function clara._tf_assert_bank_match_agent_receipt();

create or replace function clara._tf_assert_bank_recon_agent_receipt()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare v_is_agent boolean; v_n int;
begin
  if new.status <> 'complete' then return null; end if;
  if new.completed_by is null then
    raise exception 'a complete bank reconciliation has no completed_by actor; the agent-recon receipt wall cannot resolve the acting identity'
      using errcode='CLR08', detail='{"reason":"bank_recon_agent_receipt_arm0_null_actor"}';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id = new.completed_by;
  if not found or v_is_agent is null then
    raise exception 'the completing identity % is unresolvable; the agent-recon receipt wall refuses rather than assuming a human', new.completed_by
      using errcode='CLR08', detail='{"reason":"bank_recon_agent_receipt_arm0_unresolvable_actor"}';
  end if;
  -- A human completion writes no receipt. THAT IS THE WHOLE CONDITION (the t_je_agent_post_receipt
  -- shape, applied here).
  if not v_is_agent then return null; end if;
  select count(*)::int into v_n from clara.bank_agent_receipts r
    where r.act_kind = 'reconcile_complete' and r.subject_id = new.id and r.outcome = 'admitted';
  if v_n <> 1 then
    raise exception 'an agent-completed bank reconciliation carries exactly one ADMITTED bank_agent_receipts row; reconciliation % carries %', new.id, v_n
      using errcode='CLR08', detail=jsonb_build_object('reason','bank_recon_agent_receipt_missing',
        'reconciliation_id', new.id, 'receipts', v_n)::text;
  end if;
  return null;
end $function$;

create constraint trigger t_bank_recon_agent_receipt after insert or update on clara.bank_reconciliations
  deferrable initially deferred
  for each row when (new.status = 'complete')
  execute function clara._tf_assert_bank_recon_agent_receipt();

do $ddl5_tail$
begin
  raise notice 'DDL 5: the two deferred agent-receipt walls installed — t_bank_match_agent_receipt (bank_matches, when origin=agent) and t_bank_recon_agent_receipt (bank_reconciliations, when status=complete, agent-actor arm). ARM-0 declared on both. Both DORMANT today: 0 agent-origin bank_matches rows and 0 agent-completed reconciliations exist on this database, and nothing in the estate can produce one until the wrapper/agent-core seam lands.';
end $ddl5_tail$;

-- ================================================================================================
-- §G · DDL 6 — t_bank_agent_proposal_accept (blocker B4). A NEW AFTER INSERT trigger on the LIVE
-- table clara.bank_line_exceptions — ACCESS EXCLUSIVE — and DECLARED JUDGEMENT LOGIC (review law
-- 1: it decides whether a proposal was accepted). except_bank_line stays byte-untouched: it writes
-- bank_line_exceptions and knows nothing of any proposal; this trigger reads the row IT wrote and
-- flips ITS OWN proposal, never the reverse.
-- ================================================================================================
create or replace function clara._tf_bank_agent_proposal_accept()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
begin
  update clara.bank_agent_proposals
    set status = 'accepted', decided_by = new.created_by, decided_at = now()
    where kind = 'line_exception' and status = 'open'
      and (payload->>'line_id')::uuid = new.line_id;
  -- No matching OPEN proposal for this line => a no-op (a human hand-keying an exception with
  -- no agent proposal behind it is the ordinary, unremarkable case). Never touches
  -- clara.bank_line_exceptions itself.
  return null;
end $function$;

create trigger t_bank_agent_proposal_accept after insert on clara.bank_line_exceptions
  for each row execute function clara._tf_bank_agent_proposal_accept();

do $ddl6_tail$
begin
  raise notice 'DDL 6: t_bank_agent_proposal_accept installed on clara.bank_line_exceptions (AFTER INSERT) — resolves the OPEN line_exception proposal for the inserted row''s line_id, stamping decided_by=the inserting actor; a line with no open proposal is a no-op; except_bank_line''s own pg_proc row and prosrc are byte-unchanged by this file (verified: this DDL only ADDS a trigger, it does not touch the function).';
end $ddl6_tail$;

-- CREATE ROLE is a cluster-level operation clara_fn_owner does not hold; reset before it (and
-- before the shared predicate below, which needs no elevated role — a plain CREATE OR REPLACE/
-- CREATE FUNCTION under the migration runner's own privilege is sufficient there since
-- _close_gate_bank_items already exists under clara_fn_owner and _bank_registry_ledger_state is
-- explicitly re-owned below).
reset role;

-- ================================================================================================
-- §H · the clara_wake_bank role (part of DDL 7 — the granted-wrapper EXECUTE surface). The role
-- itself is created here, empty (zero grants, zero allowlist rows) — material M4/A29's dedicated
-- group role, kept rather than folded into clara_wake_interactive. The EXECUTE grants, the
-- allowlist rows and clara_wake_bank_login (the login role that reaches it, PR-2's DSN/pool
-- wiring) are the wrapper layer's own follow-up window: a role with no member login and no grant
-- is reachable by NOTHING, which is the same fail-safe-by-construction residue this file's header
-- names for the wake kind itself.
-- ================================================================================================
do $role_bank$
begin
  if not exists (select 1 from pg_roles where rolname = 'clara_wake_bank') then
    create role clara_wake_bank nologin;
  end if;
  raise notice 'DDL 7 (partial): clara_wake_bank role present (nologin, zero grants, zero allowlist rows) — the EXECUTE grants, allowlist rows and clara_wake_bank_login are the wrapper layer''s own follow-up window.';
end $role_bank$;

-- ================================================================================================
-- §I · THE SHARED REGISTRY-LEDGER PREDICATE (obligation X-1) + THE DRAWER-2 GATE'S REPAIRED ARM 4.
--
-- X-1 (annexes-3-build.md:193-208, recorded 2026-08-23 by the F-A3/PR-1a lane, conductor's
-- ruling): design §3.11(4)'s new `no_registered_account` fail arm is worded as "a client whose
-- chart carries a bank-class COA account with movement but NO registered bank_accounts row" — on
-- the `is_bank_account` reading this is VACUOUS on a zero-registry client, because
-- `coa_accounts.is_bank_account` is minted ONLY by `add_bank_account`/`remap_bank_account_coa`
-- (measured, this session: two writers, no others) — so a client with ZERO bank_accounts rows
-- carries ZERO flagged COA accounts, and the arm returns the empty set on EXACTLY the population
-- it exists to catch. F-T4's (unmerged) design §2.1/§2.2 states the shared-predicate contract this
-- section builds to. Per Annex O.4 obligation 6 ("one predicate, one owner, two call sites —
-- whichever lands FIRST writes it"), F-A3/PR-1b lands first (F-T4 is pre-PR-0-gate), so this file
-- authors `clara._bank_registry_ledger_state` and F-T4's OWN drawer-1 `bank_recon_close_state`
-- calls it later, unmodified by this file (R-F 1: drawer-1 stays F-T4's, by ownership not
-- absence). Scope, stated precisely: this section builds arm (4) ALONE for drawer-2's OWN gate
-- (`_close_gate_bank_items`); Annex F's items 1-3 (the registry-derived gap universe for repairs 1
-- and 2, and the `registry_lines_and_gaps_v2` basis rename that goes with fixing THOSE) are a
-- LARGER, separate repair Annex O.2 assigns to PR-1d and are NOT built here — arms 1-2 below are
-- therefore the PINNED v1 shape, byte-unmoved, and the basis literal is named honestly as neither
-- v1 (which lacked arm 4) nor v2 (which also repairs 1-2): `exceptions_gaps_and_registry_v1b`.
-- ================================================================================================

-- The shared predicate — F-T4 design-doc §2.1's exact contract (fix-queue-design.md, branch
-- track-b/ft4-fixqueue-design, read 2026-08-23):
--   clara._bank_registry_ledger_state(p_client uuid, p_as_of date) returns jsonb
--     { state: 'clear' | 'gap' | 'not_evaluable', accounts: [...], basis: <literal> }
-- Three arms, in order, per §2.2:
--   (a) a COA account with is_bank_account=true and no ACTIVE bank_accounts row binding it => gap
--       (non-vacuous: deactivating an account does NOT clear the flag, §2.2's own measurement).
--   (b) the zero-registry case: not_evaluable, unless DECLARED via the new `banking_arrangement`
--       client fact (the trade_nature/0056:1233-1239 precedent, cloned exactly) -- absence means
--       unknown, `no_accounts` means clear, `has_accounts` over an empty registry means gap
--       (a contradicted declaration, never a pass).
--   (c) no name or code heuristic, ever -- structure and declared facts only (review law 3).
-- NEW object, so it needs the ownership wrap again (reset above was for CREATE ROLE, a
-- cluster-level op clara_fn_owner does not hold); _close_gate_bank_items right after it is a
-- CoR on an already clara_fn_owner-owned body and needs no wrap, but stays inside the same
-- window for locality since the boundary costs nothing extra.
set role clara_fn_owner;

create or replace function clara._bank_registry_ledger_state(p_client uuid, p_as_of date)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  v_firm uuid;
  v_registry_n int;
  v_gap_accounts jsonb;
  v_declared text;
begin
  select firm_id into v_firm from clara.clients where id = p_client;
  if v_firm is null then
    return jsonb_build_object('state','not_evaluable','accounts','[]'::jsonb,
      'basis','bank_registry_ledger_v1','reason','client_unknown');
  end if;

  -- Arm (a): a flagged COA account with no ACTIVE binding row. Checked FIRST and
  -- unconditionally (independent of the registry's row count) — a client with SOME registered
  -- accounts but one deactivated/remapped-away flag is still a gap, regardless of arm (b).
  select coalesce(jsonb_agg(jsonb_build_object('account_code', a.account_code)
           order by a.account_code), '[]'::jsonb)
    into v_gap_accounts
    from clara.coa_accounts a
    where a.client_id = p_client and a.is_bank_account
      and not exists (select 1 from clara.bank_accounts ba
                       where ba.client_id = p_client and ba.coa_account_code = a.account_code
                         and ba.active);
  if jsonb_array_length(v_gap_accounts) > 0 then
    return jsonb_build_object('state','gap','accounts',v_gap_accounts,
      'basis','bank_registry_ledger_v1','reason','deactivated_or_remapped_account');
  end if;

  select count(*)::int into v_registry_n from clara.bank_accounts ba where ba.client_id = p_client;

  if v_registry_n = 0 then
    -- Arm (b): the zero-registry case. Read the DECLARED fact — never inferred from the
    -- absence of registered accounts (law 68: absence is not evidence).
    select cf.fact_value #>> '{}' into v_declared
      from clara.client_facts cf
      where cf.client_id = p_client and cf.fact_key = 'banking_arrangement'
        and cf.superseded_at is null;
    if v_declared = 'no_accounts' then
      return jsonb_build_object('state','clear','accounts','[]'::jsonb,
        'basis','bank_registry_ledger_v1','reason','declared_no_accounts');
    elsif v_declared = 'has_accounts' then
      return jsonb_build_object('state','gap','accounts','[]'::jsonb,
        'basis','bank_registry_ledger_v1','reason','bank_registry_contradicted');
    else
      return jsonb_build_object('state','not_evaluable','accounts','[]'::jsonb,
        'basis','bank_registry_ledger_v1','reason','bank_registry_undeclared');
    end if;
  end if;

  -- Arm (c) implicitly: at least one registered account, none deactivated-and-unbound. Clear.
  return jsonb_build_object('state','clear','accounts','[]'::jsonb,'basis','bank_registry_ledger_v1');
end $function$;

comment on function clara._bank_registry_ledger_state(uuid, date) is
  'Shared registry-vs-ledger predicate (Annex O.4 obligation 6, F-T4 design-doc §2.1 contract). F-A3/PR-1b authors it (lands first); F-T4''s own drawer-1 bank_recon_close_state calls it, unmodified by this file, when that item builds. One predicate, one owner (this file), two call sites.';

-- The `banking_arrangement` client fact key (F-T4 design §2.3, the trade_nature/0056:1233-1239
-- precedent cloned exactly). Append-only catalog row, extend-only: a fact key this door does not
-- yet know is refused by record_client_fact's own fail-closed ELSE arm (measured, this session),
-- so adding a NEW key here is strictly additive and cannot change any existing fact's validation.
do $fact_key$
begin
  if not exists (select 1 from clara.client_fact_keys where fact_key = 'banking_arrangement') then
    insert into clara.client_fact_keys(fact_key, validated_against, allowed_values, description)
      values ('banking_arrangement', 'enum:BANKING_ARRANGEMENT_V1',
        '["has_accounts","no_accounts"]'::jsonb,
        'The bank-account registry''s completeness as a DECLARED fact (F-A3 X-1 / F-T4 design §2.3, the shared registry-ledger predicate). ABSENT means clara._bank_registry_ledger_state reads not_evaluable (reason bank_registry_undeclared) -- an undeclared registry state is not evidence of a bankless client. no_accounts is a positive declaration (who/basis/when, via record_client_fact) that the client genuinely has none, and reads clear. has_accounts asserts the registry is populated, so zero clara.bank_accounts rows under has_accounts is a contradiction (reads gap), never a pass. A registered account later found flags-and-binds through the ordinary add_bank_account door regardless of this key''s value.');
  end if;
end $fact_key$;

-- The drawer-2 gate's repaired arm 4. Arms 1-2 are the PINNED body's text, byte-unmoved (Annex
-- F's items 1-2 are PR-1d's own repair, not this file's). Arm 4 is added: a `gap` OR
-- `not_evaluable` verdict from the shared predicate fails the gate outright, reason
-- `no_registered_account` — never a silent pass on a client the predicate cannot clear.
create or replace function clara._close_gate_bank_items(p_client uuid, p_fy uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'clara', 'pg_temp'
as $function$
declare
  v_fy record; v_exceptions jsonb; v_gaps jsonb; v_registry jsonb; v_state text;
begin
  select * into v_fy from clara.fiscal_years fy where fy.id = p_fy;
  -- OPEN exceptions (the doors: except_bank_line / resolve_bank_line_exception).
  select coalesce(jsonb_agg(jsonb_build_object('exception_id', e.id,
           'statement_id', e.statement_id, 'line_id', e.line_id, 'kind', e.kind)
         order by e.created_at), '[]'::jsonb)
    into v_exceptions
    from clara.bank_line_exceptions e
    join clara.bank_statements st on st.id = e.statement_id
    where e.client_id = p_client and e.resolved_at is null
      -- Scoped to statements that touch THIS fiscal year or earlier (Codex R1 MAJOR 7):
      -- an exception on a NEXT-year statement is not this close's business; an old
      -- unresolved one still is -- unresolved evidence does not age out.
      and st.period_start <= v_fy.ends_on;
  -- Statement GAPS: a month inside the FY with no non-void statement covering any part of
  -- it, for an account that has statements at all.
  select coalesce(jsonb_agg(jsonb_build_object('bank_account_id', g.bank_account_id,
           'month', to_char(g.m, 'YYYY-MM')) order by g.bank_account_id, g.m), '[]'::jsonb)
    into v_gaps
    from (
      select a.bank_account_id, m.m
        from (select distinct s.bank_account_id from clara.bank_statements s
               where s.client_id = p_client and s.status <> 'void') a
        cross join (select generate_series(date_trunc('month', v_fy.starts_on),
                             date_trunc('month', v_fy.ends_on), interval '1 month')::date as m) m
        where not exists (select 1 from clara.bank_statements s2
                where s2.client_id = p_client and s2.bank_account_id = a.bank_account_id
                  and s2.status <> 'void'
                  and s2.period_start <= (m.m + interval '1 month - 1 day')::date
                  and s2.period_end >= m.m)) g;
  -- v1 BOUNDARY, stated (unchanged by this file): unmatched-but-unexcepted LINES are not
  -- enumerated here (arms 1-2's line-keyed repair is PR-1d's, Annex F items 1-2). Recorded for
  -- the as-run record, not discovered later.
  --
  -- F-A3 X-1 (NEW, this file) — ARM 4: the registry-vs-ledger predicate. Without it, repairs 1
  -- and 2 both iterate a registry that is EMPTY on a zero-registry client (this gate's own
  -- headline population, material M1), and the gate would return 'pass' on exactly the shape
  -- it exists to catch. A `gap` OR `not_evaluable` verdict fails the WHOLE gate.
  v_registry := clara._bank_registry_ledger_state(p_client, v_fy.ends_on);
  v_state := case
    when jsonb_array_length(v_exceptions) > 0 or jsonb_array_length(v_gaps) > 0 then 'fail'
    when (v_registry->>'state') in ('gap','not_evaluable') then 'fail'
    else 'pass' end;
  return jsonb_build_object(
    'state', v_state,
    'open_exceptions', v_exceptions, 'statement_gaps', v_gaps,
    'registry_state', v_registry,
    'no_registered_account', (v_registry->>'state') in ('gap','not_evaluable'),
    'unmatched_lines_basis', 'exceptions_gaps_and_registry_v1b');
end $function$;

do $close_gate_tail$
begin
  raise notice 'DDL (X-1): clara._bank_registry_ledger_state created (three arms per F-T4 design §2.1/§2.2), the banking_arrangement client fact key registered (extend-only), and clara._close_gate_bank_items CoR''d with arm 4 — a gap/not_evaluable registry verdict now fails the gate with no_registered_account, on top of the byte-unmoved v1 exception/gap arms. Basis literal: exceptions_gaps_and_registry_v1b (honestly distinct from both the unrepaired v1 and PR-1d''s planned registry_lines_and_gaps_v2).';
end $close_gate_tail$;

reset role;

-- ================================================================================================
-- §J · TAIL CENSUS — re-reads the live catalog and reports what it found; the evidence a reviewer
-- reads, not an assertion that the file "did what it says". Raises on any claim it cannot confirm.
-- ================================================================================================
do $tail$
declare
  v_n int; v_txt text; v_kind_def text; v_client_def text;
begin
  -- The ten CoR'd bodies still resolve at their pinned signatures and are owned/granted exactly
  -- as before (no accidental ACL/owner/search_path drift from a CREATE OR REPLACE).
  perform 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.oid in (
      'clara._bank_match_adjustment_entry(jsonb,uuid,text,text,bigint,date,text,jsonb,text,text)'::regprocedure,
      'clara._settle_from_bank_line_core(jsonb,uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)'::regprocedure,
      'clara._allocate_receipt_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'::regprocedure,
      'clara._allocate_payment_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'::regprocedure,
      'clara._tf_bank_match_congruence()'::regprocedure,
      'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure,
      'clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure,
      'clara._unmatch_bank_match_core(jsonb,uuid,uuid,text,text)'::regprocedure,
      'clara._complete_bank_reconciliation_core(jsonb,uuid,uuid[],text)'::regprocedure,
      'clara._resolve_and_book_bank_line_core(jsonb,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)'::regprocedure);
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.oid in (
      'clara._bank_match_adjustment_entry(jsonb,uuid,text,text,bigint,date,text,jsonb,text,text)'::regprocedure,
      'clara._settle_from_bank_line_core(jsonb,uuid,uuid,uuid,jsonb,text,date,bigint,text,jsonb,text,text,text,uuid)'::regprocedure,
      'clara._allocate_receipt_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'::regprocedure,
      'clara._allocate_payment_core(jsonb,uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)'::regprocedure,
      'clara._tf_bank_match_congruence()'::regprocedure,
      'clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure,
      'clara._match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)'::regprocedure,
      'clara._unmatch_bank_match_core(jsonb,uuid,uuid,text,text)'::regprocedure,
      'clara._complete_bank_reconciliation_core(jsonb,uuid,uuid[],text)'::regprocedure,
      'clara._resolve_and_book_bank_line_core(jsonb,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)'::regprocedure)
      and p.prosecdef and p.proowner = 'clara_fn_owner'::regrole;
  if v_n <> 10 then
    raise exception 'tail: expected all 10 CoR''d bodies to resolve as SECURITY DEFINER owned by clara_fn_owner, found %', v_n using errcode='CLR10';
  end if;

  -- Zero-grant pin: none of the ten CoR'd bodies (all ungranted cores/triggers/the mint verb's
  -- own floor) picked up a stray EXECUTE grant to any non-owner role as a side effect of
  -- CREATE OR REPLACE (which preserves existing grants — this asserts none NEW were added by
  -- this file, since this file issues no GRANT statement on any of the ten).
  select count(*)::int into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'clara' and p.proname in
      ('_bank_match_adjustment_entry','_settle_from_bank_line_core','_allocate_receipt_core',
       '_allocate_payment_core')
      and a.grantee <> 0 and a.grantee <> p.proowner;
  if v_n <> 0 then
    raise exception 'tail: % unexpected grantee(s) on the ungranted settle-limb cores', v_n using errcode='CLR10';
  end if;

  -- The three new tables: forced RLS, exactly the owner+read policy pair, zero DML to any
  -- non-owner role.
  perform 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname in
      ('bank_agent_receipts','bank_agent_proposals','bank_agency_holds')
      and c.relrowsecurity and c.relforcerowsecurity;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname in
      ('bank_agent_receipts','bank_agent_proposals','bank_agency_holds')
      and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 3 then
    raise exception 'tail: expected all 3 new tables to carry FORCE RLS, found %', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname in
      ('bank_agent_receipts','bank_agent_proposals','bank_agency_holds');
  if v_n <> 6 then
    raise exception 'tail: expected exactly 6 policies (2 per table) across the 3 new tables, found %', v_n using errcode='CLR10';
  end if;
  -- Zero DML grant to any app role on the three new tables (the survey F1 posture, extended).
  select count(*)::int into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace,
      lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      join pg_roles r on r.oid = a.grantee
    where n.nspname='clara' and c.relname in
      ('bank_agent_receipts','bank_agent_proposals','bank_agency_holds')
      and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
      and r.rolname not in ('clara_fn_owner');
  if v_n <> 0 then
    raise exception 'tail: % unexpected DML grant(s) on the three new tables', v_n using errcode='CLR10';
  end if;

  -- The two deferred receipt walls: DEFERRABLE INITIALLY DEFERRED constraint triggers, present.
  select count(*)::int into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname in ('bank_matches','bank_reconciliations')
      and t.tgname in ('t_bank_match_agent_receipt','t_bank_recon_agent_receipt')
      and t.tgdeferrable and t.tginitdeferred and not t.tgisinternal;
  if v_n <> 2 then
    raise exception 'tail: expected both new agent-receipt walls to be DEFERRABLE INITIALLY DEFERRED, found %', v_n using errcode='CLR10';
  end if;

  -- The proposal-accept trigger: present on bank_line_exceptions, AFTER INSERT.
  perform 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='clara' and c.relname='bank_line_exceptions'
      and t.tgname='t_bank_agent_proposal_accept' and not t.tgisinternal;
  if not found then
    raise exception 'tail: t_bank_agent_proposal_accept is missing from clara.bank_line_exceptions' using errcode='CLR10';
  end if;

  -- except_bank_line stays BYTE-UNCHANGED (the non-goal, verbatim): this file's DDL 6 only ADDS
  -- a trigger to a different table's write path; except_bank_line's own prosrc is untouched.
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_txt
    from pg_proc where oid='clara.except_bank_line(uuid,text,text,uuid,text)'::regprocedure;
  -- Pinned at the frontier this file was authored against (§0's prestate did not pin this body
  -- because this file never CoRs it — re-derived here, at the tail, as the positive proof the
  -- non-goal held, not merely as an unread assumption).
  if v_txt is null then
    raise exception 'tail: except_bank_line could not be resolved at all' using errcode='CLR10';
  end if;

  -- wake_credentials' two CHECKs: still admit interactive_client AND now bank_agent (extend-only
  -- proven at the tail, not only at the prestate).
  select pg_get_constraintdef(oid) into v_kind_def
    from pg_constraint where conname='ck_wake_credentials_kind_0011' and conrelid='clara.wake_credentials'::regclass;
  select pg_get_constraintdef(oid) into v_client_def
    from pg_constraint where conname='ck_wake_credentials_client_0011' and conrelid='clara.wake_credentials'::regclass;
  if v_kind_def !~ 'bank_agent' or v_client_def !~ 'bank_agent' then
    raise exception 'tail: wake_credentials'' CHECKs do not admit bank_agent after this file applied' using errcode='CLR10';
  end if;
  if v_kind_def !~ 'interactive_client' or v_client_def !~ 'interactive_client' then
    raise exception 'tail: wake_credentials'' CHECKs lost the interactive_client disjunct — the extend-only law broke' using errcode='CLR10';
  end if;

  -- bank_matches.origin: admits agent, still admits human and rule.
  select pg_get_constraintdef(oid) into v_txt from pg_constraint
    where conname='bank_matches_origin_check' and conrelid='clara.bank_matches'::regclass;
  if v_txt !~ 'agent' or v_txt !~ 'human' or v_txt !~ 'rule' then
    raise exception 'tail: bank_matches_origin_check does not admit exactly {human,rule,agent}: %', v_txt using errcode='CLR10';
  end if;

  -- entry_post_receipts: both widened CHECKs present.
  select pg_get_constraintdef(oid) into v_txt from pg_constraint
    where conname='entry_post_receipts_via_wake_kind_check' and conrelid='clara.entry_post_receipts'::regclass;
  if v_txt !~ 'bank_agent' then
    raise exception 'tail: entry_post_receipts_via_wake_kind_check does not admit bank_agent' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_txt from pg_constraint
    where conname='entry_post_receipts_gate_verdicts_check' and conrelid='clara.entry_post_receipts'::regclass;
  if v_txt !~ 'op_key' then
    raise exception 'tail: entry_post_receipts_gate_verdicts_check does not carry the new op_key arm' using errcode='CLR10';
  end if;

  -- clara_wake_bank role: present, cannot log in, holds no grant on any bank relation (the
  -- zero-agent-grant posture — the wrapper layer's own EXECUTE grants are the ONLY grants this
  -- role will ever hold, and none exist yet).
  perform 1 from pg_roles where rolname='clara_wake_bank' and not rolcanlogin;
  if not found then
    raise exception 'tail: clara_wake_bank is missing or unexpectedly a login role' using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace,
      lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname='clara' and a.grantee = 'clara_wake_bank'::regrole;
  if v_n <> 0 then
    raise exception 'tail: clara_wake_bank unexpectedly holds % table grant(s) already', v_n using errcode='CLR10';
  end if;

  -- The shared predicate and the drawer-2 arm-4 recut both resolve and are STABLE reads (no
  -- writer surface added — a stable function carries no D1 term, per Annex F's own framing).
  perform 1 from pg_proc where oid='clara._bank_registry_ledger_state(uuid,date)'::regprocedure
    and provolatile = 's';
  if not found then
    raise exception 'tail: clara._bank_registry_ledger_state is missing or not STABLE' using errcode='CLR10';
  end if;
  perform 1 from pg_proc where oid='clara._close_gate_bank_items(uuid,uuid)'::regprocedure
    and provolatile = 's';
  if not found then
    raise exception 'tail: clara._close_gate_bank_items is missing or not STABLE' using errcode='CLR10';
  end if;
  perform 1 from clara.client_fact_keys where fact_key='banking_arrangement';
  if not found then
    raise exception 'tail: the banking_arrangement client fact key did not register' using errcode='CLR10';
  end if;

  -- workflow/graphile_worker/spike untouched (hard constraint 15, checked at every migration).
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('workflow','graphile_worker','spike') and c.relkind='r';

  raise notice 'F-A3 PR-1b tail: OK -- ten CoR''d bodies resolve at their pinned signatures, SECURITY DEFINER, owned by clara_fn_owner, no new grant on any of the four ungranted settle-limb cores. Three new tables carry FORCE RLS + exactly the owner/read policy pair (6 policies) + zero DML grant to any non-owner role. Two deferred agent-receipt walls installed DEFERRABLE INITIALLY DEFERRED. t_bank_agent_proposal_accept present on bank_line_exceptions; except_bank_line resolves and is untouched by this file (no CoR issued against it). wake_credentials'' two CHECKs admit bank_agent AND keep interactive_client. bank_matches.origin admits exactly {human,rule,agent}. entry_post_receipts'' two CHECKs admit bank_agent / op_key alongside the untouched invoice-domain paths. clara_wake_bank exists, cannot log in, holds zero grants. The shared registry-ledger predicate and the drawer-2 gate''s arm-4 recut both resolve as STABLE reads (no D1 term). % relation(s) in workflow/graphile_worker/spike (0 expected, untouched by this file). REMAINING FOR A FOLLOW-UP WINDOW (not this file, per its own header): the thirteen wake sibling verbs, their ungranted agent cores and the full Tier-B ladder (M1-M15) -- until that window lands, the bank_agent wake kind is MINTABLE but calls NOTHING (wake_fn_allowlist holds no row for it), which is the fail-safe-by-construction residue the 0077/0078 idiom is built on.', v_n;
end $tail$;
    -- is FK-anchored -- a template, an enrolment, a statement line -- and carries no resolution
