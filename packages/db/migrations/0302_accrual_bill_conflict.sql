-- 0302_accrual_bill_conflict — #938 (riders wave 4, lane 03): A BILL POSTS INSIDE AN ACCRUED
-- PERIOD, AND CLARA NOTICES.
-- =====================================================================================
-- Spec of record: issue #938's Agent Brief + the two 2026-09-18/09-19 triage comments on the
-- ticket. Parent #907 (owner ruling 2026-09-18). Domain words: CONTEXT.md — "Accrual adjustment",
-- "Accrual reversal", "Plan occurrence", "Settlement candidate row".
--
-- THE GAP THIS CLOSES. `reversing_journal` plans already reverse an accrual on the first day of
-- the month after it posts (0193's `clara._plan_reversal_date`), and that reversal correctly nets
-- an estimate against a bill that arrives in the FOLLOWING period. Nothing links a bill to an
-- OPEN accrual: a bill that arrives in the SAME period as its accrual is charged twice in that
-- period until the reversal runs, and nobody is told. This file adds the read that notices it and
-- the ONE new remedy door the ticket names that no existing door already offers.
--
-- THE SHAPE, RULED BY THE TICKET ITSELF (2026-09-19 comment). CONTEXT.md's "Settlement candidate
-- row" (landed with #657, PR #954) is a DERIVED row, computed from live facts on every read, with
-- no stored lifecycle, that clears itself the moment the underlying facts stop producing it and
-- offers candidates rather than choosing. The ticket's own newest comment rules #938's read a
-- member of that family in substance: "AC1's read is a live recomputation and not a stored Work,
-- question, task or notification, and it mints no new accounting_work.purpose." This file honours
-- that: no table, no `accounting_work.purpose`, no lifecycle column. It is NOT the #657/#947/#949
-- "settlement candidate" family's SHAPE itself — there is no bank line, no candidate OFFERING, no
-- settlement, nothing that clears when a settlement posts (an earlier wave's own gap analysis,
-- docs/plan/active/refresh-wave-2026-09-18/gap-657.md:205, reached the same reading independently
-- of this file). It is a NEIGHBOUR on the shared Needs-you roster, with its OWN row_kind.
--
-- =====================================================================================
-- THE FIRST MEASUREMENT: THE READ IS A NEW ARM ON `clara.list_review_queue`, NOT A NEW DOOR.
--
-- AC1 offers either shape ("a new door, or an arm on the existing accrual attention read"). No
-- "accrual attention read" exists on this base (measured: `to_regprocedure` finds no
-- `list_accrual_attention` or similar), and the ticket also asks the item to render under
-- "Needs you" — which is `clara.list_review_queue`, the ONE paginated multi-source queue the
-- estate actually ships (`apps/web/lib/firm/needs-you.ts`'s own header). This file therefore
-- splices a TWELFTH row_kind, `accrual_bill_conflict`, the same additive way #974 (0260) added the
-- eleventh: read the INSTALLED definition, splice a new CTE + union arm via `replace()` on the
-- live prosrc (never re-typed), re-verify every prior row_kind survived at its exact marker count.
--
-- `id` IS THE PLAN's OWN ID, DELIBERATELY NOT THE OCCURRENCE'S. Every prior "extra identity"
-- column (`asset_id`/`advance_id`/`authority_id`) mirrors the shared `id` column because that
-- entity's OWN id is what a caller needs back; this row's two remedies (`clara.skip_plan_occurrence`
-- below, and `clara.request_plan_catch_up`, both plan-lane doors) act on the PLAN, so `id` names
-- the plan and no new column joins the 28-wide shared vector at all — the smaller of the two
-- splice shapes this file's precedents demonstrate (0260's derived-from-`id` idiom, not 0146's
-- three-column-wide one). `period` carries the FLAGGED occurrence's own due date as ISO text
-- (never a formatted month), because a remedy must name the exact occurrence back, byte for byte.
-- AT MOST ONE ROW PER PLAN (`distinct on`): in ordinary use a plan has at most one open (posted,
-- unreversed) accrual occurrence at a time, and ties break on the earliest due date.
--
-- =====================================================================================
-- THE SECOND MEASUREMENT: "DOCUMENT-SOURCED" AND "INSIDE THE PERIOD" ARE BOTH MEASURED, NOT
-- ASSUMED.
--
-- `clara.journal_entries.origin='document'` IS the estate's own "document-sourced" predicate
-- (0009's `_draft_entry_core`: `v_origin := case when p_document is not null then 'document' …`,
-- `ck_je_doc_pair` ties it to a non-null `document_id`). The candidate entry must also hit the
-- accrual's OWN expense account (`clara.accrual_adjustments.expense_account_code`, joined by
-- (plan_id, revision) so a corrected accrual's later revision reads its OWN particulars rather
-- than an earlier one's) and be a LIVE approved entry (`reversed_by is null`).
--
-- THE PERIOD BOUNDARY IS THE SAME EXPRESSION `clara._plan_covered_through` (0193:992) ALREADY
-- USES — `period_key + step_months - 1 day`, step from the LIVE-AT-ADMISSION revision's own
-- `frequency` (monthly/quarterly/annual) — inlined here rather than called, because that function
-- answers a different question (the plan's high-water mark) and this file does not want a second
-- caller silently coupled to it. It is deliberately NOT `clara._plan_reversal_date`: that function
-- answers "when does the SCHEDULED reversal fall" (always the first of the next CALENDAR month,
-- 0193:837, whatever the plan's frequency), not "how long is this accrual's own PERIOD" — a
-- quarterly accrual's period is three months, and conflating the two would flag a bill in month 2
-- of a quarter as "next period" when it plainly is not.
--
-- THE DOCUMENT'S OWN SERVICE PERIOD IS THE SECOND ROUTE (AC1's "or the document's service period
-- when one is recorded"): `clara.document_service_periods` (0140), LIVE rows only
-- (`superseded_by is null`), overlap-tested against the accrual's own period window. Neither route
-- is required to prove the other; either is sufficient.
--
-- =====================================================================================
-- THE THIRD MEASUREMENT: "NOT YET REVERSED" IS A ROW EXISTENCE CHECK, NEVER A DATE COMPARISON.
--
-- The flagged case is exactly the one the ticket's own body names: "a bill that arrives in the
-- SAME period as its accrual" — which structurally means the scheduled reversal (always the
-- FOLLOWING calendar month) is very often not yet due either. This file does not gate on that: it
-- checks whether a `leg='reversal'` occurrence sharing the SAME `period_key` has been ADMITTED
-- (`work_id is not null`), which is true whether the reversal is not yet due, is due but not yet
-- swept, or was refused (a refused reversal occurrence carries `work_id is null`, so a refusal
-- does not clear the flag — money has not moved). The moment a reversal for that period IS
-- admitted, the row disappears on the next read with no cleanup: the derived-row law.
--
-- =====================================================================================
-- THE FOURTH MEASUREMENT: "REVERSE NOW" NEEDS NO NEW DOOR; "SKIP THE NEXT OCCURRENCE" DOES.
--
-- AC2 says "add a skip-one-occurrence door IF NONE EXISTS" — naming ONE new door, not two. "Reverse
-- now" rides `clara.request_plan_catch_up` (0193, UNCHANGED, UNTOUCHED by this file) exactly as a
-- bookkeeper already can from the plan lane today: the web layer calls it with a window from the
-- flagged occurrence's own due date through its scheduled reversal date. When the reversal is
-- already due (the common case once the accrual itself has posted and the period has closed), the
-- door admits it and the flagged row clears on the next read; when it genuinely is not yet due
-- (the mid-period case), the SAME door's own `catch_up_in_future` refusal answers honestly rather
-- than the UI pretending an early reversal happened. Nothing here recuts, widens or nests that
-- door differently than any other caller does.
--
-- "SKIP THE NEXT OCCURRENCE" HAS NO EXISTING DOOR: the plan lane can pause a whole plan or catch
-- one period up, but nothing lets a human take exactly ONE future due date off the schedule while
-- the rest keeps running. `clara.skip_plan_occurrence` is that door. IT NEVER RECUTS THE FROZEN
-- ADMISSION CORE (`clara._plan_admit_occurrence`, pinned below, UNTOUCHED): it uses the SAME hook
-- that already stops the automatic scan from re-selecting a due date, measured directly off
-- `clara._plan_admissible_event` (0193:1077-1150), the ONE candidate picker `wake_due_plan_occurrences`
-- calls — its primary-candidate arm requires BOTH `not exists (… due_date = v_dp)` AND
-- `not exists (… period_key = …)` to already be true before it will ever offer that date again.
-- Writing an `accounting_plan_occurrences` row for the target due date (leg `primary`, `work_id`
-- NULL, `outcome.state = 'skipped'`) satisfies the first predicate outright, so the automatic scan
-- never re-offers that date. `clara._tf_plan_occurrences_append_only` (0193:709-780) admits the row
-- exactly as it admits any other work_id-less occurrence: `old.work_id is not null` gates BOTH of
-- its raising arms, and a skip marker's `old.work_id` is always NULL, so a later DELIBERATE catch-up
-- naming that exact date can still override the skip and admit it — a human's explicit choice, not
-- a bypass. This is data, not a recut: the admission core's OWN law (an existing occurrence row for
-- a due date converges rather than duplicating) is what makes the marker binding, and it is
-- unmoved by this file (pinned below, re-hashed in the tail).
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--
-- · IT MINTS NO NEW `accounting_work.purpose` AND NO NEW TABLE — the ticket's own ruling, honoured
--   literally: the read is one new CTE on an existing function; the only new relation touched by a
--   WRITE is `clara.accounting_plan_occurrences`, already writable by the admission core this
--   file's skip door imitates.
-- · IT DOES NOT RECUT `clara._plan_admit_occurrence`, `clara._plan_admissible_event`,
--   `clara._plan_reversal_date`, `clara._plan_due_events`, `clara._plan_primary_for_reversal`,
--   `clara.request_plan_catch_up`, `clara.wake_due_plan_occurrences` or any other 0193 body. Every
--   one this file's own skip door depends on is pinned below and re-hashed in the tail.
-- · IT DOES NOT WIDEN `clara.request_plan_catch_up`'s CONTRACT to admit an occurrence before its
--   own due date: "reverse now" is bounded by that door's own `catch_up_in_future` wall, unchanged.
-- · IT DOES NOT SKIP THE FLAGGED OCCURRENCE ITSELF — an already-posted accrual cannot be
--   un-admitted; `skip_plan_occurrence` only ever targets a FUTURE due date with no occurrence row
--   yet, which is what "the next occurrence" names.
-- =====================================================================================

-- =====================================================================================
-- §0 PRESTATE. Every claim re-read from the live catalog; every body this file depends on pinned
--    by pre-image sha256(prosrc) MEASURED on THIS lane database moments ago (packages/db/README's
--    "measured, never transcribed" law) — no ticket earlier in this lane touched any of them.
-- =====================================================================================
do $t938_pre$
declare v_sha text; v_def text; v_code text; v_n int; v_raw_n int; r record;
begin
  if to_regclass('clara.accounting_plan_occurrences') is null
     or to_regclass('clara.accounting_plan_revisions') is null
     or to_regclass('clara.accrual_adjustments') is null
     or to_regclass('clara.journal_entries') is null
     or to_regclass('clara.journal_lines') is null
     or to_regclass('clara.operation_receipts') is null
     or to_regclass('clara.document_service_periods') is null then
    raise exception '#938 prestate: the 0140/0178/0193/0222 cohort is absent -- those files must apply first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_review_queue(jsonb,jsonb,integer)') is null then
    raise exception '#938 prestate: clara.list_review_queue is GONE' using errcode='CLR10';
  end if;
  if to_regprocedure('clara.skip_plan_occurrence(uuid,date,text,text)') is not null then
    raise exception '#938 prestate: clara.skip_plan_occurrence already exists' using errcode='CLR10';
  end if;

  -- THE SPLICE TARGET'S PRE-IMAGE, measured off pg_proc.prosrc on THIS rig moments before this
  -- file was written -- this body is a splice (0016 -> 0017 -> 0036 -> 0041 -> 0043 -> 0146(retired
  -- by 0288) -> 0168 -> 0180 -> 0260), never any one migration's own CREATE text.
  --
  -- BIMODAL, NOT A HARD PIN (fix round 1, ADV-01). A single exact sha on THIS body collides with
  -- the rest of its own wave: several lanes splice their own `row_kind` onto
  -- clara.list_review_queue at the same time, and whichever of them carries a LOWER migration
  -- number applies FIRST -- after which a hard pin here can never be satisfied and the integrated
  -- chain dies at this file (measured: lane 01's 0297 recuts this body from this file's own
  -- pre-image to a315367fbd897e9422a6d809ae00c5d446a2c387cedcba4b73268c68ad44565e). The pin is
  -- kept as the RECOGNISED baseline; a body that has merely gained a SIBLING arm is admitted on
  -- its STRUCTURE instead -- this file's own row kind absent, and the two CTE seams it splices
  -- between unique -- with §A's own witness roster (every kind this file must not disturb, at its
  -- exact count) as the second half of the same proof. The row-kind marker is searched in the
  -- COMMENT-STRIPPED body for the 0146/0180/0260 HIGH-1 reason: a marker hiding inside a comment
  -- must not count.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid='clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  if v_sha = 'f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69' then
    raise notice '#938 prestate: clara.list_review_queue is at this file''s own measured pre-image (%).', v_sha;
  else
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
      where p.oid='clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
    v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    if position($$'accrual_bill_conflict'::text row_kind$$ in v_code) <> 0 then
      raise exception '#938 prestate: clara.list_review_queue ALREADY carries this file''s own row kind -- 0302 is not re-appliable in place'
        using errcode='CLR10';
    end if;
    for r in select * from (values ('  ), all_rows as ('), ('  ), keyed as (')) as t(seam) loop
      v_n := (length(v_code) - length(replace(v_code, r.seam, ''))) / length(r.seam);
      v_raw_n := (length(v_def) - length(replace(v_def, r.seam, ''))) / length(r.seam);
      if v_n <> 1 or v_raw_n <> v_n then
        raise exception '#938 prestate: the CTE seam "%" appears % time(s) IN CODE / % in RAW text (expected 1/1) -- this file cannot splice into a body it cannot locate', r.seam, v_n, v_raw_n
          using errcode='CLR10';
      end if;
    end loop;
    raise notice '#938 prestate: clara.list_review_queue is NOT at this file''s pinned pre-image (measured %) -- a sibling lane of the same wave spliced its own arm first. Admitted on STRUCTURE: this file''s own row kind is absent and both CTE seams are unique.', v_sha;
  end if;

  -- THE NINE BODIES clara.skip_plan_occurrence DEPENDS ON AND MUST NOT CHANGE, pinned the same way.
  for v_def, v_sha in
    select * from (values
      ('clara._plan_door_ctx(uuid,integer)',
       '97bd6c12ed368f7a2e5f2c96b548f7d77c6a49e603210203e282a011310e289b'),
      ('clara._plan_due_index_on_or_before(date,text,text,integer,date)',
       'edd611e5d5a1da8da88aaf0ac4dcc13c411f1d4aef98ec16cba8947bd47d692d'),
      ('clara._plan_due_nth(date,text,text,integer,integer)',
       'f224852215086025ee405e344e6ec549ec9399acd2ccf6ed11251e5e772cf20e'),
      ('clara._plan_occurrence_period_key(date,date,text,text,integer,date,text)',
       '6d9f60d345da4df4f4e237746b5e875d746a785892af24f4a316d0f8bbeac63f'),
      ('clara._human_ctx(integer)',
       'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'),
      ('clara._reserve_op(uuid,text,text,bytea)',
       '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'),
      ('clara._finish_op(uuid,text,text,jsonb)',
       'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'),
      ('clara._hash(jsonb)',
       '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'),
      ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
       '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'),
      ('clara.role_rank(text)',
       '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#938 prestate: % does not resolve', v_def using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) is distinct from v_sha then
      raise exception '#938 prestate: % has DRIFTED from its measured pre-image -- re-measure before applying', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- THE FROZEN ADMISSION CORE AND ITS NEIGHBOURS, PINNED AS NON-REGRESSION (this file calls
  -- NONE of them; the skip door's binding depends only on their LAW, re-asserted in the tail's
  -- own behavioural probe).
  for v_def, v_sha in
    select * from (values
      ('clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
       'a34744199379ebf9fbdcbbd19cd68768ef228409533f19dfcf0daa0c3393ec46'),
      ('clara._plan_admissible_event(uuid)',
       '3b569e338f1c1ff563c61a2185db7198c565c804bf66c92fa941c06a4470f4b3'),
      ('clara._tf_plan_occurrences_append_only()',
       'ace3fedbb60c3a14f46de00874c018565b38a14cb93483591394d86ff06f471c')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_def) is null then
      raise exception '#938 prestate: % does not resolve', v_def using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
         where p.oid = v_def::regprocedure) is distinct from v_sha then
      raise exception '#938 prestate: % has DRIFTED from its measured pre-image -- re-measure before applying', v_def
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#938 prestate: clean -- clara.list_review_queue is at this file''s pinned pre-image OR admitted on structure (see the branch notice above), clara.skip_plan_occurrence is absent, and the nine bodies the new door depends on are all at their measured pre-images.';
end
$t938_pre$;

set role clara_fn_owner;
set local lock_timeout = '5s';

-- =====================================================================================
-- §A THE SPLICE — clara.list_review_queue gains row_kind='accrual_bill_conflict'. Additive only:
--    reads the INSTALLED definition, splices the new CTE and its union arm at the body's own two
--    CTE seams (never at a literal block that names the arms that happened to exist when this file
--    was written -- fix round 1, ADV-01), and re-verifies every one of the ten pre-existing row
--    kinds plus the new one, in code AND raw text (the 0146/0180/0260 HIGH-1 guard: a marker
--    hiding inside a comment must not count), with the shared column vector asserted as a MEASURED
--    +1 delta rather than an absolute count.
-- =====================================================================================
do $t938_lrq$
declare
  v_sig text := 'clara.list_review_queue(jsonb,jsonb,integer)';
  v_def text; v_next text; v_code text; v_repl text;
  v_n int; v_raw_n int; r record; v_vector_pre int; v_open text; v_keyed text;
  v_pre_owner text; v_pre_acl text; v_post_owner text; v_post_acl text;
  v_pre_sha text; v_post_sha text;
begin
  select pg_get_functiondef(p.oid), p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_def, v_pre_owner, v_pre_acl, v_pre_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');

  -- WITNESS ROSTER, BEFORE. Every kind this splice must not disturb, at its exact pre-splice
  -- marker count, both in code and in raw text.
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1), ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1), ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1), ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1), ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'work_question'::text row_kind$$, 1), ($$'depreciation_authority_pending'::text row_kind$$, 1)
      ) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#938 splice prestate: marker "%" appears % time(s) IN CODE, expected %', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
    v_raw_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_raw_n <> v_n then
      raise exception '#938 splice prestate (HIGH-1): marker "%" appears % time(s) in RAW text but % IN CODE', r.marker, v_raw_n, v_n
        using errcode='CLR10';
    end if;
  end loop;

  -- THE SHARED COLUMN VECTOR, MEASURED rather than pinned at a literal (fix round 1, ADV-01).
  -- Every arm of this body ends in the same trailing column, so a SIBLING lane's arm moves the
  -- count. What this file asserts is therefore the DELTA -- exactly one more afterwards -- never
  -- an absolute. The floor of ten is the ten arms the ten row kinds above guarantee.
  v_vector_pre := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
                  / length('null::int open_proposal_count');
  v_raw_n := (length(v_def) - length(replace(v_def, 'null::int open_proposal_count', '')))
             / length('null::int open_proposal_count');
  if v_vector_pre < 10 or v_raw_n <> v_vector_pre then
    raise exception '#938 splice prestate: the shared column vector appears % time(s) IN CODE / % in RAW text (expected at least 10, and equal)', v_vector_pre, v_raw_n
      using errcode='CLR10';
  end if;

  -- THE TWO SEAMS, NOT A LITERAL BLOCK (fix round 1, ADV-01). The old anchor was the whole
  -- `all_rows` union list, which NAMES every arm that existed when this file was written -- so a
  -- sibling lane's arm landing at a LOWER migration number made it match zero times and killed the
  -- integrated chain at this file. The insertion is derived from the two seams instead: the CTE is
  -- placed immediately BEFORE the `all_rows` opener and the union arm immediately BEFORE the
  -- `keyed` opener. That composes with any number of sibling arms in either order and produces
  -- the BYTE-IDENTICAL body the literal anchor produced on a clean base.
  v_open := '  ), all_rows as (';
  v_keyed := '  ), keyed as (';
  for r in select * from (values (v_open), (v_keyed)) as t(seam) loop
    v_n := (length(v_code) - length(replace(v_code, r.seam, ''))) / length(r.seam);
    v_raw_n := (length(v_def) - length(replace(v_def, r.seam, ''))) / length(r.seam);
    if v_n <> 1 or v_raw_n <> v_n then
      raise exception '#938 splice: the CTE seam "%" appears % time(s) IN CODE / % in RAW text (expected 1/1) -- re-derive against the live body', r.seam, v_n, v_raw_n
        using errcode='CLR10';
    end if;
  end loop;
  if position(v_open in v_def) >= position(v_keyed in v_def) then
    raise exception '#938 splice: the all_rows seam does not precede the keyed seam -- this is not the body this file knows how to splice'
      using errcode='CLR10';
  end if;

  v_repl := $bill$  ), bill_rows as (
    -- #938 (0302): A DOCUMENT-SOURCED ENTRY POSTS INSIDE AN ACCRUAL'S OWN PERIOD WHILE THE
    -- ACCRUAL HAS POSTED AND ITS REVERSAL HAS NOT (see the migration header for the full law).
    -- `id` IS THE PLAN's OWN ID (the two remedies act on the plan); `period` carries the flagged
    -- occurrence's own due date as ISO text. AT MOST ONE ROW PER PLAN.
    select distinct on (o.plan_id)
      1 section_rank,'accrual_bill_conflict'::text row_kind,'needs_you'::text section,
      o.client_id,null::uuid counterparty_id,null::uuid filing_id,je.id entry_id,
      null::uuid question_id,null::uuid task_id,je.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,o.admitted_at aged_since,
      aa.amount_cents,to_char(o.due_date,'YYYY-MM-DD') period,
      format('A document-sourced entry posted inside the accrued period %s to %s for "%s"',
        to_char(o.period_key,'YYYY-MM-DD'),to_char(pw.period_end,'YYYY-MM-DD'),aa.purpose) question_text,
      o.admitted_at created_at,o.plan_id id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.accounting_plan_occurrences o
    join clara.accounting_plan_revisions r on r.plan_id=o.plan_id and r.revision=o.revision
    join clara.accrual_adjustments aa on aa.plan_id=o.plan_id and aa.revision=o.revision
    join clara.clients active_accrual_client on active_accrual_client.id=o.client_id and active_accrual_client.status='active'
    cross join lateral (
      select (o.period_key
              + (case r.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end)
                * interval '1 month' - interval '1 day')::date as period_end
    ) pw
    join clara.journal_entries je on je.firm_id=c.firm and je.client_id=o.client_id
      and je.status='approved' and je.origin='document' and je.document_id is not null
      and je.reversed_by is null
      and exists (select 1 from clara.journal_lines jl
                   where jl.entry_id=je.id and jl.account_code=aa.expense_account_code)
      and (
        je.posting_date between o.period_key and pw.period_end
        or exists (select 1 from clara.document_service_periods dsp
                     where dsp.document_id=je.document_id and dsp.superseded_by is null
                       and dsp.period_start<=pw.period_end and dsp.period_end>=o.period_key)
      )
    where o.firm_id=c.firm and o.leg='primary' and o.work_id is not null
      and (v_client is null or o.client_id=v_client)
      and exists (select 1 from clara.operation_receipts rc
                   where rc.work_id=o.work_id and rc.outcome='committed')
      and not exists (select 1 from clara.accounting_plan_occurrences ro
                       where ro.plan_id=o.plan_id and ro.leg='reversal' and ro.period_key=o.period_key
                         and ro.work_id is not null)
    order by o.plan_id,o.due_date,je.posting_date,je.id
$bill$;
  v_next := replace(v_def, v_open, v_repl || v_open);
  v_next := replace(v_next, v_keyed,
    '    union all select * from bill_rows' || chr(10) || v_keyed);
  if position('union all select * from bill_rows' in v_next) = 0
     or position('  ), bill_rows as (' in v_next) = 0 then
    raise exception '#938 splice: the two seams did not rewrite' using errcode='CLR10';
  end if;

  if v_next = v_def then
    raise exception '#938 splice: no byte moved -- refusing a no-op apply' using errcode='CLR10';
  end if;

  execute v_next;

  select p.proowner::regrole::text, p.proacl::text,
         encode(sha256(pg_get_functiondef(p.oid)::bytea),'hex')
    into v_post_owner, v_post_acl, v_post_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
    raise exception '#938 postcheck: list_review_queue changed owner (% -> %) or ACL (% -> %)',
      v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode='CLR10';
  end if;
  if v_post_sha = v_pre_sha then
    raise exception '#938 postcheck: prosrc sha256 did not change -- the splice was a no-op' using errcode='CLR10';
  end if;

  v_code := regexp_replace(regexp_replace(
    (select pg_get_functiondef(p.oid) from pg_proc p where p.oid = v_sig::regprocedure),
    '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  for r in select * from (values
      ($$'draft'::text row_kind$$, 1), ($$'uncoded_filing'::text row_kind$$, 1),
      ($$'open_question'::text row_kind$$, 1), ($$'coding_task'::text row_kind$$, 1),
      ($$'compliance_watch'::text row_kind$$, 1), ($$'lint_finding'::text row_kind$$, 1),
      ($$'fixed_asset_incomplete'::text row_kind$$, 1), ($$'staff_advance_incomplete'::text row_kind$$, 1),
      ($$'work_question'::text row_kind$$, 1), ($$'depreciation_authority_pending'::text row_kind$$, 1),
      ($$'accrual_bill_conflict'::text row_kind$$, 1)
      ) as t(marker, want) loop
    v_n := (length(v_code) - length(replace(v_code, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception '#938 postcheck: marker "%" appears % time(s), expected % -- the splice was not additive', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;
  -- The shared column vector gains EXACTLY ONE more `open_proposal_count` occurrence (bill_rows'
  -- own trailing column) -- a DELTA against what was measured before the splice, never a literal
  -- (fix round 1, ADV-01: a sibling lane's arm carries the same column).
  v_n := (length(v_code) - length(replace(v_code, 'null::int open_proposal_count', '')))
         / length('null::int open_proposal_count');
  if v_n <> v_vector_pre + 1 then
    raise exception '#938 postcheck: the shared column vector appears % time(s), expected % (one more than the % measured before the splice)', v_n, v_vector_pre + 1, v_vector_pre
      using errcode='CLR10';
  end if;

  raise notice '#938: clara.list_review_queue spliced -- one bill_rows CTE (needs_you/needs_you, active-client-guarded, at most one row per plan), one union arm; the ten pre-existing row kinds survive at their EXACT pre-splice marker counts and the shared column vector went % -> % (+1, measured); owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_vector_pre, v_n, v_post_owner, v_pre_sha, v_post_sha;
end
$t938_lrq$;

-- =====================================================================================
-- §B clara.skip_plan_occurrence — bookkeeper+, clara_authenticated ONLY. Removes exactly ONE
--    future due date from a plan's automatic schedule by writing the SAME shape of
--    `accounting_plan_occurrences` row an admission would (leg `primary`, `work_id` NULL), which
--    is the row `clara._plan_admissible_event`'s primary-candidate arm already treats as "already
--    handled" (see the migration header's FOURTH MEASUREMENT). RUNG 1 is the same
--    `clara.accounting_plans` row lock every other plan-lane writer takes.
-- =====================================================================================
create function clara.skip_plan_occurrence(
    p_plan uuid, p_after_due date, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_actor uuid; v_firm uuid; v_ctx record; p clara.accounting_plans; r record;
  v_dedupe jsonb; v_result jsonb;
  v_k int; v_next_k int; v_next_due date; v_period date; v_occ uuid;
begin
  if p_op_key is null or p_op_key ~ '^\s*$' then
    raise exception 'skipping a plan occurrence requires its idempotency key' using errcode='CLR10',
      detail='{"reason":"invalid_op_key","constraint":"nonempty"}';
  end if;
  if p_after_due is null then
    raise exception 'skipping a plan occurrence names the due date it follows' using errcode='CLR10',
      detail='{"reason":"invalid_request","field":"after_due","constraint":"required"}';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'skipping a plan occurrence records why' using errcode='CLR10',
      detail='{"reason":"invalid_request","field":"reason","constraint":"nonempty"}';
  end if;

  -- THE FLOOR, WITH A TYPED REASON (the create_accrual_adjustment / correct_accrual_adjustment
  -- idiom: `clara._plan_door_ctx` raises a bare CLR04/CLR11 and a surface cannot classify it).
  begin
    select * into v_ctx from clara._plan_door_ctx(p_plan, clara.role_rank('bookkeeper')) c;
  exception when sqlstate 'CLR04' then
    raise exception 'skipping a plan occurrence requires an active bookkeeper or above'
      using errcode='CLR04',
        detail=jsonb_build_object('reason',
          case when clara.jwt_sub() is null then 'no_authenticated_actor'
               when clara.jwt_firm() is null then 'actor_not_active'
               else 'insufficient_role' end)::text;
  end;
  v_actor := v_ctx.actor; v_firm := v_ctx.firm; p := v_ctx.pl;

  v_dedupe := clara._reserve_op(v_firm, 'skip_plan_occurrence', p_op_key,
    clara._hash(jsonb_build_object('plan', p_plan, 'after_due', p_after_due)));
  if v_dedupe is not null then
    if v_dedupe ? 'pending' then
      raise exception 'this skip key is held by an in-flight sibling' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;
  end if;

  perform 1 from clara.accounting_plans where id = p_plan for update; -- RUNG 1
  select * into p from clara.accounting_plans where id = p_plan;
  if p.status <> 'active' then
    raise exception 'only an active plan''s next occurrence can be skipped' using errcode='CLR10',
      detail=jsonb_build_object('reason',
        case p.status when 'paused' then 'plan_paused' else 'plan_ended' end)::text;
  end if;
  select * into r from clara.accounting_plan_revisions where plan_id = p_plan and superseded_at is null;
  if not found then
    raise exception 'this plan has no live revision' using errcode='CLR13',
      detail='{"reason":"no_live_revision"}';
  end if;

  v_k := clara._plan_due_index_on_or_before(r.effective_from, r.frequency, r.day_rule,
           r.day_of_month, p_after_due);
  if v_k is null
     or clara._plan_due_nth(r.effective_from, r.frequency, r.day_rule, r.day_of_month, v_k) <> p_after_due then
    raise exception 'this plan''s schedule has no occurrence due on %', to_char(p_after_due,'YYYY-MM-DD')
      using errcode='CLR10', detail='{"reason":"accrual_occurrence_not_found","field":"after_due"}';
  end if;
  v_next_k := v_k + 1;
  v_next_due := clara._plan_due_nth(r.effective_from, r.frequency, r.day_rule, r.day_of_month, v_next_k);
  if v_next_due is null then
    raise exception 'this plan''s schedule has no next occurrence to skip' using errcode='CLR10',
      detail='{"reason":"no_next_occurrence"}';
  end if;
  if v_next_due < r.effective_from or v_next_due > coalesce(r.effective_to, 'infinity'::date) then
    raise exception 'the next occurrence falls outside this plan''s authority window' using errcode='CLR10',
      detail=jsonb_build_object('reason','outside_authority_window',
        'effective_from', to_char(r.effective_from,'YYYY-MM-DD'),
        'effective_to', case when r.effective_to is null then null else to_char(r.effective_to,'YYYY-MM-DD') end)::text;
  end if;

  v_period := clara._plan_occurrence_period_key(p.authority_from, r.effective_from, r.frequency,
                r.day_rule, r.day_of_month, v_next_due, 'primary');

  if exists (select 1 from clara.accounting_plan_occurrences o
              where o.plan_id = p_plan and o.due_date = v_next_due)
     or exists (select 1 from clara.accounting_plan_occurrences o
                 where o.plan_id = p_plan and o.leg = 'primary' and o.period_key = v_period) then
    raise exception 'the next occurrence is already admitted or already skipped' using errcode='CLR13',
      detail='{"reason":"period_already_admitted"}';
  end if;

  insert into clara.accounting_plan_occurrences(firm_id, client_id, plan_id, revision, leg,
      due_date, period_key, attempt, intent_key, outcome)
    values (p.firm_id, p.client_id, p.id, r.revision, 'primary', v_next_due, v_period, 1,
      'skip:' || p.id::text || ':' || to_char(v_next_due,'YYYY-MM-DD'),
      jsonb_build_object('state','skipped','reason',btrim(p_reason),'skipped_by',v_actor,'at',now()))
    returning id into v_occ;

  perform clara._audit(v_firm, v_actor, null, null, 'skip_plan_occurrence', null,
    jsonb_build_object('plan', p_plan, 'occurrence', v_occ, 'due_date', to_char(v_next_due,'YYYY-MM-DD'),
      'reason', btrim(p_reason), 'op_key', p_op_key));

  v_result := jsonb_build_object('plan_id', p_plan, 'occurrence_id', v_occ,
    'due_date', to_char(v_next_due,'YYYY-MM-DD'), 'leg', 'primary', 'skipped', true);
  return clara._finish_op(v_firm, 'skip_plan_occurrence', p_op_key, v_result);
end $$;
revoke all on function clara.skip_plan_occurrence(uuid,date,text,text) from public;
grant execute on function clara.skip_plan_occurrence(uuid,date,text,text) to clara_authenticated;

comment on function clara.skip_plan_occurrence(uuid,date,text,text) is
  '#938: skip exactly ONE future due date of an active plan''s primary schedule, named as the '
  'occurrence AFTER `p_after_due` (an existing due date of the same schedule). Writes an '
  'accounting_plan_occurrences row for that date carrying no work_id and outcome.state=''skipped'', '
  'which is the same row shape clara._plan_admissible_event''s primary-candidate arm already treats '
  'as handled -- so the automatic scan (clara.wake_due_plan_occurrences) never re-offers that date. '
  'A later DELIBERATE clara.request_plan_catch_up naming that exact date can still override the skip '
  '(a human''s explicit choice), because the admission core''s own law (an existing row for a due '
  'date converges rather than duplicating) is what makes the marker binding, and this door touches '
  'no other body. bookkeeper+; idempotent on (firm, skip_plan_occurrence, op_key); never touches the '
  'CURRENT (already posted) occurrence, only a future one with no occurrence row yet.';

reset role;

-- =====================================================================================
-- §C TAIL CENSUS. Re-reads the live catalog rather than trusting the blocks above ran as written.
-- =====================================================================================
do $t938_tail$
declare v_sha text; v_src text; v_posture text; v_n int; r record; v_marker text;
begin
  -- 1 · the new door resolves at exactly the signature the grant and the web layer name.
  if to_regprocedure('clara.skip_plan_occurrence(uuid,date,text,text)') is null then
    raise exception '#938 tail: clara.skip_plan_occurrence(uuid,date,text,text) does not resolve'
      using errcode='CLR10';
  end if;

  -- 2 · posture and ACL: SECURITY DEFINER, clara_fn_owner, pinned search_path, clara_authenticated
  --     alone -- no PUBLIC, no clara_runtime (no OBO twin -- this is a human-only lane, the same
  --     posture clara.correct_accrual_adjustment carries), no agent read lane, no wake role.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>')
    into v_posture from pg_proc p
   where p.oid = 'clara.skip_plan_occurrence(uuid,date,text,text)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner | true | search_path=clara, pg_temp' then
    raise exception '#938 tail: the door''s posture is not the expected SECURITY DEFINER shape -- got {%}', v_posture
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.skip_plan_occurrence(uuid,date,text,text)'::regprocedure, 'execute') then
    raise exception '#938 tail: clara_authenticated cannot execute the skip door' using errcode='CLR10';
  end if;
  foreach v_marker in array array['public','clara_runtime','clara_agent_ro','clara_agent_rw',
      'clara_wake_interactive','clara_wake_scan','clara_wake_document','clara_wake_reconcile'] loop
    if to_regrole(v_marker) is not null and has_function_privilege(v_marker,
          'clara.skip_plan_occurrence(uuid,date,text,text)'::regprocedure, 'execute') then
      raise exception '#938 tail: % can execute the skip door -- this is a bookkeeper-human-only lane', v_marker
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 · the house shape, as independent tokens in the body.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.skip_plan_occurrence(uuid,date,text,text)'::regprocedure;
  foreach v_marker in array array['clara._plan_door_ctx(p_plan, clara.role_rank(''bookkeeper''))',
      'clara._reserve_op(', 'clara._finish_op(', 'clara._audit(', 'for update',
      'clara._plan_due_index_on_or_before(', 'clara._plan_due_nth(',
      'clara._plan_occurrence_period_key(', 'accrual_occurrence_not_found', 'no_next_occurrence',
      'outside_authority_window', 'period_already_admitted', '''skipped'''] loop
    if position(v_marker in v_src) = 0 then
      raise exception '#938 tail: the skip door is missing "%"', v_marker using errcode='CLR10';
    end if;
  end loop;
  -- …and it never calls the admission core directly -- it writes a marker row, it does not admit.
  if position('_plan_admit_occurrence' in v_src) <> 0 then
    raise exception '#938 tail: the skip door must not call clara._plan_admit_occurrence' using errcode='CLR10';
  end if;

  -- 4 · THIS FILE RECUT NOTHING it merely depends on -- re-hashed against the same nine pins.
  for r in select * from (values
      ('clara._plan_door_ctx(uuid,integer)',
       '97bd6c12ed368f7a2e5f2c96b548f7d77c6a49e603210203e282a011310e289b'),
      ('clara._plan_due_index_on_or_before(date,text,text,integer,date)',
       'edd611e5d5a1da8da88aaf0ac4dcc13c411f1d4aef98ec16cba8947bd47d692d'),
      ('clara._plan_due_nth(date,text,text,integer,integer)',
       'f224852215086025ee405e344e6ec549ec9399acd2ccf6ed11251e5e772cf20e'),
      ('clara._plan_occurrence_period_key(date,date,text,text,integer,date,text)',
       '6d9f60d345da4df4f4e237746b5e875d746a785892af24f4a316d0f8bbeac63f'),
      ('clara._human_ctx(integer)',
       'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'),
      ('clara._reserve_op(uuid,text,text,bytea)',
       '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'),
      ('clara._finish_op(uuid,text,text,jsonb)',
       'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'),
      ('clara._hash(jsonb)',
       '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'),
      ('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
       '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'),
      ('clara.role_rank(text)',
       '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'),
      ('clara._plan_admit_occurrence(uuid,date,text,text,boolean)',
       'a34744199379ebf9fbdcbbd19cd68768ef228409533f19dfcf0daa0c3393ec46'),
      ('clara._plan_admissible_event(uuid)',
       '3b569e338f1c1ff563c61a2185db7198c565c804bf66c92fa941c06a4470f4b3')
    ) as t(sig, sha)
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.sha then
      raise exception '#938 tail: % MOVED while this file applied -- it must not have (got %)', r.sig, v_sha
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#938 tail: OK -- clara.skip_plan_occurrence resolves, is SECURITY DEFINER owned by clara_fn_owner with a pinned search_path, granted to clara_authenticated alone (no PUBLIC, no clara_runtime, no agent read lane, no wake role); its body carries the door-context floor, the reservation/receipt pair, the audit call, the schedule arithmetic, every named refusal token and the ''skipped'' outcome state, and never calls the admission core directly; the eleven bodies this file depends on (nine called, two non-regression) hash byte-identically to their measured pre-images.';
end
$t938_tail$;


-- =====================================================================================
-- §D BEHAVIOURAL PROBE (0146/0260's forced-rollback idiom): proves the INSTALLED
--    clara.list_review_queue actually returns the new row for a same-period, document-sourced
--    bill hitting the accrual's own expense account, that admitting the reversal clears it with
--    no cleanup, and that clara.skip_plan_occurrence's marker stops clara._plan_admissible_event
--    from ever offering the skipped date again -- built and discarded so nothing synthetic
--    survives past this migration's own commit. The accrual's plan/revision/particulars and the
--    two journal entries are hand-written rows of the tables they claim to be (every NOT-NULL
--    column and CHECK constraint measured on this rig before this file was written); the "accrual
--    posted" Work is minted through the REAL clara.admit_journal_work door rather than a hand
--    INSERT, because clara.accounting_work carries its own birth trigger that only a real
--    admission door satisfies -- exactly the reason a hand INSERT into that one relation is
--    refused everywhere else in this estate too. The FULL cell battery (every remedy, role floor,
--    active-client guard, next-period-does-not-surface) lives in
--    packages/db/tests/accrual-bill-conflict.test.mjs, driven entirely through the real
--    accrual/plan doors including the full post-to-committed-receipt pipeline
--    (claim_work_run / mint_wake_credential / wake_record_journal_entry / settle_work_run); this
--    probe is the narrower "did the splice change runtime behaviour at all" proof the migration
--    itself carries.
-- =====================================================================================
do $t938_probe$
declare
  v_firm uuid; v_client uuid; v_user uuid; v_plan uuid; v_revision int; v_due date;
  v_period_key date; v_expense text := '6100'; v_liability text := '2020'; v_payable text := '2050';
  v_entry uuid; v_bill uuid; v_doc uuid; v_filing uuid; v_work uuid; v_task uuid; v_queue jsonb; v_row jsonb;
  v_skip jsonb; v_payload_digest text; v_admit jsonb;
begin
  begin
    v_user := gen_random_uuid();
    insert into clara.users(id, display_name) values (v_user, '938-accrual-bill-conflict probe');
    insert into clara.firms(id, name) values (gen_random_uuid(), '938-accrual-bill-conflict probe firm')
      returning id into v_firm;
    insert into clara.firm_memberships(firm_id, user_id, role, status)
      values (v_firm, v_user, 'admin', 'active');
    insert into clara.clients(firm_id, name, status)
      values (v_firm, '938-accrual-bill-conflict probe client', 'active')
      returning id into v_client;
    insert into clara.coa_accounts(firm_id, client_id, account_code, name, account_type)
      values (v_firm, v_client, v_expense, 'Rent expense (probe)', 'expense'),
             (v_firm, v_client, v_liability, 'Accruals (probe)', 'liability'),
             (v_firm, v_client, v_payable, 'Trade Creditors (probe)', 'liability');

    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user)::text, true);

    -- A PLAN, ITS FIRST REVISION AND THE ACCRUAL PARTICULARS, HAND-WRITTEN (every NOT NULL column
    -- and CHECK the live catalog carries, measured on this rig before this file was written) --
    -- narrower than the full create_accrual_adjustment ceremony the dedicated battery drives.
    v_plan := gen_random_uuid();
    insert into clara.accounting_plans(id, firm_id, client_id, kind, status, purpose,
        authority_kind, authority_ref, authorised_by, authority_from, current_revision, created_by)
      values (v_plan, v_firm, v_client, 'reversing_journal', 'active', '938 probe accrual',
        'explicit_instruction', jsonb_build_object('kind','explicit_instruction'), v_user,
        '2026-01-01', 1, v_user);
    v_due := date '2026-01-31';
    v_period_key := date '2026-01-01';
    insert into clara.accounting_plan_revisions(plan_id, firm_id, client_id, plan_kind, revision,
        frequency, day_rule, day_of_month, timezone, effective_from, effective_to, basis,
        basis_digest, auto_reverse, reversal_day_rule, created_by)
      values (v_plan, v_firm, v_client, 'reversing_journal', 1, 'monthly', 'last_day_of_month', null,
        'Asia/Kuala_Lumpur', '2026-01-01', '2026-02-28',
        jsonb_build_object('posting_date', to_char(v_due,'YYYY-MM-DD'), 'memo', 'accrual',
          'currency', 'MYR', 'lines', jsonb_build_array(
            jsonb_build_object('account_code', v_expense, 'debit_cents', 100000, 'credit_cents', 0),
            jsonb_build_object('account_code', v_liability, 'debit_cents', 0, 'credit_cents', 100000))),
        encode(sha256('938-probe-revision-basis'::bytea),'hex'), true, 'next_period_first_day', v_user)
      returning revision into v_revision;
    insert into clara.accrual_adjustments(firm_id, client_id, plan_id, revision, purpose,
        expense_account_code, liability_account_code, amount_cents, currency, effective_from,
        effective_to, service_period_start, service_period_end, term_source, method,
        authority_kind, authority_ref, instruction, recorded_by)
      values (v_firm, v_client, v_plan, v_revision, '938 probe office rent accrual',
        v_expense, v_liability, 100000, 'MYR', '2026-01-01', '2026-02-28',
        -- THE STATED TERM BRACKETS THE WHOLE AUTHORITY WINDOW (0222's SIXTH MEASUREMENT,
        -- ck_accrual_adjustments_window_in_term): Jan through Feb, so BOTH the flagged Jan
        -- occurrence and the skip test's Feb "next occurrence" sit inside it.
        '2026-01-01', '2026-02-28', 'human_stated', jsonb_build_object('rule','stated_amount'),
        'explicit_instruction', jsonb_build_object('kind','explicit_instruction'),
        '938 probe instruction', v_user);

    -- THE ACCRUAL "POSTS": a real approved journal entry, a real accounting_work row born through
    -- the door that owns its birth trigger (clara.admit_journal_work -- never a hand INSERT into
    -- that one relation, which is refused everywhere else in this estate too), and a real
    -- COMMITTED operation_receipts row naming the entry.
    insert into clara.journal_entries(id, firm_id, client_id, status, posting_date, memo, origin,
        maker_actor)
      values (gen_random_uuid(), v_firm, v_client, 'draft', v_due, '938 probe accrual entry',
        'agent', v_user)
      returning id into v_entry;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents)
      values (v_entry, 1, v_client, v_firm, v_expense, 100000, 0),
             (v_entry, 2, v_client, v_firm, v_liability, 0, 100000);
    update clara.journal_entries set status='approved', checker_actor=v_user, approved_at=now()
      where id = v_entry;

    v_admit := clara.admit_journal_work(v_client, v_user, '938-probe-work',
      jsonb_build_object('posting_date', to_char(v_due,'YYYY-MM-DD'), 'memo', 'accrual',
        'currency', 'MYR', 'lines', jsonb_build_array(
          jsonb_build_object('account_code', v_expense, 'debit_cents', 100000, 'credit_cents', 0),
          jsonb_build_object('account_code', v_liability, 'debit_cents', 0, 'credit_cents', 100000))),
      'user_direct', '[]'::jsonb, 'clara-938-probe');
    v_work := (v_admit ->> 'work_id')::uuid;
    if v_work is null then
      raise exception '#938 BEHAVIOURAL probe: admit_journal_work returned no work_id (got %)', v_admit
        using errcode='CLR10';
    end if;
    select current_task_id into v_task from clara.accounting_work where id = v_work;

    v_payload_digest := encode(sha256('938-probe-receipt-payload'::bytea),'hex');
    insert into clara.operation_receipts(firm_id, client_id, work_id, task_id, purpose,
        logical_op_id, payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest,
        run_id, outcome, effects)
      values (v_firm, v_client, v_work, v_task, 'journal_entry', gen_random_uuid()::text,
        v_payload_digest, v_user, v_user, 'interactive', '938-probe-bundle', '938-probe-run',
        'committed', jsonb_build_object('entry_id', v_entry::text));

    insert into clara.accounting_plan_occurrences(firm_id, client_id, plan_id, revision, leg,
        due_date, period_key, attempt, intent_key, work_id, admitted_at, outcome)
      values (v_firm, v_client, v_plan, v_revision, 'primary', v_due, v_period_key, 1,
        '938-probe-primary', v_work, now(), jsonb_build_object('state','admitted','at',now()));

    -- A DOCUMENT-SOURCED BILL, SAME PERIOD, SAME EXPENSE ACCOUNT.
    insert into clara.documents(id, firm_id, sha256)
      values (gen_random_uuid(), v_firm, encode(sha256('938-probe-bill-doc'::bytea),'hex'))
      returning id into v_doc;
    -- ck_je_document_filing_pair pairs document_id with filing_id: a real filing, `basis`
    -- 'legacy-0007' so no resolution_id is owed.
    insert into clara.document_filings(id, firm_id, document_id, client_id, basis)
      values (gen_random_uuid(), v_firm, v_doc, v_client, 'legacy-0007')
      returning id into v_filing;
    insert into clara.journal_entries(id, firm_id, client_id, status, posting_date, memo, origin,
        document_id, filing_id, source_doc_sha256, maker_actor)
      values (gen_random_uuid(), v_firm, v_client, 'draft', date '2026-01-15',
        '938 probe bill entry', 'document', v_doc, v_filing,
        (select sha256 from clara.documents where id = v_doc), v_user)
      returning id into v_bill;
    insert into clara.journal_lines(entry_id, line_no, client_id, firm_id, account_code, debit_cents, credit_cents)
      values (v_bill, 1, v_client, v_firm, v_expense, 95000, 0),
             (v_bill, 2, v_client, v_firm, v_payable, 0, 95000);
    update clara.journal_entries set status='approved', checker_actor=v_user, approved_at=now()
      where id = v_bill;

    -- THE READ SURFACES IT.
    v_queue := clara.list_review_queue(jsonb_build_object('client_id', v_client), null, 50);
    select rw into v_row from jsonb_array_elements(v_queue -> 'rows') rw
      where rw ->> 'row_kind' = 'accrual_bill_conflict' limit 1;
    if v_row is null then
      raise exception '#938 BEHAVIOURAL probe: no accrual_bill_conflict row for a same-period document-sourced bill -- the splice did not change runtime behaviour'
        using errcode='CLR10';
    end if;
    if (v_row ->> 'id')::uuid <> v_plan then
      raise exception '#938 BEHAVIOURAL probe: the row''s id is not the plan id (got %, expected %)', v_row ->> 'id', v_plan
        using errcode='CLR10';
    end if;
    if v_row ->> 'period' <> to_char(v_due,'YYYY-MM-DD') then
      raise exception '#938 BEHAVIOURAL probe: the row''s period is not the flagged occurrence''s own due date (got %)', v_row ->> 'period'
        using errcode='CLR10';
    end if;
    if v_row ->> 'section' <> 'needs_you' or v_row ->> 'lane' <> 'needs_you' then
      raise exception '#938 BEHAVIOURAL probe: section/lane are not both needs_you (got section=%, lane=%)',
        v_row ->> 'section', v_row ->> 'lane' using errcode='CLR10';
    end if;
    if (v_row ->> 'entry_id')::uuid <> v_bill then
      raise exception '#938 BEHAVIOURAL probe: entry_id does not name the conflicting bill (got %, expected %)',
        v_row ->> 'entry_id', v_bill using errcode='CLR10';
    end if;

    -- ADMITTING THE REVERSAL CLEARS THE ROW (the derived-row law: no cleanup, it just stops
    -- being produced). A second real Work, minted the same way, stands in for its own accrual's
    -- worth of posting -- the read's "not yet reversed" test is an occurrence-row EXISTENCE check
    -- (leg='reversal', period_key match, work_id not null), so the receipt's own content is moot.
    v_admit := clara.admit_journal_work(v_client, v_user, '938-probe-reversal-work',
      jsonb_build_object('posting_date', '2026-02-01', 'memo', 'reversal',
        'currency', 'MYR', 'lines', jsonb_build_array(
          jsonb_build_object('account_code', v_liability, 'debit_cents', 100000, 'credit_cents', 0),
          jsonb_build_object('account_code', v_expense, 'debit_cents', 0, 'credit_cents', 100000))),
      'user_direct', '[]'::jsonb, 'clara-938-probe');
    v_work := (v_admit ->> 'work_id')::uuid;
    insert into clara.accounting_plan_occurrences(firm_id, client_id, plan_id, revision, leg,
        due_date, period_key, attempt, intent_key, work_id, admitted_at, outcome, reverses_entry_id)
      values (v_firm, v_client, v_plan, v_revision, 'reversal', date '2026-02-01', v_period_key, 1,
        '938-probe-reversal', v_work, now(), jsonb_build_object('state','admitted','at',now()), v_entry);
    v_queue := clara.list_review_queue(jsonb_build_object('client_id', v_client), null, 50);
    if exists (select 1 from jsonb_array_elements(v_queue -> 'rows') rw
                where rw ->> 'row_kind' = 'accrual_bill_conflict') then
      raise exception '#938 BEHAVIOURAL probe: the row survived an admitted reversal -- the read does not exclude a reversed period'
        using errcode='CLR10';
    end if;

    -- clara.skip_plan_occurrence STOPS THE NEXT OCCURRENCE FROM EVER BEING OFFERED AGAIN.
    if clara._plan_admissible_event(v_plan) is null
       or (clara._plan_admissible_event(v_plan) ->> 'due_date') <> '2026-02-28' then
      raise exception '#938 BEHAVIOURAL probe: before skip, the next admissible event is not Feb''s accrual (got %)',
        clara._plan_admissible_event(v_plan) using errcode='CLR10';
    end if;
    v_skip := clara.skip_plan_occurrence(v_plan, v_due, '938 probe: vendor now bills directly',
      '938-probe-skip');
    if (v_skip ->> 'due_date') <> '2026-02-28' or (v_skip ->> 'skipped')::boolean is not true then
      raise exception '#938 BEHAVIOURAL probe: skip_plan_occurrence answered unexpectedly (got %)', v_skip
        using errcode='CLR10';
    end if;
    if clara._plan_admissible_event(v_plan) is not null then
      raise exception '#938 BEHAVIOURAL probe: the skipped date is still offered by _plan_admissible_event (got %)',
        clara._plan_admissible_event(v_plan) using errcode='CLR10';
    end if;

    perform set_config('request.jwt.claims', '', true);

    -- Force the subtransaction to unwind so no fixture row (and no local GUC change) survives
    -- past this migration's own commit -- the 0018/0019/0020/0146/0260 CLR99-probe idiom.
    raise exception 'clara_938_probe_rollback' using errcode='CLR99';
  exception
    when sqlstate 'CLR99' then null; -- expected: fixtures discarded
  end;
  raise notice '#938 BEHAVIOURAL probe OK: a same-period document-sourced bill produced exactly one accrual_bill_conflict row (id=plan_id, period=the flagged due date, needs_you/needs_you, entry_id=the bill); admitting the reversal cleared it with no cleanup; clara.skip_plan_occurrence marked the next occurrence and clara._plan_admissible_event never offered it again. Fixtures discarded.';
end
$t938_probe$;
