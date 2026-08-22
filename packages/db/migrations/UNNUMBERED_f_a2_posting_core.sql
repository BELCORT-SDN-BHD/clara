-- UNNUMBERED_f_a2_posting_core.sql — F-A2 PR-1, part 1 of 3: THE UNGRANTED MACHINERY.
-- =====================================================================================
-- Number claimed at MERGE time (hard constraint 10). Design of record:
-- docs/plan/active/f-a2-agentic-posting-design.md **v6** + its three annexes; the PR-0 gate
-- record is f-a2-pr0-gate-record.md. Contents are Annex B.9 part 1, in v6 form.
--
-- WHAT THIS FILE SHIPS, AND WHAT IT DELIBERATELY DOES NOT. It ships the machinery and grants
-- NOTHING: the post verb's core, the receipt table, the two structural walls, the projected-state
-- predicate, the eighth `_approve_entry_core` body, the draft-core recut, T3's two trigger
-- recuts, the `interactive_client` limb's durable half, and the two event kinds. The GRANTED
-- surface — `clara.wake_post_entry`, its single EXECUTE grant, the allowlist rows and the census
-- that proves them — is part 2 (`UNNUMBERED_f_a2_posting_grants.sql`); the `posted`-outcome chain
-- is part 3. THE RESIDUE BETWEEN THE HALVES IS FAIL-SAFE BY CONSTRUCTION, exactly as 0077/0078's
-- was: a core with no EXECUTE grant and no allowlist row is reachable by NO application role, so
-- a database that stops between the halves has strictly LESS surface than one that applied
-- neither — the absence of part 2 is the absence of the feature, never a half-open door.
--
--   §0  prestate — prosrc SHA pins, the 0040 marker dispositions, the pg_trigger census,
--       every splice anchor counted, and the two "already typed" findings recorded
--   §A  clara.entry_post_receipts (Annex E.1) + append-only + no-truncate + forced RLS
--   §B  clara._tf_assert_agent_post_receipt + t_je_agent_post_receipt (deferred, ARM-0 first)
--   §C  GB-2's projected-state predicate + the supplier floor split (D31)
--   §D  clara._agent_post_entry_core — Tier A, the thirteen Tier-B rungs, Tier C (D4/D6/D7)
--   §E  the EIGHTH clara._approve_entry_core body (breeding excision, ctx identity, the agent
--       arm, the Tier-C detail reasons) — D1
--   §F  clara._draft_entry_core, next body (D35's write stop, N1's draft copies, the
--       direction-family re-cut) — D1
--   §G  T3's two trigger-function recuts (D12) — D1
--   §H  the `interactive_client` limb, GB-3's corrected form (D34) — D1
--   §I  the two new event kinds
--   §J  the tail census
--
-- D1 WRITE-QUIESCE OBLIGATION (packages/db/README.md "Deploy contract"). PostgreSQL runs an
-- in-flight PL/pgSQL call to completion on the body it STARTED with, so a call spanning this
-- migration silently runs the OLD body. This file replaces SEVEN live bodies, and the count is
-- its own list rather than a remembered number: `_approve_entry_core` · `_draft_entry_core` ·
-- `_tf_assert_supplier_bill_shape` · `_tf_assert_sales_invoice_shape` ·
-- `_assert_supplier_bill_shape_at` · `mint_wake_credential` · `wake_open_question`. The SALES
-- FLOOR `_assert_sales_invoice_shape_at` is NOT among them: it is prestate-sha-pinned so a drift
-- is caught, but it is byte-unmoved, and counting a pin as a replacement is how a quiesce
-- inventory starts overstating itself. (The file also CREATES six objects — the receipt table,
-- the ladder, the two extracted predicates, the projection and the receipt trigger function —
-- but a CREATE has no in-flight body to strand, so it is not a D1 term.)
--
-- THE WHOLE-WINDOW INVENTORY, corrected. Parts 2 and 3 ride the SAME window: TEN CoR'd bodies
-- (this file's seven, part 2's none, part 3's `settle_autodraft_task` ×2 overloads +
-- `reconcile_sweep_runs`), one CREATE TABLE, and — on EXISTING live tables, all under ACCESS
-- EXCLUSIVE — FOUR constraint swaps across TWO tables (`clara.wake_credentials`: the kind and
-- client CHECK pairs, here; `clara.sweep_run_items`: `sweep_run_items_outcome_check` and
-- `ck_sweep_run_items_shape`, part 3) PLUS a THIRD table: **`alter table clara.sweep_runs add
-- column posted_count integer not null default 0`** (part 3). That ADD COLUMN is the term the
-- first inventory named nowhere — it is metadata-only on PG 11+, so it is brief, but it still
-- takes ACCESS EXCLUSIVE on a live table and a D1 window that does not list a lock is a window
-- an operator cannot plan. The guard below refuses to apply while a runtime heartbeat is fresh,
-- because a ceremony step that lives only in prose is one somebody skips.
--
-- THE SPLICE DISCIPLINE, AND WHY IT IS NOT TRANSCRIPTION (the 0017:1553 / 0093 idiom). No recut
-- below retypes a live body. Each reads `prosrc` off the LIVE catalog, asserts every anchor
-- occurs EXACTLY ONCE, `replace()`s only at those anchors and `execute`s the result. Everything
-- this file does not name is preserved BY CONSTRUCTION rather than by a careful human copy, and
-- §J re-reads the committed catalog to prove the untouched regions survived. Prestate pins are
-- PROSRC SHA-256, never a marker string: a marker proves a phrase is present, a hash proves the
-- body is the one this file was authored against (0093:62-63). The SHAs below were measured by
-- rig replay at frontier 0102 on 2026-08-22.
--
-- FOUR PLACES WHERE THE DESIGN WAS UNDER-DETERMINED AND THIS FILE MADE A CALL. Each is flagged
-- again at its site and carried into PR-1's review:
--   (1) §C — "make `_assert_supplier_bill_shape_at` a thin delegate passing NULL" needs a WIDER
--       body to delegate TO, or B10 re-runs the prologue with a NULL projection and refuses
--       100% of agent posts again (the GB-2 defect, one level down). The full floor therefore
--       moves ONCE into `clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)` — the
--       estate's own distinct-name idiom for a wider variant (`_assert_supplier_bill_shape` ->
--       `_assert_supplier_bill_shape_at`), never a second copy, because the advance belt's
--       doctrine (0043:3149-3152) forbids one test living in two bodies.
--   (2) §D — the three locks are taken in the DELEGATE'S OWN ORDER (filing FOR SHARE, entry FOR
--       UPDATE, vendor advisory 203005003, client advisory 203005004). §D.7 says "the client
--       advisory immediately after the entry FOR UPDATE"; taken literally that inverts the
--       delegate's vendor-then-client order and opens an ABBA deadlock against every concurrent
--       human approve. For the same reason the filing FOR SHARE precedes the entry FOR UPDATE
--       here, as it does in the delegate, rather than sitting after the revision-token gate
--       where §3.2's Tier-A list prints it. All three locks are still held before B9, which is
--       what GM-7 is about; only the order among them follows the live estate.
--   (5) §D — B7's "amount-bearing evidence" is read as `field_path='invoice.total'`. That is the
--       only field 0009:460-466 can ever tier `verified`, and it is the same field
--       `_corroboration_bound` reads, so B3 and B7 cannot drift; a wider reading (any monetary
--       region) would refuse every draft that cites a tax or subtotal region, which no rung is
--       supposed to do.
--   (3) §E — `(CLR23, registration_conflict)` costs ZERO body edits: `_resolve_counterparty`
--       ALREADY raises it with `detail.reason` on both its arms (measured on the rig). The
--       design's "bare — PR-1 adds it" is false at the bytes, so the pair is listed and nothing
--       is written. `(CLR10, customer_identity_name_only)` is likewise already typed (0062).
--   (4) §F — "widen for the generic kind" needs no DB change: `_draft_entry_core` already admits
--       a NULL `coding_kind` at every gate it owns (the coded-kind preconditions are guarded
--       `p_coding_kind is not null`, and `ck_je_coding_kind` admits NULL). The widening GB-1
--       names is autoDraft_v9's `allowedCodingKindsForDirection`, which is PR-2's.
--
-- The timeout is precautionary; nothing here scans a large relation.
set local statement_timeout = '5min';
-- SEARCH PATH PINNED FOR THE WHOLE FILE. Load-bearing, not cosmetic: §J compares a prestate
-- function census against a post-DDL one, and an unpinned path renders argument types
-- qualified-or-bare depending on the session, which reads as a deletion plus a creation.
set local search_path = clara, pg_temp;

do $fa2_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A2 QUIESCE GUARD: clara.runtime_heartbeats is ABSENT — the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A2 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this file replaces SEVEN live bodies incl. clara._approve_entry_core and clara._draft_entry_core, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$fa2_quiesce$;

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
-- =====================================================================================
create temp table _fa2p1_pre(k text primary key, v text) on commit drop;

do $fa2_pre$
declare
  v_src text; v_n int; v_key text; v_sig text; v_def text;
  v_sha text; v_want text;
  -- (0.1) THE EIGHT BODIES THIS FILE RECUTS, PINNED BY PROSRC SHA-256 AT FRONTIER 0102.
  v_pins text[][] := array[
    ['clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
     '303c27ddd65c0986b3d8aea5acef48eb23c73bde14d1d7ca9cc1a35331b93848'],
    ['clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)',
     'bdae93ca73c3073d60a68aef0733ef8cb1fdcd8f48efaac98741b25472ab060d'],
    ['clara._tf_assert_supplier_bill_shape()',
     'f6284109d6a78bea0daf5a910a2989c08138a779c7b319e83c201e9d0585cfc4'],
    ['clara._tf_assert_sales_invoice_shape()',
     'b85c99f6692456d2fc92c90296cd492f30fb3965e52c96d3764230557e2d7b7d'],
    ['clara._assert_supplier_bill_shape_at(uuid,uuid)',
     'a511d2f9675d2fe1b3491b757d9011e1e8af6784161fe2a80a786903f4e7ff9c'],
    ['clara.mint_wake_credential(text,uuid,uuid,interval,uuid)',
     '4ffd0ffe9c9e3d3263351855cad811b94c02fa383ba6f2c8e6dba6cc00101dd7'],
    ['clara.wake_open_question(uuid,text,uuid,text,text)',
     '93ca07bdc13ee9edfdb195282b4ad82b9a46a61e1ef2102d59715aad502f75d0'],
    -- Not recut, but pinned so §J can prove it BYTE-UNMOVED: the sales floor keeps its 2-arity
    -- shape (it carries no control-leg prologue — measured, not assumed) and B11 calls it as is.
    ['clara._assert_sales_invoice_shape_at(uuid,uuid)',
     '60d1fe17d2586ba91c13500f4bc723751dd5816ab8bcb5463f381d90c3d48621'],
    -- T3's whole point: the two 1-arity delegates are BYTE-UNMOVED and off the D1 list.
    ['clara._assert_supplier_bill_shape(uuid)', null],
    ['clara._assert_sales_invoice_shape(uuid)', null]
  ];
begin
  -- Upstream objects every section below depends on, probed by exact regprocedure form: a
  -- renumbered or re-signatured helper is as absent as a missing one.
  foreach v_sig in array array[
    'clara.agent_user_id()', 'clara._reserve_op(uuid,text,text,bytea)',
    'clara._finish_op(uuid,text,text,jsonb)', 'clara._hash(jsonb)',
    'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
    'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
    'clara._active_document_filing(uuid,text,uuid,boolean)',
    'clara._open_question_blocks(uuid,uuid,uuid)',
    'clara._corroboration_bound(uuid,bigint)',
    'clara._canonical_counterparty(uuid,uuid)',
    'clara._resolve_counterparty(uuid,jsonb)',
    'clara._autodraft_direction_tri(uuid,uuid)',
    'clara._invoice_fact_state(uuid)', 'clara._invoice_fact_state_at(uuid,uuid)',
    'clara.assert_books_current(uuid,uuid,bigint,bigint)',
    'clara._tf_append_only()', 'clara._tf_no_truncate()',
    'clara._tf_counterparty_name_only_guard()'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A2 part1 prestate: required upstream function absent: %', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- PARTIAL BIRTH. Nothing this file creates may already exist.
  if to_regclass('clara.entry_post_receipts') is not null then
    raise exception 'F-A2 part1 partial birth: clara.entry_post_receipts already exists' using errcode='CLR10';
  end if;
  foreach v_sig in array array[
    'clara._agent_post_entry_core(uuid,uuid,uuid,text,uuid,uuid,uuid,bigint,text,jsonb,text)',
    'clara._assert_control_leg_counterparty_at(uuid,uuid)',
    'clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)',
    'clara._post_counterparty_projection(uuid)',
    'clara._tf_assert_agent_post_receipt()'
  ] loop
    if to_regprocedure(v_sig) is not null then
      raise exception 'F-A2 part1 partial birth: % already exists', v_sig using errcode='CLR10';
    end if;
  end loop;
  if exists(select 1 from pg_trigger where tgname='t_je_agent_post_receipt' and not tgisinternal) then
    raise exception 'F-A2 part1 partial birth: t_je_agent_post_receipt already exists' using errcode='CLR10';
  end if;

  -- (0.1) THE PROSRC SHA PINS, and the one-overload check that goes with them. A recut that
  -- silently CREATEd a new overload instead of REPLACING the live body would leave the old body
  -- reachable and every arm below would still pass on the new one (0054:132-146's lesson).
  for v_n in 1 .. array_length(v_pins,1) loop
    v_sig := v_pins[v_n][1]; v_want := v_pins[v_n][2];
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A2 part1 prestate: pinned body absent: %', v_sig using errcode='CLR10';
    end if;
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_want is not null and v_sha <> v_want then
      raise exception 'F-A2 part1 prestate: % has prosrc sha % but this file was authored against % — the body moved under us; re-derive the splice against the LIVE tip (Annex G F49: a body''s live tip is found by CoR lineage, never by the migration that created it)',
        v_sig, v_sha, v_want using errcode='CLR10';
    end if;
    insert into _fa2p1_pre(k,v) values ('sha:'||v_sig, v_sha);
    -- EVERY RECUT BELOW REPLACES THE BODY INSIDE pg_get_functiondef's OWN TEXT, so parameter
    -- defaults, volatility, the definer flag and the pinned search_path are carried through by
    -- construction rather than retyped (mint_wake_credential carries three defaults, and a
    -- hand-written header would drop them: "cannot remove parameter defaults"). That makes two
    -- dollar-quote tags load-bearing, and neither may occur inside a body being spliced.
    if position('$fa2body$' in v_src) <> 0 or position('$function$' in v_src) <> 0 then
      raise exception 'F-A2 part1 prestate: % contains a dollar-quote tag this file relies on', v_sig using errcode='CLR10';
    end if;
    if v_want is not null and (length(pg_get_functiondef(v_sig::regprocedure))
         - length(replace(pg_get_functiondef(v_sig::regprocedure), v_src, ''))) / greatest(length(v_src),1) <> 1 then
      raise exception 'F-A2 part1 prestate: %''s body does not occur exactly once inside its own functiondef', v_sig using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('_approve_entry_core','_draft_entry_core','_assert_supplier_bill_shape_at',
       '_assert_sales_invoice_shape_at','_tf_assert_supplier_bill_shape','_tf_assert_sales_invoice_shape',
       'mint_wake_credential','wake_open_question','_assert_supplier_bill_shape','_assert_sales_invoice_shape');
  if v_n <> 10 then
    raise exception 'F-A2 part1 prestate: expected exactly 10 pinned functions by name, found % — an overload this file does not know about would keep an old shape reachable', v_n
      using errcode='CLR10';
  end if;

  -- (0.2) THE 0040 MARKER DISPOSITIONS FOR THE EIGHTH BODY (Annex B.10). The 0040:7148-7159
  -- anti-revert postcheck pins ELEVEN markers at exact counts. A copy-the-0040-idiom prestate
  -- that did not state a disposition per marker refuses at apply, so each is stated here: eight
  -- CARRY at count 1, three RETIRE (5 occurrences) inside the deleted 0037:2046-2100 block, and
  -- `bank_rule_suggested` 2 -> 0 (both occurrences live inside that block's own gate text).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  foreach v_key in array array[
      'opening_entry_k_family_only', '[R1-F1] K-family-only lifecycle boundary',
      'receipt_preheld', 'bound_extraction', 'unpinned_rule_post',
      'settlement_not_autopostable', 'clara._subledger_on_approve(', 'no_counterparty_sighting'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 1 then
      raise exception 'F-A2 part1 prestate: CARRY marker % occurs % times (expected 1)', v_key, v_n using errcode='CLR10';
    end if;
  end loop;
  foreach v_key in array array[
      'H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only',
      'insert into clara.rule_sightings', 'uq_rule_sightings_mapping'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    insert into _fa2p1_pre(k,v) values ('retire_marker:'||v_key, v_n::text);
  end loop;
  if (select v::int from _fa2p1_pre where k='retire_marker:H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only') <> 1
     or (select v::int from _fa2p1_pre where k='retire_marker:insert into clara.rule_sightings') <> 2
     or (select v::int from _fa2p1_pre where k='retire_marker:uq_rule_sightings_mapping') <> 2 then
    raise exception 'F-A2 part1 prestate: the RETIRE marker counts are not 1/2/2 — B.10''s "3 names / 5 occurrences" does not hold against this body' using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'bank_rule_suggested', ''))) / length('bank_rule_suggested');
  if v_n <> 2 then
    raise exception 'F-A2 part1 prestate: bank_rule_suggested occurs % times (expected 2 — 0040:7123-7127''s own postcheck; this file takes it to 0, not 1)', v_n using errcode='CLR10';
  end if;

  -- (0.3) EVERY SPLICE ANCHOR IN THE EIGHTH BODY, COUNTED. `replace()` is global: an anchor
  -- occurring twice would be spliced twice, one occurring zero times splices nothing while the
  -- file reports success. Counted, never assumed.
  foreach v_key in array array[
      '  v_checked_via_rule uuid; v_kind text; v_bound uuid; v_no_cp_warning jsonb;',
      '  v_checked_via_rule:=nullif(p_ctx->>''checked_via_rule_id'','''')::uuid;',
      '        using errcode=''CLR23'';
    end if;
    if v_fingerprint->>''decision''=''birth'' then',
      '''counterparty birth raced with a changed match landscape''
            using errcode=''CLR23'';',
      '''counterparty identity could not be resolved after birth race''
          using errcode=''CLR23'';',
      '      raise exception ''newer facts identify an unsupported currency'' using errcode=''CLR25'';',
      '''newer machine facts contradict the draft evidence''
          using errcode=''CLR25'';',
      '  if clara.is_high_stakes(p_entry) then
    if e.last_human_editor is null then',
      '  perform clara._audit(c.firm,c.actor,null,null,''approve_entry'',p_entry,',
      '  perform clara._append_event(c.firm,''entry.approved'',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,''{}''::jsonb);',
      '  -- H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only. A rule-posted approval'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 1 then
      raise exception 'F-A2 part1 prestate: approve-core anchor occurs % times (expected 1): %', v_n, left(v_key,70) using errcode='CLR10';
    end if;
  end loop;
  -- The three CLR05 arms the human lane keeps BYTE-UNTOUCHED; §J re-asserts them.
  foreach v_key in array array['attestation_required','distinct_checker','self_attestation'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 1 then
      raise exception 'F-A2 part1 prestate: human maker/checker arm % occurs % times (expected 1)', v_key, v_n using errcode='CLR10';
    end if;
  end loop;

  -- (0.4) THE DRAFT-CORE ANCHORS.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure;
  foreach v_key in array array[
      '  v_facts_extraction uuid; v_ocr_extraction uuid;',
      '  if not p_is_human and p_wake_kind=''autodraft'' and p_document is not null
     and p_coding_kind in (''sales_invoice'',''sales_credit_note'',''supplier_bill'') then',
      '  if v_fingerprint->>''decision'' in
       (''registration_match'',''name_match_unregistered'',''alias_match'') then',
      '  select case when exists(select 1 from clara.entry_evidence',
      '  select revision_token into v_token from clara.journal_entries where id=v_entry;',
      'insert into clara.rule_decisions'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 1 then
      raise exception 'F-A2 part1 prestate: draft-core anchor occurs % times (expected 1): %', v_n, left(v_key,70) using errcode='CLR10';
    end if;
  end loop;

  -- (0.5) THE SUPPLIER FLOOR'S PROLOGUE — GB-2's `0036:619-626`, the eight lines this file
  -- extracts. Counted here so a floor whose prologue has moved refuses instead of being spliced
  -- into two readings of one window.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure;
  v_key := '  if exists (
    select 1 from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class in (''payable'',''receivable'')
      and l.counterparty_id is null
  ) then
    raise exception ''every control-class line requires a counterparty'' using errcode = ''CLR23'';
  end if;';
  v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
  if v_n <> 1 then
    raise exception 'F-A2 part1 prestate: the supplier floor''s control-leg prologue occurs % times (expected 1) — GB-2''s extraction premise does not hold against this body', v_n using errcode='CLR10';
  end if;
  -- GB-2's OTHER premise, stated so the replay confirms it (gate §7): the SALES floor carries no
  -- control-leg prologue of its own, which is why B11 calls it unchanged.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_sales_invoice_shape_at(uuid,uuid)'::regprocedure;
  if position('every control-class line requires a counterparty' in v_src) <> 0 then
    raise exception 'F-A2 part1 prestate: the SALES floor now carries a control-leg prologue — B11 needs the same extraction the supplier floor gets' using errcode='CLR10';
  end if;

  -- (0.6) THE WAKE LIMB'S PRESTATE (D34). Both CHECKs are read as text and pinned: the swap
  -- below must EXTEND each enumeration and leave the existing disjuncts semantically identical.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.wake_credentials'::regclass and c.conname='ck_wake_credentials_kind_0011';
  if v_def is distinct from 'CHECK ((wake_kind = ANY (ARRAY[''interactive''::text, ''proactive''::text, ''autodraft''::text])))' then
    raise exception 'F-A2 part1 prestate: ck_wake_credentials_kind_0011 is not the three-kind enumeration this file extends: %', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.wake_credentials'::regclass and c.conname='ck_wake_credentials_client_0011';
  if v_def is distinct from 'CHECK ((((wake_kind = ''autodraft''::text) AND (client_id IS NOT NULL)) OR ((wake_kind = ANY (ARRAY[''interactive''::text, ''proactive''::text])) AND (client_id IS NULL))))' then
    raise exception 'F-A2 part1 prestate: ck_wake_credentials_client_0011 is not the closed-world enumeration GB-3 found: %', v_def using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_credentials where wake_kind not in ('interactive','proactive','autodraft');
  if v_n <> 0 then
    raise exception 'F-A2 part1 prestate: % live credential(s) already carry a kind outside the three — the swap''s "validates trivially" claim is false here', v_n using errcode='CLR10';
  end if;
  insert into _fa2p1_pre(k,v) values ('live_credentials', (select count(*)::text from clara.wake_credentials));
  select p.prosrc into v_src from pg_proc p where p.oid='clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure;
  foreach v_key in array array[
      '  if p_wake_kind is null or p_wake_kind not in (''interactive'',''proactive'',''autodraft'') then',
      '  elsif p_client is not null then
    raise exception ''legacy wake kinds do not accept a client binding'' using errcode=''CLR10'';'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 1 then
      raise exception 'F-A2 part1 prestate: mint_wake_credential gate anchor occurs % times (expected 1): %', v_n, left(v_key,60) using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.wake_open_question(uuid,text,uuid,text,text)'::regprocedure;
  v_key := '  if w.wake_kind<>''autodraft'' or w.client_id is null
     or w.client_id is distinct from p_client then';
  v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
  if v_n <> 1 then
    raise exception 'F-A2 part1 prestate: wake_open_question kind arm occurs % times (expected 1)', v_n using errcode='CLR10';
  end if;

  -- (0.7) THE pg_trigger CENSUS (D5 / §D.1). Tier membership is a fact about
  -- pg_trigger.tgdeferrable, not a list anyone should write from memory: TWO independent readers
  -- got it wrong from source. This asserts the predicted table in BOTH directions.
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal;
  if v_n <> 16 then
    raise exception 'F-A2 part1 prestate: journal_entries carries % non-internal triggers, expected 16', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal and tgdeferrable and tginitdeferred
     and tgname not in ('t_je_adv_movement_belt','t_je_balance','t_je_bank_match_reversal_belt',
       't_je_bank_pending_orphan_belt','t_je_customer_receipt_shape','t_je_fa_movement_belt',
       't_je_provenance','t_je_sales_invoice_shape','t_je_subledger_belt',
       't_je_supplier_bill_shape','t_je_supplier_payment_shape');
  if v_n <> 0 then
    raise exception 'F-A2 part1 prestate: a DEFERRED trigger on journal_entries is not in §D.1''s eleven — Tier D''s membership moved' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal and tgdeferrable and tginitdeferred;
  if v_n <> 11 then
    raise exception 'F-A2 part1 prestate: % deferred triggers on journal_entries, expected §D.1''s eleven', v_n using errcode='CLR10';
  end if;
  foreach v_key in array array['t_je_immutable','t_je_no_truncate','t_je_stamp','t_period_wall','t_snapshot_staleness'] loop
    if exists(select 1 from pg_trigger where tgrelid='clara.journal_entries'::regclass
        and tgname=v_key and tgdeferrable) then
      raise exception 'F-A2 part1 prestate: % is DEFERRABLE — §D.1 places it outside Tier D (t_period_wall is Tier C''s CLR19 site)', v_key using errcode='CLR10';
    end if;
  end loop;

  -- (0.8) THE TWO "ALREADY TYPED" TIER-C FINDINGS, RECORDED RATHER THAN ASSUMED. The design says
  -- PR-1 adds a `detail` reason for registration_conflict; at the bytes _resolve_counterparty
  -- ALREADY carries it on both arms, so this file lists the pair and writes nothing. Same for
  -- hard constraint 12's own wall (GM-6). Measured, so a future body that DROPS the reason
  -- fails here instead of silently un-typing a Tier-C pair.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._resolve_counterparty(uuid,jsonb)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, '''reason'',''registration_conflict''', ''))) / length('''reason'',''registration_conflict''');
  if v_n <> 2 then
    raise exception 'F-A2 part1 prestate: _resolve_counterparty types registration_conflict on % arms (expected 2) — the Tier-C pair would be unreachable/untyped', v_n using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._tf_counterparty_name_only_guard()'::regprocedure;
  if position('''reason'', ''customer_identity_name_only''' in v_src) = 0 then
    raise exception 'F-A2 part1 prestate: 0062''s guard no longer types customer_identity_name_only' using errcode='CLR10';
  end if;

  -- (0.9) INERTNESS OF THE RECEIPT WALL, MEASURED ON THIS DATABASE (E.3). The live arm keys on
  -- "the checker is the agent" — full stop — and every other approve caller passes a human
  -- actor. This counts the rows that WOULD violate the new deferred trigger if they were
  -- approved again; a non-zero answer names them.
  select count(*)::int into v_n from clara.journal_entries e
   join clara.users u on u.id = e.checker_actor
   where e.status='approved' and u.is_agent and e.checked_via_rule_id is null;
  insert into _fa2p1_pre(k,v) values ('agent_checked_no_rule_entries', v_n::text);

  -- ...AND THE HALF THE WALL ALSO COVERS, measured rather than assumed. The first cut fenced the
  -- wall with `checked_via_rule_id is null` on the belief that the retiring executor approves
  -- under the AGENT identity with a rule id. E.3 authorises no such exemption, so the fence is
  -- gone -- and this census is what makes removing it safe rather than hopeful: if this database
  -- holds even ONE agent-checked approval carrying a rule id, the belief is TRUE here and the
  -- wall would strand that writer, so the file REFUSES to apply and names the population instead
  -- of discovering it at the next post.
  select count(*)::int into v_n from clara.journal_entries e
   join clara.users u on u.id = e.checker_actor
   where e.status='approved' and u.is_agent and e.checked_via_rule_id is not null;
  insert into _fa2p1_pre(k,v) values ('agent_checked_with_rule_entries', v_n::text);
  if v_n > 0 then
    raise exception 'F-A2 part1 prestate: % approved entr(y/ies) on this database are agent-checked WITH a rule id. The receipt wall covers EVERY agent-approved transition (E.3), so applying here would strand that writer -- retire it, or re-open the exemption as an owner ruling, before applying', v_n
      using errcode='CLR10';
  end if;

  raise notice 'F-A2 part1 prestate: clean -- 8 bodies pinned by prosrc sha at frontier 0102 (the SEVEN this file replaces plus the sales floor, which is pinned so a drift is caught but is byte-unmoved and is NOT a D1 term), the 0040 marker set is 8 CARRY / 3 RETIRE (5 occurrences) / bank_rule_suggested at 2, every splice anchor occurs exactly once, the pg_trigger census matches D.1 in both directions (11 deferred, 5 not), both wake_credentials CHECKs are the closed-world enumerations GB-3 found over % live credential(s), registration_conflict and customer_identity_name_only are ALREADY typed (zero body edits), and % existing approved entr(y/ies) are agent-checked without a rule id.',
    (select v from _fa2p1_pre where k='live_credentials'),
    (select v from _fa2p1_pre where k='agent_checked_no_rule_entries');
end
$fa2_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  clara.entry_post_receipts — Annex E.1, verbatim in shape.
--
-- WHY A SEPARATE TABLE AND NOT EITHER OBVIOUS HOME (E.1, unchanged and still binding on anyone
-- who proposes a simpler shape). NOT a jsonb column on journal_entries: `_tf_entry_immutable`'s
-- draft->approved allow-set is EXACTLY EIGHT columns (0016:4958-4960) checked as a whole-row
-- diff, so a new column needs a ninth member — a CoR on a guard plus a true-up of its diff test,
-- to store something no guard reads. NOT journal_entry_revisions:
-- uq_journal_entry_revisions_token unique(entry_id,revision_token) (0011:903) versus a token
-- that cannot rotate at approval — a revision_no=1 row would collide, and a fresh uuid would
-- make the column lie.
--
-- `via_wake_kind` ADMITS 'autodraft' AND 'interactive' ONLY — never 'interactive_client'. Per
-- R-1 the pinned kind is minted solely for `wake_open_question` and never carries a post; a post
-- arriving under it is a contract violation and the CHECK says so. D34 changes WHEN that kind is
-- minted, never WHAT it may do.
--
-- THE model_snapshot DEFAULT IS `''` — TWO apostrophes (R-3). v3 wrote four, which is the SQL
-- literal `''`, so the conjunct read "the model name, defaulted to the two-character string '',
-- is not empty" and ALWAYS PASSED — on the wall that records WHICH MODEL posted (law 71's core).
-- =====================================================================================
create table clara.entry_post_receipts (
  id                        uuid primary key default gen_random_uuid(),
  firm_id                   uuid not null references clara.firms(id),
  client_id                 uuid not null,
  entry_id                  uuid not null,
  acting_actor              uuid not null references clara.users(id),
  on_behalf_of              uuid references clara.users(id),
  via_wake_kind             text not null check (via_wake_kind in ('autodraft','interactive')),
  model_snapshot            jsonb not null check (jsonb_typeof(model_snapshot)='object'
                              and btrim(coalesce(model_snapshot->>'provider','')) <> ''
                              and btrim(coalesce(model_snapshot->>'model','')) <> ''
                              and btrim(coalesce(model_snapshot->>'version','')) <> ''),
  rationale                 text not null check (btrim(rationale) <> '' and length(rationale) <= 4000),
  gate_verdicts             jsonb not null check (jsonb_typeof(gate_verdicts)='object'
                              and nullif(btrim(coalesce(gate_verdicts->>'extraction_id','')),'') is not null),
  approval_arm              text not null,
  maker_active_at_approval  boolean,
  op_key                    text not null,
  created_at                timestamptz not null default now(),
  constraint fk_entry_post_receipts_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint uq_entry_post_receipts_entry unique (entry_id)
);
comment on table clara.entry_post_receipts is
  'F-A2: one row per UNATTENDED AGENT POST. Written only by clara._agent_post_entry_core, inside the posting transaction, after the delegate returns and inside the Tier-C-protected region; no refusal at any tier writes a row, and no role holds DML. gate_verdicts flattens extraction_id to the TOP LEVEL because the shape triggers read the pin from inside a trigger and a nested accessor there yields NULL — which IS the unpinned behaviour T3 removes, and does so without failing anything (D24).';

alter table clara.entry_post_receipts enable row level security;
alter table clara.entry_post_receipts force row level security;
create policy p_entry_post_receipts_owner on clara.entry_post_receipts
  for all to clara_fn_owner using (true) with check (true);
create policy p_entry_post_receipts_read on clara.entry_post_receipts
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.entry_post_receipts to clara_authenticated;

create index ix_entry_post_receipts_client on clara.entry_post_receipts(client_id, created_at desc);

create trigger t_entry_post_receipts_append_only before update or delete on clara.entry_post_receipts
  for each row execute function clara._tf_append_only();
create trigger t_entry_post_receipts_no_truncate before truncate on clara.entry_post_receipts
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- §B  t_je_agent_post_receipt — the deferred constraint trigger, ARM-0 FIRST (law 68).
--
-- ARM 0 IS DECLARED UNREACHABLE RATHER THAN BANKED ON (law 31). `checker_actor` is FK-bound at
-- 0003:117 and 0016:4950-4952 already refuses NULL, so an unresolvable checker cannot arrive —
-- and an ARM-0 that is merely BELIEVED unreachable is exactly the shape that admits on absence,
-- so it refuses instead of falling through.
--
-- THE LIVE ARM READS THE RECORDED FACT, NOT A NAME (review law 3): `clara.users.is_agent`, not a
-- comparison against a hardcoded uuid. And that is the ENTIRE condition Annex E.3 authorises —
-- EVERY agent-approved transition owes a receipt. §0.9 measures both halves of the population
-- this covers and REFUSES to apply where the rule-id half is non-empty, so the wall never lands
-- somewhere it would strand a live writer.
-- =====================================================================================
create function clara._tf_assert_agent_post_receipt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_is_agent boolean; v_n int;
begin
  -- ARM 0.
  if new.checker_actor is null then
    raise exception 'an approved entry has no checker actor; the agent-post receipt wall cannot resolve the approving identity'
      using errcode='CLR08', detail='{"reason":"agent_post_receipt_arm0_null_checker"}';
  end if;
  select u.is_agent into v_is_agent from clara.users u where u.id = new.checker_actor;
  if not found or v_is_agent is null then
    raise exception 'the approving identity % is unresolvable; the agent-post receipt wall refuses rather than assuming a human', new.checker_actor
      using errcode='CLR08', detail='{"reason":"agent_post_receipt_arm0_unresolvable_checker"}';
  end if;
  -- A human approval writes no receipt. THAT IS THE WHOLE CONDITION (Annex E.3).
  --
  -- THE RULE-ID DISJUNCT IS GONE -- named in PROSE, because §J's postcheck below asserts that
  -- column name is ABSENT from this body and a comment quoting it would make the guard read its
  -- own explanation as the defect (the same discipline §E applies to the 0040 markers).
  -- E.3 authorises no such exemption, and it carved
  -- a hole through the one wall that makes the receipt structural: any approve reaching this
  -- trigger under the AGENT identity while carrying a rule id was waved past with no receipt at
  -- all. It was justified as an accommodation for the retiring executor -- but 0.9 MEASURES that
  -- population and REFUSES to apply where it is non-empty, so the accommodation is provably not
  -- needed on any database this file lands on, and the executor retires in PR-3 regardless. A
  -- wall with an unaudited exemption is a wall whose exemption outlives its reason.
  if not v_is_agent then
    return null;
  end if;
  select count(*)::int into v_n from clara.entry_post_receipts r where r.entry_id = new.id;
  if v_n <> 1 then
    raise exception 'an unattended agent post carries exactly one post receipt; entry % carries %', new.id, v_n
      using errcode='CLR08', detail=jsonb_build_object('reason','agent_post_receipt_missing',
        'entry_id', new.id, 'receipts', v_n)::text;
  end if;
  return null;
end $$;
revoke all on function clara._tf_assert_agent_post_receipt() from public;

create constraint trigger t_je_agent_post_receipt
  after update on clara.journal_entries
  deferrable initially deferred
  for each row
  when (old.status is distinct from new.status and new.status = 'approved')
  execute function clara._tf_assert_agent_post_receipt();

-- =====================================================================================
-- §C  GB-2's projected-state predicate, and the supplier floor split (D31).
--
-- THE DEFECT, AT THE BYTES. `_assert_supplier_bill_shape_at`'s live tip opens with a prologue
-- raising CLR23 — "every control-class line requires a counterparty" — BEFORE its kind gate, on
-- ANY control-class line with a NULL counterparty_id, RECEIVABLE INCLUDED. The counterparty is
-- stamped INSIDE the delegate (0037:1884-1888), the ladder runs BEFORE delegation and the caller
-- cannot supply one, so every agent sales draft has a NULL-counterparty receivable leg: a naive
-- B10 refuses 100% of sales posts, WITH THE SUPPLIER TOKEN, and §3.4's draft copies would
-- regress today's working draft path outright.
--
-- THE FIX, AND THE JUDGEMENT CALL INSIDE IT. The prologue moves into a callable projected-state
-- predicate evaluating `coalesce(l.counterparty_id, p_projected)`. "The existing floor becomes a
-- thin delegate passing NULL" needs a WIDER body to delegate to — otherwise B10 would still have
-- to call the 2-arity floor, whose prologue would run with a NULL projection and reproduce the
-- very defect GB-2 names. So the floor's WHOLE body moves ONCE, unchanged but for the prologue,
-- into `_assert_supplier_bill_shape_at_projected(p_entry, p_extraction, p_projected)`, and the
-- live 2-arity becomes the thin delegate passing NULL — the 0016:3957-3961 pattern exactly, and
-- byte-identical in behaviour for all five existing callers. It is a DISTINCT NAME, not an
-- overload, because that is the estate's own idiom for a wider variant
-- (`_assert_supplier_bill_shape` -> `_assert_supplier_bill_shape_at`) and because the census
-- cells assert one overload per touched function. It is ONE body, never two: the advance belt's
-- doctrine (0043:3149-3152) is that a test lives in exactly one body so the belt, the hook and
-- the tie cannot drift into two readings of one window.
--
-- THE BIRTH PROJECTION SENTINEL. A `decision='birth'` proposal stamps an id that does not exist
-- yet. The predicate only asks whether a control leg will STILL be null after the stamp, so any
-- non-null value is exact there; this file uses one documented, greppable sentinel rather than
-- gen_random_uuid() so the projection is deterministic and a reader can find every use of it.
-- =====================================================================================
create function clara._assert_control_leg_counterparty_at(p_entry uuid, p_projected uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  -- The 0036:619-626 prologue, verbatim but for `coalesce(l.counterparty_id, p_projected)`.
  -- p_projected NULL reproduces the pre-extraction behaviour byte-for-byte.
  if exists (
    select 1 from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class in ('payable','receivable')
      and coalesce(l.counterparty_id, p_projected) is null
  ) then
    raise exception 'every control-class line requires a counterparty' using errcode = 'CLR23';
  end if;
end $$;
revoke all on function clara._assert_control_leg_counterparty_at(uuid,uuid) from public;
comment on function clara._assert_control_leg_counterparty_at(uuid,uuid) is
  'F-A2/GB-2 (D31): the supplier floor''s control-leg prologue, extracted so a pre-delegation caller can judge the state the post is ABOUT TO CREATE rather than the state it starts from. p_projected is the counterparty the caller will stamp on every control leg, the birth sentinel 00000000-0000-4000-8000-0000000000b1 when a birth will stamp an id that does not exist yet, or NULL when nothing will be stamped.';

create function clara._post_counterparty_projection(
    p_entry uuid, out lock_counterparty uuid, out projected_counterparty uuid)
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare e record; v_fp jsonb;
begin
  -- A READ-ONLY EXTRACTION OF THE DELEGATE'S OWN DERIVATION (§D.7). Two answers, because they
  -- are two different questions: which existing counterparty the vendor advisory must serialize
  -- on, and what every control leg will carry AFTER the delegate stamps.
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  if e.proposed_counterparty is null then
    -- The delegate stamps NOTHING on this path; it only reads what is already there. So the
    -- projection is NULL — a control leg that is null today is null after the delegate too.
    select clara._canonical_counterparty(e.client_id, min(l.counterparty_id::text)::uuid)
      into lock_counterparty
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class in ('payable','receivable')
        and l.counterparty_id is not null;
    projected_counterparty := null;
    return;
  end if;
  -- May raise (CLR23, registration_conflict) — GM-5's pair, and the reason this derivation runs
  -- INSIDE the Tier-C-protected region rather than above it.
  v_fp := clara._resolve_counterparty(e.client_id, e.proposed_counterparty);
  if v_fp->>'decision' = 'birth' then
    lock_counterparty := null;   -- nothing exists yet to serialize a vendor-scoped question on
    projected_counterparty := '00000000-0000-4000-8000-0000000000b1'::uuid;  -- BIRTH SENTINEL
    return;
  end if;
  lock_counterparty := clara._canonical_counterparty(e.client_id, (v_fp->>'counterparty_id')::uuid);
  projected_counterparty := lock_counterparty;
end $$;
revoke all on function clara._post_counterparty_projection(uuid) from public;

-- THE SHELL, INSTALLED STATICALLY AND EMPTY ON PURPOSE. The floor's body is MOVED into it by the
-- change-of-record patch below, which reads that body off the catalog rather than retyping it.
-- The shell exists so the move is a patch of an existing surface rather than a dynamically
-- CONSTRUCTED `create function`: the wiki dynamic-SQL gate is fail-closed on any persistent
-- statement it cannot reconstruct from literals, and a constructed CREATE would be exactly that.
-- If this text is ever what runs, the move did not happen.
create function clara._assert_supplier_bill_shape_at_projected(
    p_entry uuid, p_extraction uuid, p_projected uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  raise exception 'clara._assert_supplier_bill_shape_at_projected was never installed — its migration''s change-of-record patch did not run'
    using errcode = 'CLR10';
end $$;

do $fa2_floor$
declare v_src text; v_new text; v_prologue text; v_n int; v_shell_src text; v_shell_def text;
begin
  select p.prosrc into v_src
    from pg_proc p where p.oid='clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure;
  select p.prosrc, pg_get_functiondef(p.oid) into v_shell_src, v_shell_def
    from pg_proc p where p.oid='clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)'::regprocedure;
  if position('was never installed' in v_shell_src) = 0 then
    raise exception 'F-A2 §C: the projected floor is not the empty shell this patch expects' using errcode='CLR10';
  end if;
  v_prologue := '  if exists (
    select 1 from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry and a.account_class in (''payable'',''receivable'')
      and l.counterparty_id is null
  ) then
    raise exception ''every control-class line requires a counterparty'' using errcode = ''CLR23'';
  end if;';
  v_new := replace(v_src, v_prologue,
    '  -- F-A2/GB-2 (D31): the prologue now lives in clara._assert_control_leg_counterparty_at,
  -- which this body calls with ITS OWN projection. The 2-arity entry point passes NULL, which
  -- is this file''s pre-extraction behaviour byte-for-byte.
  perform clara._assert_control_leg_counterparty_at(p_entry, p_projected);');
  if v_new = v_src then
    raise exception 'F-A2 §C: the supplier floor prologue did not splice' using errcode='CLR10';
  end if;
  execute replace(v_shell_def, v_shell_src, v_new);
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_assert_supplier_bill_shape_at_projected';
  if v_n <> 1 then
    raise exception 'F-A2 §C: expected exactly one projected floor, found %', v_n using errcode='CLR10';
  end if;
end
$fa2_floor$;

-- THE LIVE 2-ARITY BECOMES THE THIN DELEGATE PASSING NULL — the 0016:3957-3961 pattern. All five
-- of its callers (_approve_entry_core, approve_wrong_client_correction, reverse_entry, the
-- 1-arity delegate and the shape trigger) keep byte-identical behaviour, because a NULL
-- projection is exactly what the prologue evaluated before it moved.
create or replace function clara._assert_supplier_bill_shape_at(p_entry uuid, p_extraction uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._assert_supplier_bill_shape_at_projected(p_entry, p_extraction, null);
end $$;
revoke all on function clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid) from public;

-- =====================================================================================
-- §D  clara._agent_post_entry_core — THE LADDER. Ungranted; part 2's wrapper is the only door.
--
-- FOUR TIERS, AND THE BOUNDARY IS THE FAILURE MODE (D4).
--   TIER A — authority and shape. RAISES (CLR*). Nothing durable is written.
--   TIER B — the admission gates. A TYPED NON-POST RECEIPT, no raise: the transaction COMMITS,
--            so the reason is durable. ALL THIRTEEN RUNGS ARE EVALUATED, ALWAYS; the receipt
--            carries the full failing-rung vector; posting requires an EMPTY vector.
--   TIER C — the delegated walls, converted on (errcode, reason) PAIRS ONLY. No wildcards, no
--            errcode-only members; an unlisted pair RE-RAISES and settles the task failed.
--   TIER D — the genuinely deferred belts. They fire at COMMIT, outside any exception block, so
--            they ABORT and cannot be converted. The runtime records (errcode, reason) in
--            last_refusal; the FA and advance belts live here (GM-3), and B12/B13 are CUT.
--
-- THE VECTOR IS THREE-VALUED (law 68). pass / fail / not_evaluable. An absent-input rung is
-- not_evaluable: it FAILS ADMISSION but is REPORTED DISTINCTLY, because `pass` on an absent
-- input is the ARM-0 defect. B4-sales is the sharpest instance — where the nil-tax witness arm
-- withholds the components (0100:553-554) the component tie is not_evaluable, NEVER pass, and
-- that tie is the named successor to the retiring `account_mismatch` rung (GM-2).
--
-- THE CONSUMER CONTRACT (D26, law 68 at the consumer): NO CONSUMER MAY TEST vector[r]='fail'.
-- Every consumer tests for 'pass' and treats everything else — an unknown future value, a
-- missing key — as non-admitting, since testing for `fail` lets a rung added later silently
-- admit.
--
-- LOCK ORDER (judgement call 2, above). The delegate takes filing FOR SHARE, then the entry FOR
-- UPDATE, then the vendor advisory 203005003, then the client advisory 203005004. This body
-- takes exactly that order, so a concurrent human approve can never deadlock against it, and
-- ALL THREE are held before B9 reads `_open_question_blocks` — which is what closes the
-- check-then-act window GM-7 found and makes CLR26 provably unreachable from this lane (E.2).
--
-- THE RECEIPT'S WRITE CONTRACT IS AN INVARIANT (D24): written ONLY on a successful post, AFTER
-- the delegate returns, in the SAME transaction, INSIDE the Tier-C-protected region — so a
-- conversion rolls it back and NO refusal at any tier writes a row. Its id is minted before the
-- delegate so the ctx can carry it; the row lands after.
-- =====================================================================================
create function clara._agent_post_entry_core(
    p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_entry uuid,
    p_expected_revision uuid, p_client uuid, p_books_version bigint,
    p_rationale text, p_model jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_dedupe jsonb; v_filing uuid; v_state jsonb := '{}'::jsonb; v_bound uuid;
  v_lock_cp uuid; v_projected uuid; v_question record; v_tri text;
  v_vector jsonb := '{}'::jsonb; v_val text; v_first text; v_failing int;
  v_verdict jsonb; v_receipt_id uuid; v_result jsonb; v_maker_active boolean;
  v_total bigint; v_tax_fact bigint; v_round bigint; v_is_cn boolean;
  v_a bigint; v_b bigint; v_c bigint; v_evid int; v_moved int;
  v_sub text; v_reason text; v_code text; v_detail text; v_pair boolean; v_b8_gen uuid;
  v_rungs text[] := array['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B14','B15'];
  v_tokens jsonb := jsonb_build_object(
    'B1','settlement_kind_human','B2','not_corroborated','B3','anchor_unbound',
    'B4','anchor_untied','B5','amount_conflict','B6','human_override_present',
    'B7','unverified_evidence','B8','facts_moved','B9','open_question_blocks',
    'B10','supplier_leg_shape','B11','sales_leg_shape','B14','generic_control_leg',
    'B15','generic_on_directional_document');
begin
  -- ---- TIER A (1): the op reservation, DELIBERATELY OUTSIDE the Tier-C-protected region.
  -- A conversion rolls its subtransaction back; the reservation must survive so the refusal is
  -- durable and a replay returns the stored receipt rather than re-running the ladder.
  v_dedupe := clara._reserve_op(p_firm,'wake_post_entry',p_op_key,
    clara._hash(jsonb_build_object('e',p_entry,'rev',p_expected_revision,'c',p_client,
      'bv',p_books_version,'r',p_rationale,'m',p_model)));
  if v_dedupe is not null then return v_dedupe; end if;

  <<protected>>
  begin
    -- ---- TIER A (2): authority.
    select * into e from clara.journal_entries where id = p_entry;
    if not found or e.firm_id <> p_firm then
      raise exception 'entry not in your firm' using errcode='CLR11';
    end if;
    if e.client_id is distinct from p_client then
      raise exception 'entry does not belong to the client this credential is pinned to'
        using errcode='CLR11', detail='{"reason":"client_mismatch"}';
    end if;

    -- ---- TIER A (3): LOCK 1, the filing FOR SHARE, through the LOCKING overload — the same
    -- helper, row and mode the delegate uses, taken in the delegate's own position.
    if e.document_id is not null then
      v_filing := clara._active_document_filing(e.document_id, e.source_doc_sha256, e.client_id, true);
      if v_filing <> e.filing_id then
        raise exception 'entry is not bound to the active filing' using errcode='CLR02';
      end if;
    end if;

    -- ---- TIER A (4): the entry row lock, then the state and token gates.
    select * into e from clara.journal_entries where id = p_entry for update;
    if e.status <> 'draft' then
      raise exception 'entry is not a draft' using errcode='CLR10', detail='{"reason":"not_a_draft"}';
    end if;
    if e.revision_token is distinct from p_expected_revision then
      raise exception 'stale revision token' using errcode='CLR06';
    end if;

    -- ---- TIER A (5): LOCKS 2 and 3, in the delegate's order (vendor, then client). The
    -- derivation can raise (CLR23, registration_conflict), which is why it lives here rather
    -- than above the protected region (GM-5).
    select lock_counterparty, projected_counterparty into v_lock_cp, v_projected
      from clara._post_counterparty_projection(p_entry);
    if v_lock_cp is not null then
      perform pg_advisory_xact_lock(203005003, hashtext(e.client_id::text||':'||v_lock_cp::text));
    end if;
    perform pg_advisory_xact_lock(203005004, hashtext(e.client_id::text));

    -- ---- TIER A (6): the books token, A8, and the human-only marker.
    perform clara.assert_books_current(p_firm, e.client_id, p_books_version, null);
    -- A8 — HER OWN WORK, UNTOUCHED. The second conjunct is not decoration: revise_entry lets a
    -- human rewrite an agent draft's NUMBERS, setting last_human_editor and rotating the token,
    -- and a plain renumbering writes only duplicate_override into flags, so B6 does not see it.
    -- Without A8 the agent posts a human's numbers unattended — a maker/checker inversion no
    -- ruling authorised. OQ-4's two lawful exits are exit 1 (the human posts it, under human
    -- identity) and exit 2 (the agent RE-DERIVES her own conclusion); the forbidden middle is
    -- pass-through of human numbers under agent identity with nobody's approval on record.
    if e.maker_actor is distinct from clara.agent_user_id() or e.last_human_editor is not null then
      raise exception 'the unattended post verb posts only an agent draft nobody has touched (maker %, last_human_editor %)', e.maker_actor, e.last_human_editor
        using errcode='CLR03', detail='{"reason":"agent_post_not_own_untouched_draft"}';
    end if;
    if e.closing_transfer then
      raise exception 'closing_transfer is a human-lane marker' using errcode='CLR03',
        detail='{"reason":"closing_transfer_human_only"}';
    end if;

    -- ---- THE FACT STATE THE WHOLE LADDER JUDGES AGAINST. The DB picks the generation, never
    -- the model: the bound extraction is whatever the resolver names for this document, and it
    -- is the value pinned into ctx, onto the receipt, and read back by T3's trigger pin.
    if e.document_id is not null then
      v_state := coalesce(clara._invoice_fact_state(e.document_id), '{}'::jsonb);
      v_bound := nullif(v_state->>'extraction_id','')::uuid;
    end if;
    v_total := nullif(v_state->>'total_cents','')::bigint;
    v_tax_fact := nullif(v_state->>'tax_total_cents','')::bigint;
    v_round := nullif(v_state->>'rounding_cents','')::bigint;
    v_is_cn := (e.coding_kind = 'sales_credit_note');

    -- ================= TIER B — all thirteen rungs, always evaluated =================
    -- B1: settlement kinds are HUMAN judgement until F-A3 (WCA-R6). Which of three open bills a
    -- RM5,000 payment settles is a JUDGEMENT, not a document fact. B1 is an interlock, not a new
    -- restriction, and it makes two deferred shape floors unreachable.
    --
    -- ITS LIVE POPULATION, STATED HONESTLY (law 31). Measured on the rig: `_draft_entry_core` —
    -- the body `wake_draft_entry` passes p_coding_kind straight through to — already refuses any
    -- kind outside {supplier_bill, sales_invoice, sales_credit_note} with CLR10 'unsupported
    -- coding kind', so NO settlement-kind draft can be born through the agent writer today. The
    -- draft-time CLR10 is the first wall and B1 is the second: it exists for the drafts the
    -- writer did not make — a historical row, a kind stamped directly, or a future writer that
    -- widens the enum — and a battery cell must manufacture that shape rather than draft it.
    v_vector := v_vector || jsonb_build_object('B1',
      case when e.coding_kind is null or e.coding_kind not in ('customer_receipt','supplier_payment')
           then 'pass' else 'fail' end);

    -- B2: corroboration is TRUE. An absent or '{}' fact state is not_evaluable — absence is the
    -- refusal, never a pass.
    v_vector := v_vector || jsonb_build_object('B2',
      case when v_state = '{}'::jsonb or not (v_state ? 'corroborated') then 'not_evaluable'
           when coalesce((v_state->>'corroborated')::boolean,false) then 'pass'
           else 'fail' end);

    -- B3: the anchor is BOUND — verified evidence actually cites the total the facts state.
    v_vector := v_vector || jsonb_build_object('B3',
      case when v_total is null then 'not_evaluable'
           when clara._corroboration_bound(p_entry, v_total) then 'pass' else 'fail' end);

    -- B4: the amount TIES, per kind (Annex I). The supplier row is a faithful relocation of
    -- 0016:4137-4151 (a flag) as a refusal; the sales and generic rows are NEW WALLS WITH NEW
    -- FORMULAS. B4-sales is derived against the LIVE floor 0022:714-930 — whose income tie
    -- SUBTRACTS the rounding leg — not against 0016:2100-2111, which was superseded seventy
    -- migrations ago (GM-1). rounding_cents is the FACT-SIDE value, never the entry's own
    -- rounding leg: an entry may not supply its own slack, or the tie becomes self-certifying.
    if v_total is null then
      v_val := 'not_evaluable';
    elsif e.coding_kind = 'supplier_bill' then
      select coalesce(sum(l.credit_cents),0) into v_a from clara.journal_lines l
        join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
        where l.entry_id=p_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_b from clara.journal_lines l
        join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
        where l.entry_id=p_entry and a.account_type='expense';
      v_val := case when v_a = v_total and v_b = v_total then 'pass' else 'fail' end;
    elsif e.coding_kind in ('sales_invoice','sales_credit_note') then
      -- The credit-note arm MIRRORS SIGN on every term; that mirror is what keeps a credit note
      -- from tying by absolute value.
      select coalesce(sum(case when v_is_cn then l.credit_cents else l.debit_cents end),0) into v_a
        from clara.journal_lines l join clara.coa_accounts a
          on a.client_id=l.client_id and a.account_code=l.account_code
        where l.entry_id=p_entry and a.account_class='receivable';
      select coalesce(sum(case when v_is_cn then l.debit_cents else l.credit_cents end),0) into v_b
        from clara.journal_lines l join clara.coa_accounts a
          on a.client_id=l.client_id and a.account_code=l.account_code
        where l.entry_id=p_entry and a.account_type='income';
      select coalesce(sum(case when v_is_cn then l.debit_cents else l.credit_cents end),0) into v_c
        from clara.journal_lines l join clara.coa_accounts a
          on a.client_id=l.client_id and a.account_code=l.account_code
        where l.entry_id=p_entry and a.special_acc_type='sst_output';
      if v_a <> v_total or (v_b + v_c) <> (v_total - coalesce(v_round,0)) then
        v_val := 'fail';
      elsif v_tax_fact is null then
        -- GM-2: the lumped tie is blind exactly where the nil-tax arm withholds the components,
        -- so a FABRICATED sst_output credit would tie perfectly — the shape 0046:1092's retiring
        -- `account_mismatch` rung caught. The component tie is this rung's successor, and where
        -- the fact side states no tax it evaluates not_evaluable, NEVER pass. A lumped pass here
        -- would be the ARM-0 defect wearing an accounting hat.
        --
        -- AND THIS ARM IS THE ONLY not_evaluable ARM OF B4-SALES. An ABSENT `rounding_cents` is
        -- EVALUABLE, not unknown: Annex I's formula says `coalesce(rounding_cents, 0)` in its own
        -- text, so a document that printed no rounding line has a rounding of zero and the tie
        -- above judges it. Only the nil-tax arm's WITHHELD components (0100:553-554) make the
        -- split unknowable, and only that is reported not_evaluable (D32).
        v_val := 'not_evaluable';
      elsif v_c <> v_tax_fact then
        v_val := 'fail';
      else
        v_val := 'pass';
      end if;
    elsif e.coding_kind is null then
      -- B4-generic: the weakest honest anchor available. No coding kind, so no direction arm, no
      -- coded-kind preconditions and no shape floor — the document total is the only DB-owned
      -- figure the entry can be held to (D37). Its named cost: a generic JV whose amount is not
      -- the document total cannot tie and lands as a draft. The alternative is no anchor at all.
      select coalesce(sum(l.debit_cents),0) into v_a from clara.journal_lines l where l.entry_id=p_entry;
      v_val := case when v_a = v_total then 'pass' else 'fail' end;
    else
      v_val := 'not_evaluable';   -- a settlement kind; B1 is the live wall
    end if;
    v_vector := v_vector || jsonb_build_object('B4', v_val);

    -- B5 / B6: the two override rungs. B6 is new — an entry carrying either override is a HUMAN
    -- judgement about a number, so she does not post it. B6 catches the override-bearing
    -- revisions; A8 catches all of them.
    v_vector := v_vector || jsonb_build_object('B5',
      case when (e.flags ? 'amount_exception') and not (e.flags ? 'amount_override') then 'fail' else 'pass' end);
    v_vector := v_vector || jsonb_build_object('B6',
      case when (e.flags ? 'amount_override') or (e.flags ? 'duplicate_override') then 'fail' else 'pass' end);

    -- B7: the amount-bearing evidence is `verified`. 0009:460-466 assigns that tier to exactly
    -- one field — invoice.total, and only when it matches the corroborated total — which is the
    -- same field `_corroboration_bound` reads, so the two rungs cannot drift apart.
    select count(*)::int into v_evid from clara.entry_evidence ev
      where ev.entry_id=p_entry and ev.field_path='invoice.total';
    if v_evid = 0 then
      v_val := 'not_evaluable';
    else
      select count(*)::int into v_moved from clara.entry_evidence ev
        where ev.entry_id=p_entry and ev.field_path='invoice.total' and ev.provenance_tier <> 'verified';
      v_val := case when v_moved = 0 then 'pass' else 'fail' end;
    end if;
    v_vector := v_vector || jsonb_build_object('B7', v_val);

    -- B8: NO CITATION NAMES A SUPERSEDED FACT GENERATION.
    --
    -- THE SCOPE IS THE FACT GENERATIONS, NAMED POSITIVELY. Only citations whose extraction is a
    -- FACT generation are in scope — `invoice_facts`, `llm_text_facts`, `llm_vision_facts` —
    -- listed as an inclusion, never as `not in ('ocr','structured_parse')`, so a fact kind
    -- invented later defaults to BEING CHECKED rather than to being skipped. Each such citation
    -- must name the generation this ladder is judging, which is the SAME fact-state jsonb B2, B3
    -- and B4 already read: one resolver call, one answer, no second read that could disagree
    -- with itself between rungs.
    --
    -- WHY OCR AND structured_parse ARE OUT OF SCOPE, and it is law 72 rather than convenience.
    -- An OCR region cannot carry `field_path='invoice.total'` at all — the egress writer emits
    -- `pages.{n}.lines.{i}` / `tables.{i}.cells.{j}` (packages/runtime/lib/egress.mjs:146,163) —
    -- and `0009:462-466` grants `provenance_tier='verified'` ONLY to `invoice.total` on a
    -- corroborated state whose cents tie. So the amount anchor of any entry that reaches B8 is
    -- necessarily a FACT-generation citation, and an OCR citation alongside it is a lawful
    -- `model_read` reference to the page image, not a claim about the numbers.
    --
    -- SCOPE α — EVERY fact-generation citation, not merely the verified `invoice.total` one. A
    -- MIXED-GENERATION draft (the total cited off G2 while the invoice_id is still cited off G1)
    -- FAILS, which is the split-generation hazard `0101:44-49` closes by construction.
    --
    -- TWO NAMED NON-MEMBERS, each excluded on evidence rather than by omission:
    --   (1) NO OCR-LINEAGE CONJUNCT. A re-OCR supersedes within its own kind (`0089:267-284`)
    --       while the witness's `input_pin` still names the older layout pass, so demanding OCR
    --       currency would refuse states that are lawfully fresh.
    --   (2) NO `superseded_by` READ. Governance of which generation wins is the cross-regime
    --       `extracted_at` clock (`0101:479-489`); a second rule reading a second column would
    --       drift from it (`0101:57-64`), and two rules for one question is how a wall starts
    --       lying.
    --
    -- B7 AND B8 ARE DIFFERENT QUESTIONS AND ARE EVALUATED INDEPENDENTLY: B7 makes the anchor
    -- VERIFIED, B8 makes it CURRENT.
    --
    -- WHY IT IS NOT REDUNDANT WITH THE REVISION-TOKEN GATE (law 31, forced non-vacuously). A5's
    -- input is CALLER-SUPPLIED: `0096:249-278` rotates the token when facts settle, so a caller
    -- that simply re-reads the entry posts with the fresh token and A5 is silent. B8 reads DB
    -- state against DB state, and the only way to satisfy it is to RE-CITE.
    v_b8_gen := nullif(v_state->>'extraction_id','')::uuid;
    if e.document_id is null or v_b8_gen is null then
      -- ARM-0: no document, a '{}' fact state, or a witness pair whose TEXT row is unresolved
      -- (`0092:210-217` emits a json null there). Absent input is never a pass (law 68).
      v_val := 'not_evaluable';
    else
      select count(*)::int into v_moved
        from clara.entry_evidence ev
        join clara.document_extractions x
          on x.id = ev.extraction_id and x.firm_id = ev.firm_id and x.document_id = ev.document_id
       where ev.entry_id = p_entry
         and x.engine_kind in ('invoice_facts','llm_text_facts','llm_vision_facts')
         and ev.extraction_id <> v_b8_gen;
      -- The join is on the FK TRIPLE (`0009:889`, `:901-902`), so it cannot silently lose a row
      -- and turn a stale citation into a pass — the count is over exactly the rows that exist.
      v_val := case when v_moved > 0 then 'fail' else 'pass' end;
    end if;
    v_vector := v_vector || jsonb_build_object('B8', v_val);

    -- B9: no open question blocks — read UNDER Tier A's three locks, which is the whole of
    -- GM-7's fold. With them held the delegate's own CLR26 re-check is provably unreachable from
    -- this lane, and law 31 forbids listing a wall that can never be asked.
    select * into v_question from clara._open_question_blocks(e.client_id, e.filing_id, v_lock_cp) limit 1;
    v_vector := v_vector || jsonb_build_object('B9', case when found then 'fail' else 'pass' end);

    -- B10 / B11: the deferred shape floors, PRE-CHECKED ON THE PROJECTED STATE (D31). The
    -- control-leg predicate is evaluated once and attributed to the rung that matches the kind,
    -- so a sales entry is never refused with the SUPPLIER token — the exact defect GB-2 found.
    v_sub := 'pass';
    begin
      perform clara._assert_control_leg_counterparty_at(p_entry, v_projected);
    exception when sqlstate 'CLR23' then v_sub := 'fail';
    end;
    if e.coding_kind in ('sales_invoice','sales_credit_note') then
      v_val := 'pass';
      begin
        perform clara._assert_supplier_bill_shape_at_projected(p_entry, v_bound, v_projected);
      exception when sqlstate 'CLR23' or sqlstate 'CLR21' or sqlstate 'CLR10' then v_val := 'fail';
      end;
      -- the control-leg answer belongs to B11 for a sales entry
      v_vector := v_vector || jsonb_build_object('B10', case when v_sub='fail' then 'pass' else v_val end);
      v_val := v_sub;
      if v_val = 'pass' then
        begin
          perform clara._assert_sales_invoice_shape_at(p_entry, v_bound);
        exception when sqlstate 'CLR23' or sqlstate 'CLR21' or sqlstate 'CLR10' then v_val := 'fail';
        end;
      end if;
      v_vector := v_vector || jsonb_build_object('B11', v_val);
    else
      v_val := v_sub;
      if v_val = 'pass' then
        begin
          perform clara._assert_supplier_bill_shape_at_projected(p_entry, v_bound, v_projected);
        exception when sqlstate 'CLR23' or sqlstate 'CLR21' or sqlstate 'CLR10' then v_val := 'fail';
        end;
      end if;
      v_vector := v_vector || jsonb_build_object('B10', v_val);
      v_val := 'pass';
      begin
        perform clara._assert_sales_invoice_shape_at(p_entry, v_bound);
      exception when sqlstate 'CLR23' or sqlstate 'CLR21' or sqlstate 'CLR10' then v_val := 'fail';
      end;
      v_vector := v_vector || jsonb_build_object('B11', v_val);
    end if;

    -- B14: a NULL-coding_kind entry carries NO AR/AP control leg. Its ground, RE-GROUNDED at the
    -- gate (GM-4): the subledger hook does NOT skip a NULL kind — ladder 5 classifies it
    -- 'adjustment' and materialises open items for its control legs. B14 stands on the reason
    -- that survives: an open item is a claim about who owes what, a generic entry's anchor is
    -- the weakest in the estate, a weak anchor cannot corroborate a subledger consequence, and
    -- WCA-R6 keeps settlement judgement human until F-A3.
    if e.coding_kind is not null then
      v_val := 'pass';
    else
      select count(*)::int into v_evid from clara.journal_lines l
        join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
        where l.entry_id=p_entry and a.account_class in ('payable','receivable');
      v_val := case when v_evid = 0 then 'pass' else 'fail' end;
    end if;
    v_vector := v_vector || jsonb_build_object('B14', v_val);

    -- B15 (D30, GB-1 — the sharpest finding of PR-0): a NULL-coding_kind entry may not anchor to
    -- a DIRECTIONAL document. coding_kind is a MODEL-SUPPLIED input, so the kind SELECTS which
    -- walls bind: a corroborated supplier invoice drafted generic as `Dr Expense / Cr Bank`
    -- passed all fourteen of v4's rungs — a phantom payment with the payable suppressed. B15
    -- lives in the ladder so it covers BOTH lanes. D18 survives: a genuinely
    -- direction-unresolved generic document still posts when it ties.
    if e.coding_kind is not null or e.document_id is null then
      v_val := 'pass';
    else
      v_tri := clara._autodraft_direction_tri(e.document_id, e.client_id);
      v_val := case when v_tri in ('sales','purchase') then 'fail' else 'pass' end;
    end if;
    v_vector := v_vector || jsonb_build_object('B15', v_val);

    -- ---- THE VERDICT BLOCK: what the DB SAW, never what the model claimed (law 27(2)).
    v_verdict := jsonb_build_object(
      'corroborated', coalesce((v_state->>'corroborated')::boolean, null),
      'extraction_id', v_bound, 'total_cents', v_total,
      'total_fact_hash', nullif(v_state->>'total_fact_hash',''),
      'type_code', nullif(v_state->>'type_code',''));

    -- THE ADMISSION COUNT IS ROSTER-DRIVEN, NOT KEY-DRIVEN, AND THAT IS THE WHOLE OF D26.
    --
    -- The first cut expanded the vector into rows and counted the ones whose value was not
    -- 'pass'. That is FAIL-OPEN twice over: a MISSING key produces no row at all, and a
    -- JSON-null value produces SQL NULL, so the `<> 'pass'` test is NULL and the row is not
    -- counted either. Both shapes would have POSTED. The consumer contract (design 3.2) already
    -- says a missing key and an unknown value are non-admitting; the PRODUCER has to obey the
    -- same law, and this statement is what makes it obey -- it walks the CLOSED roster
    -- `v_rungs`, the same array the first-failure loop below walks, so the two can never
    -- disagree about what was evaluated.
    --
    -- THE RETIRED EXPANSION IS NAMED IN PROSE, NEVER VERBATIM, and that is the estate's own
    -- discipline rather than shyness: §J's postcheck below asserts the retired form is ABSENT
    -- from this body, and a comment quoting it would make the guard read its own explanation as
    -- the defect. §E's excision block records the same rule for the 0040 markers.
    select count(*)::int into v_failing
      from unnest(v_rungs) r where coalesce(v_vector->>r, '') <> 'pass';
    if v_failing > 0 then
      -- ---- A TIER-B REFUSAL. No raise: the transaction COMMITS so the reason is durable, and
      -- NO receipt row is written at any tier but a successful post.
      v_first := null;
      foreach v_val in array v_rungs loop
        if v_first is null and coalesce(v_vector->>v_val,'') <> 'pass' then v_first := v_val; end if;
      end loop;
      v_result := jsonb_build_object('entry_id', p_entry, 'posted', false, 'status', e.status,
        'refusal', jsonb_build_object('tier','B','reason', v_tokens->>v_first,
          'rung', v_first, 'verdict_value', v_vector->>v_first),
        'rung_vector', v_vector, 'post_receipt_id', null, 'verdict', v_verdict);
      if v_first = 'B9' then
        v_result := jsonb_set(v_result, '{refusal,question_id}', to_jsonb(v_question.question_id));
        v_result := jsonb_set(v_result, '{refusal,scope}', to_jsonb(v_question.scope_kind));
      end if;
      perform clara._append_event(p_firm,'entry.post_refused',e.client_id,p_actor,p_obo,p_wake_kind,
        p_entry,e.document_id,null,jsonb_build_object('tier','B','reason',v_tokens->>v_first,
          'rung_vector',v_vector));
      return clara._finish_op(p_firm,'wake_post_entry',p_op_key,v_result);
    end if;

    -- ================= THE POST =================
    -- The receipt id is minted BEFORE the delegate so the ctx can name it; the ROW lands after
    -- the delegate returns, inside this same protected region (D24).
    v_receipt_id := gen_random_uuid();
    -- maker_active_at_approval: NULL where no director EXISTS (autodraft is client-bound and
    -- director-less by construction), never false-by-inference (law 68).
    if p_obo is null then
      v_maker_active := null;
    else
      select exists(select 1 from clara.firm_memberships m
        where m.user_id=p_obo and m.firm_id=p_firm and m.status='active') into v_maker_active;
    end if;

    perform clara._approve_entry_core(
      jsonb_build_object('actor', p_actor, 'firm', p_firm,
        'bound_extraction', v_bound, 'receipt_preheld', true,
        'on_behalf_of', p_obo, 'wake_kind', p_wake_kind, 'is_agent', true,
        'post_receipt_id', v_receipt_id),
      p_entry, p_expected_revision, null,
      -- The inner key is DERIVED, never minted (0078:150-152).
      p_op_key || '#post');

    insert into clara.entry_post_receipts(id, firm_id, client_id, entry_id, acting_actor,
        on_behalf_of, via_wake_kind, model_snapshot, rationale, gate_verdicts, approval_arm,
        maker_active_at_approval, op_key)
      values (v_receipt_id, p_firm, e.client_id, p_entry, p_actor, p_obo, p_wake_kind,
        p_model, p_rationale,
        -- extraction_id is FLATTENED to the top level: the shape triggers read the pin from
        -- inside a trigger, where a nested accessor yields NULL — which IS the unpinned
        -- behaviour T3 exists to remove, and it does so WITHOUT FAILING ANYTHING (D24).
        jsonb_build_object('extraction_id', v_bound, 'verdict', v_verdict, 'rung_vector', v_vector),
        'agent_unattended', v_maker_active, p_op_key);

    v_result := jsonb_build_object('entry_id', p_entry, 'posted', true, 'status', 'approved',
      'post_receipt_id', v_receipt_id, 'rung_vector', v_vector, 'verdict', v_verdict);
    perform clara._append_event(p_firm,'entry.posted',e.client_id,p_actor,p_obo,p_wake_kind,
      p_entry,e.document_id,null,jsonb_build_object('post_receipt_id',v_receipt_id,
        'approval_arm','agent_unattended','rung_vector',v_vector));
    return clara._finish_op(p_firm,'wake_post_entry',p_op_key,v_result);

  exception when others then
    -- ================= TIER C — CONVERSION ON PAIRS ONLY =================
    -- No wildcards and no errcode-only members. v1's classifier could not have worked: most
    -- named raises carry NO detail at all, so `(CLR25, currency)` would have swallowed the
    -- corroboration-bound contradiction — A MONEY WALL. (CLR10, customer_identity_name_only)
    -- shares its errcode with 0037:1778's op-key raise, which is why errcode-only matching would
    -- swallow unrelated walls. THE SET MAY ONLY GROW, and an unlisted pair propagates as a task
    -- failure. Explicitly NOT members, each on law 31: (CLR10, settlement_not_autopostable) —
    -- dead on this lane, B1 is the live wall; (CLR10, already_reversed) x2 — A8 admits only an
    -- untouched agent draft in `draft` status; (CLR26, open_question_race) — unreachable under
    -- Tier A's three locks; every bare CLR23 from inside the supplier floor — converting them
    -- would give one defect two settle outcomes decided by nothing an operator can see; (CLR08,*)
    -- — the immutability guard never converts; and every Tier-D abort, which cannot be caught
    -- from here at all because deferred constraint triggers fire at COMMIT, outside this block.
    get stacked diagnostics v_code = returned_sqlstate, v_detail = pg_exception_detail;
    begin
      v_reason := nullif(v_detail,'')::jsonb->>'reason';
    exception when others then
      v_reason := null;
    end;
    v_pair := (v_code, coalesce(v_reason,'')) in (
      ('CLR25','currency_unsupported'),
      ('CLR25','corroboration_contradicted'),
      ('CLR23','counterparty_landscape_moved'),
      ('CLR23','registration_conflict'),
      ('CLR23','counterparty_birth_race'),
      ('CLR10','customer_identity_name_only'),
      ('CLR21','duplicate_bill'),
      ('CLR21','duplicate_sales'),
      ('CLR19','write_into_closed_period'));
    if not v_pair then
      raise;
    end if;
    v_result := jsonb_build_object('entry_id', p_entry, 'posted', false, 'status', 'draft',
      'refusal', jsonb_build_object('tier','C','reason', v_reason, 'clr', v_code),
      'rung_vector', v_vector, 'post_receipt_id', null,
      'verdict', coalesce(v_verdict,'{}'::jsonb));
    perform clara._append_event(p_firm,'entry.post_refused',p_client,p_actor,p_obo,p_wake_kind,
      p_entry,null,null,jsonb_build_object('tier','C','reason',v_reason,'clr',v_code,
        'rung_vector',v_vector));
    return clara._finish_op(p_firm,'wake_post_entry',p_op_key,v_result);
  end;
end $$;
revoke all on function clara._agent_post_entry_core(uuid,uuid,uuid,text,uuid,uuid,uuid,bigint,text,jsonb,text) from public;

reset role;

-- =====================================================================================
-- §E  THE EIGHTH clara._approve_entry_core BODY (design §3.5, D1 row 1).
--
-- Lineage: 0015:1247 -> 0016:1220 -> the 0017 dynamic splice -> 0029:27 -> 0035:140 ->
-- 0037:1750 -> the 0040:7026-7174 S5 splice = the SEVENTH. This is the EIGHTH.
--
-- FOUR CHANGES, EACH SPLICED AT A COUNTED ANCHOR:
--   (1) BREEDING EXCISION. The whole 0037:2046-2100 block goes — both rule_sightings inserts and
--       the >=3-distinct-entry vendor_account loop, which also removes 0040:7115's
--       bank_rule_suggested conjunct spliced into the block's own gate. That splice was INERT ON
--       ARRIVAL BY ITS OWN ADMISSION (0040:7109-7112), so nothing behavioural is lost, and B.10's
--       disposition is 2 -> 0, not 2 -> 1. The TABLES stay (KEEP-AS-HISTORY): only the WRITES go.
--   (2) CTX IDENTITY PASS-THROUGH. The body hard-coded null for on_behalf_of and via_wake_kind in
--       _audit and passed an empty payload to _append_event, while _draft_entry_core passed both
--       through — three dropped identity channels (E.3). The eighth body reads them from p_ctx.
--   (3) THE AGENT ARM (§3.3.1, D10). The maker/checker family's three CLR05 arms cannot honestly
--       receive an agent post: arm 1 would demand an attestation the DB does not validate, and
--       distinct_checker is unreachable because an agent is not an eligible checker. So the
--       high-stakes gate is fenced with `and not is_agent`, recording approval_arm
--       'agent_unattended' on the receipt instead — dressing an unattended post as a
--       self-attestation would make self_approval_attestation assert a judgement nobody made.
--       THE HUMAN LANE'S THREE ARMS ARE BYTE-UNTOUCHED, and §J re-asserts all three.
--   (4) THE TIER-C detail REASONS: five raises that carried no detail at all gain one. Without
--       them a pair-keyed classifier cannot tell a currency refusal from the corroboration-bound
--       contradiction — a money wall.
-- =====================================================================================
do $fa2_approve$
declare v_src text; v_new text; v_cut_a int; v_cut_b int; v_block text; v_def text;
begin
  select p.prosrc, pg_get_functiondef(p.oid) into v_src, v_def
    from pg_proc p where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  v_new := v_src;

  -- (2a) the DECLARE additions.
  v_new := replace(v_new,
    '  v_checked_via_rule uuid; v_kind text; v_bound uuid; v_no_cp_warning jsonb;',
    '  v_checked_via_rule uuid; v_kind text; v_bound uuid; v_no_cp_warning jsonb;
  -- F-A2 (D9): the agent lane''s identity, carried on the EXISTING ctx bag so a deployed
  -- audited writer keeps its arity. A human approve sends none of these and behaves as before.
  v_obo uuid; v_via_wake_kind text; v_is_agent boolean; v_post_receipt_id uuid;');
  -- (2b) the ctx reads.
  v_new := replace(v_new,
    '  v_checked_via_rule:=nullif(p_ctx->>''checked_via_rule_id'','''')::uuid;',
    '  v_checked_via_rule:=nullif(p_ctx->>''checked_via_rule_id'','''')::uuid;
  v_obo:=nullif(p_ctx->>''on_behalf_of'','''')::uuid;
  v_via_wake_kind:=nullif(p_ctx->>''wake_kind'','''');
  v_is_agent:=coalesce((p_ctx->>''is_agent'')::boolean,false);
  v_post_receipt_id:=nullif(p_ctx->>''post_receipt_id'','''')::uuid;');

  -- (4) the five Tier-C detail reasons.
  v_new := replace(v_new,
    '        using errcode=''CLR23'';
    end if;
    if v_fingerprint->>''decision''=''birth'' then',
    '        using errcode=''CLR23'',detail=''{"reason":"counterparty_landscape_moved"}'';
    end if;
    if v_fingerprint->>''decision''=''birth'' then');
  v_new := replace(v_new,
    '''counterparty birth raced with a changed match landscape''
            using errcode=''CLR23'';',
    '''counterparty birth raced with a changed match landscape''
            using errcode=''CLR23'',detail=''{"reason":"counterparty_birth_race"}'';');
  v_new := replace(v_new,
    '''counterparty identity could not be resolved after birth race''
          using errcode=''CLR23'';',
    '''counterparty identity could not be resolved after birth race''
          using errcode=''CLR23'',detail=''{"reason":"counterparty_birth_race"}'';');
  v_new := replace(v_new,
    '      raise exception ''newer facts identify an unsupported currency'' using errcode=''CLR25'';',
    '      raise exception ''newer facts identify an unsupported currency''
        using errcode=''CLR25'',detail=''{"reason":"currency_unsupported"}'';');
  v_new := replace(v_new,
    '''newer machine facts contradict the draft evidence''
          using errcode=''CLR25'';',
    '''newer machine facts contradict the draft evidence''
          using errcode=''CLR25'',detail=''{"reason":"corroboration_contradicted"}'';');

  -- (3) the agent arm — the human arms stay byte-untouched behind the fence.
  v_new := replace(v_new,
    '  if clara.is_high_stakes(p_entry) then
    if e.last_human_editor is null then',
    '  -- F-A2 (D10): an UNATTENDED AGENT POST does not participate in maker/checker at all. It
  -- records approval_arm=''agent_unattended'' on its own receipt and writes NO attestation; the
  -- three human arms below are byte-untouched, and OQ-6''s supplementary ruling keeps the HUMAN
  -- lane''s distinct-checker gate on is_year_end / tax_affecting exactly as it is.
  if clara.is_high_stakes(p_entry) and not coalesce(v_is_agent,false) then
    if e.last_human_editor is null then');

  -- (2c) the identity channels.
  v_new := replace(v_new,
    '  perform clara._audit(c.firm,c.actor,null,null,''approve_entry'',p_entry,',
    '  perform clara._audit(c.firm,c.actor,v_obo,v_via_wake_kind,''approve_entry'',p_entry,');
  -- (2c-iii) THE COUNTERPARTY BIRTH EMITTER, one statement earlier in the SAME agent
  -- transaction. E.3 names three dropped identity channels and the first cut trued only two of
  -- them (_audit and entry.approved); `counterparty.created` kept hard-coded nulls, so a
  -- counterparty born INSIDE an agent post appeared in the event log as an actor with no
  -- on_behalf_of and no wake kind — the one event that says a new party entered the books,
  -- unattributable to the lane that created it. The anchor is unique in this body (the 0029 and
  -- 0035 emitters live in other functions).
  v_new := replace(v_new,
    '    perform clara._append_event(c.firm,''counterparty.created'',e.client_id,c.actor,null,null,
      null,null,null,jsonb_build_object(''counterparty_id'',v_counterparty));',
    '    perform clara._append_event(c.firm,''counterparty.created'',e.client_id,c.actor,v_obo,v_via_wake_kind,
      null,null,null,jsonb_build_object(''counterparty_id'',v_counterparty));');
  v_new := replace(v_new,
    '  perform clara._append_event(c.firm,''entry.approved'',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,''{}''::jsonb);',
    '  perform clara._append_event(c.firm,''entry.approved'',e.client_id,c.actor,v_obo,v_via_wake_kind,
    p_entry,e.document_id,null,
    case when v_post_receipt_id is null then ''{}''::jsonb
         else jsonb_build_object(''post_receipt_id'',v_post_receipt_id) end);');

  -- (1) the breeding excision, cut by POSITION between two counted anchors rather than by
  -- embedding ninety lines of the live body in this file.
  v_cut_a := position('  -- H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only. A rule-posted approval' in v_new);
  v_cut_b := position('  perform clara._audit(c.firm,c.actor,v_obo,v_via_wake_kind,''approve_entry'',p_entry,' in v_new);
  if v_cut_a = 0 or v_cut_b = 0 or v_cut_b <= v_cut_a then
    raise exception 'F-A2 §E: the breeding block''s bounds did not resolve (a=%, b=%)', v_cut_a, v_cut_b using errcode='CLR10';
  end if;
  v_block := substr(v_new, v_cut_a, v_cut_b - v_cut_a);
  -- The cut region must be the breeding block and NOTHING else: it holds both sighting inserts,
  -- both uq_rule_sightings_mapping references, the >=3 loop's coding_rules insert, its
  -- open_questions insert, its kb_rule.proposed emit and 0040's bank_rule_suggested conjunct —
  -- and it must NOT contain the subledger hook, which precedes it and stays.
  if position('insert into clara.rule_sightings' in v_block) = 0
     or position('uq_rule_sightings_mapping' in v_block) = 0
     or position('insert into clara.coding_rules' in v_block) = 0
     or position('insert into clara.open_questions' in v_block) = 0
     or position('kb_rule.proposed' in v_block) = 0
     or position('bank_rule_suggested' in v_block) = 0 then
    raise exception 'F-A2 §E: the cut region is not the whole breeding block' using errcode='CLR10';
  end if;
  if position('clara._subledger_on_approve(' in v_block) <> 0
     or position('clara._append_event(c.firm,''entry.approved''' in v_block) <> 0 then
    raise exception 'F-A2 §E: the cut region reaches past the breeding block' using errcode='CLR10';
  end if;
  v_new := replace(v_new, v_block,
    '  -- F-A2 (design §3.5): THE BREEDING BLOCK IS GONE. 0037:2046-2100''s two sighting inserts
  -- and its >=3-distinct-entry vendor_account auto-proposal loop — which wrote a coding rule,
  -- opened a blocking question and emitted the kb-rule proposal event — are excised with the
  -- rules machine F-A2 retires, and 0040:7115''s bank-rule-suggestion conjunct goes with the
  -- gate it was spliced into (INERT ON ARRIVAL by 0040:7109-7112''s own admission, so nothing
  -- behavioural is lost; B.10''s disposition is 2 -> 0, not 2 -> 1). Every marker name this
  -- block retired is written here in PROSE rather than verbatim, because 0040''s anti-revert
  -- postcheck counts the strings themselves. The TABLES survive as history:
  -- clara.rule_sightings, clara.coding_rules and clara.open_questions keep every row they hold
  -- and every reader they have. What ends is the WRITE — the aggregate this bred from is
  -- recomputed on read by the context pack''s approved-coding-patterns block (PR-1b, D16), so it
  -- cannot drift from the books, and the "no sighting recorded" advisory warning above still
  -- names the counterparty-less approval it always named. (That block''s READER is named in
  -- prose deliberately: 0019''s wiki-capability scan reads this body''s prosrc for call-edge
  -- NAMES, so writing the verb here would make an approve core look like a wiki reader — law 73
  -- says a gate may not read the pack, and the scan is how the estate proves it.)
');

  if v_new = v_src then
    raise exception 'F-A2 §E: the eighth body is byte-identical to the seventh — no splice landed' using errcode='CLR10';
  end if;
  set role clara_fn_owner;
  execute replace(v_def, v_src, v_new);
  reset role;
end
$fa2_approve$;

-- =====================================================================================
-- §F  clara._draft_entry_core, next body (design §3.5, §3.4; D1 row 2).
--
--   (1) D35 (OQ-2, owner-ruled 2026-08-22): the rule_decisions WRITE STOPS. The table and its
--       historical rows are KEPT — a live FK at 0011:898 forbids dropping it, and the rows are
--       knowledge fuel. `v_rule_decision` stays NULL from here on, so the coding-attempt payload
--       and the draft receipt report rule_decision_id null / rule_account_matched false rather
--       than a stale pin; the dashboard's `list_review_queue.rule_backed` is REMOVED in PR-3
--       rather than rendered permanently false (law 27(2)).
--   (2) N1 (design §3.4): the deferred shape floors move EARLIER, on the AGENT LANE ONLY, keyed
--       on `not p_is_human`. A human draft is a work-in-progress revise_entry exists to finish;
--       an agent draft is a PROPOSAL TO POST, and this same core already discriminates that way
--       (assert_books_current). The copies are pinned to the draft's OWN resolved extraction AND
--       to the PROJECTED counterparty — without the projection they would refuse every agent
--       sales draft and regress today's working draft path (GB-2).
--   (3) The direction-family arm is RE-CUT from `not p_is_human and p_wake_kind='autodraft'` to
--       `not p_is_human` (D11, the narrow verified claim). v1's estate-wide phrasing is
--       withdrawn; §D.5 dispositions every other wake-kind-keyed wall.
--   (4) "Widen for the generic kind" needs NO change here (judgement call 4 in the header): a
--       NULL coding_kind is already admitted at every gate this body owns.
-- =====================================================================================
do $fa2_draft$
declare v_src text; v_new text; v_cut_a int; v_cut_b int; v_block text; v_def text;
begin
  select p.prosrc, pg_get_functiondef(p.oid) into v_src, v_def from pg_proc p
   where p.oid='clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure;
  v_new := v_src;

  v_new := replace(v_new, '  v_facts_extraction uuid; v_ocr_extraction uuid;',
    '  v_facts_extraction uuid; v_ocr_extraction uuid;
  -- F-A2 N1: the projection the approve delegate will stamp, and the draft''s own extraction.
  v_projected_cp uuid; v_draft_extraction uuid;');

  v_new := replace(v_new,
    '  if not p_is_human and p_wake_kind=''autodraft'' and p_document is not null
     and p_coding_kind in (''sales_invoice'',''sales_credit_note'',''supplier_bill'') then',
    '  -- F-A2 (D11): RE-CUT from `not p_is_human and p_wake_kind=''''autodraft''''` to
  -- `not p_is_human`. The direction-family contradiction is a fact about the DOCUMENT, not about
  -- which wake kind is holding the pen, and the chat lane is direction-blind today.
  if not p_is_human and p_document is not null
     and p_coding_kind in (''sales_invoice'',''sales_credit_note'',''supplier_bill'') then');

  -- (1) the rule_decisions limb, cut by position between two counted anchors.
  v_cut_a := position('  if v_fingerprint->>''decision'' in
       (''registration_match'',''name_match_unregistered'',''alias_match'') then' in v_new);
  v_cut_b := position('  select case when exists(select 1 from clara.entry_evidence' in v_new);
  if v_cut_a = 0 or v_cut_b = 0 or v_cut_b <= v_cut_a then
    raise exception 'F-A2 §F: the rule_decisions limb''s bounds did not resolve (a=%, b=%)', v_cut_a, v_cut_b using errcode='CLR10';
  end if;
  v_block := substr(v_new, v_cut_a, v_cut_b - v_cut_a);
  if position('insert into clara.rule_decisions' in v_block) = 0
     or position('from clara.coding_rules r' in v_block) = 0
     or position('for share of r' in v_block) = 0 then
    raise exception 'F-A2 §F: the cut region is not the rule_decisions limb' using errcode='CLR10';
  end if;
  if position('clara.coding_attempts' in v_block) <> 0
     or position('journal_entry_revisions' in v_block) <> 0 then
    raise exception 'F-A2 §F: the cut region reaches past the rule_decisions limb' using errcode='CLR10';
  end if;
  v_new := replace(v_new, v_block,
    '  -- F-A2 (D35, owner-ruled 2026-08-22): THE rule_decisions WRITE STOPS HERE. The live-rule
  -- `coding_rules ... FOR SHARE` read and the rule_decisions insert are excised with the rules
  -- machine F-A2 retires. The TABLE and its rows are KEPT: 0011:898''s FK from
  -- journal_entry_revisions.rule_decision_id forbids dropping it, and the history is knowledge
  -- fuel. v_rule_decision stays NULL, so every downstream reader of it reports "no rule backed
  -- this draft" instead of pinning a rule nothing will execute.
');

  -- (2) N1's draft copies, immediately before the revision-token read: after the evidence write
  -- and the amount_exception stamp, so the floors judge the finished draft.
  v_new := replace(v_new,
    '  select revision_token into v_token from clara.journal_entries where id=v_entry;',
    '  -- F-A2 N1 (design §3.4, D31): the shape floors, at DRAFT, on the AGENT lane only, pinned to
  -- this draft''s own resolved extraction AND to the counterparty the approve delegate will
  -- stamp. The projection is what stops these copies refusing every agent sales draft — the
  -- receivable leg carries no counterparty until the delegate stamps it (GB-2).
  if not p_is_human then
    v_projected_cp := case
      when v_fingerprint is null then null
      when v_fingerprint->>''decision''=''birth'' then ''00000000-0000-4000-8000-0000000000b1''::uuid
      else clara._canonical_counterparty(p_client,(v_fingerprint->>''counterparty_id'')::uuid) end;
    v_draft_extraction := nullif(v_state->>''extraction_id'','''')::uuid;
    perform clara._assert_control_leg_counterparty_at(v_entry, v_projected_cp);
    perform clara._assert_supplier_bill_shape_at_projected(v_entry, v_draft_extraction, v_projected_cp);
    perform clara._assert_sales_invoice_shape_at(v_entry, v_draft_extraction);
  end if;
  select revision_token into v_token from clara.journal_entries where id=v_entry;');

  if v_new = v_src then
    raise exception 'F-A2 §F: no splice landed on the draft core' using errcode='CLR10';
  end if;
  set role clara_fn_owner;
  execute replace(v_def, v_src, v_new);
  reset role;
end
$fa2_draft$;

set role clara_fn_owner;

-- =====================================================================================
-- §G  T3 — the two TRIGGER FUNCTIONS are recut, not the delegates (D12).
--
-- BL-5's implied remedy — recut the 1-arity delegate — is DECLINED: it reaches the draft floor,
-- human approve and the D-P4 probe. These two trigger functions resolve the pin from the ENTRY'S
-- OWN POST RECEIPT instead. A human approval writes no receipt, so v_pin is NULL, so the
-- delegate's null-pin behaviour is reproduced BYTE-FOR-BYTE: the human-lane blast radius is zero
-- BY CONSTRUCTION rather than by argument, the 1-arity delegates stay byte-unmoved and off the
-- D1 list, and the divergence closes on BOTH arms. PR-0 attacked this pin seven ways and refuted
-- all seven; an unresolvable pin fails to NULL, which is today's behaviour and the designed
-- fallback semantics.
--
-- THE ACCESSOR IS FLAT, AND THAT IS THE WHOLE POINT: gate_verdicts->>'extraction_id' at the TOP
-- level. A nested accessor here yields NULL, which IS the unpinned behaviour this recut removes,
-- and it would do so WITHOUT FAILING ANYTHING. The table's own CHECK requires the key non-blank,
-- which is the structural half of C.7's must-fail cell.
-- =====================================================================================
create or replace function clara._tf_assert_supplier_bill_shape() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_pin uuid;
begin
  v_pin := (select (r.gate_verdicts->>'extraction_id')::uuid
              from clara.entry_post_receipts r where r.entry_id = new.id);
  perform clara._assert_supplier_bill_shape_at(new.id, v_pin);   -- NULL => today's exact behaviour
  return null;
end $$;

create or replace function clara._tf_assert_sales_invoice_shape() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_pin uuid;
begin
  v_pin := (select (r.gate_verdicts->>'extraction_id')::uuid
              from clara.entry_post_receipts r where r.entry_id = new.id);
  perform clara._assert_sales_invoice_shape_at(new.id, v_pin);   -- NULL => today's exact behaviour
  return null;
end $$;

reset role;

-- =====================================================================================
-- §H  THE `interactive_client` LIMB — GB-3's CORRECTED form, in the train on D34.
--
-- WHY THIS IS AN EXTENSION AND NOT C-3's WEAKENING, said here against C-3's own record. C-3
-- reversed a proposal to let a PLAIN `interactive` credential carry a client, because the reader
-- census showed `list_unassigned_documents` regressing, `coding_lane` widening SILENTLY (it has
-- no is-not-null guard on w.client_id, so a frozen chatTurn_v12's answers would change with no
-- byte change anywhere), eight further readers flipping, and 0011:1980-1983's PIN BLOCKER
-- contradicted. NONE of that happens here: the three existing kinds keep byte-identical
-- semantics, no plain `interactive` credential gains a client, and R-1 narrows the new kind to
-- EXACTLY ONE call path — the fail-closed `wake_open_question` call — so `_agent_read_admitted`,
-- `coding_lane` and the eight further readers are never handed a pinned credential at all. This
-- file touches neither of them.
--
-- GB-3'S TWO HIDDEN FAILURE MODES, BOTH CLOSED HERE. (1) `ck_wake_credentials_client_0011` is
-- ITSELF a closed-world enumeration over the three existing kinds, so extending only the KIND
-- CHECK leaves the credential UNMINTABLE. (2) `mint_wake_credential` carries an EARLY kind gate
-- above the per-kind arms, so extending only the arms leaves every mint refused `bad wake_kind`.
-- Both CHECKs are drop+add and validate trivially over existing rows — every live row's kind is
-- one of the old three — which §0.6 measured rather than asserted.
--
-- `wake_open_question` RE-KEYS ONTO THE CLIENT PIN, NOT THE KIND NAME (law 27(3)): the wall was
-- always the pin, and the kind name was a proxy for it. It admits `autodraft` and
-- `interactive_client` alike and still refuses ANY credential whose client is unpinned or does
-- not match the call.
-- =====================================================================================
alter table clara.wake_credentials drop constraint ck_wake_credentials_kind_0011;
alter table clara.wake_credentials add constraint ck_wake_credentials_kind_0011
  check (wake_kind in ('interactive','proactive','autodraft','interactive_client'));
alter table clara.wake_credentials drop constraint ck_wake_credentials_client_0011;
alter table clara.wake_credentials add constraint ck_wake_credentials_client_0011
  check (
    (wake_kind = 'autodraft' and client_id is not null)
    or (wake_kind in ('interactive','proactive') and client_id is null)
    -- THE THIRD DISJUNCT, and the only one this file adds: the pinned chat kind REQUIRES a
    -- client and KEEPS on_behalf_of (which autodraft forbids — A.1 finding 7).
    or (wake_kind = 'interactive_client' and client_id is not null));

do $fa2_wake$
declare v_src text; v_new text; v_def text;
begin
  select p.prosrc, pg_get_functiondef(p.oid) into v_src, v_def
    from pg_proc p where p.oid='clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure;
  v_new := replace(v_src,
    '  if p_wake_kind is null or p_wake_kind not in (''interactive'',''proactive'',''autodraft'') then',
    '  -- F-A2 (D34/GB-3): the EARLY kind gate, extended. Extending only the per-kind arms below
  -- would leave every interactive_client mint refused `bad wake_kind` — GB-3''s second hidden
  -- failure mode, discoverable only at apply time.
  if p_wake_kind is null or p_wake_kind not in (''interactive'',''proactive'',''autodraft'',''interactive_client'') then');
  v_new := replace(v_new,
    '  elsif p_client is not null then
    raise exception ''legacy wake kinds do not accept a client binding'' using errcode=''CLR10'';',
    '  elsif p_wake_kind=''interactive_client'' then
    -- The pinned chat kind: a firm-congruent ACTIVE client exactly as autodraft demands, and
    -- on_behalf_of is KEPT (the generic bookkeeper+ membership check above still governs it).
    -- Honest footnote: this verifies firm-congruent and active, NOT that this human is
    -- authorised for that client — the estate''s existing firm-scoped model, opening nothing new.
    if p_client is null or not exists(
        select 1 from clara.clients where id=p_client and firm_id=p_firm and status=''active'') then
      raise exception ''interactive_client wake requires a firm-congruent active client''
        using errcode=''CLR10'';
    end if;
  elsif p_client is not null then
    raise exception ''legacy wake kinds do not accept a client binding'' using errcode=''CLR10'';');
  if v_new = v_src then
    raise exception 'F-A2 §H: neither mint gate spliced' using errcode='CLR10';
  end if;
  set role clara_fn_owner;
  execute replace(v_def, v_src, v_new);
  reset role;

  select p.prosrc, pg_get_functiondef(p.oid) into v_src, v_def
    from pg_proc p where p.oid='clara.wake_open_question(uuid,text,uuid,text,text)'::regprocedure;
  v_new := replace(v_src,
    '  if w.wake_kind<>''autodraft'' or w.client_id is null
     or w.client_id is distinct from p_client then',
    '  -- F-A2 (D34, law 27(3)): RE-KEYED ONTO THE CLIENT PIN, not the kind name. The wall was
  -- always the pin — 0011:1980-1983''s PIN BLOCKER says so in words — and this satisfies that
  -- blocker''s own stated exit condition rather than deleting it. autodraft and
  -- interactive_client both reach here; anything unpinned, or pinned to another client, does not.
  if w.client_id is null
     or w.client_id is distinct from p_client then');
  if v_new = v_src then
    raise exception 'F-A2 §H: wake_open_question did not re-key' using errcode='CLR10';
  end if;
  set role clara_fn_owner;
  execute replace(v_def, v_src, v_new);
  reset role;
end
$fa2_wake$;

-- =====================================================================================
-- §I  The two new event kinds, EACH WITH ITS TAXONOMY PAIR. Both carry on_behalf_of and
-- via_wake_kind on every emit.
--
-- THE PAIR IS NOT OPTIONAL, and the 0015:388-395 idiom is copied rather than invented: the
-- estate holds a FULL-COVERAGE LAW — every row of clara.event_types must be mapped by the
-- ACTIVE clara.trigger_taxonomy version — so an event type registered without its decision is
-- an event the runtime cannot route, and the rig says so (rig-docs-events.test.mjs:79).
--
-- THE TWO DECISIONS, and why they differ. `entry.posted` routes 'notification': it is the
-- successor to `entry.rule_posted`, which routes the same way, and a post that happened while
-- nobody was watching is precisely the thing a human is entitled to be told about.
-- `entry.post_refused` routes 'background_review': at 0/33 corroboration the ladder refuses
-- everything, so notifying per refusal would bury the notification channel on day one — the
-- refusal's durable home is the op receipt and the review queue, which is what a background
-- review reads.
with added(name, client_scoped, description, decision, note) as (values
  ('entry.posted', true,
   'A journal entry was POSTED unattended by the agent (F-A2); the receipt is clara.entry_post_receipts',
   'notification', null::text),
  ('entry.post_refused', true,
   'An unattended agent post was refused at Tier B or Tier C; the payload carries the full rung vector',
   'background_review', null::text)
), inserted_types as (
  insert into clara.event_types(name, client_scoped, description)
  select name, client_scoped, description from added
  on conflict (name) do nothing returning name
)
insert into clara.trigger_taxonomy(version, event_type, decision, note)
select a.version, x.name, x.decision, x.note from added x
join inserted_types i on i.name = x.name cross join clara.taxonomy_active a;

-- =====================================================================================
-- §J  TAIL CENSUS. Re-read the committed catalog and say what it found.
-- =====================================================================================
do $fa2_tail$
declare
  v_src text; v_n int; v_key text; v_role text; v_sig text; v_def text; v_grantees text[];
  v_receipt_cols int; v_inert int; v_bad text;
begin
  -- (J.1) The receipt table: forced RLS, the policy pair, append-only, no-truncate, NO DML.
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='entry_post_receipts'
        and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'F-A2 tail: entry_post_receipts lacks forced RLS' using errcode='CLR10';
  end if;
  if (select count(*) from pg_policy where polrelid='clara.entry_post_receipts'::regclass) <> 2 then
    raise exception 'F-A2 tail: entry_post_receipts does not carry exactly the owner+read policy pair' using errcode='CLR10';
  end if;
  foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
      'clara_runtime_login','clara_wake_interactive','clara_wake_proactive'] loop
    if to_regrole(v_role) is not null and (
         has_table_privilege(v_role,'clara.entry_post_receipts','insert')
      or has_table_privilege(v_role,'clara.entry_post_receipts','update')
      or has_table_privilege(v_role,'clara.entry_post_receipts','delete')) then
      raise exception 'F-A2 tail: % holds DML on entry_post_receipts — the row is written only by the post core', v_role using errcode='CLR10';
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgrelid='clara.entry_post_receipts'::regclass and not tgisinternal) <> 2 then
    raise exception 'F-A2 tail: entry_post_receipts is missing an append-only / no-truncate trigger' using errcode='CLR10';
  end if;
  select count(*)::int into v_receipt_cols from pg_attribute
   where attrelid='clara.entry_post_receipts'::regclass and attnum>0 and not attisdropped;
  if v_receipt_cols <> 14 then
    raise exception 'F-A2 tail: entry_post_receipts has % columns, expected Annex E.1''s 14', v_receipt_cols using errcode='CLR10';
  end if;
  -- R-3's wall, re-read: the model conjunct must compare against a TWO-apostrophe default. A
  -- four-apostrophe default (`coalesce(model_snapshot->>'model','''')`) makes the conjunct
  -- ALWAYS-TRUE, on the wall that records WHICH MODEL posted.
  --
  -- THE FIRST CUT OF THIS GUARD COULD NOT FAIL, and that is worth writing down because the guard
  -- exists BECAUSE of a silent pass. It searched for the empty-string literal as a SUBSTRING —
  -- but the four-apostrophe rendering CONTAINS that substring (its last two apostrophes plus the
  -- cast), so the bad shape satisfied the guard as comfortably as the good one. Measured on the
  -- rig against both texts before this was rewritten.
  --
  -- THE PREDICATE NOW READS THE THING ITSELF: a rendered constraint whose defaults and
  -- comparands are all empty strings can never contain three consecutive apostrophes, and any
  -- non-empty literal renders as four. So the wall is "no run of 3+ apostrophes", plus the
  -- positive presence read the first cut already made.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.entry_post_receipts'::regclass and pg_get_constraintdef(c.oid) like '%model_snapshot%';
  if v_def is null or position('''''::text' in v_def) = 0 then
    raise exception 'F-A2 tail: the model_snapshot CHECK does not compare against an empty-string default: %', v_def using errcode='CLR10';
  end if;
  -- THE GUARD IS SHOWN TO SAY NO, on a constructed instance of the exact shape it exists to
  -- catch. A guard that has only ever been observed passing is not evidence (review law 2).
  v_bad := 'CHECK (btrim(COALESCE((model_snapshot ->> ''model''::text), ''''''''::text)) <> ''''::text)';
  if not (v_bad ~ '''{3,}') then
    raise exception 'F-A2 tail: the R-3 guard cannot see a four-apostrophe default — the guard itself is inert: %', v_bad using errcode='CLR10';
  end if;
  if position('''''::text' in v_bad) = 0 then
    raise exception 'F-A2 tail: the R-3 negative control is malformed — it must satisfy the OLD substring read, or it does not reproduce the silent pass' using errcode='CLR10';
  end if;
  if v_def ~ '''{3,}' then
    raise exception 'F-A2 tail: the model_snapshot CHECK carries a NON-EMPTY literal — the model conjunct is always-true: %', v_def using errcode='CLR10';
  end if;

  -- (J.2) The receipt wall: deferred, initially deferred, on the draft->approved transition.
  if not exists(select 1 from pg_trigger where tgname='t_je_agent_post_receipt'
      and tgrelid='clara.journal_entries'::regclass and tgdeferrable and tginitdeferred) then
    raise exception 'F-A2 tail: t_je_agent_post_receipt is not a DEFERRABLE INITIALLY DEFERRED constraint trigger' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid='clara.journal_entries'::regclass and not tgisinternal;
  if v_n <> 17 then
    raise exception 'F-A2 tail: journal_entries now carries % triggers, expected 16 + t_je_agent_post_receipt', v_n using errcode='CLR10';
  end if;
  -- INERTNESS, MEASURED not asserted: BOTH halves of the population the wall's live arm covers
  -- are unchanged from the prestate. Two reads, because the wall covers every agent-approved
  -- transition and a single rule-id-filtered read is exactly what let the unauthorised exemption
  -- hide in the first place.
  select count(*)::int into v_inert from clara.journal_entries e
   join clara.users u on u.id = e.checker_actor
   where e.status='approved' and u.is_agent and e.checked_via_rule_id is null;
  if v_inert::text is distinct from (select v from _fa2p1_pre where k='agent_checked_no_rule_entries') then
    raise exception 'F-A2 tail: the receipt wall''s live population moved during this migration' using errcode='CLR10';
  end if;
  select count(*)::int into v_inert from clara.journal_entries e
   join clara.users u on u.id = e.checker_actor
   where e.status='approved' and u.is_agent and e.checked_via_rule_id is not null;
  if v_inert::text is distinct from (select v from _fa2p1_pre where k='agent_checked_with_rule_entries') then
    raise exception 'F-A2 tail: the rule-id half of the receipt wall''s population moved during this migration' using errcode='CLR10';
  end if;
  -- ...and the unauthorised exemption is GONE from the shipped body, read positively.
  select p.prosrc into v_src from pg_proc p where p.proname='_tf_assert_agent_post_receipt'
    and p.pronamespace='clara'::regnamespace;
  if position('checked_via_rule_id' in v_src) <> 0 then
    raise exception 'F-A2 tail: the receipt wall still carries a checked_via_rule_id exemption -- E.3 authorises none' using errcode='CLR10';
  end if;
  if position('if not v_is_agent then' in v_src) = 0 then
    raise exception 'F-A2 tail: the receipt wall''s live arm is not keyed on is_agent alone' using errcode='CLR10';
  end if;

  -- (J.3) The ladder and the predicates: created, ungranted, definer, pinned path, one overload.
  foreach v_sig in array array[
    'clara._agent_post_entry_core(uuid,uuid,uuid,text,uuid,uuid,uuid,bigint,text,jsonb,text)',
    'clara._assert_control_leg_counterparty_at(uuid,uuid)',
    'clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)',
    'clara._post_counterparty_projection(uuid)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A2 tail: % was not created', v_sig using errcode='CLR10';
    end if;
    if not exists(select 1 from pg_proc f where f.oid=v_sig::regprocedure and f.prosecdef
        and f.proconfig @> array['search_path=clara, pg_temp']) then
      raise exception 'F-A2 tail: posture wrong for %', v_sig using errcode='CLR10';
    end if;
    -- Reachable by NO application role, and by no PUBLIC grant. Part 2's wrapper is the door.
    select coalesce(array_agg(g order by g),'{}') into v_grantees from (
      select distinct case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
        from pg_proc f cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
       where f.oid = v_sig::regprocedure and a.privilege_type='EXECUTE' and a.grantee <> f.proowner) q;
    if v_grantees <> '{}'::text[] then
      raise exception 'F-A2 tail: % has EXECUTE grantees % — part 1 grants NOTHING', v_sig, v_grantees using errcode='CLR10';
    end if;
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_runtime_login','clara_wake_interactive','clara_wake_proactive'] loop
      if to_regrole(v_role) is not null and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'F-A2 tail: % executes the ungranted %', v_role, v_sig using errcode='CLR10';
      end if;
    end loop;
  end loop;

  -- (J.3b) D26 AT THE PRODUCER, proven rather than asserted. The consumer contract says a
  -- MISSING key and an unknown value are non-admitting; the producer's own admission count has
  -- to obey the same law, and the first cut did not: expanding the vector into rows sees no row
  -- for an absent key, and a JSON-null value yields SQL NULL, so the inequality counted neither.
  -- Both shapes would have POSTED. The shape check below is paired with an EXECUTED probe
  -- on both fail-open shapes plus a healthy control, because a guard that has never been shown
  -- to say NO is not evidence (the same discipline §J applies to the R-3 wall).
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._agent_post_entry_core(uuid,uuid,uuid,text,uuid,uuid,uuid,bigint,text,jsonb,text)'::regprocedure;
  if position('unnest(v_rungs) r where coalesce(v_vector->>r' in v_src) = 0
     or position('jsonb_each_text(v_vector)' in v_src) <> 0 then
    raise exception 'F-A2 tail: the Tier-B admission count is not roster-driven -- a missing or json-null rung slot would ADMIT (D26)' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from unnest(array['B1','B2']) r
   where coalesce(('{"B1":"pass"}'::jsonb)->>r,'') <> 'pass';
  if v_n <> 1 then
    raise exception 'F-A2 tail: the admission predicate ADMITS a missing rung slot' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from unnest(array['B1','B2']) r
   where coalesce(('{"B1":"pass","B2":null}'::jsonb)->>r,'') <> 'pass';
  if v_n <> 1 then
    raise exception 'F-A2 tail: the admission predicate ADMITS a json-null rung slot' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from unnest(array['B1','B2']) r
   where coalesce(('{"B1":"pass","B2":"pass"}'::jsonb)->>r,'') <> 'pass';
  if v_n <> 0 then
    raise exception 'F-A2 tail: POSITIVE CONTROL -- the admission predicate refuses a complete passing vector' using errcode='CLR10';
  end if;

  -- (J.4a) E.3's THREE identity channels, all three. The first cut trued `_audit` and
  -- `entry.approved` and missed the counterparty-birth emitter between them, so the check is
  -- written as a closed census of the null-identity emit shape rather than as three spot reads:
  -- ANY `_append_event` in this body still passing a literal `null,null` where obo and wake kind
  -- belong is a finding, whichever event it names.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  if position('''counterparty.created'',e.client_id,c.actor,v_obo,v_via_wake_kind' in v_src) = 0 then
    raise exception 'F-A2 tail: the counterparty.created emitter does not carry the ctx identity (E.3 channel 3)' using errcode='CLR10';
  end if;
  if position('''counterparty.created'',e.client_id,c.actor,null,null' in v_src) <> 0 then
    raise exception 'F-A2 tail: a null-identity counterparty.created emit survives in the approve body' using errcode='CLR10';
  end if;

  -- (J.4) The eighth approve body: the RETIRE markers gone at their stated counts, the eight
  -- CARRY markers surviving at 1, bank_rule_suggested at 0, the five Tier-C reasons present, and
  -- the human maker/checker lane byte-untouched.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure;
  foreach v_key in array array['insert into clara.rule_sightings','uq_rule_sightings_mapping',
      'H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only','bank_rule_suggested',
      'insert into clara.coding_rules','kb_rule.proposed'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 0 then
      raise exception 'F-A2 tail: RETIRED marker % still occurs % times in the eighth body', v_key, v_n using errcode='CLR10';
    end if;
  end loop;
  foreach v_key in array array[
      'opening_entry_k_family_only','[R1-F1] K-family-only lifecycle boundary','receipt_preheld',
      'bound_extraction','unpinned_rule_post','settlement_not_autopostable',
      'clara._subledger_on_approve(','no_counterparty_sighting',
      'attestation_required','distinct_checker','self_attestation'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 1 then
      raise exception 'F-A2 tail: CARRY marker % occurs % times in the eighth body (expected 1)', v_key, v_n using errcode='CLR10';
    end if;
  end loop;
  foreach v_key in array array['"reason":"counterparty_landscape_moved"','"reason":"currency_unsupported"',
      '"reason":"corroboration_contradicted"'] loop
    v_n := (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key);
    if v_n <> 1 then
      raise exception 'F-A2 tail: Tier-C reason % occurs % times (expected 1)', v_key, v_n using errcode='CLR10';
    end if;
  end loop;
  v_n := (length(v_src) - length(replace(v_src, '"reason":"counterparty_birth_race"', ''))) / length('"reason":"counterparty_birth_race"');
  if v_n <> 2 then
    raise exception 'F-A2 tail: counterparty_birth_race occurs % times (expected 2)', v_n using errcode='CLR10';
  end if;
  if position('and not coalesce(v_is_agent,false) then' in v_src) = 0
     or position('v_obo,v_via_wake_kind,''approve_entry''' in v_src) = 0
     or position('''post_receipt_id'',v_post_receipt_id' in v_src) = 0 then
    raise exception 'F-A2 tail: the eighth body is missing the agent arm or an identity channel' using errcode='CLR10';
  end if;
  -- LAW 73, PROVED ON THIS BODY RATHER THAN PROMISED. 0019's wiki-capability scan reads prosrc
  -- for call-edge NAMES, so a body that merely MENTIONS a pack or wiki verb — in a comment as
  -- readily as in code — reads as an authority that can see the pack. An approve core may not.
  -- This tail is the same instrument, run here, so the next recut of this body fails at APPLY
  -- instead of in the wave-b tail three files away.
  foreach v_key in array array['publish_wiki_page_version','_publish_wiki_page_version_core',
      'record_wiki_source_ingest','retire_wiki_page','set_wiki_synthesis_hold',
      'clear_wiki_synthesis_hold','get_wiki_page','list_wiki_pages','get_context_pack',
      'run_client_lint','run_lint_all','mark_wiki_citations_stale',
      '_assert_filing_wiki_unreferenced','wiki_pages','wiki_page_versions'] loop
    if position(v_key in v_src) <> 0 then
      raise exception 'F-A2 tail: the eighth _approve_entry_core body names the wiki-capability token % — a gate, bound or floor may never read wiki or the pack (law 73), and 0019''s scan reads this body''s TEXT', v_key
        using errcode='CLR10';
    end if;
  end loop;

  -- (J.5) The draft core: the write is gone, N1 landed, the arm is re-cut.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure;
  if position('insert into clara.rule_decisions' in v_src) <> 0 then
    raise exception 'F-A2 tail: the draft core still writes rule_decisions (D35)' using errcode='CLR10';
  end if;
  if position('p_wake_kind=''autodraft'' and p_document is not null' in v_src) <> 0 then
    raise exception 'F-A2 tail: the direction-family arm is still wake-kind-keyed (D11)' using errcode='CLR10';
  end if;
  if position('clara._assert_control_leg_counterparty_at(v_entry, v_projected_cp)' in v_src) = 0
     or position('clara._assert_supplier_bill_shape_at_projected(v_entry' in v_src) = 0
     or position('clara._assert_sales_invoice_shape_at(v_entry' in v_src) = 0 then
    raise exception 'F-A2 tail: N1''s three draft copies did not land' using errcode='CLR10';
  end if;
  if to_regclass('clara.rule_decisions') is null or to_regclass('clara.rule_sightings') is null
     or to_regclass('clara.coding_rules') is null then
    raise exception 'F-A2 tail: a KEEP-AS-HISTORY table was dropped — this file stops WRITES, never relations' using errcode='CLR10';
  end if;

  -- (J.6) The floor split, and the two delegates BYTE-UNMOVED (T3's whole point).
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure;
  if position('every control-class line requires a counterparty' in v_src) <> 0
     or position('clara._assert_supplier_bill_shape_at_projected(p_entry, p_extraction, null)' in v_src) = 0 then
    raise exception 'F-A2 tail: the 2-arity supplier floor is not the thin delegate passing NULL' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)'::regprocedure;
  v_n := (length(v_src) - length(replace(v_src, 'clara._assert_control_leg_counterparty_at(p_entry, p_projected)', '')))
         / length('clara._assert_control_leg_counterparty_at(p_entry, p_projected)');
  if v_n <> 1 then
    raise exception 'F-A2 tail: the projected floor calls the extracted predicate % times (expected 1)', v_n using errcode='CLR10';
  end if;
  -- Its everything-else must be the live floor's text: the type binding, the laundering guards
  -- and the rounding bound all survive the move.
  foreach v_key in array array['type_polarity_mismatch','a supplier bill admits no receivable-class leg',
      'a supplier bill admits no payable-class debit leg','supplier bill requires a payable-class credit'] loop
    if position(v_key in v_src) = 0 then
      raise exception 'F-A2 tail: the projected floor lost %', v_key using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array array['clara._assert_supplier_bill_shape(uuid)','clara._assert_sales_invoice_shape(uuid)',
      'clara._assert_sales_invoice_shape_at(uuid,uuid)'] loop
    select p.prosrc into v_src from pg_proc p where p.oid=v_sig::regprocedure;
    if encode(sha256(convert_to(v_src,'UTF8')),'hex') is distinct from (select v from _fa2p1_pre where k='sha:'||v_sig) then
      raise exception 'F-A2 tail: % moved — it must be BYTE-UNMOVED', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (J.7) T3's two recuts, keyed on the receipt.
  foreach v_sig in array array['clara._tf_assert_supplier_bill_shape()','clara._tf_assert_sales_invoice_shape()'] loop
    select p.prosrc into v_src from pg_proc p where p.oid=v_sig::regprocedure;
    if position('clara.entry_post_receipts' in v_src) = 0
       or position('gate_verdicts->>''extraction_id''' in v_src) = 0 then
      raise exception 'F-A2 tail: % is not receipt-keyed', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (J.8) The wake limb (D34).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.wake_credentials'::regclass and c.conname='ck_wake_credentials_kind_0011';
  if position('interactive_client' in v_def) = 0 or position('proactive' in v_def) = 0
     or position('autodraft' in v_def) = 0 or position('''interactive''' in v_def) = 0 then
    raise exception 'F-A2 tail: the kind CHECK is not the four-kind enumeration: %', v_def using errcode='CLR10';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.wake_credentials'::regclass and c.conname='ck_wake_credentials_client_0011';
  -- EXTEND-NEVER-WEAKEN, asserted at the text: the two original disjuncts must still be there
  -- verbatim in meaning — autodraft REQUIRES a client, interactive/proactive REQUIRE none.
  if position('(wake_kind = ''autodraft''::text) AND (client_id IS NOT NULL)' in v_def) = 0
     or position('(wake_kind = ANY (ARRAY[''interactive''::text, ''proactive''::text])) AND (client_id IS NULL)' in v_def) = 0
     or position('(wake_kind = ''interactive_client''::text) AND (client_id IS NOT NULL)' in v_def) = 0 then
    raise exception 'F-A2 tail: the client CHECK is not the original two disjuncts PLUS the new one: %', v_def using errcode='CLR10';
  end if;
  if (select count(*) from clara.wake_credentials) is distinct from (select v::bigint from _fa2p1_pre where k='live_credentials') then
    raise exception 'F-A2 tail: the credential population moved during a CHECK swap' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.mint_wake_credential(text,uuid,uuid,interval,uuid)'::regprocedure;
  if position('''interactive_client'') then' in v_src) = 0
     or position('elsif p_wake_kind=''interactive_client'' then' in v_src) = 0
     or position('autodraft wake requires a firm-congruent active client and no on_behalf_of' in v_src) = 0
     or position('legacy wake kinds do not accept a client binding' in v_src) = 0 then
    raise exception 'F-A2 tail: mint_wake_credential is missing a gate, or lost a legacy arm' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.wake_open_question(uuid,text,uuid,text,text)'::regprocedure;
  if position('w.wake_kind<>''autodraft''' in v_src) <> 0
     or position('w.client_id is distinct from p_client' in v_src) = 0 then
    raise exception 'F-A2 tail: wake_open_question is not re-keyed onto the client pin' using errcode='CLR10';
  end if;
  -- NOT TOUCHED, and named so: R-1 keeps the pinned kind off every scoped read, which is exactly
  -- why §D.2's census findings 1-3 do not fire.
  foreach v_sig in array array['clara._agent_read_admitted(text,uuid)','clara.coding_lane(uuid,uuid)'] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'F-A2 tail: % vanished', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (J.9) The event kinds AND their taxonomy pairs, and the frozen schemas. The pair half is
  -- asserted against the ACTIVE version, which is the full-coverage law's own instrument.
  if (select count(*) from clara.event_types where name in ('entry.posted','entry.post_refused')) <> 2 then
    raise exception 'F-A2 tail: the two new event kinds are not both registered' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version = t.version and a.singleton
   where t.event_type in ('entry.posted','entry.post_refused');
  if v_n <> 2 then
    raise exception 'F-A2 tail: % of 2 new event kinds are mapped by the ACTIVE taxonomy — the full-coverage law refuses an unrouted type', v_n using errcode='CLR10';
  end if;
  -- And the law itself, re-read whole rather than sampled on this file's own two rows.
  select count(*)::int into v_n from clara.event_types et
   where et.name not like 'rig.%'
     and not exists(select 1 from clara.trigger_taxonomy t
       join clara.taxonomy_active a on a.version = t.version and a.singleton
      where t.event_type = et.name);
  if v_n <> 0 then
    raise exception 'F-A2 tail: % event type(s) are unmapped by the active taxonomy', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('workflow','graphile_worker','spike') and c.relkind='r';
  insert into _fa2p1_pre(k,v) values ('frozen_relations', v_n::text);

  raise notice 'F-A2 part1 tail: OK -- clara.entry_post_receipts created (14 columns, forced RLS, owner+read policy pair, append-only + no-truncate, ZERO DML to any app role) and walled by the DEFERRED t_je_agent_post_receipt (ARM-0 first, live arm fenced on is_agent AND a null rule id; % existing approved entr(y/ies) sit in that fence, unchanged across this apply); journal_entries now carries 17 triggers, 12 of them deferred. The ladder, the extracted control-leg predicate, the projected supplier floor and the counterparty projection are created and reachable by NO application role and no PUBLIC grant -- part 2 is the only door. The EIGHTH _approve_entry_core body carries 0 breeding markers (3 names / 5 occurrences retired, bank_rule_suggested 2 -> 0), all 8 CARRY markers at 1, the three human CLR05 arms verbatim, the agent arm behind `not v_is_agent`, both identity channels and 5 Tier-C detail reasons; registration_conflict and customer_identity_name_only were ALREADY typed and cost zero body edits. The draft core writes no rule_decisions (D35), carries N1''s three projected-state copies and a direction-family arm keyed on p_is_human alone (D11); rule_decisions, rule_sightings and coding_rules keep every row. Both 1-arity shape delegates and the sales floor are BYTE-UNMOVED (sha-compared), and T3''s two trigger functions are receipt-keyed. The wake limb ships in GB-3''s corrected form: BOTH CHECKs extended over % live credential(s) with the original disjuncts intact, BOTH mint gates extended, wake_open_question re-keyed onto the client pin; _agent_read_admitted and coding_lane are untouched. No table in workflow/graphile_worker/spike touched (% relations, read-only census).',
    v_inert, (select v from _fa2p1_pre where k='live_credentials'), v_n;
end
$fa2_tail$;
