-- 0046_wave_7a_sales_lane.sql -- WAVE §7-A: THE UNATTENDED SALES DRAFTER, DB HALF.
--
-- GOVERNING LAW: docs/plan/wave-7a-contract.md (7A-R1..R12, ratified 2026-08-06, ADR-063).
-- MECHANISM OF RECORD: docs/plan/wave-7a-design-skeleton.md v2 (ADR-062) SS0.3/2b/2c/2d/4.1.
-- Above both, always: docs/prd/PRD.md SS6 (LAW) and the four structural invariants.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md:175-182 +
-- .github/workflows/ci.yml:961-963). 0046 is the WORKING number; the frontier probe below
-- pins 0045_wave_d_b2_recurring_adjustments as the applied predecessor.
--
-- WHAT THIS FILE DOES, IN ONE PARAGRAPH. The OCR-sales autopost envelope has been BUILT
-- since 0016/0023/0030 and has never fired, because there is no unattended drafter to fire
-- on: `autoDraft.v5.tools.ts:174` hardcodes "supplier_bill", and 0036 SSD deliberately
-- fenced every sales-direction document AWAY from that purchase-only prompt. This migration
-- builds the DB half of the lane that replaces the fence with a contract: a DB-authoritative
-- TRI-STATE direction (7A-R2) computed from hard document evidence, binding the allowed
-- coding-kind family and revalidated in the draft writer; a narrow DRAFT-ONLY `tier_a_fails`
-- bypass on the sales lane (7A-R3); a per-firm cursor, daily cap and recorded backfill door
-- so nothing estate-stampedes at activation (7A-R5); and an activation kill-switch that
-- SHIPS OFF (7A-R1). It also hardens the earned floor itself on both axes the owner ruled:
-- `corroborated >= 6` and `coding_kind='sales_invoice'` (7A-R4).
--
-- D1 BINDS (packages/db/README.md:99-118). This file replaces the bodies of propose, sign,
-- execute, admit, settle, begin, the coding lane and the draft writer. PostgreSQL runs each
-- in-flight PL/pgSQL execution to completion on the body it STARTED with, so the deploy
-- window needs an application write-quiesce. 7A-R1 rules ONE continuous quiesce spanning
-- apply -> deploy v6 -> verify -> flip -> resume.
--
-- STATEMENT TIMEOUT (ADR-059 ceremony law). Tail arm (1) is a pg_proc-wide lex pass, the
-- exact shape that made the D-b2 ceremony time out through Supavisor's pool, where role-
-- and database-level settings are invisible. It is set HERE, inside the migration
-- connection and inside the runner's per-migration transaction, so it cannot be forgotten
-- at ceremony time.
set local statement_timeout = '20min';

-- =====================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing is
-- MEASURED here, before a single object changes, and each failure names the drift.
-- =====================================================================
do $prestate$
declare v_n int; v_names text;
begin
  -- (0.1) FRONTIER. This slice edits bodies 0045 left behind and asserts the D-b2 final
  -- form of the 0042 S5.25 clock roster, so 0045 must be recorded as applied.
  select count(*) into v_n from clara.schema_migrations
    where version = '0045_wave_d_b2_recurring_adjustments';
  if v_n <> 1 then
    raise exception '0046 prestate: 0045_wave_d_b2_recurring_adjustments is not recorded as applied -- apply in order'
      using errcode = 'CLR10';
  end if;

  -- (0.2) THE FLOOR IS STILL 0016'S, AND STILL FOUR-COLUMN. A drop/recreate onto a body
  -- somebody else already recut would silently discard their work: the floor's body is a
  -- STRING LITERAL, so PostgreSQL establishes no dependency and the drop is SILENT.
  select count(*) into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname = '_ocr_sales_floor';
  if v_n <> 1 then
    raise exception '0046 prestate: expected exactly ONE clara._ocr_sales_floor, found %', v_n
      using errcode = 'CLR10';
  end if;
  if pg_get_function_result('clara._ocr_sales_floor(uuid,uuid,text)'::regprocedure)
     <> 'TABLE(qualifying integer, distinct_docs integer, distinct_invoices integer, span_days integer)' then
    raise exception '0046 prestate: clara._ocr_sales_floor does not carry the as-built 0016 four-column shape (got %) -- refusing to drop a body this migration cannot account for',
      pg_get_function_result('clara._ocr_sales_floor(uuid,uuid,text)'::regprocedure)
      using errcode = 'CLR10';
  end if;

  -- (0.3) THE LIVE CALLER SET IS EXACTLY THREE. The corpus holds SEVEN historical
  -- invocation TEXTS (0016:1737,1821,2738 - 0022:1453 - 0023:854 - 0029:966 - 0030:1029),
  -- but only three are current DEFINITIONS: the other four are superseded bodies that
  -- exist only in migration files. This measures pg_proc, which holds definitions only.
  select count(*)::int, coalesce(string_agg(p.proname, ' ' order by p.proname), '')
    into v_n, v_names
    from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.prosrc ilike '%\_ocr\_sales\_floor%';
  if v_names <> 'execute_rule_post propose_autopost_rule sign_autopost_rule' then
    raise exception '0046 prestate: the live callers of clara._ocr_sales_floor are {%}, not the pinned three -- a caller appeared or moved and this migration''s recut census is stale', v_names
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE FIVE SPLICE SUBJECTS ARE THE BODIES THIS FILE WAS AUTHORED AGAINST. Each
  -- anchor is asserted to occur EXACTLY ONCE before it is replaced -- `replace()` rewrites
  -- every occurrence, so a drifted count is a silent multi-site edit.
  perform 1 from pg_proc p where p.pronamespace='clara'::regnamespace
    and p.proname='settle_autodraft_task';
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task';
  if v_n <> 1 then
    raise exception '0046 prestate: expected exactly ONE clara.settle_autodraft_task overload before this migration, found % -- the 6-arity may already exist', v_n
      using errcode = 'CLR10';
  end if;

  raise notice '0046 prestate: clean (frontier 0045, floor 4-column, 3 live callers, 1 settle overload)';
end
$prestate$;

-- =====================================================================
-- SECTION 1 -- THE SHARED LEX INSTRUMENT (pg_temp), EXTRACTED VERBATIM FROM 0045.
--
-- WHY IT IS HERE AT ALL. Tail arm (1) asks "which bodies CALL clara._ocr_sales_floor",
-- and that question has exactly one honest instrument in this repo. A raw prosrc match
-- answers it WRONG in both directions, and both directions were measured on a planted
-- frontier during the D-b2 ladder (0045:940-975): a body that merely NAMES the function in
-- a COMMENT reads as a caller (over-count, refuses a correct deploy), and a caller that
-- respells the call in upper case or with a quoted identifier reads as absent (under-count,
-- passes a wrong deploy). Law 3 in one sentence: a guard that reads a NAME reads a
-- projection of the thing, not the thing.
--
-- IT IS COPIED, NOT SHARED, AND THAT IS NOT AN OVERSIGHT. These live in pg_temp, which is
-- session-scoped: 0045's copies died with 0045's connection. Every slice of the D-b arc
-- re-created them for the same reason. The BODIES below are byte-identical to
-- 0045:344-627 / 673-685; only 0045's own D-b2 archaeology comments are left behind, with
-- this header standing in their place. 0045 is the origin of record for the reasoning
-- (its own header documents the `$`-lookbehind gap, the E-string trade, the chr(1)/chr(2)
-- sentinels and the standard_conforming_strings caveat, all of which still apply).
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

create or replace function pg_temp._wdb_call_rx(p_qname text) returns text
  language sql immutable as $rx$
  select '(?i)(?<![A-Za-z0-9_])'
      || replace(p_qname, '.', '[[:space:]' || chr(1) || ']*[.][[:space:]' || chr(1) || ']*')
      || '[[:space:]' || chr(1) || ']*[(]' $rx$;

-- HOW MANY TIMES DOES THIS CODE CALL THAT FUNCTION. `regexp_matches` rather than `regexp_count`
-- on purpose: the same rule the stripper states one screen up -- a deploy-time instrument that
-- needs a recent server function is an instrument that fails on the one database nobody tested
-- against (regexp_count is PostgreSQL 15+).
create or replace function pg_temp._wdb_call_count(p_code text, p_qname text) returns int
  language sql immutable as $cc$
  select count(*)::int from regexp_matches(p_code, pg_temp._wdb_call_rx(p_qname), 'g') $cc$;


-- =====================================================================
-- SECTION 2 -- DDL. The activation switch, the backlog door, and the two columns that
-- carry the bound direction from admission to the runtime.
--
-- ROLE SCOPING IS PER-SECTION (D-b census hazard 7.4): every block in this file opens and
-- closes its OWN `set role`, so nothing here depends on a role another section happened to
-- leave set. The new table must be owned by clara_fn_owner or its FORCE-RLS owner policy
-- names a role that does not own it -- tail arm (13) measures exactly that.
-- =====================================================================
set role clara_fn_owner;

-- (2.1) THE ACTIVATION KILL-SWITCH + THE STEADY-STATE GOVERNORS (7A-R1, 7A-R5).
--
-- WHY clara.firm_limits AND NOT A NEW SETTINGS TABLE. This is exactly the class of row
-- firm_limits already is: per-firm operator-set overrides for the autodraft sweep
-- (daily_token_limit, sweep_budget_share, max_concurrent_sweeps all live here, the last two
-- added by 0011:630 for this same lane). It is already owned by clara_fn_owner with RLS
-- ENABLE+FORCE and an owner-only policy, and NO application verb writes it -- so a new
-- audited definer verb granted to no app role is the whole mechanism, with no new table,
-- no new policy and no new grant surface.
--
-- ALL THREE COLUMNS FAIL CLOSED ON ABSENCE. A firm with no firm_limits row reads
-- sales_lane_active = FALSE (see clara._sales_lane_active below), and a NULL watermark
-- means "no filing is steady-state" rather than "every filing is". An absence is never
-- positive evidence.
alter table clara.firm_limits
  add column sales_lane_active boolean not null default false,
  add column sales_admission_daily_cap int,
  add column sales_admission_watermark timestamptz,
  add constraint ck_firm_limits_sales_admission_daily_cap check (
    sales_admission_daily_cap is null or sales_admission_daily_cap between 0 and 200);

-- (2.2) THE RECORDED BACKFILL DOOR (7A-R5). The historical backlog moves ONLY through one
-- of these: an explicit, recorded, batched, pausable operation opened by a named human. NO
-- DATE CUTOFF -- the watermark separates backlog from steady state, and this table is how
-- everything on the far side of it still gets done. (v1's cutoff shape was rejected exactly
-- because it stranded old sales filings permanently.)
create table clara.sales_backfill_batches (
  id             uuid primary key default gen_random_uuid(),
  firm_id        uuid        not null references clara.firms(id),
  client_id      uuid        not null references clara.clients(id),
  state          text        not null default 'open'
                             check (state in ('open','paused','closed')),
  batch_size     int         not null check (batch_size between 1 and 500),
  admitted_count int         not null default 0 check (admitted_count >= 0),
  opened_by      uuid        not null references clara.users(id),
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  note           text        not null check (btrim(note) <> ''),
  updated_at     timestamptz not null default now(),
  constraint ck_sales_backfill_admitted_within_batch check (admitted_count <= batch_size),
  constraint ck_sales_backfill_closed_at check (
    (state = 'closed') = (closed_at is not null))
);
-- At most ONE non-closed batch per (firm, client): with two, "which batch did this
-- admission consume" has no answer, and the accounting stops being a receipt.
create unique index uq_sales_backfill_open on clara.sales_backfill_batches(firm_id, client_id)
  where state <> 'closed';
create index ix_sales_backfill_firm_state on clara.sales_backfill_batches(firm_id, state);

alter table clara.sales_backfill_batches enable row level security;
alter table clara.sales_backfill_batches force row level security;
create policy p_sales_backfill_batches_owner on clara.sales_backfill_batches
  for all to clara_fn_owner using (true) with check (true);
create policy p_sales_backfill_batches_human on clara.sales_backfill_batches
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.sales_backfill_batches to clara_authenticated;

-- (2.3) THE BOUND DIRECTION, CARRIED. 7A-R2 binds the coding-kind family at ADMISSION;
-- this is where the binding becomes durable, and clara.begin_autodraft_task (recut in
-- SECTION 7) is how it reaches the workflow context. backfill_batch_id records which
-- recorded batch, if any, paid for this admission.
alter table clara.autodraft_attempts
  add column direction text check (direction is null or direction in ('sales','purchase')),
  add column backfill_batch_id uuid references clara.sales_backfill_batches(id);

reset role;

-- =====================================================================
-- SECTION 3 -- THE FLOOR (7A-R4 + the ROOT corroboration fix), AND THE ONE PLACE ITS
-- QUALIFYING POPULATION IS DEFINED.
-- =====================================================================
set role clara_fn_owner;

-- (3.1) THE POPULATION, FACTORED OUT. Two reasons, one of them a correction.
--
-- FIRST, THE CODEX CORRECTION, ACCEPTED: the old body evaluated
-- clara._invoice_fact_state(j.document_id) once for the invoice_id term, and adding a
-- second textual call for `corroborated` would NOT have been guaranteed to be one
-- evaluation. This body evaluates it ONCE per row through an explicit LATERAL join, and
-- every consumer reads that one evaluation.
--
-- SECOND, THE PREVIEW NEEDS THE SAME POPULATION, NOT A PARALLEL COPY OF IT.
-- clara.preview_ocr_sales_evidence must report how many of the QUALIFYING documents fail
-- corroboration; computing that from a hand-copied predicate would give the owner a number
-- that can drift away from the one the floor enforces. One predicate, one place, two
-- consumers.
--
-- 7A-R4 IS APPLIED TO THE WHOLE POPULATION, NOT TO A SUBSET OF THE TERMS. Sales posting
-- authority is earned from SALES INVOICES: a corroborated generic `journal_entry` with an
-- income credit and a customer counterparty is real bookkeeping, but it is not evidence
-- about how this client's sales invoices get coded, and it no longer feeds this floor's
-- qualifying count, its invoice-number count, its corroboration count OR its span.
--
-- THE AS-OF DATE IS A PARAMETER, DELIBERATELY. The MYT legal-date literal stays in
-- clara._ocr_sales_floor's own body so that the 0042:5536 / 0044:6525 duplication roster
-- (the EXACT set of clara bodies spelling the Asia/Kuala_Lumpur conversion) is unchanged by
-- this migration -- tail arm (5) re-measures it. Moving the literal in here would have
-- swapped one name for another in a set both those tails assert EXACTLY.
create function clara._ocr_sales_floor_pop(p_client uuid, p_cp uuid, p_account text,
    p_as_of date)
  returns table(entry_id uuid, document_id uuid, invoice_id text, posting_date date,
    corroborated boolean)
  language sql stable security definer set search_path=clara,pg_temp as $$
  select distinct s.entry_id, j.document_id,
         nullif(fs.state->>'invoice_id',''),
         j.posting_date,
         coalesce((fs.state->>'corroborated')::boolean,false)
  from clara.rule_sightings s
  join clara.journal_entries j on j.id=s.entry_id
  cross join lateral (select clara._invoice_fact_state(j.document_id) as state) fs
  where s.client_id=p_client and s.account_code=p_account and s.side='credit'
    and clara._canonical_counterparty(p_client,s.counterparty_id)=p_cp
    and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null
    and j.document_id is not null
    and j.coding_kind='sales_invoice'
    and j.posting_date<=p_as_of
    and not (j.flags ? 'amount_override') and not (j.flags ? 'duplicate_override');
$$;
revoke all on function clara._ocr_sales_floor_pop(uuid,uuid,text,date) from public;

-- (3.2) THE FLOOR ITSELF -- DROP + CREATE, SAME TRANSACTION.
--
-- WHY DROP AND NOT CREATE OR REPLACE: `CREATE OR REPLACE FUNCTION` cannot change a
-- RETURNS TABLE shape. The body is a string-literal SQL body, so PostgreSQL establishes NO
-- dependency on it and the DROP is SILENT -- nothing warns that three callers are, for the
-- duration, pointing at nothing. The migration runner gives one transaction per migration
-- (packages/db/scripts/migrate.mjs:143-156), so the window is closed by construction, and
-- the prestate above proved the body being dropped is the one this file was authored
-- against.
--
-- THE SHAPE CHANGE: `corroborated` is ADDED (the ROOT fix -- the floor now measures the
-- SAME signal execute_rule_post gates on at 0030:815, so an owner can no longer reach the
-- floor, sign, and watch the rule refuse `not_corroborated` on every document) and
-- `distinct_docs` is DELETED (documentation defect 2 -- it was returned and NO caller ever
-- read it; all three bind `distinct_invoices`, so the enforced rule was always STRICTER
-- than the header advertised).
--
-- DOCUMENTATION DEFECT 1, CORRECTED HERE: the 60-day span is measured on POSTING_DATE, not
-- on approval date. The 0016 header said "whose human approvals span >=60 days"; the code
-- said otherwise and the code wins. Six back-dated invoices spanning 60 posting-days
-- therefore satisfy that leg in one sitting -- a real property of this floor, now written
-- down where the next reader will find it.
--
-- DROP/CREATE DOES NOT PRESERVE THE ACL. Owner, SECURITY DEFINER, the pinned search_path
-- and `REVOKE ALL ... FROM PUBLIC` are all re-established (model: 0016:1595).
drop function clara._ocr_sales_floor(uuid,uuid,text);
create function clara._ocr_sales_floor(p_client uuid, p_cp uuid, p_account text)
  returns table(qualifying int, distinct_invoices int, corroborated int, span_days int)
  language sql stable security definer set search_path=clara,pg_temp as $$
  select count(distinct p.entry_id)::int,
         count(distinct p.invoice_id)::int,
         (count(distinct p.entry_id) filter (where p.corroborated))::int,
         (max(p.posting_date)-min(p.posting_date))::int
  from clara._ocr_sales_floor_pop(p_client,p_cp,p_account,
         (now() at time zone 'Asia/Kuala_Lumpur')::date) p;
$$;
revoke all on function clara._ocr_sales_floor(uuid,uuid,text) from public;

reset role;

-- =====================================================================
-- SECTION 4 -- THE THREE AUTHORITY CALLERS, RECUT. Each gains `corroborated` as a POSITIVE
-- gate at six.
--
-- WHY THIS IS THE DANGEROUS EDIT AND WHY THE TAIL IS WRITTEN THE WAY IT IS. v1 of this
-- design claimed an un-recut caller would fail at runtime. It is FALSE, and the truth is
-- worse: all three callers select NAMED columns that survive the new shape, so an un-recut
-- caller SUCCEEDS while silently omitting the corroboration gate. Nothing raises. That is
-- why tail arm (2) does not merely check that the old shape is gone -- it positively
-- requires each authority writer to bind `corroborated` and to compare it against six.
-- =====================================================================
set role clara_fn_owner;
do $callers$
declare v_def text; v_next text; v_anchor text; v_new text; v_count int;
begin
  -- ---------------------------------------------------------------- (4.1) PROPOSE
  select pg_get_functiondef('clara.propose_autopost_rule(jsonb,text)'::regprocedure) into v_def;

  v_anchor := '  v_side text; v_evc text; v_docs int; v_span_days int; v_hash_obj jsonb;';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S4.1: propose_autopost_rule declare anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    '  v_side text; v_evc text; v_docs int; v_span_days int; v_hash_obj jsonb; v_corr int;');

  v_anchor := '    select f.qualifying,f.distinct_invoices,f.span_days' || chr(10)
           || '      into v_seen,v_docs,v_span_days' || chr(10)
           || '      from clara._ocr_sales_floor(v_client,v_cp,v_account) f;' || chr(10)
           || '    if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6' || chr(10)
           || '       or v_span_days is null or v_span_days<60 then';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S4.1: propose_autopost_rule floor-call anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_new := '    select f.qualifying,f.distinct_invoices,f.corroborated,f.span_days' || chr(10)
        || '      into v_seen,v_docs,v_corr,v_span_days' || chr(10)
        || '      from clara._ocr_sales_floor(v_client,v_cp,v_account) f;' || chr(10)
        || '    if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6' || chr(10)
        || '       or coalesce(v_corr,0)<6' || chr(10)
        || '       or v_span_days is null or v_span_days<60 then';
  v_next := replace(v_next, v_anchor, v_new);

  v_anchor := 'an OCR-sales autopost proposal needs 6+ human-approved credit sightings across 6+ documents/invoice numbers spanning 60+ days';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S4.1: propose_autopost_rule refusal-copy anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    'an OCR-sales autopost proposal needs 6+ human-approved SALES-INVOICE credit sightings across 6+ stated invoice numbers, 6+ of them corroborated, spanning 60+ posting days');
  execute v_next;

  -- ---------------------------------------------------------------- (4.2) SIGN
  select pg_get_functiondef('clara.sign_autopost_rule(uuid,text)'::regprocedure) into v_def;

  v_anchor := '  v_seen int; v_docs int; v_span int;';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S4.2: sign_autopost_rule declare anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, '  v_seen int; v_docs int; v_span int; v_corr int;');

  v_anchor := '    select f.qualifying,f.distinct_invoices,f.span_days into v_seen,v_docs,v_span' || chr(10)
           || '      from clara._ocr_sales_floor(r.client_id,' || chr(10)
           || '        clara._canonical_counterparty(r.client_id,r.counterparty_id),r.account_code) f;' || chr(10)
           || '    if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6 or v_span is null or v_span<60 then';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S4.2: sign_autopost_rule floor-call anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_new := '    select f.qualifying,f.distinct_invoices,f.corroborated,f.span_days into v_seen,v_docs,v_corr,v_span' || chr(10)
        || '      from clara._ocr_sales_floor(r.client_id,' || chr(10)
        || '        clara._canonical_counterparty(r.client_id,r.counterparty_id),r.account_code) f;' || chr(10)
        || '    if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6 or coalesce(v_corr,0)<6 or v_span is null or v_span<60 then';
  v_next := replace(v_next, v_anchor, v_new);
  execute v_next;

  -- ---------------------------------------------------------------- (4.3) POST
  -- Control 6 re-derived ATOMICALLY at post time under
  -- pg_advisory_xact_lock(203005004,hashtext(client_id)) -- untouched; only the
  -- corroboration term is added, so evidence that stops being corroborated between signing
  -- and posting now strips the authority exactly as reversed evidence already did.
  select pg_get_functiondef('clara.execute_rule_post(uuid,text)'::regprocedure) into v_def;

  v_anchor := '  v_fseen int; v_fdocs int; v_fspan int;';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S4.3: execute_rule_post declare anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, '  v_fseen int; v_fdocs int; v_fspan int; v_fcorr int;');

  v_anchor := '    select f.qualifying,f.distinct_invoices,f.span_days into v_fseen,v_fdocs,v_fspan' || chr(10)
           || '      from clara._ocr_sales_floor(e.client_id,' || chr(10)
           || '        clara._canonical_counterparty(e.client_id,r.counterparty_id),r.account_code) f;' || chr(10)
           || '    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or v_fspan is null or v_fspan<60 then';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S4.3: execute_rule_post floor-call anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_new := '    select f.qualifying,f.distinct_invoices,f.corroborated,f.span_days into v_fseen,v_fdocs,v_fcorr,v_fspan' || chr(10)
        || '      from clara._ocr_sales_floor(e.client_id,' || chr(10)
        || '        clara._canonical_counterparty(e.client_id,r.counterparty_id),r.account_code) f;' || chr(10)
        || '    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or coalesce(v_fcorr,0)<6 or v_fspan is null or v_fspan<60 then';
  v_next := replace(v_next, v_anchor, v_new);
  execute v_next;

  raise notice '0046 S4: propose/sign/post recut onto the corroborated floor';
end
$callers$;
reset role;

-- =====================================================================
-- SECTION 5 -- THE ACTIVATION SWITCH, THE BACKLOG DOOR, AND THE TRI-STATE DIRECTION.
-- The three cheap reads the lane depends on, plus the verbs that move their state.
-- =====================================================================
set role clara_fn_owner;

-- (5.1) THE KILL-SWITCH READ (7A-R1). Cheap by construction: a single-row primary-key
-- probe on a table with one row per firm. FAIL-CLOSED: a firm with no firm_limits row, or
-- a row that predates this migration, reads FALSE.
create function clara._sales_lane_active(p_firm uuid) returns boolean
  language sql stable security definer set search_path=clara,pg_temp as $$
  select coalesce((select fl.sales_lane_active from clara.firm_limits fl
                   where fl.firm_id = p_firm), false);
$$;
revoke all on function clara._sales_lane_active(uuid) from public;

-- (5.2) THE DB-AUTHORITATIVE TRI-STATE DIRECTION (7A-R2).
--
-- clara._autodraft_sales_direction (0036:497) is BOOLEAN and collapses a CLR30 direction
-- contradiction to FALSE -- correct for the question it was asked ("is this provably
-- sales?"), useless for the question this lane asks ("which coding-kind family may this
-- document be drafted into?"). It KEEPS ITS NAME and its behaviour, because the
-- `sales_direction` receipt token it produces is written into historical
-- clara.sweep_run_items rows that must stay readable.
--
-- 'unresolved' NEVER DRAFTS. It is deliberately not given its own admission refusal: a
-- contradicting document already reaches clara._coding_lane_core, which appends
-- `direction_unresolved`, marks the lane HARD, and is refused by admission with the
-- existing `lane_changed` receipt naming that reason. One refusal, one receipt, no second
-- path to maintain.
--
-- A NULL DOCUMENT ANSWERS 'purchase', mirroring clara._document_direction's own null
-- default rather than diverging from it. For THIS lane that is the fail-closed answer:
-- 'purchase' is what refuses a sales admission.
create function clara._autodraft_direction_tri(p_document uuid, p_client uuid) returns text
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_direction text;
begin
  if p_document is null or p_client is null then return 'purchase'; end if;
  begin
    v_direction := clara._document_direction(p_document,p_client);
  exception when sqlstate 'CLR30' then
    return 'unresolved';
  end;
  if v_direction is null or v_direction not in ('sales','purchase') then
    return 'unresolved';
  end if;
  return v_direction;
end $$;
revoke all on function clara._autodraft_direction_tri(uuid,uuid) from public;

-- (5.3) IS THIS SALES FILING ADMISSIBLE AT ALL (7A-R5)? Consumed by the estate-wide
-- enumerator so the historical backlog is not even ENUMERATED at activation; admission
-- re-derives the same facts and is the actual gate (0036 SSD's own reasoning: the primary
-- dispatch path goes through clara.list_document_autodraft_candidates, which by design
-- applies no filters, so the enumerator can only ever be an optimisation).
--
-- IT RETURNS A STRICT BOOLEAN, NEVER NULL, and that is load-bearing: it is consumed inside
-- `not X or Y` in a `language sql` WHERE clause, where a NULL would make the whole
-- disjunction NULL and SILENTLY DROP the row -- stranding PURCHASE work invisibly, which
-- is the exact failure 0036:508-517 documents and guards against by the same reasoning.
create function clara._sales_admission_open(p_firm uuid, p_client uuid, p_filing uuid)
  returns boolean
  language sql stable security definer set search_path=clara,pg_temp as $$
  select clara._sales_lane_active(p_firm)
     and (
       exists(select 1 from clara.document_filings df
              join clara.firm_limits fl on fl.firm_id = p_firm
              where df.id = p_filing
                and fl.sales_admission_watermark is not null
                and df.filed_at >= fl.sales_admission_watermark)
       or exists(select 1 from clara.sales_backfill_batches b
                 where b.firm_id = p_firm and b.client_id = p_client
                   and b.state = 'open' and b.admitted_count < b.batch_size)
     );
$$;
revoke all on function clara._sales_admission_open(uuid,uuid,uuid) from public;

-- (5.4) THE FLIP VERB (7A-R1). GRANTED TO NO APPLICATION ROLE, DELIBERATELY.
--
-- `revoke all ... from public` with no grant that follows leaves exactly one caller: the
-- owner/deploy connection. That is the whole access-control story -- there is no app path
-- to this verb from clara_authenticated, clara_runtime, clara_agent_ro or any wake role, so
-- neither a human in the product nor the agent can open the sales lane. The ceremony flips
-- it inside the quiesce window, AFTER v6 is verified live; thereafter it is an EMERGENCY
-- DE-ACTIVATION switch, never a second ceremony and never a bypass of any other gate.
--
-- A REASON IS REQUIRED, and both the before and after state are written to the append-only
-- audit log, because "who turned the unattended sales drafter on, when, and why" is a
-- question this product will be asked.
create function clara.set_sales_lane_activation(p_firm uuid, p_active boolean,
    p_watermark timestamptz, p_reason text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare b record; v_wm timestamptz; v_reason text;
begin
  if p_firm is null or p_active is null then
    raise exception 'firm and active are required' using errcode='CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'a reason is required to move the sales-lane activation' using errcode='CLR10';
  end if;
  if not exists(select 1 from clara.firms where id=p_firm) then
    raise exception 'firm not found' using errcode='CLR11';
  end if;
  insert into clara.firm_limits(firm_id) values(p_firm) on conflict(firm_id) do nothing;
  select * into b from clara.firm_limits where firm_id=p_firm for update;
  -- Activating without a watermark sets one at NOW: everything already filed is backlog and
  -- moves only through a recorded batch. Deactivating leaves the watermark where it is, so
  -- an emergency flip-off followed by a flip-on does not silently re-open the backlog.
  v_wm := case when p_active
            then coalesce(p_watermark, b.sales_admission_watermark, now())
            else b.sales_admission_watermark end;
  update clara.firm_limits
     set sales_lane_active=p_active, sales_admission_watermark=v_wm, updated_at=now()
   where firm_id=p_firm;
  perform clara._audit(p_firm,null,null,null,'set_sales_lane_activation',null,
    jsonb_build_object('firm',p_firm,'active',p_active,'was_active',b.sales_lane_active,
      'watermark',v_wm,'was_watermark',b.sales_admission_watermark,'reason',v_reason));
  return jsonb_build_object('firm_id',p_firm,'sales_lane_active',p_active,
    'was_active',b.sales_lane_active,'sales_admission_watermark',v_wm);
end $$;
revoke all on function clara.set_sales_lane_activation(uuid,boolean,timestamptz,text) from public;

-- (5.5) THE BACKFILL VERBS (7A-R5). Human lane, admin floor, op-keyed, audited.
create function clara.open_sales_backfill(p_client uuid, p_batch_size int, p_note text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_note text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_batch_size is null then
    raise exception 'client and batch_size are required' using errcode='CLR10';
  end if;
  v_note := nullif(btrim(coalesce(p_note,'')),'');
  if v_note is null then
    raise exception 'a note is required to open a sales backfill' using errcode='CLR10';
  end if;
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'batch_size must be between 1 and 500' using errcode='CLR10';
  end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'open_sales_backfill',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'batch',p_batch_size,'note',v_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  begin
    insert into clara.sales_backfill_batches(firm_id,client_id,batch_size,opened_by,note)
      values(c.firm,p_client,p_batch_size,c.actor,v_note) returning id into v_id;
  exception when unique_violation then
    raise exception 'this client already has an open or paused sales backfill batch'
      using errcode='CLR27', detail='{"reason":"backfill_already_open"}';
  end;
  perform clara._audit(c.firm,c.actor,null,null,'open_sales_backfill',null,
    jsonb_build_object('batch',v_id,'client',p_client,'batch_size',p_batch_size,
      'note',v_note,'op_key',p_op_key));
  return clara._finish_op(c.firm,'open_sales_backfill',p_op_key,
    jsonb_build_object('batch_id',v_id,'client_id',p_client,'batch_size',p_batch_size,
      'state','open'));
end $$;
revoke all on function clara.open_sales_backfill(uuid,int,text,text) from public;

-- Pause / resume / close. PAUSABLE is a 7A-R5 word: a batch that is producing bad drafts
-- must be stoppable WITHOUT closing it and losing its accounting. A closed batch is
-- terminal -- reopening is a new batch with its own note and its own receipt.
create function clara.set_sales_backfill_state(p_batch uuid, p_state text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; b record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_batch is null or p_state is null or p_state not in ('open','paused','closed') then
    raise exception 'batch and a state of open/paused/closed are required' using errcode='CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'set_sales_backfill_state',p_op_key,
    clara._hash(jsonb_build_object('batch',p_batch,'state',p_state)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into b from clara.sales_backfill_batches where id=p_batch for update;
  if not found or b.firm_id<>c.firm then
    raise exception 'sales backfill batch not found' using errcode='CLR11';
  end if;
  if b.state='closed' and p_state<>'closed' then
    raise exception 'a closed sales backfill batch cannot be reopened -- open a new one'
      using errcode='CLR27', detail='{"reason":"backfill_closed"}';
  end if;
  update clara.sales_backfill_batches
     set state=p_state,
         closed_at=case when p_state='closed' then coalesce(closed_at,now()) else null end,
         updated_at=now()
   where id=p_batch;
  perform clara._audit(c.firm,c.actor,null,null,'set_sales_backfill_state',null,
    jsonb_build_object('batch',p_batch,'state',p_state,'was_state',b.state,
      'admitted_count',b.admitted_count,'batch_size',b.batch_size,'op_key',p_op_key));
  return clara._finish_op(c.firm,'set_sales_backfill_state',p_op_key,
    jsonb_build_object('batch_id',p_batch,'state',p_state,'was_state',b.state,
      'admitted_count',b.admitted_count,'batch_size',b.batch_size));
end $$;
revoke all on function clara.set_sales_backfill_state(uuid,text,text) from public;

-- The read. "Recorded" is only true if somebody can SEE the record; firm-scoped through
-- clara._human_ctx exactly like clara.list_autopost_rules (0015:2852-2866).
create function clara.list_sales_backfill_batches(p_scope jsonb) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record; v_client uuid; v_rows jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if p_scope is not null and p_scope ? 'client_id' then
    begin v_client := (p_scope->>'client_id')::uuid;
    exception when others then
      raise exception 'scope client_id is malformed' using errcode='CLR10'; end;
    if not exists(select 1 from clara.clients where id=v_client and firm_id=c.firm) then
      raise exception 'client not in your firm' using errcode='CLR11';
    end if;
  end if;
  select coalesce(jsonb_agg(q.obj order by (q.obj->>'opened_at') desc),'[]'::jsonb)
    into v_rows from (
    select jsonb_build_object(
      'batch_id',b.id,'client_id',b.client_id,'client_name',cl.name,'state',b.state,
      'batch_size',b.batch_size,'admitted_count',b.admitted_count,
      'remaining',greatest(b.batch_size-b.admitted_count,0),
      'opened_by',b.opened_by,'opened_at',b.opened_at,'closed_at',b.closed_at,
      'note',b.note) as obj
    from clara.sales_backfill_batches b
    join clara.clients cl on cl.id=b.client_id
    where b.firm_id=c.firm and (v_client is null or b.client_id=v_client)
  ) q;
  return v_rows;
end $$;
revoke all on function clara.list_sales_backfill_batches(jsonb) from public;

reset role;

-- =====================================================================
-- SECTION 6 -- THE SIGNING-TIME EVIDENCE PREVIEW (skeleton SS2b). CALLER FOUR.
-- =====================================================================
set role clara_fn_owner;

-- WHAT PROBLEM THIS SOLVES. Corroboration requires the document to STATE its tax
-- (`v_tax is not null`, 0023:311 -- "a document that does not state a tax has proven
-- nothing about its tax"). Sub-threshold non-SST registrants are routine Malaysian
-- reality, so a client's entire sales corpus can be tax-silent. Before SECTION 3 the floor
-- ignored corroboration entirely, and an owner could reach the floor, sign a rule, and
-- watch it refuse `not_corroborated` on every single document. SECTION 3 makes the floor
-- itself the block; this verb is the EXPLANATION -- mechanism in the DB, explanation in the
-- UI.
--
-- IT IS ADVISORY AND SAYS SO. clara.sign_autopost_rule re-derives the live floor at signing
-- and clara.execute_rule_post re-derives it again at posting under the client
-- serialization lock. This number is a snapshot with a timestamp on it, never an authority.
--
-- IT CALLS THE FLOOR RATHER THAN RE-IMPLEMENTING IT, which makes it the FOURTH live caller
-- and is why tail arm (1) asserts four, not three. `tax_silent_documents` is derived from
-- clara._ocr_sales_floor_pop -- the SAME qualifying population the floor aggregates -- so
-- the gap it shows can never drift away from the gap the floor enforces.
--
-- COUNTS ARE INTEGERS. The dashboard panel's fmtCents is for the amount cap; these are
-- document counts and must not go through it.
create function clara.preview_ocr_sales_evidence(p_rule uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare c record; r record; v_cp uuid; v_as_of date;
  v_q int; v_inv int; v_corr int; v_span int; v_silent int;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  if p_rule is null then raise exception 'rule is required' using errcode='CLR10'; end if;
  -- NOT-APPLICABLE IS A RETURN, NOT A RAISE: the panel renders this beside every autopost
  -- rule it lists, and an exception on a purchase rule would break that surface. An
  -- inaccessible rule answers the SAME not-applicable shape as a wrong-class one, so the
  -- verb never becomes a cross-firm existence oracle.
  select cr.* into r from clara.coding_rules cr
    join clara.clients cl on cl.id=cr.client_id and cl.firm_id=c.firm
    where cr.id=p_rule and cr.firm_id=c.firm;
  if not found then
    return jsonb_build_object('rule_id',p_rule,'applicable',false,
      'reason','rule_not_accessible','advisory',true,'evaluated_at',now());
  end if;
  if r.rule_type<>'autopost' or r.direction is distinct from 'sales' then
    return jsonb_build_object('rule_id',p_rule,'applicable',false,
      'reason','not_sales','advisory',true,'evaluated_at',now());
  end if;
  if r.evidence_class is distinct from 'ocr_sales' then
    return jsonb_build_object('rule_id',p_rule,'applicable',false,
      'reason','not_ocr_sales','evidence_class',r.evidence_class,
      'advisory',true,'evaluated_at',now());
  end if;
  v_cp := clara._canonical_counterparty(r.client_id,r.counterparty_id);
  select f.qualifying,f.distinct_invoices,f.corroborated,f.span_days
    into v_q,v_inv,v_corr,v_span
    from clara._ocr_sales_floor(r.client_id,v_cp,r.account_code) f;
  -- clara._book_today() is the house MYT legal-date authority (0042:4592). Calling it --
  -- rather than spelling the conversion again -- is what keeps the 0042 S5.25 duplication
  -- roster unchanged by this migration; a new CALLER of the authority is the outcome that
  -- section exists to produce.
  v_as_of := clara._book_today();
  select count(distinct p.document_id)::int into v_silent
    from clara._ocr_sales_floor_pop(r.client_id,v_cp,r.account_code,v_as_of) p
    where not p.corroborated;
  return jsonb_build_object(
    'rule_id',p_rule,'applicable',true,'advisory',true,
    'client_id',r.client_id,'counterparty_id',v_cp,'account_code',r.account_code,
    'rule_status',r.status,
    'qualifying',coalesce(v_q,0),'distinct_invoices',coalesce(v_inv,0),
    'corroborated',coalesce(v_corr,0),'span_days',v_span,
    'tax_silent_documents',coalesce(v_silent,0),
    'required',jsonb_build_object('qualifying',6,'distinct_invoices',6,
      'corroborated',6,'span_days',60),
    'floor_met',(coalesce(v_q,0)>=6 and coalesce(v_inv,0)>=6 and coalesce(v_corr,0)>=6
                 and v_span is not null and v_span>=60),
    'evaluated_at',now());
end $$;
revoke all on function clara.preview_ocr_sales_evidence(uuid) from public;

reset role;

-- =====================================================================
-- SECTION 7 -- THE ADMISSION PATH. The direction contract, the governors, and the two
-- surfaces that carry the binding onward.
-- =====================================================================
set role clara_fn_owner;
do $admission$
declare v_def text; v_next text; v_anchor text; v_new text; v_count int;
begin
  -- ------------------------------------------------------- (7.1) admit_autodraft_task
  select pg_get_functiondef(
    'clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure) into v_def;

  v_anchor := '  v_is_retry boolean:=false;';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.1: admit_autodraft_task declare anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    '  v_is_retry boolean:=false;' || chr(10)
    || '  v_direction text; v_wm timestamptz; v_batch record; v_batch_id uuid;' || chr(10)
    || '  v_cap_sales int; v_used_sales int;');

  -- THE GATE ITSELF. 0036 SSD refused every clean-sales document by name; this replaces
  -- that flat refusal with the 7A-R2 contract plus 7A-R1's switch and 7A-R5's governors.
  -- It stays exactly where 0036 put it -- WITH the lane check and strictly BEFORE op-key
  -- reservation -- for 0031's reason: a refusal creates no resource, so it must be
  -- re-derived fresh on every call and never frozen into an op-key receipt.
  --
  -- EVERY REFUSAL BELOW WRITES A RUN-BOUND ITEM. A sweep-origin admission that returns
  -- without writing one leaves the run's expected_count unreachable and the run open
  -- forever, accumulating against the concurrent-sweep cap -- a firm-wide wedge. The
  -- item rides 'skipped_lane' with a DISTINCT refusal_token reason because
  -- sweep_run_items.outcome is a CHECK-constrained enum, exactly as the pre-existing
  -- sales_direction and lane_changed refusals already encode themselves.
  v_anchor := '  if clara._autodraft_sales_direction(f.document_id,f.client_id) then' || chr(10)
    || '    if p_run_id is not null then' || chr(10)
    || '      insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,' || chr(10)
    || '          outcome,refusal_token)' || chr(10)
    || '        values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,''skipped_lane'',' || chr(10)
    || '          jsonb_build_object(''clr'',''CLR29'',''reason'',''sales_direction'',''direction'',''sales''))' || chr(10)
    || '        on conflict do nothing;' || chr(10)
    || '    end if;' || chr(10)
    || '    return jsonb_build_object(''outcome'',''skipped_direction'',''reason'',''sales_direction'',' || chr(10)
    || '      ''direction'',''sales'');' || chr(10)
    || '  end if;';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.1: admit_autodraft_task 0036 sales-gate anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;

  v_new :=
    '  -- 0046 SS7-A (7A-R2/R1/R5): THE DIRECTION CONTRACT REPLACES THE FLAT REFUSAL ABOVE.' || chr(10)
    || '  -- The comment block immediately above is 0036 SSD''s, kept because its reasoning about' || chr(10)
    || '  -- WHY a sales document had to be fenced away -- and why the receipt rides' || chr(10)
    || '  -- ''skipped_lane'' with a distinct token -- is still the reasoning this branch obeys.' || chr(10)
    || '  -- What changed: the fence is now conditional on a per-firm activation flag.' || chr(10)
    || '  --' || chr(10)
    || '  -- WHILE THE FLAG IS OFF THIS IS BYTE-IDENTICAL TO 0036, AND THAT IS THE POINT. The' || chr(10)
    || '  -- inactive branch returns 0036''s exact receipt -- outcome skipped_direction, reason' || chr(10)
    || '  -- ''sales_direction'' -- so nothing observable changes anywhere in the product until' || chr(10)
    || '  -- the ceremony flips the flag. The lane is not merely disabled; it is INERT.' || chr(10)
    || '  --' || chr(10)
    || '  -- The tri-state answer BINDS the coding-kind family for this task; the draft writer' || chr(10)
    || '  -- revalidates it, so a model-chosen coding_kind is never routing authority.' || chr(10)
    || '  -- ''unresolved'' takes NO branch here on purpose -- it falls through to the lane check' || chr(10)
    || '  -- below, which already refuses it as lane_changed/direction_unresolved.' || chr(10)
    || '  v_direction:=clara._autodraft_direction_tri(f.document_id,f.client_id);' || chr(10)
    || '  if v_direction=''sales'' then' || chr(10)
    || '    if not clara._sales_lane_active(f.firm_id) then' || chr(10)
    || '      if p_run_id is not null then' || chr(10)
    || '        insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,' || chr(10)
    || '            outcome,refusal_token)' || chr(10)
    || '          values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,''skipped_lane'',' || chr(10)
    || '            jsonb_build_object(''clr'',''CLR29'',''reason'',''sales_direction'',''direction'',''sales''))' || chr(10)
    || '          on conflict do nothing;' || chr(10)
    || '      end if;' || chr(10)
    || '      return jsonb_build_object(''outcome'',''skipped_direction'',''reason'',''sales_direction'',' || chr(10)
    || '        ''direction'',''sales'');' || chr(10)
    || '    end if;' || chr(10)
    || '    select fl.sales_admission_watermark,coalesce(fl.sales_admission_daily_cap,15)' || chr(10)
    || '      into v_wm,v_cap_sales from clara.firm_limits fl where fl.firm_id=f.firm_id;' || chr(10)
    || '    v_cap_sales:=coalesce(v_cap_sales,15);' || chr(10)
    || '    if v_wm is null or f.filed_at<v_wm then' || chr(10)
    || '      select b.* into v_batch from clara.sales_backfill_batches b' || chr(10)
    || '        where b.firm_id=f.firm_id and b.client_id=f.client_id and b.state=''open''' || chr(10)
    || '          and b.admitted_count<b.batch_size for update;' || chr(10)
    || '      if not found then' || chr(10)
    || '        if p_run_id is not null then' || chr(10)
    || '          insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,' || chr(10)
    || '              outcome,refusal_token)' || chr(10)
    || '            values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,''skipped_lane'',' || chr(10)
    || '              jsonb_build_object(''clr'',''CLR29'',''reason'',''sales_backlog_held'',''direction'',''sales''))' || chr(10)
    || '            on conflict do nothing;' || chr(10)
    || '        end if;' || chr(10)
    || '        return jsonb_build_object(''outcome'',''skipped_direction'',' || chr(10)
    || '          ''reason'',''sales_backlog_held'',''direction'',''sales'');' || chr(10)
    || '      end if;' || chr(10)
    || '      v_batch_id:=v_batch.id;' || chr(10)
    || '    end if;' || chr(10)
    || '    perform pg_advisory_xact_lock(203007001,hashtext(f.firm_id::text));' || chr(10)
    || '    select count(*)::int into v_used_sales from clara.autodraft_attempts aa' || chr(10)
    || '      where aa.firm_id=f.firm_id and aa.usage_date=v_today and aa.direction=''sales''' || chr(10)
    || '        and aa.filing_id<>p_filing;' || chr(10)
    || '    if v_used_sales>=v_cap_sales then' || chr(10)
    || '      if p_run_id is not null then' || chr(10)
    || '        insert into clara.sweep_run_items(run_id,filing_id,firm_id,client_id,document_id,' || chr(10)
    || '            outcome,refusal_token)' || chr(10)
    || '          values(p_run_id,p_filing,f.firm_id,f.client_id,f.document_id,''refused_budget'',' || chr(10)
    || '            jsonb_build_object(''clr'',''CLR29'',''reason'',''refused_sales_cap'',' || chr(10)
    || '              ''gate'',''sales_daily_cap'',''cap'',v_cap_sales,''used'',v_used_sales))' || chr(10)
    || '          on conflict do nothing;' || chr(10)
    || '      end if;' || chr(10)
    || '      return jsonb_build_object(''outcome'',''refused_budget'',''reason'',''refused_sales_cap'',' || chr(10)
    || '        ''cap'',v_cap_sales,''used'',v_used_sales);' || chr(10)
    || '    end if;' || chr(10)
    || '  end if;';
  v_next := replace(v_next, v_anchor, v_new);

  -- The registry row carries the bound direction onward, and records which recorded batch
  -- (if any) paid for this admission.
  v_anchor := '    insert into clara.autodraft_attempts(firm_id,client_id,document_id,filing_id,' || chr(10)
    || '        task_id,origin,run_id,state,reserved_tokens,usage_date,last_refusal)' || chr(10)
    || '      values(f.firm_id,f.client_id,f.document_id,p_filing,v_task,p_origin,p_run_id,' || chr(10)
    || '        ''active'',p_reserve_tokens,v_today,null)' || chr(10)
    || '      on conflict(filing_id) do update set task_id=excluded.task_id,origin=excluded.origin,' || chr(10)
    || '        run_id=excluded.run_id,state=''active'',reserved_tokens=excluded.reserved_tokens,' || chr(10)
    || '        usage_date=excluded.usage_date,last_refusal=null,updated_at=now();';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.1: admit_autodraft_task registry-insert anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_new := '    insert into clara.autodraft_attempts(firm_id,client_id,document_id,filing_id,' || chr(10)
    || '        task_id,origin,run_id,state,reserved_tokens,usage_date,last_refusal,' || chr(10)
    || '        direction,backfill_batch_id)' || chr(10)
    || '      values(f.firm_id,f.client_id,f.document_id,p_filing,v_task,p_origin,p_run_id,' || chr(10)
    || '        ''active'',p_reserve_tokens,v_today,null,v_direction,v_batch_id)' || chr(10)
    || '      on conflict(filing_id) do update set task_id=excluded.task_id,origin=excluded.origin,' || chr(10)
    || '        run_id=excluded.run_id,state=''active'',reserved_tokens=excluded.reserved_tokens,' || chr(10)
    || '        usage_date=excluded.usage_date,last_refusal=null,updated_at=now(),' || chr(10)
    || '        direction=excluded.direction,backfill_batch_id=excluded.backfill_batch_id;' || chr(10)
    || '    if v_batch_id is not null then' || chr(10)
    || '      update clara.sales_backfill_batches' || chr(10)
    || '        set admitted_count=admitted_count+1,' || chr(10)
    || '            state=case when admitted_count+1>=batch_size then ''closed'' else state end,' || chr(10)
    || '            closed_at=case when admitted_count+1>=batch_size then now() else closed_at end,' || chr(10)
    || '            updated_at=now()' || chr(10)
    || '        where id=v_batch_id;' || chr(10)
    || '    end if;';
  v_next := replace(v_next, v_anchor, v_new);

  -- The admission receipt names the direction it bound, so the audit log answers "which
  -- family was this task allowed to draft into" without re-deriving anything.
  v_anchor := '      jsonb_build_object(''task'',v_task,''filing'',p_filing,''origin'',p_origin,' || chr(10)
    || '        ''run'',p_run_id,''reserved_tokens'',p_reserve_tokens));';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.1: admit_autodraft_task audit anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '      jsonb_build_object(''task'',v_task,''filing'',p_filing,''origin'',p_origin,' || chr(10)
    || '        ''run'',p_run_id,''reserved_tokens'',p_reserve_tokens,''direction'',v_direction,' || chr(10)
    || '        ''backfill_batch'',v_batch_id));');
  execute v_next;

  -- ------------------------------------------------------- (7.2) begin_autodraft_task
  -- The bound direction reaches the workflow context here: the runtime reads this jsonb
  -- to learn which coding-kind family the task may propose. Both return shapes -- the
  -- replay branch and the fresh-start branch -- must carry it, or a resumed run would see
  -- a different contract than the run that started it.
  select pg_get_functiondef('clara.begin_autodraft_task(uuid,text)'::regprocedure) into v_def;
  v_anchor := '''reserved_tokens'',a.reserved_tokens)';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 2 then
    raise exception '0046 S7.2: begin_autodraft_task return anchor occurs % times, expected 2', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    '''reserved_tokens'',a.reserved_tokens,''direction'',a.direction)');
  execute v_next;

  -- ------------------------------------------------------- (7.3) the enumerator
  -- 0036 SSD excluded every clean-sales filing from the estate-wide catch-up enumeration.
  -- The exclusion now yields to clara._sales_admission_open, so an ACTIVATED firm's
  -- steady-state sales filings are enumerated and its BACKLOG is not -- nothing
  -- estate-stampedes at activation (7A-R5, Q2). Admission remains the gate; this is an
  -- optimisation that keeps the backlog from generating a receipt per document per sweep.
  select pg_get_functiondef('clara.list_autodraft_candidates()'::regprocedure) into v_def;
  v_anchor := '    and not clara._autodraft_sales_direction(f.document_id,f.client_id)';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.3: list_autodraft_candidates direction anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    '    and (not clara._autodraft_sales_direction(f.document_id,f.client_id)' || chr(10)
    || '         or clara._sales_admission_open(f.firm_id,f.client_id,f.id))');
  execute v_next;

  -- ------------------------------------------------------- (7.4) the queue's own answer
  -- NOT IN THE LITERAL SCOPE LIST, AND HERE ON PURPOSE. clara._autodraft_attempt_budget is
  -- what clara.list_review_queue renders as "why the sweep will never take this filing"
  -- (0036 SSD's visibility half). It reads the flat clara._autodraft_sales_direction, so
  -- after activation it would tell a human `sweep_eligible=false, sales_direction` about a
  -- filing the sweep is, at that moment, about to draft. Shipping a lane that makes its own
  -- queue read lie is not a thing to leave for later.
  --
  -- WHILE THE FLAG IS OFF THE ANSWER IS UNCHANGED: clara._sales_admission_open is false for
  -- every firm, so `not v_sales or false` is `not v_sales` and the reason is still
  -- 'sales_direction' -- the same inertness the admission branch above carries.
  select pg_get_functiondef('clara._autodraft_attempt_budget(uuid)'::regprocedure) into v_def;
  v_anchor := '    ''sweep_eligible'', not v_sales,' || chr(10)
    || '    ''blocked_reason'', case when v_sales then ''sales_direction'' else null end);';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.4: _autodraft_attempt_budget eligibility anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    '    ''sweep_eligible'', not v_sales or clara._sales_admission_open(v_firm,v_client,p_filing),' || chr(10)
    || '    ''blocked_reason'', case' || chr(10)
    || '      when not v_sales then null' || chr(10)
    || '      when clara._sales_admission_open(v_firm,v_client,p_filing) then null' || chr(10)
    || '      when clara._sales_lane_active(v_firm) then ''sales_backlog_held''' || chr(10)
    || '      else ''sales_direction'' end);');
  -- v_firm is new: the eligibility read is per-FIRM (the flag, the watermark and the batch
  -- all are) and this body only ever resolved the client.
  v_anchor := '  v_document uuid; v_client uuid; v_cap int; v_used int; v_sales boolean;';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.4: _autodraft_attempt_budget declare anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  v_document uuid; v_client uuid; v_cap int; v_used int; v_sales boolean; v_firm uuid;');
  v_anchor := '  select df.document_id, df.client_id into v_document, v_client' || chr(10)
    || '    from clara.document_filings df where df.id = p_filing;';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S7.4: _autodraft_attempt_budget filing-select anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  select df.document_id, df.client_id, df.firm_id into v_document, v_client, v_firm' || chr(10)
    || '    from clara.document_filings df where df.id = p_filing;');
  execute v_next;

  raise notice '0046 S7: admission direction contract installed';
end
$admission$;
reset role;

-- =====================================================================
-- SECTION 8 -- clara.settle_autodraft_task, THE 6-ARITY OVERLOAD (skeleton SS2d).
-- =====================================================================
set role clara_fn_owner;
do $settle$
declare v_def text; v_next text; v_anchor text; v_count int;
begin
  -- THE NEW BODY IS THE LIVE 0036 BODY, HARVESTED AND SPLICED -- NEVER A CLONE OF 0011'S.
  -- 0036 SSB rewrote three losing-dispatch shapes into honest no-op receipts and moved the
  -- park threshold onto the shared clara._autodraft_attempt_cap(); re-typing 0011's older
  -- body would silently revert all of that. Deriving the overload from pg_get_functiondef
  -- makes the preservation structural rather than a promise.
  select pg_get_functiondef(
    'clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb)'::regprocedure) into v_def;

  -- ALL SIX PARAMETERS ARE REQUIRED. PostgreSQL forbids a required parameter after
  -- defaulted ones, so p_entry and p_refusal lose their defaults in this overload -- which
  -- is also what keeps the two signatures non-overlapping: a 5-argument call can only ever
  -- resolve to the 5-arity, and a 6-argument call only to this one. (The function is not
  -- reached through PostgREST at all: direct node-postgres from autoDraft.v*.impl.ts and
  -- reconciler.mjs, granted to clara_runtime, never clara_authenticated.)
  v_anchor := 'CREATE OR REPLACE FUNCTION clara.settle_autodraft_task(p_task uuid, p_outcome text, p_tokens bigint, p_entry uuid DEFAULT NULL::uuid, p_refusal jsonb DEFAULT NULL::jsonb)';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S8: settle_autodraft_task signature anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    'CREATE OR REPLACE FUNCTION clara.settle_autodraft_task(p_task uuid, p_outcome text, p_tokens bigint, p_entry uuid, p_refusal jsonb, p_workflow_run_id text)');

  v_anchor := '  if p_task is null or p_outcome is null' || chr(10)
    || '     or p_outcome not in (''drafted'',''skipped_lane'',''noop_existing'',''failed'')' || chr(10)
    || '     or p_tokens is null or p_tokens<0 then';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S8: settle_autodraft_task malformed-check anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  if p_task is null or p_outcome is null' || chr(10)
    || '     or p_outcome not in (''drafted'',''skipped_lane'',''noop_existing'',''failed'')' || chr(10)
    || '     or p_tokens is null or p_tokens<0' || chr(10)
    || '     or p_workflow_run_id is null or btrim(p_workflow_run_id)='''' then');

  -- THE RUN-IDENTITY CHECK -- the gap 0036:927-933 named and could not close. The identity
  -- is agent_tasks.workflow_run_id (TEXT, the ENGINE run id, recorded durably by
  -- clara.begin_autodraft_task) -- NOT autodraft_attempts.run_id, which is a uuid FK to
  -- sweep_runs and is a different thing entirely. The workflow already holds the right
  -- value: getWorkflowMetadata().workflowRunId.
  --
  -- IT IS A LOSING-DISPATCH NO-OP, NOT A RAISE, and for 0036 SSB's reason: a CLR13 out of a
  -- frozen "use step" is retried by the durable substrate, throws again, and ends a run
  -- FAILED that actually did its work. Nothing is written and nothing is released here --
  -- the task is RUNNING under a DIFFERENT workflow run, so that run's accounting stands
  -- and this dispatch must not touch it.
  v_anchor := '  if t.status not in (''running'',''cancel_requested'') then' || chr(10)
    || '    raise exception ''autodraft task is not running'' using errcode=''CLR13'';' || chr(10)
    || '  end if;';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S8: settle_autodraft_task running-check anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  if t.status not in (''running'',''cancel_requested'') then' || chr(10)
    || '    raise exception ''autodraft task is not running'' using errcode=''CLR13'';' || chr(10)
    || '  end if;' || chr(10)
    || '  if t.workflow_run_id is distinct from p_workflow_run_id then' || chr(10)
    || '    perform clara._audit(t.firm_id,null,null,null,''settle_autodraft_task'',p_entry,' || chr(10)
    || '      jsonb_build_object(''task'',p_task,''outcome'',p_outcome,''settled'',false,' || chr(10)
    || '        ''reason'',''run_superseded'',''task_run'',t.workflow_run_id,' || chr(10)
    || '        ''caller_run'',p_workflow_run_id));' || chr(10)
    || '    return jsonb_build_object(''task_id'',p_task,''status'',t.status,''settled'',false,' || chr(10)
    || '      ''outcome'',''not_settled'',''reason'',''run_superseded'');' || chr(10)
    || '  end if;');
  execute v_next;

  raise notice '0046 S8: settle_autodraft_task 6-arity created from the live 0036 body';
end
$settle$;

-- IDENTICAL, RUNTIME-ONLY ACLs ON BOTH OVERLOADS. rig-meta.mjs:753-777 sweeps every
-- function OID while keying its expected role set BY NAME, so a second OID under the same
-- proname with a different grant is a real failure -- and, more importantly, a settle verb
-- reachable from clara_authenticated would be an agent-adjacent write the human matrix
-- never sanctioned. The 5-arity keeps 0011:4045-4054's grant untouched.
revoke all on function clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text) from public;
grant execute on function clara.settle_autodraft_task(uuid,text,bigint,uuid,jsonb,text)
  to clara_runtime;

reset role;

-- =====================================================================
-- SECTION 9 -- clara._coding_lane_core: THE JUDGEMENT HEART (7A-R2/R3, Q3).
--
-- EVERY BEHAVIOURAL DELTA BELOW IS GATED ON clara._sales_lane_active(f.firm_id). With the
-- flag OFF -- which is how it SHIPS -- this body answers byte-identically to 0031's on
-- every input, including the read verb clara.coding_lane that surfaces it in the queue.
-- That is what makes the migration genuinely inert until the ceremony's flip, and it is
-- also why the flag is read HERE and not only at admission: a lane that reported `ready`
-- for sales filings while nothing could admit them would be telling the human something
-- untrue.
-- =====================================================================
set role clara_fn_owner;
do $lane$
declare v_def text; v_next text; v_anchor text; v_count int;
begin
  select pg_get_functiondef('clara._coding_lane_core(uuid,uuid)'::regprocedure) into v_def;

  v_anchor := '  v_direction text; v_kind text;';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S9: _coding_lane_core declare anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    '  v_direction text; v_kind text;' || chr(10)
    || '  v_tri text; v_sales_lane boolean:=false; v_ready text[];');

  -- (9.1) THE TRI-STATE, ALONGSIDE THE BOOLEAN. v_direction keeps its 0031 meaning
  -- exactly -- including its 'purchase' fallback on CLR30, which selects which extraction
  -- fields are read -- so the reasons a contradicting document produces are unchanged.
  -- v_tri is the new, honest third answer.
  v_anchor := '  begin' || chr(10)
    || '    v_direction:=clara._document_direction(f.document_id,p_client);' || chr(10)
    || '  exception when sqlstate ''CLR30'' then' || chr(10)
    || '    v_reasons:=array_append(v_reasons,''direction_unresolved''); v_hard:=true; v_direction:=''purchase'';' || chr(10)
    || '  end;' || chr(10)
    || '  v_kind:=case when v_direction=''sales'' then ''customer'' else ''vendor'' end;';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S9.1: _coding_lane_core direction anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  begin' || chr(10)
    || '    v_direction:=clara._document_direction(f.document_id,p_client);' || chr(10)
    || '    v_tri:=v_direction;' || chr(10)
    || '  exception when sqlstate ''CLR30'' then' || chr(10)
    || '    v_reasons:=array_append(v_reasons,''direction_unresolved''); v_hard:=true; v_direction:=''purchase'';' || chr(10)
    || '    v_tri:=''unresolved'';' || chr(10)
    || '  end;' || chr(10)
    || '  v_kind:=case when v_direction=''sales'' then ''customer'' else ''vendor'' end;' || chr(10)
    || '  v_sales_lane:=(v_tri=''sales'' and clara._sales_lane_active(f.firm_id));');

  -- (9.2) THE MISSING-NAME REASON IS DIRECTION-HONEST. On the sales lane the field read
  -- above is invoice.customer_name, so reporting `vendor_unresolved` when it is absent
  -- names the wrong party. A DISTINCT token is used rather than reusing
  -- `customer_unresolved`, which already means something specific and different at post
  -- time (0030:1014-1021, the live kind='customer' control).
  v_anchor := '  if v_vendor is null then' || chr(10)
    || '    v_reasons:=array_append(v_reasons,''vendor_unresolved'');' || chr(10)
    || '  else';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S9.2: _coding_lane_core missing-name anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  if v_vendor is null then' || chr(10)
    || '    v_reasons:=array_append(v_reasons,' || chr(10)
    || '      case when v_sales_lane then ''customer_name_missing'' else ''vendor_unresolved'' end);' || chr(10)
    || '  else');

  -- (9.3) SALES-AWARE RESOLUTION (7A-R2, Q3). The sales lane never enters
  -- clara._resolve_vendor_binding (0031:428) and never appends `vendor_unresolved`: an
  -- unresolved CUSTOMER is the NORMAL sales shape, because customer birth happens at HUMAN
  -- APPROVAL and records the approving actor as created_by (0037:1846-1870). The drafter
  -- proposes the name; the human's approval is what creates the party. That is the whole
  -- reason all 12 of ROME SECRETARY's customers can be born correctly.
  --
  -- ONE CASE STILL STOPS: a registration_conflict that named an EXISTING registered
  -- counterparty (v_page_candidate is not null). Proceeding to birth there would mint a
  -- near-duplicate of a party the books already know. It is a HARD needs-you, mirroring
  -- the vendor lane's `vendor_ambiguous` -- and it is the shape adversarial fixture 15
  -- exists to catch, where a refusal is a PASS.
  v_anchor := '      if v_resolution_refused then' || chr(10)
    || '        null;' || chr(10)
    || '      elsif v_fp is not null and v_fp->>''decision''<>''birth'' then' || chr(10)
    || '        v_counterparty:=(v_fp->>''counterparty_id'')::uuid;' || chr(10)
    || '      else';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S9.3: _coding_lane_core resolution anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '      if v_resolution_refused then' || chr(10)
    || '        null;' || chr(10)
    || '      elsif v_fp is not null and v_fp->>''decision''<>''birth'' then' || chr(10)
    || '        v_counterparty:=(v_fp->>''counterparty_id'')::uuid;' || chr(10)
    || '      elsif v_sales_lane then' || chr(10)
    || '        if v_page_candidate is not null then' || chr(10)
    || '          v_reasons:=array_append(v_reasons,''customer_ambiguous'');' || chr(10)
    || '          v_hard:=true;' || chr(10)
    || '        end if;' || chr(10)
    || '      else');

  -- (9.4) 7A-R3 -- THE NARROW, DRAFT-ONLY tier_a_fails BYPASS, by the SAME mechanism
  -- rule_backed and vendor_bound already use (0031:519-520): the reason stays in the
  -- reasons array and stays visible to the human; it simply stops blocking `ready`.
  --
  -- WHY IT IS SAFE: `tier_a_fails` means the document did not CORROBORATE, and every
  -- POSTING path re-derives corroboration independently -- execute_rule_post's anchor
  -- block (0030 (c)) and the floor's own `corroborated` term added by SECTION 3. A
  -- tax-silent sales invoice can therefore be DRAFTED for a human to approve, and can
  -- never autopost. Rationale of record: all 22 of the real ROME SECRETARY sales invoices
  -- are tax-silent, and without drafts they accrue no approval history at all, which
  -- starves every future automation of the fuel it needs.
  v_anchor := '  if v_hard then lane:=''needs_you'';' || chr(10)
    || '  elsif coalesce(array_length(array_remove(array_remove(v_reasons,''rule_backed''),''vendor_bound''),1),0)=0 then lane:=''ready'';' || chr(10)
    || '  else lane:=''needs_review''; end if;';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S9.4: _coding_lane_core readiness anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  v_ready:=array_remove(array_remove(v_reasons,''rule_backed''),''vendor_bound'');' || chr(10)
    || '  if v_sales_lane then v_ready:=array_remove(v_ready,''tier_a_fails''); end if;' || chr(10)
    || '  if v_hard then lane:=''needs_you'';' || chr(10)
    || '  elsif coalesce(array_length(v_ready,1),0)=0 then lane:=''ready'';' || chr(10)
    || '  else lane:=''needs_review''; end if;');
  execute v_next;

  raise notice '0046 S9: _coding_lane_core recut onto the tri-state contract';
end
$lane$;
reset role;

-- =====================================================================
-- SECTION 10 -- clara._draft_entry_core: THE AUTHORITY LAYER FOR THE CODING-KIND CONTRACT.
--
-- The tool derives the counterparty kind from coding_kind and the zod schema rejects a
-- mismatched pair, but neither is authority: a model cannot be the guard on its own
-- output. This is the layer that is.
--
-- WHY THE CONTRADICTION MATTERS AND WHY IT IS NOT MERE TIDINESS. The live precedence is
-- `coalesce(explicit proposal kind, derive-from-coding_kind)` -- the EXPLICIT kind WINS. So
-- the failure mode was never omission, it was CONTRADICTION, and both directions are quiet
-- wrong answers: a sales invoice mislabelled `kind:'vendor'` ENTERS the production
-- vendor-binding resolver (0028:1212-1274) and can be STAMPED as a vendor, while a supplier
-- bill mislabelled `kind:'customer'` BYPASSES vendor binding entirely.
--
-- SCOPE, STATED PLAINLY BECAUSE IT IS A JUDGEMENT CALL: arm (1) binds every AGENT draft
-- (`not p_is_human`) -- a coding-kind/counterparty-kind contradiction is nonsense in any
-- agent lane. Arm (2) binds the AUTODRAFT wake lane only, because that is where a family
-- is BOUND at admission and therefore the only place there is a binding to revalidate. The
-- human lane and the human-present chat lane are byte-identical either way.
-- =====================================================================
set role clara_fn_owner;
do $writer$
declare v_def text; v_next text; v_anchor text; v_count int;
begin
  select pg_get_functiondef(
    'clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure)
    into v_def;

  v_anchor := '  v_rule record; v_rule_counterparty uuid; v_rule_decision uuid; v_proposal jsonb; v_kind text;';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S10: _draft_entry_core declare anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor, v_anchor || ' v_tri text;');

  v_anchor := '  if not p_is_human and p_document is not null and v_kind=''vendor'' then';
  v_count := (length(v_next)-length(replace(v_next,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S10: _draft_entry_core slot-B anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_next, v_anchor,
    '  if not p_is_human then' || chr(10)
    || '    if p_coding_kind in (''sales_invoice'',''sales_credit_note'') and v_kind<>''customer'' then' || chr(10)
    || '      raise exception ''a % entry cannot carry a % counterparty'',p_coding_kind,v_kind' || chr(10)
    || '        using errcode=''CLR21'',detail=''{"reason":"counterparty_kind_contradiction"}'';' || chr(10)
    || '    end if;' || chr(10)
    || '    if p_coding_kind=''supplier_bill'' and v_kind<>''vendor'' then' || chr(10)
    || '      raise exception ''a % entry cannot carry a % counterparty'',p_coding_kind,v_kind' || chr(10)
    || '        using errcode=''CLR21'',detail=''{"reason":"counterparty_kind_contradiction"}'';' || chr(10)
    || '    end if;' || chr(10)
    || '  end if;' || chr(10)
    || '  if not p_is_human and p_wake_kind=''autodraft'' and p_document is not null' || chr(10)
    || '     and p_coding_kind in (''sales_invoice'',''sales_credit_note'',''supplier_bill'') then' || chr(10)
    || '    v_tri:=clara._autodraft_direction_tri(p_document,p_client);' || chr(10)
    || '    if v_tri=''unresolved''' || chr(10)
    || '       or (v_tri=''sales'' and p_coding_kind=''supplier_bill'')' || chr(10)
    || '       or (v_tri=''purchase'' and p_coding_kind in (''sales_invoice'',''sales_credit_note'')) then' || chr(10)
    || '      raise exception ''a % entry contradicts the document direction %'',p_coding_kind,v_tri' || chr(10)
    || '        using errcode=''CLR21'',detail=''{"reason":"direction_family_mismatch"}'';' || chr(10)
    || '    end if;' || chr(10)
    || '  end if;' || chr(10)
    || v_anchor);
  execute v_next;

  raise notice '0046 S10: _draft_entry_core carries the coding-kind family revalidation';
end
$writer$;
reset role;

-- =====================================================================
-- SECTION 11 -- GRANTS. The human surface only; every internal above stays ungranted.
-- =====================================================================
grant execute on function
  clara.preview_ocr_sales_evidence(uuid),
  clara.open_sales_backfill(uuid,int,text,text),
  clara.set_sales_backfill_state(uuid,text,text),
  clara.list_sales_backfill_batches(jsonb)
to clara_authenticated;

-- clara.set_sales_lane_activation is DELIBERATELY ABSENT from every grant in this file and
-- from every role set in rig-meta's matrix. It is reachable only from the owner/deploy
-- connection -- see SECTION 5.4. If a future migration grants it to an application role,
-- that is a decision somebody must make on purpose, in writing.

-- =====================================================================
-- TAIL -- IN-TRANSACTION SELF-VERIFICATION. Every raise is a real assertion failure.
-- =====================================================================
do $tail$
declare
  v_n int; v_names text; v_code text; v_raw text; v_missing text;
  r record;
begin
  -- TWO INSTRUMENTS, AND EACH QUESTION GETS THE RIGHT ONE. `v_code` is the LEXED body:
  -- comments and STRING LITERALS are blanked to fill characters, which is exactly what
  -- makes it the honest instrument for "does this body CALL that function". `v_raw` is
  -- prosrc as written. A receipt token like 'sales_backlog_held' IS a string literal, so
  -- it exists only in v_raw -- asking the lexed body for it would report every one of
  -- them missing. Getting this backwards is a silent false negative, so the arms below
  -- name which instrument they use and why.
  -- (1) THE EXACT LIVE CALLER SET OF THE FLOOR IS NOW FOUR.
  --
  -- ASKED ON THE SHARED LEX INSTRUMENT, never on raw prosrc, for the reason SECTION 1
  -- gives: a comment that merely NAMES the floor would read as a caller and refuse a
  -- correct deploy, and an upper-cased or quoted respelling would read as absent and pass
  -- a wrong one. Both directions were measured during the D-b2 ladder.
  --
  -- clara._ocr_sales_floor_pop CANNOT collide with this roster: the matcher requires the
  -- name to be followed by optional whitespace and then `(`, and `_ocr_sales_floor_pop(`
  -- puts `_pop` in between. The floor's own body calls the POP helper, not itself.
  select count(*)::int, coalesce(string_agg(p.proname,' ' order by p.proname),'')
    into v_n, v_names
    from pg_proc p
    where p.pronamespace='clara'::regnamespace
      and pg_temp._wdb_call_count(pg_temp._wdb_sql_code(coalesce(p.prosrc,'')),
                                  'clara._ocr_sales_floor') > 0;
  if v_names <> 'execute_rule_post preview_ocr_sales_evidence propose_autopost_rule sign_autopost_rule' then
    raise exception '0046 tail 1: the live callers of clara._ocr_sales_floor are {%} (n=%), not the pinned FOUR -- a caller was missed by this migration''s recut, or a new one appeared', v_names, v_n;
  end if;

  -- (2) EACH AUTHORITY WRITER POSITIVELY BINDS `corroborated` AND GATES IT AT SIX.
  --
  -- THIS IS THE ARM THAT REPLACES v1'S INSUFFICIENT PROBE. v1 proposed asserting that the
  -- old four-column shape no longer appears in prosrc. That proves nothing: no caller ever
  -- mentioned `distinct_docs`, so there was no reliable caller token to look for -- and,
  -- worse, an un-recut caller does not FAIL. It succeeds while silently omitting the gate.
  -- The only honest assertion is a POSITIVE one, made per writer.
  for r in select p.proname,
                  pg_temp._wdb_sql_code(coalesce(p.prosrc,'')) as code
             from pg_proc p
            where p.pronamespace='clara'::regnamespace
              and p.proname in ('propose_autopost_rule','sign_autopost_rule','execute_rule_post')
  loop
    if position('f.corroborated' in r.code) = 0 then
      raise exception '0046 tail 2: clara.% does not BIND the floor''s corroborated column -- it would succeed while silently omitting the gate', r.proname;
    end if;
    if r.code !~ 'coalesce\(v_[a-z_]*corr[a-z_]*,0\)<6' then
      raise exception '0046 tail 2: clara.% binds corroborated but does not GATE it at six', r.proname;
    end if;
  end loop;

  -- (3) EXACTLY TWO settle_autodraft_task SIGNATURES, WITH IDENTICAL RUNTIME-ONLY ACLs.
  -- 0011's own one-overload assertion will not re-run, so it is re-made here as a positive
  -- claim about the post-state rather than inherited from a migration that already ran.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task';
  if v_n <> 2 then
    raise exception '0046 tail 3: expected exactly TWO clara.settle_autodraft_task signatures, found %', v_n;
  end if;
  -- ...AND THE PAIR CANNOT BE AMBIGUOUS. This is the property that makes a second overload
  -- safe rather than the planner hazard the repo's no-orphan-overload sweep exists to catch,
  -- and it is the same proof 0040 made for match_bank_line / settle_from_bank_line: the
  -- 6-arity carries ZERO defaulted parameters, so a 5-argument call can only ever resolve to
  -- the 5-arity and a 6-argument call only to this one. Asserted, not asserted-about.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task'
      and p.pronargs=6 and p.pronargdefaults=0;
  if v_n <> 1 then
    raise exception '0046 tail 3: the 6-arity clara.settle_autodraft_task must carry NO defaulted parameters (matched %/1) -- a default would make every 5-argument call planner-ambiguous', v_n;
  end if;
  for r in select p.oid, p.oid::regprocedure::text as sig from pg_proc p
            where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task'
  loop
    if not has_function_privilege('clara_runtime', r.oid, 'execute') then
      raise exception '0046 tail 3: clara_runtime cannot EXECUTE % -- the two overloads must carry IDENTICAL runtime ACLs (rig-meta keys expected roles BY NAME)', r.sig;
    end if;
    if has_function_privilege('clara_authenticated', r.oid, 'execute')
       or has_function_privilege('clara_agent_ro', r.oid, 'execute') then
      raise exception '0046 tail 3: % is reachable from a non-runtime role -- settle is a runtime-lane verb only', r.sig;
    end if;
    if exists(select 1 from pg_proc p2, aclexplode(p2.proacl) a
              where p2.oid=r.oid and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception '0046 tail 3: PUBLIC holds EXECUTE on %', r.sig;
    end if;
  end loop;

  -- (4) NO NEW PUBLIC EXECUTE. A function created without an explicit revoke carries
  -- proacl IS NULL, which means PUBLIC has EXECUTE -- the silent default rig-meta's T17
  -- sweep exists to catch. Caught here too, in the same transaction that created them.
  select coalesce(string_agg(p.proname,', ' order by p.proname),'') into v_names
    from pg_proc p
    where p.pronamespace='clara'::regnamespace
      and p.proname in ('_ocr_sales_floor','_ocr_sales_floor_pop','_sales_lane_active',
        '_autodraft_direction_tri','_sales_admission_open','set_sales_lane_activation',
        'open_sales_backfill','set_sales_backfill_state','list_sales_backfill_batches',
        'preview_ocr_sales_evidence')
      and (p.proacl is null
           or exists(select 1 from aclexplode(p.proacl) a
                     where a.grantee=0 and a.privilege_type='EXECUTE'));
  if v_names <> '' then
    raise exception '0046 tail 4: PUBLIC holds EXECUTE on {%}', v_names;
  end if;

  -- (5) THE KILL-SWITCH IS REACHABLE FROM NO APPLICATION ROLE (7A-R1).
  for r in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                              'clara_wake_interactive','clara_wake_proactive']) as role
  loop
    if has_function_privilege(r.role,
         'clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)'::regprocedure, 'execute') then
      raise exception '0046 tail 5: % can EXECUTE clara.set_sales_lane_activation -- the activation flip is the owner/deploy connection''s alone', r.role;
    end if;
  end loop;

  -- (6) THE ACTIVATION SHIPS OFF, FOR EVERY FIRM (7A-R1).
  select count(*)::int into v_n from clara.firm_limits where sales_lane_active;
  if v_n <> 0 then
    raise exception '0046 tail 6: % firm(s) already have sales_lane_active -- this migration must ship the lane OFF', v_n;
  end if;

  -- (7) THE Asia/Kuala_Lumpur DUPLICATION ROSTER IS UNCHANGED.
  --
  -- 0042:5536 and 0044:6525 assert this set EXACTLY, on both sides: an unexpected name is a
  -- new second body owning one house fact, and a MISSING name means a recorded copy moved
  -- to a spelling those gates cannot see. clara._ocr_sales_floor is on that list precisely
  -- because of the literal this migration drop/recreates, so the roster is the direct proof
  -- that the pin held. The expected value is the FINAL D-b2 form 0042's own header records.
  select coalesce(string_agg(distinct p.proname,' ' order by p.proname),'') into v_names
    from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and lower(regexp_replace(regexp_replace(regexp_replace(
           coalesce(p.prosrc,'') || coalesce(pg_get_functiondef(p.oid),''),
           '/\*[\s\S]*?\*/','','g'), '--[^\n]*','','g'), '\s+',' ','g'))
         like '%asia/kuala_lumpur%';
  if v_names <> '_adj_on_approve _adj_run_occurrence_core _book_today _ocr_sales_floor '
              || 'ack_compliance_watch evaluate_sst_watch evaluate_sst_watches_all '
              || 'record_future_attestation reverse_entry' then
    raise exception '0046 tail 7: the bodies spelling the Asia/Kuala_Lumpur conversion are {%}, which is not the pinned D-b2 set -- the floor drop/recreate was required to PRESERVE that literal so the 0042/0044 roster assertions stand unchanged', v_names;
  end if;

  -- (8) THE FLOOR'S OWN POST-STATE: the new shape, definer, pinned search_path.
  if pg_get_function_result('clara._ocr_sales_floor(uuid,uuid,text)'::regprocedure)
     <> 'TABLE(qualifying integer, distinct_invoices integer, corroborated integer, span_days integer)' then
    raise exception '0046 tail 8: clara._ocr_sales_floor shape is %, not the pinned four columns',
      pg_get_function_result('clara._ocr_sales_floor(uuid,uuid,text)'::regprocedure);
  end if;
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace
      and p.proname in ('_ocr_sales_floor','_ocr_sales_floor_pop')
      and p.prosecdef and pg_get_userbyid(p.proowner)='clara_fn_owner'
      -- PostgreSQL normalises the SET clause it stores ("search_path=clara, pg_temp"),
      -- so the comparison is made whitespace-insensitively rather than against the
      -- spelling this file happens to use.
      and exists(select 1 from unnest(coalesce(p.proconfig,'{}'::text[])) cfg
                 where replace(cfg,' ','')='search_path=clara,pg_temp');
  if v_n <> 2 then
    raise exception '0046 tail 8: the floor pair did not re-establish owner/SECURITY DEFINER/pinned search_path (matched %/2)', v_n;
  end if;

  -- (9) THE SALES LANE'S JUDGEMENT DELTAS LANDED, AND ALL OF THEM ARE FLAG-GATED.
  select pg_temp._wdb_sql_code(coalesce(p.prosrc,'')), coalesce(p.prosrc,'')
    into v_code, v_raw from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='_coding_lane_core';
  v_missing := '';
  -- the flag READ is a call -> lexed.
  if pg_temp._wdb_call_count(v_code,'clara._sales_lane_active')<>1 then
    v_missing := v_missing || ' sales_lane_active_read';
  end if;
  -- the reason TOKENS are string literals -> raw.
  if position('customer_name_missing' in v_raw)=0 then v_missing := v_missing || ' customer_name_missing'; end if;
  if position('customer_ambiguous' in v_raw)=0 then v_missing := v_missing || ' customer_ambiguous'; end if;
  if position('array_remove(v_ready,''tier_a_fails'')' in v_raw)=0 then
    v_missing := v_missing || ' tier_a_bypass';
  end if;
  if v_missing <> '' then
    raise exception '0046 tail 9: clara._coding_lane_core is missing the sales-lane deltas {%}', btrim(v_missing);
  end if;
  -- ...and the bypass is UNREACHABLE unless the flag is on: v_sales_lane is the only
  -- guard on it, and v_sales_lane is assigned exactly once, from the flag read. Both
  -- shapes carry quoted literals, so both are asked of the raw body.
  if v_raw !~ 'v_sales_lane:=\(v_tri=''sales'' and clara\._sales_lane_active\(f\.firm_id\)\)' then
    raise exception '0046 tail 9: clara._coding_lane_core''s v_sales_lane is not the single flag-gated assignment -- the sales deltas must be unreachable while the lane is OFF';
  end if;
  if v_raw !~ 'if v_sales_lane then v_ready:=array_remove\(v_ready,''tier_a_fails''\); end if;' then
    raise exception '0046 tail 9: the tier_a_fails bypass is not gated on v_sales_lane';
  end if;

  -- (10) THE ADMISSION PATH CARRIES THE CONTRACT.
  select pg_temp._wdb_sql_code(coalesce(p.prosrc,'')), coalesce(p.prosrc,'')
    into v_code, v_raw from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='admit_autodraft_task';
  if pg_temp._wdb_call_count(v_code,'clara._autodraft_direction_tri')<>1
     or pg_temp._wdb_call_count(v_code,'clara._sales_lane_active')<>1 then
    raise exception '0046 tail 10: clara.admit_autodraft_task does not resolve the tri-state direction behind the activation flag exactly once each';
  end if;
  -- the receipt reasons are string literals -> raw. 'sales_direction' is on this list
  -- BECAUSE IT MUST SURVIVE: it is the inactive-lane receipt, byte-identical to 0036's, and
  -- it is what makes this migration observably inert until the ceremony's flip.
  for v_names in select unnest(array['sales_direction','sales_backlog_held','refused_sales_cap'])
  loop
    if position(v_names in v_raw)=0 then
      raise exception '0046 tail 10: clara.admit_autodraft_task has no % receipt -- every refusal on this lane must be NAMED, never inferred', v_names;
    end if;
  end loop;
  if pg_temp._wdb_call_count(v_code,'clara._autodraft_sales_direction')<>0 then
    raise exception '0046 tail 10: clara.admit_autodraft_task still carries the 0036 flat sales refusal beside the new contract';
  end if;

  -- (11) THE DRAFT WRITER IS THE AUTHORITY LAYER.
  select pg_temp._wdb_sql_code(coalesce(p.prosrc,'')), coalesce(p.prosrc,'')
    into v_code, v_raw from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='_draft_entry_core';
  if position('counterparty_kind_contradiction' in v_raw)=0
     or position('direction_family_mismatch' in v_raw)=0
     or pg_temp._wdb_call_count(v_code,'clara._autodraft_direction_tri')<>1 then
    raise exception '0046 tail 11: clara._draft_entry_core does not revalidate the coding-kind family -- the tool and the zod schema are ergonomics, this is the only authority layer';
  end if;

  -- (12) PURCHASE ISOLATION. The purchase evidence floor is the SEPARATE v_seen<3 branch
  -- (0016:1714-1725); it must still be there, untouched, and it must still be the branch
  -- that answers `insufficient_evidence` for a purchase proposal.
  select pg_temp._wdb_sql_code(coalesce(p.prosrc,'')), coalesce(p.prosrc,'')
    into v_code, v_raw from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='propose_autopost_rule';
  if position('if v_seen<3 then' in v_code)=0 then
    raise exception '0046 tail 12: the purchase evidence floor (v_seen<3) is gone from clara.propose_autopost_rule -- this migration must not touch purchase behaviour';
  end if;
  if v_raw !~ 'v_side:=case when v_direction=''sales'' then ''credit'' else ''debit'' end' then
    raise exception '0046 tail 12: the direction-aware sighting side selection drifted in clara.propose_autopost_rule';
  end if;

  -- (13) THE NEW TABLE IS GOVERNED. RLS ENABLE + FORCE, owned by clara_fn_owner.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='sales_backfill_batches'
      and c.relrowsecurity and c.relforcerowsecurity
      and pg_get_userbyid(c.relowner)='clara_fn_owner';
  if v_n <> 1 then
    raise exception '0046 tail 13: clara.sales_backfill_batches is not RLS ENABLE+FORCE under clara_fn_owner';
  end if;

  raise notice '0046 tail: all 13 arms clean';
end
$tail$;
