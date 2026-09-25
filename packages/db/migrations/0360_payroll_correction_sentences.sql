-- 0360_payroll_correction_sentences.sql — #1056 (rider; sweep wave, lane 05, FIX ROUND): THE TWO
-- SENTENCES A PAYROLL CORRECTION LEAVES BEHIND NOW SAY WHAT IS TRUE.
-- =====================================================================================
-- Spec of record: issue #1056's Agent Brief, and the review round of 2026-09-25 against this
-- lane's own 0344 (`waveS-lane05-review-adversarial.json` ADV-L05-01,
-- `waveS-lane05-codereview-spec.json` SPEC-1056-A). It is a SENTENCE file: it changes no wall, no
-- verdict, no rung, no grant, no table and no signature. It recuts two bodies through the
-- 0146/0260/0297 splice idiom and changes exactly one string in each, plus one disclosed key.
--
-- The migration number comes from the sweep wave's overflow block (0360+), assigned by the
-- orchestrator; this file is the fix round's ONLY schema change. 0344 itself cannot be edited: an
-- applied migration is immutable, and `CLARA_MIGRATION_REDO` only ever takes the highest applied
-- version, which 0345 and 0346 now sit above.
--
-- -------------------------------------------------------------------------------------
-- DEFECT 1 (ADV-L05-01, major) — A CORRECTED RUN IS TOLD TO RE-FILE, WHICH THROWS THE CORRECTION
-- AWAY.
--
-- 0344 let a person correct a misread payroll figure. Measured end to end on a lane database: a
-- run blocked on `channels_agree` takes one correction, `clara._payroll_posting_verdict` answers
-- `ready`, and NOTHING posts — the unattended post is reachable from `clara.persist_payroll_facts`
-- alone. The Needs-you row does not go away either: `clara.list_review_queue`'s payroll arm asks
-- only that a done `payroll_text_facts` row exists and that the filing carries no live draft or
-- approved entry (re-read live from the installed body, 2026-09-25) — it never asks the verdict.
-- So the row stands and swaps in the verdict's `ready` sentence:
--
--     "Payroll run <month> is ready to post but no entry exists yet -- re-file the payslip to
--      post it."
--
-- Re-filing creates a NEW document whose extraction chain does not carry the correction. The
-- estate was therefore telling a person, in its own words, to do the one act that discards the
-- work they had just done. 0297's sentence was true of 0297's world, where `ready` could only
-- mean "read, and the post has not run yet or its entry was reversed"; 0344 opened a second road
-- to `ready` and did not bring the sentence with it.
--
-- WHAT THIS FILE DOES NOT DO ABOUT IT, AND WHY. It does not make the correction post the run.
-- That would need a SECOND posting arm: `clara._post_payroll_run` writes
-- `clara.entry_post_receipts` with `approval_arm = 'payroll_unattended'` and a rationale whose own
-- words are "posted unattended from a payroll summary whose two readings agreed" — false of a run
-- a person declared a figure on. Minting a human-declared arm is an accounting decision about who
-- may cause an approved journal entry with no second reading behind it, and a fix round is not
-- where that gets invented. It stays the follow-up 0344's own README section already names, now
-- with this sentence beside it.
--
-- WHAT IT DOES INSTEAD: it tells the truth and names a remedy that exists. A reading that carries
-- a human declaration (0344's top-level `human_declared` array, which a machine-produced state
-- never has) gets its own `ready` sentence — nothing will post this, re-filing does not carry the
-- correction, book the month by hand. That remedy is real and reachable for the same person:
-- `clara.draft_entry` and `clara.approve_entry` are both `clara_authenticated` doors, which §Z
-- re-measures rather than assumes. Every other reading keeps 0297's sentence to the byte.
--
-- -------------------------------------------------------------------------------------
-- DEFECT 2 (SPEC-1056-A, minor) — THE ALREADY-POSTED REFUSAL ASSERTS MORE THAN IT MEASURED.
--
-- The payroll lane's posted-entry pin asks `clara._document_live_posted_entry(p_document)`, which
-- is `clara._document_posting_entry(client, document)` per live filing (0182:578-590): a live
-- `entry_evidence_links` row OR any approved, un-reversed `journal_entries` row bound to the
-- document, with no payroll qualification anywhere in it. The refusal nonetheless said "this
-- payroll run is already posted as entry %". A payroll summary cited as evidence on an ordinary
-- manual journal therefore refused every payroll fact revision on that document while naming an
-- entry that is not the payroll acquisition at all.
--
-- THE PROBE IS KEPT AS IT IS, DELIBERATELY. "Something the estate has already derived from this
-- reading is standing on it, and it must come down first" is the rule the whole family runs on —
-- 0217's own `live_bank_statement_present` is the sibling, and it too names what was FOUND rather
-- than what it implies. Narrowing the probe to entries carrying `flags->'payroll_run'` would let
-- a reading move underneath a hand-booked entry raised from that very reading, which is exactly
-- what the remedy above now tells people to do. So the SENTENCE is corrected to the umbrella the
-- probe actually measures -- an entry STANDS ON this document, by a live evidence link or as an
-- approved un-reversed entry. The reason code is renamed to what it measures,
-- `live_entry_present`, which is `live_bank_statement_present`'s own shape, and the detail gains
-- `is_payroll_run` so a surface can say which of the two it found.
--
-- ONE REMEDY, AND IT IS THE SAME ONE FOR BOTH ARMS, measured rather than assumed. The rank-0 arm
-- does not test the entry's status, but both writers of `clara.entry_evidence_links` only ever
-- create a link for an entry that is already posted (`clara.attach_entry_evidence` refuses a
-- draft in those words, driven by a cell; `clara._record_journal_entry_core` writes its link
-- inside the posting transaction), and the trigger `t_entry_evidence_release` releases every live
-- link on an entry the moment `reversed_by` is set. So reversing the entry clears BOTH arms, and
-- there is no separate "release the evidence link" door for a person to be sent to -- the
-- sentence names the one act that exists.
--
-- -------------------------------------------------------------------------------------
-- HOW: TWO ANCHORED SPLICES, THE 0146/0260/0297 IDIOM. Each body is read at its own literal
-- regprocedure through `pg_get_functiondef`, ONE anchor is asserted to occur EXACTLY once, the
-- replacement is a single dollar-quoted literal (never a `||` chain and never `chr()`, so
-- `apps/web/test/sqlFunctionCensus.ts` can reconstruct the statement), and the re-installed body
-- is re-read from the COMMITTED catalog for owner, ACL, DEFINER-ness, `search_path` and a moved
-- `sha256(prosrc)`. Neither body returns anything that could be a view definition and this file
-- contains no `create view` of any spelling, so neither P4 scope view is reachable.
--
-- REDO-SAFE: each splice detects its own marker in the INSTALLED body and no-ops; the prestate
-- takes a REDO branch when both markers are already live.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. The two bodies this file recuts, at the shas MEASURED LIVE on clara_l03 (PG 17,
-- chain 0001..0346, after this lane's #1056 / #1090 / #1092) immediately before this file was
-- written. FIRST-APPLY requires both pre-images; REDO requires both of this file's markers;
-- anything else is a body some other change moved, and this file refuses rather than splicing a
-- stranger.
-- =====================================================================================
do $p1056fix_pre$
declare
  v_sha text; v_src text; v_mode text := 'FIRST'; v_n int;
  c_verdict_sig constant text := 'clara._payroll_posting_verdict(uuid)';
  c_door_sig    constant text := 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)';
  c_verdict_pre constant text := '23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0';
  c_door_pre    constant text := 'a6858d3e88bfca79d9a0f527a0d511db3702d53ca5612d796a05255fa1927fb8';
  -- BIMODAL, ADDED AT INTEGRATION (riders sweep wave). This file is lane L5's fix round and its
  -- two pins were measured on `clara_l03`, a chain of L5's own files alone. On the INTEGRATED
  -- chain it is the LAST file but one, so both bodies have been moved again by files that apply
  -- before it, and each has a second admissible pre-image named with the file that produces it:
  --
  --   · `clara._payroll_posting_verdict` -- lane L4's #1048 (0343) recuts it for the
  --     row-sum-plus-witness posting arm. This file does not care what the verdict DECIDES; it
  --     replaces ONE sentence in the `ready` arm, and §A counts its anchor and refuses unless it
  --     occurs EXACTLY once. The anchor survives 0343's recut intact (measured: 1 occurrence), so
  --     the splice is the same splice, applied to a longer body.
  --   · `clara.revise_document_fact` -- this lane's OWN 0344 §G, as recut at integration to carry
  --     the cut phase's 0321 substitution (the typed no-op guard) and to admit both payroll state
  --     versions. The sha 0344 now installs is the one below.
  --
  -- A body at NEITHER shape still refuses by name, and nothing else is loosened.
  c_verdict_alt constant text := '378086068b13e4fa9eba17bb1beba8aa749d0200989872d3296d1246da5a1242';
  c_door_alt    constant text := '4b9a264d57925d0d4c9622991b42c39c54d7b7a510df5622f41aa70c6654ea0f';
begin
  if to_regprocedure(c_verdict_sig) is null then
    raise exception '#1056 fix prestate: % is absent -- 0297 must apply first', c_verdict_sig
      using errcode = 'CLR10';
  end if;
  if to_regprocedure(c_door_sig) is null then
    raise exception '#1056 fix prestate: % is absent -- 0217/0268/0344 must apply first', c_door_sig
      using errcode = 'CLR10';
  end if;

  -- REDO is decided by ONE signal per body: this file's own marker in the INSTALLED source.
  select p.prosrc into v_src from pg_proc p where p.oid = c_verdict_sig::regprocedure;
  v_n := case when position('Book this month by hand from the corrected figures' in v_src) > 0
              then 1 else 0 end;
  select p.prosrc into v_src from pg_proc p where p.oid = c_door_sig::regprocedure;
  v_n := v_n + case when position('live_entry_present' in v_src) > 0 then 1 else 0 end;
  if v_n = 2 then
    v_mode := 'REDO';
  elsif v_n = 1 then
    raise exception '#1056 fix prestate: exactly one of the two bodies already carries this file''s marker -- a half-applied splice, refusing'
      using errcode = 'CLR10';
  end if;

  if v_mode = 'FIRST' then
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = c_verdict_sig::regprocedure;
    if v_sha is distinct from c_verdict_pre and v_sha is distinct from c_verdict_alt then
      raise exception '#1056 fix prestate: % is at %, expected the pinned pre-image % or lane L4 0343''s post-image % -- a third change moved it',
        c_verdict_sig, v_sha, c_verdict_pre, c_verdict_alt using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = c_door_sig::regprocedure;
    if v_sha is distinct from c_door_pre and v_sha is distinct from c_door_alt then
      raise exception '#1056 fix prestate: % is at %, expected the pinned pre-image % or 0344''s integrated post-image % -- a third change moved it',
        c_door_sig, v_sha, c_door_pre, c_door_alt using errcode = 'CLR10';
    end if;
  end if;

  -- THE NEIGHBOUR THIS FILE RELIES ON AND DOES NOT TOUCH: the queue arm whose WHERE clause is the
  -- reason defect 1 exists. Pinned by STRUCTURE rather than by sha, because clara.list_review_queue
  -- is spliced by six other files and its sha moves for reasons that have nothing to do with this
  -- one. If that arm ever starts asking the verdict, defect 1's premise is gone and this file's
  -- own sentence is the thing to revisit.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
  if position('''payroll_posting_blocked''::text row_kind' in v_src) = 0
     or position('pv.v->>''sentence'' question_text' in v_src) = 0 then
    raise exception '#1056 fix prestate: the payroll Needs-you arm is not where this file expects it -- the sentence it renders may no longer be the verdict''s own'
      using errcode = 'CLR10';
  end if;

  raise notice '#1056 fix prestate OK (%): the verdict and the human fact door are at their pinned images, and the Needs-you arm still renders the verdict''s own sentence.', v_mode;
end
$p1056fix_pre$;

-- =====================================================================================
-- §A — THE READY SENTENCE. One anchor, one replacement, inside clara._payroll_posting_verdict.
-- =====================================================================================
set role clara_fn_owner;

do $p1056fix_verdict$
declare
  v_sig text := 'clara._payroll_posting_verdict(uuid)';
  v_def text; v_next text; v_anchor text; v_repl text; v_n int;
  v_pre_owner text; v_pre_acl text; v_pre_sha text;
  v_post_owner text; v_post_acl text; v_post_sha text;
begin
  select p.prosrc into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('Book this month by hand from the corrected figures' in v_def) > 0 then
    raise notice '#1056 fix §A: the verdict already carries the corrected ready sentence -- redo, nothing to do';
  else
    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      into v_pre_owner, v_pre_acl, v_pre_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

    v_anchor := $p1056fa$    when 'ready' then
      format('Payroll run %s is ready to post but no entry exists yet -- re-file the payslip to post it.',
        coalesce(v_month_label, 'for this payslip'))$p1056fa$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#1056 fix §A splice: the ready-arm anchor appears % time(s), expected 1', v_n
        using errcode = 'CLR10';
    end if;

    -- TWO READY SENTENCES, because there are two ways to be ready and only one of them has an
    -- honest remedy. A reading a person has declared a figure on carries `human_declared` (0344);
    -- a machine-produced state never does, so this branch cannot fire on 0297's own road.
    v_repl := $p1056fb$    when 'ready' then
      -- #1056 fix round (0360). A run that reads `ready` because a PERSON corrected it is posted
      -- by nothing: the unattended post is reachable from clara.persist_payroll_facts alone, and
      -- re-filing reads a NEW document whose chain does not carry the correction. The old
      -- sentence sent that person to the one act that discards their work. The remedy named here
      -- exists for the same person: clara.draft_entry + clara.approve_entry.
      case when jsonb_array_length(coalesce(v_state->'human_declared','[]'::jsonb)) > 0
        then format('Payroll run %s reads as ready after the correction recorded on this payslip, but nothing will post it: a payroll run is booked only by the unattended read of a filed payslip, and re-filing reads the page afresh without that correction. Book this month by hand from the corrected figures.',
          coalesce(v_month_label, 'for this payslip'))
        else format('Payroll run %s is ready to post but no entry exists yet -- re-file the payslip to post it.',
          coalesce(v_month_label, 'for this payslip'))
      end$p1056fb$;
    v_next := replace(v_def, v_anchor, v_repl);
    if v_next = v_def then
      raise exception '#1056 fix §A splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;
    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      into v_post_owner, v_post_acl, v_post_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl then
      raise exception '#1056 fix §A postcheck: the verdict changed owner (% -> %) or ACL (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#1056 fix §A postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode = 'CLR10';
    end if;
    raise notice '#1056 fix §A: clara._payroll_posting_verdict spliced -- owner (%) and ACL byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;
end
$p1056fix_verdict$;

-- =====================================================================================
-- §B — THE ALREADY-POSTED REFUSAL. One anchor, one replacement, inside
-- clara.revise_document_fact's payroll arm. The invoice lane is not reachable from this anchor:
-- it sits inside `if v_lane = 'payroll' then`.
-- =====================================================================================
do $p1056fix_door$
declare
  v_sig text := 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)';
  v_def text; v_next text; v_anchor text; v_repl text; v_n int;
  v_pre_owner text; v_pre_acl text; v_pre_sha text; v_pre_definer boolean; v_pre_cfg text[];
  v_post_owner text; v_post_acl text; v_post_sha text; v_post_definer boolean; v_post_cfg text[];
begin
  select p.prosrc into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('live_entry_present' in v_def) > 0 then
    raise notice '#1056 fix §B: the door already names what it found -- redo, nothing to do';
  else
    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), p.prosecdef, p.proconfig
      into v_pre_owner, v_pre_acl, v_pre_sha, v_pre_definer, v_pre_cfg
      from pg_proc p where p.oid = v_sig::regprocedure;
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

    v_anchor := $p1056fc$      raise exception 'this payroll run is already posted as entry %; reverse that entry before revising the figures it was booked from', v_posted
        using errcode = 'CLR10', detail = (
          select jsonb_build_object('reason', 'payroll_run_already_posted',
            'field_path', p_field_path, 'entry_id', j.id, 'status', j.status,
            'posting_date', to_char(j.posting_date, 'YYYY-MM-DD'), 'memo', j.memo)::text
            from clara.journal_entries j where j.id = v_posted);$p1056fc$;
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then
      raise exception '#1056 fix §B splice: the posted-entry refusal anchor appears % time(s), expected 1', v_n
        using errcode = 'CLR10';
    end if;

    v_repl := $p1056fd$      -- #1056 fix round (0360). THE SENTENCE STATES WHAT WAS FOUND. The probe is
      -- clara._document_live_posted_entry, i.e. clara._document_posting_entry per live filing,
      -- which admits a LIVE EVIDENCE LINK (the arm tests no status of its own) or ANY approved
      -- un-reversed entry bound to the document -- with no payroll qualification anywhere in
      -- it. The old words asserted the entry was the
      -- payroll acquisition, which is false for a payroll summary cited as evidence on a manual
      -- journal, and false for the hand-booked entry the ready sentence now recommends. The probe
      -- is deliberately kept: anything the estate derived from this reading must come down
      -- first, which is 0217's live_bank_statement_present rule, and its naming too. One remedy
      -- serves both arms: reversing the entry also releases every live evidence link it carries
      -- (trigger t_entry_evidence_release), and no other release door exists.
      raise exception 'an entry already stands on this document (entry %); reverse that entry before the reading it stands on is revised', v_posted
        using errcode = 'CLR10', detail = (
          select jsonb_build_object('reason', 'live_entry_present',
            'field_path', p_field_path, 'entry_id', j.id, 'status', j.status,
            'posting_date', to_char(j.posting_date, 'YYYY-MM-DD'), 'memo', j.memo,
            'is_payroll_run', (j.flags -> 'payroll_run') is not null)::text
            from clara.journal_entries j where j.id = v_posted);$p1056fd$;
    v_next := replace(v_def, v_anchor, v_repl);
    if v_next = v_def then
      raise exception '#1056 fix §B splice: no byte moved -- refusing a no-op apply' using errcode = 'CLR10';
    end if;
    execute v_next;

    select p.proowner::regrole::text, p.proacl::text,
           encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), p.prosecdef, p.proconfig
      into v_post_owner, v_post_acl, v_post_sha, v_post_definer, v_post_cfg
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_post_owner is distinct from v_pre_owner or v_post_acl is distinct from v_pre_acl
       or v_post_definer is distinct from v_pre_definer or v_post_cfg is distinct from v_pre_cfg then
      raise exception '#1056 fix §B postcheck: the door changed owner (% -> %), ACL (% -> %), DEFINER-ness (% -> %) or search_path (% -> %)',
        v_pre_owner, v_post_owner, v_pre_acl, v_post_acl, v_pre_definer, v_post_definer,
        v_pre_cfg, v_post_cfg using errcode = 'CLR10';
    end if;
    if v_post_sha = v_pre_sha then
      raise exception '#1056 fix §B postcheck: prosrc sha256 did not change -- the splice was a no-op'
        using errcode = 'CLR10';
    end if;
    raise notice '#1056 fix §B: clara.revise_document_fact spliced -- owner (%), ACL, DEFINER-ness and search_path byte-unchanged. prosrc sha256: % -> %.', v_post_owner, v_pre_sha, v_post_sha;
  end if;
end
$p1056fix_door$;

reset role;

-- =====================================================================================
-- §Z — TAIL. Everything below is re-read from the COMMITTED catalog, so a redo proves it too.
-- =====================================================================================
do $p1056fix_tail$
declare
  v_src text; v_n int; v_needle text;
begin
  -- 1 · THE VERDICT: both ready sentences live, exactly once each, and 0297's own rung machinery
  --     is undisturbed.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._payroll_posting_verdict(uuid)'::regprocedure;
  foreach v_needle in array array[
    'Book this month by hand from the corrected figures.',
    'is ready to post but no entry exists yet -- re-file the payslip to post it.',
    'human_declared'] loop
    v_n := (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle);
    if v_n <> 1 then
      raise exception '#1056 fix tail: the verdict carries % % time(s), expected 1', quote_literal(v_needle), v_n
        using errcode = 'CLR10';
    end if;
  end loop;
  foreach v_needle in array array[
    'clara._payroll_entry_plan', 'channels_agree', 'arithmetic_holds',
    'no_duplicate_entry', 'period_established'] loop
    if position(v_needle in v_src) = 0 then
      raise exception '#1056 fix tail: the verdict lost 0297''s own region %', quote_literal(v_needle)
        using errcode = 'CLR10';
    end if;
  end loop;
  foreach v_needle in array array['public','clara_authenticated','clara_runtime','clara_agent_ro'] loop
    if pg_catalog.has_function_privilege(v_needle, 'clara._payroll_posting_verdict(uuid)', 'execute') then
      raise exception '#1056 fix tail: the posting verdict became callable by % -- it is reached from its two definer callers alone', v_needle
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 2 · THE DOOR: the corrected refusal, the disclosed key, and every 0344 region this file must
  --     not have disturbed.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,int,text,text)'::regprocedure;
  foreach v_needle in array array[
    'live_entry_present', 'is_payroll_run',
    'an entry already stands on this document',
    'clara._document_live_posted_entry(p_document)'] loop
    v_n := (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle);
    if v_n <> 1 then
      raise exception '#1056 fix tail: the door carries % % time(s), expected 1', quote_literal(v_needle), v_n
        using errcode = 'CLR10';
    end if;
  end loop;
  if position('payroll_run_already_posted' in v_src) <> 0 then
    raise exception '#1056 fix tail: the door still names the old reason payroll_run_already_posted'
      using errcode = 'CLR10';
  end if;
  foreach v_needle in array array[
    'clara._revisable_fact_lane(p_field_path)', 'field_path_not_revisable',
    'live_bank_statement_present', 'stale_source_version', 'payroll_value_negative',
    'payroll_value_out_of_range', 'clara._payroll_state_with_human_fact'] loop
    if position(v_needle in v_src) = 0 then
      raise exception '#1056 fix tail: the door lost region %', quote_literal(v_needle)
        using errcode = 'CLR10';
    end if;
  end loop;
  -- THE INVOICE LANE IS UNTOUCHED BY THIS FILE: the posted-entry pin is still reached only from
  -- inside the payroll arm, which is the one line that keeps 0217's invoice behaviour byte-equal.
  if position('if v_lane = ''payroll'' then
    v_posted := clara._document_live_posted_entry(p_document);' in v_src) = 0 then
    raise exception '#1056 fix tail: the posted-entry pin is no longer guarded on the payroll lane'
      using errcode = 'CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated',
        'clara.revise_document_fact(uuid,text,jsonb,int,text,text)', 'execute') then
    raise exception '#1056 fix tail: the human fact door lost its clara_authenticated EXECUTE'
      using errcode = 'CLR10';
  end if;
  foreach v_needle in array array['public','clara_runtime','clara_agent_ro'] loop
    if pg_catalog.has_function_privilege(v_needle,
         'clara.revise_document_fact(uuid,text,jsonb,int,text,text)', 'execute') then
      raise exception '#1056 fix tail: the human fact door became callable by %', v_needle
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 3 · THE REMEDY THE NEW SENTENCE NAMES IS REACHABLE BY THE PERSON IT IS SHOWN TO. A sentence
  --     that sends someone to a door they cannot open would be the same defect in a new place.
  foreach v_needle in array array['draft_entry','approve_entry'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'clara' and p.proname = v_needle
                      and pg_catalog.has_function_privilege('clara_authenticated', p.oid, 'execute')) then
      raise exception '#1056 fix tail: clara.% is not reachable by clara_authenticated -- the ready sentence names an act a person cannot perform', v_needle
        using errcode = 'CLR10';
    end if;
  end loop;

  raise notice '#1056 fix tail: OK -- clara._payroll_posting_verdict carries both ready sentences exactly once and every 0297 rung region, and stays ungranted; clara.revise_document_fact names what it found (live_entry_present + is_payroll_run), keeps the pin inside the payroll arm alone, keeps all of 0344''s regions and its clara_authenticated-only ACL; and both doors the new sentence names are reachable by the role it is shown to.';
end
$p1056fix_tail$;
