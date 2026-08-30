-- UNNUMBERED_binding_pr_3_post_time_recheck.sql -- 裁-18b PR-3: the POST-TIME binding re-check,
-- restored inside clara._approve_entry_core, plus 裁-46's revocation-reset door.
--
-- THE NUMBER IS CLAIMED AT MERGE PREPARATION (AGENTS.md hard constraint 10 +
-- .claude/rules/db-migrations.md). Every self-reference below uses the STEM
-- `binding_pr_3_post_time_recheck`, never a number, and the control witness this file mints
-- carries that stem for the same reason.
--
-- Design of record: docs/plan/active/binding-proposal-design.md, as amended by its
-- "Rulings applied 2026-08-29 (裁-25)" header block -- G6 OVERRULED, the post-time re-check is
-- RESTORED as its own PR with its own D1 window. Gate record:
-- docs/plan/active/binding-proposal-gate-record.md (G6). PR-0 gate:
-- docs/plan/active/binding-proposal-pr0-gate-2026-08-29.md (B8 and M3 are this file's contract;
-- O3 is its ruled semantics). Ruling ledgers: mohe-grill-rulings-2026-08-28.md 裁-25,
-- mohe-grill-rulings-2026-08-30.md 裁-46 / 裁-47.
--
-- =====================================================================================
-- WHAT THIS FILE DOES -- exactly the ruled PR-3 row, and nothing else
-- =====================================================================================
--   1. THE POST-TIME RE-CHECK. clara._approve_entry_core gains, immediately before the approve
--      UPDATE, the control 0029 installed in clara.execute_rule_post and 0118 dropped with the
--      rules tier. It is gated on `e.vendor_binding_id is not null` (unbound entries pay
--      nothing and take no binding lock) and on `e.reversal_of is null` (O3: REVERSALS BYPASS,
--      not optional under any arm -- an entry posted under a since-revoked binding is exactly
--      the entry you need to reverse, and refusing would block its own remedy).
--   2. THE RE-WITNESS (packages/db/README.md deploy contract D2). clara.control_witnesses gains
--      the row `binding_post_time_recheck_v1` carrying the sha256 of the body this file leaves
--      live, so clara.sign_vendor_identity_binding's identity gate OPENS. That gate has been
--      refusing `post_time_control_absent` since PR-1 (0154) shipped the registry EMPTY, on
--      purpose: PR-1's own header says the refusal ships and PR-3 lifts it.
--   3. 裁-46's DOOR. clara.reset_binding_revocation -- the named human way out of a REVOCATION,
--      which clara.reset_binding_decline refuses (`binding_revoked_reset_requires_ruling`, M-11)
--      precisely because the owner had not yet named the ceremony. He has now.
--   4. THE F-A9 PR-1B FOLLOW-UP (PROGRESS Known-issues 3d). The same body's CLR23 remedy prose
--      names a "budget" gate that F-A9 PR-1B removed. It is recut here because this file
--      recuts that body anyway, and the drafting-trio exact-equality pin moves with it.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: ONE LIVE AUDITED WRITER BODY.
-- =====================================================================================
--   1. clara._approve_entry_core(jsonb,uuid,uuid,text,text)
--      pre-image prosrc sha256 d5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637
--      (19 431 CHARACTERS -- length(), not octet_length(); 19 444 bytes), measured on a PRISTINE replay of main at frontier
--      0155_client_identifiers_unique -- the same value 0154's own SS1 pins and its tail
--      re-asserts BYTE-IDENTICAL, deliberately, so this file has an undisturbed pre-image.
--      It is replaced by SPLICE, never by retype -- see "A PATCH, NEVER A REBUILD" below.
--      THIS IS A D1 EVENT: PostgreSQL runs an in-flight PL/pgSQL call to completion on the body
--      it STARTED with, so an approval that spans this migration skips the new control entirely.
--      The quiesce guard below refuses to apply while a runtime heartbeat is fresh.
--
-- EVERYTHING ELSE IS A NEW NAME OR A NEW ROW:
--   * clara.reset_binding_revocation(uuid,text,text) -- new name, proven to resolve at exactly
--     one pg_proc row in the tail.
--   * clara.control_witnesses -- one INSERT (the registry ships empty from 0154).
--   * clara.event_types + clara.trigger_taxonomy -- ONE new member, `kb_binding.revocation_reset`,
--     registered in BOTH halves at the CURRENTLY ACTIVE taxonomy version, additively, with no
--     version flip. They are a COUPLED PAIR and registering in one alone is the half-registration
--     0154's own header records the estate's coverage census refusing.
--
-- NO new table, NO new role, NO wake_credentials CHECK change, NO wake_engine_sources row
-- (PR-4's), NO list_review_queue arm (PR-2's), NO column added to any relation.
--
-- =====================================================================================
-- A PATCH, NEVER A REBUILD (PR-0 gate B8 `[N]`)
-- =====================================================================================
-- clara._approve_entry_core is the most-spliced function in the estate (0040:6994, 0053:969).
-- Its live body is NO SINGLE FILE'S TEXT: 0015 created it, 0016 recut it, 0017 spliced it
-- dynamically (R1-F1), 0029/0035/0037 recut it, then 0040 S5, 0053 SPLICE B and 0106 §E spliced
-- it -- 0106 §E EXCISING the sighting-accrual / vendor_account breeding block whole. A PR-3 that
-- retyped from 0037's literal text would SILENTLY RESTORE that block: two clara.rule_sightings
-- inserts and an auto-proposal loop that writes a coding rule and opens a blocking question --
-- the whole rules tier F-A2 retired. So this file fetches the LIVE body, counts its anchors,
-- refuses on any drift, replaces at those anchors and executes. The postcheck re-fetches from
-- the catalog rather than trusting the local string, and asserts BOTH that the new control
-- landed exactly once AND that every marker 0040's own anti-revert census pins is still at its
-- measured count -- so a silent revert of any earlier splice reds this apply.
--
-- =====================================================================================
-- THE PORT SOURCE IS 0046, NOT 0029 (PR-0 gate B8 `[N]` correction)
-- =====================================================================================
-- clara.execute_rule_post was CoR'd twice after 0029: 0030:456 (F1 became the window's LCP, so
-- the test is `starts_with`, not equality) and 0046:782 (the sales lane). THE LAST LIVE SHAPE
-- BEFORE 0118 DROPPED IT IS 0046:1364-1683, and that is what is ported here. Porting 0029 would
-- have re-introduced the pre-LCP F1 EQUALITY test and quietly narrowed a live authority.
--
-- The port is FAITHFUL except where the owner ruled otherwise, and every deviation is named:
--
--   O3 (RULED 2026-08-29, delegation): "REFUSE on revoked, ANNOTATE-and-post on expired,
--   REVERSALS BYPASS", with the `e.vendor_binding_id is not null` gate riding along.
--     · REVOKED  -> raise CLR36 `binding_revoked`. A human took the authority away.
--     · EXPIRED  -> the entry POSTS. A clock ran out, possibly two days ago, on an entry drafted
--                   last week; refusing would strand legitimate work over a date. The divergence
--                   is RECORDED -- a phase='post' clara.vendor_binding_resolutions row with
--                   outcome='divergence' and refusal_reason='binding_expired' -- and ANNOTATED
--                   on both the audit row and the door's own return, so the annotation reaches
--                   the caller rather than living only in a table nobody reads.
--     · every OTHER reason -> raise CLR36 with that reason. Identity drift, feature drift, lost
--                   corroboration, an ambiguous page, a page that resolves to somebody else: all
--                   of them mean this document is no longer the vendor the authority names.
--
--   0046 refused `binding_expired` and returned a skip. It could: it ran INSIDE
--   clara.execute_rule_post, which had a non-raising skip channel. This body has none -- every
--   refusal here is a RAISE, and a raise rolls the whole call back. That is stated plainly
--   rather than worked around: A REFUSED POST-TIME CHECK LEAVES NO vendor_binding_resolutions
--   ROW, because the insert dies with the transaction. What it leaves is the entry, still a
--   DRAFT, plus the typed CLR36 the caller receives -- which is the durable evidence a refusal
--   actually has. PostgreSQL cannot give a function an autonomous transaction; 0126:158-170 and
--   0154's own "WHY A REFUSAL WRITES NO RECEIPT" block record the identical posture for their
--   doors. Do not read the absence of a refused post-time row as evidence no check ran.
--
-- =====================================================================================
-- LOCK ORDER, stated because this block takes a key the body did not take before
-- =====================================================================================
-- The block takes clara._binding_lock_pair(client, counterparty) BEFORE its `for update` on the
-- binding row -- steps (2) then (3) of 0154 SS5b's one order, the same order every binding
-- lifecycle writer takes. It sits AFTER the advisory keys this body already holds (203005003
-- vendor, 203005004 client, 203005005 duplicate), and that cannot close a cycle: NO binding
-- lifecycle writer takes any of those three keys. That is MEASURED, not reasoned -- and the
-- arithmetic is stated exactly, because an earlier cut of this comment double-counted the agent
-- core inside "both proposal doors" and reported eight where it had enumerated nine.
--   BEFORE this file: SIX bodies call clara._binding_lock_pair --
--     propose_vendor_identity_binding · _propose_vendor_binding_agent_core ·
--     sign_vendor_identity_binding · decline_vendor_identity_binding ·
--     reset_binding_decline · _expire_stale_proposals
--   AFTER this file: EIGHT -- the two it adds are clara._approve_entry_core (this splice) and
--     clara.reset_binding_revocation (SS3).
-- Of all eight, clara._approve_entry_core is the ONLY one that also names 203005003 / 203005004
-- / 203005005. So nothing this body waits on can be waiting on something this body holds.
--
-- RECORDED, not new: clara.revoke_vendor_identity_binding takes the ROW lock and no pair key at
-- all -- 0154 SS5b's own enumeration excludes it. It is safe against THIS block for a reason
-- rather than by luck: the block re-reads the binding row `for update`, so a revoke that commits
-- between the unlocked pair read and that row lock is seen, under READ COMMITTED, by definition.
-- The pair key is what makes the SUPPRESSION read non-stale -- an unlocked read of OTHER rows
-- for the pair is exactly the launder C-1 drove two-session.
--
-- =====================================================================================
-- WHAT THE CHECK DOES **NOT** DO, so nobody reads more into it than is there
-- =====================================================================================
--   * It does not re-run clara._binding_extra_blocker. Those walls judge a PROPOSAL CORPUS
--     (p_derived / p_basis) that does not exist at post time; 0154's own comment says they
--     protect NEW proposals only. What this block re-derives is what 0046 re-derived: the
--     document in front of it, against the authority the draft claimed.
--   * It does not retro-check entries already approved. It is an approve-time control.
--   * It does not touch clara._coding_lane_core or the frozen derivation (G3, S4).
--   * It writes no receipt on refusal (above), and mints no new refusal vocabulary beyond the
--     one suppression word named in the ladder.

set local statement_timeout = '5min';
-- PRECAUTIONARY, not load-bearing: this file takes no ACCESS EXCLUSIVE on a large relation.
set local lock_timeout = '5s';
-- Load-bearing, not cosmetic: the tail compares a prestate function census against a post-DDL
-- one, and an unpinned search_path renders argument types qualified-or-bare by session.
set local search_path = clara, pg_temp;

-- =====================================================================================
-- SSQ -- THE D1 QUIESCE GUARD. Refuse to apply while a writer might be mid-call.
-- =====================================================================================
do $bp3_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'binding pr-3 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT -- the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode = 'CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'binding pr-3 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) -- this file replaces clara._approve_entry_core, and an in-flight approval finishes on the OLD body and skips the post-time binding re-check entirely (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$bp3_quiesce$;

-- =====================================================================================
-- SS1 -- PRESTATE. Fail-closed; an absent or wrong-shaped premise aborts the apply, loudly.
-- =====================================================================================
-- The temp table is how "UNMOVED" becomes a MEASUREMENT rather than a magic number written in a
-- comment: the tail compares against what this file actually saw, not against what its author
-- believed on the day it was written.
create temp table _bp3_pre(k text primary key, v text) on commit drop;

do $bp3_pre$
declare
  v_n int; v_sha text; v_missing text; v_def text; r record;
  -- THE PIN. Measured on a pristine 0001..0155 replay, never copied from a comment.
  v_pin text := 'd5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637';
  v_sig text := 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)';
begin
  -- (a) THE FRONTIER FLOOR. Keyed on PR-1's stem as a FLOOR, not an equality: a sibling landing
  -- between authoring and merge must not turn a true premise into a false abort (0154's own
  -- lesson, paid for three times).
  if not exists (select 1 from clara.schema_migrations where version like '%binding_proposal_pr_1') then
    raise exception 'binding pr-3 prestate: 裁-18b PR-1 (the binding_proposal_pr_1 stem) is not applied -- this file mints the control witness ITS registry gate reads, and there is no registry without it'
      using errcode = 'CLR10';
  end if;

  -- (a2) IDEMPOTENCY FIRST, so a genuine RE-APPLY says "already applied" rather than "the body
  -- drifted". Ordering matters here for a human reason: the sha pin below is TRUE of a re-apply
  -- too -- the body really is no longer the pre-image -- and a deploy operator reading "drifted"
  -- would go hunting for a foreign change that never happened. Both halves are probed, because
  -- a half-applied database (body spliced, witness missing) is its own failure and must not be
  -- reported as either of the clean ones.
  if to_regprocedure(v_sig) is not null then
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
    if position('binding_post_time_recheck_v1' in v_def) <> 0 then
      raise exception 'binding pr-3 prestate: clara._approve_entry_core already carries the post-time re-check (witness row present: %) -- this file has already been applied to this database',
        exists (select 1 from clara.control_witnesses where control = 'binding_post_time_recheck_v1')
        using errcode = 'CLR10';
    end if;
  end if;

  -- (b) THE BODY THIS FILE REPLACES IS THE BODY THAT WAS REVIEWED. Identity, not a name.
  if to_regprocedure(v_sig) is null then
    raise exception 'binding pr-3 prestate: % does not resolve -- the approve path is GONE', v_sig
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = '_approve_entry_core';
  if v_n <> 1 then
    raise exception 'binding pr-3 prestate: expected exactly ONE clara._approve_entry_core overload, found % -- a second overload would leave one body unspliced and reachable', v_n
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_sig::regprocedure;
  if v_sha is distinct from v_pin then
    raise exception 'binding pr-3 prestate: clara._approve_entry_core is at prosrc sha % , not the reviewed % -- the body drifted since this splice was derived; re-derive every anchor against the LIVE catalog before deploying', v_sha, v_pin
      using errcode = 'CLR10';
  end if;

  -- (c) THE REGISTRY IS PRESENT AND THIS CONTROL IS NOT YET WITNESSED. Both halves measured
  -- positively: an absent registry and an already-minted row are different failures.
  if to_regclass('clara.control_witnesses') is null then
    raise exception 'binding pr-3 prestate: clara.control_witnesses is absent'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.control_witnesses where control = 'binding_post_time_recheck_v1') then
    raise exception 'binding pr-3 prestate: the control binding_post_time_recheck_v1 is ALREADY witnessed -- this file has been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- (d) NOTHING THIS FILE CREATES MAY ALREADY EXIST.
  if to_regprocedure('clara.reset_binding_revocation(uuid,text,text)') is not null then
    raise exception 'binding pr-3 prestate: clara.reset_binding_revocation already exists'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.event_types where name = 'kb_binding.revocation_reset') then
    raise exception 'binding pr-3 prestate: the event type kb_binding.revocation_reset is already registered'
      using errcode = 'CLR10';
  end if;

  -- (e) EVERY UPSTREAM THE SPLICED BLOCK CALLS RESOLVES BY EXACT SIGNATURE. A bare name is a
  -- projection of the thing (review law 3); an absent helper would fail at RUNTIME, inside a
  -- live approval, long after this apply reported success.
  select string_agg(t.s, ', ' order by t.s) into v_missing
    from (values ('clara._binding_lock_pair(uuid,uuid)'),
                 ('clara._binding_suppression(uuid,uuid,uuid)'),
                 ('clara._binding_normalize(text)'),
                 ('clara._binding_f3_holds(uuid,text,text)'),
                 ('clara._canonical_counterparty(uuid,uuid)'),
                 ('clara._resolve_counterparty(uuid,jsonb)'),
                 ('clara._human_ctx(integer)'),
                 ('clara.role_rank(text)')) t(s)
   where to_regprocedure(t.s) is null;
  if v_missing is not null then
    raise exception 'binding pr-3 prestate: upstream(s) missing at exact signature: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (f) THE RESOLUTION LEDGER STILL ADMITS phase='post' AND outcome='divergence'. 0029 wrote
  -- phase='post'; nothing has since 0118, so the vocabulary is measured rather than assumed.
  if to_regclass('clara.vendor_binding_resolutions') is null then
    raise exception 'binding pr-3 prestate: clara.vendor_binding_resolutions is absent'
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_binding_resolutions'::regclass
     and conname = 'vendor_binding_resolutions_phase_check';
  if v_def is null or position('''post''' in v_def) = 0 then
    raise exception 'binding pr-3 prestate: vendor_binding_resolutions.phase does not admit ''post'' (def %)', coalesce(v_def,'(absent)')
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_binding_resolutions'::regclass
     and conname = 'vendor_binding_resolutions_outcome_check';
  if v_def is null or position('''divergence''' in v_def) = 0 then
    raise exception 'binding pr-3 prestate: vendor_binding_resolutions.outcome does not admit ''divergence'' (def %)', coalesce(v_def,'(absent)')
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.vendor_binding_resolutions where phase = 'post';
  raise notice 'binding pr-3 prestate: % existing phase=post resolution row(s) -- the producer has been dead since 0118 and this file is its successor', v_n;

  -- (g) THE STATUS CHECKS THE 裁-46 DOOR RELIES ON. ck_vib_revoked pairs status with the stamp,
  -- so a revoked -> expired move MUST null revoked_at; if that CHECK ever stops being an
  -- equality the door's UPDATE would leave an inconsistent row instead of refusing.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = 'ck_vib_revoked';
  if v_def is distinct from 'CHECK (((status = ''revoked''::text) = (revoked_at IS NOT NULL)))' then
    raise exception 'binding pr-3 prestate: ck_vib_revoked is not the expected bidirectional equality (found %)', coalesce(v_def,'(absent)')
      using errcode = 'CLR10';
  end if;

  -- (h) THE TAXONOMY IS COHERENT BEFORE THIS FILE ADDS TO IT: coverage WHOLE over the whole
  -- registry at the active version. A half-registered predecessor would make this file's own
  -- coverage proof pass for the wrong reason.
  select count(*) into v_n from clara.event_types t
   where not exists (select 1 from clara.trigger_taxonomy x
                      where x.event_type = t.name and x.version = (select version from clara.taxonomy_active));
  if v_n <> 0 then
    raise exception 'binding pr-3 prestate: % event type(s) carry no trigger_taxonomy row at the active version -- coverage is already broken', v_n
      using errcode = 'CLR10';
  end if;

  -- (i) THE FIVE SPLICE ANCHORS, EACH AT AN EXACT COUNT. replace() rewrites EVERY occurrence, so
  -- a drifted body holding two copies of an anchor would take two splices while a position()>0
  -- postcheck stayed green (0036 review F4, restated at 0038:7785 and 0039). Counted, never
  -- merely probed. The count is taken on pg_get_functiondef -- the same text the splice edits.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  for r in select * from (values
      ('A1-declares',   $a1$  v_obo uuid; v_via_wake_kind text; v_is_agent boolean; v_post_receipt_id uuid;$a1$),
      ('A2-approve-update', $a2$  update clara.journal_entries set status='approved',checker_actor=c.actor,
    approved_at=now(),self_approval_attestation=v_attest,$a2$),
      ('A3-budget-prose', $a3$lane, consent, budget or attempt gates$a3$),
      ('A4-audit-warning', $a4$      || case when v_no_cp_warning is not null
           then jsonb_build_object('warning',v_no_cp_warning) else '{}'::jsonb end);$a4$),
      ('A5-return-warning', $a5$      || case when v_no_cp_warning is not null
           then jsonb_build_object('warnings',jsonb_build_array(v_no_cp_warning))
           else '{}'::jsonb end);$a5$)
    ) t(k, s)
  loop
    v_n := (length(v_def) - length(replace(v_def, r.s, ''))) / length(r.s);
    if v_n <> 1 then
      raise exception 'binding pr-3 prestate: splice anchor % appears % time(s), expected exactly 1 -- the body drifted; re-derive this splice against the live catalog', r.k, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (k2) THE NEIGHBOURING BODIES, HASHED **NOW**, so the tail's "nothing else moved" claim is a
  -- genuine BEFORE/AFTER equality rather than a hard-coded frontier snapshot. The difference is
  -- not cosmetic: a literal sha proves "this body is one particular known body", which goes false
  -- the moment a coordinated sibling PR lands ahead of this one and is a merge-order landmine; a
  -- before/after equality proves the thing the section actually claims -- THIS FILE did not move
  -- it -- and stays true at every frontier.
  -- THE WHOLE IDENTITY, not only the bytes (#452 review, ruled in). A body can MOVE without its
  -- prosrc moving at all: a GRANT rewrites proacl, an ALTER FUNCTION OWNER TO rewrites proowner,
  -- a `set search_path` change rewrites proconfig, and SECURITY DEFINER / VOLATILE are one ALTER
  -- away each. A sha-only stash passes an ACL wipe -- the reviewer proved exactly that -- so the
  -- five other columns that make a function what it is are stashed beside it and compared too.
  insert into _bp3_pre(k,v)
  select 'sha:'||s,
         (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
                 || '|acl='   || coalesce(p.proacl::text, '(default)')
                 || '|owner=' || p.proowner::regrole::text
                 || '|cfg='   || coalesce(array_to_string(p.proconfig, ','), '(none)')
                 || '|secdef='|| p.prosecdef::text
                 || '|vol='   || p.provolatile
            from pg_proc p where p.oid = to_regprocedure(s))
    from unnest(array['clara.propose_vendor_identity_binding(jsonb,text)',
                      'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)',
                      'clara._coding_lane_core(uuid,uuid)']) s;
  select string_agg(substr(k,5), ', ' order by k) into v_missing from _bp3_pre
   where k like 'sha:%' and v is null;
  if v_missing is not null then
    raise exception 'binding pr-3 prestate: neighbouring body/bodies do not resolve: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- (k) THE BASELINE the tail compares "unmoved" against.
  insert into _bp3_pre(k,v) values
    ('taxonomy_versions', (select count(*)::text from clara.taxonomy_versions)),
    ('taxonomy_active',   (select version::text from clara.taxonomy_active)),
    ('event_types',       (select count(*)::text from clara.event_types)),
    ('post_resolutions',  (select count(*)::text from clara.vendor_binding_resolutions where phase='post')),
    ('clara_functions',   (select count(*)::text from pg_proc p where p.pronamespace='clara'::regnamespace));

  raise notice 'binding pr-3 prestate: clean -- one _approve_entry_core overload at the reviewed sha %, five anchors each at exactly 1, control_witnesses present and this control unwitnessed, eight upstreams resolve at exact signature, the resolution ledger admits post/divergence, ck_vib_revoked is the bidirectional equality, taxonomy coverage whole at version % over % event type(s), % clara function(s).',
    v_pin,
    (select v from _bp3_pre where k='taxonomy_active'),
    (select v from _bp3_pre where k='event_types'),
    (select v from _bp3_pre where k='clara_functions');
end
$bp3_pre$;

-- =====================================================================================
-- SS2 -- THE SPLICE. ONE fetch, FIVE replacements, ONE execute -- so the body this file
-- leaves live is the body the witness in SS4 hashes.
-- =====================================================================================
set role clara_fn_owner;

do $bp3_splice$
declare
  v_sig text := 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)';
  v_def text; v_n int; r record;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

  -- ---------------------------------------------------------------------------------
  -- (1) THE DECLARES. Every name is v_pt_* -- a prefix nothing else in this body uses, so a
  -- future splice cannot collide with one of them by accident.
  -- ---------------------------------------------------------------------------------
  v_def := replace(v_def,
    $a1$  v_obo uuid; v_via_wake_kind text; v_is_agent boolean; v_post_receipt_id uuid;$a1$,
    $t1$  v_obo uuid; v_via_wake_kind text; v_is_agent boolean; v_post_receipt_id uuid;
  -- 裁-18b PR-3 (G6 RESTORED, ruled 2026-08-29): the POST-TIME binding re-check's locals.
  v_pt_b record; v_pt_cpb record;
  v_pt_facts uuid; v_pt_facts_env jsonb; v_pt_ocr uuid;
  v_pt_vendor_name text; v_pt_vendor_reg text; v_pt_invoice_norm text; v_pt_f3_ok boolean;
  v_pt_matches int; v_pt_matching_binding uuid; v_pt_matching_f2 text;
  v_pt_draft_res uuid; v_pt_draft_binding uuid; v_pt_draft_facts uuid; v_pt_draft_ocr uuid;
  v_pt_res_facts uuid; v_pt_res_ocr uuid;
  v_pt_f1_current text; v_pt_f1_ok boolean; v_pt_f2_ok boolean; v_pt_matching_f2_ok boolean;
  v_pt_live boolean; v_pt_vi jsonb; v_pt_reason text;
  v_pt_receipt_ambiguous boolean; v_pt_receipt_uncorroborated boolean; v_pt_a1_clean boolean;
  v_pt_page_fp jsonb; v_pt_page_birth boolean; v_pt_page_candidate uuid;
  v_pt_page_counterparty uuid; v_pt_page_same boolean; v_pt_page_ambiguous boolean;
  v_pt_detail text; v_pt_detail_j jsonb;
  v_pt_suppression text; v_pt_outcome text; v_pt_annotate boolean; v_pt_warning jsonb;
  v_pt_expired boolean; v_pt_lifted boolean;$t1$);

  -- ---------------------------------------------------------------------------------
  -- (2) THE CONTROL ITSELF, immediately before the approve UPDATE -- after every other wall,
  -- before any mutation this function makes to the entry.
  -- ---------------------------------------------------------------------------------
  v_def := replace(v_def,
    $a2$  update clara.journal_entries set status='approved',checker_actor=c.actor,
    approved_at=now(),self_approval_attestation=v_attest,$a2$,
    $t2$  -- ===================================================================================
  -- 裁-18b PR-3 -- THE POST-TIME BINDING RE-CHECK (control binding_post_time_recheck_v1).
  -- ===================================================================================
  -- Ported from clara.execute_rule_post's LAST LIVE SHAPE (0046:1364-1683), not from 0029:
  -- 0030 made F1 the window's LCP, so every F1 test here is a PREFIX relation, never the
  -- pre-LCP equality. 0118 dropped that body with the rules tier and nothing has written a
  -- phase='post' resolution since; a binding revoked between draft and approval has been able
  -- to carry its identity attribution onto a posted entry for the whole of that window.
  --
  -- TWO GATES, both ruled (O3, 2026-08-29):
  --   * `e.vendor_binding_id is not null` -- fourteen call sites reach this body and most carry
  --     no binding at all; an ungated check would fire in every one of them.
  --   * `e.reversal_of is null` -- REVERSALS BYPASS ENTIRELY (O3, and not optional under any
  --     arm). STATED ACCURATELY, because the obvious reading overclaims: NO caller can put a
  --     binding marker on a reversal today -- clara.reverse_entry builds the mirror WITHOUT
  --     vendor_binding_id (measured on its live body), and only _draft_entry_core / revise_entry
  --     write that column. So the bypass is not what keeps the remedy reachable right now; the
  --     gate above it already is. It is DEFENCE IN DEPTH against the day a reversal path does
  --     carry the marker, and the rig reaches it only by building such an entry by hand
  --     (bpr3.C7). Without it, an entry posted under a since-revoked binding would be refused
  --     the very reversal that remedies it -- a control blocking its own remedy.
  if e.vendor_binding_id is not null and e.reversal_of is null then
    -- 0154 SS5b's ONE ORDER: the pair key BEFORE the row lock. The pair columns are immutable
    -- and have no writer anywhere, so reading them unlocked cannot go stale; what the key
    -- protects is the SUPPRESSION read below, which ranges over OTHER rows of the same pair.
    select v.firm_id, v.client_id, v.counterparty_id into v_pt_b
      from clara.vendor_identity_bindings v where v.id = e.vendor_binding_id;
    if not found then
      raise exception 'binding marker has no authority row'
        using errcode='CLR36',detail='{"reason":"binding_changed","class":"binding_post_time"}';
    end if;
    perform clara._binding_lock_pair(v_pt_b.client_id, v_pt_b.counterparty_id);

    select * into v_pt_b from clara.vendor_identity_bindings
      where id = e.vendor_binding_id for update;
    if not found then
      raise exception 'binding marker has no authority row'
        using errcode='CLR36',detail='{"reason":"binding_changed","class":"binding_post_time"}';
    end if;
    -- THE OWN-CLIENT WALL. The marker is a bare uuid on the entry, so an authority belonging to
    -- another client (or another firm) would otherwise be honoured verbatim.
    if v_pt_b.firm_id is distinct from e.firm_id or v_pt_b.client_id is distinct from e.client_id then
      raise exception 'the vendor identity binding belongs to another book'
        using errcode='CLR36',detail='{"reason":"binding_changed","class":"binding_post_time"}';
    end if;
    -- A bound entry with no document has nothing to re-derive against, and the resolution
    -- ledger's document_id is NOT NULL. Fail closed rather than post an unverifiable authority.
    if e.document_id is null then
      raise exception 'a bound entry carries no document to re-check'
        using errcode='CLR36',detail='{"reason":"binding_changed","class":"binding_post_time"}';
    end if;

    select * into v_pt_cpb from clara.counterparties
     where id = v_pt_b.counterparty_id and firm_id = v_pt_b.firm_id and client_id = v_pt_b.client_id;

    -- Current latest-done facts and OCR pinned in ONE statement snapshot, so the
    -- _binding_f3_holds call's own latest-OCR selection coincides with v_pt_ocr.
    select fx.id,fx.envelope,ox.id,
      vn.vendor_name,vr.vendor_registration,
      clara._binding_normalize(ii.invoice_id),
      clara._binding_f3_holds(e.document_id,v_pt_cpb.registration_normalized,v_pt_cpb.name_normalized),
      bm.match_count,bm.binding_id,bm.f2_invoice_prefix
      into v_pt_facts,v_pt_facts_env,v_pt_ocr,
        v_pt_vendor_name,v_pt_vendor_reg,v_pt_invoice_norm,v_pt_f3_ok,
        v_pt_matches,v_pt_matching_binding,v_pt_matching_f2
    from (
      select x.id,x.envelope from clara.document_extractions x
       where x.document_id=e.document_id and x.engine_kind='invoice_facts' and x.status='done'
       order by x.version_n desc,x.id desc limit 1
    ) fx
    left join lateral (
      select x.id from clara.document_extractions x
       where x.document_id=e.document_id and x.engine_kind='ocr' and x.status='done'
       order by x.version_n desc,x.id desc limit 1
    ) ox on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as vendor_name
        from clara.document_regions dr
       where dr.extraction_id=fx.id and dr.field_path='invoice.vendor_name'
    ) vn on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as vendor_registration
        from clara.document_regions dr
       where dr.extraction_id=fx.id and dr.field_path='invoice.vendor_registration'
    ) vr on true
    left join lateral (
      select nullif(btrim(min(dr.text_content)),'') as invoice_id
        from clara.document_regions dr
       where dr.extraction_id=fx.id and dr.field_path='invoice.invoice_id'
    ) ii on true
    left join lateral (
      select count(*)::int as match_count,
        (array_agg(b2.id order by b2.id))[1] as binding_id,
        (array_agg(b2.f2_invoice_prefix order by b2.id))[1] as f2_invoice_prefix
        from clara.vendor_identity_bindings b2
        join clara.counterparties cp2
          on cp2.id=b2.counterparty_id and cp2.firm_id=b2.firm_id and cp2.client_id=b2.client_id
       where b2.client_id=e.client_id and b2.status='live' and b2.expires_at>now()
         and clara._binding_normalize(vn.vendor_name) is not null
         and starts_with(clara._binding_normalize(vn.vendor_name),b2.f1_vendor_name_norm)
         and cp2.merged_into is null and cp2.retired_at is null
         and cp2.registration_normalized is not distinct from b2.registration_at_signing
         and clara._binding_f3_holds(e.document_id,cp2.registration_normalized,cp2.name_normalized)
    ) bm on true;

    select vr2.id,vr2.binding_id,vr2.facts_extraction_id,vr2.ocr_extraction_id
      into v_pt_draft_res,v_pt_draft_binding,v_pt_draft_facts,v_pt_draft_ocr
      from clara.vendor_binding_resolutions vr2
     where vr2.entry_id=e.id and vr2.phase='draft'
     order by vr2.created_at desc,vr2.id desc limit 1;

    v_pt_res_facts:=coalesce(v_pt_facts,v_pt_draft_facts);
    v_pt_res_ocr:=coalesce(v_pt_ocr,v_pt_draft_ocr);
    v_pt_f1_current:=clara._binding_normalize(v_pt_vendor_name);
    v_pt_f1_ok:=v_pt_f1_current is not null
      and starts_with(v_pt_f1_current,v_pt_b.f1_vendor_name_norm);
    v_pt_f2_ok:=v_pt_invoice_norm is not null
      and starts_with(v_pt_invoice_norm,v_pt_b.f2_invoice_prefix);
    v_pt_matching_f2_ok:=coalesce(v_pt_matches,0)=1 and v_pt_invoice_norm is not null
      and starts_with(v_pt_invoice_norm,v_pt_matching_f2);
    v_pt_live:=v_pt_b.status='live' and v_pt_b.expires_at>now();
    v_pt_receipt_ambiguous:=false; v_pt_receipt_uncorroborated:=false; v_pt_a1_clean:=false;
    v_pt_page_birth:=false; v_pt_page_same:=false; v_pt_page_ambiguous:=false;

    -- The receipt half of A.1, allowlist identical to 0028's. For outcome='absent' the four
    -- always-present producer counters have EXACT values: absent=1, matched/typed_collapsed/
    -- emitted=0 -- an allowlist-only partial shape is the production defect finding C fixed.
    v_pt_vi:=v_pt_facts_env->'vendor_identity';
    if jsonb_typeof(v_pt_vi) is distinct from 'object'
       or jsonb_typeof(v_pt_vi->'candidates') is distinct from 'array' then
      v_pt_reason:='binding_receipt_unrecognized';
    elsif exists (
      select 1 from jsonb_object_keys(v_pt_vi) k
       where k not in ('matched','absent','ambiguous','rejected_gate','below_band',
         'height_missing','unit_unresolved','no_geometry','label_continuation',
         'no_vendor_anchor','vendor_anchor_far','closer_to_customer',
         'typed_collapsed','typed_disagreement','typed_vs_ambiguous','emitted',
         'candidates','outcome','value_raw','occurrences','distinct_keys')
    ) then
      v_pt_reason:='binding_receipt_unrecognized';
    elsif v_pt_vi->>'outcome' not in ('absent','ambiguous','matched','typed_disagreement') then
      v_pt_reason:='binding_receipt_unrecognized';
    else
      if v_pt_vi->>'outcome'='absent' then
        if v_pt_vi->'absent' is distinct from '1'::jsonb
           or v_pt_vi->'matched' is distinct from '0'::jsonb
           or v_pt_vi->'typed_collapsed' is distinct from '0'::jsonb
           or v_pt_vi->'emitted' is distinct from '0'::jsonb
           or v_pt_vi ?| array['value_raw','occurrences','distinct_keys'] then
          v_pt_reason:='binding_receipt_unrecognized';
        elsif jsonb_array_length(v_pt_vi->'candidates')<>0
           or exists (select 1 from unnest(array['ambiguous','typed_disagreement','typed_vs_ambiguous']) k
                       where v_pt_vi ? k and v_pt_vi->k is distinct from '0'::jsonb) then
          v_pt_receipt_ambiguous:=true;
        elsif exists (select 1 from unnest(array['below_band','height_missing','unit_unresolved',
                        'no_geometry','rejected_gate','label_continuation','no_vendor_anchor',
                        'vendor_anchor_far','closer_to_customer']) k
                       where v_pt_vi ? k and v_pt_vi->k is distinct from '0'::jsonb) then
          v_pt_receipt_uncorroborated:=true;
        elsif v_pt_vendor_reg is null then
          v_pt_a1_clean:=true;
        end if;
      elsif v_pt_vi->>'outcome' in ('ambiguous','typed_disagreement') then
        v_pt_receipt_ambiguous:=true;
      end if;
    end if;

    -- A.1 condition 5 / A.5 step 5 share ONE page-resolution attempt. The extracted
    -- registration is supplied to the ordinary resolver, so the equality-success path is
    -- reachable for a registered vendor. clara._resolve_counterparty is STABLE and writes
    -- nothing -- a 'birth' DECISION here is a verdict about the landscape, not an insert.
    if v_pt_reason is null and v_pt_vendor_name is not null then
      begin
        v_pt_page_fp:=clara._resolve_counterparty(e.client_id,
          jsonb_strip_nulls(jsonb_build_object('kind','vendor',
            'new',jsonb_build_object('name',v_pt_vendor_name,
              'registration_no',v_pt_vendor_reg))));
      exception
        when sqlstate 'CLR21' then
          v_pt_page_ambiguous:=true; v_pt_page_fp:=null;
        when sqlstate 'CLR23' then
          get stacked diagnostics v_pt_detail=pg_exception_detail;
          begin
            v_pt_detail_j:=nullif(v_pt_detail,'')::jsonb;
          exception when others then
            v_pt_detail_j:=null;
          end;
          if coalesce(v_pt_detail_j->>'reason','')='registration_conflict' then
            begin
              v_pt_page_candidate:=nullif(v_pt_detail_j->>'candidate_id','')::uuid;
            exception when others then
              v_pt_page_candidate:=null;
            end;
          end if;
          if v_pt_page_candidate is null then
            v_pt_page_ambiguous:=true;
          end if;
          v_pt_page_fp:=null;
      end;
    end if;
    if v_pt_page_fp is not null and v_pt_page_fp->>'decision'='birth' then
      v_pt_page_birth:=true;
    elsif v_pt_page_fp is not null and v_pt_page_fp->>'decision'<>'birth' then
      begin
        v_pt_page_counterparty:=clara._canonical_counterparty(
          e.client_id,(v_pt_page_fp->>'counterparty_id')::uuid);
      exception when sqlstate 'CLR23' then
        v_pt_page_counterparty:=null; v_pt_page_ambiguous:=true;
      end;
      v_pt_page_same:=v_pt_page_counterparty is not null
        and v_pt_page_counterparty is not distinct from v_pt_b.counterparty_id;
    end if;

    if v_pt_reason is null then
      if v_pt_receipt_ambiguous then
        v_pt_reason:='binding_ambiguous';
      elsif v_pt_a1_clean then
        if v_pt_page_birth
           or v_pt_page_candidate is not distinct from v_pt_b.counterparty_id
           or v_pt_page_same then
          null;
        elsif v_pt_page_candidate is not null or v_pt_page_counterparty is not null then
          v_pt_reason:='binding_page_resolves_other';
        elsif v_pt_page_ambiguous then
          v_pt_reason:='binding_ambiguous';
        else
          v_pt_reason:='binding_changed';
        end if;
      elsif v_pt_page_same then
        null;
      elsif v_pt_page_counterparty is not null then
        v_pt_reason:='binding_page_resolves_other';
      elsif v_pt_page_ambiguous or v_pt_page_candidate is not null then
        v_pt_reason:='binding_ambiguous';
      elsif v_pt_receipt_uncorroborated then
        v_pt_reason:='binding_uncorroborated';
      else
        v_pt_reason:='binding_changed';
      end if;
    end if;

    -- THE PAIR-LEVEL HUMAN "NO" (0154 SS6a). The row-status rungs below see only the authority
    -- the DRAFT named; this sees the PAIR. Defence in depth rather than a second implementation
    -- of the same fact: 0154's signer already refuses a suppressed pair, so reaching here with
    -- a live binding on a suppressed pair should be impossible -- and if it ever is possible,
    -- the fail-closed direction on a wall a human deliberately raised is to leave it standing.
    v_pt_suppression:=clara._binding_suppression(e.firm_id,e.client_id,v_pt_b.counterparty_id);

    -- FIRST REASON WINS, and REVOKED outranks everything: a human took the authority away.
    --
    --
    -- THE ONE PLACE THIS PORT DEVIATES FROM 0046'S PRECEDENCE, AND WHY IT HAS TO.
    -- 0046 judged the clock SECOND, right after revocation, and unguarded -- expiry overrode any
    -- reason the receipt/page ladder had already found. That was harmless there because 0046
    -- REFUSED on expiry: overriding one refusal with another still refuses. Under O3 expiry
    -- ANNOTATES AND POSTS, so a verbatim port would let a stale clock MASK a live identity
    -- problem and wave the entry through -- the exact opposite of what "annotate" is for.
    --
    -- So the chain is judged in THREE passes, and the split is not cosmetic:
    --   (1) EVERYTHING THAT OUTRANKS THE CLOCK. Revocation, the human "no", and every rung that
    --       is a fact about THIS document against THIS authority -- none of which cares whether
    --       the authority is still live.
    --   (2) THE CLOCK, only if pass (1) found nothing. Annotate-and-post is lawful when a date
    --       ran out and NOTHING ELSE is wrong.
    --   (3) THE RUNGS DEFINED OVER THE LIVE BINDING POPULATION. `bm` counts bindings filtered
    --       `status='live' and expires_at>now()`, so for an expired row it is 0 BY CONSTRUCTION
    --       and every `matches`-based arm would fire for a reason that is really just the clock
    --       again. They are therefore asked only of a binding that IS live -- which is exactly
    --       the population they were ever able to describe.
    --
    -- WHAT THIS COSTS, stated rather than buried: for a LIVE binding with MORE THAN ONE rung
    -- true at once, the reported WORD can differ from 0046's, because three `matches`-based arms
    -- moved below f1/f2/f3. The refusal itself is unchanged in every such case -- the same set of
    -- states refuses, and only the discriminant a classifier reads can move.
    v_pt_expired := (v_pt_b.status='expired' or v_pt_b.expires_at<=now());
    -- FIND-2 (#452 native review, RULED): A LIFTED REVOCATION IS NOT A CLOCK EXPIRY, and must
    -- not be narrated as one. 裁-46 lands a reset revocation on `expired` deliberately (it is the
    -- estate's terminal status that no wall keys on), which means the two states are
    -- INDISTINGUISHABLE by status alone -- so a human reading "the binding had expired" on a
    -- posted entry would be told a clock ran out when in fact an admin had taken the authority
    -- away and another had given it back.
    -- THE FINGERPRINT IS EXACT, not a heuristic: clara.reset_binding_revocation is the ONLY
    -- writer that clears `revoked_at` while LEAVING `revoked_by` (it says so, and ck_vib_revoked
    -- forces the clear), and a fresh proposal for the pair is a NEW row whose revoked_by is null.
    -- So `expired AND revoked_at is null AND revoked_by is not null` is reachable by exactly one
    -- history.
    v_pt_lifted := (v_pt_b.status='expired'
                    and v_pt_b.revoked_at is null and v_pt_b.revoked_by is not null);

    -- (1) ------------------------------------------------------------------------------------
    if v_pt_b.status='revoked' or v_pt_suppression='revoked' then
      v_pt_reason:='binding_revoked';
    elsif v_pt_suppression='declined' then
      v_pt_reason:='binding_suppressed';
    elsif (v_pt_cpb.id is null or v_pt_cpb.merged_into is not null
        or v_pt_cpb.retired_at is not null
        or v_pt_cpb.registration_normalized is distinct from v_pt_b.registration_at_signing)
        and v_pt_reason is null then
      v_pt_reason:='binding_identity_drifted';
    elsif (v_pt_draft_res is null or v_pt_draft_binding is distinct from e.vendor_binding_id)
        and v_pt_reason is null then
      v_pt_reason:='binding_changed';
    elsif v_pt_facts is null and v_pt_reason is null then
      v_pt_reason:='binding_changed';
    elsif v_pt_ocr is null and v_pt_reason is null then
      v_pt_reason:='binding_no_corroboration_source';
    elsif (not coalesce(v_pt_f1_ok,false) or not coalesce(v_pt_f2_ok,false))
        and v_pt_reason is null then
      v_pt_reason:='binding_features_changed';
    elsif not coalesce(v_pt_f3_ok,false) and v_pt_reason is null then
      v_pt_reason:='binding_uncorroborated';
    elsif v_counterparty is distinct from v_pt_b.counterparty_id and v_pt_reason is null then
      v_pt_reason:='binding_changed';
    end if;

    -- (2) ------------------------------------------------------------------------------------
    -- The clock, and the ONE state that wears the clock's clothes without being it (FIND-2).
    -- Both annotate-and-post; they differ only in what the receipt SAYS happened.
    if v_pt_reason is null and v_pt_expired then
      v_pt_reason := case when v_pt_lifted then 'binding_revocation_lifted' else 'binding_expired' end;
    end if;

    -- (3) ------------------------------------------------------------------------------------
    if v_pt_reason is null then
      if not v_pt_live then
        v_pt_reason:='binding_changed';
      elsif coalesce(v_pt_matches,0)>1 then
        v_pt_reason:='binding_ambiguous';
      elsif coalesce(v_pt_matches,0)=1 and not coalesce(v_pt_matching_f2_ok,false) then
        v_pt_reason:='binding_features_changed';
      elsif coalesce(v_pt_matches,0)<>1
         or v_pt_matching_binding is distinct from e.vendor_binding_id then
        v_pt_reason:='binding_changed';
      end if;
    end if;

    -- O3: EXPIRY IS A CLOCK, REVOCATION IS AN ACT. An entry drafted three days before expiry
    -- and approved two days after it posts, with the divergence recorded and annotated.
    v_pt_annotate:=(v_pt_reason in ('binding_expired','binding_revocation_lifted'));
    v_pt_outcome:=case when v_pt_reason is null then 'bound'
                       when v_pt_annotate then 'divergence' else 'refused' end;

    if v_pt_reason is null
       or (v_pt_annotate and v_pt_res_facts is not null and v_pt_res_ocr is not null) then
      insert into clara.vendor_binding_resolutions(
        binding_id,firm_id,client_id,document_id,entry_id,phase,
        facts_extraction_id,ocr_extraction_id,compared_to_resolution_id,
        entry_revision_token,raw_proposal,outcome,refusal_reason
      ) values (
        e.vendor_binding_id,e.firm_id,e.client_id,e.document_id,e.id,'post',
        v_pt_res_facts,v_pt_res_ocr,v_pt_draft_res,
        e.revision_token,'{}'::jsonb,v_pt_outcome,v_pt_reason);
    end if;

    if v_pt_annotate then
      -- The ANNOTATION reaches the caller, not only a table. Its own key on the audit payload
      -- and on the door's return, beside (never inside) the pre-existing no-counterparty
      -- warning -- two different facts must not share one slot.
      v_pt_warning:=jsonb_build_object(
        'code',case when v_pt_lifted then 'binding_revocation_lifted_at_post'
                    else 'binding_expired_at_post' end,
        'message',case when v_pt_lifted
          then 'this vendor identity binding had been REVOKED and the revocation was later lifted by an admin, which leaves the authority terminal rather than live; the entry posted and the divergence is recorded'
          else 'the vendor identity binding had expired when this entry was approved; the entry posted and the divergence is recorded' end,
        'binding_id',e.vendor_binding_id,
        'expires_at',v_pt_b.expires_at,
        'revoked_by',v_pt_b.revoked_by,
        'resolution_recorded',(v_pt_res_facts is not null and v_pt_res_ocr is not null));
    elsif v_pt_reason is not null then
      raise exception 'the vendor identity binding no longer holds at post time'
        using errcode='CLR36',
          detail=jsonb_build_object('reason',v_pt_reason,'class','binding_post_time',
            'binding_id',e.vendor_binding_id)::text;
    end if;
  end if;

  update clara.journal_entries set status='approved',checker_actor=c.actor,
    approved_at=now(),self_approval_attestation=v_attest,$t2$);

  -- ---------------------------------------------------------------------------------
  -- (3) THE F-A9 PR-1B FOLLOW-UP (PROGRESS Known-issues 3d). The CLR23 remedy names four
  -- gates a re-draft may still refuse on. F-A9 PR-1B REMOVED the token-budget gate whole and
  -- moved gate 6's reason strings to `refused_concurrency`; measured on this rig, the live
  -- comment-stripped body of clara.admit_autodraft_task emits exactly
  -- {admitted, already_done, lane_changed, refused_attempts, refused_concurrency,
  -- skipped_direction} -- `refused_budget` and `refused_sales_cap` survive only in COMMENTS.
  -- A remedy that sends a bookkeeper to look for a gate that no longer exists is a promise, not
  -- an instruction, so the word moves to the live successor. The other three are measured too:
  -- `lane` and `attempt` are lane_changed / refused_attempts above, and `consent` is
  -- clara._coding_lane_core's own gate (the only body in the schema carrying it).
  -- ---------------------------------------------------------------------------------
  v_def := replace(v_def,
    $a3$lane, consent, budget or attempt gates$a3$,
    $t3$lane, consent, concurrency or attempt gates$t3$);

  -- ---------------------------------------------------------------------------------
  -- (4) + (5) THE ANNOTATION REACHES THE AUDIT ROW AND THE RETURN. Additive only: the
  -- pre-existing no-counterparty warning's shape is byte-unchanged in both places.
  -- ---------------------------------------------------------------------------------
  v_def := replace(v_def,
    $a4$      || case when v_no_cp_warning is not null
           then jsonb_build_object('warning',v_no_cp_warning) else '{}'::jsonb end);$a4$,
    $t4$      || case when v_no_cp_warning is not null
           then jsonb_build_object('warning',v_no_cp_warning) else '{}'::jsonb end
      || case when v_pt_warning is not null
           then jsonb_build_object('binding_post_check',v_pt_warning) else '{}'::jsonb end);$t4$);

  v_def := replace(v_def,
    $a5$      || case when v_no_cp_warning is not null
           then jsonb_build_object('warnings',jsonb_build_array(v_no_cp_warning))
           else '{}'::jsonb end);$a5$,
    $t5$      || case when v_no_cp_warning is not null
           then jsonb_build_object('warnings',jsonb_build_array(v_no_cp_warning))
           else '{}'::jsonb end
      || case when v_pt_warning is not null
           then jsonb_build_object('binding_post_check',v_pt_warning) else '{}'::jsonb end);$t5$);

  execute v_def;

  -- POSTCHECK. Re-fetch from the CATALOG; never trust the local string.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;

  -- The control landed, exactly once, as REAL CODE.
  v_n := (length(v_def) - length(replace(v_def,'binding_post_time_recheck_v1','')))
         / length('binding_post_time_recheck_v1');
  if v_n <> 1 then
    raise exception 'binding pr-3 postcheck: the control marker appears % time(s), expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  if position($p1$if e.vendor_binding_id is not null and e.reversal_of is null then$p1$ in v_def) = 0 then
    raise exception 'binding pr-3 postcheck: the ruled O3 gate (bound AND not a reversal) is not in the live body'
      using errcode='CLR10';
  end if;
  if position($p2$v_pt_reason:='binding_revoked'$p2$ in v_def) = 0
     or position($p3$v_pt_annotate:=(v_pt_reason in ('binding_expired','binding_revocation_lifted'))$p3$ in v_def) = 0
     or position($p4$when v_pt_lifted then 'binding_revocation_lifted'$p4$ in v_def) = 0 then
    raise exception 'binding pr-3 postcheck: the revoked-refuses / expired-annotates / revocation-lifted arms are not all live'
      using errcode='CLR10';
  end if;

  -- THE ANTI-REVERT CENSUS. 0040:7148 pinned eleven markers at exact counts precisely so a
  -- later file could not rebuild this body from one migration's text and silently drop the
  -- others. Eight of them are 0106 §E's surviving CARRY set, at 1; three are the breeding
  -- markers 0106 §E RETIRED, at 0 -- and `bank_rule_suggested` went with the gate it was
  -- spliced into (2 -> 0, not 2 -> 1). The exact same eleven names the live battery
  -- f-a2-excision.test.mjs asserts, checked HERE so a bad splice reds the APPLY, not the sweep.
  for r in select * from (values
      ('opening_entry_k_family_only',1),
      ('[R1-F1] K-family-only lifecycle boundary',1),
      ('receipt_preheld',1),
      ('bound_extraction',1),
      ('unpinned_rule_post',1),
      ('settlement_not_autopostable',1),
      ('clara._subledger_on_approve(',1),
      ('no_counterparty_sighting',1),
      ('H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only',0),
      ('insert into clara.rule_sightings',0),
      ('uq_rule_sightings_mapping',0),
      ('bank_rule_suggested',0)
    ) t(marker, want)
  loop
    v_n := (length(v_def) - length(replace(v_def, r.marker, ''))) / length(r.marker);
    if v_n <> r.want then
      raise exception 'binding pr-3 postcheck: marker "%" is at % , expected % -- the splice reverted or restored an earlier generation of this body', r.marker, v_n, r.want
        using errcode='CLR10';
    end if;
  end loop;

  -- THE PROSE FIX, both directions.
  if position('lane, consent, budget or attempt gates' in v_def) <> 0 then
    raise exception 'binding pr-3 postcheck: the stale "budget" gate name survives in the CLR23 remedy'
      using errcode='CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def,'lane, consent, concurrency or attempt gates','')))
         / length('lane, consent, concurrency or attempt gates');
  if v_n <> 1 then
    raise exception 'binding pr-3 postcheck: the trued remedy phrase appears % time(s), expected 1', v_n
      using errcode='CLR10';
  end if;

  -- OWNERSHIP AND ACL SURVIVE A CoR, and that is READ rather than assumed.
  select count(*) into v_n from pg_proc p
   where p.oid = v_sig::regprocedure and p.proowner = 'clara_fn_owner'::regrole
     and p.prosecdef and p.provolatile = 'v';
  if v_n <> 1 then
    raise exception 'binding pr-3 postcheck: the recut body is not an owner-owned VOLATILE SECURITY DEFINER'
      using errcode='CLR10';
  end if;
end
$bp3_splice$;

reset role;

-- =====================================================================================
-- SS3 -- 裁-46: clara.reset_binding_revocation, the named human way out of a REVOCATION.
-- =====================================================================================
-- 裁-46 (2026-08-30): "单独一扇管理员门，带理由、受理" -- a SEPARATE admin door,
-- reset_binding_revocation(uuid, reason): admin/owner only, reason mandatory, receipted.
-- clara.reset_binding_decline KEEPS REFUSING on a revoked row, because a revocation is a
-- weightier act than a decline and its undo must carry its own name. This file does not touch
-- reset_binding_decline's body at all; the battery proves it still refuses.
--
-- THE THIRD ARGUMENT, stated rather than slipped in. The ruling writes the door as
-- `reset_binding_revocation(uuid, text reason)` -- naming its SEMANTIC arguments, exactly as the
-- gate record writes its sibling as `reset_binding_decline(uuid, reason)` while the shipped
-- function is (uuid,text,text). Every audited door in this family reserves an op key through
-- clara._reserve_op / clara._finish_op, and a door without one cannot dedupe a retried RPC: it
-- would double-audit and double-event the same act. So the shipped signature mirrors its
-- sibling's exactly, and the deviation from the ruling's shorthand is recorded here and in the
-- PR body rather than left for a reader to notice.
--
-- WHERE THE ROW LANDS. 'expired', not 'proposed' and not a delete -- the same landing
-- reset_binding_decline uses, and for the same two reasons: the revocation stays readable as
-- history, and 'expired' is the estate's existing terminal status that no wall keys on
-- (clara._binding_suppression covers only declined/revoked, and uq_vib_one_active_binding's
-- predicate covers only proposed/live). The pair becomes proposable again; this door does NOT
-- propose. ck_vib_revoked is a bidirectional equality, so revoked_at MUST clear in the same
-- statement or the row violates its own CHECK -- SS1 (g) reads that CHECK rather than trusting
-- this comment. `revoked_by` is deliberately LEFT on the row: it is not CHECK-paired to the
-- status, and who took the authority away is history worth keeping. `revoke_reason` clears
-- alongside the stamp -- a CHOICE, not a CHECK: there is no ck_vib_revoke_reason_honest the way
-- there is a ck_vib_decline_reason_honest (measured, not assumed), so leaving it would have been
-- legal and would have left a reason standing on a row whose revocation had been lifted. It is
-- carried WHOLE onto the receipt instead, because the reason a human ended an authority is
-- exactly what a later reader will want back.
set role clara_fn_owner;

create function clara.reset_binding_revocation(
    p_binding uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; b record; v_reason text; v_pair record; v_posted int; v_drafts int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode = 'CLR10';
  end if;
  -- FIND-1 (#452 native review, MEDIUM — MEASURED, not theorised): single-argument btrim strips
  -- SPACES ONLY. `btrim(E'\t')` is E'\t', which is not '', so a reason consisting of one tab or
  -- one newline satisfied "non-blank" and lifted a revocation with no reason on the receipt.
  -- ON THE SPELLING chr(11), and a correction worth leaving in the file. A review round called
  -- E'...\v' a BUG on the theory that PostgreSQL's E'' has no \v escape and yields the letter `v`,
  -- which would have trimmed a leading/trailing `v` off every reason. THAT IS NOT TRUE HERE, and
  -- it was settled by MEASUREMENT rather than by either side's reading -- psql -f on a file, no
  -- shell in the path to mangle a backslash, PostgreSQL 17.11, standard_conforming_strings on:
  --     ascii(E'\v') = 11          (the vertical tab, NOT 118, the letter `v`)
  --     E' \t\n\r\f\v'  and  E' \t\n\r\f' || chr(11)  are BYTE-IDENTICAL: {32,9,10,13,12,11}
  --     btrim('vendor ... v', <either set>) leaves BOTH leading and trailing `v` untouched
  -- So the two spellings are the same set and this line is a no-op rewrite, kept only because
  -- chr(11) cannot be misread by the next person who has this argument. THE REAL FIX above it is
  -- the one that mattered: single-argument btrim strips SPACES ONLY, so before the charset
  -- argument existed a tab- or newline-only reason was "non-blank" and lifted a revocation.
  -- The estate's 0154 siblings
  -- (decline_vendor_identity_binding, reset_binding_decline, and revoke's own spelling) carry the
  -- same single-arg idiom; that is NOT this PR's to change and is on the fix queue.
  v_reason := nullif(btrim(coalesce(p_reason, ''), E' \t\n\r\f' || chr(11)), '');
  if v_reason is null then
    raise exception 'a revocation-reset reason is required' using errcode = 'CLR36',
      detail = '{"reason":"reset_reason_required"}';
  end if;
  -- A LENGTH CEILING, not merely a non-blank floor. This reason is a human-authored string that
  -- lands verbatim on an audit row; the estate's own precedent for a capped prose field is
  -- agent_act_receipts' 4000 (0138:363), and PR-0's M2 ruled the uncapped shape out.
  if length(v_reason) > 4000 then
    raise exception 'a revocation-reset reason is at most 4000 characters' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"reset_reason_length"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'reset_binding_revocation', p_op_key,
    clara._hash(jsonb_build_object('binding_id', p_binding, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- H6 / C-1: THE ONE ORDER (0154 SS5b). Pair read unlocked, key, then the row for update.
  select v.firm_id, v.client_id, v.counterparty_id into v_pair
    from clara.vendor_identity_bindings v where v.id = p_binding;
  if not found or v_pair.firm_id <> c.firm then
    raise exception 'binding not found' using errcode = 'CLR11';
  end if;
  perform clara._binding_lock_pair(v_pair.client_id, v_pair.counterparty_id);

  select * into b from clara.vendor_identity_bindings where id = p_binding for update;
  if not found or b.firm_id <> c.firm then
    raise exception 'binding not found' using errcode = 'CLR11';
  end if;
  -- THIS DOOR RE-OPENS A REVOCATION AND NOTHING ELSE. A declined row has its own named door
  -- (clara.reset_binding_decline) and routing both through one verb is what M-11 refused.
  if b.status <> 'revoked' then
    raise exception 'binding_not_revoked' using errcode = 'CLR36',
      detail = '{"reason":"binding_not_revoked","class":"loop_brake"}';
  end if;

  -- HOW MANY ENTRIES THIS AUTHORITY ACTUALLY POSTED, counted at reset time and put on the
  -- receipt. clara.revoke_vendor_identity_binding counts the same number when the authority is
  -- ended; an admin re-opening it is entitled to the same figure, and it is DB-derived.
  select count(*)::int into v_posted
    from clara.journal_entries where vendor_binding_id = p_binding and status = 'approved';
  -- FIND-2(a): AND HOW MANY ARE STILL IN FLIGHT. The posted count is history; the DRAFT count is
  -- the admin's actual exposure at the moment they lift the revocation -- every one of those
  -- drafts still carries this binding's marker and will meet the post-time re-check at approve.
  -- A receipt that reports only what already happened tells the wrong half of the story.
  select count(*)::int into v_drafts
    from clara.journal_entries where vendor_binding_id = p_binding and status = 'draft';

  update clara.vendor_identity_bindings
     set status = 'expired',
         revoked_at = null, revoke_reason = null
   where id = p_binding;

  perform clara._audit(c.firm, c.actor, null, null,
    'reset_binding_revocation', null,
    jsonb_build_object('binding_id', p_binding, 'client_id', b.client_id,
      'counterparty_id', b.counterparty_id, 'reason', v_reason,
      'revoked_by', b.revoked_by, 'revoked_at', b.revoked_at,
      'revoke_reason', b.revoke_reason, 'prior_status', b.status,
      'approved_entries', v_posted, 'draft_entries', v_drafts, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'kb_binding.revocation_reset', b.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('binding_id', p_binding, 'counterparty_id', b.counterparty_id,
      'approved_entries', v_posted, 'draft_entries', v_drafts));
  return clara._finish_op(c.firm, 'reset_binding_revocation', p_op_key,
    jsonb_build_object('binding_id', p_binding, 'status', 'expired',
      'approved_entries', v_posted, 'draft_entries', v_drafts));
end $fn$;
comment on function clara.reset_binding_revocation(uuid,text,text) is
  '裁-46 (2026-08-30), riding 裁-18b PR-3: the NAMED human door out of a REVOCATION. '
  'clara.reset_binding_decline refuses a revoked row (M-11, binding_revoked_reset_requires_ruling) '
  'because undoing "I trusted this binding, watched it post real entries, and took the authority '
  'away" with the same click as undoing a card refusal is a relaxation nobody had ruled. The owner '
  'has now named the ceremony: a SEPARATE admin door, reason mandatory (non-blank, <=4000 chars), '
  'audited and evented (kb_binding.revocation_reset). Moves the row to ''expired'' so the '
  'revocation stays readable as history and the pair stops being suppressed; clears revoked_at '
  '(ck_vib_revoked is a bidirectional equality) and revoke_reason, both carried WHOLE onto the '
  'receipt, and LEAVES revoked_by. It does NOT re-propose. The op key is the estate''s standard '
  'third argument -- the ruling names the door''s semantic arguments, as the gate record does for '
  'its sibling. Frontend home: the admin / vendor-bindings panel, on a revoked row''s admin menu '
  '(the P4/P6 train).';

reset role;

revoke all on function clara.reset_binding_revocation(uuid,text,text) from public;
grant execute on function clara.reset_binding_revocation(uuid,text,text) to clara_authenticated;

-- =====================================================================================
-- SS3a -- THE EVENT-TYPE REGISTRY + THE TRIGGER TAXONOMY: one new member, BOTH halves.
-- =====================================================================================
-- clara.domain_events.event_type is FK-constrained to the append-only clara.event_types registry
-- AND gated by clara._tf_validate_domain_event, so the new act needs a row or the door raises
-- CLR10 at runtime. clara.event_types and clara.trigger_taxonomy are a COUPLED PAIR: registering
-- in one alone is the half-registration the estate's coverage census refuses (0154 SS3a paid for
-- exactly that). Registered at whichever taxonomy version is CURRENTLY ACTIVE, additively, with
-- NO version flip.
--
-- THE DECISION, against its own precedent rather than picked: `ignore`, following
-- kb_binding.decline_reset, kb_binding.signed and kb_binding.revoked. A terminal administrative
-- decision does not ping the person who just took it.
--
-- RECORDED, NOT FIXED: kb_binding.decline_reset's description still reads "lifted a binding
-- decline OR REVOCATION", which was true of the door 0154 first drafted and false of the one it
-- shipped (M-11 removed the revocation arm the same day). clara.event_types carries
-- t_event_types_append_only, so correcting a description is an UPDATE that table refuses by
-- design -- and relaxing an append-only guard to fix a comment is the vacuous-relaxation class
-- the W2/W3 close named. It is carried to the fix queue instead.
with inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
    values ('kb_binding.revocation_reset', true,
            'An admin lifted a binding REVOCATION so the pair may be proposed again (裁-46)')
    on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, i.name, 'ignore', null
  from inserted_types i cross join clara.taxonomy_active a;

-- =====================================================================================
-- SS4 -- THE RE-WITNESS (packages/db/README.md deploy contract D2).
-- =====================================================================================
-- The sha is COMPUTED FROM THE LIVE CATALOG, never written as a literal. A literal would be a
-- second, mutually-unaware copy of the one fact this row exists to carry, and the first thing to
-- drift. `proc` is the EXACT regprocedure text the door itself resolves and pins (FOLD-6: the
-- door writes the question, the registry only records the answer).
insert into clara.control_witnesses(control, proc, prosrc_sha, minted_in_migration)
select 'binding_post_time_recheck_v1',
       'clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
       encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
       'binding_pr_3_post_time_recheck'
  from pg_proc p
 where p.oid = to_regprocedure('clara._approve_entry_core(jsonb,uuid,uuid,text,text)');

-- =====================================================================================
-- SS5 -- TAIL SELF-PROOF. Raises on failure; every claim is RE-READ from the live catalog.
-- =====================================================================================
do $bp3_tail$
declare
  v_n int; v_sha text; v_wit record; v_expected oid; v_def text; v_bad text; r record;
  v_sig text := 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)';
begin
  -- (1) THE WITNESS IS THE LIVE BODY. Asked exactly the way clara.sign_vendor_identity_binding
  -- asks it: resolve the expected identity to an OID first, then compare the sha.
  v_expected := to_regprocedure(v_sig);
  select w.proc, w.prosrc_sha, w.minted_in_migration into v_wit
    from clara.control_witnesses w where w.control = 'binding_post_time_recheck_v1';
  if not found then
    raise exception 'binding pr-3 tail: the control witness was not minted' using errcode='CLR10';
  end if;
  if v_expected is null or to_regprocedure(v_wit.proc) is distinct from v_expected then
    raise exception 'binding pr-3 tail: the witness names % , which is not the approve path', v_wit.proc
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = v_expected;
  if v_sha is distinct from v_wit.prosrc_sha then
    raise exception 'binding pr-3 tail: the witness sha % does not match the live body %', v_wit.prosrc_sha, v_sha
      using errcode='CLR10';
  end if;
  if v_sha = 'd5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637' then
    raise exception 'binding pr-3 tail: the live body still hashes to the PRE-IMAGE -- the splice did not take'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.control_witnesses;
  if v_n <> 1 then
    raise exception 'binding pr-3 tail: clara.control_witnesses holds % row(s), expected exactly 1', v_n
      using errcode='CLR10';
  end if;

  -- (2) THE GATE THIS FILE OPENS, read the way the DOOR reads it (identity, not text) and by
  -- the same predicate the rig fixture uses -- one fact, one instrument.
  if not (select coalesce(bool_or(
            encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') = w.prosrc_sha), false)
            from clara.control_witnesses w
            join pg_proc p on p.oid = to_regprocedure(w.proc)
           where w.control = 'binding_post_time_recheck_v1') then
    raise exception 'binding pr-3 tail: the post-time control still reads CLOSED after this file'
      using errcode='CLR10';
  end if;
  -- ...and the SIGNER still asks by identity, not by a ledger row (M3). Read on the live body.
  select regexp_replace(regexp_replace(p.prosrc,'/\*.*?\*/','','gs'),'--[^\n]*','','g')
    into v_def from pg_proc p
   where p.oid = to_regprocedure('clara.sign_vendor_identity_binding(uuid,text,text)');
  if v_def is null or position('clara.control_witnesses' in v_def) = 0
     or position('prosrc_sha' in v_def) = 0 then
    raise exception 'binding pr-3 tail: the signer no longer reads the witness registry by sha'
      using errcode='CLR10';
  end if;
  if position('0029_vendor_binding_executor' in v_def) <> 0 then
    raise exception 'binding pr-3 tail: the signer has regained the 0029 LEDGER-ROW proxy'
      using errcode='CLR10';
  end if;

  -- (3) THE 裁-46 DOOR: exactly one row, one overload, the right ACL, the right floor.
  select count(*) into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='reset_binding_revocation';
  if v_n <> 1 then
    raise exception 'binding pr-3 tail: clara.reset_binding_revocation resolves at % pg_proc row(s), expected 1', v_n
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.reset_binding_revocation(uuid,text,text)','execute') then
    raise exception 'binding pr-3 tail: clara_authenticated cannot execute the 裁-46 door'
      using errcode='CLR10';
  end if;
  -- Six other principals, each a REAL role on this frontier (censused: 14 clara_* roles), so a
  -- typo cannot be read as "no leak" -- has_function_privilege raises on an unknown role.
  select string_agg(t.role, ', ' order by t.role) into v_bad
    from (values ('clara_agent_ro'),('clara_wake_filing'),('clara_wake_interactive'),
                 ('clara_wake_bank'),('clara_wake_proactive'),('clara_freeform_ro'),
                 ('public')) t(role)
   where has_function_privilege(t.role,'clara.reset_binding_revocation(uuid,text,text)','execute');
  if v_bad is not null then
    raise exception 'binding pr-3 tail: the 裁-46 door leaks EXECUTE to %', v_bad using errcode='CLR10';
  end if;
  select regexp_replace(regexp_replace(p.prosrc,'/\*.*?\*/','','gs'),'--[^\n]*','','g')
    into v_def from pg_proc p
   where p.oid = to_regprocedure('clara.reset_binding_revocation(uuid,text,text)');
  for r in select * from (values
      ($f1$clara._human_ctx(clara.role_rank('admin'))$f1$),
      ($f2$reset_reason_required$f2$),
      ($f3$binding_not_revoked$f3$),
      ($f4$clara._binding_lock_pair(v_pair.client_id, v_pair.counterparty_id)$f4$),
      ($f5$revoked_at = null$f5$),
      ($f6$kb_binding.revocation_reset$f6$)
    ) t(term)
  loop
    if position(r.term in v_def) = 0 then
      raise exception 'binding pr-3 tail: the 裁-46 door is missing the term "%"', r.term using errcode='CLR10';
    end if;
  end loop;

  -- (4) reset_binding_decline STILL REFUSES A REVOCATION. Read on its live body: this file must
  -- not have widened the sibling while minting the new door.
  select regexp_replace(regexp_replace(p.prosrc,'/\*.*?\*/','','gs'),'--[^\n]*','','g')
    into v_def from pg_proc p
   where p.oid = to_regprocedure('clara.reset_binding_decline(uuid,text,text)');
  if v_def is null or position('binding_revoked_reset_requires_ruling' in v_def) = 0 then
    raise exception 'binding pr-3 tail: clara.reset_binding_decline no longer refuses a revoked row'
      using errcode='CLR10';
  end if;

  -- (5) THE EVENT REGISTRY PAIR, and coverage still WHOLE over the ENTIRE registry.
  select count(*) into v_n from clara.event_types where name = 'kb_binding.revocation_reset';
  if v_n <> 1 then
    raise exception 'binding pr-3 tail: kb_binding.revocation_reset is registered % time(s)', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.trigger_taxonomy
   where event_type = 'kb_binding.revocation_reset'
     and version = (select version from clara.taxonomy_active) and decision = 'ignore';
  if v_n <> 1 then
    raise exception 'binding pr-3 tail: kb_binding.revocation_reset carries % taxonomy row(s) at the active version', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.event_types t
   where not exists (select 1 from clara.trigger_taxonomy x
                      where x.event_type = t.name
                        and x.version = (select version from clara.taxonomy_active));
  if v_n <> 0 then
    raise exception 'binding pr-3 tail: % event type(s) now carry no taxonomy row at the active version', v_n
      using errcode='CLR10';
  end if;
  -- UNMOVED, against what THIS APPLY measured -- never against a number in a comment.
  select count(*) into v_n from clara.taxonomy_versions;
  if v_n::text is distinct from (select v from _bp3_pre where k='taxonomy_versions') then
    raise exception 'binding pr-3 tail: taxonomy_versions moved from % to % -- this file registers ADDITIVELY and must never flip a version',
      (select v from _bp3_pre where k='taxonomy_versions'), v_n using errcode='CLR10';
  end if;
  select version into v_n from clara.taxonomy_active;
  if v_n::text is distinct from (select v from _bp3_pre where k='taxonomy_active') then
    raise exception 'binding pr-3 tail: the ACTIVE taxonomy version moved from % to %',
      (select v from _bp3_pre where k='taxonomy_active'), v_n using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.event_types;
  if v_n <> (select v::int from _bp3_pre where k='event_types') + 1 then
    raise exception 'binding pr-3 tail: the event-type registry moved from % to % -- this file adds EXACTLY one member',
      (select v from _bp3_pre where k='event_types'), v_n using errcode='CLR10';
  end if;
  -- The function census moved by exactly one: clara.reset_binding_revocation. A CoR replaces a
  -- body without adding a row, so a second new name would show up here and nowhere else.
  select count(*) into v_n from pg_proc p where p.pronamespace='clara'::regnamespace;
  if v_n <> (select v::int from _bp3_pre where k='clara_functions') + 1 then
    raise exception 'binding pr-3 tail: the clara function census moved from % to % -- this file creates EXACTLY one new function',
      (select v from _bp3_pre where k='clara_functions'), v_n using errcode='CLR10';
  end if;

  -- (6a) NOTHING ELSE MOVED -- as a BEFORE/AFTER EQUALITY against what SS1 (k2) measured on this
  -- very database, not against a literal. This is the claim the section actually makes: THIS FILE
  -- did not touch these bodies. It holds at every frontier, so a coordinated sibling PR landing
  -- ahead of this one cannot turn a true premise into a false abort.
  -- NON-VACUOUS BY CONSTRUCTION: a loop over an empty stash would "pass" while comparing
  -- nothing, so the row count is asserted against the number SS1 (k2) was asked to stash.
  select count(*) into v_n from _bp3_pre where k like 'sha:%';
  if v_n <> 3 then
    raise exception 'binding pr-3 tail: the neighbour stash holds % row(s), expected 3 -- this loop would have compared nothing', v_n
      using errcode='CLR10';
  end if;
  for r in select k, v from _bp3_pre where k like 'sha:%' order by k loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
           || '|acl='   || coalesce(p.proacl::text, '(default)')
           || '|owner=' || p.proowner::regrole::text
           || '|cfg='   || coalesce(array_to_string(p.proconfig, ','), '(none)')
           || '|secdef='|| p.prosecdef::text
           || '|vol='   || p.provolatile
      into v_sha
      from pg_proc p where p.oid = to_regprocedure(substr(r.k, 5));
    if v_sha is null then
      raise exception 'binding pr-3 tail: % no longer resolves', substr(r.k, 5) using errcode='CLR10';
    end if;
    if v_sha is distinct from r.v then
      raise exception 'binding pr-3 tail: % MOVED across this file (% -> %)', substr(r.k, 5), r.v, v_sha
        using errcode='CLR10';
    end if;
  end loop;

  -- (6b) ...and the two BYTE-FROZEN bodies are additionally pinned to their literal identities,
  -- because "unmoved by this file" is a weaker claim than "still the reviewed body". G3 rules
  -- clara._coding_lane_core untouched, and clara._derive_vendor_binding_proposal's content_hash
  -- covers the evidence array, so recutting it un-signs every open proposal (survey S4).
  for r in select * from (values
      ('clara._derive_vendor_binding_proposal(uuid,uuid,uuid)',
       'de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c'),
      ('clara._coding_lane_core(uuid,uuid)',
       '721a6704e3284679103537bdda56bf741422041e16dda0f4654394f1d9506fda')
    ) t(sig, pin)
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = to_regprocedure(r.sig);
    if v_sha is distinct from r.pin then
      raise exception 'binding pr-3 tail: % is not the reviewed frozen body (sha % , expected %)', r.sig, v_sha, r.pin
        using errcode='CLR10';
    end if;
  end loop;

  -- (6c) MERGE-ORDER COORDINATION -- clara.propose_vendor_identity_binding, which is NOT frozen
  -- and has a sibling landing ahead of this file.
  --   fe14f239...  its body after 0154 (裁-18b PR-1) -- measured on a pristine 0001..0155 replay.
  --                (0154's own header pins 610ef1df, which is its PRE-image: the body 0154 recut.
  --                 A pin copied out of that prose header would fail this file for the wrong
  --                 reason, which is why every value here was measured rather than read.)
  --   8c4000de...  its body after PR #448 (db/unique-violation-constraint-name), which recuts the
  --                unique_violation handler and lands BEFORE this PR.
  -- BOTH are lawful during the merge window and a THIRD value is not -- an uncoordinated recut of
  -- a body on the binding lifecycle is exactly what this rung exists to catch. AT MERGE PREP THIS
  -- NARROWS TO THE SINGLE VALUE MEASURED ON MERGED MAIN with #448 applied; the sha below was
  -- supplied by the conductor and is NOT trusted as evidence until that replay reads it back.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
    from pg_proc p where p.oid = to_regprocedure('clara.propose_vendor_identity_binding(jsonb,text)');
  if v_sha not in ('fe14f23984e00178e1dc084caf3224cfe4cb5b62fe080301b95e2fc4b671dc82',
                   '8c4000de1e85553ca833204eb9f552b098ef57839a461240c3af3e08e649713f') then
    raise exception 'binding pr-3 tail: clara.propose_vendor_identity_binding is at an UNRECOGNISED body (%) -- neither the 0154 post-image nor PR #448''s; a body on the binding lifecycle was recut without coordinating with this file', v_sha
      using errcode='CLR10';
  end if;

  -- (7) NO TABLE IN THE FROZEN SCHEMAS TOUCHED (hard constraint 15) -- a read-only census.
  select count(*) into v_n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname in ('workflow','graphile_worker','spike');
  raise notice 'binding pr-3 tail: % relation(s) in the frozen schemas, read-only census, none touched', v_n;

  raise notice 'binding pr-3 tail: OK -- D1 INVENTORY = ONE WRITER BODY (clara._approve_entry_core, SPLICED at five counted anchors from pre-image d5ab4afc..., its twelve anti-revert markers re-read on the RECUT body at their 0106 §E dispositions so no earlier splice was reverted, the ruled O3 gate + the revoked-refuses/expired-annotates arms present as REAL CODE, ownership/SECURITY DEFINER/VOLATILE re-read from the catalog, and the stale "budget" gate name replaced by the live successor "concurrency" exactly once). The control witness binding_post_time_recheck_v1 is minted from the LIVE prosrc (never a literal), names the approve path by exact regprocedure, matches byte-for-byte, is the registry''s only row, and the signer''s identity gate now reads OPEN while still refusing to read the 0029 ledger row. clara.reset_binding_revocation ships at exactly one pg_proc row, clara_authenticated-only with zero leak across six other principals, admin-floored, pair-locked before its row lock, reason-required and length-capped, clearing revoked_at (ck_vib_revoked is a bidirectional equality) and evented kb_binding.revocation_reset -- while clara.reset_binding_decline still refuses a revoked row verbatim. The event registry and the trigger taxonomy moved together by exactly one member at the ACTIVE version with the version count UNMOVED, and coverage is whole over the entire registry. propose_vendor_identity_binding, the frozen derivation and _coding_lane_core are all byte-unmoved. No table in workflow/graphile_worker/spike touched.';
end
$bp3_tail$;
