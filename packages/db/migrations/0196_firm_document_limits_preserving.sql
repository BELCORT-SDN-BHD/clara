-- 0196_firm_document_limits_preserving — #692: THE FIRM DOCUMENT-LIMITS UPSERT STOPS REWRITING
-- THE COLUMNS THE WRITER DID NOT NAME.
-- =====================================================================================
-- Spec of record: issue #692 (filed out of #618's operation census, part of the #612 follow-ups).
-- Its Agent Brief is the contract: "An append-only migration recuts the trigger to be
-- column-preserving: every limit column, the fourth included, is `coalesce(new.<col>, old.<col>)`,
-- and an upsert that names one column leaves the others as they were."
--
-- WHAT THIS FILE CHANGES, IN TWO SENTENCES. `clara._tf_firm_document_limits_upsert()` — created
-- ONCE, in 0007_document_pipeline.sql:545, attached at :556, and never recut since — is replaced
-- with a column-PRESERVING body, and the four limit columns' table DEFAULTS are dropped so that an
-- OMITTED column reaches that body as NULL and is therefore preserved (the body supplies the same
-- four values on a first insert, so a fresh row is unchanged). Nothing else moves: no relation, no
-- column added, dropped or retyped, no CHECK, no NOT NULL, no policy, no trigger attachment, no
-- table ACL, no function ACL, no row.
--
-- =====================================================================================
-- WHAT WAS WRONG. The 0007 body answers every INSERT against an existing firm row with
--
--     update clara.firm_document_limits set docs_per_day=new.docs_per_day,
--       pages_per_day=new.pages_per_day,ocr_concurrency=new.ocr_concurrency,
--       updated_at=now(),updated_by=new.updated_by where firm_id=new.firm_id;
--     if found then return null; end if;
--
-- — a HARDCODED column list. Two defects follow, and 0090_f_a1_walls.sql recorded the first in its
-- own section header without fixing it:
--
--   1. AN UPSERT THAT MEANS TO MOVE ONE LIMIT MOVES ALL OF THEM. A caller that names only
--      `pages_per_day` hands the trigger a NEW row whose other limits are the TABLE DEFAULTS
--      (100 / 1000 / 2), and the trigger writes those defaults over whatever the operator had set.
--   2. 0090:298 ADDED A FOURTH LIMIT COLUMN, `llm_witness_concurrency`, and the trigger's UPDATE
--      never carried it. So the one column that IS routinely written by hand (the LLM-witness cap)
--      was the one column an upsert silently LEFT BEHIND — the rewrite and the omission are the
--      same bug seen from its two ends.
--
-- WHY IT IS A LATENT PATH AND NOT A LIVE ONE, AND WHY IT IS FIXED ANYWAY. #618's census found NO
-- public `clara.*` writer for this table: `clara.firm_document_limits` grants SELECT to
-- clara_authenticated and NOTHING else to any application role, and the only routine in the whole
-- schema that writes it is this trigger, which is EXECUTE-granted to nobody. Nothing at the
-- operation boundary reaches the body today, so the behaviour is UNREACHABLE rather than broken —
-- and that is exactly why it is worth a file of its own: the census cannot warn about a trigger
-- that sits below the boundary it audits, so the first per-firm override surface (#635 does not
-- name document limits yet) would meet the data loss with nothing between it and the operator's
-- settings. packages/db/README.md's census section now links #692 as the guard that writer reads
-- first.
--
-- =====================================================================================
-- THE CONTRACT THE NEW BODY PUBLISHES, AND THE ONE THING A FUTURE WRITER MUST NOT MISREAD.
--
-- NULL MEANS "LEAVE THIS COLUMN ALONE". One rule, applied to every writable column of the row:
-- each limit and `updated_by` is `coalesce(new.<col>, old.<col>)`.
--
-- AND AN OMITTED COLUMN IS A NULL, BECAUSE THIS FILE MOVES THE FOUR DEFAULTS OFF THE TABLE AND
-- INTO THE TRIGGER. That relocation is the half without which the rule above is a trap. Postgres
-- fills an UNNAMED column of an INSERT with its table DEFAULT before any BEFORE-ROW trigger sees
-- the row, and a default is a VALUE: a row trigger has no "was this column supplied" flag to read.
-- So while `docs_per_day` / `pages_per_day` / `ocr_concurrency` carried DEFAULT 100 / 1000 / 2 and
-- `llm_witness_concurrency` carried DEFAULT 2, `coalesce` could not tell "I did not mention
-- pages_per_day" from "I want pages_per_day to be 1000", and the NAIVE writer — the one #692 was
-- filed about —
--
--     insert into clara.firm_document_limits (firm_id, pages_per_day) values (:firm, 13);
--
-- would still have reset the other three. §1a therefore DROPS those four column defaults and §1b's
-- body supplies the SAME four values (100 / 1000 / 2 / 2) on the FIRST insert for a firm, when the
-- column arrives NULL. After this file the statement above preserves the other three, and so does
-- the explicit-NULL spelling; both are cells.
--
-- WHAT THE RELOCATION COSTS, stated so it is a decision and not a side effect:
--   · THE THREE NOT NULL COLUMNS NOW DEPEND ON THE TRIGGER for their first-insert value. That is
--     not a weakening of the constraint — the constraint still refuses a NULL at the heap — it
--     moves WHO supplies the value. A hand that disables t_firm_document_limits_upsert and inserts
--     a bare (firm_id) now gets 23502 where it used to get a row of defaults. The trigger is the
--     door; there is no other writer (no application role holds INSERT on the table at all).
--   · `llm_witness_concurrency` IS NULLABLE, so "explicit NULL on a FIRST insert" used to store
--     NULL and now stores 2. Behaviourally identical to every reader in the estate: 0090's own
--     consumer spells `coalesce(l.llm_witness_concurrency, 2)` (0090:435), which is where the 2
--     came from in the first place.
--   · A pg_dump/restore is unaffected: the dump carries values, not defaults, and COPY fires this
--     trigger on rows that already have all four.
-- The four defaults are pinned as LITERALS in §0 (measured BEFORE the drop) and re-read as NULL in
-- §2, so the relocation is proven in both directions inside this one file.
--
-- `updated_by` FOLLOWS THE SAME RULE, AND THAT COSTS SOMETHING WORTH NAMING. Coalescing it keeps
-- the door to ONE rule rather than a rule with an exception, and it is what makes an all-NULL
-- upsert a true no-op. The cost: a writer that moves a limit without naming itself leaves the
-- PREVIOUS actor beside a FRESH `updated_at`. A writer that changes a limit must name itself; the
-- function's own comment says so, and a cell pins the behaviour.
--
-- `updated_at` IS THE WRITE STAMP, SO A NON-WRITE DOES NOT MOVE IT. When every coalesced value is
-- already the row's own value, the body issues NO update at all and the row — `updated_at`
-- included — is untouched. The 0007 body stamped `now()` for an upsert that changed nothing, which
-- is a lie the moment anybody reads the column to ask when the limits last moved.
--
-- FIRST INSERT KEEPS ITS OBSERVABLE RESULT. No row for the firm: the trigger fills each limit the
-- caller left NULL with the value the table default used to supply, stamps `updated_at` and returns
-- NEW — a bare `insert (firm_id)` still lands 100 / 1000 / 2 / 2, exactly as 0007 landed it. The
-- first-insert race is also unchanged: two concurrent inserts for a firm that has no row both
-- return NEW and one loses on the primary key, as before. This file narrows a write; it opens no
-- new one.
--
-- =====================================================================================
-- EVERY CONTRACT THAT ASSERTS THOSE FOUR DEFAULTS, CHECKED BEFORE DROPPING THEM. Measured with
-- `grep -rn 'column_default' packages/db/tests packages/db/scripts` and `grep -rn
-- 'docs_per_day|pages_per_day|ocr_concurrency|llm_witness_concurrency' packages/db`:
--   · 0090:2001 asserts `llm_witness_concurrency` is NULLABLE, never its DEFAULT — and it is a
--     migration tail that runs BEFORE this file on every chain regardless.
--   · 0095:161 asserts the column EXISTS. Untouched.
--   · tests/f-a9-pr-1b.test.mjs §3.4 (:456-459) asserts the seven column NAMES. Untouched.
--   · tests/rig-docs-metering.test.mjs C-26 (d) and tests/rig-docs-isolation-grants.test.mjs go
--     through `setDocLimits`, which NAMES docs/pages/ocr on every call — their expected VALUES are
--     effective values of a live row, which this file preserves exactly.
--   · tests/wave-a-upgrade.test.mjs's `columns` signature compares fresh-chain against
--     upgrade-chain; both run this file, so both sides lose the same four defaults.
--   · tests/rig-runtime-helpers.mjs's `adaptiveInsert` stubs NOT NULL columns that have no
--     default — reached for this table only by `setDocLimits`, which supplies all three first.
-- NO assertion anywhere pins `column_default` for this table, so no test is edited by this file.
--
-- D1 WRITE-QUIESCE (packages/db/README.md, "Migration and deployment behavior"). THIS FILE
-- REPLACES A LIVE BODY AND TAKES ACCESS EXCLUSIVE ON THE RELATION for the four
-- `alter column ... drop default` statements (a catalog-only change: no rewrite, no scan).
-- `clara._tf_firm_document_limits_upsert()` is attached and armed on
-- clara.firm_document_limits, so an INSERT already executing when this migration commits can
-- finish on the PREVIOUS body and rewrite the columns it did not name. Stop new writes to
-- clara.firm_document_limits, drain in flight calls, apply, resume — the estate's standard
-- function-body replacement window, named in the PR body. The window is SMALL in practice and
-- stated anyway: the only writers are owner-level hands (the operator ceremony and the db rig's own
-- root fixture), because no application role holds INSERT/UPDATE/DELETE on the table at all.
--
-- D2 RE-WITNESS: DOES NOT APPLY, and it is measured rather than assumed. `clara.control_witnesses`
-- (0154:856) is the registry whose standing obligation is that any migration replacing a WITNESSED
-- body must carry the reviewed `prosrc_sha` in the same file. Confirmed two ways before this file
-- was written: `grep -rn control_witnesses packages/db/migrations` returns only 0154 (which ships
-- the table EMPTY and asserts so at :3961) and 0157 (a comment), so NO migration mints a row at
-- all; and §0 below re-reads the LIVE table and refuses to apply if any row names this function.
--
-- NO TABLE GRANT OR REVOKE IS ISSUED. clara.firm_document_limits carries a real relacl
-- ({clara_fn_owner=arwdDxtm/clara_fn_owner,clara_authenticated=r/clara_fn_owner}); §0 pins it and
-- §2 re-reads it, so this file's DR round-trip is grant-identical.
-- =====================================================================================

set local statement_timeout = '5min';
set local lock_timeout = '5s';

-- =====================================================================================
-- 0. PRESTATE. Every premise this file rests on, measured before the replacement.
-- =====================================================================================
create temp table _d692_prestate (k text primary key, v text not null) on commit drop;

do $pre$
declare
  v_sig constant text := 'clara._tf_firm_document_limits_upsert()';
  -- MEASURED, then PINNED AS A LITERAL. Read from a clara_test rebuilt from the 0194 frontier on
  -- 2026-09-14, before this file existed:
  --   select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p
  --     where p.oid='clara._tf_firm_document_limits_upsert()'::regprocedure;
  -- A literal, not a self-measurement: a prestate that pins whatever it finds proves only that the
  -- value did not change WHILE THIS FILE RAN. This one refuses to apply onto a chain where the body
  -- is not the 0007 one #692 measured and decided to replace.
  c_0007_sha  constant text := '718eaecd379088396fb7c46783380a81b49404e4793054069d2e9338a27b79be';
  c_proacl    constant text := '{clara_fn_owner=X/clara_fn_owner}';
  c_relacl    constant text := '{clara_fn_owner=arwdDxtm/clara_fn_owner,clara_authenticated=r/clara_fn_owner}';
  v_sha text; v_acl text; v_missing text; v_n int; v_names text;
begin
  -- (a) THE RELATION AND ITS FOUR LIMIT COLUMNS, at the exact nullability and default the new body
  --     reasons about. The header's whole "an omitted column arrives as its DEFAULT" argument is
  --     false on a chain where these differ, so it is a premise and not a remark.
  if to_regclass('clara.firm_document_limits') is null then
    raise exception '#692 prestate: clara.firm_document_limits is absent -- 0007 must apply first'
      using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(x, ', ' order by x), '(none)') into v_missing
    from unnest(array[
      'docs_per_day|integer|NO|100', 'pages_per_day|integer|NO|1000',
      'ocr_concurrency|integer|NO|2', 'llm_witness_concurrency|integer|YES|2',
      'updated_at|timestamp with time zone|NO|now()', 'updated_by|uuid|YES|',
      'firm_id|uuid|NO|']) x
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'clara' and c.table_name = 'firm_document_limits'
        and c.column_name = split_part(x, '|', 1)
        and c.data_type   = split_part(x, '|', 2)
        and c.is_nullable = split_part(x, '|', 3)
        and coalesce(c.column_default, '') = split_part(x, '|', 4));
  if v_missing <> '(none)' then
    raise exception '#692 prestate: firm_document_limits column(s) not at their pinned type/nullability/default: %', v_missing
      using errcode = 'CLR10';
  end if;
  -- …and NOTHING ELSE is on the row. A fifth limit column added since #692 was written would be a
  -- column this body does not carry, which is the DEFECT this file exists to remove.
  select count(*)::int into v_n from information_schema.columns
   where table_schema = 'clara' and table_name = 'firm_document_limits';
  if v_n <> 7 then
    raise exception '#692 prestate: firm_document_limits has % columns (pinned 7) -- a column this recut does not carry would reopen the omission #692 closes', v_n
      using errcode = 'CLR10';
  end if;

  -- (b) THE BODY BEING REPLACED IS 0007'S, BY IDENTITY. Never by name, never by a migration row.
  if to_regprocedure(v_sig) is null then
    raise exception '#692 prestate: % does not resolve by its exact signature', v_sig using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_sha is distinct from c_0007_sha then
    raise exception '#692 prestate: % prosrc is % (pinned %) -- #692 recuts THAT body and no other', v_sig, v_sha, c_0007_sha
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_tf_firm_document_limits_upsert';
  if v_n <> 1 then
    raise exception '#692 prestate: _tf_firm_document_limits_upsert has % overloads (want exactly 1)', v_n
      using errcode = 'CLR10';
  end if;

  -- (c) ITS IDENTITY AND ITS ACL, pinned so §2 can prove the replacement moved neither. CREATE OR
  --     REPLACE preserves both; a file that changed them by accident would be changing the reach of
  --     a body no application role is supposed to reach at all.
  select coalesce(p.proacl::text, 'NULL') into v_acl from pg_proc p where p.oid = v_sig::regprocedure;
  if v_acl <> c_proacl then
    raise exception '#692 prestate: % EXECUTE acl is % (pinned %)', v_sig, v_acl, c_proacl using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_sig::regprocedure
                   and p.prosecdef and p.proowner = 'clara_fn_owner'::regrole and p.provolatile = 'v'
                   and 'search_path=clara, pg_temp' = any (coalesce(p.proconfig, '{}'::text[]))) then
    raise exception '#692 prestate: % is not a VOLATILE clara_fn_owner-owned SECURITY DEFINER with search_path pinned', v_sig
      using errcode = 'CLR10';
  end if;

  -- (d) THE TABLE ACL. This file issues no grant and no revoke; the tail compares against this.
  select coalesce(c.relacl::text, 'NULL') into v_acl from pg_class c
   where c.oid = 'clara.firm_document_limits'::regclass;
  if v_acl <> c_relacl then
    raise exception '#692 prestate: firm_document_limits relacl is % (pinned %)', v_acl, c_relacl using errcode = 'CLR10';
  end if;

  -- (e) THE FOUR TRIGGERS ON THE RELATION, by name. The recut must leave every attachment where it
  --     is -- including the two that run BEFORE this one on the same INSERT (stamp fires first by
  --     name order and sets firm_id) and the BEFORE UPDATE firm_id wall the new body's own UPDATE
  --     passes through.
  select coalesce(string_agg(t.tgname, ',' order by t.tgname), '(none)') into v_names
    from pg_trigger t where t.tgrelid = 'clara.firm_document_limits'::regclass and not t.tgisinternal;
  if v_names <> 't_firm_document_limits_firm_immutable,t_firm_document_limits_no_truncate,t_firm_document_limits_stamp,t_firm_document_limits_upsert' then
    raise exception '#692 prestate: firm_document_limits carries triggers % (pinned the 0007 four)', v_names
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_trigger t where t.tgrelid = 'clara.firm_document_limits'::regclass
      and t.tgname = 't_firm_document_limits_upsert' and not t.tgisinternal
      and t.tgfoid = v_sig::regprocedure and t.tgtype = 7 and t.tgenabled = 'O') then
    raise exception '#692 prestate: t_firm_document_limits_upsert is not an ENABLED BEFORE INSERT FOR EACH ROW trigger on this function'
      using errcode = 'CLR10';
  end if;

  -- (f) D2: NO CONTROL WITNESS NAMES THIS BODY, read from the LIVE registry. If one ever does, this
  --     file must carry the reviewed sha and this check is the thing that says so out loud.
  if to_regclass('clara.control_witnesses') is not null then
    select count(*)::int into v_n from clara.control_witnesses w
     where w.proc = v_sig or w.proc like '%\_tf\_firm\_document\_limits\_upsert%';
    if v_n <> 0 then
      raise exception '#692 prestate: % control witness row(s) name this function -- the recut owes a re-witnessed prosrc_sha in THIS file', v_n
        using errcode = 'CLR10';
    end if;
  end if;

  -- (g) THE TAIL CENSUS'S OWN CONTROL. §2 strips `--` comment tails literal-awarely and proves the
  --     scanner did not cut inside a string literal, against the estate's known line
  --     (`'client is not active -- no posting'`). It must be there to be a control.
  if to_regprocedure('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)') is null then
    raise exception '#692 prestate: the census control body clara._record_journal_entry_core does not resolve'
      using errcode = 'CLR10';
  end if;

  insert into _d692_prestate(k, v) values
    ('sha_0007', v_sha), ('proacl', c_proacl), ('relacl', c_relacl),
    ('rows', (select count(*)::text from clara.firm_document_limits));

  raise notice '#692 prestate: clean -- clara.firm_document_limits carries exactly its 7 pinned columns, the four limit columns at their pinned nullability and at the table defaults 100/1000/2/2 that §1a is about to DROP and §1b is about to supply from the trigger instead, with relacl %, clara._tf_firm_document_limits_upsert() resolves at exactly one arity, is byte-identical to 0007''s pinned prosrc sha (%) and is a VOLATILE clara_fn_owner-owned SECURITY DEFINER with search_path pinned and EXECUTE held by its owner alone, all four 0007 triggers are attached with t_firm_document_limits_upsert ENABLED as BEFORE INSERT FOR EACH ROW on this very function, NO control witness names it, and the census control body is present; % limit row(s) on this database.',
    c_relacl, left(c_0007_sha, 12), (select v from _d692_prestate where k = 'rows');
end $pre$;

set role clara_fn_owner;

-- =====================================================================================
-- 1a. THE FOUR DEFAULTS LEAVE THE TABLE so that an OMITTED column reaches the trigger as NULL and
--     is preserved. §1b supplies the same four values on a first insert, so a fresh row is
--     unchanged. Catalog-only: `drop default` rewrites nothing and scans nothing, and NOT NULL,
--     the CHECKs and the column types are untouched — §2 re-reads all of them.
-- =====================================================================================
alter table clara.firm_document_limits alter column docs_per_day            drop default;
alter table clara.firm_document_limits alter column pages_per_day           drop default;
alter table clara.firm_document_limits alter column ocr_concurrency         drop default;
alter table clara.firm_document_limits alter column llm_witness_concurrency drop default;

-- =====================================================================================
-- 1b. THE COLUMN-PRESERVING RECUT. Same name, same arity, same owner, same ACL, same attachment;
--     a different body. Read the header before changing it: NULL means "leave this column alone"
--     (an omitted column now arrives NULL, which is why §1a exists), the body is the only thing
--     that supplies a first insert's defaults, and a writer that moves a limit must name itself or
--     the row keeps the previous actor.
-- =====================================================================================
create or replace function clara._tf_firm_document_limits_upsert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_old clara.firm_document_limits%rowtype;
begin
  -- The existing row, LOCKED, in the one read the decision is made from. FOR UPDATE takes the same
  -- row lock 0007's bare UPDATE took, so two concurrent upserts of the same firm still serialize.
  select * into v_old from clara.firm_document_limits where firm_id = new.firm_id for update;

  -- FIRST INSERT: there is nothing to preserve, so the four values §1a took off the table are
  -- supplied HERE instead. A bare insert (firm_id) still lands 100 / 1000 / 2 / 2, which is what
  -- the column defaults landed before this file; the difference is that an omitted column now
  -- reaches this body as NULL, which is what makes the preserving arm below reachable at all.
  if not found then
    new.docs_per_day            := coalesce(new.docs_per_day, 100);
    new.pages_per_day           := coalesce(new.pages_per_day, 1000);
    new.ocr_concurrency         := coalesce(new.ocr_concurrency, 2);
    new.llm_witness_concurrency := coalesce(new.llm_witness_concurrency, 2);
    new.updated_at := now();
    return new;
  end if;

  -- THE ONE RULE, over every writable column of the row. A limit the caller did not set is the
  -- limit the firm already had; #692's whole point is that the three columns a one-column upsert
  -- says nothing about -- llm_witness_concurrency, which 0007 never carried at all, included --
  -- are not collateral.
  new.docs_per_day            := coalesce(new.docs_per_day, v_old.docs_per_day);
  new.pages_per_day           := coalesce(new.pages_per_day, v_old.pages_per_day);
  new.ocr_concurrency         := coalesce(new.ocr_concurrency, v_old.ocr_concurrency);
  new.llm_witness_concurrency := coalesce(new.llm_witness_concurrency, v_old.llm_witness_concurrency);
  new.updated_by              := coalesce(new.updated_by, v_old.updated_by);

  -- A NON-WRITE DOES NOT MOVE THE WRITE STAMP. Everything the caller asked for is already true, so
  -- there is nothing to record; updated_at keeps the time the limits actually last moved.
  if (new.docs_per_day, new.pages_per_day, new.ocr_concurrency, new.llm_witness_concurrency,
      new.updated_by)
     is not distinct from
     (v_old.docs_per_day, v_old.pages_per_day, v_old.ocr_concurrency, v_old.llm_witness_concurrency,
      v_old.updated_by) then
    return null;
  end if;

  update clara.firm_document_limits set
      docs_per_day            = new.docs_per_day,
      pages_per_day           = new.pages_per_day,
      ocr_concurrency         = new.ocr_concurrency,
      llm_witness_concurrency = new.llm_witness_concurrency,
      updated_by              = new.updated_by,
      updated_at              = now()
    where firm_id = new.firm_id;
  return null;
end $fn$;

comment on function clara._tf_firm_document_limits_upsert() is
  '#692 (recut of 0007:545, which rewrote every limit column from NEW and never carried 0090''s '
  'llm_witness_concurrency at all). BEFORE INSERT pseudo-upsert on clara.firm_document_limits: an '
  'INSERT against a firm that already has a row is turned into an UPDATE and swallowed. '
  'THE RULE IS NULL MEANS "LEAVE THIS COLUMN ALONE" -- all four limit columns and updated_by are '
  'coalesce(new, old) -- so an upsert that names one limit leaves the other three exactly as they '
  'were, whether the caller OMITS them or sends them as an explicit NULL. Omission works because '
  '0196 also DROPPED the four limit columns'' table defaults: an unnamed column would otherwise be '
  'filled with its default before this trigger ran, and a default is a value this body cannot tell '
  'from a deliberate one. THIS FUNCTION IS THEREFORE THE ONLY SOURCE OF A FIRST INSERT''S LIMITS -- '
  'it supplies 100 / 1000 / 2 / 2 for whatever the caller left NULL on the row''s first insert, the '
  'same values the column defaults used to supply. A writer that moves a limit MUST name itself in '
  'updated_by, or the row keeps the PREVIOUS actor beside a fresh updated_at. An upsert whose '
  'coalesced values all equal the row''s own issues no UPDATE at all, so updated_at still reports '
  'when the limits last MOVED.';

revoke all on function clara._tf_firm_document_limits_upsert() from public;

reset role;

-- =====================================================================================
-- 2. TAIL CENSUS. Every claim re-READ from the live catalog, never asserted.
--
--    THE prosrc PROBES READ THE BODY'S STATEMENTS, NOT ITS PROSE (0184 §J's instrument, as 0185,
--    0186 and 0190 use it). plpgsql keeps a function's own comments in prosrc, and this body's
--    comments name `coalesce` and `llm_witness_concurrency` in plain sentences -- so a census that
--    grepped the raw text could be satisfied by a sentence ABOUT the code instead of the code. The
--    strip is LITERAL-AWARE ("the first `--` at EVEN single-quote parity", carried across lines),
--    because a blind regexp also cuts from a `--` INSIDE a string literal to the end of that line.
--    clara._record_journal_entry_core is in the strip's input for ONE reason: it is the estate's
--    known line carrying `--` inside a literal ('client is not active -- no posting'), and it is
--    this census's control that the scanner did not cut there.
-- =====================================================================================
do $tail$
declare
  v_sig  constant text := 'clara._tf_firm_document_limits_upsert()';
  v_ctrl constant text := 'clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)';
  v_bodies jsonb := '{}'::jsonb;
  v_one text; v_body text; v_out text; v_par int; v_kept text; v_rest text; v_head text; v_p int;
  v_line text; v_src text; v_flat text; v_sha text; v_pre text; v_acl text; v_names text;
  v_n int; r text;
begin
  -- (1) IT LANDED, AT THE SAME IDENTITY. One arity, VOLATILE, clara_fn_owner-owned SECURITY
  --     DEFINER, search_path pinned -- CREATE OR REPLACE preserves all of it, and a census that
  --     takes that on trust is how a file comes to change a definer's owner by accident.
  if to_regprocedure(v_sig) is null then
    raise exception '#692 tail: % does not resolve', v_sig using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_tf_firm_document_limits_upsert';
  if v_n <> 1 then
    raise exception '#692 tail: _tf_firm_document_limits_upsert has % overloads (want exactly 1)', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = v_sig::regprocedure
                   and p.prosecdef and p.proowner = 'clara_fn_owner'::regrole and p.provolatile = 'v'
                   and 'search_path=clara, pg_temp' = any (coalesce(p.proconfig, '{}'::text[]))) then
    raise exception '#692 tail: % is not a VOLATILE clara_fn_owner-owned SECURITY DEFINER with search_path pinned', v_sig
      using errcode = 'CLR10';
  end if;

  -- (2) THE BODY ACTUALLY MOVED, by identity rather than by this file's say-so, and its EXECUTE
  --     ACL did not: the recut reaches exactly the roles the 0007 body reached, which is none.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  select v into v_pre from _d692_prestate where k = 'sha_0007';
  if v_sha = v_pre then
    raise exception '#692 tail: % still hashes to 0007''s prosrc (%) -- the recut did not take', v_sig, left(v_pre, 12)
      using errcode = 'CLR10';
  end if;
  select coalesce(p.proacl::text, 'NULL') into v_acl from pg_proc p where p.oid = v_sig::regprocedure;
  select v into v_pre from _d692_prestate where k = 'proacl';
  if v_acl is distinct from v_pre then
    raise exception '#692 tail: % EXECUTE acl moved (prestate %, now %)', v_sig, v_pre, v_acl using errcode = 'CLR10';
  end if;
  foreach r in array array['clara_authenticated','clara_runtime','clara_agent_ro','clara_freeform_ro',
      'clara_wake_interactive','clara_wake_proactive','clara_wake_bank','clara_wake_filing',
      'clara_stripe_webhook'] loop
    if to_regrole(r) is not null and pg_catalog.has_function_privilege(r, v_sig, 'execute') then
      raise exception '#692 tail: % can execute % -- the upsert body must stay owner-only', r, v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) NOTHING ELSE ON THE RELATION MOVED. The table ACL (this file issues no grant and no
  --     revoke, so a DR round-trip is grant-identical), the four trigger attachments, the column
  --     set, and the row count.
  select coalesce(c.relacl::text, 'NULL') into v_acl from pg_class c
   where c.oid = 'clara.firm_document_limits'::regclass;
  select v into v_pre from _d692_prestate where k = 'relacl';
  if v_acl is distinct from v_pre then
    raise exception '#692 tail: firm_document_limits relacl moved (prestate %, now %)', v_pre, v_acl
      using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(t.tgname, ',' order by t.tgname), '(none)') into v_names
    from pg_trigger t where t.tgrelid = 'clara.firm_document_limits'::regclass and not t.tgisinternal;
  if v_names <> 't_firm_document_limits_firm_immutable,t_firm_document_limits_no_truncate,t_firm_document_limits_stamp,t_firm_document_limits_upsert' then
    raise exception '#692 tail: firm_document_limits carries triggers % (want the 0007 four)', v_names
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_trigger t where t.tgrelid = 'clara.firm_document_limits'::regclass
      and t.tgname = 't_firm_document_limits_upsert' and not t.tgisinternal
      and t.tgfoid = v_sig::regprocedure and t.tgtype = 7 and t.tgenabled = 'O') then
    raise exception '#692 tail: t_firm_document_limits_upsert is no longer an ENABLED BEFORE INSERT FOR EACH ROW trigger on the recut body -- a preserved body nothing calls preserves nothing'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from information_schema.columns
   where table_schema = 'clara' and table_name = 'firm_document_limits';
  if v_n <> 7 then
    raise exception '#692 tail: firm_document_limits has % columns (want the pinned 7) -- this file adds and drops no column', v_n
      using errcode = 'CLR10';
  end if;

  -- (3b) THE FOUR DEFAULTS ARE GONE AND NOTHING ELSE ABOUT THE COLUMNS MOVED. The drop is the
  --      half that makes an OMITTED column reach the body as NULL; without it the preserving arms
  --      below are unreachable for the naive writer #692 was filed about. NOT NULL, the types and
  --      updated_at's own default are re-read in the same statement so the drop is proven surgical.
  select coalesce(string_agg(c.column_name || '=' || c.column_default, ', ' order by c.column_name), '(none)')
    into v_names
    from information_schema.columns c
   where c.table_schema = 'clara' and c.table_name = 'firm_document_limits'
     and c.column_name in ('docs_per_day','pages_per_day','ocr_concurrency','llm_witness_concurrency')
     and c.column_default is not null;
  if v_names <> '(none)' then
    raise exception '#692 tail: limit column(s) still carry a table DEFAULT (%) -- an omitted column would arrive as that value and be written over the firm''s own', v_names
      using errcode = 'CLR10';
  end if;
  select coalesce(string_agg(x, ', ' order by x), '(none)') into v_names
    from unnest(array[
      'docs_per_day|integer|NO', 'pages_per_day|integer|NO', 'ocr_concurrency|integer|NO',
      'llm_witness_concurrency|integer|YES', 'updated_at|timestamp with time zone|NO',
      'updated_by|uuid|YES', 'firm_id|uuid|NO']) x
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'clara' and c.table_name = 'firm_document_limits'
        and c.column_name = split_part(x, '|', 1)
        and c.data_type   = split_part(x, '|', 2)
        and c.is_nullable = split_part(x, '|', 3));
  if v_names <> '(none)' then
    raise exception '#692 tail: column(s) lost their pinned type or nullability to the default drop: %', v_names
      using errcode = 'CLR10';
  end if;
  if (select column_default from information_schema.columns
       where table_schema = 'clara' and table_name = 'firm_document_limits'
         and column_name = 'updated_at') is distinct from 'now()' then
    raise exception '#692 tail: updated_at lost its now() default -- this file drops the FOUR limit defaults and no other'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_constraint
   where conrelid = 'clara.firm_document_limits'::regclass and contype = 'c';
  if v_n <> 4 then
    raise exception '#692 tail: firm_document_limits carries % CHECK constraint(s) (want the pinned 4) -- the > 0 wall on each limit column must survive the default drop, and this file adds none', v_n
      using errcode = 'CLR10';
  end if;
  select v into v_pre from _d692_prestate where k = 'rows';
  select count(*)::text into v_names from clara.firm_document_limits;
  if v_names is distinct from v_pre then
    raise exception '#692 tail: firm_document_limits row count moved (prestate %, now %) -- this file writes no row', v_pre, v_names
      using errcode = 'CLR10';
  end if;

  -- (4) THE FOUR coalesce ARMS ARE IN THE CODE. Comment-stripped, literal-aware.
  foreach v_one in array array[v_sig, v_ctrl] loop
    select p.prosrc into v_body from pg_proc p where p.oid = v_one::regprocedure;
    v_out := ''; v_par := 0;
    for v_line in select l from regexp_split_to_table(v_body, chr(10)) with ordinality t(l, n) order by n
    loop
      v_kept := ''; v_rest := v_line;
      loop
        v_p := position('--' in v_rest);
        if v_p = 0 then
          v_kept := v_kept || v_rest;
          v_par := (v_par + length(v_rest) - length(replace(v_rest, '''', ''))) % 2;
          exit;
        end if;
        v_head := substr(v_rest, 1, v_p - 1);
        v_par := (v_par + length(v_head) - length(replace(v_head, '''', ''))) % 2;
        if v_par = 0 then
          v_kept := v_kept || v_head;   -- outside every literal: a real comment, to end of line
          exit;
        end if;
        v_kept := v_kept || v_head || '--';  -- inside a literal: the two dashes are data
        v_rest := substr(v_rest, v_p + 2);
      end loop;
      v_out := v_out || v_kept || chr(10);
    end loop;
    v_bodies := v_bodies || jsonb_build_object(v_one, v_out);
  end loop;

  -- VACUITY CONTROL, BOTH SIDES. (1) the estate's known `--`-inside-a-literal line must come out
  -- WHOLE, or every probe below is reading a body with real SQL missing; (2) a sentence of THIS
  -- body that is unambiguously PROSE must be GONE, or the strip is a no-op and every probe below
  -- could be satisfied by a comment -- and this body's comments do name `coalesce` and
  -- `llm_witness_concurrency`, so that is not a hypothetical.
  v_src := v_bodies ->> v_ctrl;
  if position('''client is not active -- no posting''' in v_src) = 0 then
    raise exception '#692 tail: the comment strip is not literal-aware -- it cut inside a string literal, so every probe below is unsound'
      using errcode = 'CLR10';
  end if;
  v_src := v_bodies ->> v_sig;
  if position('THE ONE RULE, over every writable column' in v_src) > 0 then
    raise exception '#692 tail: the comment strip left prose in the body -- every probe below could be satisfied by a sentence about the code'
      using errcode = 'CLR10';
  end if;

  -- Probed on a WHITESPACE-FLATTENED copy: the body aligns its assignments in columns, and a
  -- census that pins the alignment would red on a reformat that changed no statement at all.
  v_flat := regexp_replace(v_src, '\s+', ' ', 'g');
  foreach r in array array[
      'coalesce(new.docs_per_day, v_old.docs_per_day)',
      'coalesce(new.pages_per_day, v_old.pages_per_day)',
      'coalesce(new.ocr_concurrency, v_old.ocr_concurrency)',
      'coalesce(new.llm_witness_concurrency, v_old.llm_witness_concurrency)'] loop
    if position(r in v_flat) = 0 then
      raise exception '#692 tail: the recut body does not carry the arm % in code -- that limit column is still collateral on a one-column upsert', r
        using errcode = 'CLR10';
    end if;
  end loop;
  -- …and the FIRST-INSERT arm carries the four values §1a took off the table, as LITERALS in the
  -- code. This is the half that keeps a fresh firm's row at 100 / 1000 / 2 / 2 now that the
  -- columns have no defaults of their own; a body missing one of these would hand a NOT NULL
  -- column a NULL on the first insert for a firm.
  foreach r in array array[
      'coalesce(new.docs_per_day, 100)', 'coalesce(new.pages_per_day, 1000)',
      'coalesce(new.ocr_concurrency, 2)', 'coalesce(new.llm_witness_concurrency, 2)'] loop
    if position(r in v_flat) = 0 then
      raise exception '#692 tail: the recut body does not carry the first-insert arm % in code -- §1a dropped that column''s default, so nothing else would supply it', r
        using errcode = 'CLR10';
    end if;
  end loop;
  -- FOUR preserving arms + FOUR first-insert arms + the updated_by arm: exactly nine
  -- `coalesce(new.` in the statements. A fifth limit column would have to be added in BOTH arms,
  -- not silently left out the way 0090 left llm_witness_concurrency out of the 0007 body.
  v_n := (length(v_flat) - length(replace(v_flat, 'coalesce(new.', ''))) / length('coalesce(new.');
  if v_n <> 9 then
    raise exception '#692 tail: the recut body carries % `coalesce(new.` arms in code (want 9: four preserving + four first-insert + updated_by)', v_n
      using errcode = 'CLR10';
  end if;
  if position('coalesce(new.updated_by, v_old.updated_by)' in v_flat) = 0 then
    raise exception '#692 tail: the recut body does not coalesce updated_by -- an all-NULL upsert would then not be a no-op'
      using errcode = 'CLR10';
  end if;
  -- The no-op short-circuit and the row lock are STATEMENTS, not intentions.
  if position('is not distinct from' in v_flat) = 0 then
    raise exception '#692 tail: the recut body has no no-op short-circuit in code -- an upsert that changes nothing would still move updated_at'
      using errcode = 'CLR10';
  end if;
  if position('where firm_id = new.firm_id for update' in v_flat) = 0 then
    raise exception '#692 tail: the recut body does not lock the row it reads in code' using errcode = 'CLR10';
  end if;
  -- …and the UPDATE really writes all four limits plus the stamp.
  foreach r in array array['docs_per_day = new.docs_per_day', 'pages_per_day = new.pages_per_day',
      'ocr_concurrency = new.ocr_concurrency',
      'llm_witness_concurrency = new.llm_witness_concurrency', 'updated_by = new.updated_by',
      'updated_at = now()'] loop
    if position(r in v_flat) = 0 then
      raise exception '#692 tail: the recut body''s UPDATE does not set % in code', r using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#692 tail: OK -- this file makes exactly TWO changes and they are one fix. (1) clara._tf_firm_document_limits_upsert() is recut IN PLACE: exactly one arity, still a VOLATILE clara_fn_owner-owned SECURITY DEFINER with search_path=clara, pg_temp pinned and its EXECUTE acl byte-identical to the prestate (owner-only -- clara_authenticated, clara_runtime, both agent read roles, all four wake lanes and the webhook role are behaviourally denied), while its prosrc sha is PROVEN to have moved off 0007''s pinned body. Its COMMENT-STRIPPED, LITERAL-AWARE statements carry all FOUR preserving arms -- coalesce(new.docs_per_day, v_old.docs_per_day), pages_per_day, ocr_concurrency and 0090''s llm_witness_concurrency, the column the 0007 UPDATE never carried at all -- the FOUR first-insert arms coalesce(new.<col>, 100/1000/2/2), and exactly nine `coalesce(new.` arms in total (four preserving + four first-insert + updated_by, so a future fifth limit column cannot be quietly left out of either arm), beside the row lock, the is-not-distinct-from no-op short-circuit that keeps updated_at reporting when the limits last MOVED, and an UPDATE that really sets all four limits, updated_by and now(); a two-sided vacuity control proves the strip neither mutilated the estate''s known `--`-inside-a-literal line nor left this body''s own prose behind. (2) the FOUR limit columns'' table DEFAULTS are GONE -- re-read as NULL from information_schema -- which is what makes an OMITTED column reach the body as NULL and be PRESERVED rather than overwritten with 100/1000/2/2 by the naive one-column upsert #692 was filed about; the body now supplies those same four values on a first insert, so a fresh firm''s row is observably unchanged. THE DROP IS SURGICAL AND RE-READ AS SUCH: all 7 columns keep their pinned type and nullability, updated_at keeps its own now() default, every CHECK survives, and NOTHING ELSE MOVED -- the relacl is byte for byte the prestate''s (this file issues NO table grant or revoke, so its DR round-trip is grant-identical), all four 0007 trigger attachments stand with t_firm_document_limits_upsert still ENABLED as BEFORE INSERT FOR EACH ROW on this very function, and the row count is the one it had at prestate: no relation, column, CHECK, policy, grant or row was created, dropped or written by this file.';
end $tail$;
