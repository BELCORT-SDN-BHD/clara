-- 0047_settle_guard_identity.sql -- §7-A FINDING F1: the drafted-settlement guard stops
-- reading a TIME-VARYING STATUS as an IDENTITY FACT.
--
-- GOVERNING LAW: docs/plan/wave-7a-contract.md (7A-R1..R12, ADR-063) and CLAUDE.md's
-- review/evidence law 2 ("absence is not evidence, and a derived state is not evidence").
-- ACCEPTANCE EVIDENCE OF RECORD: the §7-A Half-2 sandbox campaign, 2026-08-07 05:41Z-07:16Z,
-- FINDING F1 -- reproduced 3 times out of 3 unattended posts.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md). 0047 is
-- the WORKING number; the frontier probe below pins 0046_wave_7a_sales_lane as the applied
-- predecessor.
--
-- WHAT WENT WRONG, IN ONE PARAGRAPH. §7-A is the first wave in which the SAME journal entry
-- is produced by the unattended drafter and consumed by the unattended poster in the same
-- instant. autoDraft_v6 drafts entry E; the event-driven rule-post consumer posts E about
-- 100 ms later, so E.status flips 'draft' -> 'approved'; autoDraft_v6's settle step then
-- calls settle_autodraft_task(..., 'drafted', E, ...) and the guard below refuses, because
-- it required E to still BE a draft. Measured consequence: the workflow run fails on
-- attempt 4, the agent_task strands 'running' with its token reservation charged, and the
-- reconciler's autodraft terminal edge then re-raises the SAME CLR11 on every leader cycle
-- -- 52 "LEADER cycle-error draft settlement entry not found" occurrences in one 25-minute
-- window, with document dispatch, matching, sweeps, the adjustments belt, FA runs and SST
-- watches all starved behind it until a human cancelled a task they had no reason to know
-- existed. The runtime never self-heals, because the reconciler IS the thing that is stuck.
--
-- WHY IT IS LAW 2'S SHAPE, AND WHAT REPLACES IT. The guard asked "is this entry still a
-- draft?" and treated the answer as proof of "did this task produce this entry". The
-- entry's IDENTITY -- id + firm + client + filing, all four already in the predicate --
-- is what proves authorship; `status='draft'` is a derived, time-varying projection that
-- proves nothing about authorship and adds only a race.
--
-- THE LIVENESS INTENT SURVIVES, EXPRESSED AS AN IDENTITY FACT. The status term is not
-- dropped outright; it is widened to "still a draft OR posted by a rule":
--
--     and (e.status='draft' or (e.status='approved' and e.checked_via_rule_id is not null))
--
-- `checked_via_rule_id` is the right second term for a structural reason, not a convenient
-- one: it is written ONLY by the rule-post executor's approve path (0016:1448 /
-- 0029:267, from p_ctx), and 0016's own tail arm (0016:5109-5112) ASSERTS that the human
-- approve wrapper can never set it -- "the human approve wrapper STILL never sets
-- checked_via_rule_id", enforced as a deploy-time refusal. So a non-null value is a durable,
-- write-once record of HOW the entry was approved, not a status that varies underneath the
-- reader. That is an identity fact in exactly the sense law 2 demands.
--
-- WHAT THIS DELIBERATELY DOES NOT COVER, STATED SO THE REVIEWER RULES ON IT RATHER THAN
-- DISCOVERS IT. clara.journal_entries.status is a TERNARY domain, not a binary one --
-- check (status in ('draft','approved','withdrawn')), 0007:1013 (0003:105 shipped the
-- two-value version and 0007 widened it; a reversed original KEEPS 'approved', 0003:97-99).
-- The first draft of this file reasoned about a binary domain and was WRONG; prestate arm
-- (0.3) below caught it on the rig, which is the arm doing its job and is why it pins the
-- deparsed constraint rather than trusting the header.
--
-- So a draft has THREE exits, and this guard admits ONE of them plus the un-exited state:
--   draft -> approved, checked_via_rule_id NOT NULL  -- the rule-post race. ADMITTED. This
--          is the whole defect: it is the only MACHINE-speed transition, it fires on every
--          successful unattended post, and it fired 3 times out of 3.
--   draft -> approved, checked_via_rule_id NULL      -- clara.approve_entry, a HUMAN act.
--          NOT admitted; still raises CLR11.
--   draft -> withdrawn                               -- clara.withdraw_draft (0009:1882), a
--          HUMAN act under _human_ctx(bookkeeper), and a terminal frozen evidence state
--          (0007:1011 "draft->withdrawn only"). NOT admitted; still raises CLR11.
--
-- Both uncovered transitions are HUMAN acts that would have to land inside the millisecond
-- gap between the drafter's write and its own settle step, and neither has ever been
-- observed. They are left uncovered on purpose rather than by oversight: widening the guard
-- to bare existence would spend the entire remaining liveness signal to buy two cases that
-- no human queue can reach that fast. The residual is also BOUNDED by the second half of
-- this fix -- the reconciler edge now isolates per task, so a task stranded this way can no
-- longer wedge the leader loop; it stays 'running' until a human cancels it, which is the
-- pre-existing behaviour for every other un-settleable task. FLAGGED FOR LAW-1 REVIEW: if
-- the reviewer wants either transition admitted, the shape is one more disjunct, and the
-- accounting argument below (nothing downstream reads the entry) already covers it.
--
-- NOTHING DOWNSTREAM OF THE GUARD TOUCHES THE ENTRY. Read the body: after the guard the
-- function does token accounting (firm_usage_daily, task_usage), flips agent_tasks.status,
-- resets the autodraft_attempts registry row, writes the sweep_run_items receipt and
-- audits. It never reads e.status again and never writes to journal_entries at all. So
-- admitting an already-posted entry changes no accounting -- the receipt records which
-- entry this task produced, which is true either way.
--
-- HOW IT IS SHIPPED. BOTH overloads are recut, because both carry the same defect: 0046 S8
-- created the 6-arity by harvesting the live 5-arity body with pg_get_functiondef, so the
-- guard was copied verbatim into it. Each is HARVESTED FROM THE LIVE CATALOG and spliced
-- with a count-guarded replace, never re-typed -- the same technique and the same reason as
-- 0046 S8: re-typing a body silently reverts every recut that landed since it was written
-- (0036 SSB's three losing-dispatch no-ops and the shared attempt cap; 0046 S8's own
-- run-identity check). The tail then proves MECHANICAL EQUIVALENCE: each new body is the
-- pre-image stashed at prestate plus EXACTLY this one documented substitution, and nothing
-- else.
--
-- D1 BINDS (packages/db/README.md:99-118). This file replaces two live function bodies.
-- PostgreSQL runs each in-flight PL/pgSQL execution to completion on the body it STARTED
-- with, so a write-quiesce is the clean way to apply it. The change is strictly WIDENING
-- (every call the old guard admitted, the new guard admits), so an interleaved apply is not
-- corrupting -- but the quiesce is still the recorded procedure and this file does not
-- license skipping it.
--
-- STATEMENT TIMEOUT (ADR-059 ceremony law). Set inside the migration connection because
-- role- and database-level settings are invisible through Supavisor's pool. This file's
-- arms are TWO-BODY scoped, not a pg_proc-wide lex pass, so the setting is precautionary
-- rather than load-bearing -- stated plainly so nobody reads a heavy pass into it.
set local statement_timeout = '20min';

-- =====================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing is MEASURED
-- here, before a single object changes, and each failure names the drift.
-- =====================================================================
-- The pre-image of everything the tail claims CREATE OR REPLACE preserves. `folded` carries
-- the body for the mechanical-equivalence proof; `secdef`/`config` carry the two properties
-- a careless re-ship silently drops. They are STASHED rather than pinned as literals in the
-- tail on purpose: the claim is "unchanged", and comparing post against pre states exactly
-- that, without this file having to guess how PostgreSQL renders proconfig. (It guessed
-- `search_path=clara,pg_temp` in an earlier cut; the stored value carries a space, and the
-- rig refused the migration until the arm asked the honest question instead.)
create temp table _f1_pre(
  sig     text primary key,
  folded  text    not null,
  secdef  boolean not null,
  config  text    not null
) on commit drop;

do $prestate$
declare
  v_n int; v_sig text; v_src text; v_anchor text; v_count int;
  v_secdef boolean; v_config text;
begin
  -- (0.1) FRONTIER. This slice edits the bodies 0046 left behind -- specifically the 6-arity
  -- overload 0046 S8 created -- so 0046 must be recorded as applied.
  select count(*) into v_n from clara.schema_migrations
    where version = '0046_wave_7a_sales_lane';
  if v_n <> 1 then
    raise exception '0047 prestate: 0046_wave_7a_sales_lane is not recorded as applied -- apply in order'
      using errcode = 'CLR10';
  end if;

  -- (0.2) THE LIVENESS TERM THIS FIX SUBSTITUTES IN MUST EXIST, AND ON THE RIGHT TABLE. A
  -- guard that referenced a missing column would fail at first execution, not at deploy.
  select count(*) into v_n from pg_attribute
    where attrelid = 'clara.journal_entries'::regclass
      and attname = 'checked_via_rule_id' and attnum > 0 and not attisdropped;
  if v_n <> 1 then
    raise exception '0047 prestate: clara.journal_entries.checked_via_rule_id does not exist (0015 S1) -- the widened guard would reference a missing column'
      using errcode = 'CLR10';
  end if;

  -- (0.3) THE STATUS DOMAIN IS EXACTLY THE THREE VALUES THE HEADER ENUMERATES. The whole
  -- "what this does not cover" argument rests on knowing every exit a draft has: the
  -- disjunction admits one of the three and the header names the other two as deliberate.
  -- A FOURTH status appearing later would silently widen that gap without a word changing
  -- in the prose, so this refuses instead. It is pinned as the DEPARSED constraint text --
  -- the same idiom as 0046 prestate (0.2)'s pg_get_function_result pin -- which also means
  -- a PostgreSQL deparse change fails loudly here rather than quietly weakening the claim.
  --
  -- THIS ARM HAS ALREADY EARNED ITS COST: the first cut of this file asserted a BINARY
  -- domain, because 0003:105 shipped one and the header reasoned from it. 0007:1013 had
  -- widened it to three. The rig refused the migration on the spot and the argument above
  -- was rewritten rather than the arm relaxed.
  select count(*) into v_n from pg_constraint
    where conrelid = 'clara.journal_entries'::regclass and contype = 'c'
      and conname = 'ck_journal_entries_status'
      and pg_get_constraintdef(oid) =
          'CHECK ((status = ANY (ARRAY[''draft''::text, ''approved''::text, ''withdrawn''::text])))';
  if v_n <> 1 then
    raise exception '0047 prestate: clara.journal_entries.status is not the pinned draft/approved/withdrawn domain this fix reasons about (found %) -- re-derive the uncovered-transition argument in this file''s header before widening the guard',
      (select coalesce(pg_get_constraintdef(oid),'<no ck_journal_entries_status>') from pg_constraint
        where conrelid = 'clara.journal_entries'::regclass and conname = 'ck_journal_entries_status')
      using errcode = 'CLR10';
  end if;

  -- (0.4) EXACTLY TWO settle_autodraft_task OVERLOADS, AT THE TWO PINNED SIGNATURES. 0046
  -- acl arm (A1) established this post-state; if a third has appeared, this file's census of
  -- what carries the defect is stale and it must not guess.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = 'settle_autodraft_task';
  if v_n <> 2 then
    raise exception '0047 prestate: expected exactly TWO clara.settle_autodraft_task overloads (the 0011/0036 5-arity and the 0046 S8 6-arity), found %', v_n
      using errcode = 'CLR10';
  end if;
  foreach v_sig in array array[
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)',
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)']
  loop
    begin
      perform v_sig::regprocedure;
    exception when others then
      raise exception '0047 prestate: % does not exist at that exact signature', v_sig
        using errcode = 'CLR10';
    end;
  end loop;

  -- (0.5) THE DEFECT IS PRESENT, EXACTLY ONCE, IN EACH BODY -- AND THE PRE-IMAGE IS STASHED.
  --
  -- This is the measurement that makes the splice safe rather than hopeful. The anchor is
  -- the whole tail of the existence test, and it must occur EXACTLY ONCE per body: zero
  -- means somebody already recut this guard and the file is stale; more than one means the
  -- replace would edit something it never read.
  --
  -- The whitespace-folded pre-image goes into _f1_pre so the tail can prove mechanical
  -- equivalence -- new body == this body plus exactly the documented substitution. Stashing
  -- the LIVE body (rather than comparing against a literal typed here) is deliberate: it
  -- preserves any lawful recut that landed between 0046 and this file, and it makes an
  -- unaccounted-for hand patch visible as a difference rather than overwriting it.
  v_anchor := 'and e.client_id=a.client_id and e.filing_id=a.filing_id and e.status=''draft'')) then';
  foreach v_sig in array array[
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)',
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)']
  loop
    select prosrc, prosecdef, coalesce(array_to_string(proconfig, '|'), '<none>')
      into v_src, v_secdef, v_config
      from pg_proc where oid = v_sig::regprocedure;
    v_count := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    if v_count <> 1 then
      raise exception '0047 prestate: the drafted-settlement status anchor occurs % times in % (expected 1) -- this guard is not the body this file was authored against', v_count, v_sig
        using errcode = 'CLR10';
    end if;
    -- SECURITY DEFINER and a pinned search_path are not incidental here: this function is
    -- reachable only from clara_runtime and does its own ownership checks, so losing either
    -- would be a privilege change disguised as a refactor. Captured, then re-asserted.
    if not v_secdef then
      raise exception '0047 prestate: % is not SECURITY DEFINER -- this file will not re-ship a body whose privilege shape it does not recognise', v_sig
        using errcode = 'CLR10';
    end if;
    if v_config = '<none>' or position('search_path=' in v_config) = 0 then
      raise exception '0047 prestate: % carries no pinned search_path (proconfig %)', v_sig, v_config
        using errcode = 'CLR10';
    end if;
    insert into _f1_pre(sig, folded, secdef, config)
      values (v_sig, regexp_replace(v_src, '\s+', ' ', 'g'), v_secdef, v_config);
  end loop;

  -- (0.6) THE 6-ARITY STILL CARRIES 0046 S8'S RUN-IDENTITY NO-OP. It is the one delta that
  -- distinguishes the two bodies, so measuring it here proves the harvest below reads the
  -- POST-0046 body and not some earlier revision -- and the tail re-reads it afterwards to
  -- prove the splice did not disturb it.
  select prosrc into v_src from pg_proc
    where oid = 'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)'::regprocedure;
  if position('run_superseded' in v_src) = 0
     or position('t.workflow_run_id is distinct from p_workflow_run_id' in v_src) = 0 then
    raise exception '0047 prestate: the 6-arity clara.settle_autodraft_task is missing 0046 S8''s run-identity check -- refusing to splice a body this file cannot account for'
      using errcode = 'CLR10';
  end if;

  raise notice '0047 prestate: clean (frontier 0046, ternary draft/approved/withdrawn status domain, 2 overloads, 1 anchor each, run-identity intact)';
end
$prestate$;

-- =====================================================================
-- SECTION 1 -- THE SHARED LEX INSTRUMENT (pg_temp), EXTRACTED VERBATIM FROM 0046 SECTION 1
-- (itself extracted verbatim from 0045:344-627 / 673-685, the origin of record).
--
-- WHY IT IS HERE AT ALL. The structural arms in the tail ask "does the live body EVALUATE
-- this predicate", and a raw prosrc match cannot answer that: the bodies being measured are
-- dense with explanatory comments -- including the ones this file itself splices in -- so an
-- arm reading raw source can be satisfied by prose and is then structurally incapable of
-- failing. Law 3 in one sentence: a guard that reads a NAME reads a projection of the thing,
-- not the thing.
--
-- IT IS COPIED, NOT SHARED, AND THAT IS NOT AN OVERSIGHT. These live in pg_temp, which is
-- session-scoped: 0046's copies died with 0046's connection. Every slice of this arc
-- re-creates them for the same reason. Only the two functions this file's arms actually use
-- are carried (_wdb_sql_code and _wdb_code_literal); 0046's _wdb_call_rx/_wdb_call_count are
-- omitted because no arm here takes a caller census. The BODIES below are byte-identical to
-- 0046:118-401 / 425-439. 0045 remains the origin of record for the reasoning (the
-- `$`-lookbehind gap, the E-string trade, the chr(1)/chr(2) sentinels and the
-- standard_conforming_strings caveat all still apply).
-- =====================================================================
create or replace function pg_temp._wdb_sql_code(p_src text) returns text
  language plpgsql immutable as $lex$
declare
  v_out   text := '';
  v_rest  text;
  v_i     int := 1;
  v_n     int;
  v_hit   int;
  v_k     int;
  v_len   int;
  v_depth int;
  v_tag   text;
  v_esc   boolean;
  v_p     int;
  v_a     int;
  v_b     int;
  v_q     int;
  v_bs    int;
  v_fill  text;
  v_closed boolean;
  -- [R15 FIX 2026-08-04] `U&` seen immediately before this opener, the quoted part's content, and a
  -- WHOLE-BODY flag: does this subject mention UESCAPE anywhere at all.
  v_uamp  boolean;
  v_id    text;
  v_uesc  boolean;
  -- [R14 FIX 2026-08-04] chr(1) marks an excised COMMENT (whitespace to Postgres, so the matcher admits
  -- it in a token gap); chr(2) marks an excised TOKEN -- a string literal, or a quoted identifier
  -- that is not the bare name -- which the matcher never admits in a gap.
  v_cmt   text := chr(1);
  v_tok   text := chr(2);
begin
  if p_src is null then return null; end if;
  -- [R14 FIX 2026-08-04 -- second re-confirming round, N13-4/CXR13-2] THE SENTINELS ARE CONTROL BYTES, AND
  -- A SUBJECT THAT ALREADY CONTAINS ONE IS REFUSED RATHER THAN MISJUDGED. Round 13 used `~` and
  -- `#`, and argued in this file's own comment that neither "can appear between a function name
  -- and its parenthesis in any executable text". That was FALSE and was refuted by a running
  -- counter-example: with `clara` a table alias and `_adj_on_approve` its column,
  -- `where clara._adj_on_approve ~ ('^x')` is the regex-match OPERATOR between the name and a
  -- parenthesis -- executable, not a call -- and the matcher counted it because `~` was in the gap
  -- class. The lesson is not "pick a rarer printable character": it is that a sentinel drawn from
  -- the subject's own alphabet can always be forged. chr(1)/chr(2)/chr(3) cannot appear in SQL
  -- source text, and this guard is what makes that a CHECKED property instead of an assumption.
  if p_src ~ ('[' || chr(1) || chr(2) || chr(3) || ']') then
    raise exception '0042 D-b2 SQL-lexical stripper: the body being lexed contains one of the control bytes chr(1)/chr(2)/chr(3), which this instrument uses to mark excised comments, excised tokens and the call-offset it substitutes -- every judgement made on the result would be reading its own marks. Investigate the body; do not weaken the instrument.';
  end if;
  -- [R15 FIX 2026-08-04 -- third re-confirming round, N14-1/CXR14-1] ONE WHOLE-BODY QUESTION, ASKED ONCE:
  -- does this subject mention UESCAPE at all. A `U&"..."` identifier is only resolvable by an
  -- instrument that does not decode escapes when nothing can have redefined the escape character,
  -- and that CANNOT be decided locally -- measured, a comment may sit between the identifier and
  -- its UESCAPE clause, so a lookahead over whitespace would be provably incomplete. This test is
  -- over-broad on purpose: it costs one regexp per subject, and it fires only where a U&
  -- identifier and the word actually MEET -- both halves are required, and both were measured.
  -- WHAT IT DOES NOT DO IS ONLY EVER CONVERT A SILENT MISJUDGE, and the sentence that used to say
  -- so was measured false: on a body whose U& identifier is lawful, resolvable and NOT A CALL at
  -- all, with the word sitting in an unrelated comment, round 14 answered 0 and was RIGHT, and
  -- this refuses instead. That is the over-broad trade, it is stated in full in the
  -- does-not-handle list one screen up, and it is not softened here.
  v_uesc := p_src ~* '(?<![A-Za-z0-9_$])uescape(?![A-Za-z0-9_$])';
  v_n := length(p_src);
  while v_i <= v_n loop
    v_rest := substr(p_src, v_i);
    -- The next lexically interesting position: the earliest of the four openers.
    v_hit := 0;
    foreach v_p in array array[position('--' in v_rest), position('/*' in v_rest),
                               position('''' in v_rest), position('$' in v_rest),
                               position('"' in v_rest)] loop
      if v_p > 0 and (v_hit = 0 or v_p < v_hit) then v_hit := v_p; end if;
    end loop;
    if v_hit = 0 then
      v_out := v_out || v_rest;                       -- plain code all the way to the end
      exit;
    end if;
    v_out := v_out || substr(v_rest, 1, v_hit - 1);   -- the plain run before the opener
    v_i := v_i + v_hit - 1;
    v_rest := substr(p_src, v_i);

    if substr(v_rest, 1, 2) = '--' then
      -- LINE COMMENT -- to the end of the line. The newline is code structure and stays.
      v_k := position(E'\n' in v_rest);
      v_len := case when v_k = 0 then length(v_rest) else v_k - 1 end;
      v_fill := v_cmt;   -- [R13 FIX 2026-08-04] a comment IS whitespace to Postgres; see the fill note below

    elsif substr(v_rest, 1, 2) = '/*' then
      -- BLOCK COMMENT -- nesting, as Postgres nests them. Scanned by jumps rather than
      -- character by character so a long comment cannot make this body quadratic.
      v_depth := 1; v_k := 3;
      loop
        v_a := position('*/' in substr(v_rest, v_k));
        exit when v_a = 0;                            -- unterminated
        v_b := position('/*' in substr(v_rest, v_k));
        if v_b > 0 and v_b < v_a then
          v_depth := v_depth + 1; v_k := v_k + v_b + 1;
        else
          v_depth := v_depth - 1; v_k := v_k + v_a + 1;
          exit when v_depth = 0;
        end if;
      end loop;
      -- An unterminated comment blanks to the end, which is the fail-safe direction: nothing
      -- after it can then be read as an executable call.
      v_len := case when v_depth > 0 then length(v_rest) else v_k - 1 end;
      v_fill := v_cmt;   -- [R13 FIX 2026-08-04] a comment IS whitespace to Postgres

    elsif substr(v_rest, 1, 1) = '''' then
      -- SINGLE-QUOTED STRING. '' is an embedded quote; a backslash escapes the next character
      -- ONLY in an E'' literal, which is decided by the token immediately before the quote.
      -- [R15 FIX 2026-08-04 -- third re-confirming round, N14-1] ...AND `U&'...'` IS THE SAME CLASS. The
      -- prefix is two characters of CODE sitting in front of a literal; left there it would be
      -- read as a token in its own right. It is consumed into the excision, two characters in and
      -- two sentinels out, so the length and every offset behind it survive. NO ESCAPE QUESTION
      -- ARISES HERE and none is asked: the content is a literal and is blanked whatever it decodes
      -- to. A U& string does NOT take backslash-escaped quotes the way E'' does (the backslash is
      -- a UNICODE escape there, not a quote escape), so v_esc stays false, which is what the
      -- E-test below already yields when the preceding character is `&`. THE PREFIX MUST BE
      -- ADJACENT, and that was measured in both directions: `U& "x"`, `U&<newline>"x"` and
      -- `U&/*c*/"x"` are all the bitwise-and operator between an identifier and a quoted name.
      v_fill := v_tok;   -- [R13 FIX 2026-08-04] a literal is a TOKEN, not whitespace
      v_uamp := (v_i > 2 and substr(p_src, v_i - 2, 2) ~* '^u&$'
                 and (v_i = 3 or substr(p_src, v_i - 3, 1) !~ '[A-Za-z0-9_$]'));
      if v_uamp then
        v_out := left(v_out, length(v_out) - 2) || v_tok || v_tok;
      end if;
      v_esc := (v_i > 1 and upper(substr(p_src, v_i - 1, 1)) = 'E'
                and (v_i = 2 or substr(p_src, v_i - 2, 1) !~ '[A-Za-z0-9_]'));
      v_k := 2; v_len := length(v_rest);
      loop
        v_a := position('''' in substr(v_rest, v_k));
        exit when v_a = 0;                            -- unterminated: blank to the end
        v_q := v_k + v_a - 1;                         -- this quote's index inside v_rest
        if v_esc then
          -- an ODD run of backslashes immediately before the quote escapes it
          v_bs := 0;
          while v_q - 1 - v_bs >= 2 and substr(v_rest, v_q - 1 - v_bs, 1) = chr(92) loop
            v_bs := v_bs + 1;
          end loop;
          if (v_bs % 2) = 1 then v_k := v_q + 1; continue; end if;
        end if;
        if substr(v_rest, v_q + 1, 1) = '''' then v_k := v_q + 2; continue; end if;
        v_len := v_q; exit;
      end loop;

    elsif substr(v_rest, 1, 1) = '"' then
      -- DOUBLE-QUOTED IDENTIFIER [R14 FIX 2026-08-04 -- second re-confirming round, N13-3 + N13-6 /
      -- CXR13-1, DEPLOY-BLOCKER, the silent-double direction]. Round 13 had no token class for
      -- `"` at all, and the cost was measured in both directions on planted frontiers:
      --   * `perform "clara"."_adj_on_approve"(p_entry);` IS the call -- quoting an
      --     already-lower-case name changes nothing about which function runs -- and every
      --     instrument read it as ABSENT. The pre-fix build APPLIED CLEAN onto a body that already
      --     had the hook and left TWO independent executable calls in it.
      --   * `declare "don't" text;` was read as an APOSTROPHE opening a string literal, so the
      --     executable lines up to the next apostrophe were blanked -- a real call, hidden by a
      --     lawful variable name.
      -- SO A QUOTED PART IS A TOKEN, AND THE ONLY QUESTION IS WHICH TOKEN. If the quoted content
      -- is a valid identifier that is ALREADY LOWER CASE, quoting it is a no-op in Postgres and
      -- the part FOLDS to the bare name -- the delimiters become the comment sentinel, which the
      -- matcher already admits in a token gap, so the fold costs no length and no offset. Any
      -- OTHER quoted content ("CLARA", "Clara", "don't", `a""b`) is a DIFFERENT identifier from
      -- the bare one, so it becomes one OPAQUE token: it can never match the roster, and -- the
      -- half that closes the apostrophe defect -- it can never open a string either.
      -- [R15 FIX 2026-08-04 -- third re-confirming round, N14-1/CXR14-1, MONEY] ...AND `U&"..."` IS THE
      -- SAME IDENTIFIER, WRITTEN THE OTHER LAWFUL WAY. MEASURED: `U&"clara".U&"_adj_on_approve"`
      -- resolves to exactly the function the bare spelling resolves to, a plpgsql body reaches
      -- clara through it, and W-R14's fold left the two-character `U&` sitting in CODE position
      -- between the dot and the next name -- so the matcher's gap class stopped dead there and
      -- every instrument read a RUNNING call as absent. End to end on a planted frontier: the
      -- migration APPLIED CLEAN and the body ended with TWO executable invocations per approval,
      -- which is RC3's silent double reached through a spelling nobody had enumerated.
      -- THE PREFIX IS PART OF THE TOKEN. Two characters in, two sentinels out -- the comment
      -- sentinel when the part folds (so the matcher walks over it exactly as it walks over the
      -- delimiters), the token sentinel when it does not.
      v_uamp := (v_i > 2 and substr(p_src, v_i - 2, 2) ~* '^u&$'
                 and (v_i = 3 or substr(p_src, v_i - 3, 1) !~ '[A-Za-z0-9_$]'));
      v_k := 2; v_len := length(v_rest); v_closed := false;
      loop
        v_a := position('"' in substr(v_rest, v_k));
        exit when v_a = 0;                            -- unterminated: opaque to the end
        v_q := v_k + v_a - 1;
        if substr(v_rest, v_q + 1, 1) = '"' then v_k := v_q + 2; continue; end if;
        v_len := v_q; v_closed := true; exit;
      end loop;
      v_id := case when v_closed and v_len > 2 then substr(v_rest, 2, v_len - 2) else null end;
      -- A U& PART THIS BODY CANNOT RESOLVE IS REFUSED, NOT GUESSED [R15 FIX 2026-08-04]. Three ways it
      -- can be unresolvable, and only the first is obvious. (a) A BACKSLASH is a unicode escape in
      -- this spelling, so `U&"\0063lara"` IS clara and folding the content verbatim would rename a
      -- running call to something no roster carries. (b) A UESCAPE CLAUSE redefines the escape
      -- character to almost anything -- MEASURED, `U&'z0063lara' UESCAPE 'z'` is clara -- so under
      -- one, a content that looks like a plain lowercase identifier can denote something else
      -- entirely; the flag is whole-body because a comment may sit between the identifier and its
      -- clause. (c) An unterminated or empty quoted part names nothing at all. The bare `"..."`
      -- spelling is untouched by all three: there, a backslash is simply a character in the name.
      if v_uamp and (v_id is null or position(chr(92) in v_id) > 0 or v_uesc) then
        raise exception '0042 D-b2 SQL-lexical stripper: a U&"..." identifier this instrument cannot resolve (%) -- %. It does not decode unicode escapes and does not implement UESCAPE, so it cannot say which identifier this names, and a call it cannot resolve must never be reported as absent: that is the silent double this file exists to close. Rewrite the identifier in its plain spelling, or extend the stripper.',
          coalesce('"' || v_id || '"', 'unterminated or empty'),
          case when not v_closed then 'the quoted part is never closed'
               when v_id is null then 'the quoted part is empty'
               when position(chr(92) in v_id) > 0 then 'its content carries a backslash, which is a UNICODE ESCAPE in this spelling'
               else 'this body mentions UESCAPE, which can redefine the escape character to a character that leaves the content looking like a plain identifier' end;
      end if;
      if v_id is not null and v_id ~ '^[a-z_][a-z0-9_$]*$' then
        -- FOLDED. Same length in as out: (two prefix sentinels when U&,) one sentinel, the
        -- content, one sentinel.
        if v_uamp then
          v_out := left(v_out, length(v_out) - 2) || v_cmt || v_cmt;
        end if;
        v_out := v_out || v_cmt || v_id || v_cmt;
        v_i := v_i + v_len;
        continue;
      end if;
      if v_uamp then
        v_out := left(v_out, length(v_out) - 2) || v_tok || v_tok;
      end if;
      v_fill := v_tok;

    else
      -- A '$'. It opens a dollar-quoted string only if it is a well-formed delimiter; `$1` and a
      -- bare `$` are ordinary code and pass through one character at a time.
      -- [R14 FIX 2026-08-04 -- second re-confirming round, N13-5/CXR13-4] THE TAG RULE IS POSTGRES'S,
      -- NOT ASCII'S. A dollar-quote tag follows the identifier rules, and those admit non-ASCII
      -- letters; the round-13 class stopped at [A-Za-z_], so `$<e-acute>$ ... $<e-acute>$` was not
      -- recognised as a delimiter at all and its CONTENTS were passed through as executable code.
      -- MEASURED on this rig (server_encoding UTF8, lc_ctype C -- where [[:alpha:]] is ASCII-only
      -- and would NOT have fixed it): the explicit range below recognises the accented tag, a CJK
      -- tag and an astral-plane tag, still recognises `$q$` and `$$`, and still correctly REFUSES
      -- `$1` and a digit-first tag. The upper bound is the last Unicode code point, so there is no
      -- plane left over.
      -- [R15 FIX 2026-08-04 -- third re-confirming round, CXR14-3, MEASURED BEFORE FIXING] A TAG CAN ONLY
      -- OPEN AT A TOKEN BOUNDARY. `$` is legal in a non-first identifier position, so `x$t$` is ONE
      -- identifier -- confirmed by running it, not by reading the grammar. Without this test the
      -- body reads that `$t$` as a tag opener, scans to the next `$t$` and blanks everything
      -- between: MEASURED on a function Postgres executes, with the call sitting between two
      -- `$`-bearing identifiers, the matcher read ZERO while the call ran. Same silent-miss class
      -- as the U& defect above, through a different door. The test is on the last EMITTED
      -- character, not the last source character, which is the right question: a `$` that follows
      -- an excised region follows a sentinel, and a sentinel is not identifier text -- which is
      -- also correct for the source, because a comment or a quoted part ENDS the identifier that
      -- preceded it and Postgres opens a tag there too.
      if v_out <> '' and right(v_out, 1) ~ '[A-Za-z0-9_$\u0080-\U0010FFFF]' then
        v_out := v_out || '$';
        v_i := v_i + 1;
        continue;
      end if;
      v_tag := substring(v_rest from '^\$[A-Za-z_\u0080-\U0010FFFF][A-Za-z0-9_\u0080-\U0010FFFF]*\$|^\$\$');
      if v_tag is null then
        v_out := v_out || '$';
        v_i := v_i + 1;
        continue;
      end if;
      v_a := position(v_tag in substr(v_rest, length(v_tag) + 1));
      -- AN UNTERMINATED TAG REGION IS REFUSED, NOT BLANKED [R15 FIX 2026-08-04]. Round 13 blanked to the
      -- end of the body and argued that was the fail-safe direction. It is -- but only if the
      -- region really is a literal, and the measurement above is a body where this code opens a
      -- region that is not one. Blanking to end would then hide every call after it, silently.
      if v_a = 0 then
        raise exception '0042 D-b2 SQL-lexical stripper: a dollar-quote tag (%) opens a region that is never closed in this body -- a complete function body cannot contain one, so either the subject is truncated or this instrument opened a tag where the source has none; blanking to the end of the body would hide every call after it', v_tag;
      end if;
      v_len := length(v_tag) + v_a - 1 + length(v_tag);
      v_fill := v_tok;   -- [R13 FIX 2026-08-04] a literal is a TOKEN, not whitespace
    end if;

    -- BLANKED, NOT DELETED: same length, same lines.
    -- ...AND BLANKED TO A SENTINEL, NOT TO A SPACE [R13 FIX 2026-08-04 -- re-confirming round, Codex RC3,
    -- DEPLOY-BLOCKER]. Round 12 wrote spaces, and spaces threw away the one fact the consumers
    -- needed: a comment between two tokens is WHITESPACE to Postgres (so
    -- `clara._adj_on_approve/*x*/(p_entry)` is a real call), and a string literal between them is
    -- a TOKEN (so `clara._adj_on_approve'x'(p_entry)` is not). Blanked to spaces both look the
    -- same, and every exact-substring consumer read the comment-spliced call as ABSENT -- on a
    -- database that already had it, which is a second call spliced in beside the first.
    -- chr(1) MARKS A COMMENT and chr(2) MARKS A TOKEN (a literal, or a quoted identifier that is
    -- not the bare name), and pg_temp._wdb_call_rx admits chr(1) in a token gap and refuses chr(2).
    -- [R14 FIX 2026-08-04 -- second re-confirming round, N13-4/CXR13-2] THE CHARACTERS USED TO BE `~` AND
    -- `#`, AND THE SENTENCE HERE CLAIMED NEITHER "can appear between a function name and its
    -- parenthesis in any executable text". That was measured FALSE with a body that runs:
    -- `select count(*) from t as clara(_adj_on_approve) where clara._adj_on_approve ~ ('^x')` --
    -- an alias, a column and the regex-match OPERATOR, no call anywhere, and the matcher counted
    -- one because `~` sat in the gap class. A sentinel taken from the subject's own alphabet can
    -- always be forged, so the marks are now control bytes that cannot occur in SQL source at all,
    -- and the stripper REFUSES a body that contains one rather than trusting the property.
    -- LENGTH IS STILL PRESERVED, WHICH IS THE INVARIANT THE POSITIONAL CLAIMS REST ON: one
    -- character out, one character in, newlines kept -- so an offset measured on the code is an
    -- offset in the source, and probe 11 and S5.8-b2 assert exactly that on every run.
    v_out := v_out || regexp_replace(substr(v_rest, 1, v_len), '[^' || E'\n' || ']', v_fill, 'g');
    v_i := v_i + v_len;
  end loop;
  return v_out;
end $lex$;

create or replace function pg_temp._wdb_code_literal(p_src text, p_lit text) returns boolean
  language plpgsql immutable as $cl$
declare v_lex text; v_pos int; v_from int := 1; v_hit int;
begin
  if p_src is null or p_lit is null or p_lit = '' then return false; end if;
  v_lex := pg_temp._wdb_sql_code(p_src);
  loop
    v_hit := position(p_lit in substr(p_src, v_from));
    exit when v_hit = 0;
    v_pos := v_from + v_hit - 1;
    if substr(v_lex, v_pos, length(p_lit)) ~ ('^' || chr(2) || '+$') then return true; end if;
    v_from := v_pos + 1;
  end loop;
  return false;
end $cl$;

-- =====================================================================
-- SECTION 2 -- THE DELTA, DECLARED ONCE.
--
-- The anchor and its replacement are stashed in a temp table rather than typed twice,
-- because the recut below and the equivalence arm in the tail must be applying and
-- measuring THE SAME delta -- typing it twice makes a transcription slip look like a clean
-- deploy. That does mean the equivalence arm cannot, by itself, prove the delta is the
-- RIGHT one: if the text here were wrong, the recut and the arm would agree on the wrong
-- thing. That half of the proof is the tail's STRUCTURAL arms, whose needles are typed
-- independently down there and pinned as shape-plus-identity on the lexed body. Neither
-- half is sufficient; together they are not satisfiable by one mistake.
-- =====================================================================
create temp table _f1_delta(anchor text not null, repl text not null) on commit drop;

-- The recut below runs under `set role clara_fn_owner` (it must, to CREATE OR REPLACE a
-- function that role owns), and a temp table created by the migration superuser is not
-- readable by that role without this. Scoped to SELECT and to the one role, on a table that
-- dies with the transaction (`on commit drop`) -- no privilege outlives the migration.
grant select on _f1_delta to clara_fn_owner;

insert into _f1_delta(anchor, repl) values (
  -- THE ANCHOR: the whole three-line existence test, verbatim from the live body (0036:949-952,
  -- copied into the 6-arity by 0046 S8). The WHOLE statement is the anchor, not just its
  -- status term, so the replacement can carry an explanatory comment ABOVE the `if` -- and
  -- deliberately not INSIDE the predicate the tail pins, where a comment would be a failure.
  '  if p_outcome=''drafted'' and (p_entry is null or not exists(' || chr(10) ||
  '      select 1 from clara.journal_entries e where e.id=p_entry and e.firm_id=a.firm_id' || chr(10) ||
  '        and e.client_id=a.client_id and e.filing_id=a.filing_id and e.status=''draft'')) then',

  '  -- [0047 / SS7-A FINDING F1] IDENTITY, NOT LIVENESS. The four terms above -- id, firm,' || chr(10) ||
  '  -- client, filing -- already prove that this entry is the one this task produced. The' || chr(10) ||
  '  -- status term used to read `draft` ALONE, which is a derived, time-varying projection:' || chr(10) ||
  '  -- the event-driven rule-post consumer approves the same entry roughly 100ms after the' || chr(10) ||
  '  -- unattended drafter writes it, so on every successful autopost this guard refused its' || chr(10) ||
  '  -- own task, stranded it ''running'' with its tokens charged, and wedged the reconciler''s' || chr(10) ||
  '  -- leader cycle behind the same raise. checked_via_rule_id is the honest second term:' || chr(10) ||
  '  -- it is written ONLY by the rule-post approve path (0016:1448 / 0029:267) and 0016''s' || chr(10) ||
  '  -- own tail (0016:5109-5112) refuses any deploy whose HUMAN approve wrapper can set it,' || chr(10) ||
  '  -- so a non-null value is a write-once record of HOW the entry was approved -- an' || chr(10) ||
  '  -- identity fact, not a status read. STILL UNCOVERED, on purpose: the two HUMAN exits' || chr(10) ||
  '  -- from draft -- approve_entry (checked_via_rule_id stays null) and withdraw_draft' || chr(10) ||
  '  -- (0009:1882, draft->withdrawn only) -- would each have to land inside the same' || chr(10) ||
  '  -- millisecond window, and neither has been observed. Nothing below this guard reads' || chr(10) ||
  '  -- or writes the entry, so admitting an already-posted one changes no accounting.' || chr(10) ||
  '  if p_outcome=''drafted'' and (p_entry is null or not exists(' || chr(10) ||
  '      select 1 from clara.journal_entries e where e.id=p_entry and e.firm_id=a.firm_id' || chr(10) ||
  '        and e.client_id=a.client_id and e.filing_id=a.filing_id' || chr(10) ||
  '        and (e.status=''draft''' || chr(10) ||
  '             or (e.status=''approved'' and e.checked_via_rule_id is not null)))) then'
);

-- =====================================================================
-- SECTION 3 -- THE RECUT. BOTH OVERLOADS, EACH HARVESTED FROM THE LIVE CATALOG.
--
-- NEVER RE-TYPED, FOR 0046 S8'S REASON RESTATED. The 5-arity body is 0036 SSB's, which
-- rewrote three losing-dispatch shapes into honest no-op receipts and moved the park
-- threshold onto the shared clara._autodraft_attempt_cap(); the 6-arity is that same body
-- plus 0046 S8's run-identity no-op. Re-typing either from a migration file would silently
-- revert whichever recut this file failed to notice. Deriving both from pg_get_functiondef
-- makes the preservation STRUCTURAL rather than a promise, and the tail proves it.
--
-- WIDENING ONLY. Every call the old guard admitted, the new guard admits: the disjunction
-- ADDS a branch and removes none. There is no input for which this recut refuses something
-- the previous body accepted, which is why an interleaved apply cannot corrupt in-flight
-- settlement.
-- =====================================================================
-- THE SPLICE ARITHMETIC, FACTORED OUT SO THE TWO CALL SITES BELOW CAN NAME THEIR TARGETS
-- AS LITERALS. An earlier cut looped `foreach v_sig in array array[...]` and fed
-- pg_get_functiondef(v_sig::regprocedure); scripts/check-binding-post-control.mjs rejected
-- the file for it, and rightly: "an unparseable target is not evidence that
-- execute_rule_post is untouched". A gate that cannot resolve which function a dynamic CoR
-- patch edits cannot certify that this migration leaves the binding post-control alone. So
-- the LOGIC is shared here and the TARGETS are spelled literally at each call site — the
-- guard stays single-sourced and the tree stays statically attributable.
create or replace function pg_temp._f1_splice(p_def text, p_label text) returns text
  language plpgsql as $splice$
declare v_anchor text; v_repl text; v_count int;
begin
  select anchor, repl into v_anchor, v_repl from _f1_delta;
  -- THE COUNT GUARD IS RE-MADE HERE, not inherited from the prestate. The prestate measured
  -- prosrc; this measures the functiondef that is actually about to be edited, so the
  -- replace can never touch a body it did not read exactly once.
  v_count := (length(p_def) - length(replace(p_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0047 S3: the drafted-settlement anchor occurs % times in the functiondef of the % (expected 1)', v_count, p_label
      using errcode = 'CLR10';
  end if;
  return replace(p_def, v_anchor, v_repl);
end $splice$;

set role clara_fn_owner;
do $recut$
begin
  -- THE 5-ARITY (0011:2642, body replaced by 0036 SSB) — the overload reconciler.mjs's
  -- terminal edge calls.
  execute pg_temp._f1_splice(
    pg_get_functiondef('clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)'::regprocedure),
    '5-arity');
  raise notice '0047 S3: the 5-arity settle_autodraft_task recut onto the identity test';

  -- THE 6-ARITY (0046 S8) — the overload autoDraft_v6's own settle step calls. It carries
  -- the SAME defect because 0046 S8 built it by harvesting the 5-arity body verbatim.
  execute pg_temp._f1_splice(
    pg_get_functiondef('clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)'::regprocedure),
    '6-arity');
  raise notice '0047 S3: the 6-arity settle_autodraft_task recut onto the identity test';
end
$recut$;
reset role;

-- The grants are UNTOUCHED and deliberately not re-issued: CREATE OR REPLACE preserves a
-- function's existing ACL, so re-granting here would be noise that hides a real regression.
-- The tail asserts the post-state instead.

-- =====================================================================
-- TAIL -- IN-TRANSACTION SELF-VERIFICATION. Every raise is a real assertion failure.
-- =====================================================================
do $tail$
declare
  v_sig text; v_raw text; v_lex text; v_pre text; v_expected text; v_actual text;
  v_anchor text; v_repl text; v_shape_lex text; v_shape_raw text; v_old_lex text;
  v_off int; v_count int; v_n int; r record;
  v_pre_secdef boolean; v_pre_config text;
begin
  -- THE INSTRUMENT LAW FOR EVERY ARM BELOW (0046's, restated because it governs here too).
  --
  --   STRUCTURE is asserted on the LEXED body. Comments are chr(1) there and string literals
  --   are chr(2), both LENGTH-PRESERVING, so no comment this file splices into a body it also
  --   measures can forge a shape -- and the literal LENGTHS stay pinned inside the shape.
  --   IDENTITY is then read out of RAW at the offset the lexed body reports, which is sound
  --   because the lexer is position-preserving.
  --   Both halves sit in the SAME predicate: a shape without the literals is satisfied by a
  --   differently-worded guard, and a literal without a shape is satisfied by prose.
  --
  -- WHOLE PREDICATES, NOT SUBSTRINGS. That `checked_via_rule_id` appears somewhere is not the
  -- claim; the claim is the exact boolean the guard evaluates, so that swapping the `or` for
  -- an `and` -- which would refuse EVERY settlement -- breaks the match.

  select anchor, repl into v_anchor, v_repl from _f1_delta;

  -- THE SHAPE, TYPED INDEPENDENTLY OF SECTION 2. This is the half of the proof that the
  -- equivalence arm cannot make. Literal lengths are MEASURED, not counted by eye:
  -- 'draft' is 7 characters with its quotes, 'approved' is 10.
  v_shape_raw :=
    '        and e.client_id=a.client_id and e.filing_id=a.filing_id' || chr(10) ||
    '        and (e.status=''draft''' || chr(10) ||
    '             or (e.status=''approved'' and e.checked_via_rule_id is not null)))) then';
  v_shape_lex :=
    '        and e.client_id=a.client_id and e.filing_id=a.filing_id' || chr(10) ||
    '        and (e.status=' || repeat(chr(2), 7) || chr(10) ||
    '             or (e.status=' || repeat(chr(2), 10) || ' and e.checked_via_rule_id is not null)))) then';
  -- ...AND THE SHAPE THAT MUST BE GONE. The defect itself, in the same lexed alphabet.
  v_old_lex := 'and e.filing_id=a.filing_id and e.status=' || repeat(chr(2), 7) || '))';

  for v_sig in select unnest(array[
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)',
      'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)'])
  loop
    select prosrc into v_raw from pg_proc where oid = v_sig::regprocedure;
    v_lex := pg_temp._wdb_sql_code(v_raw);

    -- (1) MECHANICAL EQUIVALENCE: THE BODY IS THE PRE-IMAGE PLUS EXACTLY THIS ONE DELTA.
    --
    -- The strongest arm here, and the one that makes a harvest-and-splice safe rather than
    -- merely convenient. It is not "the new guard is present" -- it is "nothing ELSE moved".
    -- A second edit, a dropped recut, or a live hand-patch this file cannot account for all
    -- fail. The comparison is on whitespace-folded prosrc, so re-indentation is not a
    -- failure; a changed character anywhere is.
    select folded into v_pre from _f1_pre where sig = v_sig;
    if v_pre is null then
      raise exception '0047 tail 1: no prestate pre-image was stashed for % -- the identity proof did not run, so the recut is unverified', v_sig;
    end if;
    v_expected := replace(v_pre,
      regexp_replace(v_anchor, '\s+', ' ', 'g'),
      regexp_replace(v_repl,   '\s+', ' ', 'g'));
    v_actual := regexp_replace(v_raw, '\s+', ' ', 'g');
    if v_actual is distinct from v_expected then
      raise exception '0047 tail 1: the recut % is NOT its pre-image plus exactly the documented delta -- something else in the body moved, and a splice that silently carries an extra edit is refused rather than deployed', v_sig;
    end if;

    -- (2) THE NEW GUARD IS THE SHAPE, WITH THE LITERALS AT THE RIGHT LENGTHS, EXACTLY ONCE.
    v_count := (length(v_lex) - length(replace(v_lex, v_shape_lex, ''))) / length(v_shape_lex);
    if v_count <> 1 then
      raise exception '0047 tail 2: the identity-test shape occurs % times in the LEXED body of % (expected 1) -- a guard matched only in raw source can be forged by this file''s own comment', v_count, v_sig;
    end if;

    -- ...AND THE LITERALS REALLY ARE THE ONES CLAIMED, read from RAW at the lexed offset.
    -- Shape alone accepts any 7- and 10-character literals -- 'posted' and 'reversedxx' would
    -- satisfy it while the guard admitted nothing.
    v_off := position(v_shape_lex in v_lex);
    if substr(v_raw, v_off, length(v_shape_raw)) <> v_shape_raw then
      raise exception '0047 tail 2: the identity test in % matches the shape but not the literals -- the guard admits some other pair of statuses than draft/rule-approved', v_sig;
    end if;

    -- (3) THE DEFECT IS GONE -- NOT MERELY OUTNUMBERED. Asked on the lexed body so that this
    -- file's own comment, which quotes the old term to explain it, cannot keep the arm green
    -- OR red by accident.
    if position(v_old_lex in v_lex) <> 0 then
      raise exception '0047 tail 3: the bare status-only existence test is STILL executable in % -- the recut did not replace the defect, it added beside it', v_sig;
    end if;

    -- (4) THE GUARD STILL FAILS CLOSED. Widening the admitted set is the whole point; losing
    -- the refusal is not. The CLR11 raise must still be there, as CODE.
    if not pg_temp._wdb_code_literal(v_raw, '''draft settlement entry not found''') then
      raise exception '0047 tail 4: % no longer raises the CLR11 refusal as code -- an entry that belongs to no task must still be refused', v_sig;
    end if;

    -- (5) 0036 SSB'S LOSING-DISPATCH NO-OPS SURVIVED THE HARVEST. These are the receipts a
    -- re-typed body would have silently reverted, so they are the direct evidence that the
    -- harvest read the live catalog and not a migration file.
    foreach v_expected in array array['task_superseded','registry_superseded','registry_released']
    loop
      if not pg_temp._wdb_code_literal(v_raw, '''' || v_expected || '''') then
        raise exception '0047 tail 5: % lost 0036 SSB''s ''%'' no-op receipt -- the body was re-typed, not harvested', v_sig, v_expected;
      end if;
    end loop;
  end loop;

  -- (6) THE 6-ARITY KEPT 0046 S8'S RUN-IDENTITY CHECK. The one delta that distinguishes the
  -- two overloads; the prestate measured it before the splice, this re-measures it after.
  select prosrc into v_raw from pg_proc
    where oid = 'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)'::regprocedure;
  if position('t.workflow_run_id is distinct from p_workflow_run_id'
              in pg_temp._wdb_sql_code(v_raw)) = 0
     or not pg_temp._wdb_code_literal(v_raw, '''run_superseded''') then
    raise exception '0047 tail 6: the 6-arity clara.settle_autodraft_task lost 0046 S8''s run-identity no-op';
  end if;

  -- (7) THE 5-ARITY DID NOT ACQUIRE ONE. The two overloads stay distinct in exactly the
  -- documented way -- a harvest that read the wrong OID would show up here and nowhere else.
  select prosrc into v_raw from pg_proc
    where oid = 'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)'::regprocedure;
  if position('p_workflow_run_id' in pg_temp._wdb_sql_code(v_raw)) <> 0 then
    raise exception '0047 tail 7: the 5-arity clara.settle_autodraft_task now references p_workflow_run_id -- the harvest crossed the two overloads';
  end if;

  -- (8) THE SIGNATURE PAIR AND ITS ACLs ARE UNDISTURBED (0046 acl 1's post-state, re-made as
  -- a positive claim). CREATE OR REPLACE preserves ACLs, so this arm is what turns "preserves"
  -- from a documented property into a measured one.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task';
  if v_n <> 2 then
    raise exception '0047 tail 8: expected exactly TWO clara.settle_autodraft_task signatures after the recut, found %', v_n;
  end if;
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task'
      and p.pronargs=6 and p.pronargdefaults=0;
  if v_n <> 1 then
    raise exception '0047 tail 8: the 6-arity must still carry NO defaulted parameters (matched %/1) -- a default would make every 5-argument call planner-ambiguous', v_n;
  end if;
  for r in select p.oid, p.oid::regprocedure::text as sig from pg_proc p
            where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task'
  loop
    if not has_function_privilege('clara_runtime', r.oid, 'execute') then
      raise exception '0047 tail 8: clara_runtime cannot EXECUTE % -- CREATE OR REPLACE must preserve the runtime grant', r.sig;
    end if;
    if has_function_privilege('clara_authenticated', r.oid, 'execute')
       or has_function_privilege('clara_agent_ro', r.oid, 'execute') then
      raise exception '0047 tail 8: % is reachable from a non-runtime role -- settle is a runtime-lane verb only', r.sig;
    end if;
    if exists(select 1 from pg_proc p2, aclexplode(p2.proacl) a
              where p2.oid=r.oid and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception '0047 tail 8: PUBLIC holds EXECUTE on %', r.sig;
    end if;
    -- SECURITY DEFINER and the pinned search_path, asserted as UNCHANGED FROM THE PRE-IMAGE
    -- rather than against a literal typed here. The claim CREATE OR REPLACE makes is
    -- "preserved", so "equal to what was there before" is the claim stated exactly -- and it
    -- cannot be defeated by this file mis-guessing PostgreSQL's rendering of either.
    select secdef, config into v_pre_secdef, v_pre_config from _f1_pre where sig = r.sig;
    if v_pre_secdef is null then
      raise exception '0047 tail 8: no prestate privilege pre-image for % -- the overload census moved between prestate and tail', r.sig;
    end if;
    if (select p2.prosecdef from pg_proc p2 where p2.oid=r.oid) is distinct from v_pre_secdef then
      raise exception '0047 tail 8: % changed SECURITY DEFINER across the recut', r.sig;
    end if;
    if (select coalesce(array_to_string(p2.proconfig,'|'),'<none>') from pg_proc p2 where p2.oid=r.oid)
       is distinct from v_pre_config then
      raise exception '0047 tail 8: % changed its pinned search_path across the recut (was %, now %)',
        r.sig, v_pre_config,
        (select coalesce(array_to_string(p2.proconfig,'|'),'<none>') from pg_proc p2 where p2.oid=r.oid);
    end if;
  end loop;

  raise notice '0047 tail: 8 arms clean -- both overloads are the pre-image plus exactly the identity delta';
end
$tail$;
