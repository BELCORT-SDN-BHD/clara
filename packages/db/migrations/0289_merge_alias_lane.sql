-- 0289_merge_alias_lane — #889 (narrowed by the ticket's 2026-09-20 triage note; riders wave 3
-- lane 07, applied AFTER #1012/0288 in this lane): THE MERGE DOOR'S RESIDUE ALIAS WRITE NAMES
-- ITS RECORDING LANE.
-- =====================================================================================
-- Ticket of record: issue #889's Agent Brief, narrowed by its 2026-09-20 triage comment. The
-- brief's original scope named TWO residue writers (`clara.merge_counterparties` and
-- `clara.tick_seeding_proposal`); the triage note drops the second because #1012 (0288, this
-- same lane, applied before this file on this branch) turned `tick_seeding_proposal`'s WHOLE
-- body into a typed refusal that inserts nothing at all -- naming a lane inside a write path
-- that no longer exists would be dead code the day 0288 landed. So this file touches ONE
-- writer, exactly as the narrowed brief asks.
--
-- WHAT WAS MEASURED (0215:107's "declared residue" note, re-verified on THIS rig before writing
-- this file). `clara.merge_counterparties`'s alias insert (0015:2295 originally; spliced once
-- already by 0149 S2, which added `returning id into v_alias` and four other things, none of
-- them this column) omits `recorded_via`, so the insert lands the column's
-- `NOT NULL DEFAULT 'legacy_unknown'` (0215 S1) — even though the door is floored by
-- `clara._human_ctx(clara.role_rank('bookkeeper'))` (0004:299) at its very first statement and
-- therefore NEVER completes that insert with `clara.jwt_sub() is null`. That is exactly the
-- fact `clara._tf_counterparty_merge_revision` (0215) already leans on when it stamps the
-- SIBLING 'merged' revision `human_ui` from the session subject. So one merge writes TWO
-- identity revisions that disagree about their own lane: 'alias_added' (appended by
-- `t_counterparty_aliases_revision`, which copies `new.recorded_via` verbatim) reads
-- `legacy_unknown`; 'merged' (appended by `_tf_counterparty_merge_revision`) reads `human_ui`
-- for the SAME human act. The emitted `counterparty.alias_added` event inherits the same wrong
-- value, because `_tf_counterparty_alias_revision` reads it off the same row.
--
-- THE FIX IS ONE COLUMN NAMED AT THE INSERT SITE, NOT A CONDITIONAL. `clara.add_counterparty_alias`
-- and `clara.rename_counterparty` (both recut by 0215, both floored by the SAME `_human_ctx`)
-- already hard-code `'human_ui'` at their own alias inserts rather than deriving it from
-- `clara.jwt_sub()` — the derivation in `_tf_counterparty_merge_revision` exists ONLY because
-- that trigger also covers a hand-forged pre-0215 row with no door behind it at all (0215:704's
-- own comment). A door floored by `_human_ctx` has no such row to account for. This file gives
-- `merge_counterparties` the same one-column fix its two 0215 siblings already carry, changing
-- nothing else: not a guard, not a refusal, not the event payload (0149 D-05's "the same
-- event" still holds — the payload this file's splice touches is `_tf_counterparty_alias_revision`'s,
-- read off the ROW, never `merge_counterparties`' own `_append_event` call).
--
-- HOUSE SHAPE: read-splice-prove, the 0149 S2/S7 ceremony the ticket brief names by name. S0
-- pins the live body (MEASURED on this rig; identical to 0215's own P6 residue pin, so the body
-- has not moved since 0149 — no ticket before this one in this lane touched it: `git log
-- <base>..HEAD -- packages/db/migrations` names only 0287 and 0288, neither of which mentions
-- `merge_counterparties`). S1 splices ONE anchor, asserted to occur EXACTLY once, redo-safe
-- both ways (#957). S2 proves the re-substitution reproduces the pre-image exactly and re-pins
-- FIVE witness bodies byte-unchanged. S3 — a SEPARATE `do` block from S2 on purpose (see its
-- own header) — closes the census the ticket's third acceptance criterion asks for: every
-- clara-schema function reachable from an application role (`clara_authenticated` /
-- `clara_agent_ro` / `clara_wake_interactive` / `clara_wake_proactive` / `clara_runtime`) that
-- inserts into `clara.counterparty_aliases` now names `recorded_via` in its OWN column list —
-- and the membership is closed at exactly the three human doors 0215 already floors.
-- `tick_seeding_proposal`'s insert is not merely excluded by a grant check here: 0288's own
-- tail already proved that body contains no insert, no audit and no event at all.
--
-- WHAT THIS FILE DOES NOT TOUCH, and pins as witnesses in S0/re-checks in S2:
-- `clara._tf_counterparty_alias_revision` (the ticket names it unchanged by name — it already
-- copies `new.recorded_via` verbatim, so fixing the WRITE fixes the revision and the event for
-- free, with no trigger edit); `clara._tf_counterparty_merge_revision`; `clara.add_counterparty_alias`;
-- `clara.rename_counterparty`. Also untouched, by absence of any statement that could reach
-- them: the check constraint, the door's ACL, its six refusals, its op-key dedupe, the carrier
-- insert into `clara.counterparty_merges`, and the other four sites 0149 spliced.
--
-- README: `packages/db/README.md` gains "The counterparty merge door's own lock order" (the
-- ticket's fourth acceptance criterion), naming the three rungs and the deadlock class the
-- `order by cp.id` choice avoids. The lock order itself is unchanged — this file states it, in
-- one place, rather than leaving it readable only by tracing the body.
-- =====================================================================================

create temp table _p889_pre(k text primary key, v text) on commit drop;

-- The one shared instrument the splice below uses: an anchor must occur EXACTLY the expected
-- number of times in the text about to be rewritten, or the file aborts before it edits
-- anything (the 0149 cm1_n_check idiom, re-typed under this file's own prefix so no name is
-- shared across migrations). Lives in pg_temp; each migration file runs on its own fresh
-- connection (packages/db/scripts/migrate.mjs), so there is no cross-file collision to guard.
create function pg_temp.p889_n_check(p_text text, p_anchor text, p_want int, p_label text)
  returns void language plpgsql as $nc$
declare v_n int;
begin
  v_n := (length(p_text) - length(replace(p_text, p_anchor, ''))) / length(p_anchor);
  if v_n <> p_want then
    raise exception '#889 splice %: anchor occurs % time(s), expected % -- the live body is not the text this splice was derived against', p_label, v_n, p_want
      using errcode = 'CLR10';
  end if;
end $nc$;

-- =====================================================================================
-- S0 — PRESTATE. Measure every claim this file makes about what it is editing, pin the one
-- body it replaces AND the bodies it swears it does not touch, and abort on any divergence.
-- =====================================================================================
do $s0$
declare v_sha text; v_def text; r record;
begin
  -- (0.1) The provenance column and its 0215 four-value CHECK are live: this file's insert
  -- depends on both, and a drifted CHECK would admit 'human_ui' into a column this file is
  -- about to hand-write it into for reasons the CHECK no longer states.
  if not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='counterparty_aliases'
                    and column_name='recorded_via') then
    raise exception '#889 prestate: clara.counterparty_aliases.recorded_via is absent -- 0215 has not applied to this database' using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid='clara.counterparty_aliases'::regclass and conname='ck_counterparty_aliases_recorded_via';
  if v_def is distinct from 'CHECK ((recorded_via = ANY (ARRAY[''human_ui''::text, ''agent''::text, ''seeding''::text, ''legacy_unknown''::text])))' then
    raise exception '#889 prestate: ck_counterparty_aliases_recorded_via is not the pinned 0215 four-value CHECK (found: %)', coalesce(v_def,'ABSENT')
      using errcode='CLR10';
  end if;

  -- (0.2) THE ONE BODY THIS FILE SPLICES, pinned BOTH ways so this file is REDO-SAFE (#957,
  -- the 0288 "bimodal by construction" shape, same lane). FIRST APPLY measures the pre-image,
  -- identical to 0215's own P6 residue pin
  -- ('840180a8c22a4d43c2ed9b69c0907c568368201a0b348bb9415b66a1d46546c2' -- the body has not
  -- moved since 0149's S2 splice installed it). REDO measures the body THIS FILE's own S1
  -- already installed ('2e4cb1af232e4b9ef6eec18c9b147fe0d2beefe40fff5b04d31d2b8d4782f8f9').
  -- Any THIRD value is drift on EITHER branch and refuses -- S1 derives the text for whichever
  -- branch this run is on from here.
  select pg_get_functiondef(p.oid), encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    into v_def, v_sha
    from pg_proc p where p.oid='clara.merge_counterparties(uuid,uuid,uuid,text,text)'::regprocedure;
  if v_sha = '840180a8c22a4d43c2ed9b69c0907c568368201a0b348bb9415b66a1d46546c2' then
    insert into _p889_pre(k, v) values ('branch', 'first_apply');
  elsif v_sha = '2e4cb1af232e4b9ef6eec18c9b147fe0d2beefe40fff5b04d31d2b8d4782f8f9' then
    insert into _p889_pre(k, v) values ('branch', 'redo');
  else
    raise exception '#889 prestate: clara.merge_counterparties has DRIFTED from BOTH the pre-splice and the post-splice pins (sha %) -- re-derive this file against the live body before applying', v_sha
      using errcode='CLR10';
  end if;
  insert into _p889_pre(k, v) values ('live:clara.merge_counterparties(uuid,uuid,uuid,text,text)', v_def);

  -- (0.3) THE BODIES THIS FILE SWEARS IT DOES NOT TOUCH. Absence of an edit is not evidence;
  -- S2 re-reads each of these and compares to the sha stashed here.
  for r in select * from (values
      ('clara._tf_counterparty_alias_revision()'),
      ('clara._tf_counterparty_merge_revision()'),
      ('clara._append_counterparty_identity_revision(uuid,uuid,uuid,text,jsonb,jsonb,text,uuid,text,uuid,uuid,uuid,uuid,text)'),
      ('clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text)'),
      ('clara.rename_counterparty(uuid,uuid,text,text)')
    ) as t(sig) loop
    if to_regprocedure(r.sig) is null then
      raise exception '#889 prestate: witness body % does not resolve at its pinned signature', r.sig
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    insert into _p889_pre(k, v) values ('witness:' || r.sig, v_sha);
  end loop;
end $s0$;

-- =====================================================================================
-- S1 — clara.merge_counterparties: ONE ANCHOR, the alias insert. Same signature, same six
-- refusals, same lock order, same carrier row, same audit and event payloads. What changes:
-- the insert names its own lane instead of taking the column's honest-unknown default.
--
-- The splice reads pg_get_functiondef on its own target and rewrites it -- never re-typed --
-- so every comment and every guard in the installed body survives byte-for-byte, and S2's
-- re-substitution proof reconstructs the pre-image from the post-image to prove it.
--
-- No `set role clara_fn_owner` here (unlike 0288's literal recuts): this splice READS
-- `_p889_pre`, a temp table the CONNECTING role owns, and switching role would lose SELECT on
-- it. 0149's own S2 -- the ceremony this file names -- replaces the same function the same
-- way, under the plain connecting role: `CREATE OR REPLACE FUNCTION` preserves the existing
-- owner regardless of which role issues it, so `clara_fn_owner` stays the function's owner
-- either way.
--
-- BIMODAL (#957): on FIRST APPLY the live text is the pre-image, and the forward replace
-- derives the post-image. On REDO the live text is ALREADY the post-image (S0 told the two
-- branches apart by sha); this branch derives the pre-image by the INVERSE replace instead of
-- re-deriving anything, then re-executes the SAME post-image it already reads live -- a
-- harmless `CREATE OR REPLACE` of identical text. Either branch stores BOTH `pre:` and `post:`
-- under the SAME keys, so S2's checks below read identically regardless of which branch ran.
-- =====================================================================================
do $s1$
declare v_live text; v_branch text; v_pre text; v_post text; v_anchor text; v_repl text;
begin
  v_branch := (select v from _p889_pre where k = 'branch');
  v_live := (select v from _p889_pre where k = 'live:clara.merge_counterparties(uuid,uuid,uuid,text,text)');

  v_anchor := '  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,' || E'\n' ||
              '      alias_normalized,alias_display,origin,created_by)' || E'\n' ||
              '    values(c.firm,p_client,p_survivor,m.name_normalized,m.name,''former_name'',c.actor)' || E'\n' ||
              '    on conflict do nothing returning id into v_alias;';
  v_repl := '  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,' || E'\n' ||
            '      alias_normalized,alias_display,origin,created_by,recorded_via)' || E'\n' ||
            '    values(c.firm,p_client,p_survivor,m.name_normalized,m.name,''former_name'',c.actor,''human_ui'')' || E'\n' ||
            '    on conflict do nothing returning id into v_alias;';

  if v_branch = 'first_apply' then
    v_pre := v_live;
    perform pg_temp.p889_n_check(v_pre, v_anchor, 1, 'merge alias lane (forward)');
    v_post := replace(v_pre, v_anchor, v_repl);
  else -- 'redo'
    v_post := v_live;
    perform pg_temp.p889_n_check(v_post, v_repl, 1, 'merge alias lane (redo, reverse)');
    v_pre := replace(v_post, v_repl, v_anchor);
  end if;

  if v_post = v_pre then
    raise exception '#889 S1: the merge_counterparties splice produced an identical body'
      using errcode = 'CLR10';
  end if;
  insert into _p889_pre(k, v) values ('pre:clara.merge_counterparties(uuid,uuid,uuid,text,text)', v_pre);
  insert into _p889_pre(k, v) values ('post:clara.merge_counterparties(uuid,uuid,uuid,text,text)', v_post);
  execute v_post;
end $s1$;

-- =====================================================================================
-- S2 — RE-SUBSTITUTION PROOF AND WITNESS CHECK. Every claim re-READ from the live catalog.
--
-- Kept in its OWN `do` block, separate from S3's census below, so the two never share one
-- block: S3's census reads `has_function_privilege(role_name, p.oid, 'execute')`, and a `do`
-- block that BOTH calls `pg_get_functiondef` and contains the bare word `execute` (even
-- harmlessly, inside an unrelated string literal naming a PRIVILEGE, not a dynamic-SQL
-- keyword) is exactly the shape `scripts/wiki-lint-checks.mjs` treats as installing a
-- callable surface, and then reports the quoted literal `'execute'` itself as an unprovable
-- dynamic-SQL fragment -- a false positive `pnpm lint`'s wiki-dynamic-sql check raised against
-- an earlier draft of this file. Splitting the two concerns apart is the fix; the census does
-- not need `pg_get_functiondef` at all, so it costs nothing.
-- =====================================================================================
do $s2$
declare
  v_sha text; v_def text; v_pre text; v_recon text; r record; v_post_sha text;
begin
  -- (1) THE ONE REPLACED BODY: genuinely changed, installed exactly as spliced, and its
  -- pre-image reconstructed BYTE-FOR-BYTE from the post-image by the inverse of the one edit.
  -- v_post_sha is a DEDICATED variable, not the shared v_sha the witness loop in (2) reuses --
  -- the notice at the end of this block names v_post_sha precisely so that reuse can never
  -- make the evidence it prints wrong.
  select pg_get_functiondef(p.oid), encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
    into v_def, v_post_sha
    from pg_proc p where p.oid='clara.merge_counterparties(uuid,uuid,uuid,text,text)'::regprocedure;
  v_pre := (select v from _p889_pre where k = 'pre:clara.merge_counterparties(uuid,uuid,uuid,text,text)');
  if v_def is null or v_def = v_pre then
    raise exception '#889 tail: clara.merge_counterparties is unchanged -- the splice did not land'
      using errcode = 'CLR10';
  end if;
  if v_def is distinct from (select v from _p889_pre where k = 'post:clara.merge_counterparties(uuid,uuid,uuid,text,text)') then
    raise exception '#889 tail: clara.merge_counterparties'' INSTALLED body is not the text this file spliced -- something else replaced it inside this transaction'
      using errcode = 'CLR10';
  end if;
  if v_post_sha <> '2e4cb1af232e4b9ef6eec18c9b147fe0d2beefe40fff5b04d31d2b8d4782f8f9' then
    raise exception '#889 tail: clara.merge_counterparties'' post-splice sha is % -- does not match the value this file was derived against', v_post_sha
      using errcode = 'CLR10';
  end if;

  v_recon := (select v from _p889_pre where k = 'post:clara.merge_counterparties(uuid,uuid,uuid,text,text)');
  v_recon := replace(v_recon,
    '  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,' || E'\n' ||
    '      alias_normalized,alias_display,origin,created_by,recorded_via)' || E'\n' ||
    '    values(c.firm,p_client,p_survivor,m.name_normalized,m.name,''former_name'',c.actor,''human_ui'')' || E'\n' ||
    '    on conflict do nothing returning id into v_alias;',
    '  insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,' || E'\n' ||
    '      alias_normalized,alias_display,origin,created_by)' || E'\n' ||
    '    values(c.firm,p_client,p_survivor,m.name_normalized,m.name,''former_name'',c.actor)' || E'\n' ||
    '    on conflict do nothing returning id into v_alias;');
  if v_recon is distinct from v_pre then
    raise exception '#889 tail: the merge_counterparties re-substitution does NOT reproduce the pre-image -- the splice touched more than the one anchor'
      using errcode = 'CLR10';
  end if;

  -- (2) THE FIVE WITNESS BODIES ARE BYTE-UNTOUCHED.
  for r in select k, v from _p889_pre where k like 'witness:%' loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = substr(r.k, 9)::regprocedure;
    if v_sha is distinct from r.v then
      raise exception '#889 tail: witness body % CHANGED (% -> %) -- this file swore it does not touch it', substr(r.k, 9), r.v, v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- NOTE ON THE PRE-IMAGE SHA: v_pre above is `pg_get_functiondef` TEXT (header + body, the
  -- shape the splice operates on), never bare prosrc -- hashing it would not match either
  -- pinned prosrc sha and would misreport a real byte-for-byte match as a mismatch. The notice
  -- below therefore names only the one sha this file actually PINS (prosrc, post-splice) and
  -- the branch that produced it; the re-substitution check just above is the proof that v_pre
  -- is the correct pre-image, and needs no sha of its own.
  raise notice '#889 tail (1/2): OK (branch %) -- clara.merge_counterparties'' alias insert now names recorded_via=''human_ui'' (post-splice prosrc sha %); the re-substitution reproduces the pre-image byte-for-byte; five witness bodies (_tf_counterparty_alias_revision, _tf_counterparty_merge_revision, _append_counterparty_identity_revision, add_counterparty_alias, rename_counterparty) are byte-unchanged.',
    (select v from _p889_pre where k='branch'), v_post_sha;
end $s2$;

-- =====================================================================================
-- S3 — THE CLOSED-WORLD CENSUS (AC3). A SEPARATE `do` block from S2 on purpose -- see S2's
-- own header comment: this one calls no `pg_get_functiondef` at all, so co-locating it with
-- S2 would be the ONLY reason a lint scanning for "a do block that reads and reinstalls a
-- function body" would even look at it.
-- =====================================================================================
do $s3$
declare
  r record; v_members text[] := '{}';
  v_want text[] := array['add_counterparty_alias','merge_counterparties','rename_counterparty'];
  v_pos int; v_end int; v_cols text; v_code text;
begin
  -- Every clara-schema function reachable from an application role that inserts into
  -- clara.counterparty_aliases NAMES recorded_via in its own column list -- comment-stripped,
  -- so a body that lost the column from its CODE while keeping the word in a COMMENT would
  -- still fail this. Membership is exactly the three human doors 0215 floors;
  -- tick_seeding_proposal is absent because 0288 removed its insert outright (its own tail
  -- already proved that body "contains no reservation, context ladder, insert, audit or
  -- event"), not because this census merely stopped counting it.
  for r in select p.oid, p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara'
      and position('into clara.counterparty_aliases(' in p.prosrc) > 0
      and exists (
        select 1 from unnest(array['clara_authenticated','clara_agent_ro',
            'clara_wake_interactive','clara_wake_proactive','clara_runtime']) role_name
        where has_function_privilege(role_name, p.oid, 'execute'))
  loop
    v_code := regexp_replace(regexp_replace(r.prosrc, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    v_pos := position('into clara.counterparty_aliases(' in v_code);
    v_end := position('values(' in substr(v_code, v_pos));
    if v_end = 0 then
      raise exception '#889 tail census: % -- could not find the matching values( after its counterparty_aliases insert', r.proname
        using errcode = 'CLR10';
    end if;
    v_cols := substr(v_code, v_pos, v_end - 1);
    if position('recorded_via' in v_cols) = 0 then
      raise exception '#889 tail census: clara.% inserts into clara.counterparty_aliases without naming recorded_via IN CODE -- it would land the legacy_unknown default', r.proname
        using errcode = 'CLR10';
    end if;
    v_members := array_append(v_members, r.proname);
  end loop;
  v_members := (select array_agg(x order by x) from unnest(v_members) x);
  if v_members is distinct from v_want then
    raise exception '#889 tail census: the granted counterparty_aliases-writer roster is {%}, expected {%} -- a writer appeared or vanished; re-derive the census before landing this file', array_to_string(v_members, ','), array_to_string(v_want, ',')
      using errcode = 'CLR10';
  end if;

  raise notice '#889 tail (2/2): OK -- the closed-world census of application-reachable counterparty_aliases writers is exactly {add_counterparty_alias, merge_counterparties, rename_counterparty}, each naming recorded_via in code.';
end $s3$;
