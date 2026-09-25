-- 0350_via_wake_kind_lane_disclosure — #1058 (riders sweep wave, lane 07): A CATALOG COMMENT ON
-- clara.entry_post_receipts.via_wake_kind, PLUS THIS FILE'S OWN README SECTION, DISCLOSE THAT THE
-- COLUMN NOW CARRIES NON-WAKE POSTING-LANE VALUES ALONGSIDE ITS ORIGINAL WAKE-CREDENTIAL KINDS —
-- THE DOCUMENTATION PATH, NEVER THE RENAME.
-- =====================================================================================
-- Spec of record: issue #1058's Agent Brief (source: wave4-lane01-ticket946.md, follow-up 5;
-- originating ticket #946) asks for a rename of the column (and every reader/writer) so its name
-- no longer implies "wake kind only". The owner's ruling comment on the ticket (2026-09-24,
-- "Ruling applied under the owner's delegation of 2026-09-23 (riders sweep wave, SWEEP-PLAN.md)")
-- and this lane's own scan (SWEEP-PLAN.md, the #1058 row of "Owner questions, with a recommended
-- ruling") both refuse the rename and take this file's path instead: "Correct the column's own
-- comment and the README instead: a one-line `comment on` migration plus a README section, in
-- the sweep wave's lane L7." This file takes that path only. No column, constraint, table or any
-- reader/writer of the column is renamed. The CHECK on
-- clara.entry_post_receipts.via_wake_kind is untouched — pinned in the prestate and re-measured
-- in the tail, byte for byte.
--
-- =====================================================================================
-- WHY NO RENAME, MEASURED RATHER THAN RESTATED.
--
-- `via_wake_kind` appears across roughly 118 source files (the ruling's own count; not
-- re-measured here) and in NINE frozen workflow files, confirmed by this file's own grep of
-- packages/runtime/workflows/*.ts: autoDraft.v9.usage.ts, bankAgent.v1.usage.ts,
-- chatTurn.v13.post.ts, chatTurn.v13.usage.ts, chatTurn.v14.usage.ts, chatTurn.v15.freeform.ts,
-- chatTurn.v15.infra.ts, chatTurn.v15.usage.ts, closePrep.v1.usage.ts. THREE of those carry PROSE
-- about this very column that a rename would strand as a lie the moment it shipped:
-- chatTurn.v13.post.ts:22-23 ("WHAT `via_wake_kind` SAYS ON A CHAT POST..."),
-- chatTurn.v15.freeform.ts:203 ("The `via_wake_kind` recorded is the kind `freeformScoped`
-- actually mints...") and chatTurn.v15.infra.ts:106 ("...the tool's metering row (which
-- `via_wake_kind` to RECORD)..."). A frozen workflow body is never edited (this WO's rule 5;
-- `node scripts/check-frozen-workflows.mjs` must show no manifest diff), so those three files'
-- prose can never be corrected to a new name — a rename would leave them describing a column that
-- no longer exists under that name. TWO more of the nine (bankAgent.v1.usage.ts:120,
-- closePrep.v1.usage.ts:91) build SQL that calls clara.record_agent_usage_event (0110:365-370)
-- with the NAMED parameter `p_via_wake_kind => $10` — a DIFFERENT door's own parameter, which
-- must keep its spelling for exactly the same reason.
--
-- THE WIDENING ITSELF, measured live on this lane database (clara_l09) before this file applies:
-- `entry_post_receipts_via_wake_kind_check` admits FIVE values. `autodraft`/`interactive` are
-- 0106's original wake-only pair. `bank_agent` (0121) is a THIRD genuine wake-credential kind —
-- added alongside `wake_credentials`' own two CHECKs gaining the identical disjunct in the SAME
-- file (0121:268-273), so it is not the naming drift this ticket is about. `payroll_facts`
-- (0297/#946) and `contract_facts` (0299/#948) ARE the drift: each names a posting LANE, not a
-- wake credential — 0297's own header (packages/db/migrations/0297_payroll_summary_posting.sql:
-- 849-864) says the vocabulary "was closed to the three WAKE kinds" before the payroll lane
-- existed, and a payroll run wakes no model and holds no wake credential at all; 0299 widens the
-- same CHECK the same way for the agreement/tenancy contract lane
-- (packages/db/migrations/0299_agreement_contract_acquisition.sql:2605-2629, tail-asserted at
-- 3343-3347). Two of the five live values are posting-lane names wearing a wake-only column name —
-- the fact this file's comment and README section disclose.
--
-- =====================================================================================
-- WHY DOCUMENTATION, AND WHY A CATALOG COMMENT SPECIFICALLY.
--
-- A catalog comment (readable by ANY client of pg_attribute/pg_class, including a human at
-- `\d+ clara.entry_post_receipts` or an agent reading the schema) is this estate's existing idiom
-- for "the one statement about a column every reader can find" —
-- `tests/admit-autodraft-task-outcome-disclosure.test.mjs`'s own precedent for a
-- documentation-over-rename/enum-widening ruling
-- (packages/db/migrations/0349_admit_autodraft_task_outcome_disclosure.sql), itself following
-- `clara.create_client`'s #1038 closure comment
-- (packages/db/migrations/0316_create_client_human_grant_withdrawn.sql). The README section is
-- the second, slower-to-find place the same fact lives, for a reader who greps
-- packages/db/README.md before the catalog.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT CHANGE, PINNED IN THE PRESTATE AND RE-MEASURED IN THE TAIL.
--
-- clara.entry_post_receipts.via_wake_kind keeps its name, its type (text) and its ordinal
-- position. `entry_post_receipts_via_wake_kind_check` is byte-identical before and after — no new
-- admitted value, no value removed. No table, column, index, trigger, grant, RLS policy or
-- reader/writer anywhere is renamed or recut. This file mints NO new function, table or other
-- catalog name, so it owes NO packages/db/tests/rig-meta.mjs cohort entry (the shared-files rule's
-- own qualifier: "one cohort entry per migration that mints a new name" — this one mints none).
--
-- Windows/portability note: this file uses no sha256(prosrc) pin (it recuts no function body);
-- the only measured pre-image is the CHECK constraint's own `pg_get_constraintdef`, read live.
-- =====================================================================================

set local statement_timeout = '5min';
set local lock_timeout = '15s';

-- =================================================================================================
-- §0 — PRESTATE. Every premise this file relies on, MEASURED on the live catalog before anything
-- changes, and re-measured in the tail. Measured on riders lane 07's database (clara_l09) at 312
-- applied migrations / 0349_admit_autodraft_task_outcome_disclosure, this lane's own frontier —
-- never transcribed from a creating migration's own header.
-- =================================================================================================
create temporary table _p1058_pre (k text primary key, v jsonb) on commit drop;

do $pre$
declare
  v_comment text;
  v_check text;
  v_cols int;
  v_mode text;
begin
  -- (a) THE COLUMN EXISTS, UNRENAMED, AS text. This file never recuts it; the tail re-measures
  -- the SAME name and type.
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'clara.entry_post_receipts'::regclass
       and attname = 'via_wake_kind' and not attisdropped
  ) then
    raise exception '#1058 prestate: clara.entry_post_receipts.via_wake_kind is absent' using errcode='CLR10';
  end if;

  -- (b) THE CHECK constraint is the exact 5-value enumeration this file relies on and does NOT
  -- widen or narrow — the 0299 (#948) live state, autodraft/interactive/bank_agent/payroll_facts/
  -- contract_facts, no more and no fewer.
  select pg_get_constraintdef(c.oid) into v_check from pg_constraint c
   where c.conrelid = 'clara.entry_post_receipts'::regclass
     and c.conname = 'entry_post_receipts_via_wake_kind_check';
  if v_check is distinct from
     'CHECK ((via_wake_kind = ANY (ARRAY[''autodraft''::text, ''interactive''::text, ''bank_agent''::text, ''payroll_facts''::text, ''contract_facts''::text])))' then
    raise exception '#1058 prestate: entry_post_receipts_via_wake_kind_check is not the expected 5-value enumeration (got %) -- this file documents the live widening and must not proceed against a drifted constraint', v_check
      using errcode='CLR10';
  end if;
  insert into _p1058_pre values ('check_def', to_jsonb(v_check));

  -- (c) Annex E.1's column count is still 14 -- this file adds no column, drops none.
  select count(*) into v_cols from pg_attribute
   where attrelid = 'clara.entry_post_receipts'::regclass and attnum > 0 and not attisdropped;
  if v_cols <> 14 then
    raise exception '#1058 prestate: clara.entry_post_receipts has % columns, expected Annex E.1''s 14', v_cols
      using errcode='CLR10';
  end if;
  insert into _p1058_pre values ('col_count', to_jsonb(v_cols));

  -- (d) FIRST OR REDO, AND NEVER HALF OF EITHER. `comment on column ... is '...'` is naturally
  -- idempotent (create-or-replace-shaped: it always sets, never appends), so the ONLY two sane
  -- states are "no comment yet" (FIRST) or "already carries exactly #1058's own comment" (REDO,
  -- #957). Any OTHER non-null comment is a foreign comment this file refuses to clobber.
  select col_description('clara.entry_post_receipts'::regclass,
    (select attnum from pg_attribute
      where attrelid='clara.entry_post_receipts'::regclass and attname='via_wake_kind'))
    into v_comment;
  if v_comment is null then
    v_mode := 'FIRST';
  elsif v_comment like '#1058:%' then
    v_mode := 'REDO';
    raise notice '#1058 prestate: clara.entry_post_receipts.via_wake_kind already carries a #1058 comment — this is a REDO (#957) over this file''s own effects.';
  else
    raise exception '#1058 prestate: clara.entry_post_receipts.via_wake_kind already carries a FOREIGN catalog comment this file will not overwrite: %', v_comment
      using errcode='CLR10';
  end if;
  insert into _p1058_pre values ('mode', to_jsonb(v_mode));

  raise notice '#1058 prestate: clean (%) -- clara.entry_post_receipts.via_wake_kind is present as text, carries no foreign catalog comment, entry_post_receipts_via_wake_kind_check is the expected 5-value enumeration, and the table carries its expected 14 columns.',
    v_mode;
end $pre$;

-- =================================================================================================
-- §A — THE CHANGE. A catalog comment only. No CREATE OR REPLACE, no rename, no DDL on the CHECK
-- constraint. REDO-safe by construction (#957): a `comment on` statement always sets the comment
-- fresh, so a second run over this file's own effects reads back identically.
-- =================================================================================================
comment on column clara.entry_post_receipts.via_wake_kind is
  '#1058: NOT renamed -- kept for 118 readers/writers across the codebase and nine frozen workflow files, three of which (chatTurn.v13.post.ts, chatTurn.v15.freeform.ts, chatTurn.v15.infra.ts) carry prose about this exact column that a rename would strand, while bankAgent.v1.usage.ts and closePrep.v1.usage.ts build SQL naming a DIFFERENT door''s p_via_wake_kind parameter (clara.record_agent_usage_event, 0110) that must keep its own spelling. Despite the name, this column now admits two values that are NOT wake-credential kinds at all: payroll_facts (0297/#946) and contract_facts (0299/#948) each name the POSTING LANE that authorised the receipt, not a wake credential -- a payroll run or an agreement acquisition wakes no model and holds no wake credential. The three genuine wake-credential kinds remain autodraft, interactive and bank_agent. Read entry_post_receipts_via_wake_kind_check for the live enumeration.';

-- =================================================================================================
-- §T — TAIL. Every premise re-measured, never trusted.
-- =================================================================================================
do $tail$
declare
  v_comment text;
  v_check text;
  v_cols int;
  v_type text;
begin
  -- T.1 · THE COLUMN IS UNRENAMED AND UNCHANGED IN TYPE.
  select format_type(atttypid, atttypmod) into v_type from pg_attribute
   where attrelid = 'clara.entry_post_receipts'::regclass and attname = 'via_wake_kind' and not attisdropped;
  if v_type is distinct from 'text' then
    raise exception '#1058 tail T.1: clara.entry_post_receipts.via_wake_kind moved off text (got %) -- this file must not change its type', v_type
      using errcode='CLR10';
  end if;

  -- T.2 · THE CHECK CONSTRAINT IS BYTE-FOR-BYTE UNMOVED — no widening, no narrowing, no rename.
  select pg_get_constraintdef(c.oid) into v_check from pg_constraint c
   where c.conrelid='clara.entry_post_receipts'::regclass and c.conname='entry_post_receipts_via_wake_kind_check';
  if to_jsonb(v_check) is distinct from (select v from _p1058_pre where k = 'check_def') then
    raise exception '#1058 tail T.2: entry_post_receipts_via_wake_kind_check moved while this file applied -- it must not have (got %)', v_check
      using errcode='CLR10';
  end if;

  -- T.3 · THE COLUMN COUNT IS UNMOVED — Annex E.1's 14, still.
  select count(*) into v_cols from pg_attribute
   where attrelid='clara.entry_post_receipts'::regclass and attnum>0 and not attisdropped;
  if to_jsonb(v_cols) is distinct from (select v from _p1058_pre where k = 'col_count') then
    raise exception '#1058 tail T.3: clara.entry_post_receipts'' column count moved while this file applied (got %, expected %)', v_cols,
      (select v from _p1058_pre where k = 'col_count')
      using errcode='CLR10';
  end if;

  -- T.4 · THE COMMENT IS SET AND NAMES THE TICKET, BOTH NON-WAKE LANES, AND THE NO-RENAME RULING.
  select col_description('clara.entry_post_receipts'::regclass,
    (select attnum from pg_attribute
      where attrelid='clara.entry_post_receipts'::regclass and attname='via_wake_kind'))
    into v_comment;
  if v_comment is null or v_comment not like '#1058:%' then
    raise exception '#1058 tail T.4: clara.entry_post_receipts.via_wake_kind does not carry the expected #1058 catalog comment (got %)', v_comment
      using errcode='CLR10';
  end if;
  if position('payroll_facts' in v_comment) = 0 or position('contract_facts' in v_comment) = 0 then
    raise exception '#1058 tail T.4: the catalog comment must name both payroll_facts and contract_facts (got %)', v_comment
      using errcode='CLR10';
  end if;
  if position('NOT renamed' in v_comment) = 0 then
    raise exception '#1058 tail T.4: the catalog comment must plainly say the column is NOT renamed (got %)', v_comment
      using errcode='CLR10';
  end if;

  raise notice '#1058 tail: OK -- clara.entry_post_receipts.via_wake_kind carries the #1058 catalog comment (naming payroll_facts, contract_facts and the no-rename ruling), is unrenamed and still text, entry_post_receipts_via_wake_kind_check is byte-identical to the measured pre-image five-value enumeration, and the table still carries its expected 14 columns.';
end $tail$;
