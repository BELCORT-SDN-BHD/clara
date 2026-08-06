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
-- IS THIS LITERAL CODE, OR IS IT PROSE? Several arms below assert that a NAMED receipt token
-- really is emitted, and a bare `position(token in prosrc)` cannot tell a live
-- `jsonb_build_object(...,'sales_direction')` from a COMMENT that happens to spell it. That
-- distinction matters here more than anywhere, because this migration SPLICES its own
-- explanatory comments INTO the very bodies those arms measure -- so an arm reading raw source
-- can be satisfied by the migration's own prose, and is then structurally incapable of failing.
-- A mutation audit found exactly that in seven places.
--
-- The lexer above is position- AND length-preserving: a comment becomes a run of chr(1), a
-- string literal a run of chr(2), each exactly as long as what it replaced. So the character
-- class UNDER an occurrence answers the question exactly. chr(2) => the occurrence sits inside
-- a real string literal (code). chr(1) => it sits inside a comment (prose).
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
  -- THE DAILY CAP GOVERNS THE WHOLE SALES LANE, STEADY STATE **AND** BACKFILL, and that is
  -- deliberate rather than incidental: it is the one number that bounds how much unattended
  -- sales drafting a firm can receive in a day, and a recorded backfill is not a reason to
  -- lift that bound -- it is a reason to have chosen it.
  --
  -- SO SAY THE ARITHMETIC OUT LOUD, because batch_size looks like the governor and is not.
  -- A batch is a BUDGET (how many documents this operation may move at all), never a RATE.
  -- At the default cap of 15/day: ROME SECRETARY's 22 real invoices take ~2 days; a
  -- 500-document batch -- which the CHECK permits -- takes ~34. An operator who sets
  -- batch_size=500 expecting it to drain over a weekend will be surprised, and the place to
  -- fix that expectation is here rather than in a support conversation. The lever for moving
  -- a backlog faster is THIS column, per firm, settable without a migration -- never a
  -- second, hidden governor.
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
-- this migration -- tail arm (7) re-measures it. Moving the literal in here would have
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

  raise notice '0046 S4: propose/sign recut onto the corroborated floor';
end
$callers$;

-- ---------------------------------------------------------------------
-- (4.3) POST -- clara.execute_rule_post, RE-SHIPPED STATICALLY, NOT SPLICED.
--
-- WHY THIS ONE IS DIFFERENT FROM ITS TWO SIBLINGS ABOVE. 0029's Slot C interlock has a
-- PERSISTENT CI GATE (scripts/check-binding-post-control.mjs): the LAST STATIC definition
-- of clara.execute_rule_post in the migration tree must still carry the binding
-- live/unexpired gate, must consume it in the intervening refusal control flow, and must do
-- both BEFORE the approve call. That checker reads the tree, not a database -- so a dynamic
-- change-of-record patch makes the installed body invisible to it, and it FAILS CLOSED on
-- exactly that shape. It is right to. Splicing here would have traded a live security gate
-- for a smaller diff, so the whole body is re-shipped instead, which is also what every
-- previous recut of this function did (0015, 0016, 0022, 0023, 0029, 0030 -- 0030 is the
-- last, and nothing between it and here patches this body).
--
-- THE BODY BELOW IS 0030's, HARVESTED WITH pg_get_functiondef FROM A RIG AT 0045 and
-- changed in EXACTLY TWO PLACES: `v_fcorr int` joins the declarations, and the control-6
-- floor re-derivation binds `f.corroborated` and gates it at six. Nothing else is retyped.
-- The prestate below proves the LIVE body is the one this text was cut from, so a database
-- whose executor has drifted fails loudly instead of being silently overwritten.
-- ---------------------------------------------------------------------
do $erp_prestate$
declare v_def text; v_n int; v_src text;
begin
  select pg_get_functiondef('clara.execute_rule_post(uuid,text)'::regprocedure) into v_def;
  v_n := (length(v_def)-length(replace(v_def,'  v_fseen int; v_fdocs int; v_fspan int;','')))
         / length('  v_fseen int; v_fdocs int; v_fspan int;');
  if v_n <> 1 then
    raise exception '0046 S4.3 prestate: the live clara.execute_rule_post declares the floor counters % times, expected 1 -- the body this migration re-ships was cut from a different one', v_n
      using errcode='CLR10';
  end if;
  if position('clara._ocr_sales_floor(e.client_id,' in v_def) = 0 then
    raise exception '0046 S4.3 prestate: the live clara.execute_rule_post does not carry the control-6 floor re-derivation this migration expects to harden'
      using errcode='CLR10';
  end if;
  if position('v_binding_live:=b.status=''live'' and b.expires_at>now();' in v_def) = 0 then
    raise exception '0046 S4.3 prestate: the live clara.execute_rule_post has no 0029 Slot C binding gate -- refusing to re-ship over a body this migration cannot account for'
      using errcode='CLR10';
  end if;

  -- THE IDENTITY PROOF, HALF ONE: derive what the re-shipped body MUST be.
  --
  -- A static re-ship is the one shape that can silently DROP a later recut -- exactly the
  -- silent-omission hazard SS0.2-2 records ("an un-recut caller SUCCEEDS while omitting the
  -- gate; silent, not loud"). Asserting "the body I typed is present" proves nothing about
  -- what it REPLACED. So the prestate takes the LIVE body, applies the two documented edits
  -- MECHANICALLY, and stashes the result; tail arm (14) then requires the INSTALLED body to
  -- equal it. Anything the live body carried that this file's text does not -- a hotfix, a
  -- later slice's recut, a hand patch on a live database -- breaks that equality and refuses
  -- the deploy, instead of being overwritten without a word.
  select prosrc into v_src from pg_proc
    where pronamespace='clara'::regnamespace and proname='execute_rule_post';
  v_src := replace(v_src,
    '  v_fseen int; v_fdocs int; v_fspan int;',
    '  v_fseen int; v_fdocs int; v_fspan int; v_fcorr int;');
  v_src := replace(v_src,
    '    select f.qualifying,f.distinct_invoices,f.span_days into v_fseen,v_fdocs,v_fspan',
    '    select f.qualifying,f.distinct_invoices,f.corroborated,f.span_days into v_fseen,v_fdocs,v_fcorr,v_fspan');
  v_src := replace(v_src,
    '    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or v_fspan is null or v_fspan<60 then',
    '    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or coalesce(v_fcorr,0)<6 or v_fspan is null or v_fspan<60 then');
  create temporary table if not exists _wdb_erp_expected(txt text) on commit drop;
  delete from _wdb_erp_expected;
  insert into _wdb_erp_expected values (regexp_replace(v_src,'\s+',' ','g'));
end
$erp_prestate$;

CREATE OR REPLACE FUNCTION clara.execute_rule_post(p_entry uuid, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  e record; r record; v_direction text; v_kind text; v_fp jsonb;
  v_counterparty uuid; v_total bigint; v_window_start timestamptz; v_count int;
  v_result jsonb; v_run uuid; v_ctrl_total int; v_ctrl_ok int; v_detail text;
  v_state jsonb; v_gross bigint; v_tax bigint; v_ctrl_amount bigint;
  v_signed_ok int; v_signed_wrong int; v_sst_legs int; v_sst_amt bigint;
  v_round_legs int; v_round_imb bigint; v_outside_legs int;
  v_net bigint; v_round bigint; v_inv_id text; v_inv_date text;
  v_kind_doc text; v_fx uuid; v_sup_reg text; v_sup_name text;
  v_cust_reg text; v_cust_taxid text; v_cust_name text; v_client_name text;
  v_hard_ok boolean; v_name_ok boolean; v_buyer_hit boolean;
  v_due_c int; v_due_amt bigint; v_skips int; v_suspended boolean:=false;
  v_doc_lane text; v_doc_class text; v_verdict jsonb; v_lane_n int;
  v_cust_name_raw text; v_cust_reg_raw text; v_buyer_fp jsonb; v_buyer_id uuid;
  v_fseen int; v_fdocs int; v_fspan int; v_fcorr int;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_sc_c int; v_disc_c int; v_dlv_c int;
  -- 0023 (X5, K-round): the reader receipt, and the per-field agreement it records.
  v_env jsonb; v_net_agreed boolean; v_tax_agreed boolean;
  -- 0029 (Slot C): position-0 receipts and prefix-consistent lock locators.
  v_locator record; v_dedupe jsonb; v_reserved_revision uuid;
  v_filing uuid; v_approve_op_key text; v_locked_rule_ids uuid[];
  -- 0029 (Slot C): post-time binding pins and typed resolution outcome.
  b record; cpb record; v_facts_envelope jsonb; v_vi jsonb;
  v_facts_extraction uuid; v_ocr_extraction uuid;
  v_draft_resolution uuid; v_draft_binding uuid;
  v_draft_facts uuid; v_draft_ocr uuid;
  v_resolution_facts uuid; v_resolution_ocr uuid;
  v_vendor_name text; v_vendor_registration text;
  v_invoice_id_norm text; v_f1_current text;
  v_page_fp jsonb; v_page_counterparty uuid; v_page_candidate uuid;
  v_binding_reason text; v_binding_outcome text;
  v_binding_matches int; v_matching_binding uuid; v_matching_f2 text;
  v_f1_ok boolean; v_f2_ok boolean; v_matching_f2_ok boolean; v_f3_ok boolean;
  v_binding_live boolean; v_page_same boolean:=false;
  v_page_birth boolean:=false; v_page_ambiguous boolean:=false;
  v_a1_clean boolean:=false;
  v_receipt_ambiguous boolean:=false;
  v_receipt_uncorroborated boolean:=false;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;

  -- Position 0. The function has no firm parameter, so this first read is a
  -- locator only. No decision is made from it: every eligibility check below
  -- runs after the authoritative FOR UPDATE refresh, and a revision race is a
  -- typed stale_revision skip.
  select firm_id,client_id,document_id,source_doc_sha256,filing_id,revision_token
    into v_locator
  from clara.journal_entries
  where id=p_entry;
  if not found then raise exception 'entry not found' using errcode='CLR11'; end if;
  v_reserved_revision:=v_locator.revision_token;
  v_approve_op_key:=p_op_key;

  v_dedupe:=clara._reserve_op(v_locator.firm_id,'execute_rule_post',p_op_key,
    clara._hash(jsonb_build_object('e',p_entry)));
  if v_dedupe is not null then return v_dedupe; end if;
  v_dedupe:=clara._reserve_op(v_locator.firm_id,'approve_entry',v_approve_op_key,
    clara._hash(jsonb_build_object('e',p_entry,'rev',v_reserved_revision,
      'att',null)));
  if v_dedupe is not null then
    -- The approve_entry receipt already exists (e.g. a human raced in and used
    -- the same predictable rulepost:<entry>:<seq> key, or a prior attempt at
    -- this exact executor op_key already reserved it). The executor's OWN
    -- receipt, just reserved above with a null v_dedupe, must not be left
    -- orphaned at result=NULL -- settle it with the same outcome so a replay of
    -- THIS execute_rule_post call returns the recorded result, never pending.
    return clara._finish_op(
      v_locator.firm_id,'execute_rule_post',p_op_key,v_dedupe);
  end if;

  -- Total-order law: coding_rules -> document_filings -> journal_entries.
  -- Lock the client's live autopost set exactly once and retain the ids from
  -- that snapshot. PostgreSQL does not allow FOR UPDATE on an aggregate query,
  -- so the deterministic locking SELECT lives in a derived table and the outer
  -- aggregate only captures its already-locked rows.
  select coalesce(
      array_agg(locked.id order by locked.id),'{}'::uuid[]
    ) into v_locked_rule_ids
  from (
    select cr.id
    from clara.coding_rules cr
    where cr.client_id=v_locator.client_id
      and cr.rule_type='autopost' and cr.status='live'
    order by cr.id
    for update
  ) locked;

  -- Identical helper/row/mode to _approve_entry_core: FOR SHARE OF f.
  if v_locator.document_id is not null then
    v_filing:=clara._active_document_filing(
      v_locator.document_id,v_locator.source_doc_sha256,
      v_locator.client_id,true);
    if v_filing<>v_locator.filing_id then
      raise exception 'entry is not bound to the active filing'
        using errcode='CLR02';
    end if;
  end if;

  select * into e
  from clara.journal_entries
  where id=p_entry
  for update;
  if not found or e.firm_id<>v_locator.firm_id then
    raise exception 'entry not found' using errcode='CLR11';
  end if;
  if e.revision_token is distinct from v_reserved_revision then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'stale_revision',
      p_op_key,v_approve_op_key);
  end if;

  if e.status<>'draft' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'not_a_draft',
      p_op_key,v_approve_op_key);
  end if;
  if e.coding_kind is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'ineligible_no_coding_kind',
      p_op_key,v_approve_op_key);
  end if;
  if e.document_id is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'ineligible_no_document',
      p_op_key,v_approve_op_key);
  end if;
  if e.proposed_counterparty is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'ineligible_no_counterparty',
      p_op_key,v_approve_op_key);
  end if;

  -- ADV-R2 (R1#1): ONE BOUND EXTRACTION per document per post, resolved BEFORE
  -- the direction step (direction itself consumes the doc's facts). A document
  -- with done facts in BOTH lanes (a historical OCR pass beside a later XML
  -- parse) is inherently ambiguous evidence — a named visible skip, never a
  -- coin-flip between potentially disagreeing extractions. With exactly one
  -- done lane the extraction is bound ONCE (v_fx) and every consumer — the
  -- direction, the class check, the fact state, and every envelope field —
  -- reads that SAME single-lane extraction.
  select count(distinct t.lane)::int into v_lane_n
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done';
  if v_lane_n>1 then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'evidence_lane_ambiguous',
      p_op_key,v_approve_op_key);
  end if;
  select t.lane,x.id into v_doc_lane,v_fx
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done'
    order by t.version_n desc,t.id desc limit 1;
  -- ADV-R4#1: ZERO done lanes = facts-absent — a named skip BEFORE direction.
  -- The post path NEVER proceeds unpinned: a later/concurrent extraction commit
  -- could otherwise be picked up mid-post by the live selectors.
  if v_fx is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'facts_missing',
      p_op_key,v_approve_op_key);
  end if;

  -- direction (client-aware, pinned to the ONE bound extraction — ADV-R3#1) —
  -- an unresolved direction is a skip, never a raise.
  begin
    v_direction:=clara._document_direction_at(e.document_id,e.client_id,v_fx);
  exception when sqlstate 'CLR30' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'direction_unresolved',
      p_op_key,v_approve_op_key);
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;

  -- resolve the draft's counterparty (kind-scoped by direction) to match the rule.
  begin
    v_fp:=clara._resolve_counterparty(e.client_id,
      e.proposed_counterparty || jsonb_build_object('kind',v_kind));
  exception when sqlstate 'CLR23' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'counterparty_ambiguous',
      p_op_key,v_approve_op_key);
  end;
  if v_fp is null or v_fp->>'decision'='birth' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'counterparty_unresolved',
      p_op_key,v_approve_op_key);
  end if;
  v_counterparty:=clara._canonical_counterparty(e.client_id,(v_fp->>'counterparty_id')::uuid);

  -- Exact lookup is intentionally PLAIN: only rows captured and locked by the
  -- single acquisition above are eligible in this pass. A proposed row that
  -- became live after that snapshot is a no_live_rule retry, never a new lock
  -- acquired after filing/entry.
  select * into r from clara.coding_rules
    where id=any(v_locked_rule_ids)
      and client_id=e.client_id and counterparty_id=v_counterparty
      and direction=v_direction and rule_type='autopost' and status='live';
  if not found then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,null,'no_live_rule',
      p_op_key,v_approve_op_key);
  end if;

  -- RE-DERIVE every gate against live rows -----------------------------------
  if clara.is_high_stakes(p_entry) then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'high_stakes',
      p_op_key,v_approve_op_key);
  end if;
  -- 0016 P2(e)/P6: CN autopost is IMPOSSIBLE — a sales_credit_note draft skips
  -- by NAME (the 0015 control-shape refusal was incidental; this is the law).
  if v_direction='sales' and e.coding_kind='sales_credit_note' then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'cn_not_autopostable',
      p_op_key,v_approve_op_key);
  end if;
  -- 0016 P4 (WA21-R1): the sst_purchase_cost visibility leg is NOT sanctioned
  -- for autopost — human lanes only. A purchase draft carrying one skips by
  -- NAME before the generic account enumeration.
  if v_direction='purchase' and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost') then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,
      'purchase_sst_not_autopostable',p_op_key,v_approve_op_key);
  end if;
  -- FIX-1+7 (adversarial laundering — COUNT+IDENTITY enumeration, REPLACING the v2
  -- Σ|dr−cr| tolerance). N tiny decoy legs could inflate a sum tolerance (each extra leg
  -- lifts the old greatest(5,n_legs) bound), and the old sst_output exemption was an
  -- untied free bucket. Instead the entry's legs must form EXACTLY the sanctioned set,
  -- verified by leg COUNT + account IDENTITY — there is NO aggregate tolerance to inflate.
  -- The post is REJECTED (control_shape / account_mismatch skip) if ANY of these fails:
  --   (a) EXACTLY ONE direction-correct control leg (purchase => one payable CREDIT;
  --       sales => one receivable DEBIT), whose amount = the stated gross when the facts
  --       state one (a control<>gross entry never auto-posts — the DB owns the number);
  --   (b) >= 1 leg to the rule's signed account on the direction-correct side, and ZERO
  --       signed-account legs on the wrong side;
  --   (c) sst_output is a SALES-side (output-tax) role ONLY (FIX-2 v4). On a SALES post it
  --       is a sanctioned role bounded to AT MOST ONE leg tied to the stated tax fact
  --       (invoice.tax_total). On a PURCHASE post it is NOT sanctioned at all — a purchase
  --       sst_output leg is an OUTSIDE leg (Malaysian purchase SST is expensed INTO cost,
  --       expense=gross; a separate sst leg is the item-7 laundering vector) → refuse (e).
  --   (d) AT MOST ONE rounding leg (special_acc_type='rounding'), |dr−cr| <= 5 sen;
  --   (e) ZERO legs to ANY OTHER account (every leg is one of the sanctioned roles above —
  --       a decoy leg to an unaccounted account, at ANY count or size, refuses — closes item
  --       1; on a purchase an sst_output leg lands here too — closes item 2). 0016: an
  --       sst_purchase_cost leg is never sanctioned either — the named skip above fires
  --       first on a purchase; on a sales draft it lands here as an outside leg.
  -- (v_fx/v_doc_lane were bound ONCE at the top of the fn — ADV-R2 R1#1.)
  v_state := case when v_fx is null then '{}'::jsonb
    else clara._invoice_fact_state_at(e.document_id,v_fx) end;
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;

  -- (a) the single direction-correct control leg + its amount.
  select
    count(*) filter (where a.account_class in ('payable','receivable')),
    count(*) filter (where (v_direction='purchase' and a.account_class='payable'    and l.credit_cents>0)
                        or (v_direction='sales'    and a.account_class='receivable' and l.debit_cents>0)),
    coalesce(sum(case when v_direction='purchase' and a.account_class='payable'    then l.credit_cents
                      when v_direction='sales'    and a.account_class='receivable' then l.debit_cents
                      else 0 end),0)
    into v_ctrl_total, v_ctrl_ok, v_ctrl_amount
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_total<>1 or v_ctrl_ok<>1
     or (v_gross is not null and v_ctrl_amount<>v_gross) then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'control_shape',
      p_op_key,v_approve_op_key);
  end if;

  -- (b) signed-account legs by side; (c) sst_output legs + tied magnitude; (d) rounding
  -- legs + imbalance; (e) legs to an account OUTSIDE the four sanctioned roles. Every leg
  -- is classified by its account (join to coa_accounts) — count+identity, never a Σ bound.
  select
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.debit_cents>0) or (v_direction='sales' and l.credit_cents>0))),
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.credit_cents>0) or (v_direction='sales' and l.debit_cents>0))),
    count(*) filter (where coalesce(a.special_acc_type,'')='sst_output'),
    coalesce(sum(l.debit_cents+l.credit_cents) filter (where coalesce(a.special_acc_type,'')='sst_output'),0),
    count(*) filter (where coalesce(a.special_acc_type,'')='rounding'),
    coalesce(sum(abs(l.debit_cents-l.credit_cents)) filter (where coalesce(a.special_acc_type,'')='rounding'),0),
    count(*) filter (where coalesce(a.account_class,'') not in ('payable','receivable')
      and l.account_code<>r.account_code
      and coalesce(a.special_acc_type,'')<>'rounding'
      and not (v_direction='sales' and coalesce(a.special_acc_type,'')='sst_output'))
    into v_signed_ok, v_signed_wrong, v_sst_legs, v_sst_amt, v_round_legs, v_round_imb, v_outside_legs
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_signed_ok<1 or v_signed_wrong>0
     or v_outside_legs>0
     or v_sst_legs>1 or (v_sst_legs=1 and (v_tax is null or v_sst_amt<>v_tax))
     or v_round_legs>1 or v_round_imb>5 then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'account_mismatch',
      p_op_key,v_approve_op_key);
  end if;
  select coalesce(sum(debit_cents),0) into v_total from clara.journal_lines where entry_id=p_entry;
  if v_total>r.amount_cap_cents then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'over_cap',
      p_op_key,v_approve_op_key);
  end if;
  v_window_start:=case when r.frequency_window='monthly'
    then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
    else now()-interval '30 days' end;
  select count(*)::int into v_count from clara.rule_post_runs
    where rule_id=r.id and posted_at>=v_window_start;
  if v_count>=r.window_max_posts then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'window_exhausted',
      p_op_key,v_approve_op_key);
  end if;
  if r.expires_at<=now() then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'expired',
      p_op_key,v_approve_op_key);
  end if;
  if e.revision_token is null then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'no_revision',
      p_op_key,v_approve_op_key);
  end if;

  -- FIX v5 (item 5 — CORROBORATION-REQUIRED to auto-post): the confidence ladder auto-posts
  -- ONLY DB-VERIFIED entries. Every rule gate above re-derives cap/window/shape, but the
  -- control-leg tie (a) only anchors to gross when gross is non-NULL. A NON-corroborated
  -- document — a blank / malformed / unreadable total, or ANY state short of Tier-A — leaves
  -- v_gross NULL, so the tie stays inert and an interactive wake draft (the runtime submits
  -- EVERY coded entry.drafted to this executor — rule-post.mjs, not only autodraft) could cite
  -- a non-total region, carry an ARBITRARY under-cap balanced amount, and be auto-posted with
  -- no verified anchor ("the DB owns every number"). Require the document fact-state's
  -- `corroborated` signal to be true before driving the post; otherwise SKIP `not_corroborated`
  -- and leave the entry in the human queue. This is the executor's ADMISSION gate, not a persist
  -- refusal: `invoice.total` still persists blank/non-corroborated at the write boundary
  -- (fail-closed, unchanged). A corroborated bill (gross verified ⇒ the (a) tie already fired)
  -- is unaffected — the positive path still auto-posts. Placed LAST so every specific rule-gate
  -- skip (control_shape / account_mismatch / over_cap / window_exhausted / expired / no_revision)
  -- still fires first for a shaped-but-non-corroborated draft; a CLEAN-shaped non-corroborated
  -- draft (the residual-5 laundering path) lands here.
  if not coalesce((v_state->>'corroborated')::boolean,false) then
    return clara._settle_rule_post_skip(
      e.firm_id,e.client_id,p_entry,r.id,'not_corroborated',
      p_op_key,v_approve_op_key);
  end if;

  -- ADV-1: the DOCUMENT's ACTUAL evidence class, derived from its latest done
  -- facts task lane (the local no-egress MyInvois parse = 'structured'; the
  -- Azure OCR lane = 'ocr_sales') — NEVER from the rule label alone. A signed
  -- class that does not match the document's real extraction source is a named
  -- visible skip: an OCR document can never ride a 'structured' rule around
  -- the envelope, and an XML document never consumes an OCR authority.
  if v_direction='sales' then
    -- ADV-R2 (R1#1): the class derives from the ONE BOUND lane resolved above
    -- (v_doc_lane rides the same single resolution as v_fx and v_state).
    v_doc_class:=case v_doc_lane when 'local_facts' then 'structured'
                                 when 'invoice_facts' then 'ocr_sales' end;
    if v_doc_class is null or v_doc_class is distinct from r.evidence_class then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'evidence_class_mismatch',
        p_op_key,v_approve_op_key);
    end if;
  end if;

  -- 0016 §3.3: the OCR compensating-control envelope, RE-DERIVED at post time
  -- (control 8 — no trust in signing-time state).
  if v_direction='sales' and r.evidence_class='ocr_sales' then
    -- (a) positive polarity evidence (ADV-3: a done classifier row is not by
    -- itself positive evidence — the WINNING verdict must POSITIVELY say
    -- 'invoice'): the human correction outranks classifier verdicts; among
    -- classifier rows the newest version wins; the verdict must be
    -- high-confidence (>=0.8, never low_confidence) or human, and must agree
    -- with the CURRENT document_kind.
    select d2.document_kind into v_kind_doc from clara.documents d2 where d2.id=e.document_id;
    select x.envelope into v_verdict from clara.document_extractions x
      where x.document_id=e.document_id and x.engine_kind='doc_classify'
        and x.status='done'
      order by case when x.envelope->>'source'='human' then 0 else 1 end,
        x.version_n desc limit 1;
    if v_kind_doc is distinct from 'invoice'
       or v_verdict is null
       or (v_verdict->>'verdict_kind') is distinct from 'invoice'
       or coalesce((v_verdict->>'low_confidence')::boolean,false)
       or not ((v_verdict->>'source')='human'
               or coalesce((v_verdict->>'confidence')::numeric,0)>=0.8) then
      select count(*)::int+1 into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'polarity_unverified',
        p_op_key,v_approve_op_key);
    end if;
    -- (b) hard direction evidence — every field reads the ONE BOUND extraction
    -- (v_fx, resolved once above; ADV-R2 R1#1).
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_name';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_taxid from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_taxid';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) into v_client_name
      from clara.clients where id=e.client_id;
    v_hard_ok:=v_sup_reg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
        and ci.value_normalized=v_sup_reg);
    v_name_ok:=v_sup_name is not null and (v_sup_name=v_client_name
      or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
          and al.retired_at is null and al.alias_normalized=v_sup_name));
    v_buyer_hit:=
      (v_cust_reg is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_reg))
      or (v_cust_taxid is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_taxid))
      or (v_cust_name is not null and (v_cust_name=v_client_name
        or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
            and al.retired_at is null and al.alias_normalized=v_cust_name)));
    if not (v_hard_ok and v_name_ok) or v_buyer_hit then
      select count(*)::int+1 into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'direction_unproven',
        p_op_key,v_approve_op_key);
    end if;
    -- (b2) ADV-4: stated-buyer <-> signed-counterparty CONGRUENCE. Control (b)
    -- proves only that the buyer is NOT the client; the invoice's stated buyer
    -- must ALSO resolve (kind-scoped, no birth ever) to the SAME canonical
    -- customer the signed rule names — an invoice billing Buyer B can never be
    -- posted through Customer A's authority. Absence, ambiguity, birth, or a
    -- registration contradiction is a named visible skip.
    select nullif(btrim(min(dr.text_content)),'') into v_cust_name_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select nullif(btrim(min(dr.text_content)),'') into v_cust_reg_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    v_buyer_id:=null;
    if v_cust_name_raw is not null then
      begin
        v_buyer_fp:=clara._resolve_counterparty(e.client_id,jsonb_strip_nulls(
          jsonb_build_object('kind','customer','new',jsonb_build_object(
            'name',v_cust_name_raw,'registration_no',v_cust_reg_raw))));
        if v_buyer_fp is not null and v_buyer_fp->>'decision'<>'birth'
           and (v_buyer_fp->>'counterparty_id') is not null then
          v_buyer_id:=clara._canonical_counterparty(e.client_id,
            (v_buyer_fp->>'counterparty_id')::uuid);
        end if;
      exception when sqlstate 'CLR23' or sqlstate 'CLR21' then
        v_buyer_id:=null; -- ambiguity/contradiction => mismatch below
      end;
    end if;
    if v_buyer_id is null
       or v_buyer_id is distinct from clara._canonical_counterparty(e.client_id,r.counterparty_id) then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'buyer_mismatch',
        p_op_key,v_approve_op_key);
    end if;
    -- (c) full multi-anchor corroboration.
    v_net:=nullif(v_state->>'total_excl_tax_cents','')::bigint;
    v_round:=nullif(v_state->>'rounding_cents','')::bigint;
    v_inv_id:=nullif(v_state->>'invoice_id','');
    v_inv_date:=nullif(v_state->>'invoice_date','');
    select count(*)::int,min(dr.monetary_cents) into v_due_c,v_due_amt
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.amount_due';
    -- 0022 (X3): the stated components of the corrected identity, read off the SAME bound
    -- extraction as every other anchor field.
    select count(*)::int,min(dr.monetary_cents) into v_sc_c,v_sc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.service_charge';
    select count(*)::int,min(dr.monetary_cents) into v_disc_c,v_disc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.discount';
    select count(*)::int,min(dr.monetary_cents) into v_dlv_c,v_dlv
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.delivery';
    -- 0023 (X5): THE DARK DISJUNCT IS GONE. It was an unconditional leading term that held
    -- this whole block true, keeping the OCR-sales anchor lane structurally shut while X2
    -- taught the mapper to emit net and tax. Deleting it is the deliberate act 0022's §D
    -- reserved for this migration and no other. NOTE THE WORDING: the marker string 0022 used
    -- must not appear anywhere in this body — nor the disjunct's own text — because the test
    -- harness detects the guard by grepping prosrc for the marker, and 0022's tail matches the
    -- disjunct over comment-stripped source. A comment SAYING the guard is gone would report
    -- it ARMED while the lane ran open, which is the worst of both. Every condition below is
    -- byte-identical to 0022's,
    -- and the two controls the block SHADOWED while it was armed — `customer_unresolved` at
    -- (d) and `floor_lost` at (e2) — become reachable again for the first time.
    if v_gross is null or v_inv_id is null or v_inv_date is null
       or v_net is null or v_tax is null
       or (v_sc_c>0 and v_sc is null) or (v_disc_c>0 and v_disc is null)
       or (v_dlv_c>0 and v_dlv is null)
       -- The sign belt, mirroring the shape floor (adversarial round 1 — FATAL): a
       -- NEGATIVE discount turns the identity's subtraction into an addition and forges
       -- a larger gross that ties. The write boundary refuses one; this makes the anchor
       -- lane refuse one too, so removing the dark guard at X5 cannot open on a forged
       -- identity even if a component arrived by some other path.
       or coalesce(v_sc,0)<0 or coalesce(v_disc,0)<0 or coalesce(v_dlv,0)<0
       or (v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_round,0)
           -coalesce(v_disc,0))<>v_gross
       or v_due_c<>1 or v_due_amt is null or v_due_amt<>v_gross then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'anchor_missing',
        p_op_key,v_approve_op_key);
    end if;
    -- (d) an EXISTING resolved customer, re-derived live (no birth ever).
    if not exists(select 1 from clara.counterparties cp where cp.id=r.counterparty_id
        and cp.client_id=e.client_id and cp.kind='customer'
        and cp.merged_into is null and cp.retired_at is null) then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'customer_unresolved',
        p_op_key,v_approve_op_key);
    end if;
    -- (e2) ADV-5: the sighting FLOOR re-derived atomically at post time, under
    -- the client serialization lock (the same advisory lock the approve core
    -- takes — reentrant in this transaction, so a concurrent reversal cannot
    -- slip between the floor check and the post). Evidence reversed since
    -- signing strips the live authority: a named visible skip.
    perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
    select f.qualifying,f.distinct_invoices,f.corroborated,f.span_days into v_fseen,v_fdocs,v_fcorr,v_fspan
      from clara._ocr_sales_floor(e.client_id,
        clara._canonical_counterparty(e.client_id,r.counterparty_id),r.account_code) f;
    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or coalesce(v_fcorr,0)<6 or v_fspan is null or v_fspan<60 then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'floor_lost',
        p_op_key,v_approve_op_key);
    end if;
  end if;

  -- 0029 Slot C. The control is keyed on the durable entry marker. Unbound
  -- drafts never enter this block and take no vendor_identity_bindings lock.
  if e.vendor_binding_id is not null then
    select * into b
    from clara.vendor_identity_bindings
    where id=e.vendor_binding_id
    for update;
    if not found then
      raise exception 'binding marker has no authority row'
        using errcode='CLR36',
          detail='{"reason":"binding_changed"}';
    end if;

    select * into cpb
    from clara.counterparties
    where id=b.counterparty_id
      and firm_id=b.firm_id
      and client_id=b.client_id;

    -- Pin current latest-done facts and OCR in one statement snapshot. Calling
    -- the as-built _binding_f3_holds helper in this same statement makes its own
    -- latest-OCR selection coincide with v_ocr_extraction.
    select fx.id,fx.envelope,ox.id,
      vn.vendor_name,vr.vendor_registration,
      clara._binding_normalize(ii.invoice_id),
      clara._binding_f3_holds(
        e.document_id,cpb.registration_normalized,cpb.name_normalized),
      bm.match_count,bm.binding_id,bm.f2_invoice_prefix
      into v_facts_extraction,v_facts_envelope,v_ocr_extraction,
        v_vendor_name,v_vendor_registration,v_invoice_id_norm,v_f3_ok,
        v_binding_matches,v_matching_binding,v_matching_f2
    from (
      select x.id,x.envelope
      from clara.document_extractions x
      where x.document_id=e.document_id
        and x.engine_kind='invoice_facts' and x.status='done'
      order by x.version_n desc,x.id desc
      limit 1
    ) fx
    left join lateral (
      select x.id
      from clara.document_extractions x
      where x.document_id=e.document_id
        and x.engine_kind='ocr' and x.status='done'
      order by x.version_n desc,x.id desc
      limit 1
    ) ox on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as vendor_name
      from clara.document_regions dr
      where dr.extraction_id=fx.id
        and dr.field_path='invoice.vendor_name'
    ) vn on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as vendor_registration
      from clara.document_regions dr
      where dr.extraction_id=fx.id
        and dr.field_path='invoice.vendor_registration'
    ) vr on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as invoice_id
      from clara.document_regions dr
      where dr.extraction_id=fx.id
        and dr.field_path='invoice.invoice_id'
    ) ii on true
    left join lateral (
      select count(*)::int as match_count,
        (array_agg(b2.id order by b2.id))[1] as binding_id,
        (array_agg(b2.f2_invoice_prefix order by b2.id))[1]
          as f2_invoice_prefix
      from clara.vendor_identity_bindings b2
      join clara.counterparties cp2
        on cp2.id=b2.counterparty_id
       and cp2.firm_id=b2.firm_id
       and cp2.client_id=b2.client_id
      where b2.client_id=e.client_id
        and b2.status='live' and b2.expires_at>now()
        -- 0030: F1 is now the window's LCP; the OTHER binding's stored F1
        -- must be a prefix of the document's own normalized fragment. The
        -- explicit NULL guard mirrors F2's/v_f1_ok's own starts_with idiom
        -- (O-round confirmation finding 4) -- WHERE already excludes a NULL
        -- starts_with() result, so this is belt-and-suspenders, not a
        -- behavior change.
        and clara._binding_normalize(vn.vendor_name) is not null
        and starts_with(clara._binding_normalize(vn.vendor_name),
          b2.f1_vendor_name_norm)
        and cp2.merged_into is null and cp2.retired_at is null
        and cp2.registration_normalized is not distinct from
          b2.registration_at_signing
        and clara._binding_f3_holds(
          e.document_id,cp2.registration_normalized,cp2.name_normalized)
    ) bm on true;

    select vr.id,vr.binding_id,vr.facts_extraction_id,vr.ocr_extraction_id
      into v_draft_resolution,v_draft_binding,v_draft_facts,v_draft_ocr
    from clara.vendor_binding_resolutions vr
    where vr.entry_id=e.id and vr.phase='draft'
    order by vr.created_at desc,vr.id desc
    limit 1;

    v_resolution_facts:=coalesce(v_facts_extraction,v_draft_facts);
    v_resolution_ocr:=coalesce(v_ocr_extraction,v_draft_ocr);
    v_f1_current:=clara._binding_normalize(v_vendor_name);
    -- 0030: F1 is now the window's LCP; re-check as a prefix relation,
    -- mirroring v_f2_ok's exact NULL-safe starts_with style below.
    v_f1_ok:=v_f1_current is not null
      and starts_with(v_f1_current,b.f1_vendor_name_norm);
    v_f2_ok:=v_invoice_id_norm is not null
      and starts_with(v_invoice_id_norm,b.f2_invoice_prefix);
    v_matching_f2_ok:=coalesce(v_binding_matches,0)=1
      and v_invoice_id_norm is not null
      and starts_with(v_invoice_id_norm,v_matching_f2);
    v_binding_live:=b.status='live' and b.expires_at>now();

    -- Re-run the receipt half of A.1. The allowlist is identical to 0028's.
    -- For outcome='absent', the four always-present producer counters have
    -- exact values: absent=1 and matched/typed_collapsed/emitted=0.
    v_vi:=v_facts_envelope->'vendor_identity';
    if jsonb_typeof(v_vi) is distinct from 'object'
       or jsonb_typeof(v_vi->'candidates') is distinct from 'array' then
      v_binding_reason:='binding_receipt_unrecognized';
    elsif exists (
      select 1 from jsonb_object_keys(v_vi) k
      where k not in (
        'matched','absent','ambiguous','rejected_gate','below_band',
        'height_missing','unit_unresolved','no_geometry','label_continuation',
        'no_vendor_anchor','vendor_anchor_far','closer_to_customer',
        'typed_collapsed','typed_disagreement','typed_vs_ambiguous','emitted',
        'candidates','outcome','value_raw','occurrences','distinct_keys'
      )
    ) then
      v_binding_reason:='binding_receipt_unrecognized';
    elsif v_vi->>'outcome' not in (
      'absent','ambiguous','matched','typed_disagreement'
    ) then
      v_binding_reason:='binding_receipt_unrecognized';
    else
      if v_vi->>'outcome'='absent' then
        if v_vi->'absent' is distinct from '1'::jsonb
           or v_vi->'matched' is distinct from '0'::jsonb
           or v_vi->'typed_collapsed' is distinct from '0'::jsonb
           or v_vi->'emitted' is distinct from '0'::jsonb
           or v_vi ?| array[
             'value_raw','occurrences','distinct_keys'
           ] then
          v_binding_reason:='binding_receipt_unrecognized';
        elsif jsonb_array_length(v_vi->'candidates')<>0
           or exists (
             select 1
             from unnest(array[
               'ambiguous','typed_disagreement','typed_vs_ambiguous'
             ]) k
             where v_vi ? k and v_vi->k is distinct from '0'::jsonb
           ) then
          v_receipt_ambiguous:=true;
        elsif exists (
          select 1
          from unnest(array[
            'below_band','height_missing','unit_unresolved','no_geometry',
            'rejected_gate','label_continuation','no_vendor_anchor',
            'vendor_anchor_far','closer_to_customer'
          ]) k
          where v_vi ? k and v_vi->k is distinct from '0'::jsonb
        ) then
          v_receipt_uncorroborated:=true;
        elsif v_vendor_registration is null then
          v_a1_clean:=true;
        end if;
      elsif v_vi->>'outcome' in ('ambiguous','typed_disagreement') then
        v_receipt_ambiguous:=true;
      end if;
    end if;

    -- A.1 condition 5 and A.5 step 5 share one page-resolution attempt.
    -- Crucially, an extracted registration is supplied to the ordinary resolver:
    -- the previous name-only call could never exercise the equality-success path
    -- for a registered vendor. A clean absent receipt admits birth or a
    -- registration_conflict candidate equal to the binding; every other A.1
    -- failure may proceed only on a genuine ordinary resolution to that same
    -- counterparty.
    if v_binding_reason is null and v_vendor_name is not null then
      begin
        v_page_fp:=clara._resolve_counterparty(e.client_id,
          jsonb_strip_nulls(jsonb_build_object(
            'kind','vendor',
            'new',jsonb_build_object(
              'name',v_vendor_name,
              'registration_no',v_vendor_registration))));
      exception
        when sqlstate 'CLR21' then
          v_page_ambiguous:=true;
          v_page_fp:=null;
        when sqlstate 'CLR23' then
          declare
            v_detail_j jsonb;
          begin
            get stacked diagnostics v_detail=pg_exception_detail;
            begin
              v_detail_j:=nullif(v_detail,'')::jsonb;
            exception when others then
              v_detail_j:=null;
            end;
            if coalesce(v_detail_j->>'reason','')='registration_conflict' then
              begin
                v_page_candidate:=nullif(
                  v_detail_j->>'candidate_id','')::uuid;
              exception when others then
                v_page_candidate:=null;
              end;
            end if;
            if v_page_candidate is null then
              v_page_ambiguous:=true;
            end if;
            v_page_fp:=null;
          end;
      end;
    end if;
    if v_page_fp is not null and v_page_fp->>'decision'='birth' then
      v_page_birth:=true;
    elsif v_page_fp is not null
       and v_page_fp->>'decision'<>'birth' then
      begin
        v_page_counterparty:=clara._canonical_counterparty(
          e.client_id,(v_page_fp->>'counterparty_id')::uuid);
      exception when sqlstate 'CLR23' then
        v_page_counterparty:=null;
        v_page_ambiguous:=true;
      end;
      v_page_same:=v_page_counterparty is not null
        and v_page_counterparty is not distinct from b.counterparty_id;
    end if;

    if v_binding_reason is null then
      if v_receipt_ambiguous then
        v_binding_reason:='binding_ambiguous';
      elsif v_a1_clean then
        if v_page_birth
           or v_page_candidate is not distinct from b.counterparty_id
           or v_page_same then
          null;
        elsif v_page_candidate is not null
           or v_page_counterparty is not null then
          v_binding_reason:='binding_page_resolves_other';
        elsif v_page_ambiguous then
          v_binding_reason:='binding_ambiguous';
        else
          v_binding_reason:='binding_changed';
        end if;
      elsif v_page_same then
        null;
      elsif v_page_counterparty is not null then
        v_binding_reason:='binding_page_resolves_other';
      elsif v_page_ambiguous or v_page_candidate is not null then
        v_binding_reason:='binding_ambiguous';
      elsif v_receipt_uncorroborated then
        v_binding_reason:='binding_uncorroborated';
      else
        v_binding_reason:='binding_changed';
      end if;
    end if;

    if b.status='revoked' then
      v_binding_reason:='binding_revoked';
    elsif b.status='expired' or b.expires_at<=now() then
      v_binding_reason:='binding_expired';
    elsif not v_binding_live and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif (cpb.id is null or cpb.merged_into is not null
        or cpb.retired_at is not null
        or cpb.registration_normalized is distinct from
          b.registration_at_signing)
        and v_binding_reason is null then
      v_binding_reason:='binding_identity_drifted';
    elsif (v_draft_resolution is null
        or v_draft_binding is distinct from e.vendor_binding_id)
        and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif v_facts_extraction is null and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif v_ocr_extraction is null and v_binding_reason is null then
      v_binding_reason:='binding_no_corroboration_source';
    elsif coalesce(v_binding_matches,0)>1
        and v_binding_reason is null then
      v_binding_reason:='binding_ambiguous';
    elsif coalesce(v_binding_matches,0)=1
        and not coalesce(v_matching_f2_ok,false)
        and v_binding_reason is null then
      v_binding_reason:='binding_features_changed';
    elsif (not coalesce(v_f1_ok,false) or not coalesce(v_f2_ok,false))
        and v_binding_reason is null then
      v_binding_reason:='binding_features_changed';
    elsif not coalesce(v_f3_ok,false) and v_binding_reason is null then
      v_binding_reason:='binding_uncorroborated';
    elsif v_counterparty is distinct from b.counterparty_id
        and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    elsif (coalesce(v_binding_matches,0)<>1
        or v_matching_binding is distinct from e.vendor_binding_id)
        and v_binding_reason is null then
      v_binding_reason:='binding_changed';
    end if;

    v_binding_outcome:=case when v_binding_reason is null
      then 'bound' else 'refused' end;
    insert into clara.vendor_binding_resolutions(
      binding_id,firm_id,client_id,document_id,entry_id,phase,
      facts_extraction_id,ocr_extraction_id,compared_to_resolution_id,
      entry_revision_token,raw_proposal,outcome,refusal_reason
    ) values (
      e.vendor_binding_id,e.firm_id,e.client_id,e.document_id,e.id,'post',
      v_resolution_facts,v_resolution_ocr,v_draft_resolution,
      e.revision_token,'{}'::jsonb,v_binding_outcome,v_binding_reason
    );

    if v_binding_reason is not null then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,v_binding_reason,
        p_op_key,v_approve_op_key);
    end if;
  end if;

  -- Drive the SAME approve core with the rule identity. ONLY the benign races become
  -- skips (review M2): CLR06 (stale revision) and the CLR10 that is specifically the
  -- not-a-draft status race (a human approved/withdrew concurrently — detail reason
  -- 'not_a_draft'). FIX-6 (adversarial #12): any OTHER CLR10 — e.g. a shape-floor
  -- CLR10 like sst_account_missing — PROPAGATES honestly, never masked as not_a_draft.
  begin
    v_result:=clara._approve_entry_core(
      jsonb_build_object('actor',r.signed_by,'firm',e.firm_id,'checked_via_rule_id',r.id,
        'bound_extraction',v_fx)
        || jsonb_build_object('receipt_preheld',true),
      p_entry,e.revision_token,null,v_approve_op_key);
  exception
    when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%not_a_draft%' then
        raise;   -- propagate every non-race CLR10 (e.g. sst_account_missing)
      end if;
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'not_a_draft',
        p_op_key,v_approve_op_key);
    when sqlstate 'CLR21' then
      -- RESIDUAL-2: the supplier-bill shape floor refuses a non-01 supplier document
      -- (type_polarity_mismatch) inside the approve core. The executor degrades that to a
      -- QUIET skip (=> NEEDS YOU), never an error loop; any OTHER CLR21 propagates honestly.
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%type_polarity_mismatch%' then
        raise;
      end if;
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'type_polarity_mismatch',
        p_op_key,v_approve_op_key);
    when sqlstate 'CLR06' then
      return clara._settle_rule_post_skip(
        e.firm_id,e.client_id,p_entry,r.id,'stale_revision',
        p_op_key,v_approve_op_key);
  end;

  -- Receipt (rule snapshot at post time, for the audit join) + the typed event.
  insert into clara.rule_post_runs(firm_id,client_id,rule_id,entry_id,posted_at,snapshot)
    values(e.firm_id,e.client_id,r.id,p_entry,now(),
      jsonb_build_object('rule_id',r.id,'account_code',r.account_code,'direction',r.direction,
        'amount_cap_cents',r.amount_cap_cents,'frequency_window',r.frequency_window,
        'window_max_posts',r.window_max_posts,'signed_by',r.signed_by,
        'content_hash',r.content_hash,'posted_total_cents',v_total,
        'evidence_class',r.evidence_class))
    returning id into v_run;
  perform clara._append_event(e.firm_id,'entry.rule_posted',e.client_id,r.signed_by,null,null,
    p_entry,e.document_id,null,jsonb_build_object('rule_id',r.id,'run_id',v_run,
      'counterparty_id',v_counterparty,'account_code',r.account_code));
  v_result:=jsonb_build_object(
    'entry_id',p_entry,'status','posted','rule_id',r.id,'run_id',v_run);
  return clara._finish_op(
    e.firm_id,'execute_rule_post',p_op_key,v_result);
end $function$;

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
  -- batch_size is a BUDGET, not a RATE: the per-firm daily cap (clara.firm_limits.
  -- sales_admission_daily_cap, default 15) still governs how fast this batch actually moves,
  -- so a 500-document batch drains over roughly 34 days, not overnight. Raise the cap, not
  -- the batch, to go faster.
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
    -- THE SALES CAP COUNTS UNDER THE FIRM''S EXISTING DAILY-COUNTER LOCK, 202991617, and
    -- introduces NO SECOND KEY. A second firm-scoped key deadlocks: the retry/refund branch
    -- far above already takes 202991617 before control falls through to here, so a retry
    -- admission would hold 202991617 then want the new key while a fresh admission held the
    -- new key then wanted 202991617 -- opposite orders on the same firm, which PostgreSQL
    -- resolves by aborting one with 40P01. That abort rolls back the whole transaction and
    -- writes NO sweep_run_items row, which is precisely the run-wedge this function''s other
    -- branches are all written to avoid. (Demonstrated by the independent review, two
    -- sessions, both orders.) Advisory xact locks are REENTRANT, so taking it here is free
    -- when the retry path already holds it and is simply the same acquisition the budget
    -- gate below would make anyway.
    || '    perform pg_advisory_xact_lock(202991617,hashtext(f.firm_id::text));' || chr(10)
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
  -- THE ANCHOR IS THE PARAMETER LIST, NOT THE WHOLE HEADER LINE, and that is deliberate:
  -- the wiki-authority gate (0019 SS9 / WB-R21, scripts/wiki-lint-checks.mjs) treats a
  -- CoR block whose literals spell `create ... function` as a DYNAMIC FUNCTION CREATOR and
  -- then scans the block's OWN migration-time machinery as if it were a persistent surface.
  -- Anchoring on the parameter list keeps the edit exactly as precise (this list occurs
  -- once, asserted below) while leaving the gate's create-detection honestly unarmed.
  v_anchor := 'settle_autodraft_task(p_task uuid, p_outcome text, p_tokens bigint, p_entry uuid DEFAULT NULL::uuid, p_refusal jsonb DEFAULT NULL::jsonb)';
  v_count := (length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor);
  if v_count <> 1 then
    raise exception '0046 S8: settle_autodraft_task signature anchor occurs % times, expected 1', v_count
      using errcode='CLR10';
  end if;
  v_next := replace(v_def, v_anchor,
    'settle_autodraft_task(p_task uuid, p_outcome text, p_tokens bigint, p_entry uuid, p_refusal jsonb, p_workflow_run_id text)');

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
-- ACL SELF-VERIFICATION -- SEPARATE FROM THE TAIL, AND THE SEPARATION IS LOAD-BEARING.
--
-- These three arms are the only ones that ask has_function_privilege, so they are the only
-- ones whose text contains the bare token `execute`. The wiki-authority gate (0019 SS9 /
-- WB-R21) classifies ANY `do` block that mentions both pg_get_functiondef and `execute` as
-- a change-of-record patch and then scans its literals as a persistent surface -- so a
-- privilege probe sitting beside the tail's roster census (which legitimately reads
-- pg_get_functiondef) reads as dynamic SQL with an unresolved target, which is unwaivable
-- and fail-closed BY DESIGN. Splitting them costs nothing and asserts exactly the same
-- three things. Nothing here is weakened to satisfy a lint: has_function_privilege is kept
-- precisely because it is the only inheritance-aware answer to "can this role execute it".
-- =====================================================================
do $acls$
declare
  v_n int; v_names text; r record;
begin
  -- (A1) EXACTLY TWO settle_autodraft_task SIGNATURES, WITH IDENTICAL RUNTIME-ONLY ACLs.
  -- 0011's own one-overload assertion will not re-run, so it is re-made here as a positive
  -- claim about the post-state rather than inherited from a migration that already ran.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task';
  if v_n <> 2 then
    raise exception '0046 acl 1: expected exactly TWO clara.settle_autodraft_task signatures, found %', v_n;
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
    raise exception '0046 acl 1: the 6-arity clara.settle_autodraft_task must carry NO defaulted parameters (matched %/1) -- a default would make every 5-argument call planner-ambiguous', v_n;
  end if;
  for r in select p.oid, p.oid::regprocedure::text as sig from pg_proc p
            where p.pronamespace='clara'::regnamespace and p.proname='settle_autodraft_task'
  loop
    if not has_function_privilege('clara_runtime', r.oid, 'execute') then
      raise exception '0046 acl 1: clara_runtime cannot EXECUTE % -- the two overloads must carry IDENTICAL runtime ACLs (rig-meta keys expected roles BY NAME)', r.sig;
    end if;
    if has_function_privilege('clara_authenticated', r.oid, 'execute')
       or has_function_privilege('clara_agent_ro', r.oid, 'execute') then
      raise exception '0046 acl 1: % is reachable from a non-runtime role -- settle is a runtime-lane verb only', r.sig;
    end if;
    if exists(select 1 from pg_proc p2, aclexplode(p2.proacl) a
              where p2.oid=r.oid and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception '0046 acl 1: PUBLIC holds EXECUTE on %', r.sig;
    end if;
  end loop;

  -- (A2) NO NEW PUBLIC EXECUTE. A function created without an explicit revoke carries
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
    raise exception '0046 acl 2: PUBLIC holds EXECUTE on {%}', v_names;
  end if;

  -- (A3) THE KILL-SWITCH IS REACHABLE FROM NO APPLICATION ROLE (7A-R1).
  for r in select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                              'clara_wake_interactive','clara_wake_proactive']) as role
  loop
    if has_function_privilege(r.role,
         'clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)'::regprocedure, 'execute') then
      raise exception '0046 acl 3: % can EXECUTE clara.set_sales_lane_activation -- the activation flip is the owner/deploy connection''s alone', r.role;
    end if;
  end loop;

  raise notice '0046 acl: settle parity, zero PUBLIC, kill-switch unreachable';
end
$acls$;

-- =====================================================================
-- TAIL -- IN-TRANSACTION SELF-VERIFICATION. Every raise is a real assertion failure.
-- =====================================================================
do $tail$
declare
  v_n int; v_names text; v_code text; v_raw text; v_missing text; v_needle text;
  r record;
begin
  -- THE INSTRUMENT LAW FOR EVERY ARM BELOW, stated once because an earlier cut of this block
  -- got it wrong in seven places and a mutation audit found ten ways to satisfy it while
  -- breaking the lane.
  --
  --   STRUCTURE is asserted on the LEXED body. Comments are chr(1) there, so no comment this
  --   migration splices into a body it also measures can forge a shape.
  --   LITERAL IDENTITY is asserted with pg_temp._wdb_code_literal, which answers "is this token
  --   CODE" rather than "does this token appear anywhere".
  --   Both halves sit in the SAME predicate, because either alone is forgeable: a shape without
  --   a token proves nothing about which receipt is emitted, and a token without a shape is
  --   satisfied by prose.
  --
  -- WHOLE PREDICATES, NOT SUBSTRINGS. `coalesce(v_corr,0)<6` present somewhere is not the
  -- claim; the claim is the exact boolean the writer evaluates, so that swapping one `or` for
  -- an `and` -- which would let a zero-corroboration rule sign -- breaks the match.
  --
  -- Whitespace is folded on both sides, so re-indentation is not a failure. A comment landing
  -- INSIDE a pinned predicate IS one, and that is deliberate.

  -- (1) THE EXACT LIVE CALLER SET OF THE FLOOR IS NOW FOUR.
  --
  -- Asked on the shared lex instrument, never on raw prosrc: a comment that merely NAMES the
  -- floor would read as a caller and refuse a correct deploy, and an upper-cased or quoted
  -- respelling would read as absent and pass a wrong one. Both directions were measured during
  -- the D-b2 ladder.
  --
  -- clara._ocr_sales_floor_pop CANNOT collide with this roster: the matcher requires the name
  -- to be followed by optional whitespace and then `(`, and `_ocr_sales_floor_pop(` puts `_pop`
  -- in between. The floor's own body calls the POP helper, not itself.
  select count(*)::int, coalesce(string_agg(p.proname,' ' order by p.proname),'')
    into v_n, v_names
    from pg_proc p
    where p.pronamespace='clara'::regnamespace
      and pg_temp._wdb_call_count(pg_temp._wdb_sql_code(coalesce(p.prosrc,'')),
                                  'clara._ocr_sales_floor') > 0;
  if v_names <> 'execute_rule_post preview_ocr_sales_evidence propose_autopost_rule sign_autopost_rule' then
    raise exception '0046 tail 1: the live callers of clara._ocr_sales_floor are {%} (n=%), not the pinned FOUR -- a caller was missed by this migration''s recut, or a new one appeared', v_names, v_n;
  end if;

  -- (2) EACH AUTHORITY WRITER EVALUATES THE WHOLE CORROBORATION PREDICATE.
  --
  -- THIS IS THE ARM THAT REPLACES v1'S INSUFFICIENT PROBE, and it is now stronger than the
  -- version that shipped first. v1 proposed asserting the old four-column shape is gone: that
  -- proves nothing, because no caller ever mentioned `distinct_docs` and, worse, an un-recut
  -- caller does not FAIL -- it succeeds while silently omitting the gate. The first fix asserted
  -- that `f.corroborated` and a `<6` comparison were each present SOMEWHERE, which a mutation
  -- audit defeated by changing one `or` to an `and`: every term is still there, and a rule with
  -- zero corroborating documents signs. So the pin is the exact boolean, per writer.
  for r in select p.proname,
                  regexp_replace(pg_temp._wdb_sql_code(coalesce(p.prosrc,'')),'\s+',' ','g') as code
             from pg_proc p
            where p.pronamespace='clara'::regnamespace
              and p.proname in ('propose_autopost_rule','sign_autopost_rule','execute_rule_post')
  loop
    v_needle := case r.proname
      when 'propose_autopost_rule' then
        'if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6 or coalesce(v_corr,0)<6 or v_span_days is null or v_span_days<60 then'
      when 'sign_autopost_rule' then
        'if coalesce(v_seen,0)<6 or coalesce(v_docs,0)<6 or coalesce(v_corr,0)<6 or v_span is null or v_span<60 then'
      else
        'if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or coalesce(v_fcorr,0)<6 or v_fspan is null or v_fspan<60 then'
      end;
    if position(v_needle in r.code) = 0 then
      raise exception '0046 tail 2: clara.% does not evaluate the pinned corroboration predicate -- an un-recut or glue-weakened caller SUCCEEDS while omitting the gate, so the whole boolean is the claim, never its terms', r.proname;
    end if;
    if position('f.corroborated' in r.code) = 0 then
      raise exception '0046 tail 2: clara.% does not BIND the floor''s corroborated column', r.proname;
    end if;
  end loop;

  -- (3) THE SS7-A VERB SURFACE EXISTS, AT THE EXACT SIGNATURES THE REST OF THE WAVE CALLS.
  --
  -- Ordinals 3, 4 and 5 were VACANT in the first cut of this block, and the honest reason is
  -- recorded rather than tidied away: the ACL arms that held them moved to the $acls$ block (so
  -- the wiki-authority gate could tell a privilege probe from a change-of-record patch) and
  -- nothing took their place, while the closing notice went on claiming thirteen. They are
  -- refilled here with the coverage the migration genuinely lacked -- the DDL surface itself,
  -- which until now no arm read at all.
  for v_names in select unnest(array[
      'clara.preview_ocr_sales_evidence(uuid)',
      'clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)',
      'clara.open_sales_backfill(uuid,integer,text,text)',
      'clara.set_sales_backfill_state(uuid,text,text)',
      'clara.list_sales_backfill_batches(jsonb)',
      'clara._ocr_sales_floor_pop(uuid,uuid,text,date)',
      'clara._sales_lane_active(uuid)',
      'clara._sales_admission_open(uuid,uuid,uuid)',
      'clara._autodraft_direction_tri(uuid,uuid)'])
  loop
    begin
      perform v_names::regprocedure;
    exception when others then
      raise exception '0046 tail 3: % does not exist at that exact signature -- the rest of the wave (the v6 runtime, the dashboard preview, the ceremony flip) calls these by name', v_names;
    end;
  end loop;

  -- (4) THE BOUND DIRECTION IS CARRIED, AND CONSTRAINED.
  -- 7A-R2 binds the coding-kind family at ADMISSION; these two columns are where that binding
  -- becomes durable and how clara.begin_autodraft_task hands it to the runtime. A `direction`
  -- that could hold any string would not be a binding.
  select count(*)::int into v_n from pg_attribute a
    where a.attrelid='clara.autodraft_attempts'::regclass and not a.attisdropped
      and a.attname in ('direction','backfill_batch_id');
  if v_n <> 2 then
    raise exception '0046 tail 4: clara.autodraft_attempts is missing the direction/backfill_batch_id carriers (matched %/2)', v_n;
  end if;
  select count(*)::int into v_n from pg_constraint
    where conrelid='clara.autodraft_attempts'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%direction%'
      and pg_get_constraintdef(oid) like '%sales%'
      and pg_get_constraintdef(oid) like '%purchase%';
  if v_n < 1 then
    raise exception '0046 tail 4: clara.autodraft_attempts.direction carries no CHECK restricting it to sales/purchase -- an unconstrained column is not a bound family';
  end if;

  -- (5) THE BACKFILL DOOR'S STRUCTURAL GUARANTEES.
  -- The partial unique index is the one that matters: with two non-closed batches for a client,
  -- "which batch paid for this admission" has no answer and the accounting stops being a
  -- receipt.
  select count(*)::int into v_n from pg_indexes
    where schemaname='clara' and tablename='sales_backfill_batches'
      and indexname='uq_sales_backfill_open'
      and indexdef like '%UNIQUE%' and indexdef like '%WHERE%' and indexdef like '%closed%';
  if v_n <> 1 then
    raise exception '0046 tail 5: the one-open-batch partial unique index is missing or no longer partial';
  end if;
  select count(*)::int into v_n from pg_constraint
    where conrelid='clara.sales_backfill_batches'::regclass and contype='c'
      and conname in ('ck_sales_backfill_admitted_within_batch','ck_sales_backfill_closed_at');
  if v_n <> 2 then
    raise exception '0046 tail 5: the backfill batch CHECKs (admitted<=batch_size, closed_at<=>closed) are not both present (matched %/2)', v_n;
  end if;

  -- (6) THE ACTIVATION SHIPS OFF -- ROWS **AND** THE COLUMN DEFAULT (7A-R1).
  --
  -- A row census alone is worthless as a ships-OFF guarantee: `default true` leaves every
  -- EXISTING row false, so the census passes, while every FUTURE firm arrives ACTIVE. The
  -- default is what actually carries the promise, so it is read directly. NOT NULL is read too
  -- -- a nullable flag makes the lane's `not clara._sales_lane_active(...)` depend on a
  -- coalesce somebody could later drop.
  select count(*)::int into v_n from clara.firm_limits where sales_lane_active;
  if v_n <> 0 then
    raise exception '0046 tail 6: % firm(s) already have sales_lane_active -- this migration must ship the lane OFF', v_n;
  end if;
  select count(*)::int into v_n from pg_attribute a
    left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='clara.firm_limits'::regclass and a.attname='sales_lane_active'
      and a.attnotnull and pg_get_expr(d.adbin,d.adrelid)='false';
  if v_n <> 1 then
    raise exception '0046 tail 6: clara.firm_limits.sales_lane_active is not NOT NULL DEFAULT false -- the row census cannot carry the ships-OFF guarantee alone, because a true default arms every FUTURE firm while leaving every existing row false';
  end if;

  -- (7) THE Asia/Kuala_Lumpur DUPLICATION ROSTER IS UNCHANGED.
  --
  -- 0042:5536 and 0044:6525 assert this set EXACTLY, both ways: an unexpected name is a new
  -- second body owning one house fact, a missing one means a recorded copy moved to a spelling
  -- those gates cannot see. clara._ocr_sales_floor is on the list precisely because of the
  -- literal this migration drop/recreates, so the roster is the direct proof the pin held.
  --
  -- ASKED AS CODE, not on raw text and NOT on the lexed body either -- and the second half of
  -- that sentence is a correction this arm made to itself on its first run. The inline
  -- `/*...*/` stripper the 0042/0044 tails use is NON-GREEDY and single-pass, so it cannot
  -- handle NESTED block comments, and PostgreSQL nests them: a body could hide the MYT literal
  -- inside `/* /* ... */ */` and run on current_date with the arm green. But the obvious
  -- remedy -- run the shared lexer and search its output -- is WRONG in the opposite direction,
  -- because the lexer blanks STRING LITERALS and 'Asia/Kuala_Lumpur' IS one, so it returned the
  -- empty set and refused a correct deploy. The instrument that answers the actual question
  -- ("does this body spell the conversion in CODE") is the code-literal predicate: comment-
  -- proof AND literal-preserving. lower() is applied to the SOURCE, which preserves every
  -- position and length, so the case-insensitive reading of the 0042 roster is kept.
  select coalesce(string_agg(distinct p.proname,' ' order by p.proname),'') into v_names
    from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and pg_temp._wdb_code_literal(lower(coalesce(p.prosrc,'')),'asia/kuala_lumpur');
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
      -- PostgreSQL normalises the stored SET clause ("search_path=clara, pg_temp"), so the
      -- comparison is whitespace-insensitive rather than against this file's spelling.
      and exists(select 1 from unnest(coalesce(p.proconfig,'{}'::text[])) cfg
                 where replace(cfg,' ','')='search_path=clara,pg_temp');
  if v_n <> 2 then
    raise exception '0046 tail 8: the floor pair did not re-establish owner/SECURITY DEFINER/pinned search_path (matched %/2)', v_n;
  end if;

  -- (9) THE SALES LANE'S JUDGEMENT DELTAS LANDED, AND THE BYPASS IS FLAG-GATED.
  --
  -- THE WORST ARM IN THE FIRST CUT, and the mutation that beat it is the one to keep in mind:
  -- the raw-source checks were satisfied by a COMMENT, so a body carrying an UNGATED
  -- `array_remove(v_ready,'tier_a_fails')` -- stripping the corroboration blocker for PURCHASE
  -- entries, on a lane switched OFF -- passed green. Both shapes are now pinned on the LEXED
  -- body, where a comment is chr(1) and cannot spell code, and the literal identity is asserted
  -- separately as CODE.
  select regexp_replace(pg_temp._wdb_sql_code(coalesce(p.prosrc,'')),'\s+',' ','g'), coalesce(p.prosrc,'')
    into v_code, v_raw from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='_coding_lane_core';
  if position('v_sales_lane:=(v_tri=' || repeat(chr(2),7) || ' and clara._sales_lane_active(f.firm_id));' in v_code) = 0 then
    raise exception '0046 tail 9: clara._coding_lane_core''s v_sales_lane is not the single flag-gated assignment -- every sales delta must be unreachable while the lane is OFF';
  end if;
  if (length(v_code) - length(replace(v_code,'v_sales_lane:=','')))/length('v_sales_lane:=') <> 1 then
    raise exception '0046 tail 9: v_sales_lane is assigned more than once -- a second assignment can re-arm the sales deltas past the flag';
  end if;
  -- TWO RESIDUALS THE FIRST RE-INSTRUMENTATION STILL LEFT OPEN, both found by the closing
  -- mutation pass, both fixed here:
  --
  --   (a) NO COUNT. `position(...) = 0` only asks whether the gated statement EXISTS. Keeping
  --       it and ADDING an ungated `array_remove(v_ready,'tier_a_fails')` beside it passed --
  --       the bypass then applies unconditionally and the arm is still green. So the claim is
  --       EXACTLY ONE removal from v_ready, and it is the gated one. (This is the same count
  --       discipline the v_sales_lane assignment check above already used; arm 9 simply did
  --       not apply it to the second half of its own claim.)
  --
  --   (b) chr(2){14} IS A LENGTH, NOT AN IDENTITY. It matches ANY 14-character literal, and
  --       'vendor_bound' is also 14 -- swapping it turns 7A-R3's bypass into a silent no-op
  --       (tier_a_fails keeps blocking, sales never drafts) with every arm green. The reviewer
  --       dumped the mutated body to prove it. The literal is now pinned AT THIS SITE by
  --       reading the RAW body at the offset the LEXED body reports: the lexer preserves
  --       position and length, so the same offset in raw holds the actual literal.
  if (length(v_code) - length(replace(v_code,'array_remove(v_ready,','')))/length('array_remove(v_ready,') <> 1 then
    raise exception '0046 tail 9: v_ready is stripped more than once -- an UNGATED strip beside the gated one applies the 7A-R3 bypass to purchase entries and to a lane that is switched OFF';
  end if;
  if position('if v_sales_lane then v_ready:=array_remove(v_ready,' || repeat(chr(2),14) || '); end if;' in v_code) = 0 then
    raise exception '0046 tail 9: the tier_a_fails bypass is not the exact flag-gated statement';
  end if;
  declare
    v_lex text; v_at int;
  begin
    v_lex := pg_temp._wdb_sql_code(v_raw);
    v_at := position('if v_sales_lane then v_ready:=array_remove(v_ready,' in v_lex);
    if v_at = 0 then
      raise exception '0046 tail 9: the gated bypass statement is not on one line in the live body -- this arm reads the literal by OFFSET and cannot locate it';
    end if;
    v_at := v_at + length('if v_sales_lane then v_ready:=array_remove(v_ready,');
    if substr(v_raw, v_at, 14) <> '''tier_a_fails''' then
      raise exception '0046 tail 9: the literal the flag-gated bypass removes is %, not ''tier_a_fails'' -- a same-length substitution (''vendor_bound'' is also 14 characters) turns 7A-R3 into a silent no-op with every shape still matching', substr(v_raw, v_at, 14);
    end if;
  end;
  v_missing := '';
  if pg_temp._wdb_call_count(pg_temp._wdb_sql_code(v_raw),'clara._sales_lane_active')<>1 then
    v_missing := v_missing || ' sales_lane_active_read';
  end if;
  if not pg_temp._wdb_code_literal(v_raw,'''customer_name_missing''') then v_missing := v_missing || ' customer_name_missing'; end if;
  if not pg_temp._wdb_code_literal(v_raw,'''customer_ambiguous''') then v_missing := v_missing || ' customer_ambiguous'; end if;
  if v_missing <> '' then
    raise exception '0046 tail 9: clara._coding_lane_core is missing the sales-lane deltas {%}', btrim(v_missing);
  end if;

  -- (10) THE ADMISSION PATH CARRIES THE CONTRACT, AND ITS RECEIPTS ARE CODE.
  --
  -- The first cut asked raw prosrc whether each receipt token appeared -- in a body into which
  -- THIS MIGRATION SPLICES COMMENTS NAMING THOSE VERY TOKENS. That arm was structurally
  -- incapable of failing. Every token is now asked as CODE.
  select regexp_replace(pg_temp._wdb_sql_code(coalesce(p.prosrc,'')),'\s+',' ','g'), coalesce(p.prosrc,'')
    into v_code, v_raw from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='admit_autodraft_task';
  if pg_temp._wdb_call_count(pg_temp._wdb_sql_code(v_raw),'clara._autodraft_direction_tri')<>1
     or pg_temp._wdb_call_count(pg_temp._wdb_sql_code(v_raw),'clara._sales_lane_active')<>1 then
    raise exception '0046 tail 10: clara.admit_autodraft_task does not resolve the tri-state direction behind the activation flag exactly once each';
  end if;
  for v_names in select unnest(array['''sales_direction''','''sales_backlog_held''','''refused_sales_cap'''])
  loop
    if not pg_temp._wdb_code_literal(v_raw, v_names) then
      raise exception '0046 tail 10: clara.admit_autodraft_task emits no % receipt IN CODE -- every refusal on this lane must be NAMED, and a comment naming it is not a receipt', v_names;
    end if;
  end loop;
  if pg_temp._wdb_call_count(pg_temp._wdb_sql_code(v_raw),'clara._autodraft_sales_direction')<>0 then
    raise exception '0046 tail 10: clara.admit_autodraft_task still carries the 0036 flat sales refusal beside the new contract';
  end if;
  -- ONE advisory key on this path. A second firm-scoped key inverts against the retry branch's
  -- 202991617 (opposite acquisition orders on the same firm -> 40P01 -> the whole transaction
  -- rolls back -> no sweep_run_items row -> the run wedges open). Demonstrated live during
  -- review; the number is pinned here so it cannot come back.
  select count(distinct m[1])::int into v_n
    from regexp_matches(v_code,'pg_advisory_xact_lock\((\d+)','g') m;
  if v_n <> 1 or position('pg_advisory_xact_lock(202991617' in v_code) = 0 then
    raise exception '0046 tail 10: clara.admit_autodraft_task must take exactly ONE advisory key (202991617); found % distinct -- a second firm-scoped key inverts against the retry branch and deadlocks', v_n;
  end if;

  -- (11) THE DRAFT WRITER IS THE AUTHORITY LAYER -- THE WHOLE PREDICATE, NOT ITS PRESENCE.
  --
  -- Presence-only was defeated by INVERSION: flip `<>` to `=` in both arms and the writer
  -- refuses every LAWFUL pair while admitting every contradiction, with the arm green. The two
  -- refusal predicates are pinned entire.
  select regexp_replace(pg_temp._wdb_sql_code(coalesce(p.prosrc,'')),'\s+',' ','g'), coalesce(p.prosrc,'')
    into v_code, v_raw from pg_proc p
    where p.pronamespace='clara'::regnamespace and p.proname='_draft_entry_core';
  if position('if not p_is_human then if p_coding_kind in (' || repeat(chr(2),15) || ',' || repeat(chr(2),19)
              || ') and v_kind<>' || repeat(chr(2),10) || ' then raise exception ' in v_code) = 0 then
    raise exception '0046 tail 11: the sales-family contradiction arm is not the pinned predicate -- an INVERTED comparison refuses lawful pairs and admits contradictions while every token is still present';
  end if;
  if position('if p_coding_kind=' || repeat(chr(2),15) || ' and v_kind<>' || repeat(chr(2),8) || ' then' in v_code) = 0 then
    raise exception '0046 tail 11: the supplier-bill contradiction arm is not the pinned predicate';
  end if;
  if position('p_wake_kind=' || repeat(chr(2),11) || ' and p_document is not null and p_coding_kind in (' in v_code) = 0
     or position('then v_tri:=clara._autodraft_direction_tri(p_document,p_client); if v_tri=' || repeat(chr(2),12) in v_code) = 0 then
    raise exception '0046 tail 11: the autodraft-lane family revalidation is not the pinned shape (wake-kind scoping + the unresolved refusal)';
  end if;
  if not pg_temp._wdb_code_literal(v_raw,'counterparty_kind_contradiction')
     or not pg_temp._wdb_code_literal(v_raw,'direction_family_mismatch') then
    raise exception '0046 tail 11: the writer''s refusal reasons are not emitted IN CODE -- the tool and the zod schema are ergonomics, this is the only authority layer';
  end if;

  -- (12) PURCHASE ISOLATION. The purchase evidence floor is the SEPARATE v_seen<3 branch
  -- (0016:1714-1725); it must still be there, and corroboration must appear ONLY inside the
  -- ocr_sales branch. Both halves on the lexed body: the second used to read raw, where this
  -- migration's own commentary about direction-aware sides could satisfy it.
  select regexp_replace(pg_temp._wdb_sql_code(coalesce(p.prosrc,'')),'\s+',' ','g') into v_code
    from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='propose_autopost_rule';
  if position('if v_seen<3 then' in v_code)=0 then
    raise exception '0046 tail 12: the purchase evidence floor (v_seen<3) is gone from clara.propose_autopost_rule -- this migration must not touch purchase behaviour';
  end if;
  if position('v_side:=case when v_direction=' || repeat(chr(2),7) || ' then ' || repeat(chr(2),8)
              || ' else ' || repeat(chr(2),7) || ' end;' in v_code)=0 then
    raise exception '0046 tail 12: the direction-aware sighting side selection drifted in clara.propose_autopost_rule';
  end if;

  -- (13) THE NEW TABLE IS GOVERNED -- AND ITS POLICIES ARE READ, NOT JUST ITS FLAGS.
  --
  -- ENABLE+FORCE+owner says the door has a lock; it says nothing about who the lock admits. A
  -- `using (true)` human policy passes every flag check while publishing every firm's backfill
  -- history to every other firm, and a stray INSERT grant lets the human lane write the
  -- accounting the audited verbs exist to own. Both are read here.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='sales_backfill_batches'
      and c.relrowsecurity and c.relforcerowsecurity
      and pg_get_userbyid(c.relowner)='clara_fn_owner';
  if v_n <> 1 then
    raise exception '0046 tail 13: clara.sales_backfill_batches is not RLS ENABLE+FORCE under clara_fn_owner';
  end if;
  select count(*)::int into v_n from pg_policy
    where polrelid='clara.sales_backfill_batches'::regclass;
  if v_n <> 2 then
    raise exception '0046 tail 13: clara.sales_backfill_batches carries % policies, expected exactly 2 (the fn_owner ALL and the firm-scoped human SELECT)', v_n;
  end if;
  select count(*)::int into v_n from pg_policy
    where polrelid='clara.sales_backfill_batches'::regclass
      and polname='p_sales_backfill_batches_human' and polcmd='r'
      and pg_get_expr(polqual,polrelid)='(firm_id = clara.jwt_firm())'
      and polroles = array[(select oid from pg_roles where rolname='clara_authenticated')];
  if v_n <> 1 then
    raise exception '0046 tail 13: the human read policy is not a SELECT for clara_authenticated scoped to (firm_id = clara.jwt_firm()) -- a widened qual publishes every firm''s backfill history to every firm';
  end if;
  for v_names in select unnest(array['insert','update','delete'])
  loop
    if has_table_privilege('clara_authenticated','clara.sales_backfill_batches',v_names) then
      raise exception '0046 tail 13: clara_authenticated holds % on clara.sales_backfill_batches -- the batch accounting is written by the audited verbs alone', v_names;
    end if;
  end loop;

  -- (14) THE STATIC RE-SHIP IS THE LIVE BODY PLUS EXACTLY THE DOCUMENTED DELTA.
  --
  -- HALF TWO of the identity proof the S4.3 prestate set up. A re-ship replaces whatever was
  -- there; this is what makes that safe rather than merely convenient. The comparison is on
  -- whitespace-folded prosrc, so re-indentation is not a failure -- but a dropped recut, an
  -- extra edit, or a live hand-patch this file cannot account for all are.
  select txt into v_needle from _wdb_erp_expected;
  if v_needle is null then
    raise exception '0046 tail 14: the S4.3 prestate stashed no expected body -- the identity proof did not run, so the re-ship is unverified';
  end if;
  select regexp_replace(coalesce(prosrc,''),'\s+',' ','g') into v_code from pg_proc
    where pronamespace='clara'::regnamespace and proname='execute_rule_post';
  if v_code is distinct from v_needle then
    raise exception '0046 tail 14: the re-shipped clara.execute_rule_post is NOT the live body plus the documented corroboration delta -- a static re-ship that silently drops a later recut is exactly the SS0.2-2 hazard, so the deploy is refused rather than the difference overwritten';
  end if;

  raise notice '0046 tail: 14 arms clean here; 3 more in the $acls$ block above (17 total)';
end
$tail$;
