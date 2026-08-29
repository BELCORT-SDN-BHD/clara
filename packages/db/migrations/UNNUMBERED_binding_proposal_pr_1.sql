-- UNNUMBERED_binding_proposal_pr_1.sql -- 裁-18b PR-1: the Clara vendor-binding PROPOSAL door.
-- Number claimed at MERGE PREPARATION (standing law, AGENTS.md + .claude/rules/db-migrations.md).
-- Authored as 0150 against a main frontier of 0147_db_hardening_b_hash_only_bearer_tokens, and
-- REBASED 2026-08-30 onto 0148_promotion_dup_open_wall (143 files) -- which CoRs
-- clara._firm_question_core at the SAME signature and touches none of the closed worlds this
-- file counts (allowlist rows, agent_receipt_surfaces, event_types, the role set), measured
-- rather than assumed. The prestate's frontier rung stays keyed on 0147 as a FLOOR, so a later
-- sibling landing between authoring and merge does not turn a true premise into a false abort.
--
-- Design of record: docs/plan/active/binding-proposal-design.md, as AMENDED by its own
-- "Rulings applied 2026-08-29 (裁-25)" header block. Gate record:
-- docs/plan/active/binding-proposal-gate-record.md (G1-G8, all RULED). Ruling ledger:
-- docs/plan/active/mohe-grill-rulings-2026-08-28.md 裁-25. WHERE THE RULING AND THE DESIGN
-- DISAGREE, THE RULING GOVERNS -- the design's SS4 build table predates it and is history.
--
-- SCOPE IS EXACTLY THE RULED PR-1 ROW, AND NOTHING ELSE:
--   * the proposal door clara.wake_propose_vendor_identity_binding, admitted on the wake kinds
--     `filing` AND `interactive` (G1 arm A: allowlist rows + grants on the EXISTING roles
--     clara_wake_filing / clara_wake_interactive -- no new wake kind, no new role, no
--     roles-bootstrap twin, no wake_credentials CHECK change, no sweep as trigger);
--   * the read verb clara.wake_list_binding_candidates -- eligibility computed by the DB ONLY
--     (G3), by CALLING the frozen derivation itself rather than re-implementing its predicate;
--     clara._coding_lane_core is UNTOUCHED;
--   * the 裁-22 basis contract through the MERGED shared resolver
--     clara._resolve_proposal_basis(p_documents uuid[], p_firm uuid, p_basis jsonb) (0143), with
--     the document SET = the three evidence invoices the derivation itself selected (G2, closed
--     by fact). `sightings` stays a FORBIDDEN argument -- derived by the DB, refused if supplied;
--   * the `decline` verb (G7 first half): admin floor, reason required, audited,
--     proposed -> declined, and read by the loop brake in wake_list_binding_candidates so Clara
--     never re-proposes what a human declined;
--   * the ONE-OPEN-PROPOSAL partial unique index per (client, counterparty) (G8) -- the human
--     door's second manual proposal now refuses with the EXISTING typed binding_conflict;
--   * the receipt-surface registry key widened to a `pb_*` family and the row `pb_binding` (G4:
--     two closed-world CHECK widenings, BOTH DIRECTIONS proven in the tail).
--
-- THE NAMED SHARED SURFACES THIS FILE TOUCHES -- FIVE, not the design's four. Annex G-f lists
-- clara.wake_fn_allowlist (+4 rows), the agent_receipt_surfaces closed-world CHECK pair (+ the
-- ninth member), clara._agent_receipts_all (+1 union arm), and -- train 2 only, NOT here --
-- clara.list_review_queue. It does NOT list the fifth: **clara.event_types**, the append-only
-- event-type registry clara.domain_events FKs into. This file adds two members to it
-- (kb_binding.agent_proposed, kb_binding.declined). The conductor's shared-surface ledger and
-- the PR body both carry the correction.
--
-- NOT IN SCOPE -- each is its own PR under the ruled five-PR sequence, and this file must not
-- pre-empt any of them:
--   * PR-2 -- the TENTH list_review_queue row_kind (`vendor_binding_proposed`). G5's premise
--     changed (裁-17's ninth, `seeding_proposal`, is live at 0146), so it ships next.
--     WHERE IT HOOKS IN, recorded here so PR-2 does not have to re-derive it:
--       - DB: clara.list_review_queue(jsonb,jsonb,integer) -- prosrc pinned in SS0 below at
--         d3a8ba444b8e387011c4d91d2291684eb2fad0588e64a3968610ec7137383657 -- a STABLE read whose
--         body is one CTE chain of `<kind>_rows as (select ... '<row_kind>'::text row_kind ...)`
--         arms unioned at the end; the tenth arm reads clara.vendor_identity_bindings where
--         status='proposed' and proposed_by_agent (both live after THIS file) joined to
--         clara.binding_agent_receipts for the rationale/model. NO D1 quiesce (STABLE, read-only).
--       - Frontend: REVIEW_QUEUE_ROW_KINDS at apps/web/lib/firm/needs-you.ts (nine members after
--         0146) and NEEDS_YOU_AFFORDANCES at apps/web/components/firm/needs-you-affordances.tsx.
--   * PR-3 -- the post-time binding re-check restored inside clara._approve_entry_core (G6,
--     OVERRULED into this item). Its OWN D1 write-quiesce window. _approve_entry_core is pinned
--     in SS0 and re-asserted BYTE-IDENTICAL in the tail of THIS file, precisely so PR-3's own
--     prestate has an undisturbed pre-image to pin.
--   * PR-4 -- the expiry sweep engine source + its enable ceremony (G7 second half). This file
--     adds NO clara.wake_engine_sources row (the two live rows both stay disabled) and NO
--     workflow export.
--
-- =====================================================================================
-- FOLD ROUND, 2026-08-30 -- 22 FINDINGS FROM THREE INDEPENDENT REVIEW LEGS, ALL RULED.
-- =====================================================================================
-- The cross-model (Codex) code review, the native adversarial pass (which drove every attack
-- through the real doors on its own rig) and the standing independent reviewer each read tip
-- ccdfbe94. Nine + five + eight findings, folded here in one round under conductor rulings.
-- Every item below has a NAMED battery cell that is RED before the change and GREEN after; the
-- cell names live in binding-proposal-pr-1.test.mjs and the map is in the PR body.
--
--   C1/N-1/H-4  W18's "or a human resolved it" arm is STRUCK. clara.client_resolutions has no
--               counterparty key (prestate (l1) measures it), the satisfying row is minted
--               AUTOMATICALLY by clara.file_document for every filed document (0007:1405-1409),
--               and the reviewer drove the whole attack end to end. The comparison is now over
--               EVERY current registration region (min() was a collation accident), kind-aware
--               across the counterparty's registration AND tin.
--               A HUMAN VENDOR RESOLUTION IS RECORDED AS A LATER DOOR: when the estate has a
--               resolution keyed to (firm, client, document, COUNTERPARTY), this rung gains a
--               second arm deliberately. It does not have one today.
--   C2          clara._binding_doc_fingerprint: three DISTINCT economic fingerprints required.
--   C3          the post-time control is proven by CATALOG WITNESS on clara._approve_entry_core's
--               body, never by 0029's ledger row. UNTIL PR-3 LANDS, SIGN REFUSES
--               `post_time_control_absent` -- so PR-1's ceremony FOLLOWS PR-3's, or the refusal
--               ships and PR-3's marker lifts it. Stated plainly in the PR body.
--   H4/H-6      an `interactive` proposal must carry a standing bookkeeper+ director.
--   H5/M-10     eligible_binding_signer_count: a DURABLE 90-day roster window, firm-congruent.
--   H6/M-9/C-1  ONE lock helper, ONE order, in every lifecycle writer (SS5b).
--   H7          the identity walls re-run over the STORED corpus immediately before `live`.
--   M8          the eligibility read is genuinely read-only; `stable` now means it.
--   M9/L-14     a pb_ TOKEN GRAMMAR plus an AFTER INSERT conformance trigger.
--   M-11        reset_binding_decline lifts a DECLINE only; a revocation refuses pending a ruling.
--   M-12/S-2    a duplicate_override entry cannot be corpus evidence.
--   N-3         the census ships under its RULED name, clara.binding_identity_review().
--   N-4         the attestation relaxation is the DIRECTED interactive path only.
--   N-8         >3 printed invoice ids gets its own word, corpus_invoice_id_ambiguous.
--   S-1         the freeze trigger covers the maker/checker principal -- D1 BODY THREE.
--
-- ONE RULING NOT EXECUTED VERBATIM, and said here rather than buried in a report. N-5 ruled the
-- `b.effective_proposer is null` arm deleted as structurally unreachable. It IS unreachable on
-- the live shape -- created_by is NOT NULL (0028:65) -- but x36c.9 reaches it FOR REAL by
-- dropping that NOT NULL and driving the door, and that cell exists because an independent
-- reviewer measured a genuine fail-open there (0144 LOW-5). Deleting a branch a registered
-- regression pin exercises is proof deletion, so the BRANCH stays and the argument for it goes.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: THREE LIVE WRITER BODIES. Proven, not asserted.
-- =====================================================================================
-- THIS FILE TAKES A D1 WINDOW. An earlier draft did not, and said so in this very block; the
-- 2026-08-29 cross-model pass and the independent PR-0 gate then ruled three walls IN that are
-- only enforceable inside live audited writers. 裁-25 priced exactly this contingency -- "two D1
-- windows minimum: PR-3's, and PR-1's IF ANY LIVE WRITER BODY TURNS OUT TO MOVE." Three moved --
-- the third (the freeze trigger, S-1) arrived with the 2026-08-30 fold round:
--
--   1. clara.propose_vendor_identity_binding(jsonb,text)  -- pre-image prosrc 610ef1df... (0028)
--      CREATE OR REPLACE, same signature. Three splices, and the tail proves it by
--      RE-SUBSTITUTION: strip exactly those three blocks and what remains must equal the
--      prestate body byte-for-byte. (That proof caught a fourth change twice during the build.)
--   2. clara.sign_vendor_identity_binding(uuid,text)      -- pre-image prosrc 5285581e... (0144)
--      DROP + CREATE at a NEW signature (uuid,text,text). Not a CoR: p_attestation is a new
--      parameter, and a parameter list cannot change under CREATE OR REPLACE without leaving
--      the old overload shadow-reachable (0054's own prestate class; 0143 hit it too). The new
--      third argument DEFAULTs to null, so every existing 2-arg caller resolves unedited; the
--      tail proves the 2-arg overload is GONE and that the ACL the DROP destroyed was re-made.
--   3. clara._tf_vendor_identity_binding_update()  -- the t_vib_frozen body (0028:198-213).
--      CREATE OR REPLACE, same signature. S-1: its freeze list was a NEGATIVE list covering five
--      derived content fields, and this file adds four maker/checker-bearing columns it could not
--      see. Proven by (2c): the body MOVED, every one of 0028's own five guard terms survives
--      verbatim, and nine new ones are present -- read on the comment-stripped live prosrc.
--
-- Everything ELSE this file installs is a brand-new name -- clara._binding_extra_blocker,
-- clara._binding_suppression, clara._expire_stale_proposals, clara._derive_vendor_binding_basis,
-- clara._propose_vendor_binding_agent_core, clara.wake_propose_vendor_identity_binding,
-- clara.wake_list_binding_candidates, clara.decline_vendor_identity_binding,
-- clara.reset_binding_decline, clara.eligible_binding_signer_count,
-- clara.binding_identity_review -- and the tail proves each resolves at EXACTLY ONE pg_proc row,
-- as a census over pg_proc, never as a claim in this comment. The sixteen OTHER pinned bodies
-- are re-pinned BYTE-IDENTICAL, clara._approve_entry_core among them, deliberately: PR-3
-- replaces it and needs an undisturbed pre-image to pin.
--
-- TWO VIEWS are CREATE OR REPLACE'd: clara._agent_receipt_src_pb_binding (a brand-new name, so a
-- first creation dressed as CoR only by the estate's idiom) and clara._agent_receipts_all
-- (widened by one UNION ALL arm, its NINTH). Neither is a D1 event -- a view definition has no
-- "an in-flight call runs the old body" hazard the way a PL/pgSQL function does; once the DDL
-- commits every subsequent SELECT sees the new definition (0142 SS0's own measured reasoning,
-- inherited verbatim rather than re-argued). clara.agent_receipts_visible is UNTOUCHED: it
-- already reads `r.* from clara._agent_receipts_all r`.
--
-- THE HUMAN DOOR'S BEHAVIOUR CHANGES WITHOUT ITS BODY CHANGING, AND THAT IS KNOWINGLY ACCEPTED
-- (G8, ruled). uq_vib_one_active_binding makes a SECOND manual clara.propose_vendor_identity_
-- binding call on an already-proposed (client, counterparty) pair refuse -- and it refuses with
-- the ESTATE'S EXISTING TYPED binding_conflict, because that body already wraps its INSERT in
-- `exception when unique_violation then raise 'binding_conflict' using errcode='CLR36'`
-- (0028_vendor_identity_binding.sql:770-772). Its prosrc is pinned unchanged in SS0 AND
-- re-asserted byte-identical in the tail: the behaviour moved, the body did not. The battery
-- proves the typed refusal on BOTH paths (agent-then-human and human-then-agent).
--
-- THE DDL THIS FILE DOES TAKE, and why it is not a D1 obligation: six ADD COLUMNs, five CHECKs,
-- one FK and one partial unique index on clara.vendor_identity_bindings, plus two constraint
-- drop/adds on clara.agent_receipt_surfaces. Each takes ACCESS EXCLUSIVE briefly. The
-- `set local lock_timeout` below is PRECAUTIONARY, not load-bearing.
--
-- =====================================================================================
-- WHY A REFUSAL WRITES NO RECEIPT -- stated plainly rather than claimed away
-- =====================================================================================
-- Every wall in this file RAISEs. A raise rolls back the whole call, so no refused proposal can
-- leave a receipt behind: there is no path today that writes a binding_agent_receipts row with a
-- refusal row at all. This is a DELIBERATE deviation from the design annexes' cell R-2, which
-- assumed a non-raising refusal path this door does not have (and which PostgreSQL cannot give
-- it without an autonomous transaction; 0126:158-170 says the same thing about its own doors).
-- AN EARLIER DRAFT OF THIS FILE KEPT THE VOCABULARY ANYWAY -- a `failing_rungs` column, a
-- nullable `binding_id`, and a ck_bar_proposed_iff_clean CHECK pairing them -- described as "the
-- shape a future refusal path must satisfy". The independent gate ruled that out (O2/B2) and was
-- right to: a vocabulary no code can write is not a wall, it is a promise, and a reader who finds
-- `failing_rungs` on a receipt table reasonably concludes refusals are recorded there. They are
-- not. So `binding_id` is NOT NULL, the CHECK is gone, the column is gone, and the 19-column
-- contract's ordinal-13 slot is filled by an honest empty constant in the shim. Every row that
-- exists IS a clean proposal, and the type now says so. Refusals are evidenced on the wake
-- task/turn path, exactly as 0126's doors evidence theirs.
--
-- =====================================================================================
-- SS1 -- PRESTATE. Fail-closed; an absent or wrong-shaped premise aborts the apply, loudly.
-- =====================================================================================
do $bp1_pre$
declare v_missing text; v_def text; v_src text; v_sha text; v_n int;
begin
  if not exists (select 1 from clara.schema_migrations
                  where version = '0147_db_hardening_b_hash_only_bearer_tokens') then
    raise exception 'binding proposal pr-1 prestate: 0147_db_hardening_b_hash_only_bearer_tokens is not applied -- frontier mismatch'
      using errcode = 'CLR10';
  end if;

  -- (a) NOTHING this file creates may already exist.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('binding_agent_receipts'),('_agent_receipt_src_pb_binding')) t(n)
   where to_regclass('clara.'||t.n) is not null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: relation(s) already present: %', v_missing using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)'),
                 ('clara._propose_vendor_binding_agent_core(uuid,uuid,text,uuid,uuid,uuid,jsonb,text,jsonb,text)'),
                 ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)'),
                 ('clara.wake_list_binding_candidates(uuid)'),
                 ('clara.decline_vendor_identity_binding(uuid,text,text)'),
                 ('clara.reset_binding_decline(uuid,text,text)'),
                 ('clara._binding_extra_blocker(uuid,uuid,uuid,jsonb,jsonb)'),
                 ('clara.eligible_binding_signer_count(uuid)'),
                 ('clara._binding_suppression(uuid,uuid,uuid)'),
                 ('clara._expire_stale_proposals(uuid,uuid,uuid)'),
                 ('clara.binding_identity_review()'),
                 ('clara._binding_lock_pair(uuid,uuid)'),
                 ('clara._binding_hard_id_norm(text)'),
                 ('clara._binding_doc_fingerprint(uuid)'),
                 ('clara._tf_agent_receipt_surface_conforms()'),
                 ('clara.sign_vendor_identity_binding(uuid,text,text)')) t(n)
   where to_regprocedure(t.n) is not null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: function(s) already present: %', v_missing using errcode = 'CLR10';
  end if;
  -- The BARE NAMES too, not just the signatures -- an overload under a different arity would
  -- make every "exactly one pg_proc row" tail cell a lie (review law 3: a signature probe reads
  -- one projection of the name; the bare-name census reads the name itself).
  select string_agg(p.proname, ', ' order by p.proname) into v_missing
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname in
     ('_derive_vendor_binding_basis','_propose_vendor_binding_agent_core',
      'wake_propose_vendor_identity_binding','wake_list_binding_candidates',
      'decline_vendor_identity_binding','reset_binding_decline','_binding_extra_blocker',
      'eligible_binding_signer_count','_binding_suppression','_expire_stale_proposals',
      'binding_identity_review','_binding_lock_pair','_binding_hard_id_norm',
      '_binding_doc_fingerprint','_tf_agent_receipt_surface_conforms');
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: pg_proc already carries name(s) under some arity: %', v_missing
      using errcode = 'CLR10';
  end if;

  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('proposed_by_agent'),('proposer_model'),('proposal_receipt_id'),
                 ('declined_by'),('declined_at'),('decline_reason')) t(n)
   where exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.vendor_identity_bindings'::regclass
                    and a.attnum > 0 and not a.attisdropped and a.attname = t.n);
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: vendor_identity_bindings already carries column(s): %', v_missing
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from pg_class where relname = 'uq_vib_one_active_binding'
              and relnamespace = 'clara'::regnamespace) then
    raise exception 'binding proposal pr-1 prestate: uq_vib_one_active_binding already exists' using errcode = 'CLR10';
  end if;
  -- PREFLIGHT for the widened index (conductor ruling (c): RECONCILE means REFUSE, never
  -- de-duplicate). Today's world admits N proposed rows per pair AND a proposed row alongside a
  -- live one; the new index forbids both. On a populated database the CREATE INDEX would fail
  -- with a bare 23505 naming one arbitrary tuple. This names every offending pair up front, so
  -- the operator gets a data decision to take rather than a mystery. Choosing FOR the owner
  -- which duplicate survives is not a migration's call.
  select string_agg(format('client=%s counterparty=%s x%s', t.client_id, t.counterparty_id, t.n), '; ')
    into v_missing
    from (select client_id, counterparty_id, count(*) n
            from clara.vendor_identity_bindings
           where status in ('proposed','live')
           group by client_id, counterparty_id having count(*) > 1) t;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: % (client, counterparty) pair(s) already carry more than one proposed/live binding, so uq_vib_one_active_binding cannot be built -- reconcile them by hand first, this migration will not choose which row survives: %',
      (select count(*) from (select 1 from clara.vendor_identity_bindings where status in ('proposed','live')
                              group by client_id, counterparty_id having count(*) > 1) z),
      v_missing using errcode = 'CLR10';
  end if;
  -- vendor_identity_bindings is the 17-column shape this file was authored against.
  select count(*)::int into v_n from pg_attribute a
   where a.attrelid = 'clara.vendor_identity_bindings'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_n <> 17 then
    raise exception 'binding proposal pr-1 prestate: vendor_identity_bindings carries % column(s), expected the pre-existing 17', v_n
      using errcode = 'CLR10';
  end if;

  if exists (select 1 from clara.wake_fn_allowlist
              where function_name in ('wake_propose_vendor_identity_binding','wake_list_binding_candidates')) then
    raise exception 'binding proposal pr-1 prestate: the allowlist already names a binding wake verb' using errcode = 'CLR10';
  end if;
  -- The whole allowlist, as a closed-world count: 88 rows over 7 kinds, ZERO of them naming any
  -- binding verb at all (survey S2, re-measured live here rather than inherited).
  select count(*)::int into v_n from clara.wake_fn_allowlist where function_name ilike '%binding%';
  if v_n <> 0 then
    raise exception 'binding proposal pr-1 prestate: the allowlist already carries % binding row(s)', v_n using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.agent_receipt_surfaces where item = 'pb_binding'
              or receipt_kind = 'binding_agent' or expected_source = 'binding_agent_receipts') then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces already carries a pb_binding/binding_agent row'
      using errcode = 'CLR10';
  end if;

  -- (b) THE TWO CLOSED-WORLD REGEXES THIS FILE WIDENS, read BYTE-EXACT from the LIVE catalog --
  --     never copied from 0142's text (the superseded-body class).
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_item_check';
  if v_def is distinct from 'CHECK ((item ~ ''^f_a[0-9]+[a-z]?$''::text))' then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces_item_check is not the live f_a-only world this file widens (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_shim_relname_check';
  if v_def is distinct from 'CHECK ((shim_relname ~ ''^_agent_receipt_src_f_a[0-9]+[a-z]?$''::text))' then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces_shim_relname_check is not the live f_a-only world this file widens (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.agent_receipt_surfaces) <> 8 then
    raise exception 'binding proposal pr-1 prestate: agent_receipt_surfaces holds % row(s), expected the pre-existing 8',
      (select count(*) from clara.agent_receipt_surfaces) using errcode = 'CLR10';
  end if;

  -- (b2) THE EVENT-TYPE REGISTRY -- the fifth named shared surface this file touches, and the
  --      one the design's annex G-f ledger does not list. clara.domain_events.event_type is
  --      FK-bound to the APPEND-ONLY clara.event_types and additionally gated by the
  --      _tf_validate_domain_event trigger. Read the REGISTRY, not a CHECK on a relation that
  --      does not exist -- the first draft of this file did the latter and mistook an empty
  --      result for an open world.
  if to_regclass('clara.trigger_taxonomy') is null or to_regclass('clara.taxonomy_active') is null then
    raise exception 'binding proposal pr-1 prestate: clara.trigger_taxonomy / clara.taxonomy_active are absent -- event_types is HALF of a coupled pair and this file must register into both'
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.taxonomy_active) <> 1 then
    raise exception 'binding proposal pr-1 prestate: clara.taxonomy_active does not name exactly one active version'
      using errcode = 'CLR10';
  end if;
  -- COVERAGE IS WHOLE BEFORE THIS FILE RUNS. If it were already broken, the tail's own coverage
  -- cell would fail for somebody else's reason and this file would be blamed for it.
  if exists (select 1 from clara.event_types e
              where not exists (select 1 from clara.trigger_taxonomy t
                                 where t.event_type = e.name
                                   and t.version = (select version from clara.taxonomy_active))) then
    raise exception 'binding proposal pr-1 prestate: event_type/trigger_taxonomy coverage is ALREADY incomplete at the active version, before this file adds anything: %',
      (select string_agg(e.name, ', ' order by e.name) from clara.event_types e
        where not exists (select 1 from clara.trigger_taxonomy t
                           where t.event_type = e.name
                             and t.version = (select version from clara.taxonomy_active)))
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.event_types') is null then
    raise exception 'binding proposal pr-1 prestate: clara.event_types is absent -- the event gate this file registers into does not exist'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.domain_events'::regclass
                  and conname = 'domain_events_event_type_fkey' and contype = 'f') then
    raise exception 'binding proposal pr-1 prestate: domain_events no longer FKs its event_type to the registry -- the premise for registering has moved'
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('kb_binding.agent_proposed'),('kb_binding.declined'),('kb_binding.decline_reset'),('kb_binding.expired')) t(n)
   where exists (select 1 from clara.event_types e where e.name = t.n);
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: clara.event_types already carries: %', v_missing using errcode = 'CLR10';
  end if;
  -- The three kb_binding.* members 0028 registered are the live world this file extends by two.
  if (select count(*) from clara.event_types where name like 'kb_binding.%') <> 3 then
    raise exception 'binding proposal pr-1 prestate: clara.event_types carries % kb_binding.* member(s), expected the pre-existing 3',
      (select count(*) from clara.event_types where name like 'kb_binding.%') using errcode = 'CLR10';
  end if;
  -- (the registry's pre-count is stashed in (k), once the temp table exists)

  -- (c) The status CHECK already admits 'declined' -- the value the decline verb writes. If it
  --     did not, this file would owe a widening it does not take.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = 'vendor_identity_bindings_status_check';
  if v_def is distinct from
     'CHECK ((status = ANY (ARRAY[''proposed''::text, ''live''::text, ''revoked''::text, ''declined''::text, ''expired''::text])))' then
    raise exception 'binding proposal pr-1 prestate: vendor_identity_bindings_status_check is not the live 5-value world (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;
  -- ck_vib_revoked is the honesty idiom the new declined pair mirrors; read live so the mirror
  -- is of the real thing, not of a remembered one.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = 'ck_vib_revoked';
  if v_def is distinct from 'CHECK (((status = ''revoked''::text) = (revoked_at IS NOT NULL)))' then
    raise exception 'binding proposal pr-1 prestate: ck_vib_revoked is not the live honesty idiom this file mirrors (live: %)',
      coalesce(v_def, '(constraint absent)') using errcode = 'CLR10';
  end if;

  -- (d) THE 裁-22 RESOLVER, BY EXACT SIGNATURE (review law 3 -- a bare name is a projection, not
  --     the thing) AND BY PROSRC SHA. This door is 裁-22's THIRD consumer; if the merged
  --     resolver ever drifts, this file must not silently wire onto a different contract.
  if to_regprocedure('clara._resolve_proposal_basis(uuid[],uuid,jsonb)') is null then
    raise exception 'binding proposal pr-1 prestate: clara._resolve_proposal_basis(uuid[],uuid,jsonb) -- 0143''s document-SET resolver -- is ABSENT'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._resolve_proposal_basis(uuid[],uuid,jsonb)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> 'dddd2747d3a440d2f5e644e1bac79c23ec227d6e71960c075016afb3fa60c3b5' then
    raise exception 'binding proposal pr-1 prestate: _resolve_proposal_basis prosrc sha256 mismatch (got %, expected dddd2747d3a440d2f5e644e1bac79c23ec227d6e71960c075016afb3fa60c3b5) -- the shared 裁-22 contract moved under this door',
      v_sha using errcode = 'CLR10';
  end if;
  -- And it must exist under EXACTLY ONE arity: a shadowed single-document overload would let a
  -- typo bind this door to the wrong contract at first call rather than here.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_resolve_proposal_basis';
  if v_n <> 1 then
    raise exception 'binding proposal pr-1 prestate: clara._resolve_proposal_basis resolves at % pg_proc row(s), expected exactly 1', v_n
      using errcode = 'CLR10';
  end if;

  -- (e) THE 裁-18a SIGNER<>PROPOSER WALL IS LIVE, and this door must leave it satisfiable.
  --     Proven POSITIVELY (what a read actually SAW -- review law 2), by the wall's own DETAIL
  --     reason token in the live body, not by the body's absence of something.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'binding proposal pr-1 prestate: clara.sign_vendor_identity_binding is GONE' using errcode = 'CLR10';
  end if;
  if position('detail=''{"reason":"signer_is_proposer"}''' in v_src) = 0 then
    raise exception 'binding proposal pr-1 prestate: the 裁-18a signer<>proposer wall is NOT live in sign_vendor_identity_binding -- this door''s whole reason for existing (裁-18c''s first way out) is unproven'
      using errcode = 'CLR10';
  end if;
  -- It is an ACTOR COMPARISON, not a "the proposer must be human" test (annex G-a). Read in
  -- CODE: `b.created_by = c.actor`. Written the other way it would refuse Clara's proposals and
  -- strand every single-admin firm.
  if position('b.created_by = c.actor' in v_src) = 0 then
    raise exception 'binding proposal pr-1 prestate: the 裁-18a wall is not the actor comparison this door depends on'
      using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941' then
    raise exception 'binding proposal pr-1 prestate: sign_vendor_identity_binding prosrc sha256 mismatch (got %, expected 5285581ec371856d525fb47d2cfabc6e72b3a37285b291390e8c7aa34034e941)',
      v_sha using errcode = 'CLR10';
  end if;

  -- (f) THE DO-NOT-TOUCH BODIES, pinned by prosrc sha256 so the tail's re-pin is a real
  --     before/after comparison and a drift ABORTS the apply rather than passing silently.
  --     Instrument: encode(sha256(convert_to(prosrc,'UTF8')),'hex') -- prosrc, never
  --     pg_get_functiondef (which folds in ACL-independent decoration).
  create temp table _bp1_pre(k text primary key, v text);
  insert into _bp1_pre(k, v)
  select t.sig,
         encode(sha256(convert_to(
           (select p.prosrc from pg_proc p where p.oid = t.sig::regprocedure), 'UTF8')), 'hex')
    from (values
      ('clara.propose_vendor_identity_binding(jsonb,text)'),
      ('clara.sign_vendor_identity_binding(uuid,text)'),
      ('clara.revoke_vendor_identity_binding(uuid,text,text)'),
      ('clara._derive_vendor_binding_proposal(uuid,uuid,uuid)'),
      ('clara._resolve_vendor_binding(uuid,uuid,uuid)'),
      ('clara._binding_common_prefix(text,text,text)'),
      ('clara._binding_f3_holds(uuid,text,text)'),
      ('clara._coding_lane_core(uuid,uuid)'),
      ('clara.get_vendor_binding(uuid)'),
      ('clara.list_vendor_bindings(uuid)'),
      ('clara.list_review_queue(jsonb,jsonb,integer)'),
      ('clara.agent_user_id()'),
      ('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'),
      ('clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'),
      ('clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'),
      ('clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)'),
      ('clara._resolve_proposal_basis(uuid[],uuid,jsonb)'),
      ('clara.eligible_checker_count(uuid)'),
      -- S-1 (2026-08-30): D1 BODY 3. The freeze trigger's body is a LIVE WRITER BODY and this
      -- file re-cuts it, so it is stashed like the other two and EXCLUDED from the re-pin below.
      ('clara._tf_vendor_identity_binding_update()')
    ) t(sig);
  if exists (select 1 from _bp1_pre where v is null) then
    raise exception 'binding proposal pr-1 prestate: a DO-NOT-TOUCH body did not resolve: %',
      (select string_agg(k, ', ' order by k) from _bp1_pre where v is null) using errcode = 'CLR10';
  end if;
  -- The two whose EXACT bytes this file's whole design rests on are pinned against literals, not
  -- merely stashed: the frozen derivation (survey S4 -- its content_hash covers the evidence
  -- array, so any drift un-signs every open proposal) and the shared lane body G3 forbids
  -- touching.
  if (select v from _bp1_pre where k = 'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)')
     <> 'de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c' then
    raise exception 'binding proposal pr-1 prestate: _derive_vendor_binding_proposal is NOT the byte-frozen de0f5807... body this design is built on (got %)',
      (select v from _bp1_pre where k = 'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)') using errcode = 'CLR10';
  end if;
  if (select v from _bp1_pre where k = 'clara._coding_lane_core(uuid,uuid)')
     <> '721a6704e3284679103537bdda56bf741422041e16dda0f4654394f1d9506fda' then
    raise exception 'binding proposal pr-1 prestate: _coding_lane_core is not the 721a6704... body G3 rules untouched (got %)',
      (select v from _bp1_pre where k = 'clara._coding_lane_core(uuid,uuid)') using errcode = 'CLR10';
  end if;
  -- ...AND THE OTHER TWO D1 PRE-IMAGES, pinned against LITERALS as well as stashed. A stash that
  -- was itself taken off a drifted body compares equal to itself and proves nothing, so the two
  -- bodies whose SURGICAL DELTA this file proves get a literal each. Instrument, named:
  -- encode(sha256(convert_to(prosrc,'UTF8')),'hex') -- prosrc, never pg_get_functiondef.
  --   * propose_vendor_identity_binding: 610ef1df... (0028), independently witnessed on a
  --     pristine control chain at main.
  --   * _tf_vendor_identity_binding_update: cfd20933... (0028:198-213). No pristine witness held
  --     it anywhere -- nobody had ever pinned this trigger body -- so it is DERIVED from 0028's
  --     own source, which is what PostgreSQL stores verbatim as prosrc, and re-measured HERE
  --     against the live catalog. If the derivation is wrong the apply aborts, which is the point.
  if (select v from _bp1_pre where k = 'clara.propose_vendor_identity_binding(jsonb,text)')
     <> '610ef1dfc18f963122ed2012e49a96b06526b93baca2f269fa054a76302f7fc7' then
    raise exception 'binding proposal pr-1 prestate: propose_vendor_identity_binding is NOT the 610ef1df... 0028 pre-image this file re-substitutes against (got %)',
      (select v from _bp1_pre where k = 'clara.propose_vendor_identity_binding(jsonb,text)') using errcode = 'CLR10';
  end if;
  if (select v from _bp1_pre where k = 'clara._tf_vendor_identity_binding_update()')
     <> 'cfd20933278f86e7e741e2326bd8aa7980c4d376ba9cf7461f2580a113cbcb54' then
    raise exception 'binding proposal pr-1 prestate: _tf_vendor_identity_binding_update is NOT the cfd20933... 0028 freeze body this file re-cuts (got %)',
      (select v from _bp1_pre where k = 'clara._tf_vendor_identity_binding_update()') using errcode = 'CLR10';
  end if;

  -- (g) The live premises this file builds ON, each named individually.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_firm()'),('clara.jwt_sub()'),('clara.actor_role_rank()'),
                 ('clara.role_rank(text)'),('clara._human_ctx(integer)'),
                 ('clara.agent_user_id()'),('clara.wake_context()'),('clara._wake_task_id()'),
                 ('clara.name_family_is_ambiguous(uuid,text)'),
                 ('clara.assert_wake_allowed(text,text)'),
                 ('clara._reserve_op(uuid,text,text,bytea)'),('clara._finish_op(uuid,text,text,jsonb)'),
                 ('clara._hash(jsonb)'),('clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'),
                 ('clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)'),
                 ('clara._tf_append_only()'),('clara._tf_no_truncate()'),
                 ('clara._canonical_counterparty(uuid,uuid)'),('clara._binding_normalize(text)'),
                 ('clara._assert_receipt_surface_conforms(text)'),
                 ('clara.agent_receipt_source_census()'),('clara.agent_receipt_dark_rows()')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: required live function(s) absent: %', v_missing using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('firms'),('clients'),('counterparties'),('users'),('documents'),
                 ('document_regions'),('document_extractions'),('journal_entries'),('journal_lines'),
                 ('vendor_identity_bindings'),('vendor_identity_binding_evidence'),
                 ('wake_fn_allowlist'),('wake_credentials'),('op_receipts'),('client_resolutions'),
                 ('agent_receipt_contract'),('agent_receipt_surfaces'),('agent_receipts_visible'),
                 ('_agent_receipts_all')) t(n)
   where to_regclass('clara.'||t.n) is null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: required live relation(s) absent: %', v_missing using errcode = 'CLR10';
  end if;

  -- (h) BOTH executor roles G1 arm A grants to must already exist -- this file mints NO role and
  --     therefore owes NO packages/db/deploy/roles-bootstrap.sql twin (the W2/W3 law (1) does
  --     not fire). Proven by reading pg_roles, not by the absence of a CREATE ROLE below.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara_wake_filing'),('clara_wake_interactive'),('clara_fn_owner'),
                 ('clara_authenticated')) t(n)
   where not exists (select 1 from pg_roles where rolname = t.n);
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: required role(s) absent: %', v_missing using errcode = 'CLR10';
  end if;
  -- Both wake kinds already exist in the credential CHECK -- this file widens NO closed world
  -- there, which is exactly what makes G1 arm A cost two allowlist rows instead of a new kind.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.wake_credentials'::regclass and conname = 'ck_wake_credentials_kind_0011';
  if v_def is null or position('''filing''' in v_def) = 0 or position('''interactive''' in v_def) = 0 then
    raise exception 'binding proposal pr-1 prestate: ck_wake_credentials_kind_0011 does not already admit both filing and interactive (live: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;

  -- (i) The agent sentinel is a REAL is_agent user row (survey S3) -- what makes the honesty
  --     CHECK meaningful and 裁-18a satisfiable by construction.
  if not exists (select 1 from clara.users u where u.id = clara.agent_user_id() and u.is_agent) then
    raise exception 'binding proposal pr-1 prestate: clara.agent_user_id() is not a live is_agent users row' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.users where is_agent;
  if v_n <> 1 then
    raise exception 'binding proposal pr-1 prestate: clara.users carries % is_agent row(s), expected exactly 1', v_n using errcode = 'CLR10';
  end if;
  -- The honesty CHECK below is only legal because agent_user_id() is IMMUTABLE and relation-free
  -- (design risk R1 / prediction P-2). Measured here rather than assumed.
  if (select p.provolatile from pg_proc p where p.oid = 'clara.agent_user_id()'::regprocedure) <> 'i' then
    raise exception 'binding proposal pr-1 prestate: clara.agent_user_id() is not IMMUTABLE -- the honesty CHECK cannot be built on it'
      using errcode = 'CLR10';
  end if;

  -- (j) The composite keys the two new FKs need.
  if not exists (select 1 from pg_constraint where conrelid = 'clara.counterparties'::regclass
                  and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (id, firm_id, client_id)') then
    raise exception 'binding proposal pr-1 prestate: counterparties has no UNIQUE (id, firm_id, client_id) for the receipt FK'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'clara.vendor_identity_bindings'::regclass
                  and conname = 'uq_vendor_bindings_id_firm_client') then
    raise exception 'binding proposal pr-1 prestate: uq_vendor_bindings_id_firm_client is absent' using errcode = 'CLR10';
  end if;

  -- (l) THE 2026-08-30 FOLD ROUND'S OWN PREMISES. Every one is a fact a folded wall is built on,
  --     measured here so the wall cannot be built on a remembered world.
  --
  -- (l1) C1 / N-1: clara.client_resolutions has NO COUNTERPARTY KEY. That is the whole ground for
  --      striking W18's second arm: a row there proves which CLIENT a document belongs to, never
  --      which VENDOR issued it. If a later lane ever adds a counterparty-keyed resolution, this
  --      premise moves and the arm can be reinstated deliberately -- so it aborts rather than
  --      letting the strike quietly outlive its reason.
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'clara.client_resolutions'::regclass and a.attnum > 0
                and not a.attisdropped and a.attname like '%counterparty%') then
    raise exception 'binding proposal pr-1 prestate: clara.client_resolutions now carries a counterparty-shaped column -- W18''s human-resolution arm was struck BECAUSE that table proves client attribution only; re-read the ruling before this file lands'
      using errcode = 'CLR10';
  end if;
  -- (l2) N-1 CAUTION: the target counterparty's HARD IDENTIFIER COLUMNS, measured rather than
  --      assumed. invoice.vendor_registration carries EITHER an SSM number or a TIN and never
  --      says which (0049:955-965 measured the whole live invoice.* vocabulary and found no
  --      vendor-taxid path), so the wall must accept ANY hard identifier the row carries.
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('registration_normalized'),('tin')) t(n)
   where not exists (select 1 from pg_attribute a
                      where a.attrelid = 'clara.counterparties'::regclass and a.attnum > 0
                        and not a.attisdropped and a.attname = t.n);
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: clara.counterparties is missing hard-identifier column(s) %: W18 is kind-aware over exactly the identifiers the row carries', v_missing
      using errcode = 'CLR10';
  end if;
  -- (l3) C2: the economic fingerprint reads clara.document_regions.monetary_cents and text.
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.document_regions'::regclass and a.attnum > 0
                    and not a.attisdropped and a.attname = 'monetary_cents') then
    raise exception 'binding proposal pr-1 prestate: clara.document_regions.monetary_cents is absent -- the economic fingerprint has no amount to read'
      using errcode = 'CLR10';
  end if;
  -- (l4) M-12 / S-2: the duplicate-override marker lives on journal_entries.flags (0009:1646).
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.journal_entries'::regclass and a.attnum > 0
                    and not a.attisdropped and a.attname = 'flags') then
    raise exception 'binding proposal pr-1 prestate: clara.journal_entries.flags is absent -- the duplicate_override marker has nowhere to live'
      using errcode = 'CLR10';
  end if;
  -- (l5) H5: the durable roster window reads firm_memberships.removed_at and 0141's firm_invites.
  if to_regclass('clara.firm_invites') is null then
    raise exception 'binding proposal pr-1 prestate: clara.firm_invites (0141) is absent -- the solo-signer roster window counts pending admin+ invites'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'clara.firm_memberships'::regclass and a.attnum > 0
                    and not a.attisdropped and a.attname = 'removed_at') then
    raise exception 'binding proposal pr-1 prestate: clara.firm_memberships.removed_at is absent -- the 90-day roster window has no departure stamp to read'
      using errcode = 'CLR10';
  end if;
  -- (l6) C3, POSITIVELY MEASURED, both halves. The ledger row for 0029 IS present (ledgers are
  --      append-only, so its presence proves nothing about the control) AND clara._approve_entry_core
  --      carries no binding re-check at all. That pair is the finding: a permanently-true gate.
  if not exists (select 1 from clara.schema_migrations where version = '0029_vendor_binding_executor') then
    raise exception 'binding proposal pr-1 prestate: the 0029 ledger row is ABSENT -- the C3 finding this file folds assumed it present-but-meaningless; re-read before landing'
      using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'binding proposal pr-1 prestate: clara._approve_entry_core is GONE -- the post-time control witness has nothing to read'
      using errcode = 'CLR10';
  end if;
  if position('binding_post_time_recheck_v1' in v_src) <> 0 then
    raise exception 'binding proposal pr-1 prestate: clara._approve_entry_core ALREADY carries the ratified post-time marker -- PR-3 has landed and this file''s interlock is stale'
      using errcode = 'CLR10';
  end if;
  if position('vendor_binding' in v_src) <> 0 then
    raise exception 'binding proposal pr-1 prestate: clara._approve_entry_core references vendor_binding -- the premise that the approve path carries NO binding re-check has moved'
      using errcode = 'CLR10';
  end if;
  -- FOR PR-3, recorded rather than pinned: the pristine pre-image of the body PR-3 splices is
  -- d5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637 (witnessed on a pristine
  -- control chain at main, same instrument). It is DELIBERATELY not a literal check here -- the
  -- premise this file depends on is "the approve path carries no binding re-check", which the two
  -- reads above measure directly; a sha literal would additionally abort on an unrelated CoR by
  -- another lane, which is coupling this file has no reason to buy. The body is still re-pinned
  -- BYTE-IDENTICAL against its own stash in the tail, so PR-3 inherits an undisturbed pre-image.
  -- (l7) L-14: EVERY existing agent_receipt_surfaces row must already satisfy the TIGHTENED
  --      token grammar and already have a conforming shim, or this file would red a lawful row.
  --      Measured before the widening, not discovered by the ALTER's own validation pass.
  select string_agg(format('%s/%s', s.item, s.shim_relname), ', ' order by s.item) into v_missing
    from clara.agent_receipt_surfaces s
   where s.item !~ '^(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9]*(_[a-z0-9]+)*)$'
      or s.shim_relname !~ '^_agent_receipt_src_(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9]*(_[a-z0-9]+)*)$'
      or to_regclass('clara.' || quote_ident(s.shim_relname)) is null;
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: existing agent_receipt_surfaces row(s) would be refused by the tightened grammar or have no shim relation: % -- report this, do NOT widen the pattern to fit', v_missing
      using errcode = 'CLR10';
  end if;
  -- (l8) S-1: the freeze trigger this file re-cuts is the ONLY non-internal update trigger on
  --      clara.vendor_identity_bindings, and it is the 0028 body (pinned by prosrc in (f)).
  select string_agg(t.tgname, ', ' order by t.tgname) into v_missing
    from pg_trigger t
   where t.tgrelid = 'clara.vendor_identity_bindings'::regclass and not t.tgisinternal
     and t.tgname <> 't_vib_frozen';
  if v_missing is not null then
    raise exception 'binding proposal pr-1 prestate: clara.vendor_identity_bindings carries non-internal trigger(s) beyond t_vib_frozen: % -- the freeze re-cut assumed t_vib_frozen is the whole story', v_missing
      using errcode = 'CLR10';
  end if;

  -- (k) CONSTRAINT 15: the frozen prior build and the Slice-0 parked run are not this file's
  --     business. Counted before, re-counted in the tail.
  insert into _bp1_pre(k, v) values ('foreign_objs',
    (select coalesce(count(*),0)::text from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
      where n2.nspname in ('workflow','graphile_worker','spike')));
  insert into _bp1_pre(k, v) values ('sign.prosrc',
    (select p.prosrc from pg_proc p where p.oid = 'clara.sign_vendor_identity_binding(uuid,text)'::regprocedure));
  insert into _bp1_pre(k, v) values ('propose.prosrc',
    (select p.prosrc from pg_proc p where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure));
  insert into _bp1_pre(k, v) values ('freeze.prosrc',
    (select p.prosrc from pg_proc p where p.oid = 'clara._tf_vendor_identity_binding_update()'::regprocedure));
  insert into _bp1_pre(k, v) values ('taxonomy_versions',
    (select count(*)::text from clara.taxonomy_versions));
  insert into _bp1_pre(k, v) values ('event_types_total',
    (select count(*)::text from clara.event_types));

  raise notice 'binding proposal pr-1 prestate: clean -- frontier 0147+; 2 new relations + 15 new function names absent under EVERY arity (and the signer''s new 3-arg overload absent too); vendor_identity_bindings is the pre-existing 17-column shape carrying none of the 12 new columns, no uq_vib_one_active_binding, and NO (client, counterparty) pair already carrying more than one proposed/live row (the widened index''s refusing preflight); the allowlist carries ZERO binding rows (of 88 over 7 kinds); agent_receipt_surfaces holds exactly 8 rows with both closed-world regexes read BYTE-EXACT at their live f_a-only text; the status CHECK already admits ''declined'' and ck_vib_revoked read live as the honesty idiom the declined pair mirrors; 裁-22''s clara._resolve_proposal_basis(uuid[],uuid,jsonb) resolves at EXACTLY ONE pg_proc row with prosrc dddd2747...; the 裁-18a signer<>proposer wall is POSITIVELY present in sign_vendor_identity_binding as an ACTOR COMPARISON (prosrc 5285581e...); 19 DO-NOT-TOUCH bodies stashed by prosrc sha256 (the THREE this file recuts among them, each additionally pinned against a literal: propose 610ef1df..., sign 5285581e..., the t_vib_frozen body cfd20933...) with _derive_vendor_binding_proposal pinned at de0f5807... and _coding_lane_core at 721a6704...; 20 live functions + 18 live relations + 4 roles present; both wake kinds already in the credential CHECK (no closed world widened there); exactly one is_agent user row and agent_user_id() is IMMUTABLE (P-2''s precondition).';
end
$bp1_pre$;

set role clara_fn_owner;

-- PRECAUTIONARY, not load-bearing (.claude/rules/db-migrations.md asks which). The ALTERs below
-- take ACCESS EXCLUSIVE on clara.vendor_identity_bindings and clara.agent_receipt_surfaces. Both
-- carry tens of rows on any real chain, so the ALTERs themselves complete instantly once the
-- lock is granted -- the exposure is lock ACQUISITION queueing behind a long-running reader, and
-- a short bounded wait turns an indefinite hang into a named, retryable failure.
set local lock_timeout = '5s';

-- =====================================================================================
-- SS2 -- THE RECEIPT TABLE (design SS3.5 / annex B). A NINTH registered member, because
-- neither existing table can host this act: agent_filing_receipts'
-- ck_agent_filing_receipts_filed_iff_clean makes a clean, filing-less receipt structurally
-- impossible (and relaxing it is the vacuous-relaxation class the W2/W3 close named), and
-- agent_act_receipts demands a wake_task_id FK the chat-turn trigger has not got plus two
-- close-domain closed-world widenings. Both measured in the survey (S7), neither re-argued here.
-- =====================================================================================
create table clara.binding_agent_receipts (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null references clara.firms(id),
  client_id        uuid        not null,
  counterparty_id  uuid        not null,
  binding_id       uuid        not null,
  model            text,
  model_version    text,
  -- M2 (gate, 2026-08-29): a length cap. `rationale` is model-authored prose rendered on a human
  -- card; unbounded text is a denial-of-reading surface as much as a storage one.
  rationale        text        not null check (btrim(rationale) <> '' and length(rationale) <= 4000),
  verdict          jsonb       not null check (jsonb_typeof(verdict) = 'object'),
  via_wake_kind    text        not null,
  trigger_kind     text        not null check (trigger_kind in ('wake_task','wake_credential')),
  trigger_id       text        not null check (btrim(trigger_id) <> ''),
  authorization_id uuid,
  adopted_verbatim boolean,
  acting_actor     uuid        not null,
  on_behalf_of     uuid,
  created_at       timestamptz not null default now(),
  constraint uq_binding_agent_receipts_id_firm unique (id, firm_id),
  constraint fk_bar_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_bar_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  -- M1 (gate): DEFERRABLE INITIALLY DEFERRED. The receipt and the binding reference each other,
  -- so one write has to go second. An earlier draft inserted the binding, then the receipt, then
  -- UPDATEd the binding to point at it -- an update on a row written moments earlier, purely to
  -- satisfy ordering. With both FKs deferred to COMMIT the two rows are inserted with pre-minted
  -- uuids and no update is needed at all.
  constraint fk_bar_binding foreign key (binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id)
    deferrable initially deferred
);
comment on table clara.binding_agent_receipts is
  '裁-18b PR-1: one row per Clara vendor-binding proposal act. client_id and counterparty_id are '
  'both NOT NULL -- unlike F-A7b''s plan-tied acts, every member of this family is client- AND '
  'counterparty-scoped, so a nullable here would be a wall nothing needs. binding_id is NOT NULL '
  'and there is no failing_rungs column: every wall in clara._propose_vendor_binding_agent_core '
  'RAISEs, a raise rolls the row back, so a REFUSAL RECEIPT IS NOT A REPRESENTABLE STATE HERE '
  '(gate ruling O2/B2, 2026-08-29 -- an earlier draft carried the vocabulary anyway and it was '
  'struck out: a shape no code can write is a promise, not a wall). The 19-column receipt '
  'contract''s ordinal-13 failing_rungs is satisfied by an honest empty constant in the shim. '
  'Every row that exists IS a clean proposal. '
  'THE TRIGGER PAIR IS HONEST -- trigger_id NAMES WHAT trigger_kind SAYS IT IS. ''wake_task'' '
  'carries a REAL clara.agent_tasks id (read from the credential via clara._wake_task_id()); '
  '''wake_credential'' carries the credential uuid UNDER ITS OWN NAME. Conductor ruling '
  '2026-08-29, OVERRULING this item''s design SS3.5, which had it inherit the estate''s current '
  'looseness verbatim: the three live writers (0126 x2, 0142) pass a CREDENTIAL uuid under '
  '''wake_task'', and this table does not copy that. ''chat_turn'' is deliberately NOT carried '
  'over -- this door has no turn-id-bearing carrier, and an admitted-but-never-writable value is '
  'exactly the unreachable-arm defect this item''s own survey found next door (S5). Fixing the '
  'three existing writers is a separate backlog PR. Append-only.';
create index ix_binding_agent_receipts_binding on clara.binding_agent_receipts(binding_id, firm_id)
  where binding_id is not null;
create index ix_binding_agent_receipts_open on clara.binding_agent_receipts(firm_id, created_at desc);

alter table clara.binding_agent_receipts enable row level security;
alter table clara.binding_agent_receipts force  row level security;
create policy p_binding_agent_receipts_owner on clara.binding_agent_receipts
  for all to clara_fn_owner using (true) with check (true);
create trigger t_binding_agent_receipts_append_only
  before delete or update on clara.binding_agent_receipts
  for each row execute function clara._tf_append_only();
create trigger t_binding_agent_receipts_no_truncate
  before truncate on clara.binding_agent_receipts
  for each statement execute function clara._tf_no_truncate();
-- No `revoke ... from public` (0126 SS3's measured finding: a relation carries no default PUBLIC
-- grant, so such a revoke only materializes a no-op explicit ACL the DR round-trip's aclexplode
-- diff then reads as drift). No clara_authenticated grant either -- the read is
-- clara.agent_receipts_visible and nowhere else.

-- =====================================================================================
-- SS3 -- G4: WIDEN THE RECEIPT-SURFACE REGISTRY TO A `pb_*` FAMILY, and register pb_binding.
-- Extend-only, both directions proven in the tail by REAL INSERT probes.
-- =====================================================================================
-- The pre-beta ruling queue (裁-17, 裁-18, 裁-19) has no Wave-F number to honestly claim, and a
-- register whose keys lie is a register nobody can audit (gate record G4, arm A). The f_a arm is
-- preserved BYTE-FOR-BYTE inside the alternation, so no existing row's admissibility can move.
--
-- FOLD M9 / L-14 (2026-08-30). The first cut of the pb_ arm was `pb_[a-z][a-z0-9_]*`, which is a
-- CHARACTER CLASS, not a token grammar: it ADMITS `pb_binding_` (a trailing underscore) and
-- `pb_a__b` (a doubled one), so two registry keys that read as the same member could both be
-- admitted and a reader could not tell which one the shim belongs to. The token grammar below
-- says what the estate's own keys actually are -- a lower-case word, then zero or more
-- underscore-joined words, each non-empty. Measured against the five shapes the review drove:
--   pb_          REFUSED (no first word)      pb_binding_  REFUSED (empty trailing word)
--   pb_Binding   REFUSED (upper case)         f_a7b        ADMITTED (the untouched f_a arm)
--   f_a99z       ADMITTED (ditto)
alter table clara.agent_receipt_surfaces drop constraint agent_receipt_surfaces_item_check;
alter table clara.agent_receipt_surfaces add constraint agent_receipt_surfaces_item_check
  check (item ~ '^(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9]*(_[a-z0-9]+)*)$');
alter table clara.agent_receipt_surfaces drop constraint agent_receipt_surfaces_shim_relname_check;
alter table clara.agent_receipt_surfaces add constraint agent_receipt_surfaces_shim_relname_check
  check (shim_relname ~ '^_agent_receipt_src_(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9]*(_[a-z0-9]+)*)$');

-- THE PAIRING, made structural (2026-08-29 adversarial pass, MED-9). Two independent regexes can
-- BOTH pass while the row still lies: item='pb_binding' with shim='_agent_receipt_src_f_a2' is
-- admitted by the pair above and points the register at another member's shim. The register's
-- whole job is that a receipt cannot be written where a human cannot read it, so the item and its
-- shim must be ONE fact. All eight pre-existing rows already satisfy this, so it validates clean
-- rather than needing a data pass -- measured on the rig, not assumed.
alter table clara.agent_receipt_surfaces add constraint ck_agent_receipt_surfaces_shim_matches_item
  check (shim_relname = '_agent_receipt_src_' || item);

-- ...and the row is inserted AFTER its shim exists, in SS3a below, because the conformance
-- trigger added there refuses a row whose shim is not a real, contract-shaped relation (L-14).

-- =====================================================================================
-- SS3a -- THE EVENT-TYPE REGISTRY: four new members (a FIFTH named shared surface).
-- =====================================================================================
-- clara.domain_events.event_type is FK-constrained to the APPEND-ONLY clara.event_types
-- registry and additionally gated by the _tf_validate_domain_event trigger, which raises CLR10
-- 'unknown event_type %' for anything unregistered. Both new acts therefore need a row, and both
-- are client_scoped (a binding is always a client's), matching the three kb_binding.* members
-- 0028 registered. This surface is NOT in the design's annex G-f shared-surface ledger; the PR
-- body adds it.
-- clara.event_types AND clara.trigger_taxonomy ARE A COUPLED PAIR, and registering in one alone
-- is a half-registration the estate's own coverage census refuses ("coverage stays WHOLE"). An
-- earlier draft of this file did exactly that -- four event types, no taxonomy rows -- and the
-- full @clara/db sweep caught it. So this is the 0138:2508 / 0145 §G idiom verbatim: insert the
-- types, and register each at whichever taxonomy version is CURRENTLY ACTIVE, additively, with
-- NO version flip. That makes the event-type registry the SIXTH named shared surface this file
-- touches -- annex G-f lists four, and even this file's own earlier header said five.
--
-- THE DECISIONS, each against its own precedent rather than picked:
--   kb_binding.agent_proposed -> notification. It is the SAME act as kb_binding.proposed, which
--     0028 registered as `notification`: a proposal card a human must answer. If Clara's
--     proposals were quieter than a human's, the two-party shape would be one-sided.
--   kb_binding.declined / .decline_reset -> ignore, following kb_binding.signed and
--     kb_binding.revoked. A terminal decision does not need to ping the person who just took it.
--   kb_binding.expired -> ignore. It is an automatic housekeeping transition; the operationally
--     useful signal is already the propose door's `stale_proposals_expired` audit count and
--     clara.binding_identity_review. NAMED FOR PR-4: when the CLOCKED sweep lands, revisit
--     whether a proposal ageing out UNREAD deserves a notification -- an expiry nobody sees is
--     a card nobody answered, and that is a product fact, not a database one.
with inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
    values
      ('kb_binding.agent_proposed', true, 'Clara proposed a vendor identity binding (裁-18b)'),
      ('kb_binding.declined',       true, 'A human admin declined a proposed vendor identity binding (裁-18b/G7)'),
      ('kb_binding.decline_reset',  true, 'An admin lifted a binding decline or revocation so the pair may be proposed again (裁-18b)'),
      ('kb_binding.expired',        true, 'A stale proposed vendor identity binding passed its expiry (裁-18b/B5)')
    on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, i.name,
       case when i.name = 'kb_binding.agent_proposed' then 'notification' else 'ignore' end,
       null
  from inserted_types i cross join clara.taxonomy_active a;

-- The shim -- a real projection from the start. subject_id IS the binding_id: the column is NOT
-- NULL (gate ruling O2/B2), so there is no bindingless receipt for a coalesce to rescue. (N-7:
-- this header used to describe the coalesce an earlier draft carried, contradicting both the
-- code twelve lines below and the note beside it.)
create view clara._agent_receipt_src_pb_binding as
  select
    'binding_agent'::text                             as receipt_kind,
    r.id::text                                        as receipt_id,
    r.firm_id                                         as firm_id,
    r.client_id                                       as client_id,
    -- binding_id is NOT NULL (gate O2/B2), so the coalesce an earlier draft carried here was
    -- dead code describing a receipt shape that cannot exist. The subject IS the binding.
    r.binding_id::text                                as subject_id,
    r.acting_actor                                    as acting_actor,
    r.on_behalf_of                                    as on_behalf_of,
    r.created_at                                      as occurred_at,
    r.model                                           as model,
    r.model_version                                   as model_version,
    r.rationale                                       as rationale,
    r.verdict                                         as verdict,
    -- B2 (gate ruling O2, 2026-08-29): the 19-column contract REQUIRES a failing_rungs at
    -- ordinal 13, but this door has no refusal-receipt path to fill it -- every wall RAISEs,
    -- and a raise rolls the row back (0126:158-170 says exactly this). So the column is gone
    -- from the TABLE and the contract is satisfied by an honest empty constant: every row
    -- that exists IS a clean proposal. Refusals are evidenced on the wake task/turn path,
    -- like 0126's own doors.
    '{}'::text[]                                      as failing_rungs,
    r.via_wake_kind                                   as via_wake_kind,
    r.trigger_kind                                    as trigger_kind,
    r.trigger_id                                      as trigger_id,
    r.authorization_id                                as authorization_id,
    r.adopted_verbatim                                as adopted_verbatim,
    'firm'::text                                      as scope
  from clara.binding_agent_receipts r;

-- (The explicit conformance assert used to sit HERE. It cannot: clara._assert_receipt_surface_
-- conforms refuses an UNREGISTERED shim (0103:426-429), and the registry row now lands after the
-- trigger below. Measured on the rig, not reasoned about -- the from-scratch replay refused with
-- "receipt surface _agent_receipt_src_pb_binding is not registered". It runs after the INSERT.)

-- L-14 (2026-08-30 adversarial pass): THE REGISTRY IS APPEND-ONLY, SO AN UNCONFORMING ROW IS
-- PERMANENT. clara.agent_receipt_surfaces carries _tf_append_only, so a row whose shim_relname
-- names a relation that does not exist can never be deleted or corrected -- and
-- clara.agent_receipt_source_census() then reports `shim_exists: false` for it FOREVER, with no
-- lawful way back. Two regexes and a pairing CHECK all read SPELLING; none of them can see
-- whether the relation is there. The estate already owns the right instrument --
-- clara._assert_receipt_surface_conforms reads the relation and its 19-column contract -- it was
-- simply never wired to the insert path. It is now, as a BEFORE INSERT trigger, so the append-only
-- table cannot accept a row it could never lose.
create function clara._tf_agent_receipt_surface_conforms() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  perform clara._assert_receipt_surface_conforms(new.shim_relname);
  return new;
end $fn$;
comment on function clara._tf_agent_receipt_surface_conforms() is
  '裁-18b PR-1 (L-14): refuses an agent_receipt_surfaces row whose shim_relname is not a real, '
  '19-column-contract-shaped relation. The table is APPEND-ONLY, so such a row would be permanent '
  'and the source census would report shim_exists=false for it forever. The regexes and the '
  'pairing CHECK read SPELLING; this reads the RELATION (review law 3).';
revoke all on function clara._tf_agent_receipt_surface_conforms() from public;
-- AFTER INSERT, NOT BEFORE, and the reason is measured rather than stylistic:
-- clara._assert_receipt_surface_conforms REFUSES an unregistered shim (0103:426-429), so from a
-- BEFORE trigger -- which runs before the row is visible -- it would reject every insert,
-- including this file's own. AFTER also leaves the two CHECK constraints answering first, so the
-- registry's existing regex/pairing probes keep isolating what they name.
create trigger t_agent_receipt_surfaces_conforms
  after insert on clara.agent_receipt_surfaces
  for each row execute function clara._tf_agent_receipt_surface_conforms();

-- ...and only NOW the registry row, with its shim already standing. The trigger above asserts
-- conformance as this INSERT lands.
insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source) values
  ('pb_binding','binding_agent','_agent_receipt_src_pb_binding','binding_agent_receipts');

-- The explicit call the estate's own idiom asks every member migration for (F-A7 D-6), kept as
-- BELT beside the trigger rather than replaced by it: the trigger guards every FUTURE row, this
-- line says out loud that THIS one conforms, and a reader looking for the idiom finds it.
select clara._assert_receipt_surface_conforms('_agent_receipt_src_pb_binding');

-- The NINTH union arm. clara.agent_receipts_visible is UNTOUCHED; the eight existing arms are
-- reproduced from the LIVE view definition read on the rig, never from 0142's text.
create or replace view clara._agent_receipts_all as
    select * from clara._agent_receipt_src_f_a2
    union all select * from clara._agent_receipt_src_f_a3
    union all select * from clara._agent_receipt_src_f_a4
    union all select * from clara._agent_receipt_src_f_a5
    union all select * from clara._agent_receipt_src_f_a6
    union all select * from clara._agent_receipt_src_f_a7
    union all select * from clara._agent_receipt_src_f_a7b
    union all select * from clara._agent_receipt_src_f_a8
    union all select * from clara._agent_receipt_src_pb_binding;

-- =====================================================================================
-- SS4 -- THE HONEST-LABEL COLUMNS + THE DECLINE COLUMNS ON vendor_identity_bindings
-- (design SS3.4 W10/W11/W12, plus G7's decline half). ADD COLUMN only; no body CoR.
-- =====================================================================================
alter table clara.vendor_identity_bindings add column proposed_by_agent boolean not null default false;
alter table clara.vendor_identity_bindings add column proposer_model text;
alter table clara.vendor_identity_bindings add column proposal_receipt_id uuid;
alter table clara.vendor_identity_bindings add column declined_by uuid;
alter table clara.vendor_identity_bindings add column declined_at timestamptz;
alter table clara.vendor_identity_bindings add column decline_reason text;
-- 裁-32: the DIRECTING HUMAN of an `interactive` proposal, taken from the credential's
-- on_behalf_of (0011:1143). NULL for a `filing`-kind proposal (a clocked lane has no director)
-- and for a human proposal (the human IS created_by).
alter table clara.vendor_identity_bindings add column directed_by uuid;
-- ...and the principal maker/checker actually measures against. GENERATED, so it can never
-- disagree with the two columns it is derived from and no writer can set it directly -- the
-- difference between a derived fact and a copied one (review law 2).
alter table clara.vendor_identity_bindings
  add column effective_proposer uuid generated always as (coalesce(directed_by, created_by)) stored;
-- 裁-32's SOLO arm: the sole eligible human MAY sign their own directed proposal, but only with
-- an explicit self-approval attestation, written onto the row and rendered on the card.
alter table clara.vendor_identity_bindings add column self_approved boolean not null default false;
alter table clara.vendor_identity_bindings add column self_approval_reason text;
-- H5 (2026-08-30 adversarial pass): THE COUNT THAT JUSTIFIED THE RELAXATION, AND THE ROSTER IT
-- WAS MEASURED OVER. The solo arm turns on a NUMBER read at signing time from a roster that can
-- move afterwards -- which is exactly the laundering the pass drove (remove the second admin,
-- self-sign, re-add). The durable 90-day window below makes the attack fail; these two columns
-- make the DECISION auditable without reconstructing membership history, which nothing in the
-- estate can do once a row is re-created. Written by the signer, frozen after.
alter table clara.vendor_identity_bindings add column signer_count_at_signing integer;
alter table clara.vendor_identity_bindings add column signer_roster_epoch timestamptz;

-- W10, THE HONEST LABEL -- BIDIRECTIONAL, so a human row cannot claim agency AND an agent row
-- cannot hide it. Legal because clara.agent_user_id() is `sql IMMUTABLE` and relation-free
-- (SS1(i) measured it; prediction P-2 settled admissibility on the rig).
-- RISK R1, NAMED IN CODE, NOT ONLY IN THE PR BODY: this CHECK's meaning is defined by
-- agent_user_id()'s BODY. If a later lane ever CoRs that function, the CHECK's meaning changes
-- silently and existing rows are NOT re-validated. Its prosrc is pinned in SS1(f) and re-asserted
-- in the tail; the stated alternative (a before-insert-or-update trigger reading the function at
-- write time) is deliberately NOT taken here, because a trigger is a live writer body and this
-- PR's D1 inventory is EMPTY by design.
alter table clara.vendor_identity_bindings add constraint ck_vib_proposed_by_agent_honest
  check (proposed_by_agent = (created_by = clara.agent_user_id()));
-- W11, the model/receipt honesty pair (0142's D-3 idiom): a human-proposed row may claim
-- neither a proposer model nor a proposal receipt.
alter table clara.vendor_identity_bindings add constraint ck_vib_proposer_model_honest
  check (proposer_model is null or proposed_by_agent);
alter table clara.vendor_identity_bindings add constraint ck_vib_proposal_receipt_honest
  check (proposal_receipt_id is null or proposed_by_agent);
-- W12, receipt congruence -- a STRUCTURAL composite FK, never a bare uuid: the receipt must
-- belong to the SAME firm as the binding (0142's fk_onboarding_plans_opened_from_question idiom).
-- DEFERRABLE INITIALLY DEFERRED, the twin of fk_bar_binding (M1): the two rows reference each
-- other, so with BOTH FKs checked at COMMIT the door inserts them in either order with
-- pre-minted uuids and no post-insert UPDATE. Deferring the check does not weaken it -- the
-- transaction still cannot commit with either side dangling.
alter table clara.vendor_identity_bindings add constraint fk_vib_proposal_receipt
  foreign key (proposal_receipt_id, firm_id) references clara.binding_agent_receipts(id, firm_id)
  deferrable initially deferred;
-- The decline pair, mirroring the LIVE ck_vib_revoked read byte-exact in SS1(c). Reusing
-- revoked_by/revoked_at for a decline is not merely dishonest, it is IMPOSSIBLE: ck_vib_revoked
-- says (status='revoked') = (revoked_at is not null), so a declined row stamping revoked_at
-- would violate it. Hence three columns of its own.
alter table clara.vendor_identity_bindings add constraint ck_vib_declined
  check ((status = 'declined') = (declined_at is not null));
alter table clara.vendor_identity_bindings add constraint ck_vib_decline_reason_honest
  check (decline_reason is null or declined_at is not null);
-- 裁-32 honesty: only an AGENT proposal can have had a director, and the self-approval
-- attestation is a pair that cannot half-exist and cannot precede a signature.
alter table clara.vendor_identity_bindings add constraint ck_vib_directed_by_honest
  check (directed_by is null or proposed_by_agent);
alter table clara.vendor_identity_bindings add constraint ck_vib_self_approval_pair
  check (self_approved = (self_approval_reason is not null));
alter table clara.vendor_identity_bindings add constraint ck_vib_self_approval_signed
  check (not self_approved or signed_at is not null);
-- H5's two audit columns are a PAIR that only a signature can create.
alter table clara.vendor_identity_bindings add constraint ck_vib_signer_count_pair
  check ((signer_count_at_signing is null) = (signer_roster_epoch is null));
alter table clara.vendor_identity_bindings add constraint ck_vib_signer_count_signed
  check (signer_count_at_signing is null or signed_at is not null);

-- =====================================================================================
-- SS4b -- D1 BODY 3 of 3: clara._tf_vendor_identity_binding_update, RECUT (S-1).
-- =====================================================================================
-- THE FINDING (rev-binding-pr1, catalog-measured, 2026-08-30). t_vib_frozen is the ONLY
-- non-internal update trigger on this table, and its body is a NEGATIVE list: after signing it
-- freezes exactly five fields -- the four derived content fields and expires_at. This file adds
-- ten columns and FOUR of them carry the maker/checker principal behind the signature:
-- directed_by (which the GENERATED effective_proposer follows), proposed_by_agent, self_approved
-- and self_approval_reason. Nothing else stops them moving on a SIGNED row.
--
-- WHY THE HONESTY CHECKS DO NOT COVER IT, stated because a reader would reasonably assume they
-- do: ck_vib_proposed_by_agent_honest is an EQUALITY against created_by, so moving BOTH columns
-- together satisfies it; ck_vib_self_approval_pair is satisfied by writing both halves. A CHECK
-- constrains a row's SHAPE, never its HISTORY -- only the freeze can say "not after signing".
--
-- Not attacker-reachable today (zero app-role DML on the table; 0144's barrier wall), so this is
-- depth rather than a hole -- but "the principal behind a signature is append-only" is precisely
-- the kind of thing that must be true structurally rather than by nobody having tried.
--
-- SIGNED_AT AND SIGNED_BY JOIN THE LIST TOO. Without them a signed row could be re-signed by a
-- different admin at a different time, which is the same defect one level up.
create or replace function clara._tf_vendor_identity_binding_update() returns trigger
language plpgsql security definer
set search_path to clara,pg_temp
as $$
begin
  if old.signed_at is not null
     and (new.f1_vendor_name_norm is distinct from old.f1_vendor_name_norm
       or new.f2_invoice_prefix is distinct from old.f2_invoice_prefix
       or new.registration_at_signing is distinct from old.registration_at_signing
       or new.content_hash is distinct from old.content_hash
       or new.expires_at is distinct from old.expires_at) then
    raise exception 'vendor binding content is frozen' using errcode='CLR36';
  end if;
  -- 裁-18b PR-1 (S-1): the MAKER/CHECKER PRINCIPAL is frozen by the same signature. Separate
  -- raise, separate word, so a reader of the error knows which half of the freeze answered.
  if old.signed_at is not null
     and (new.created_by is distinct from old.created_by
       or new.directed_by is distinct from old.directed_by
       or new.proposed_by_agent is distinct from old.proposed_by_agent
       or new.signed_by is distinct from old.signed_by
       or new.signed_at is distinct from old.signed_at
       or new.self_approved is distinct from old.self_approved
       or new.self_approval_reason is distinct from old.self_approval_reason
       or new.signer_count_at_signing is distinct from old.signer_count_at_signing
       or new.signer_roster_epoch is distinct from old.signer_roster_epoch) then
    raise exception 'vendor binding signature principal is frozen' using errcode='CLR36';
  end if;
  return new;
end
$$;

comment on column clara.vendor_identity_bindings.proposed_by_agent is
  '裁-18b W10: the honest label. Bidirectionally CHECKed against created_by = clara.agent_user_id() '
  '-- a human row cannot claim agency and an agent row cannot hide it. The UI renders "Proposed by '
  'Clara" FROM THIS BOOLEAN, never by comparing a uuid in TypeScript (review law 3: the client '
  'must not carry the agent sentinel as a constant).';

-- =====================================================================================
-- SS5 -- G8: ONE ACTIVE BINDING ROW PER (client, counterparty)
-- =====================================================================================
-- Closes survey S6. No body change on either path: the human
-- clara.propose_vendor_identity_binding already wraps its INSERT in `exception when
-- unique_violation then raise 'binding_conflict' using errcode='CLR36'` (0028:770-772), and the
-- new agent core does the same, so this index surfaces as the estate's EXISTING typed refusal on
-- both. Without it the agent trigger LOOPS -- she would re-propose on every subsequent invoice
-- from the same vendor.
--
-- THE PREDICATE IS `status IN ('proposed','live')`, NOT `status='proposed'` -- conductor ruling
-- 2026-08-29 (c), from the cross-model adversarial pass, and the design's own §3.4 W7 is
-- OVERRULED here. A proposed-only index LOSES THE PROPOSE-VERSUS-SIGN RACE: a second proposer
-- clears the derivation's "no live binding" rung, then BLOCKS on the existing proposed row's
-- index entry; the signer commits `proposed -> live`, which REMOVES that entry from a
-- proposed-only index; the waiting insert then succeeds, leaving a live binding AND a fresh open
-- proposal for the same pair -- exactly the state this index exists to make unrepresentable.
-- Covering both statuses means the waiting insert still conflicts with the now-live row.
-- The pre-existing uq_vib_one_live (0028) is deliberately LEFT IN PLACE and untouched: it is a
-- narrower guarantee this index subsumes, and dropping a 0028 invariant is not this PR's to do.
create unique index uq_vib_one_active_binding
  on clara.vendor_identity_bindings(client_id, counterparty_id)
  where status in ('proposed','live');

-- =====================================================================================
-- SS5b -- THE ONE LOCK, THE ONE ORDER (H6 / C-1). Every lifecycle writer, no exceptions.
-- =====================================================================================
-- THE FINDING (Codex H6 + the adversarial pass's CRITICAL C-1, 2026-08-30). The lifecycle had
-- THREE different lock protocols: both proposal doors took a pair advisory key; sign took the ROW
-- `for update` and THEN the advisory key -- the INVERTED order, driven to a real 40P01 whose
-- server report named `sign_vendor_identity_binding line 25`; decline, reset and the expiry sweep
-- took no advisory key at all. The decline gap is not merely untidy, it LAUNDERS A LIVE BINDING:
-- driven two-session, T2 declines inside an open transaction while T1's propose reads the
-- suppression as NULL and then blocks on the unique index; when T2 commits, T1's insert succeeds
-- on a pair a human just refused, and an admin signs it live while clara._binding_suppression
-- still answers 'declined'.
--
-- SO: ONE HELPER, ONE ORDER, EVERYWHERE.
--   (1) read the IMMUTABLE pair (client_id, counterparty_id) WITHOUT locking -- for the
--       row-keyed doors, which are handed a binding id rather than a pair. Those two columns
--       have no writer anywhere in the estate, so an unlocked read of them cannot go stale.
--   (2) take the pair advisory xact lock -- clara._binding_lock_pair, below.
--   (3) re-read the ROW `for update`, and judge from THAT read.
-- A door that is handed the pair directly (both proposal doors, the expiry sweep) starts at (2).
-- The tail proves the order in CODE for every writer, by prosrc POSITION, not by this comment.
create function clara._binding_lock_pair(p_client uuid, p_counterparty uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  if p_client is null or p_counterparty is null then
    raise exception 'a binding pair lock needs both its client and its counterparty'
      using errcode = 'CLR10', detail = '{"reason":"invalid_request","class":"pair_lock"}';
  end if;
  -- hashtextextended over the pair's own text gives the two-int4 key space
  -- pg_advisory_xact_lock wants. Transaction-scoped: released at COMMIT or ROLLBACK, never
  -- leaked, and reentrant within one transaction so a door may call it through a helper.
  perform pg_advisory_xact_lock(
    hashtextextended(p_client::text || ':' || p_counterparty::text, 0));
end $fn$;
comment on function clara._binding_lock_pair(uuid,uuid) is
  '裁-18b PR-1 (H6 / C-1): THE serialisation key for a (client, counterparty) binding pair. ONE '
  'definition, taken by EVERY lifecycle writer -- both proposal doors, sign, decline, '
  'reset_binding_decline and the stale-proposal sweep -- always BEFORE any row lock. Three '
  'protocols existed before this: an inverted order in sign (driven to a real 40P01) and no key '
  'at all in decline (driven to a LIVE binding on a pair a human had just declined).';
revoke all on function clara._binding_lock_pair(uuid,uuid) from public;

-- =====================================================================================
-- SS5c -- clara._binding_hard_id_norm + clara._binding_doc_fingerprint (C1 / C2)
-- =====================================================================================
-- The ALPHANUMERIC fold, matching ck_counterparties_registration_normalized EXACTLY
-- (0009:832-838). clara._binding_normalize is the wrong instrument for an identifier: it
-- PRESERVES spaces and punctuation, so a document printing "2019-AAAA-1111" would not compare
-- equal to the counterparty's own registration_normalized '2019aaaa1111' -- and W18's first cut
-- compared exactly those two, passing only because the fixture happened to print no punctuation.
create function clara._binding_hard_id_norm(p_text text) returns text
  language sql immutable as $fn$
  select nullif(lower(regexp_replace(coalesce(p_text, ''), '[^a-zA-Z0-9]', '', 'g')), '')
$fn$;
comment on function clara._binding_hard_id_norm(text) is
  '裁-18b PR-1 (C1 / N-1): the alphanumeric identifier fold, byte-identical to '
  'ck_counterparties_registration_normalized''s own expression (0009:832-838). NOT '
  'clara._binding_normalize, which preserves spaces and punctuation -- right for a NAME '
  'fingerprint, wrong for a registration number. NULL for an empty result, so a blank region '
  'can never compare equal to an identifier.';
revoke all on function clara._binding_hard_id_norm(text) from public;

-- THE DETERMINISTIC ECONOMIC FINGERPRINT (C2, the second CRITICAL of the 2026-08-29 pass).
--
-- THE ATTACK IT CLOSES: three byte-different SCANS of ONE invoice, each with a different printed
-- invoice id, booked and approved fourteen days apart. Distinct document ids, distinct sha256s,
-- distinct printed ids, a real fourteen-day approved_at span -- every conjunct W16 had, satisfied
-- by one piece of paper photographed three times. Document identity, file bytes and the printed
-- id are all things the ATTACKER CHOOSES; the invoice's ECONOMICS are not.
--
-- WHAT GOES IN, and why each: the issuer's hard identifier if the page prints one, the invoice
-- date, the currency, and every monetary component region of the document's CURRENT invoice_facts
-- generation -- text AND parsed cents. The FILE HASH and the PRINTED INVOICE ID are deliberately
-- OUT: they are exactly the two fields the attack varies.
--
-- "NORMALISED LINE ITEMS", MEASURED RATHER THAN ASSUMED: the estate's invoice_facts vocabulary
-- carries NO line-item field_path at all (0049:960-965 censused the live invoice.* set). The
-- monetary component set below IS the deterministic stand-in the vocabulary actually offers, and
-- saying so here is the honest form of the design's phrase.
--
-- COMPUTED IN SQL FROM DB-OWNED ROWS, never model-typed (PRD SS6 invariant 1). Two scans of one
-- invoice agree on every one of these values, so their fingerprints collide -- which is the
-- point. A document with no economic regions at all fingerprints its EMPTY set, so three such
-- documents collide and refuse: an unfingerprintable corpus is not three observed invoices.
create function clara._binding_doc_fingerprint(p_document uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $fn$
  with gen as (
    select x.id
      from clara.document_extractions x
     where x.document_id = p_document and x.engine_kind = 'invoice_facts' and x.status = 'done'
     order by x.version_n desc, x.id desc
     limit 1
  )
  select encode(sha256(convert_to(coalesce(
      (select string_agg(
                format('%s=%s#%s', r.field_path,
                       coalesce(clara._binding_normalize(r.text_content), ''),
                       coalesce(r.monetary_cents::text, '')),
                E'\n'
                order by r.field_path,
                         coalesce(clara._binding_normalize(r.text_content), ''),
                         coalesce(r.monetary_cents::text, ''))
         from clara.document_regions r join gen on gen.id = r.extraction_id
        where r.field_path in (
                'invoice.vendor_registration','invoice.invoice_date','invoice.currency',
                'invoice.total','invoice.total_excl_tax','invoice.tax_total',
                'invoice.amount_due','invoice.rounding','invoice.discount',
                'invoice.service_charge','invoice.delivery','invoice.deposit',
                'invoice.tax_breakdown')), ''), 'UTF8')), 'hex')
$fn$;
comment on function clara._binding_doc_fingerprint(uuid) is
  '裁-18b PR-1 (C2): a deterministic ECONOMIC fingerprint of one document, computed IN SQL from '
  'the CURRENT invoice_facts generation''s own region rows -- issuer hard identifier, invoice '
  'date, currency and every monetary component, text and parsed cents. The file sha256 and the '
  'printed invoice id are DELIBERATELY EXCLUDED: they are the two fields the three-scans-of-one-'
  'invoice attack varies. The estate''s invoice_facts vocabulary carries no line-item field_path '
  '(0049:960-965 censused it), so the monetary component set is what "normalised line items" '
  'means here. Never model-typed. Ungranted.';
revoke all on function clara._binding_doc_fingerprint(uuid) from public;

-- =====================================================================================
-- SS6 -- clara._derive_vendor_binding_basis: the NON-HASHED derived sibling (design SS3.2)
-- =====================================================================================
-- WHY A SIBLING AND NOT AN EXTENSION OF THE DERIVATION (survey S4, the load-bearing finding):
-- _derive_vendor_binding_proposal's content_hash covers its evidence ARRAY, and
-- sign_vendor_identity_binding re-derives and compares all five fields plus the stored evidence,
-- raising proposal_drifted on any difference. Adding a single key to the derivation's evidence
-- items -- a document_regions id, say -- would change content_hash for every future derivation
-- and make every already-`proposed` row UN-SIGNABLE. So everything this door shows a human but
-- does not hash lives HERE, in a separate STABLE read that touches nothing frozen.
--
-- Every value it returns is read from the SAME relations the frozen derivation reads. None of it
-- enters content_hash. None of it is supplied by the model.
create function clara._derive_vendor_binding_basis(
    p_firm uuid, p_client uuid, p_counterparty uuid)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_cp uuid; v_matched int; v_dates int; v_span int;
  v_docs uuid[]; v_f1 jsonb; v_f2 jsonb; v_regions jsonb;
begin
  -- Canonicalise through the SAME helper the derivation uses, so "this counterparty" means one
  -- thing in both places. A CLR23 (unresolvable) is caught and turned into a null, exactly as
  -- the derivation does, so this read never raises where the derivation would merely refuse.
  begin
    v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  exception when sqlstate 'CLR23' then
    v_cp := null;
  end;
  if v_cp is null then
    return jsonb_build_object('matched_approved_entries', 0, 'window_span_days', null,
      'distinct_posting_dates', 0, 'evidence_documents', '[]'::jsonb,
      'f1_evidence', '[]'::jsonb, 'f2_evidence', '[]'::jsonb, 'resolved_citations', '[]'::jsonb);
  end if;

  -- matched_approved_entries: the derivation's own window predicate WITHOUT its `limit 3`. It is
  -- a running total -- which is exactly why it is not hashed: hashing it would make every new
  -- invoice from this vendor drift an open proposal into proposal_drifted.
  select count(*)::int into v_matched
    from clara.journal_entries j
   where j.client_id = p_client
     and j.status = 'approved'
     and j.reversed_by is null
     and j.checked_via_rule_id is null
     and j.document_id is not null
     and exists (select 1 from clara.journal_lines l
                  where l.entry_id = j.id
                    and clara._canonical_counterparty(p_client, l.counterparty_id) = v_cp);

  -- The window itself -- the same three entries, selected the same way, so the two window facts
  -- the ladder gates on are read from the ladder's own window and not from a lookalike.
  with window_entries as materialized (
    select j.id, j.document_id, j.posting_date, j.approved_at
      from clara.journal_entries j
     where j.client_id = p_client
       and j.status = 'approved'
       and j.reversed_by is null
       and j.checked_via_rule_id is null
       and j.document_id is not null
       and exists (select 1 from clara.journal_lines l
                    where l.entry_id = j.id
                      and clara._canonical_counterparty(p_client, l.counterparty_id) = v_cp)
     order by j.approved_at desc, j.id desc
     limit 3
  )
  select count(distinct w.posting_date)::int,
         (max(w.posting_date) - min(w.posting_date))::int,
         coalesce(array_agg(w.document_id order by w.approved_at desc, w.id desc), '{}'::uuid[])
    into v_dates, v_span, v_docs
    from window_entries w;

  -- The per-document normalised name / invoice id the LCP was taken over, and the region rows
  -- behind them at each document's CURRENT invoice_facts generation. Presentational and derived
  -- -- region ids are generation-scoped, so hashing them would drift an open proposal on a
  -- re-extraction and un-sign a valid one (survey S4 again).
  with docs as (
    select d.document_id, d.ord from unnest(coalesce(v_docs,'{}'::uuid[])) with ordinality d(document_id, ord)
  ), fx as (
    select docs.document_id, docs.ord, x.id as extraction_id
      from docs
      left join lateral (
        select x2.id from clara.document_extractions x2
         where x2.document_id = docs.document_id and x2.engine_kind = 'invoice_facts' and x2.status = 'done'
         order by x2.version_n desc, x2.id desc limit 1) x on true
  ), reg as (
    select fx.document_id, fx.ord, fx.extraction_id, r.id as region_id, r.field_path, r.text_content
      from fx
      left join clara.document_regions r
        on r.extraction_id = fx.extraction_id
       and r.field_path in ('invoice.vendor_name','invoice.invoice_id')
  )
  select
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'document_id', reg.document_id,
      'f1_vendor_name_norm', clara._binding_normalize(reg.text_content)))
      filter (where reg.field_path = 'invoice.vendor_name'), '[]'::jsonb),
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'document_id', reg.document_id,
      'invoice_id_norm', clara._binding_normalize(reg.text_content)))
      filter (where reg.field_path = 'invoice.invoice_id'), '[]'::jsonb),
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'document_id', reg.document_id, 'extraction_id', reg.extraction_id,
      'region_id', reg.region_id, 'field_path', reg.field_path,
      'text_content', reg.text_content))
      filter (where reg.region_id is not null), '[]'::jsonb)
    into v_f1, v_f2, v_regions
    from reg;

  return jsonb_build_object(
    'matched_approved_entries', v_matched,
    'window_span_days', v_span,
    'distinct_posting_dates', coalesce(v_dates, 0),
    'evidence_documents', to_jsonb(coalesce(v_docs, '{}'::uuid[])),
    'f1_evidence', v_f1,
    'f2_evidence', v_f2,
    'resolved_citations', v_regions);
end $fn$;
comment on function clara._derive_vendor_binding_basis(uuid,uuid,uuid) is
  '裁-18b SS3.2: the NON-HASHED derived basis. Everything the sign dialog shows a human beyond the '
  'five frozen content fields -- the running matched-entry COUNT, the two window facts, the '
  'per-document f1/f2 evidence, and the document_regions rows the fingerprint was taken from at '
  'each evidence document''s CURRENT invoice_facts generation. NONE of it enters content_hash: '
  'a count is a running total and region ids are generation-scoped, so hashing either would drift '
  'an open proposal into proposal_drifted on the next invoice or the next re-extraction (survey '
  'S4). clara._derive_vendor_binding_proposal is byte-untouched by this file. Ungranted: '
  'reachable only from inside a SECURITY DEFINER door.';
revoke all on function clara._derive_vendor_binding_basis(uuid,uuid,uuid) from public;

-- =====================================================================================
-- SS6a -- clara._binding_suppression: THE HUMAN "NO", ONCE (gate B4, ruling (b))
-- =====================================================================================
-- Two terminal human decisions suppress a pair, and BOTH proposal writers plus the read verb
-- consult this one body:
--   'declined'  -- a human refused the proposal card.
--   'revoked'   -- a human ended a binding that had been LIVE (0028:936-939). The gate found
--                  this one: the frozen derivation only refuses on a LIVE binding, and no index
--                  covers a revoked row, so a vendor a human deliberately un-bound would be
--                  re-proposed on the very next filing turn. Revoking is a stronger statement
--                  than declining -- somebody trusted this binding, watched it work, and took it
--                  away again -- so it would be perverse for it to suppress less.
-- Both are lifted only by the named human door, clara.reset_binding_decline.
create function clara._binding_suppression(p_firm uuid, p_client uuid, p_counterparty uuid)
  returns text language sql stable security definer set search_path = clara, pg_temp as $fn$
  select b.status from clara.vendor_identity_bindings b
   where b.firm_id = p_firm and b.client_id = p_client and b.counterparty_id = p_counterparty
     and b.status in ('declined','revoked')
   order by case b.status when 'revoked' then 0 else 1 end, b.created_at desc
   limit 1;
$fn$;
comment on function clara._binding_suppression(uuid,uuid,uuid) is
  '裁-18b PR-1 (gate B4): returns ''declined'' or ''revoked'' when a human has terminally said no '
  'to this (client, counterparty), else NULL. ONE definition, consulted by both proposal writers '
  'and by clara.wake_list_binding_candidates AND by the signer (C-1(b): a binding must never go '
  'live on a pair this answers for, whatever produced the proposal). Revoked suppresses because '
  'the frozen derivation only refuses on a LIVE binding and no index covers a revoked row -- '
  'without this, a vendor a human deliberately un-bound is re-proposed on the next filing turn. '
  'A DECLINE is lifted by clara.reset_binding_decline; a REVOCATION is NOT (M-11, 2026-08-30) -- '
  'that door refuses on a revoked row until the owner rules what ceremony should lift one.';
revoke all on function clara._binding_suppression(uuid,uuid,uuid) from public;

-- =====================================================================================
-- SS6a2 -- clara._expire_stale_proposals: the in-door stale-`proposed` sweep (gate B5)
-- =====================================================================================
-- THE TRAP THE GATE FOUND: nothing in the estate has ever expired a `proposed` row. Every
-- `status='expired'` write in 0028 filters `status='live'`. That was harmless while a stale
-- proposal merely sat there -- but with uq_vib_one_active_binding covering ('proposed','live'),
-- a twelve-month-old proposal becomes BOTH unsignable (sign refuses binding_expired) AND
-- un-re-proposable (the index refuses the new row). The pair would be permanently stuck, and the
-- only visible symptom would be a `binding_conflict` nobody could act on.
-- So both proposal writers and the read verb call this FIRST: expire past-expiry `proposed` rows
-- for the pair, audited and evented per act. A clocked sweep over the whole estate is PR-4's
-- (law 80's receipt obligation bites there, where the act is unattended); this is the in-door
-- half that keeps the door itself from deadlocking on its own index.
create function clara._expire_stale_proposals(p_firm uuid, p_client uuid, p_counterparty uuid)
  returns integer language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare r record; v_n int := 0;
begin
  -- H6: the ONE order. This writer is handed the pair directly, so it starts at step (2) --
  -- the pair advisory key BEFORE the UPDATE takes its row locks. Reentrant, so the proposal
  -- doors that already hold the key call straight through.
  perform clara._binding_lock_pair(p_client, p_counterparty);
  for r in
    update clara.vendor_identity_bindings
       set status = 'expired'
     where firm_id = p_firm and client_id = p_client and counterparty_id = p_counterparty
       and status = 'proposed' and expires_at <= now()
    returning id, client_id, counterparty_id, created_by
  loop
    v_n := v_n + 1;
    perform clara._audit(p_firm, clara.agent_user_id(), null, null,
      'expire_stale_binding_proposal', null,
      jsonb_build_object('binding_id', r.id, 'client_id', r.client_id,
        'counterparty_id', r.counterparty_id, 'proposed_by', r.created_by));
    perform clara._append_event(p_firm, 'kb_binding.expired', r.client_id,
      clara.agent_user_id(), null, null, null, null, null,
      jsonb_build_object('binding_id', r.id, 'counterparty_id', r.counterparty_id));
  end loop;
  return v_n;
end $fn$;
comment on function clara._expire_stale_proposals(uuid,uuid,uuid) is
  '裁-18b PR-1 (gate B5): expires past-expiry `proposed` rows for one (client, counterparty), '
  'audited and evented per row. Nothing in the estate had ever expired a proposed row -- every '
  'status=''expired'' write in 0028 filters status=''live'' -- which, once '
  'uq_vib_one_active_binding covers (''proposed'',''live''), would leave a stale proposal both '
  'unsignable and un-re-proposable, stuck forever behind a binding_conflict nobody could act on. '
  'Called FIRST by both proposal writers and by the eligibility read. The CLOCKED estate-wide '
  'sweep is PR-4''s, where law 80''s receipt obligation applies to an unattended act.';
revoke all on function clara._expire_stale_proposals(uuid,uuid,uuid) from public;

-- =====================================================================================
-- SS6b -- clara._binding_extra_blocker: THE POST-DERIVATION IDENTITY WALLS, ONCE.
-- =====================================================================================
-- Every wall the 2026-08-29 cross-model adversarial pass added sits HERE, in one body that the
-- proposal writer and the eligibility read BOTH call. Returns the first blocking reason token,
-- or NULL when the pair is clean. It RAISES nothing: the writer turns a token into its typed
-- CLR36 refusal, the read verb reports it as `reason`, and the two can therefore never disagree
-- (G3 -- one fact, one definition).
--
-- WHY THESE WALLS ARE HERE AND NOT IN THE WINDOW. Every one of them belongs, logically, inside
-- clara._derive_vendor_binding_proposal. It cannot go there: its content_hash covers the
-- evidence array, so recutting it makes every already-`proposed` row un-signable (survey S4),
-- and G3 rules it untouched. So they are enforced ABOVE it, on the evidence it returns. The
-- consequence is stated rather than hidden: these walls protect NEW proposals only and do NOT
-- retro-check rows already sitting at status='proposed' (conductor ruling, 2026-08-29).
create function clara._binding_extra_blocker(
    p_firm uuid, p_client uuid, p_counterparty uuid, p_derived jsonb, p_basis jsonb)
  returns text language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  v_cp_name text; v_registration text; v_tin text; v_bad_doc text;
  v_n_docs int; v_n_shas int; v_n_invoices int; v_span_days int;
  v_n_prints int; v_overrides int; v_hard_ids text[];
begin
  select c.name, c.registration_normalized, c.tin into v_cp_name, v_registration, v_tin
    from clara.counterparties c where c.id = p_counterparty;
  -- N-1 (2026-08-30): the target's HARD IDENTIFIERS, kind-aware. `invoice.vendor_registration`
  -- carries EITHER an SSM number or a TIN and never says which (0049:955-965 measured the whole
  -- live invoice.* vocabulary and found no vendor-taxid path), so a document printing the
  -- vendor's TIN is printing a TRUE identifier and a wall that only knew the SSM number would
  -- refuse an honest corpus. Both are folded the same alphanumeric way the column itself is.
  -- Built by unnest+filter rather than array_remove(..., null): removing NULLs with a value
  -- comparison is exactly the kind of thing that reads as obviously-correct and is worth not
  -- depending on. This form says what it means.
  select coalesce(array_agg(x), '{}'::text[]) into v_hard_ids
    from unnest(array[clara._binding_hard_id_norm(v_registration),
                      clara._binding_hard_id_norm(v_tin)]) x
   where x is not null;

  -- W15 -- LAW 79'S FAMILY-COLLISION PREDICATE (conductor ruling (e); the CRITICAL finding of
  -- the 2026-08-29 pass). The predicate has existed since 0103:781 and no binding path has ever
  -- called it.
  -- THE ATTACK IT CLOSES: misattribute and approve three crafted `ROME...`-family invoices
  -- against vendor A. The derivation then stores vendor B's stable LCP beside vendor A's
  -- registration -- because F1 is a STABILITY feature matched by PREFIX (0030:29) and F3 accepts
  -- a NAME SUBSTRING (0028:311). A human signs a card that looks entirely right, and later
  -- name-only B invoices auto-post to A. In an ambiguous family a name can never authorize
  -- identity, so the proposal never reaches a card.
  if clara.name_family_is_ambiguous(p_firm, v_cp_name) then
    return 'binding_name_family_ambiguous';
  end if;

  -- W16 -- THE CORPUS IS THREE REAL, DISTINCT, INDEPENDENTLY-OBSERVED INVOICES (ruling (a)).
  -- The frozen window counts JOURNAL ENTRIES over caller-set POSTING DATES, with no distinct-
  -- document, hash or invoice-id requirement (0030:129, :181, :201) -- so ONE document booked
  -- three times with backdated posting dates, or three byte-different uploads of one invoice,
  -- passes it outright.
  select count(distinct e.doc), count(distinct d.sha256),
         (max(j.approved_at)::date - min(j.approved_at)::date),
         -- M-12 / S-2 (gate SS8 items 6/7 rule "duplicate-overrides excluded"): an entry a human
         -- waved past the duplicate guard is EXACTLY the shape "three real invoices" is meant to
         -- exclude, and neither the frozen window (0030) nor this body filtered it.
         count(*) filter (where j.flags ? 'duplicate_override')
    into v_n_docs, v_n_shas, v_span_days, v_overrides
    from (select (x->>'document_id')::uuid doc, (x->>'entry_id')::uuid ent
            from jsonb_array_elements(p_derived->'evidence') x) e
    join clara.documents d on d.id = e.doc
    join clara.journal_entries j on j.id = e.ent;
  if coalesce(v_n_docs,0) <> 3 or coalesce(v_n_shas,0) <> 3 then
    return 'binding_corpus_not_distinct';
  end if;
  -- M-12. REFUSES rather than "excludes": the corpus arrives from the byte-frozen derivation and
  -- this body cannot re-select it, so dropping a member would leave two and refuse anyway. The
  -- word is its own so the read verb can say WHICH thing is wrong. THE DERIVATION-SIDE GAP IS
  -- NAMED FOR PR-3: clara._derive_vendor_binding_proposal's own window filters reversed_by and
  -- checked_via_rule_id but NOT flags -- so a fourth, override-free invoice does not displace an
  -- override one in the window. Recutting that body un-signs every open proposal (survey S4), so
  -- it is PR-3's when the window is next opened.
  if coalesce(v_overrides,0) > 0 then
    return 'binding_corpus_duplicate_override';
  end if;
  -- Distinct PRINTED invoice identities, read from the same regions the LCP was taken over.
  -- N-8: a corpus whose documents carry MORE than one printed id each lands here too, and it is
  -- a different fact from "three scans of one invoice" -- so it gets its own word rather than
  -- being reported as non-distinct. Both refuse; only one of them is the poisoning signature.
  select count(distinct nullif(btrim(f->>'invoice_id_norm'), '')),
         count(*) filter (where nullif(btrim(f->>'invoice_id_norm'), '') is not null)
    into v_n_invoices, v_n_prints from jsonb_array_elements(p_basis->'f2_evidence') f;
  if coalesce(v_n_prints,0) > 3 then
    return 'corpus_invoice_id_ambiguous';
  end if;
  if coalesce(v_n_invoices,0) <> 3 then
    return 'binding_corpus_not_distinct';
  end if;
  -- C2 -- THE DETERMINISTIC ECONOMIC FINGERPRINT. Three distinct documents with three distinct
  -- shas and three distinct printed ids can still be ONE INVOICE photographed three times: every
  -- conjunct above is over a field the attacker chooses. The fingerprint is over the ones they do
  -- not -- the issuer's hard identifier, the invoice date, the currency and every monetary
  -- component region, computed in SQL from the DB's own extraction rows (PRD SS6 invariant 1).
  if (select count(distinct clara._binding_doc_fingerprint(e.doc))
        from (select distinct (x->>'document_id')::uuid doc
                from jsonb_array_elements(p_derived->'evidence') x) e) <> 3 then
    return 'binding_corpus_same_invoice';
  end if;
  -- THE TRUSTED CLOCK. posting_date is caller-controlled; approved_at is stamped by the approve
  -- door and is the only elapsed-OBSERVATION evidence on the row. The frozen window's own
  -- >=14-day span rides on posting_date alone; this requires the same span over approved_at, so
  -- "fourteen days apart" means fourteen days of having actually seen the vendor.
  if coalesce(v_span_days, -1) < 14 then
    return 'window_too_recent_unobserved';
  end if;

  -- W18 -- EVERY CORPUS MEMBER PRINTS A HARD IDENTIFIER, AND EVERY IDENTIFIER IT PRINTS IS THE
  -- TARGET'S (ruling (e) second half, RECUT 2026-08-30 by C1 / N-1 / H-4).
  --
  -- THE ARM THAT WAS STRUCK, and why it had to go. The first cut admitted a document printing NO
  -- registration whenever clara.client_resolutions carried a `method='human'` row for it. That
  -- table has NO COUNTERPARTY KEY AT ALL (0003:83-95; measured again in this file's own prestate
  -- (l1)) -- it records which CLIENT a document belongs to, which is a different question from
  -- who ISSUED it. Worse, the row is minted AUTOMATICALLY: clara.file_document writes exactly
  -- that shape for every document it files (0007:1405-1409), so the arm was true by construction
  -- for the entire product path. Driven end to end by the independent reviewer: three invoices
  -- printing a NON-PARTY vendor's name and no registration, coded to an existing counterparty A,
  -- passed W15 (clara.name_family_candidates draws only from the firm's OWN clients and
  -- counterparties, 0103:738-745, so a vendor who is not yet a party makes no family), passed
  -- this arm on those automatic rows, and stood up an identity authority that would auto-post
  -- every future invoice of the OTHER vendor onto A. A human resolution keyed to
  -- (firm, client, document, COUNTERPARTY) would be a real answer; the estate does not have one
  -- today, so the arm is REMOVED rather than approximated. IT IS RECORDED AS A LATER DOOR in
  -- this file's header: when a counterparty-keyed vendor resolution exists, this rung gains a
  -- second arm deliberately.
  --
  -- AND THE COMPARISON IS OVER **EVERY** CURRENT REGION, NOT min(). The first cut read
  -- `min(text_content)` per document, which is a COLLATION accident wearing the clothes of a
  -- rule: a page printing the true registration AND `zzz999999999` was ACCEPTED because the
  -- digit-leading value sorted first. Driven, both ways round. A document is clean only if EVERY
  -- registration region of its current generation names the target.
  --
  -- KIND-AWARE (N-1's caution). `invoice.vendor_registration` carries EITHER an SSM number or a
  -- TIN and never says which, so a region is clean when it matches ANY hard identifier the target
  -- row carries. A counterparty with NO hard identifier at all cannot prove anything and refuses
  -- fail-closed -- it also cannot have reached here, since the frozen derivation's own
  -- `binding_unattributable` rung refuses first; the branch is the floor under that, not a
  -- second implementation of it.
  if v_hard_ids is null or array_length(v_hard_ids, 1) is null then
    return 'binding_identifier_unproven';
  end if;
  select string_agg(distinct q.doc::text, ', ') into v_bad_doc
    from (
      select e.doc,
             (select count(*) from clara.document_regions r
                join clara.document_extractions x on x.id = r.extraction_id
               where x.document_id = e.doc and x.engine_kind = 'invoice_facts' and x.status = 'done'
                 and x.version_n = (select max(x2.version_n) from clara.document_extractions x2
                                     where x2.document_id = e.doc and x2.engine_kind = 'invoice_facts'
                                       and x2.status = 'done')
                 and r.field_path = 'invoice.vendor_registration'
                 and clara._binding_hard_id_norm(r.text_content) is not null) as printed_n,
             (select count(*) from clara.document_regions r
                join clara.document_extractions x on x.id = r.extraction_id
               where x.document_id = e.doc and x.engine_kind = 'invoice_facts' and x.status = 'done'
                 and x.version_n = (select max(x2.version_n) from clara.document_extractions x2
                                     where x2.document_id = e.doc and x2.engine_kind = 'invoice_facts'
                                       and x2.status = 'done')
                 and r.field_path = 'invoice.vendor_registration'
                 and clara._binding_hard_id_norm(r.text_content) is not null
                 and not (clara._binding_hard_id_norm(r.text_content) = any (v_hard_ids))) as foreign_n
        from (select distinct (x->>'document_id')::uuid doc
                from jsonb_array_elements(p_derived->'evidence') x) e
    ) q
   where q.printed_n = 0 or q.foreign_n > 0;
  if v_bad_doc is not null then
    return 'binding_identifier_unproven';
  end if;

  return null;
end $fn$;
comment on function clara._binding_extra_blocker(uuid,uuid,uuid,jsonb,jsonb) is
  '裁-18b PR-1, from the 2026-08-29 cross-model adversarial pass: the identity walls that belong '
  'inside clara._derive_vendor_binding_proposal''s window but cannot go there (its content_hash '
  'covers the evidence array, so recutting it un-signs every open proposal -- survey S4; G3 rules '
  'it untouched). Law 79''s family-collision predicate; corpus distinctness over document, '
  'sha256, printed invoice id AND a deterministic ECONOMIC fingerprint (C2 -- three scans of one '
  'invoice clear every other conjunct); no duplicate-override entry in the corpus (M-12); a '
  '>=14-day span over the TRUSTED approved_at clock rather than the caller-set posting_date; and '
  'a printed hard identifier per corpus member, kind-aware over the target''s registration AND '
  'tin, with EVERY current region judged rather than min() (C1/N-1/H-4 -- the human-resolution '
  'arm was STRUCK because clara.client_resolutions proves CLIENT attribution and is minted '
  'automatically by file_document). Returns the first blocking reason token or NULL; raises nothing, so the '
  'proposal writer and clara.wake_list_binding_candidates share ONE definition and can never '
  'disagree. Protects NEW proposals only -- rows already at status=''proposed'' are not '
  're-checked. Ungranted.';
revoke all on function clara._binding_extra_blocker(uuid,uuid,uuid,jsonb,jsonb) from public;

-- =====================================================================================
-- SS7 -- clara._propose_vendor_binding_agent_core: the UNGRANTED core -- the walls, the
-- receipt, the insert. SS3.4 IN FULL IS JUDGEMENT LOGIC (review law 1).
-- =====================================================================================
-- ORDERING LAW, and every rung's reason for sitting where it does:
--   1-2  credential + per-kind allowlist  -- the wrapper's, above this core.
--   3-7  SHAPE walls (op_key, ids, rationale, model, basis) -- BEFORE _reserve_op, so a blank
--        rationale or a model missing `version` refuses TYPED (CLR10) rather than as an untyped
--        23514 AFTER a reservation was burned (the wake_propose_identifier_promotion N-1 fix).
--   8    firm congruence on the client -- an IMMUTABLE fact about the client, so it is safe and
--        cheap before the reservation; `filing`/`interactive` credentials carry client_id IS NULL
--        (survey S2), which is exactly why the client arrives as an ARGUMENT and is walled here
--        explicitly rather than trusted from a credential the caller chose.
--   9    _reserve_op -- RESERVE-FIRST, deliberately BEFORE every state-dependent rung below.
--        Each of those either RAISEs (rolling the reservation back with everything else, so a
--        retry after a genuine refusal starts fresh) or reads state THIS verb's own prior call
--        changed -- the declined wall, the derivation's binding_conflict rung, and the
--        uq_vib_one_active_binding index all do. Reserving first means a genuine replay
--        short-circuits HERE, before it can re-read its own side effects and refuse ITSELF
--        (0142's own rig lesson, :415-432, restated because it applies again). The dedupe hash
--        covers (client, counterparty, basis) -- the three fields that IDENTIFY the proposal.
--        p_rationale and p_model are deliberately OUTSIDE it: a genuine retry after a dropped
--        connection may re-word its own prose or bump its model_version for the identical
--        proposal, and none of that should turn a lawful replay into 'op_key reused with
--        different args'.
--   10   W14, the DECLINED loop brake -- a human said no; Clara does not ask again.
--   11   the frozen derivation -- W4 (counterparty liveness/attributability) and W8 (a live
--        binding already exists) are DELEGATED to it, unchanged, so there is exactly one
--        definition of "ready to bind" in the estate (G3).
--   12-13 the 裁-22 basis, resolved AFTER the reservation (0143's own ordering law) against the
--        THREE evidence documents THE DERIVATION ITSELF SELECTED -- never a document set the
--        model chose.
--   14-17 the writes.

create function clara._propose_vendor_binding_agent_core(
    p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text, p_credential uuid, p_task uuid,
    p_client uuid, p_counterparty uuid, p_basis jsonb,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  v_dedupe jsonb; v_derived jsonb; v_basis jsonb; v_resolved jsonb;
  v_docs uuid[]; v_binding uuid; v_receipt uuid := gen_random_uuid(); v_cp uuid;
  v_rationale text; v_trigger_kind text; v_trigger_id text;
  v_blocker text; v_bad_field int; v_bad_f1 int; v_bad_f2 int; v_covered int;
  v_expired int; v_suppressed text;
begin
  -- (3) op_key.
  if nullif(btrim(coalesce(p_op_key, '')), '') is null then
    raise exception 'op_key is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}';
  end if;
  -- (4) the two identifiers.
  if p_client is null or p_counterparty is null then
    raise exception 'a binding proposal needs both its client and its counterparty' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"identifiers","constraint":"client+counterparty"}';
  end if;
  -- (5) rationale -- prose, receipt-only, NEVER a fact.
  v_rationale := nullif(btrim(coalesce(p_rationale, '')), '');
  if v_rationale is null then
    raise exception 'a binding proposal must state its rationale' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"rationale","constraint":"nonempty"}';
  end if;
  -- (6) the model snapshot, all three parts non-blank.
  if p_model is null or jsonb_typeof(p_model) <> 'object'
     or nullif(btrim(coalesce(p_model->>'provider', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'model', '')), '') is null
     or nullif(btrim(coalesce(p_model->>'version', '')), '') is null then
    raise exception 'a binding proposal must name its model (provider, model, version)' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"model_snapshot","constraint":"provider+model+version"}';
  end if;
  -- (7) THE 裁-22 BASIS SHAPE, and the one thing this door refuses that no other door does.
  --     `sightings` is a FORBIDDEN KEY: the count of matching approved invoices is an
  --     AUTHORITATIVE NUMBER (PRD SS6 invariant 1) that the DB derives in
  --     _derive_vendor_binding_basis. A model that supplies one is not merely ignored, it is
  --     REFUSED -- the strictly stronger 裁-22 posture design SS3.2 argued for, because a
  --     silently-ignored claim is a claim a later reader may mistake for a checked fact.
  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then
    raise exception 'a binding proposal needs a well-formed basis' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"object"}';
  end if;
  if p_basis ? 'sightings' then
    raise exception 'a binding proposal may not assert its own sighting count; the database derives it'
      using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"no_model_sightings"}';
  end if;
  if jsonb_typeof(p_basis->'citations') is distinct from 'array'
     or jsonb_array_length(p_basis->'citations') < 1 then
    raise exception 'a binding proposal needs at least one citation in its basis' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"basis","constraint":"nonempty_citations"}';
  end if;

  -- (8) W3, firm congruence on the client.
  if not exists (select 1 from clara.clients where id = p_client and firm_id = p_firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"client"}';
  end if;

  -- (8b) H4 / H-6 -- AN `interactive` PROPOSAL MUST HAVE A REAL, STANDING DIRECTOR.
  --      THE ATTACK: `interactive` IS the human ask, and 裁-32 measures maker/checker against the
  --      person who made it -- but clara.mint_wake_credential PERMITS a null on_behalf_of for
  --      this kind (0133:713). A null director gives a null directed_by, so the GENERATED
  --      effective_proposer falls back to Clara's own uuid and EVERY admin, including the one who
  --      clicked "ask Clara", clears 裁-18a by construction. A FOREIGN non-null principal was
  --      already checked at signing; NULL was the way past it, because a bare comparison against
  --      an unknown principal can never refuse.
  --      SO THE DOOR REFUSES, not the minter. clara.mint_wake_credential is 0133's live body and
  --      widening its CHECK is a G1-lane change with its own blast radius (every wake kind, every
  --      lane); RECORDED HERE AS A LATER ITEM rather than smuggled into this PR. This door knows
  --      what an interactive binding proposal needs and refuses without it -- which is the wall
  --      that actually matters, since no other caller reads on_behalf_of the way 裁-32 does.
  --      `filing` is untouched: an unattended lane HAS no director by design (measured on the rig
  --      -- treating a filing credential's on_behalf_of as a director made the whole normal flow
  --      fall into the solo-attestation arm).
  --      ONE ARM, NOT TWO -- AND THE SECOND WAS DELETED BECAUSE IT COULD NOT BE REACHED.
  --      An earlier cut of this wall also refused a director who was not a standing bookkeeper+.
  --      Driven on the rig, that branch never fires: clara.wake_context() ITSELF filters the
  --      credential on `c.on_behalf_of is null OR the principal is an active bookkeeper+ of the
  --      firm` (0011:1146-1151), so a director who loses standing makes the whole credential
  --      stop resolving and the wrapper raises CLR03 'no valid wake credential' one level above
  --      this body -- and clara.mint_wake_credential refuses a non-standing principal at MINT
  --      time as well. NULL is the ONLY case that reaches here, because it is the one
  --      wake_context explicitly admits. A branch no path can enter is the unreachable-arm defect
  --      this same PR deleted `failing_rungs` for; keeping it "as depth" would be keeping a
  --      promise, not a wall. The battery drives all three walls and names which is which.
  if p_wake_kind = 'interactive' and p_obo is null then
    raise exception 'an interactive binding proposal must name the human who directed it'
      using errcode = 'CLR10',
      detail = '{"reason":"interactive_director_required","class":"director","constraint":"nonnull"}';
  end if;

  -- (9) W13, reserve-first (see the ordering law above).
  v_dedupe := clara._reserve_op(p_firm, 'wake_propose_vendor_identity_binding', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'counterparty', p_counterparty, 'basis', p_basis)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- (9b) THE SHARED SERIALISATION KEY (conductor ruling (c)). Transaction-scoped, taken on
  --      (client, counterparty) by EVERY writer that moves a binding through its lifecycle --
  --      propose (both doors), sign, decline, reset. The unique index alone makes the bad END
  --      STATE unrepresentable; this makes the concurrent attempt WAIT rather than race to a
  --      typed refusal, so a lawful second actor is serialised instead of being told "conflict"
  --      for a row that was mid-flight. ONE helper, ONE order (SS5b): this door holds the pair
  --      already, so it starts at step (2) and every state-dependent rung below runs under the key.
  perform clara._binding_lock_pair(p_client, p_counterparty);

  -- (10) W14, THE DECLINED LOOP BRAKE (G7). A human already said no to this exact pair; Clara
  --      does not ask again. This is a wall in the DOOR, not merely a hint in the read verb --
  --      a read verb Clara may choose not to call is not a brake. The HUMAN door is untouched:
  --      a person may always propose again, which is why this rung lives here and not in
  --      _derive_vendor_binding_proposal.
  -- (10a) THE STALE-PROPOSED SWEEP, FIRST (gate B5). With uq_vib_one_active_binding covering
  --       ('proposed','live'), a past-expiry proposal would otherwise make the pair permanently
  --       stuck -- unsignable AND un-re-proposable.
  v_expired := clara._expire_stale_proposals(p_firm, p_client, p_counterparty);

  -- (10) W14, THE SUPPRESSION WALL (gate B4, ruling (b)). A human's terminal "no" -- DECLINED or
  --      REVOKED -- and Clara does not ask again. Revoked is the one the gate found: the frozen
  --      derivation refuses only on a LIVE binding and no index covers a revoked row, so a
  --      vendor a human deliberately un-bound was re-proposed on the next filing turn.
  v_suppressed := clara._binding_suppression(p_firm, p_client, p_counterparty);
  if v_suppressed is not null then
    raise exception 'binding_%', v_suppressed using errcode = 'CLR36',
      detail = jsonb_build_object('reason', 'binding_' || v_suppressed, 'class', 'loop_brake')::text;
  end if;

  -- (10b) THE OPPORTUNISTIC EXPIRY FLIP, mirroring the human door verbatim (0028:750-754). With
  --       the widened uq_vib_one_active_binding a LIVE row past its expiry would otherwise block
  --       Clara's door forever, while the human door -- which does this flip -- sails past. The
  --       asymmetry is the defect; this removes it.
  update clara.vendor_identity_bindings
     set status = 'expired'
   where firm_id = p_firm and client_id = p_client and counterparty_id = p_counterparty
     and status = 'live' and expires_at <= now();

  -- (11) The frozen derivation. W4 and W8 are ITS rungs, delegated unchanged -- this door
  --      re-implements not one line of the eleven-rung ladder (G3). (N-7: this label used to sit
  --      ABOVE (10b), which read as if the derivation ran before the expiry flip. It does not.)
  v_derived := clara._derive_vendor_binding_proposal(p_firm, p_client, p_counterparty);
  v_cp := (v_derived->>'counterparty_id')::uuid;

  -- (12) The DB's own non-hashed derived block.
  v_basis := clara._derive_vendor_binding_basis(p_firm, p_client, v_cp);

  -- (12b) THE POST-DERIVATION IDENTITY WALLS -- W15 (law 79 family collision), W16 (corpus
  --       distinctness + the trusted approved_at span) and W18 (the printed hard identifier).
  --       They live in clara._binding_extra_blocker, ONE definition that BOTH this writer and
  --       clara.wake_list_binding_candidates call. That is not tidiness: G3 rules that one fact
  --       gets one definition, and a read verb that called a vendor ELIGIBLE that this door will
  --       refuse would be worse than no read verb at all -- it would send Clara to probe the
  --       door by refusal, the exact pattern the read verb exists to prevent.
  v_blocker := clara._binding_extra_blocker(p_firm, p_client, v_cp, v_derived, v_basis);
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode = 'CLR36',
      detail = jsonb_build_object('reason', v_blocker, 'class', 'identity')::text;
  end if;

  -- (13) W6, 裁-22: every citation the MODEL supplied is resolved by the SHARED resolver against
  --      the THREE evidence documents the DERIVATION selected -- firm-congruent, current
  --      extraction generation, a real document_regions row. An unresolvable, cross-firm,
  --      stale-generation or foreign-document citation REFUSES the proposal: nothing is written,
  --      no receipt, no card. The document set comes from v_derived's own evidence array, so the
  --      model cannot widen the set it is allowed to cite from.
  select coalesce(array_agg(distinct (x->>'document_id')::uuid), '{}'::uuid[]) into v_docs
    from jsonb_array_elements(v_derived->'evidence') x;
  -- NOT REACHABLE TODAY, and said so rather than left to look like a live rung: the derivation
  -- refuses `insufficient_evidence` below three entries and its own window requires
  -- `document_id is not null`, so v_docs always holds three. It is a fail-closed tripwire for a
  -- future change to the derivation's window, and the resolver would refuse an empty set on the
  -- next line anyway -- this only makes the refusal name the derivation rather than the basis.
  if coalesce(array_length(v_docs,1),0) = 0 then
    raise exception 'binding_unattributable' using errcode = 'CLR36',
      detail = '{"reason":"no_evidence_documents","class":"basis"}';
  end if;
  v_resolved := clara._resolve_proposal_basis(v_docs, p_firm, p_basis);

  -- (13b) W17 -- THE SHARED RESOLVER IS A FLOOR, NOT THE WHOLE WALL (conductor ruling (d)).
  --       0143 proves each cited region is real, firm-congruent, current-generation and belongs
  --       to SOME document of the set (0143:320, :343) -- it never checks WHICH field the region
  --       is, WHAT it says, or whether the set is COVERED. So one current footer or total region
  --       from one of the three documents satisfies it, and the card then shows that as "the
  --       regions the fingerprint came from". It is not.
  --       This door therefore requires, of the RESOLVED set: every region is an
  --       invoice.vendor_name or invoice.invoice_id region; every vendor_name region normalises
  --       to the derivation's own F1; every invoice_id region normalises to one of the three the
  --       LCP was taken over; and the set COVERS ALL THREE evidence documents.
  select count(*) filter (where c.field_path not in ('invoice.vendor_name','invoice.invoice_id')),
         count(*) filter (where c.field_path = 'invoice.vendor_name'
                            and clara._binding_normalize(c.text_content)
                                is distinct from (v_derived->>'f1_vendor_name_norm')),
         count(*) filter (where c.field_path = 'invoice.invoice_id'
                            and not exists (select 1 from jsonb_array_elements(v_basis->'f2_evidence') f
                                             where nullif(btrim(f->>'invoice_id_norm'),'')
                                                   = clara._binding_normalize(c.text_content))),
         count(distinct z.document_id)
    into v_bad_field, v_bad_f1, v_bad_f2, v_covered
    from (select (e->>'region_id')::uuid rid, (e->>'document_id')::uuid document_id
            from jsonb_array_elements(v_resolved->'citations') e) z
    join clara.document_regions c on c.id = z.rid;
  if coalesce(v_bad_field,0) > 0 then
    raise exception 'basis_citation_irrelevant' using errcode = 'CLR10',
      detail = '{"reason":"basis_citation_irrelevant","class":"field_path"}';
  end if;
  if coalesce(v_bad_f1,0) > 0 or coalesce(v_bad_f2,0) > 0 then
    raise exception 'basis_citation_contradicts_derivation' using errcode = 'CLR10',
      detail = '{"reason":"basis_citation_contradicts_derivation","class":"text"}';
  end if;
  if coalesce(v_covered,0) <> coalesce(array_length(v_docs,1),0) then
    raise exception 'basis_coverage_incomplete' using errcode = 'CLR10',
      detail = '{"reason":"basis_coverage_incomplete","class":"documents"}';
  end if;

  -- (14) The binding row. proposed_by_agent is TRUE and created_by is the agent sentinel -- the
  --      bidirectional honesty CHECK makes those two facts one fact. proposal_receipt_id is set
  --      in (16), after the receipt exists: the two tables reference each other, so one write
  --      has to go second.
  --      W7: the partial unique index surfaces as the estate's EXISTING typed binding_conflict,
  --      the same word the human door has raised since 0028.
  begin
    insert into clara.vendor_identity_bindings(
        firm_id, client_id, counterparty_id, status,
        f1_vendor_name_norm, f2_invoice_prefix, registration_at_signing,
        content_hash, created_by, expires_at, proposed_by_agent, proposer_model, directed_by,
        proposal_receipt_id)
      values (
        p_firm, p_client, v_cp, 'proposed',
        v_derived->>'f1_vendor_name_norm',
        v_derived->>'f2_invoice_prefix',
        v_derived->>'registration_at_signing',
        v_derived->>'content_hash',
        clara.agent_user_id(), now() + interval '12 months', true,
        (p_model->>'provider') || '/' || (p_model->>'model') || '/' || (p_model->>'version'),
        -- 裁-32: the DIRECTING HUMAN, and only where one actually exists. `interactive` IS the
        -- human ask -- somebody clicked "ask Clara to propose", and that person is in the
        -- credential's on_behalf_of. `filing` is the UNATTENDED lane: its on_behalf_of is
        -- whoever the credential was minted for, not somebody who asked for THIS proposal, and
        -- treating them as a director would make every clocked proposal unsignable by the one
        -- person most likely to be looking at it. Measured on the rig: with filing included,
        -- the whole normal flow fell into the solo-attestation arm.
        case when p_wake_kind = 'interactive' then p_obo else null end,
        v_receipt)
      returning id into v_binding;
  exception when unique_violation then
    raise exception 'binding_conflict' using errcode = 'CLR36',
      detail = '{"reason":"binding_conflict","class":"open_proposal"}';
  end;

  -- (15) The evidence rows -- the derivation's own three, unchanged, exactly as the human door
  --      writes them.
  insert into clara.vendor_identity_binding_evidence(
      binding_id, firm_id, client_id, entry_id, document_id, facts_extraction_id, ocr_extraction_id)
  select v_binding, p_firm, p_client,
         (x->>'entry_id')::uuid, (x->>'document_id')::uuid,
         (x->>'facts_extraction_id')::uuid, (x->>'ocr_extraction_id')::uuid
    from jsonb_array_elements(v_derived->'evidence') x;

  -- (16) The receipt. Its `derived` block is written from the DB's OWN return values -- the five
  --      frozen content fields and the non-hashed sibling's counts -- so the receipt reproduces
  --      the card from DB-owned inputs (PRD SS6 invariant 1). `basis` is the RESOLVER'S OUTPUT
  --      AND NOTHING ELSE -- the caller's raw citations are read to build the resolver's input
  --      and are then persisted NOWHERE. An earlier draft of this file kept them beside the
  --      resolved set as `basis.claimed`, "clearly labelled". That is the shape 裁-22's own
  --      HIGH-2 ruling struck out of 0143 (`sightings_model`), and for the reason that applies
  --      here too: clara.agent_receipts_visible projects `verdict` to a human, so a
  --      model-authored list would sit in a human-readable receipt beside the checked one.
  --      Nothing is lost by dropping it -- every citation that survived resolution IS in the
  --      resolved set, deduped and canonicalised, and anything that did not survive refused the
  --      whole proposal.
  --      THE TRIGGER PAIR (conductor ruling 2026-08-29, overruling design SS3.5). trigger_id
  --      names what trigger_kind says it is, and nothing else. p_task is clara._wake_task_id()'s
  --      answer, read by the wrapper from the SAME credential wake_context() resolved: a real
  --      clara.agent_tasks id when the credential carries one, NULL otherwise. Neither branch is
  --      dead weight -- the battery drives both -- and neither ever writes a credential uuid
  --      under 'wake_task', which is what the three existing writers do and what this ruling
  --      forbids here.
  --      MEASURED, so a reviewer does not have to take it on trust: today no credential of
  --      EITHER ruled kind can carry a task, because clara.mint_wake_credential_for_task admits
  --      'close_prep' only. So the live product path takes the 'wake_credential' branch every
  --      time, and 'wake_task' is the branch PR-4's clocked expiry sweep will arrive on.
  if p_task is not null then
    v_trigger_kind := 'wake_task';   v_trigger_id := p_task::text;
  else
    v_trigger_kind := 'wake_credential'; v_trigger_id := p_credential::text;
  end if;
  insert into clara.binding_agent_receipts(
      id, firm_id, client_id, counterparty_id, binding_id, model, model_version,
      rationale, verdict, via_wake_kind, trigger_kind, trigger_id, acting_actor, on_behalf_of)
    values (
      v_receipt, p_firm, p_client, v_cp, v_binding, p_model->>'model', p_model->>'version',
      v_rationale,
      jsonb_build_object(
        'outcome', 'proposed',
        'basis', jsonb_build_object(
          'citations', v_resolved->'citations',
          'citation_count', v_resolved->'sightings'),
        'derived', jsonb_build_object(
          'f1_vendor_name_norm', v_derived->>'f1_vendor_name_norm',
          'f2_invoice_prefix', v_derived->>'f2_invoice_prefix',
          'registration_at_signing', v_derived->>'registration_at_signing',
          'content_hash', v_derived->>'content_hash',
          'matched_approved_entries', v_basis->'matched_approved_entries',
          'window_span_days', v_basis->'window_span_days',
          'distinct_posting_dates', v_basis->'distinct_posting_dates',
          'evidence_documents', v_basis->'evidence_documents')),
      p_wake_kind, v_trigger_kind, v_trigger_id, p_actor, p_obo);

  -- (17) Audit + event, mirroring the human door's own pair so one act reads the same way on
  --      both axes. The event type `kb_binding.agent_proposed` is NEW and is registered by §3a
  --      below -- clara.domain_events carries an FK to the append-only clara.event_types
  --      registry PLUS the _tf_validate_domain_event trigger, so an unregistered type raises
  --      CLR10 'unknown event_type'.
  --      HOW THAT WAS FOUND, recorded because the first draft got it wrong: this file's own
  --      prestate census originally read pg_constraint on `clara.events` -- a relation that does
  --      not exist -- and concluded from the empty result that there was no closed world at all.
  --      That is the absence-from-the-wrong-instrument class: the read saw nothing because it
  --      was pointed at nothing. The battery's first execution refused with CLR10 and named the
  --      real gate. The prestate below now reads the REGISTRY itself.
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind,
    'wake_propose_vendor_identity_binding', null,
    jsonb_build_object('binding_id', v_binding, 'client_id', p_client,
      'counterparty_id', v_cp, 'receipt_id', v_receipt, 'op_key', p_op_key,
      -- How many stale proposals this call had to drain first. Operationally load-bearing while
      -- PR-4's clock is unbuilt: a firm seeing this climb is a firm whose proposals are ageing
      -- out unread, which is a product signal, not a database one.
      'stale_proposals_expired', v_expired));
  perform clara._append_event(p_firm, 'kb_binding.agent_proposed', p_client, p_actor,
    p_obo, p_wake_kind, null, null, null,
    jsonb_build_object('binding_id', v_binding, 'counterparty_id', v_cp, 'receipt_id', v_receipt));

  return clara._finish_op(p_firm, 'wake_propose_vendor_identity_binding', p_op_key,
    jsonb_build_object('binding_id', v_binding, 'receipt_id', v_receipt, 'status', 'proposed'));
end $fn$;
comment on function clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text) is
  '裁-18b PR-1: the ungranted core behind clara.wake_propose_vendor_identity_binding -- the walls, '
  'the receipt and the insert. NO model-generated value enters clara.vendor_identity_bindings: '
  'the five content fields are exactly what the byte-frozen clara._derive_vendor_binding_proposal '
  'returns (PRD SS6 invariant 1). `sightings` is a FORBIDDEN basis key -- refused, not ignored. '
  'The only status transition this door can cause is null -> proposed: Clara never signs, '
  'declines, revokes or shortens an expiry. Reachable only from inside its wake wrapper.';
revoke all on function clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text) from public;

-- =====================================================================================
-- SS8 -- clara.wake_propose_vendor_identity_binding: the wake wrapper (G1 arm A)
-- =====================================================================================
create function clara.wake_propose_vendor_identity_binding(
    p_client uuid, p_counterparty uuid, p_basis jsonb,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare w record;
begin
  select * into w from clara.wake_context();
  -- W1: a live wake credential. W2: the per-kind allowlist (PRD SS6 invariant 2(c)) -- `filing`
  -- and `interactive` are admitted, the other five kinds refused. The GRANT split (2(d)) is the
  -- second, independent wall: only clara_wake_filing and clara_wake_interactive can EXECUTE this
  -- at all. The battery proves BOTH with real credentials through the real executor roles.
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_propose_vendor_identity_binding');
  return clara._propose_vendor_binding_agent_core(
    clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind, w.credential_id,
    clara._wake_task_id(),
    p_client, p_counterparty, p_basis, p_rationale, p_model, p_op_key);
end $fn$;
comment on function clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text) is
  '裁-18b (G1 arm A): Clara PROPOSES a vendor identity binding from her own observation; a human '
  'ADMIN signs it. Admitted on the wake kinds `filing` (the filing lane''s own turn, after it '
  'files an invoice) and `interactive` (the human ask from the admin / vendor-bindings panel -- '
  '裁-18c''s first named way out, and therefore REQUIRED, not optional). Six arguments: three '
  'the DB re-validates, two provenance, one idempotency key -- there is no argument the model can '
  'use to assert a fact. Stamps clara.agent_user_id() as the actor, which is what makes 裁-18a''s '
  'signer<>proposer wall pass by construction for every proposal it makes.';

-- =====================================================================================
-- SS9 -- clara.wake_list_binding_candidates: the eligibility READ (G1/G3)
-- =====================================================================================
-- WHY THIS VERB EXISTS. Without it, trigger T1 degenerates into "call the proposal door on every
-- vendor and see what raises" -- a refusal-as-probe pattern the estate has paid for before. With
-- it, Clara learns eligibility by ASKING THE DATABASE.
--
-- AND WHY IT CALLS THE DERIVATION RATHER THAN RE-STATING ITS PREDICATE (G3, ruled): counting is
-- an authoritative number (PRD SS6). One fact gets ONE definition. So this verb does not
-- re-implement "three approved invoices, three distinct dates, >= 14 days apart, one stable name
-- fingerprint" -- it CALLS clara._derive_vendor_binding_proposal per candidate and reports the
-- ladder's OWN typed refusal word as `reason`. There is therefore exactly one definition of
-- "ready to propose" in the estate, and it is the one the proposal door itself will run.
-- clara._coding_lane_core is untouched.
create function clara.wake_list_binding_candidates(p_client uuid)
  returns table(counterparty_id uuid, counterparty_name text, eligible boolean, reason text,
                matched_approved_entries int, has_open_proposal boolean,
                has_live_binding boolean, has_declined_proposal boolean)
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare
  w record; cp record; v_reason text; v_ok boolean; v_basis jsonb; v_derived jsonb;
  v_open boolean; v_live boolean; v_suppressed text;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_list_binding_candidates');
  if p_client is null then
    raise exception 'a client is required' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"client","constraint":"nonnull"}';
  end if;
  -- The same explicit client wall the proposal door carries, and for the same reason: `filing`
  -- and `interactive` credentials carry client_id IS NULL, so the client arrives as an argument.
  if not exists (select 1 from clara.clients c where c.id = p_client and c.firm_id = w.firm_id) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"client"}';
  end if;

  for cp in
    select c.id, c.name from clara.counterparties c
     where c.client_id = p_client and c.firm_id = w.firm_id and c.kind = 'vendor'
       and c.merged_into is null and c.retired_at is null
     order by c.name, c.id
  loop
    -- M8 (2026-08-29 cross-model pass): THIS READ IS GENUINELY READ-ONLY, AND `stable` NOW MEANS
    -- IT. An earlier cut called clara._expire_stale_proposals here -- a VOLATILE writer, inside a
    -- function declared `stable`, which contradicts PostgreSQL's own volatility contract, gave
    -- the read a stale snapshot over its own side effects, and (measured by the adversarial pass)
    -- escaped as an untyped 25006 the moment anybody called it inside `begin read only`. A read
    -- verb Clara calls to decide where to go must not be the thing that changes the world.
    -- So a PAST-EXPIRY `proposed` row is treated as NON-OPEN in the PREDICATE -- the same answer
    -- the sweep would have produced, arrived at without writing -- and the actual expiry stays
    -- inside the locked writer doors, where B5's in-door drain already runs. The two agree
    -- because they share the same "expires_at <= now()" fact, not because one calls the other.
    select exists (select 1 from clara.vendor_identity_bindings b
                    where b.client_id = p_client and b.counterparty_id = cp.id and b.status = 'proposed'
                      and b.expires_at > now()),
           exists (select 1 from clara.vendor_identity_bindings b
                    where b.client_id = p_client and b.counterparty_id = cp.id and b.status = 'live'
                      and b.expires_at > now()),
           clara._binding_suppression(w.firm_id, p_client, cp.id)
      into v_open, v_live, v_suppressed;

    v_basis := clara._derive_vendor_binding_basis(w.firm_id, p_client, cp.id);

    -- The ladder itself, run for real. A CLR36 is the derivation's OWN typed refusal word and is
    -- reported verbatim; anything else is re-raised, because swallowing an unexpected error here
    -- would turn a real fault into a quiet "not eligible" (review law 2 -- the fail-closed
    -- branch is a REFUSAL, never a silent one).
    begin
      v_derived := clara._derive_vendor_binding_proposal(w.firm_id, p_client, cp.id);
      v_ok := true; v_reason := null;
    exception
      when sqlstate 'CLR36' then
        v_ok := false; v_reason := sqlerrm; v_derived := null;
    end;

    -- ...and then the SAME post-derivation identity walls the proposal writer runs, out of the
    -- SAME body. A vendor that clears the frozen ladder but trips law 79's family collision,
    -- corpus distinctness, the trusted-clock span or the printed-identifier wall is NOT
    -- eligible, and this read says so in the writer's own words. Without this the read would
    -- send Clara at a door that is certain to refuse her -- probing by refusal, the exact
    -- pattern this verb exists to prevent.
    if v_ok and v_derived is not null then
      v_reason := clara._binding_extra_blocker(w.firm_id, p_client, cp.id, v_derived, v_basis);
      if v_reason is not null then v_ok := false; end if;
    end if;

    -- The loop brakes, in precedence order. A human's "no" outranks everything: Clara must not
    -- re-propose what a human declined (risk R7), and the proposal door refuses it too (W14), so
    -- this row and that wall agree.
    if v_suppressed is not null then
      v_ok := false; v_reason := 'binding_' || v_suppressed;
    elsif v_open then
      v_ok := false; v_reason := 'binding_proposal_open';
    end if;

    counterparty_id := cp.id;
    counterparty_name := cp.name;
    eligible := v_ok;
    reason := v_reason;
    matched_approved_entries := coalesce((v_basis->>'matched_approved_entries')::int, 0);
    has_open_proposal := v_open;
    has_live_binding := v_live;
    has_declined_proposal := v_suppressed is not null;
    return next;
  end loop;
end $fn$;
comment on function clara.wake_list_binding_candidates(uuid) is
  '裁-18b (G1/G3): the eligibility read that keeps trigger T1 from probing by refusal. One row per '
  'ACTIVE vendor counterparty of the client. `eligible`/`reason` come from CALLING the byte-frozen '
  'clara._derive_vendor_binding_proposal itself -- the ladder''s own typed CLR36 word, never a '
  'second implementation of its window (G3: one fact, one definition; clara._coding_lane_core is '
  'untouched). matched_approved_entries is the DB''s count, never Clara''s. A DECLINED proposal '
  'outranks every other verdict: the loop brake that stops her re-proposing what a human refused, '
  'and it agrees with the proposal door''s own W14 wall. Any non-CLR36 error is RE-RAISED, never '
  'swallowed into a quiet "not eligible".';

-- =====================================================================================
-- SS10 -- clara.decline_vendor_identity_binding: the human "no" (G7, first half)
-- =====================================================================================
-- The other half of the two-party shape 裁-18b builds: a card a human cannot answer "no" to is
-- not a consent surface. Survey A3 measured that the status CHECK has always admitted
-- 'declined' while NO verb anywhere ever wrote it -- an admin who disagreed could only let the
-- proposal rot. Admin floor (the SIGNER's floor, because declining is the same decision said the
-- other way), reason required, audited, proposed -> declined, and read by the loop brake.
create function clara.decline_vendor_identity_binding(
    p_binding uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; b record; v_reason text; v_pair record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode = 'CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a decline reason is required' using errcode = 'CLR36',
      detail = '{"reason":"decline_reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'decline_vendor_identity_binding', p_op_key,
    clara._hash(jsonb_build_object('binding_id', p_binding, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- H6 / C-1: THE ONE ORDER. Read the IMMUTABLE pair unlocked, take the pair key, THEN re-read
  -- the row for update. This door took no advisory key at all before, which is how a decline
  -- committing inside an open transaction could let a concurrent propose -- already past its own
  -- suppression read, blocked only on the unique index -- insert onto the pair a human had just
  -- refused, and an admin then sign it LIVE. (client_id, counterparty_id) have no writer anywhere
  -- in the estate, so reading them without a lock cannot go stale.
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
  if b.status <> 'proposed' then
    raise exception 'binding_not_proposed' using errcode = 'CLR36';
  end if;

  update clara.vendor_identity_bindings
     set status = 'declined', declined_by = c.actor, declined_at = now(), decline_reason = v_reason
   where id = p_binding;

  perform clara._audit(c.firm, c.actor, null, null,
    'decline_vendor_identity_binding', null,
    jsonb_build_object('binding_id', p_binding, 'client_id', b.client_id,
      'counterparty_id', b.counterparty_id, 'reason', v_reason, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'kb_binding.declined', b.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('binding_id', p_binding, 'counterparty_id', b.counterparty_id));
  return clara._finish_op(c.firm, 'decline_vendor_identity_binding', p_op_key,
    jsonb_build_object('binding_id', p_binding, 'status', 'declined'));
end $fn$;
comment on function clara.decline_vendor_identity_binding(uuid,text,text) is
  '裁-18b (G7): a human ADMIN declines a proposed vendor identity binding. Admin floor -- the '
  'signer''s own floor, because declining is that decision said the other way. Reason required, '
  'audited, evented, proposed -> declined only. Closes survey A3 (the status CHECK admitted '
  '''declined'' since 0028 and no verb ever wrote it). The decline is what the loop brake in '
  'clara.wake_list_binding_candidates and the W14 wall in the proposal core both read, so Clara '
  'never re-proposes what a human refused. Frontend home: the admin / vendor-bindings panel, '
  'beside Sign in the proposal dialog.';

-- =====================================================================================
-- SS10b -- D1 BODY 1 of 2: clara.propose_vendor_identity_binding, RECUT.
-- =====================================================================================
-- Conductor rulings (b) and (c), 2026-08-29, from the cross-model adversarial pass. The design
-- said the decline was "read by the loop brake" and that this PR replaced ZERO writer bodies.
-- Both are overruled: a suppression that only the READ verb honours is not an invariant, and the
-- audit's own attack is one line long -- decline the card, then call the UNCHANGED human door.
--
-- THREE SPLICES, and nothing else. The re-substitution proof in the tail strips exactly these
-- three blocks from the new body and asserts what remains is the prestate BYTE-FOR-BYTE, so a
-- fourth change anywhere in this 3.3 KB body fails the migration rather than shipping unnoticed.
--   (1) the shared (client, counterparty) advisory key -- ruling (c). Both proposal doors, the
--       signer and the decline take it, so a lawful second actor WAITS instead of racing to a
--       typed refusal on a row that was mid-flight.
--   (2) the declined-history wall -- ruling (b). Same shape as the agent core's W14. A human may
--       still re-propose after an explicit RESET (clara.reset_binding_decline), which is what
--       keeps "a human said no" from becoming "nobody may ever ask again".
--   (3) the post-derivation identity walls -- ruling (e). A poisoned corpus is a poisoned corpus
--       whoever proposes from it; law 79's predicate belongs at EVERY proposal point, not just
--       Clara's.
set role clara_fn_owner;

create or replace function clara.propose_vendor_identity_binding(
  p_proposal jsonb,
  p_op_key text
) returns jsonb
language plpgsql security definer
set search_path to clara,pg_temp
as $$
declare
  c record; v_dedupe jsonb; v_client uuid; v_counterparty uuid;
  v_derived jsonb; v_binding uuid;
  v_blocker text; v_suppressed text;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_proposal is null or jsonb_typeof(p_proposal)<>'object'
     or not (p_proposal ? 'client_id')
     or not (p_proposal ? 'counterparty_id')
     or exists (
       select 1 from jsonb_object_keys(p_proposal) k
       where k not in ('client_id','counterparty_id')
     ) then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end if;
  begin
    v_client:=(p_proposal->>'client_id')::uuid;
    v_counterparty:=(p_proposal->>'counterparty_id')::uuid;
  exception when others then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end;
  if v_client is null or v_counterparty is null then
    raise exception 'binding_proposal_malformed' using errcode='CLR36';
  end if;
  if not exists (
    select 1 from clara.clients where id=v_client and firm_id=c.firm
  ) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;

  v_dedupe:=clara._reserve_op(c.firm,'propose_vendor_identity_binding',p_op_key,
    clara._hash(jsonb_build_object(
      'client_id',v_client,'counterparty_id',v_counterparty)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform clara._binding_lock_pair(v_client,v_counterparty);
  perform clara._expire_stale_proposals(c.firm,v_client,v_counterparty);
  v_suppressed:=clara._binding_suppression(c.firm,v_client,v_counterparty);
  if v_suppressed is not null then
    raise exception 'binding_%', v_suppressed using errcode='CLR36',
      detail=jsonb_build_object('reason','binding_'||v_suppressed,'class','loop_brake')::text;
  end if;

  update clara.vendor_identity_bindings
    set status='expired'
  where firm_id=c.firm and client_id=v_client
    and counterparty_id=v_counterparty
    and status='live' and expires_at<=now();

  v_derived:=clara._derive_vendor_binding_proposal(
    c.firm,v_client,v_counterparty);
  v_blocker:=clara._binding_extra_blocker(c.firm,v_client,
    (v_derived->>'counterparty_id')::uuid, v_derived,
    clara._derive_vendor_binding_basis(c.firm,v_client,
      (v_derived->>'counterparty_id')::uuid));
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode='CLR36',
      detail=jsonb_build_object('reason',v_blocker,'class','identity')::text;
  end if;
  begin
    insert into clara.vendor_identity_bindings(
      firm_id,client_id,counterparty_id,status,
      f1_vendor_name_norm,f2_invoice_prefix,registration_at_signing,
      content_hash,created_by,expires_at
    ) values (
      c.firm,v_client,(v_derived->>'counterparty_id')::uuid,'proposed',
      v_derived->>'f1_vendor_name_norm',
      v_derived->>'f2_invoice_prefix',
      v_derived->>'registration_at_signing',
      v_derived->>'content_hash',c.actor,now()+interval '12 months'
    ) returning id into v_binding;
  exception when unique_violation then
    raise exception 'binding_conflict' using errcode='CLR36';
  end;

  insert into clara.vendor_identity_binding_evidence(
    binding_id,firm_id,client_id,entry_id,document_id,
    facts_extraction_id,ocr_extraction_id
  )
  select v_binding,c.firm,v_client,
    (x->>'entry_id')::uuid,(x->>'document_id')::uuid,
    (x->>'facts_extraction_id')::uuid,(x->>'ocr_extraction_id')::uuid
  from jsonb_array_elements(v_derived->'evidence') x;

  perform clara._audit(c.firm,c.actor,null,null,
    'propose_vendor_identity_binding',null,
    jsonb_build_object('binding_id',v_binding,'client_id',v_client,
      'counterparty_id',v_derived->>'counterparty_id','op_key',p_op_key));
  perform clara._append_event(c.firm,'kb_binding.proposed',v_client,c.actor,
    null,null,null,null,null,
    jsonb_build_object('binding_id',v_binding,
      'counterparty_id',v_derived->>'counterparty_id'));

  return clara._finish_op(c.firm,'propose_vendor_identity_binding',p_op_key,
    jsonb_build_object('binding_id',v_binding,'status','proposed')
      || (v_derived - 'client_id' - 'counterparty_id'));
end
$$;

-- =====================================================================================
-- SS10b2 -- clara.eligible_binding_signer_count: the SOLO predicate, at the SIGNER'S floor
-- =====================================================================================
-- 裁-32 says to measure the solo case "the way PRD SS2's solo rule is measured elsewhere". The
-- estate's own arm is in clara._approve_entry_core: `if eligible_checker_count(firm) >= 2 then
-- refuse distinct_checker; elsif attestation is blank then refuse self_attestation`. This file
-- reuses that ARM SHAPE exactly -- and deliberately NOT that function.
-- WHY NOT: clara.eligible_checker_count is floored at BOOKKEEPER (design annex G-b flags it),
-- while the binding signer floor is ADMIN. A firm with one admin and two bookkeepers counts 3
-- and would be told "add a second admin" while having none to add -- naming a number that is
-- not the one the wall enforces. The honest sibling counts the people who could ACTUALLY sign.
--
-- AND IT IS A **DURABLE ROSTER WINDOW**, NOT A LIVE HEADCOUNT (H5, driven end to end by the
-- 2026-08-30 adversarial pass). A count of currently-active admins is a number the person it
-- gates can CHANGE: remove admin B, become "solo", self-sign with an attestation, add B back.
-- Two minutes, fully audited, and the binding is live with no second party. The population was
-- measured rather than assumed -- clara.firm_memberships.status is exactly {active, removed},
-- there is no pending state, and add_member mints a NEW row rather than reviving the old one --
-- so the window is built from three things a departure cannot erase:
--   * every ACTIVE admin+ human membership;
--   * every PENDING, unexpired admin+ INVITE (0141) -- a firm that has already asked somebody to
--     be its second admin is not a solo firm;
--   * every admin+ human whose membership was REMOVED within the last 90 DAYS and who has no
--     active membership now -- the durable half. 90 days is long enough that the remove/sign/
--     re-add manoeuvre cannot wait it out inside one signing session, and short enough that a
--     firm which genuinely lost its second admin is not held solo forever.
-- The NUMBER the wall enforced and the ROSTER it was measured over are both stamped on the row at
-- signing (signer_count_at_signing / signer_roster_epoch), because a count read from a roster
-- that can move afterwards is not, by itself, auditable.
--
-- M-10 (2026-08-30): FIRM CONGRUENCE. This is SECURITY DEFINER, granted to clara_authenticated,
-- and takes the firm as an ARGUMENT -- the exact caller-supplied-tenant shape 0002:453-458
-- records the estate paying for once. Before this wall a firm-A owner could read firm B's admin
-- headcount by passing B's uuid. It refuses instead.
create function clara.eligible_binding_signer_count(p_firm uuid)
  returns integer language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare v_n int;
begin
  if p_firm is null or p_firm is distinct from clara.jwt_firm() then
    raise exception 'firm not yours' using errcode = 'CLR11',
      detail = '{"reason":"cross_firm","class":"firm"}';
  end if;
  select
      (select count(*) from clara.firm_memberships m join clara.users u on u.id = m.user_id
        where m.firm_id = p_firm and m.status = 'active'
          and clara.role_rank(m.role) >= clara.role_rank('admin') and u.is_agent = false)
    + (select count(*) from clara.firm_invites i
        where i.firm_id = p_firm and i.status = 'pending' and i.expires_at > now()
          and clara.role_rank(i.role) >= clara.role_rank('admin'))
    + (select count(distinct m.user_id)
         from clara.firm_memberships m join clara.users u on u.id = m.user_id
        where m.firm_id = p_firm and m.status = 'removed'
          and clara.role_rank(m.role) >= clara.role_rank('admin') and u.is_agent = false
          and m.removed_at is not null and m.removed_at > now() - interval '90 days'
          -- ...and only where they are not ALREADY counted as active above, so a re-add is one
          -- person, not two.
          and not exists (select 1 from clara.firm_memberships m2
                           where m2.firm_id = m.firm_id and m2.user_id = m.user_id
                             and m2.status = 'active'))
    into v_n;
  return v_n;
end $fn$;
comment on function clara.eligible_binding_signer_count(uuid) is
  '裁-32 / H5: how many REAL humans could sign a vendor identity binding in this firm -- the '
  'ADMIN-floor sibling of clara.eligible_checker_count (which is bookkeeper-floored, design annex '
  'G-b). Excludes clara.agent_user_id() through u.is_agent = false, exactly as its sibling does. '
  'A DURABLE ROSTER WINDOW, not a live headcount: active admin+ memberships, PLUS pending '
  'unexpired admin+ invites, PLUS admin+ memberships ENDED within the last 90 days with no active '
  'membership today. A live headcount is a number the person it gates can change -- remove the '
  'second admin, self-sign, add them back -- and the pass drove exactly that. Firm-congruent '
  '(M-10): refuses CLR11 for any firm but the caller''s own, because a SECURITY DEFINER function '
  'with a caller-supplied tenant argument is otherwise a cross-tenant oracle (0002:453-458).';
revoke all on function clara.eligible_binding_signer_count(uuid) from public;
grant execute on function clara.eligible_binding_signer_count(uuid) to clara_authenticated;

-- =====================================================================================
-- SS10b3 -- D1 BODY 2 of 2: clara.sign_vendor_identity_binding, RECUT (裁-32).
-- =====================================================================================
-- 裁-18a's wall compares the SIGNER to `created_by`. For an `interactive` proposal that is
-- Clara's uuid -- while the human who DIRECTED her is sitting in the credential's on_behalf_of
-- (0011:1143) and is never looked at. So: H clicks "ask Clara to propose", then H signs, and the
-- wall passes because an agent's uuid is not H's. Law 69 says maker/checker measures the
-- DIRECTING HUMAN (ADR digest:400) and 0084 already implements exactly that rule elsewhere.
-- 裁-32 (2026-08-29) rules the fail-closed reading: compare against `effective_proposer`.
--
-- THIS RELAXES 裁-18c, AND THAT IS DELIBERATE AND RULED, not an oversight. 裁-18c was STRICT --
-- no relaxation for a single-admin firm. Under 裁-32 the sole eligible human MAY sign their own
-- directed proposal, but only with an explicit self-approval attestation that is written onto the
-- row and rendered on the card. The alternative was to strand every solo firm completely, because
-- 裁-18c's own first way out ("let Clara propose") is precisely the path this finding closes.
-- The >=2 case keeps 裁-18c's verbatim refusal words unchanged.
--
-- SIGNATURE CHANGE, not a CoR: the attestation is a new parameter, and a parameter list cannot
-- change under CREATE OR REPLACE without leaving the old overload shadow-reachable (0054's own
-- prestate class; 0143 hit the same wall). The 2-arg body is DROPped and the 3-arg created with
-- `p_attestation text default null`, so every existing 2-arg caller -- the panel, x36's battery --
-- keeps resolving with no edit, and only a solo signer ever needs the third argument.
drop function clara.sign_vendor_identity_binding(uuid,text);

create function clara.sign_vendor_identity_binding(
  p_binding uuid,
  p_op_key text,
  p_attestation text default null
) returns jsonb
language plpgsql security definer
set search_path to clara,pg_temp
as $$
declare
  c record; v_dedupe jsonb; b record; v_derived jsonb;
  v_stored_evidence jsonb; v_pair record;
  v_self boolean := false; v_self_reason text;
  v_count int; v_epoch timestamptz;
  v_suppressed text; v_blocker text; v_stored_basis jsonb; v_src text;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'sign_vendor_identity_binding',p_op_key,
    clara._hash(jsonb_build_object('binding_id',p_binding)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- H6 / M-9: THE ONE ORDER (SS5b). This body used to take the ROW `for update` FIRST and the
  -- pair advisory key SECOND -- the INVERTED order, driven by the adversarial pass to a real
  -- 40P01 whose server report named `sign_vendor_identity_binding line 25`. Read the immutable
  -- pair unlocked, take the key, THEN re-read the row for update and judge from that read.
  select v.firm_id, v.client_id, v.counterparty_id into v_pair
  from clara.vendor_identity_bindings v where v.id=p_binding;
  if not found or v_pair.firm_id<>c.firm then
    raise exception 'binding not found' using errcode='CLR11';
  end if;
  perform clara._binding_lock_pair(v_pair.client_id,v_pair.counterparty_id);

  select * into b
  from clara.vendor_identity_bindings
  where id=p_binding
  for update;
  if not found or b.firm_id<>c.firm then
    raise exception 'binding not found' using errcode='CLR11';
  end if;
  -- 裁-18a, as recut by 裁-32 (2026-08-29). The comparison is against effective_proposer -- the
  -- GENERATED coalesce(directed_by, created_by) -- so an `interactive` proposal is measured
  -- against the human who directed Clara, not against Clara's uuid. Separation is ACCOUNT-level;
  -- the estate has no physical-person principal (0002:187) and 裁-32 records that as a named
  -- residual rather than pretending otherwise.
  -- THE NULL ARM IS THE FLOOR UNDER A NULLABLE DRIFT, and it is KEPT. created_by is NOT NULL
  -- today (0028:65, measured again in this file's prestate), so it is unreachable on the live
  -- shape -- but x36c.9 REACHES IT FOR REAL by dropping that NOT NULL and driving the door, and
  -- it exists because an independent reviewer measured a fail-open here (0144 LOW-5): a bare
  -- equality evaluates to NULL on a null principal and signs LIVE with no separation at all.
  -- Deleting a defensive branch that a registered regression pin exercises is proof deletion, so
  -- the branch stays and the six-line argument for it does not.
  if b.effective_proposer is null then
    raise exception 'the signer cannot be the same person who proposed this binding; let Clara propose it, or add a second admin' using errcode='CLR04',detail='{"reason":"signer_is_proposer"}';
  end if;
  if b.effective_proposer = c.actor then
    -- N-4 (2026-08-30, fail-closed pending the owner's ruling): THE ATTESTATION RELAXATION IS FOR
    -- 裁-32'S CASE ONLY -- the sole admin who DIRECTED CLARA and now signs what she proposed.
    -- The first cut compared effective_proposer alone, which also opened the door to a human's
    -- OWN MANUAL proposal being self-signed in a solo firm; 裁-32 never said that, and 裁-18c
    -- said the opposite. `directed_by` is non-null only on the interactive wake path (the core
    -- sets it from that credential's on_behalf_of and nowhere else, and ck_vib_directed_by_honest
    -- pairs it with proposed_by_agent), so `directed_by = c.actor` IS "I asked Clara for this".
    -- Anything else keeps 裁-18a's wall exactly as 0144 wrote it, attestation or no attestation.
    if b.directed_by is distinct from c.actor then
      raise exception 'the signer cannot be the same person who proposed this binding; let Clara propose it, or add a second admin' using errcode='CLR04',detail='{"reason":"signer_is_proposer"}';
    end if;
    v_count := clara.eligible_binding_signer_count(c.firm);
    if v_count >= 2 then
      raise exception 'the signer cannot be the same person who proposed this binding; let Clara propose it, or add a second admin' using errcode='CLR04',detail='{"reason":"signer_is_proposer"}';
    elsif nullif(btrim(coalesce(p_attestation,'')),'') is null then
      raise exception 'you are the only admin who could sign this, and you directed the proposal; state why you are signing your own' using errcode='CLR04',detail='{"reason":"self_attestation_required"}';
    else
      v_self:=true; v_self_reason:=btrim(p_attestation);
      -- H5: stamp the ROSTER the count was measured over, so a reviewer can see the decision
      -- without reconstructing a membership history the estate cannot reproduce once a row is
      -- re-created. The epoch is the most recent admin+ roster MOVEMENT the window saw.
      select greatest(
               coalesce((select max(m.created_at) from clara.firm_memberships m
                          where m.firm_id=c.firm and clara.role_rank(m.role)>=clara.role_rank('admin')),
                        '-infinity'::timestamptz),
               coalesce((select max(m.removed_at) from clara.firm_memberships m
                          where m.firm_id=c.firm and clara.role_rank(m.role)>=clara.role_rank('admin')),
                        '-infinity'::timestamptz),
               coalesce((select max(i.created_at) from clara.firm_invites i
                          where i.firm_id=c.firm and clara.role_rank(i.role)>=clara.role_rank('admin')),
                        '-infinity'::timestamptz))
        into v_epoch;
    end if;
  end if;
  -- STANDING RE-READ (the 0084:123 idiom, gate B1). A directorship recorded months ago is not
  -- evidence of standing today: if the human who directed this proposal is no longer an active
  -- bookkeeper+ member of the firm, the separation it was supposed to provide is gone. Refuse
  -- rather than silently treat the proposal as director-less -- the fail-closed branch.
  if b.directed_by is not null and not exists (
    select 1 from clara.firm_memberships m
    where m.user_id=b.directed_by and m.firm_id=c.firm and m.status='active'
      and clara.role_rank(m.role)>=clara.role_rank('bookkeeper')
  ) then
    raise exception 'the person who directed this proposal no longer has standing in this firm; it must be proposed again' using errcode='CLR04',detail='{"reason":"director_standing_lost"}';
  end if;
  if b.status<>'proposed' then
    raise exception 'binding_not_proposed' using errcode='CLR36';
  end if;
  if b.expires_at<=now() then
    raise exception 'binding_expired' using errcode='CLR36';
  end if;
  -- C-1(b) (2026-08-30 adversarial pass, CRITICAL): THE SUPPRESSION IS ALSO A SIGN-TIME WALL,
  -- ORDER-INDEPENDENTLY. Fixing decline's lock order closes the race that produced a proposal on
  -- a just-declined pair; this closes the CONSEQUENCE whatever produced it. A binding must never
  -- go live on a pair clara._binding_suppression still answers for -- and the two walls are
  -- independent, so neither has to be right for the other to hold.
  v_suppressed:=clara._binding_suppression(c.firm,b.client_id,b.counterparty_id);
  if v_suppressed is not null then
    raise exception 'binding_%', v_suppressed using errcode='CLR36',
      detail=jsonb_build_object('reason','binding_'||v_suppressed,'class','loop_brake')::text;
  end if;

  update clara.vendor_identity_bindings
    set status='expired'
  where id<>p_binding
    and firm_id=c.firm and client_id=b.client_id
    and counterparty_id=b.counterparty_id
    and status='live' and expires_at<=now();

  v_derived:=clara._derive_vendor_binding_proposal(
    c.firm,b.client_id,b.counterparty_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'entry_id',ev.entry_id,
      'document_id',ev.document_id,
      'facts_extraction_id',ev.facts_extraction_id,
      'ocr_extraction_id',ev.ocr_extraction_id,
      'posting_date',j.posting_date
    ) order by j.approved_at desc,j.id desc),'[]'::jsonb)
    into v_stored_evidence
  from clara.vendor_identity_binding_evidence ev
  join clara.journal_entries j on j.id=ev.entry_id
  where ev.binding_id=p_binding;

  if b.f1_vendor_name_norm is distinct from
       v_derived->>'f1_vendor_name_norm'
     or b.f2_invoice_prefix is distinct from
       v_derived->>'f2_invoice_prefix'
     or b.registration_at_signing is distinct from
       v_derived->>'registration_at_signing'
     or b.content_hash is distinct from v_derived->>'content_hash'
     or v_stored_evidence is distinct from v_derived->'evidence' then
    raise exception 'proposal_drifted' using errcode='CLR36';
  end if;

  -- H7 (2026-08-29 pass) -- THE IDENTITY WALLS ARE RE-RUN IMMEDIATELY BEFORE THE ROW GOES LIVE.
  -- The drift check above re-runs the FROZEN DERIVATION; it has never re-run the walls that sit
  -- ABOVE it. So a same-family sibling counterparty appearing between propose and sign, or a
  -- foreign registration region landing on an evidence document, left the proposal signable --
  -- and a card a human answers "yes" to must be judged against the world at the moment of the
  -- signature, not the world a week ago. Rebuilt from the binding's OWN STORED corpus (the same
  -- construction clara.binding_identity_review uses, and for the same reason: re-deriving here
  -- would answer about today's window rather than the corpus this signature actually rests on).
  select jsonb_build_object('evidence', coalesce(jsonb_agg(jsonb_build_object(
           'entry_id',ev.entry_id,'document_id',ev.document_id,
           'facts_extraction_id',ev.facts_extraction_id,
           'ocr_extraction_id',ev.ocr_extraction_id)),'[]'::jsonb))
    into v_stored_basis
    from clara.vendor_identity_binding_evidence ev where ev.binding_id=p_binding;
  v_blocker:=clara._binding_extra_blocker(c.firm,b.client_id,b.counterparty_id,v_stored_basis,
    (select jsonb_build_object('f2_evidence', coalesce(jsonb_agg(jsonb_build_object(
              'document_id',d.doc,'invoice_id_norm',d.iv)),'[]'::jsonb))
       from (select ev.document_id as doc,
                    (select clara._binding_normalize(min(r.text_content))
                       from clara.document_regions r
                       join clara.document_extractions x on x.id=r.extraction_id
                      where x.document_id=ev.document_id and x.engine_kind='invoice_facts'
                        and x.status='done'
                        and x.version_n=(select max(x2.version_n) from clara.document_extractions x2
                                          where x2.document_id=ev.document_id
                                            and x2.engine_kind='invoice_facts' and x2.status='done')
                        and r.field_path='invoice.invoice_id') as iv
               from clara.vendor_identity_binding_evidence ev
              where ev.binding_id=p_binding) d));
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode='CLR36',
      detail=jsonb_build_object('reason',v_blocker,'class','identity')::text;
  end if;

  -- C3 (2026-08-29 pass, CRITICAL) -- THE POST-TIME CONTROL, PROVEN BY CATALOG WITNESS.
  -- WHAT THIS REPLACED, and why the replacement is not cosmetic: the gate used to read
  -- `exists(select 1 from clara.schema_migrations where version='0029_vendor_binding_executor')`.
  -- That row IS present -- ledgers are append-only, so it has been present since 0029 applied and
  -- can never stop being -- while the control it stood for lives in clara.execute_rule_post, which
  -- 0118:212 DROPPED. The gate has therefore been PERMANENTLY TRUE, and this file's own prestate
  -- measures the other half positively: clara._approve_entry_core carries no binding reference at
  -- all. A binding has been able to go live for the whole of that window with no post-time
  -- re-check behind it. A NAME IS NOT THE THING (review law 3), and a migration ledger row is the
  -- weakest name there is: it says a file ran once, never that its objects survived.
  -- SO THE WITNESS IS THE BODY ITSELF -- the approve path resolved by EXACT SIGNATURE, carrying
  -- the ratified marker PR-3 mints. Until PR-3 lands this REFUSES, deliberately: PR-1's ceremony
  -- now FOLLOWS PR-3's, or the refusal ships and PR-3 lifts it. Both are stated in the PR body.
  -- COMMENT-STRIPPED, deliberately: a marker sitting in a COMMENT is a claim, and this gate must
  -- read a fact. PR-3 mints it as real code -- the estate's own idiom is a declared variable whose
  -- NAME carries the marker, which survives stripping and costs nothing. (The prestate's mirror
  -- check reads the RAW body instead, because there the assertion is an ABSENCE and the stricter
  -- reading is the fail-closed one: even a comment mention should stop this file landing.)
  select regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g')
    into v_src from pg_proc p
   where p.oid = to_regprocedure('clara._approve_entry_core(jsonb,uuid,uuid,text,text)');
  if v_src is null or position('binding_post_time_recheck_v1' in v_src) = 0 then
    raise exception 'the post-time binding re-check is not deployed on the approve path'
      using errcode='CLR36',detail='{"reason":"post_time_control_absent"}';
  end if;

  update clara.vendor_identity_bindings
    set status='live',signed_by=c.actor,signed_at=now(),
        self_approved=v_self,self_approval_reason=v_self_reason,
        signer_count_at_signing=case when v_self then v_count else null end,
        signer_roster_epoch=case when v_self then v_epoch else null end
  where id=p_binding;

  perform clara._audit(c.firm,c.actor,null,null,
    'sign_vendor_identity_binding',null,
    jsonb_build_object('binding_id',p_binding,'client_id',b.client_id,
      'counterparty_id',b.counterparty_id,'op_key',p_op_key,
      'self_approved',v_self,'effective_proposer',b.effective_proposer,
      -- H5: the number the wall enforced, in the receipt as well as on the row.
      'signer_count_at_signing',case when v_self then v_count else null end,
      'signer_roster_epoch',case when v_self then v_epoch else null end));
  perform clara._append_event(c.firm,'kb_binding.signed',b.client_id,c.actor,
    null,null,null,null,null,
    jsonb_build_object('binding_id',p_binding,
      'counterparty_id',b.counterparty_id,'self_approved',v_self));
  return clara._finish_op(c.firm,'sign_vendor_identity_binding',p_op_key,
    jsonb_build_object('binding_id',p_binding,'status','live','self_approved',v_self)
      || (v_derived - 'client_id' - 'counterparty_id'));
end
$$;

-- =====================================================================================
-- SS10b4 -- O1: the RETRO CENSUS. Read-only. No auto-revoke.
-- =====================================================================================
-- C1's identity rungs are NOT applied retroactively (gate ruling O1, under delegation). They sit
-- ABOVE the frozen derivation, so they can only guard proposals made from now on: a binding
-- signed last month was signed against the walls that existed last month, and silently revoking
-- it would be this migration deciding, unattended, that a human's signature was wrong.
-- What IS owed is VISIBILITY. This census answers one question honestly -- "which live bindings
-- would not be proposable today, and why" -- and does nothing else with the answer. Acting on a
-- row is a human's call through the existing revoke door.
create function clara.binding_identity_review()
  returns table(binding_id uuid, client_id uuid, counterparty_id uuid,
                counterparty_name text, signed_at timestamptz, would_fail text)
  language plpgsql stable security definer set search_path = clara, pg_temp as $fn$
declare c record; b record; v_derived jsonb; v_basis jsonb; v_reason text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  for b in
    select v.id, v.client_id, v.counterparty_id, v.signed_at, cp.name
      from clara.vendor_identity_bindings v
      join clara.counterparties cp on cp.id = v.counterparty_id
     where v.firm_id = c.firm and v.status = 'live'
     order by v.signed_at desc nulls last, v.id
  loop
    -- THE CORPUS IS READ FROM THE BINDING'S OWN STORED EVIDENCE, never re-derived. Calling
    -- clara._derive_vendor_binding_proposal here would ALWAYS raise binding_conflict -- its last
    -- rung refuses when a live binding exists, and the live binding in question is this one --
    -- so the walls would never be reached and the census would report a clean estate no matter
    -- what. Measured on the rig: the first draft did exactly that and returned zero rows for a
    -- binding it should have named. The stored evidence is also the RIGHT corpus to judge: it is
    -- the one this binding actually rests on.
    v_reason := null;
    select jsonb_build_object('evidence', coalesce(jsonb_agg(jsonb_build_object(
             'entry_id', ev.entry_id, 'document_id', ev.document_id,
             'facts_extraction_id', ev.facts_extraction_id,
             'ocr_extraction_id', ev.ocr_extraction_id)), '[]'::jsonb))
      into v_derived
      from clara.vendor_identity_binding_evidence ev
     where ev.binding_id = b.id;
    -- The basis is built from the SAME stored documents, not from
    -- clara._derive_vendor_binding_basis. That helper reads the CURRENT three-entry window,
    -- which for an old binding is a DIFFERENT corpus -- so mixing them would judge the document
    -- and sha conjuncts against the stored evidence and the invoice-id conjunct against today's
    -- window, and a finding would not name one coherent thing. One corpus, judged once.
    select jsonb_build_object('f2_evidence', coalesce(jsonb_agg(jsonb_build_object(
             'document_id', d.doc, 'invoice_id_norm', d.iv)), '[]'::jsonb))
      into v_basis
      from (
        select ev.document_id as doc,
               (select clara._binding_normalize(min(r.text_content))
                  from clara.document_regions r
                  join clara.document_extractions x on x.id = r.extraction_id
                 where x.document_id = ev.document_id and x.engine_kind = 'invoice_facts'
                   and x.status = 'done'
                   and x.version_n = (select max(x2.version_n) from clara.document_extractions x2
                                       where x2.document_id = ev.document_id
                                         and x2.engine_kind = 'invoice_facts' and x2.status = 'done')
                   and r.field_path = 'invoice.invoice_id') as iv
          from clara.vendor_identity_binding_evidence ev
         where ev.binding_id = b.id) d;
    begin
      v_reason := clara._binding_extra_blocker(c.firm, b.client_id, b.counterparty_id,
                                               v_derived, v_basis);
    exception when others then
      -- A census that dies on one bad row tells the operator nothing about the other 200.
      v_reason := 'census_error: ' || sqlerrm;
    end;
    if v_reason is not null then
      binding_id := b.id; client_id := b.client_id; counterparty_id := b.counterparty_id;
      counterparty_name := b.name; signed_at := b.signed_at; would_fail := v_reason;
      return next;
    end if;
  end loop;
end $fn$;
comment on function clara.binding_identity_review() is
  '裁-18b PR-1 (gate ruling O1): a READ-ONLY census of LIVE vendor identity bindings whose corpus '
  'would NOT pass the identity walls this PR adds -- an ambiguous name family, a non-distinct '
  'corpus, no elapsed observation, or an unproven printed identifier. It REVOKES NOTHING. The '
  'walls sit above the byte-frozen derivation and therefore guard new proposals only; a binding '
  'signed before them was signed against the walls that existed then, and revoking it unattended '
  'would be a migration overruling a human signature. Acting on a row is an admin''s call through '
  'the existing revoke door. Admin floor, firm-scoped. Frontend home: the admin / vendor-bindings '
  'panel, as a review list.';
revoke all on function clara.binding_identity_review() from public;
grant execute on function clara.binding_identity_review() to clara_authenticated;

-- =====================================================================================
-- SS10c -- clara.reset_binding_decline: the named human door out of a decline (ruling (b))
-- =====================================================================================
-- THE DECLINE VERB SPECIFICATION (gate M7 -- annex A never carried one, so it is written here,
-- in the file that builds it, rather than left implicit):
--   clara.decline_vendor_identity_binding(p_binding uuid, p_reason text, p_op_key text) -> jsonb
--     floor        ADMIN (_human_ctx(role_rank('admin'))) -- the SIGNER's floor, because
--                  declining is that same decision said the other way.
--     reason       REQUIRED, non-blank; refused CLR36 decline_reason_required otherwise.
--     transition   'proposed' -> 'declined' ONLY; any other source status refuses CLR36
--                  binding_not_proposed. Terminal: a declined row cannot be declined twice.
--     durability   stamps declined_by / declined_at / decline_reason, CHECK-paired by
--                  ck_vib_declined so the status and the stamp cannot disagree.
--     audit        one clara.audit_log row (fn='decline_vendor_identity_binding') AND one
--                  clara.domain_events row (event_type='kb_binding.declined', registered by
--                  this file in SS3a).
--     idempotency  _reserve_op / _finish_op over (binding_id, reason), like every other door.
--     effect       SUPPRESSES the pair in BOTH proposal writers and in the eligibility read,
--                  via clara._binding_suppression -- not merely a hint to Clara (gate B4).
--     way out      clara.reset_binding_decline, below: the SAME admin floor, its own reason,
--                  its own audit + kb_binding.decline_reset event. Without it a single "no"
--                  would mean "never, by anyone, forever".
-- Suppression is PERMANENT until a human explicitly lifts it. Without this door "no" would mean
-- "never, by anyone, forever" -- a product that cannot correct its own refusal. Admin floor (the
-- same rank that declined), reason required, audited and evented. It does NOT re-propose: it
-- clears the block and leaves the next proposal to whoever wants to make it.
create function clara.reset_binding_decline(
    p_binding uuid, p_reason text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; b record; v_reason text; v_pair record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_binding is null then
    raise exception 'binding is required' using errcode = 'CLR10';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a reset reason is required' using errcode = 'CLR36',
      detail = '{"reason":"reset_reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'reset_binding_decline', p_op_key,
    clara._hash(jsonb_build_object('binding_id', p_binding, 'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- H6 / C-1: THE ONE ORDER (SS5b). Pair read unlocked, key, then the row for update.
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
  if b.status not in ('declined','revoked') then
    raise exception 'binding_not_suppressing' using errcode = 'CLR36';
  end if;
  -- M-11 (2026-08-30, FAIL-CLOSED PENDING AN OWNER RULING): THIS DOOR RE-OPENS A DECLINE, NOT A
  -- REVOCATION. Both suppress, and this door lifted both -- but they are not the same act. A
  -- DECLINE is "I looked at this card and said no"; a REVOCATION is "I trusted this binding,
  -- watched it post real entries, and took the authority away". Letting the second be undone by
  -- the same reason-and-a-click as the first, after which Clara may propose the pair again on her
  -- very next filing turn, is a relaxation nobody ruled. The owner question -- what ceremony
  -- SHOULD lift a revocation -- is batched; until it is answered this refuses, because the
  -- fail-closed direction on a wall a human deliberately raised is to leave it standing. A
  -- revoked pair therefore stays suppressed, visibly, with a typed word a UI can explain.
  if b.status = 'revoked' then
    raise exception 'binding_revoked_reset_requires_ruling' using errcode = 'CLR36',
      detail = '{"reason":"binding_revoked_reset_requires_ruling","class":"loop_brake"}';
  end if;

  -- The declined row becomes 'expired' rather than being deleted or re-opened: the decline is
  -- audit history and stays readable, and 'expired' is the estate's existing terminal status
  -- that no wall keys on. The decline STAMPS clear in the same statement because ck_vib_declined
  -- pairs declined_at with status='declined' -- leaving the stamp on an 'expired' row violates
  -- its own CHECK (caught on the rig, not reasoned about). `declined_by` is deliberately LEFT on
  -- the row: it is not CHECK-paired to the status, and who said no is history worth keeping.
  -- The revoke stamps are NOT touched any more -- a revoked row cannot reach this line.
  update clara.vendor_identity_bindings
     set status = 'expired',
         declined_at = null, decline_reason = null
   where id = p_binding;

  -- M-11, second half: THE RECEIPT CARRIES EVERY COLUMN THIS DOOR CLEARED. An audit line that
  -- names some of what it erased and not the rest is not a receipt, it is a summary -- and the
  -- reason a human refused is exactly the thing a later reader will want back.
  perform clara._audit(c.firm, c.actor, null, null,
    'reset_binding_decline', null,
    jsonb_build_object('binding_id', p_binding, 'client_id', b.client_id,
      'counterparty_id', b.counterparty_id, 'reason', v_reason,
      'declined_by', b.declined_by, 'declined_at', b.declined_at,
      'decline_reason', b.decline_reason, 'prior_status', b.status, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'kb_binding.decline_reset', b.client_id, c.actor,
    null, null, null, null, null,
    jsonb_build_object('binding_id', p_binding, 'counterparty_id', b.counterparty_id));
  return clara._finish_op(c.firm, 'reset_binding_decline', p_op_key,
    jsonb_build_object('binding_id', p_binding, 'status', 'expired'));
end $fn$;
comment on function clara.reset_binding_decline(uuid,text,text) is
  '裁-18b PR-1 (conductor ruling (b), 2026-08-29): the NAMED human door out of a DECLINE. A '
  'decline suppresses BOTH proposal writers permanently -- so without this door a single "no" '
  'would mean "never, by anyone, forever", and a product that cannot correct its own refusal is '
  'a defect. Admin floor (the rank that declined), reason required, audited and evented. Moves '
  'the row to ''expired'' rather than deleting it, so the decline stays readable as history. It '
  'does NOT re-propose. M-11 (2026-08-30): it also does NOT lift a REVOCATION -- a human who '
  'watched a binding work and took the authority away made a stronger statement than one who '
  'refused a card, and undoing it with the same click was a relaxation nobody ruled. A revoked '
  'row refuses binding_revoked_reset_requires_ruling until the owner names the ceremony. '
  'Frontend home: the admin / vendor-bindings panel, on a declined row.';

reset role;

-- =====================================================================================
-- SS11 -- ACL + THE ALLOWLIST (G1 arm A's complete delta: 4 rows, 3 grants, 0 new roles)
-- =====================================================================================
revoke all on function clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text) from public;
grant execute on function clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)
  to clara_wake_filing, clara_wake_interactive;

revoke all on function clara.wake_list_binding_candidates(uuid) from public;
grant execute on function clara.wake_list_binding_candidates(uuid)
  to clara_wake_filing, clara_wake_interactive;

revoke all on function clara.decline_vendor_identity_binding(uuid,text,text) from public;
grant execute on function clara.decline_vendor_identity_binding(uuid,text,text) to clara_authenticated;

revoke all on function clara.reset_binding_decline(uuid,text,text) from public;
grant execute on function clara.reset_binding_decline(uuid,text,text) to clara_authenticated;

-- DROP destroys the ACL, so the signer's clara_authenticated grant is re-made here. The tail
-- proves it BY READING has_function_privilege, never by the presence of this line.
revoke all on function clara.sign_vendor_identity_binding(uuid,text,text) from public;
grant execute on function clara.sign_vendor_identity_binding(uuid,text,text) to clara_authenticated;

insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('filing',     'wake_propose_vendor_identity_binding'),
  ('interactive','wake_propose_vendor_identity_binding'),
  ('filing',     'wake_list_binding_candidates'),
  ('interactive','wake_list_binding_candidates');

-- =====================================================================================
-- SS12 -- TAIL SELF-PROOF. Raises on failure; every claim is RE-READ from the live catalog.
-- =====================================================================================
do $bp1_tail$
declare v_bad text; v_n int; v_def text; v_census record; v_constraint text; v_sha text; v_idx record; v_src text; v_stripped text;
begin
  -- (1) THE D1 CLAIM, PROVEN AS A CENSUS: each of the five new function NAMES resolves at exactly
  --     one pg_proc row -- no overload was shadowed into existence, and nothing was replaced.
  select string_agg(format('%s x%s', t.n, coalesce(k.c,0)), ', ' order by t.n) into v_bad
    from (values ('_derive_vendor_binding_basis'),('_propose_vendor_binding_agent_core'),
                 ('wake_propose_vendor_identity_binding'),('wake_list_binding_candidates'),
                 ('decline_vendor_identity_binding'),('reset_binding_decline'),
                 ('_binding_extra_blocker'),('eligible_binding_signer_count'),
                 ('_binding_suppression'),('_expire_stale_proposals'),
                 ('binding_identity_review'),('_binding_lock_pair'),
                 ('_binding_hard_id_norm'),('_binding_doc_fingerprint'),
                 ('_tf_agent_receipt_surface_conforms'),
                 ('sign_vendor_identity_binding')) t(n)
    left join lateral (select count(*)::int c from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
                        where n2.nspname = 'clara' and p.proname = t.n) k on true
   where coalesce(k.c,0) <> 1;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: new function(s) do not resolve at exactly one pg_proc row: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (2) THE D1 INVENTORY IS EXACTLY THREE, PROVEN BY RE-PIN: every body OTHER than the three this
  --     file deliberately replaces is BYTE-IDENTICAL to its SS1 prestate stash. This is the cell
  --     that makes "these sixteen were not touched" a measurement rather than a claim -- and it
  --     is what leaves PR-3 an undisturbed _approve_entry_core pre-image to pin. The three that
  --     DID move are proven separately: (2b) re-substitutes propose_vendor_identity_binding's
  --     splices back out, (2c) proves the freeze recut both kept its old guard and gained the new
  --     one, and (8b) proves the signer's old 2-arg overload is gone.
  select string_agg(format('%s (was %s, now %s)', pre.k, left(pre.v,12), left(now.sha,12)), '; ' order by pre.k)
    into v_bad
    from _bp1_pre pre
    join lateral (select encode(sha256(convert_to(
           (select p.prosrc from pg_proc p where p.oid = pre.k::regprocedure), 'UTF8')), 'hex') as sha) now on true
   where pre.k not in ('foreign_objs','event_types_total','taxonomy_versions','propose.prosrc','sign.prosrc','freeze.prosrc',
                       'clara.propose_vendor_identity_binding(jsonb,text)',
                       'clara.sign_vendor_identity_binding(uuid,text)','clara._tf_vendor_identity_binding_update()')
     and now.sha is distinct from pre.v;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a DO-NOT-TOUCH body CHANGED -- the D1 inventory is not empty: %', v_bad
      using errcode = 'CLR10';
  end if;
  if (select count(*) from _bp1_pre where k not in ('foreign_objs','event_types_total','taxonomy_versions','propose.prosrc','sign.prosrc','freeze.prosrc',
        'clara.propose_vendor_identity_binding(jsonb,text)',
        'clara.sign_vendor_identity_binding(uuid,text)','clara._tf_vendor_identity_binding_update()')) <> 16 then
    raise exception 'binding proposal pr-1 tail: the re-pin covered % bodies, expected 16 (19 stashed, minus the THREE bodies this file deliberately replaces)',
      (select count(*) from _bp1_pre where k not in ('foreign_objs','event_types_total','taxonomy_versions','propose.prosrc','sign.prosrc','freeze.prosrc',
        'clara.propose_vendor_identity_binding(jsonb,text)',
        'clara.sign_vendor_identity_binding(uuid,text)','clara._tf_vendor_identity_binding_update()')) using errcode = 'CLR10';
  end if;

  -- (2b) D1 BODY 1 of 2 -- THE SURGICAL DELTA, proven by RE-SUBSTITUTION (0144/0147's own
  --      discipline, and the only thing that turns "three splices and nothing else" into a
  --      measurement). Strip EXACTLY the three blocks this file spliced into
  --      clara.propose_vendor_identity_binding; what remains must be the SS1 prestate body
  --      BYTE-FOR-BYTE. A fourth change anywhere in that 3.3 KB body fails the migration here
  --      rather than shipping unnoticed under a comment that says it did not happen.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure;
  if v_src is null then
    raise exception 'binding proposal pr-1 tail: propose_vendor_identity_binding is GONE' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex')
     = (select v from _bp1_pre where k = 'clara.propose_vendor_identity_binding(jsonb,text)') then
    raise exception 'binding proposal pr-1 tail: propose_vendor_identity_binding is UNCHANGED -- the decline suppression ruling (b) did not land'
      using errcode = 'CLR10';
  end if;
  v_stripped := v_src;
  v_stripped := replace(v_stripped, $blk$
  v_blocker text; v_suppressed text;$blk$, '');
  v_stripped := replace(v_stripped, $blk$
  perform clara._binding_lock_pair(v_client,v_counterparty);
  perform clara._expire_stale_proposals(c.firm,v_client,v_counterparty);
  v_suppressed:=clara._binding_suppression(c.firm,v_client,v_counterparty);
  if v_suppressed is not null then
    raise exception 'binding_%', v_suppressed using errcode='CLR36',
      detail=jsonb_build_object('reason','binding_'||v_suppressed,'class','loop_brake')::text;
  end if;$blk$, '');
  v_stripped := replace(v_stripped, $blk$
  v_blocker:=clara._binding_extra_blocker(c.firm,v_client,
    (v_derived->>'counterparty_id')::uuid, v_derived,
    clara._derive_vendor_binding_basis(c.firm,v_client,
      (v_derived->>'counterparty_id')::uuid));
  if v_blocker is not null then
    raise exception '%', v_blocker using errcode='CLR36',
      detail=jsonb_build_object('reason',v_blocker,'class','identity')::text;
  end if;$blk$, '');
  if v_stripped <> (select v from _bp1_pre where k = 'propose.prosrc') then
    raise exception 'binding proposal pr-1 tail: stripping the THREE spliced blocks from the new propose_vendor_identity_binding does NOT reproduce the prestate body byte-for-byte -- this file changed something beyond the three ruled splices (stripped length %, prestate length %)',
      length(v_stripped), length((select v from _bp1_pre where k = 'propose.prosrc'))
      using errcode = 'CLR10';
  end if;
  -- ...and every PRIOR wall string survives, read in CODE. A re-substitution proof shows nothing
  -- ELSE changed; these show the walls that were already there are still there.
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('binding_proposal_malformed'),('client not in your firm'),
                 ('binding_conflict'),('_derive_vendor_binding_proposal'),
                 ('vendor_identity_binding_evidence'),('kb_binding.proposed')) t(n)
   where position(t.n in v_src) = 0;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: propose_vendor_identity_binding lost prior wall string(s): %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (2c) D1 BODY 3 of 3 -- THE FREEZE RECUT (S-1). It must have MOVED, it must still carry
  --      0028's own five-field content freeze verbatim, and it must now also carry the
  --      maker/checker principal freeze. Proven in CODE on the live prosrc, comment-stripped, so
  --      a recut that kept the words in a comment and dropped them from the branch fails here.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._tf_vendor_identity_binding_update()'::regprocedure;
  if v_src is null then
    raise exception 'binding proposal pr-1 tail: _tf_vendor_identity_binding_update is GONE' using errcode = 'CLR10';
  end if;
  if v_src = (select v from _bp1_pre where k = 'freeze.prosrc') then
    raise exception 'binding proposal pr-1 tail: _tf_vendor_identity_binding_update is UNCHANGED -- S-1''s principal freeze did not land'
      using errcode = 'CLR10';
  end if;
  v_stripped := regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('new.f1_vendor_name_norm is distinct from old.f1_vendor_name_norm'),
                 ('new.f2_invoice_prefix is distinct from old.f2_invoice_prefix'),
                 ('new.registration_at_signing is distinct from old.registration_at_signing'),
                 ('new.content_hash is distinct from old.content_hash'),
                 ('new.expires_at is distinct from old.expires_at'),
                 ('vendor binding content is frozen'),
                 -- ...and the NINE the recut adds, each named individually: a list is not a
                 -- measurement unless every member of it is read.
                 ('new.created_by is distinct from old.created_by'),
                 ('new.directed_by is distinct from old.directed_by'),
                 ('new.proposed_by_agent is distinct from old.proposed_by_agent'),
                 ('new.signed_by is distinct from old.signed_by'),
                 ('new.signed_at is distinct from old.signed_at'),
                 ('new.self_approved is distinct from old.self_approved'),
                 ('new.self_approval_reason is distinct from old.self_approval_reason'),
                 ('new.signer_count_at_signing is distinct from old.signer_count_at_signing'),
                 ('new.signer_roster_epoch is distinct from old.signer_roster_epoch'),
                 ('vendor binding signature principal is frozen')) t(n)
   where position(t.n in v_stripped) = 0;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: the recut freeze body is missing guard term(s): %', v_bad
      using errcode = 'CLR10';
  end if;
  -- The trigger still points at it, and it is still the ONLY non-internal update trigger.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'clara.vendor_identity_bindings'::regclass
                    and t.tgname = 't_vib_frozen' and not t.tgisinternal
                    and t.tgfoid = 'clara._tf_vendor_identity_binding_update()'::regprocedure) then
    raise exception 'binding proposal pr-1 tail: t_vib_frozen no longer executes the recut freeze body'
      using errcode = 'CLR10';
  end if;
  -- The two that carry the design, re-pinned against their literals as well as against the stash
  -- (a stash that was itself wrong would compare equal to itself).
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._derive_vendor_binding_proposal(uuid,uuid,uuid)'::regprocedure;
  if v_sha <> 'de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c' then
    raise exception 'binding proposal pr-1 tail: _derive_vendor_binding_proposal drifted from de0f5807... (got %)', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._coding_lane_core(uuid,uuid)'::regprocedure;
  if v_sha <> '721a6704e3284679103537bdda56bf741422041e16dda0f4654394f1d9506fda' then
    raise exception 'binding proposal pr-1 tail: _coding_lane_core drifted from 721a6704... -- G3 says it is untouched (got %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- (3) G4's two registry widenings, exercised in BOTH DIRECTIONS -- REAL INSERT probes against
  --     the LIVE constraints, never a regex literal compared against itself (0142's F7 round-2
  --     discipline: asking whether 'pb_binding' ~ '<pattern typed here>' is a fact about the
  --     STRING TYPED HERE, not about what the database enforces). ADMISSION of 'pb_binding' is
  --     already proven for real by SS3's own INSERT. These prove REFUSAL, each isolating ONE
  --     column by making every other column lawful and unique, and each confirming the refusal
  --     came from ITS NAMED constraint via get stacked diagnostics.
  -- PROBE 1, THE PAIRING (MED-9), fully isolating: BOTH values are individually lawful under
  --   their own regexes, so ck_agent_receipt_surfaces_shim_matches_item is the ONLY constraint
  --   that can refuse this row. Without it the register could point pb_binding at another
  --   member's shim and the nine-row census would still read green.
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('pb_probea', 'probe_kind_a', '_agent_receipt_src_pb_probeb', 'probe_source_a');
    raise exception 'binding proposal pr-1 tail: a MISMATCHED item/shim pair was WRONGLY ADMITTED -- the register can point a member at another member''s shim'
      using errcode = 'CLR10';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint is distinct from 'ck_agent_receipt_surfaces_shim_matches_item' then
      raise exception 'binding proposal pr-1 tail: the pairing probe was refused by % instead of ck_agent_receipt_surfaces_shim_matches_item -- it does not isolate what it claims to', v_constraint
        using errcode = 'CLR10';
    end if;
  end;
  -- PROBE 2, THE WIDENED REGEXES. Isolation is now STRUCTURALLY IMPOSSIBLE and that is stated
  --   rather than faked: the pairing CHECK above forces shim_relname = '_agent_receipt_src_' ||
  --   item, and the two regexes carry the SAME alternation, so any item that fails item_check
  --   produces the only shim the pairing admits -- which fails shim_relname_check too. An
  --   earlier draft asserted one exact constraint name here and would have been asserting an
  --   unspecified evaluation order. So this probe asserts refusal by one of the TWO named regex
  --   constraints, and never by anything else.
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('pb_Probe', 'probe_kind_b', '_agent_receipt_src_pb_Probe', 'probe_source_b');
    raise exception 'binding proposal pr-1 tail: a garbage item/shim (uppercase) was WRONGLY ADMITTED by the live regexes'
      using errcode = 'CLR10';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint not in ('agent_receipt_surfaces_item_check','agent_receipt_surfaces_shim_relname_check') then
      raise exception 'binding proposal pr-1 tail: the regex probe was refused by %, which is neither widened regex', v_constraint
        using errcode = 'CLR10';
    end if;
  end;
  -- The f_a arm SURVIVED the widening -- the direction a naive rewrite would silently break, and
  -- the one an "is pb_binding admitted?" probe can never see. Proven by a REAL INSERT that must
  -- be ADMITTED. The row is then unwound by raising a private sentinel out of the sub-block, so
  -- the implicit savepoint rolls the INSERT back: clara.agent_receipt_surfaces is APPEND-ONLY
  -- (measured the hard way on this file's own rig -- a DELETE here is refused by the guard), so
  -- a savepoint rollback is the only lawful way to undo a probe row.
  begin
    -- The shim has to EXIST now (L-14's conformance trigger reads the relation, not its name), so
    -- the probe builds a real, contract-shaped view first. Both the view and the row unwind on
    -- the savepoint rollback below -- DDL is transactional, which is what makes this honest.
    execute 'create view clara._agent_receipt_src_f_a42 as
               select * from clara._agent_receipt_src_pb_binding where false';
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('f_a42', 'probe_kind_c', '_agent_receipt_src_f_a42', 'probe_source_c');
    raise exception 'bp1_probe_f_a_admitted' using errcode = 'CLR99';
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      raise exception 'binding proposal pr-1 tail: the widened %s REFUSED a lawful f_a member -- the pre-existing f_a family was BROKEN by the pb_ widening',
        coalesce(v_constraint,'(unnamed constraint)') using errcode = 'CLR10';
    when sqlstate 'CLR99' then
      if sqlerrm <> 'bp1_probe_f_a_admitted' then raise; end if;
  end;
  -- ...and the probe row really is gone, so the count cell below is not measuring the probe.
  if exists (select 1 from clara.agent_receipt_surfaces where item = 'f_a42') then
    raise exception 'binding proposal pr-1 tail: the f_a42 admission probe row survived its savepoint rollback'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara._agent_receipt_src_f_a42') is not null then
    raise exception 'binding proposal pr-1 tail: the f_a42 probe VIEW survived its savepoint rollback'
      using errcode = 'CLR10';
  end if;
  -- PROBE 4 (L-14), THE ONE THE REGEXES CANNOT DO: an item and shim that are both perfectly
  -- spelled and perfectly paired, naming a relation that does not exist. clara.agent_receipt_
  -- surfaces is APPEND-ONLY, so such a row would be PERMANENT and agent_receipt_source_census()
  -- would report shim_exists=false for it forever, with no lawful way back. Refused by the
  -- conformance trigger, which reads the RELATION rather than its spelling (review law 3).
  begin
    insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
      values ('pb_ghost', 'probe_kind_d', '_agent_receipt_src_pb_ghost', 'probe_source_d');
    raise exception 'binding proposal pr-1 tail: a registry row naming a NONEXISTENT shim was ADMITTED -- append-only, so it could never have been taken back out'
      using errcode = 'CLR10';
  exception when sqlstate 'CLR10' then
    if sqlerrm not like 'receipt surface clara.% does not exist' then raise; end if;
  end;
  -- PROBE 5 (M9), THE FIVE-SHAPE TOKEN MATRIX, driven against the LIVE constraints rather than
  -- against a pattern typed here. `pb_binding_` is the shape the first cut ADMITTED, and it is
  -- the reason the grammar was tightened at all -- so it is the discriminating member.
  -- (f_a77b / f_a99z rather than the review's f_a7b: f_a7b is a REGISTERED member, so inserting
  -- it again would answer with a primary-key violation about identity, not the grammar. Same
  -- shape, free name -- the fixture becoming able to measure what it names.)
  for v_census in select * from (values
      ('pb_',          false), ('pb_binding_', false), ('pb_Binding', false),
      ('f_a77b',       true),  ('f_a99z',      true)) t(item, admitted)
  loop
    declare v_admitted boolean := true;
    begin
      begin
        insert into clara.agent_receipt_surfaces(item, receipt_kind, shim_relname, expected_source)
          values (v_census.item, 'probe_kind_m', '_agent_receipt_src_' || v_census.item, 'probe_source_m');
        -- It got past the CHECKs; unwind it (and never leave it behind) by raising out.
        raise exception 'bp1_probe_matrix' using errcode = 'CLR99';
      exception
        when check_violation then v_admitted := false;
        when sqlstate 'CLR99' then if sqlerrm <> 'bp1_probe_matrix' then raise; end if;
        when sqlstate 'CLR10' then
          -- refused by the conformance trigger, not by the grammar: the grammar ADMITTED it.
          if sqlerrm not like 'receipt surface clara.% does not exist' then raise; end if;
      end;
      if v_admitted is distinct from v_census.admitted then
        raise exception 'binding proposal pr-1 tail: the item grammar answered % for item %, expected %',
          v_admitted, v_census.item, v_census.admitted using errcode = 'CLR10';
      end if;
    end;
  end loop;
  if exists (select 1 from clara.agent_receipt_surfaces
              where item in ('pb_','pb_binding_','pb_Binding','f_a77b','f_a99z','pb_ghost')) then
    raise exception 'binding proposal pr-1 tail: a token-matrix probe row survived its savepoint rollback'
      using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_item_check';
  if v_def is distinct from 'CHECK ((item ~ ''^(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9]*(_[a-z0-9]+)*)$''::text))' then
    raise exception 'binding proposal pr-1 tail: agent_receipt_surfaces_item_check is not the widened text (got: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.agent_receipt_surfaces'::regclass and conname = 'agent_receipt_surfaces_shim_relname_check';
  if v_def is distinct from 'CHECK ((shim_relname ~ ''^_agent_receipt_src_(f_a[0-9]+[a-z]?|pb_[a-z][a-z0-9]*(_[a-z0-9]+)*)$''::text))' then
    raise exception 'binding proposal pr-1 tail: agent_receipt_surfaces_shim_relname_check is not the widened text (got: %)',
      coalesce(v_def, '(absent)') using errcode = 'CLR10';
  end if;

  -- (4) The registry now holds 9 rows; pb_binding conforms; the census sees 9; nothing is dark;
  --     agent_receipts_visible still carries the 19-column contract in order.
  if (select count(*) from clara.agent_receipt_surfaces) <> 9 then
    raise exception 'binding proposal pr-1 tail: agent_receipt_surfaces holds % row(s), expected 9',
      (select count(*) from clara.agent_receipt_surfaces) using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.agent_receipt_surfaces where item = 'pb_binding'
      and receipt_kind = 'binding_agent' and shim_relname = '_agent_receipt_src_pb_binding'
      and expected_source = 'binding_agent_receipts') then
    raise exception 'binding proposal pr-1 tail: the pb_binding registry row is missing or wrong-shaped' using errcode = 'CLR10';
  end if;
  perform clara._assert_receipt_surface_conforms('_agent_receipt_src_pb_binding');
  select * into v_census from clara.agent_receipt_source_census() where item = 'pb_binding';
  if v_census.item is null or not v_census.shim_exists or not v_census.wired or not v_census.conforms
     or v_census.dark_rows <> 0 or v_census.column_count <> 19 then
    raise exception 'binding proposal pr-1 tail: the pb_binding census row is not shim_exists+wired+conforms+19-col+zero-dark (got %)',
      to_jsonb(v_census) using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.agent_receipt_source_census()) <> 9 then
    raise exception 'binding proposal pr-1 tail: the receipt-source census returned % row(s), expected 9',
      (select count(*) from clara.agent_receipt_source_census()) using errcode = 'CLR10';
  end if;
  select string_agg(format('#%s %s %s', ct.ordinal, ct.column_name, ct.data_type), '; ' order by ct.ordinal)
    into v_bad
    from clara.agent_receipt_contract ct
    left join pg_attribute a
      on a.attrelid = 'clara.agent_receipts_visible'::regclass
     and a.attnum = ct.ordinal and not a.attisdropped
   where a.attname is distinct from ct.column_name
      or format_type(a.atttypid, a.atttypmod) is distinct from ct.data_type;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: agent_receipts_visible no longer carries the 19-column contract: %', v_bad
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s/%s x%s', d.receipt_kind, coalesce(d.scope,'(null)'), d.dark_rows), ', ')
    into v_bad from clara.agent_receipt_dark_rows() d;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: receipt rows visible to NOBODY after the widening: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (5) binding_agent_receipts: RLS enabled+forced, owner-only, zero non-owner grants, zero
  --     app-role DML, and the append-only trigger PAIR actually attached (a policy without the
  --     triggers is a table an owner-context bug can still rewrite).
  if not exists (select 1 from pg_class c where c.oid = 'clara.binding_agent_receipts'::regclass
      and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'binding proposal pr-1 tail: binding_agent_receipts is not RLS-enabled+forced' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants g
   where g.table_schema = 'clara' and g.table_name = 'binding_agent_receipts' and g.grantee <> 'clara_fn_owner';
  if v_n <> 0 then
    raise exception 'binding proposal pr-1 tail: binding_agent_receipts holds % non-owner table grant(s), expected 0', v_n
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s:%s', p.priv, r.rolname), ', ') into v_bad
    from (values ('insert'),('update'),('delete')) p(priv)
    cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                       ('clara_wake_proactive'),('clara_wake_filing'),('clara_wake_bank'),
                       ('clara_freeform_ro'),('clara_runtime')) r(rolname)
   where has_table_privilege(r.rolname, 'clara.binding_agent_receipts', p.priv);
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: an app role holds DML on binding_agent_receipts: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger t
   where t.tgrelid = 'clara.binding_agent_receipts'::regclass and not t.tgisinternal
     and t.tgname in ('t_binding_agent_receipts_append_only','t_binding_agent_receipts_no_truncate');
  if v_n <> 2 then
    raise exception 'binding proposal pr-1 tail: binding_agent_receipts carries % of its 2 append-only triggers', v_n
      using errcode = 'CLR10';
  end if;

  -- (6) The TWELVE new columns, by type and nullability, plus the new CHECKs and the FK.
  select string_agg(format('%s(%s,%s)', t.n, coalesce(k.typ,'(absent)'), coalesce(k.nn::text,'?')), ', ' order by t.n)
    into v_bad
    from (values ('proposed_by_agent','boolean',true),('proposer_model','text',false),
                 ('proposal_receipt_id','uuid',false),('declined_by','uuid',false),
                 ('declined_at','timestamp with time zone',false),('decline_reason','text',false),
                 ('directed_by','uuid',false),('effective_proposer','uuid',false),
                 ('self_approved','boolean',true),('self_approval_reason','text',false),
                 ('signer_count_at_signing','integer',false),
                 ('signer_roster_epoch','timestamp with time zone',false)) t(n,ty,req)
    left join lateral (select format_type(a.atttypid,a.atttypmod) typ, a.attnotnull nn
                         from pg_attribute a
                        where a.attrelid = 'clara.vendor_identity_bindings'::regclass
                          and a.attnum > 0 and not a.attisdropped and a.attname = t.n) k on true
   where k.typ is distinct from t.ty or k.nn is distinct from t.req;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: new vendor_identity_bindings column(s) wrong-shaped: %', v_bad
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('ck_vib_proposed_by_agent_honest'),('ck_vib_proposer_model_honest'),
                 ('ck_vib_proposal_receipt_honest'),('ck_vib_declined'),
                 ('ck_vib_decline_reason_honest'),('ck_vib_directed_by_honest'),
                 ('ck_vib_self_approval_pair'),('ck_vib_self_approval_signed'),
                 ('ck_vib_signer_count_pair'),('ck_vib_signer_count_signed'),
                 ('fk_vib_proposal_receipt')) t(n)
   where not exists (select 1 from pg_constraint
                      where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = t.n);
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: new constraint(s) missing on vendor_identity_bindings: %', v_bad
      using errcode = 'CLR10';
  end if;
  -- The honesty CHECK is BIDIRECTIONAL in text -- an equality, never a one-way implication. Read
  -- from the catalog, so a later hand-edit that weakens it to `or` cannot pass this cell.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.vendor_identity_bindings'::regclass and conname = 'ck_vib_proposed_by_agent_honest';
  if v_def is distinct from 'CHECK ((proposed_by_agent = (created_by = clara.agent_user_id())))' then
    raise exception 'binding proposal pr-1 tail: ck_vib_proposed_by_agent_honest is not the bidirectional equality (live: %)',
      coalesce(v_def,'(absent)') using errcode = 'CLR10';
  end if;
  -- vendor_identity_bindings is now 17 + 12 = 29 columns, and nothing else moved. (N-7: this line
  -- used to say "17 + 6 = 23" while the check beside it said 27 -- a comment nobody had re-read.)
  select count(*)::int into v_n from pg_attribute a
   where a.attrelid = 'clara.vendor_identity_bindings'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_n <> 29 then
    raise exception 'binding proposal pr-1 tail: vendor_identity_bindings carries % column(s), expected 17+12=29', v_n
      using errcode = 'CLR10';
  end if;

  -- (7) G8's index, asserted BY PROPERTY from pg_index -- unique, valid, ready, live, exactly
  --     the two key columns (client_id, counterparty_id), and a partial predicate that is
  --     status='proposed'. Never by name alone: a name proves spelling, not behaviour (law 3).
  select i.indisunique, i.indisvalid, i.indisready, i.indislive,
         (select array_agg(a.attname order by k.ord)
            from unnest(i.indkey::smallint[]) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) as cols,
         pg_get_expr(i.indpred, i.indrelid) as pred
    into v_idx
    from pg_index i
   where i.indexrelid = 'clara.uq_vib_one_active_binding'::regclass;
  if v_idx.indisunique is not true or v_idx.indisvalid is not true
     or v_idx.indisready is not true or v_idx.indislive is not true then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_active_binding is not a unique+valid+ready+live index (got %)',
      to_jsonb(v_idx) using errcode = 'CLR10';
  end if;
  if v_idx.cols is distinct from array['client_id','counterparty_id']::name[] then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_active_binding keys are %, expected {client_id,counterparty_id}',
      v_idx.cols using errcode = 'CLR10';
  end if;
  if v_idx.pred is distinct from '(status = ANY (ARRAY[''proposed''::text, ''live''::text]))' then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_active_binding predicate is %, expected status IN (proposed,live) -- a proposed-ONLY predicate loses the propose-vs-sign race',
      coalesce(v_idx.pred,'(none -- NOT PARTIAL, so it would forbid a second binding of ANY status)') using errcode = 'CLR10';
  end if;
  -- uq_vib_one_live is UNMOVED -- the widening added a sibling, it did not recut the original.
  if not exists (select 1 from pg_index i where i.indexrelid = 'clara.uq_vib_one_live'::regclass
                  and i.indisunique and pg_get_expr(i.indpred, i.indrelid) = '(status = ''live''::text)') then
    raise exception 'binding proposal pr-1 tail: uq_vib_one_live is gone or changed' using errcode = 'CLR10';
  end if;

  -- (8) ACL + allowlist. Both wake verbs reachable by BOTH ruled roles and by NOBODY else; the
  --     decline verb clara_authenticated-only and reachable by no wake role; the two ungranted
  --     internals reachable by no app role at all.
  select string_agg(format('%s!%s', t.fn, t.rolname), ', ') into v_bad
    from (values ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_filing'),
                 ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_interactive'),
                 ('clara.wake_list_binding_candidates(uuid)','clara_wake_filing'),
                 ('clara.wake_list_binding_candidates(uuid)','clara_wake_interactive'),
                 ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_authenticated'),
                 ('clara.reset_binding_decline(uuid,text,text)','clara_authenticated'),
                 ('clara.eligible_binding_signer_count(uuid)','clara_authenticated'),
                 ('clara.binding_identity_review()','clara_authenticated'),
                 -- (8b) THE RECUT SIGNER: the DROP destroyed its ACL, so this is the cell that
                 --      proves the re-grant actually happened. Without it a green migration
                 --      would ship a signer no human could call.
                 ('clara.sign_vendor_identity_binding(uuid,text,text)','clara_authenticated')) t(fn, rolname)
   where not has_function_privilege(t.rolname, t.fn, 'EXECUTE');
  -- D1 BODY 2's OWN PROOF: the old 2-arg signer must be GONE. A surviving overload would be
  -- shadow-reachable and would still carry 裁-18a's created_by comparison, so every caller that
  -- passed two arguments would keep signing under the wall 裁-32 just replaced -- the exact
  -- "shadowed door" class 0054's prestate was written to catch. Read by EXACT SIGNATURE.
  if to_regprocedure('clara.sign_vendor_identity_binding(uuid,text)') is not null then
    raise exception 'binding proposal pr-1 tail: the OLD 2-arg sign_vendor_identity_binding still resolves -- it is shadow-reachable and still carries the pre-裁-32 wall'
      using errcode = 'CLR10';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
       where n2.nspname = 'clara' and p.proname = 'sign_vendor_identity_binding') <> 1 then
    raise exception 'binding proposal pr-1 tail: sign_vendor_identity_binding does not resolve at exactly one pg_proc row'
      using errcode = 'CLR10';
  end if;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a required EXECUTE grant is MISSING: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(format('%s=%s', t.fn, t.rolname), ', ') into v_bad
    from (values
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_authenticated'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_agent_ro'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_proactive'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_wake_bank'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_freeform_ro'),
      ('clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)','clara_runtime'),
      ('clara.wake_list_binding_candidates(uuid)','clara_authenticated'),
      ('clara.wake_list_binding_candidates(uuid)','clara_agent_ro'),
      ('clara.wake_list_binding_candidates(uuid)','clara_wake_proactive'),
      ('clara.wake_list_binding_candidates(uuid)','clara_wake_bank'),
      ('clara.wake_list_binding_candidates(uuid)','clara_freeform_ro'),
      ('clara.wake_list_binding_candidates(uuid)','clara_runtime'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_wake_filing'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_wake_interactive'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_agent_ro'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)','clara_runtime'),
      ('clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)','clara_authenticated'),
      ('clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)','clara_wake_filing'),
      ('clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)','clara_wake_interactive'),
      ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)','clara_authenticated'),
      ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)','clara_wake_filing'),
      ('clara._derive_vendor_binding_basis(uuid,uuid,uuid)','clara_wake_interactive'),
      -- the fold round's own internals, ungranted like every other one
      ('clara._binding_lock_pair(uuid,uuid)','clara_authenticated'),
      ('clara._binding_lock_pair(uuid,uuid)','clara_wake_filing'),
      ('clara._binding_lock_pair(uuid,uuid)','clara_wake_interactive'),
      ('clara._binding_doc_fingerprint(uuid)','clara_authenticated'),
      ('clara._binding_doc_fingerprint(uuid)','clara_wake_filing'),
      ('clara._binding_doc_fingerprint(uuid)','clara_wake_interactive'),
      ('clara._binding_hard_id_norm(text)','clara_authenticated'),
      ('clara._binding_hard_id_norm(text)','clara_wake_filing'),
      ('clara._binding_hard_id_norm(text)','clara_wake_interactive')
    ) t(fn, rolname)
   where has_function_privilege(t.rolname, t.fn, 'EXECUTE');
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a door is reachable by a role it must not be: %', v_bad using errcode = 'CLR10';
  end if;
  -- Exactly four new allowlist rows, exactly the ruled four; 88 + 4 = 92 total.
  select string_agg(format('%s/%s x%s', t.k, t.f, coalesce(c.n,0)), ', ' order by t.k, t.f) into v_bad
    from (values ('filing','wake_propose_vendor_identity_binding'),
                 ('interactive','wake_propose_vendor_identity_binding'),
                 ('filing','wake_list_binding_candidates'),
                 ('interactive','wake_list_binding_candidates')) t(k,f)
    left join lateral (select count(*)::int n from clara.wake_fn_allowlist a
                        where a.wake_kind = t.k and a.function_name = t.f) c on true
   where coalesce(c.n,0) <> 1;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: allowlist row(s) not present exactly once: %', v_bad using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist where function_name ilike '%binding%';
  if v_n <> 4 then
    raise exception 'binding proposal pr-1 tail: the allowlist carries % binding row(s), expected exactly the 4 ruled ones', v_n
      using errcode = 'CLR10';
  end if;
  -- The five NOT-admitted kinds carry no row for either verb -- the closed-world half of W2,
  -- proven as an absence over the WHOLE allowlist rather than kind by kind.
  select string_agg(format('%s/%s', a.wake_kind, a.function_name), ', ') into v_bad
    from clara.wake_fn_allowlist a
   where a.function_name in ('wake_propose_vendor_identity_binding','wake_list_binding_candidates')
     and a.wake_kind not in ('filing','interactive');
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: a non-ruled wake kind is allowlisted for a binding verb: %', v_bad
      using errcode = 'CLR10';
  end if;

  -- (9) NO new role, NO wake_credentials CHECK change, NO wake_engine_sources row, NO egress
  --     purpose widening -- the four "this file does not do that" claims, each MEASURED.
  if (select count(*) from pg_roles where rolname like 'clara%') <> 14 then
    raise exception 'binding proposal pr-1 tail: the clara role count moved from 14 to % -- this file mints no role and owes no roles-bootstrap twin',
      (select count(*) from pg_roles where rolname like 'clara%') using errcode = 'CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.wake_credentials'::regclass and conname = 'ck_wake_credentials_kind_0011';
  if v_def is distinct from
     'CHECK ((wake_kind = ANY (ARRAY[''interactive''::text, ''proactive''::text, ''autodraft''::text, ''interactive_client''::text, ''close_prep''::text, ''bank_agent''::text, ''filing''::text])))' then
    raise exception 'binding proposal pr-1 tail: ck_wake_credentials_kind_0011 moved (live: %)', coalesce(v_def,'(absent)')
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.wake_engine_sources) <> 2
     or exists (select 1 from clara.wake_engine_sources where enabled) then
    raise exception 'binding proposal pr-1 tail: wake_engine_sources is not the untouched 2-row, both-disabled world (PR-4''s, not this file''s)'
      using errcode = 'CLR10';
  end if;

  -- (9a) THE TRIGGER CONTRACT (conductor ruling 2026-08-29). The closed world is exactly
  --      {wake_task, wake_credential} -- BOTH directions proven by real INSERT probes against
  --      the live CHECK, and 'chat_turn' proven ABSENT rather than merely not mentioned: it is
  --      the value the estate's other two receipt tables admit, so "we did not copy it" has to
  --      be a measurement, not a claim.
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.binding_agent_receipts'::regclass
     and pg_get_constraintdef(oid) like '%trigger_kind%';
  if v_def is distinct from
     'CHECK ((trigger_kind = ANY (ARRAY[''wake_task''::text, ''wake_credential''::text])))' then
    raise exception 'binding proposal pr-1 tail: the trigger_kind closed world is not {wake_task, wake_credential} (live: %)',
      coalesce(v_def,'(absent)') using errcode = 'CLR10';
  end if;
  --      The body must never write a credential uuid under 'wake_task'. Proven in CODE, on the
  --      live prosrc, comment-stripped -- the two assignments are paired the only honest way.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)'::regprocedure;
  v_src := regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('v_trigger_kind := ''wake_task'';   v_trigger_id := p_task::text;' in v_src) = 0
     or position('v_trigger_kind := ''wake_credential''; v_trigger_id := p_credential::text;' in v_src) = 0 then
    raise exception 'binding proposal pr-1 tail: the trigger_kind/trigger_id pairing is not the honest one in CODE'
      using errcode = 'CLR10';
  end if;
  if (select count(*) from regexp_matches(v_src, 'p_credential::text', 'g')) <> 1 then
    raise exception 'binding proposal pr-1 tail: p_credential::text appears more than once in CODE -- a second use could be writing it under the wrong kind'
      using errcode = 'CLR10';
  end if;

  -- (9b) THE EVENT-TYPE REGISTRY: exactly two new members, both client_scoped, the pre-existing
  --      world untouched -- and, the discriminating half, the gate STILL REFUSES an
  --      unregistered type. Registering two names must not have opened a hole; proven by a REAL
  --      insert probe through the live trigger, rolled back out of its own sub-block (the
  --      append-only guard on clara.domain_events forbids a DELETE, the same lesson §(3)'s f_a42
  --      probe learned on clara.agent_receipt_surfaces).
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('kb_binding.agent_proposed'),('kb_binding.declined'),('kb_binding.decline_reset'),('kb_binding.expired')) t(n)
   where not exists (select 1 from clara.event_types e where e.name = t.n and e.client_scoped);
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: event_types is missing (or not client_scoped): %', v_bad
      using errcode = 'CLR10';
  end if;
  -- THE COUPLING, at the ACTIVE version, with each decision as ruled. A type registered
  -- without its taxonomy row is a half-registration the estate's coverage census refuses -- and
  -- an earlier draft of this file shipped exactly that until the full sweep caught it.
  select string_agg(format('%s->%s', t.n, coalesce(k.d,'(NO TAXONOMY ROW)')), ', ' order by t.n)
    into v_bad
    from (values ('kb_binding.agent_proposed','notification'),
                 ('kb_binding.declined','ignore'),
                 ('kb_binding.decline_reset','ignore'),
                 ('kb_binding.expired','ignore')) t(n, want)
    left join lateral (select tt.decision d from clara.trigger_taxonomy tt
                        join clara.taxonomy_active a on a.version = tt.version
                       where tt.event_type = t.n) k on true
   where k.d is distinct from t.want;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: taxonomy decision missing or wrong at the ACTIVE version: %', v_bad
      using errcode = 'CLR10';
  end if;
  -- …and coverage is WHOLE, over the whole registry, not just this file's four.
  select string_agg(e.name, ', ' order by e.name) into v_bad
    from clara.event_types e
   where not exists (select 1 from clara.trigger_taxonomy t
                      where t.event_type = e.name
                        and t.version = (select version from clara.taxonomy_active));
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: event_type/trigger_taxonomy coverage is INCOMPLETE at the active version: %', v_bad
      using errcode = 'CLR10';
  end if;
  -- NO VERSION FLIP: this file registers additively into the version that was already active.
  if (select count(*) from clara.taxonomy_versions) is distinct from
     (select v::int from _bp1_pre where k = 'taxonomy_versions') then
    raise exception 'binding proposal pr-1 tail: the taxonomy VERSION COUNT moved -- this file registers additively into the ACTIVE version and must never flip it'
      using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.event_types where name like 'kb_binding.%') <> 7 then
    raise exception 'binding proposal pr-1 tail: clara.event_types carries % kb_binding.* member(s), expected 3+4=7',
      (select count(*) from clara.event_types where name like 'kb_binding.%') using errcode = 'CLR10';
  end if;
  if (select count(*)::text from clara.event_types)
     is distinct from ((select v from _bp1_pre where k = 'event_types_total')::int + 4)::text then
    raise exception 'binding proposal pr-1 tail: clara.event_types moved by something other than this file''s 2 rows (was %, now %)',
      (select v from _bp1_pre where k = 'event_types_total'),
      (select count(*)::text from clara.event_types) using errcode = 'CLR10';
  end if;
  begin
    insert into clara.domain_events(firm_id, seq, event_type, client_id, actor, payload)
      values ((select id from clara.firms order by created_at limit 1), -424242,
              'kb_binding.definitely_not_registered', null, null, '{}'::jsonb);
    raise exception 'binding proposal pr-1 tail: an UNREGISTERED event_type was ADMITTED -- registering two names opened a hole in the gate'
      using errcode = 'CLR10';
  exception
    when sqlstate 'CLR10' then
      if sqlerrm not like 'unknown event_type %' then raise; end if;
  end;

  -- (9c) THE ONE LOCK ORDER, PROVEN IN CODE FOR EVERY LIFECYCLE WRITER (H6 / M-9 / C-1(a)).
  --      Two things have to be true of each body and neither is visible from a comment: it takes
  --      the SHARED key (clara._binding_lock_pair, not an inline pg_advisory_xact_lock of its
  --      own), and it takes it BEFORE any row lock. The second is a POSITION comparison on the
  --      comment-stripped prosrc -- the only instrument that can see an ORDER. A body with no
  --      `for update` at all satisfies the order vacuously and is admitted on that basis, which
  --      is stated here rather than hidden: both proposal doors and the sweep are that shape.
  for v_census in select * from (values
      ('clara.propose_vendor_identity_binding(jsonb,text)'),
      ('clara._propose_vendor_binding_agent_core(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,jsonb,text,jsonb,text)'),
      ('clara.sign_vendor_identity_binding(uuid,text,text)'),
      ('clara.decline_vendor_identity_binding(uuid,text,text)'),
      ('clara.reset_binding_decline(uuid,text,text)'),
      ('clara._expire_stale_proposals(uuid,uuid,uuid)')) t(sig)
  loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_census.sig::regprocedure;
    v_stripped := regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    if position('clara._binding_lock_pair(' in v_stripped) = 0 then
      raise exception 'binding proposal pr-1 tail: % does not take the SHARED pair key -- three lock protocols is how the decline race got in', v_census.sig
        using errcode = 'CLR10';
    end if;
    if position('pg_advisory_xact_lock' in v_stripped) <> 0 then
      raise exception 'binding proposal pr-1 tail: % still takes an INLINE advisory lock of its own -- one key means one definition', v_census.sig
        using errcode = 'CLR10';
    end if;
    if position('for update' in v_stripped) <> 0
       and position('clara._binding_lock_pair(' in v_stripped) > position('for update' in v_stripped) then
      raise exception 'binding proposal pr-1 tail: % takes its row lock BEFORE the pair key -- the inverted order the adversarial pass drove to a real 40P01', v_census.sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (9d) C3 -- THE POST-TIME CONTROL GATE IS A CATALOG WITNESS, AND IT IS CURRENTLY REFUSING.
  --      Both halves measured: the signer no longer reads a migration ledger row at all, it reads
  --      the approve path's own body; and that body does not carry the marker, so a binding
  --      CANNOT go live on this frontier. That is the intended shipped state -- PR-3 mints the
  --      marker and the gate opens by itself.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.sign_vendor_identity_binding(uuid,text,text)'::regprocedure;
  v_stripped := regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('0029_vendor_binding_executor' in v_stripped) <> 0 then
    raise exception 'binding proposal pr-1 tail: the signer STILL reads the 0029 ledger row -- that row is append-only and permanently present, so the gate it stood for was permanently true'
      using errcode = 'CLR10';
  end if;
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('binding_post_time_recheck_v1'),('post_time_control_absent'),
                 ('clara._approve_entry_core(jsonb,uuid,uuid,text,text)')) t(n)
   where position(t.n in v_stripped) = 0;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: the signer''s post-time witness is missing term(s): %', v_bad
      using errcode = 'CLR10';
  end if;
  if position('binding_post_time_recheck_v1' in
       (select p.prosrc from pg_proc p
         where p.oid = 'clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)) <> 0 then
    raise exception 'binding proposal pr-1 tail: _approve_entry_core already carries the ratified marker -- this file''s interlock would ship open'
      using errcode = 'CLR10';
  end if;
  --      ...and the signer also re-runs the identity walls and the suppression before going live
  --      (H7 / C-1(b)), read in CODE so a later edit that drops either fails here.
  select string_agg(t.n, ', ' order by t.n) into v_bad
    from (values ('clara._binding_extra_blocker('),('clara._binding_suppression(')) t(n)
   where position(t.n in v_stripped) = 0;
  if v_bad is not null then
    raise exception 'binding proposal pr-1 tail: the signer no longer re-runs %', v_bad using errcode = 'CLR10';
  end if;

  -- (9e) M8 -- THE ELIGIBILITY READ IS GENUINELY READ-ONLY. `stable` is a DECLARATION; this is
  --      the measurement. The body must not call the expiry writer, and it must still be declared
  --      stable (a later lane relaxing it to volatile would be a different, louder decision).
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.wake_list_binding_candidates(uuid)'::regprocedure;
  v_stripped := regexp_replace(regexp_replace(v_src, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('_expire_stale_proposals' in v_stripped) <> 0 then
    raise exception 'binding proposal pr-1 tail: the STABLE eligibility read still calls the VOLATILE expiry writer'
      using errcode = 'CLR10';
  end if;
  if (select p.provolatile from pg_proc p
       where p.oid = 'clara.wake_list_binding_candidates(uuid)'::regprocedure) <> 's' then
    raise exception 'binding proposal pr-1 tail: wake_list_binding_candidates is no longer STABLE'
      using errcode = 'CLR10';
  end if;

  -- (9f) L-14: the conformance trigger is attached, AFTER INSERT, on the registry.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'clara.agent_receipt_surfaces'::regclass and not t.tgisinternal
                    and t.tgname = 't_agent_receipt_surfaces_conforms'
                    and t.tgfoid = 'clara._tf_agent_receipt_surface_conforms()'::regprocedure
                    and (t.tgtype & 2) = 0) then   -- bit 1 clear = AFTER, not BEFORE
    raise exception 'binding proposal pr-1 tail: the receipt-surface conformance trigger is missing or is a BEFORE trigger (which would refuse every insert, this file''s own included)'
      using errcode = 'CLR10';
  end if;

  -- (10) CONSTRAINT 15: the frozen prior build and the Slice-0 parked run are exactly as found.
  if (select coalesce(count(*),0)::text from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
       where n2.nspname in ('workflow','graphile_worker','spike'))
     is distinct from (select v from _bp1_pre where k = 'foreign_objs') then
    raise exception 'binding proposal pr-1 tail: object count in workflow/graphile_worker/spike MOVED' using errcode = 'CLR10';
  end if;

  raise notice 'binding proposal pr-1 tail: OK -- D1 INVENTORY = THREE WRITER BODIES (propose_vendor_identity_binding recut in place, its delta proven by RE-SUBSTITUTION against the byte-exact prestate; sign_vendor_identity_binding DROPped at (uuid,text) and recreated at (uuid,text,text) with the 2-arg overload proven GONE and its ACL re-made; _tf_vendor_identity_binding_update CoR-ed, its five 0028 guard terms surviving verbatim beside nine new maker/checker ones, all read on the comment-stripped live prosrc). The OTHER 16 DO-NOT-TOUCH bodies re-pin BYTE-IDENTICAL to their SS1 prosrc stash (incl. _approve_entry_core, left undisturbed for PR-3''s own pre-image; _derive_vendor_binding_proposal re-pinned against de0f5807... and _coding_lane_core against 721a6704... independently of the stash), and each of the 15 new function NAMES (plus the recut signer) resolves at exactly one pg_proc row under every arity. G4: the registry refused a REAL mismatched-pair probe by ck_agent_receipt_surfaces_shim_matches_item EXACTLY (both halves individually lawful, so nothing else could have refused it), refused a REAL uppercase item/shim probe by one of the two widened regexes (isolation between THEM is structurally impossible once the pairing CHECK exists, and the file says so rather than asserting an evaluation order), and ADMITTED a real f_a42 probe -- the pre-existing f_a family survived the pb_ widening -- with both widened definitions read byte-exact; agent_receipt_surfaces holds 9 rows, pb_binding is shim_exists+wired+conforms+19-col+zero-dark, the census returns 9, agent_receipts_visible''s 19-column contract is unchanged and nothing is dark. binding_agent_receipts: RLS enabled+forced, owner-only, ZERO non-owner grants, ZERO app-role DML across 8 roles, both append-only triggers attached. vendor_identity_bindings: 12 new columns at the right type/nullability (17+12=29 total), 10 new CHECKs + 1 composite DEFERRABLE FK present, ck_vib_proposed_by_agent_honest read from the catalog as a BIDIRECTIONAL EQUALITY, and effective_proposer GENERATED so no writer can set it to disagree with the columns it comes from. G8 + gate B5: uq_vib_one_active_binding asserted BY PROPERTY from pg_index (unique+valid+ready+live, keys {client_id,counterparty_id}, predicate status IN (proposed,live) -- a proposed-ONLY predicate loses the propose-vs-sign transition race), never by name; uq_vib_one_live unmoved. ACL: both wake verbs EXECUTE-able by clara_wake_filing AND clara_wake_interactive and by none of 6 other roles; decline / reset_binding_decline / eligible_binding_signer_count / binding_identity_review and the recut signer are clara_authenticated-only; every internal (_binding_extra_blocker, _binding_suppression, _expire_stale_proposals, _derive_vendor_binding_basis, _propose_vendor_binding_agent_core) is ungranted; exactly 4 allowlist rows, all 4 ruled, and NO non-ruled wake kind names either verb. EVENT-TYPE REGISTRY + TRIGGER TAXONOMY (the FIFTH and SIXTH shared surfaces, neither in annex G-f -- they are a COUPLED PAIR and registering in one alone is the half-registration the estate''s coverage census refuses): exactly 4 new members, all client_scoped, kb_binding.* 3->7, the whole registry moved by exactly +4, each carrying its ruled decision at the ACTIVE taxonomy version (agent_proposed=notification following kb_binding.proposed; declined/decline_reset/expired=ignore following signed/revoked), coverage proven WHOLE over the ENTIRE registry both before and after, and the taxonomy version count UNMOVED (additive registration, never a flip), and an UNREGISTERED type is STILL refused by the live trigger via a real insert probe -- registering two names opened no hole. NO new role (14, unmoved -- no roles-bootstrap twin owed), NO wake_credentials CHECK change, NO wake_engine_sources row (2, both still disabled -- PR-4''s). No table in workflow/graphile_worker/spike touched.';
end
$bp1_tail$;
