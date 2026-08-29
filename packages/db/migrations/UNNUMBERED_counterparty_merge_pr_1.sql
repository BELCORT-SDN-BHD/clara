-- =====================================================================================
-- 裁-19 · PR-1 — the counterparty-merge CANONICALISING READ LAYER, the merge carrier
-- clara.counterparty_merges, and M9's live defect.
--
-- DESIGN OF RECORD: docs/plan/active/counterparty-merge-design.md (§3.1 D-01 read half,
-- §3.3 the three read recuts, §3.4 the carrier) · mechanics
-- docs/plan/active/counterparty-merge-annexes.md (A.1, A.2, B.1, B.2, B.3) · gate record
-- docs/plan/active/counterparty-merge-gate-record.md · rulings
-- docs/plan/active/mohe-grill-rulings-2026-08-28.md §裁-24.
--
-- WHAT 裁-24 RULED, AND WHAT THIS FILE CARRIES. OQ-1 came back a HYBRID: the
-- canonicalising READ layer STAYS (it is what frozen fiscal years and history use) and a
-- re-home WRITE door is ADDED over it for OPEN items in UNFROZEN periods. THIS FILE SHIPS
-- THE READ HALF, THE CARRIER, AND M9. THE WRITE HALF IS NOT IN THIS FILE, and the reason
-- is a MEASURED STRUCTURAL FACT, not a scoping preference — it is written out in full at
-- the "THE WRITE HALF IS BLOCKED" block below and put to the owner in the PR body. Nothing
-- in this file forecloses either shape.
--
-- OWNER QUESTIONS RULED AND APPLIED HERE: OQ-2 YES (a visible recorded_counterparty_id on
-- aging and statement rows — D-03) · OQ-3 LEAVE (_metric_input_dataset_v1 is NOT touched;
-- sealed snapshots keep the recorded party — D-04) · OQ-6 M9 fixed INSIDE this PR, named
-- (D-11) · OQ-7 counterparty.unmerged → 'context_update' (the taxonomy row lands here so
-- PR-2's door has nothing to register).
--
-- =====================================================================================
-- THE WRITE HALF IS BLOCKED — the measurement, so the owner rules on evidence
-- =====================================================================================
-- 裁-24's write door mints, per open item, a NEW clara.open_items row under the survivor
-- carrying the ORIGINAL item_date, with the old row marked superseded and back-pointed.
-- Two live walls make that unbuildable without recutting bodies a RULING says to leave:
--
--   (1) clara._subledger_classify_entry (LADDERS 1/2/3-5) CANONICALISES the counterparty
--       on every ladder. After a merge, the merged party and the survivor ARE one canonical
--       party — so NO journal entry can produce a classifier row that distinguishes them,
--       and any two open_items on them land in ONE canonical group.
--   (2) clara._tf_subledger_item_belt asserts, per INSERT, that the (entry, domain,
--       CANONICAL counterparty) group's SUM and its single item_kind are EXACTLY what the
--       classifier produces. A re-homed row therefore doubles its own group and the belt
--       REFUSES it; clara._tf_subledger_entry_belt (both arms) refuses every later write to
--       that entry for the same reason.
--
-- A superseded-exclusion recut fixes both — and the closed-world catalog census run for
-- this file (pg_proc.prosrc ~ 'clara[.]open_items', 23 bodies) says the same predicate is
-- then owed by clara._subledger_classify_entry (a reversal would negate 2x), both belts,
-- clara._subledger_outstanding / _asof (allocations must follow the re-home chain),
-- clara._agent_get_bank_pack_core, clara._subledger_decompose_preview,
-- clara._resolve_and_book_bank_line_core, and — the collision — clara._metric_input_dataset_v1,
-- which OQ-3 RULED "leave". A ruled answer against a ruled answer is a hard-constraint-1
-- collision and goes to the owner, never to this lane. §7/R-1 priced the write half at
-- "roughly triple this design's width"; the measurement above is that price, itemised.
--
-- =====================================================================================
-- FRONTEND HOMES (.claude/rules/db-migrations.md, the 裁-7 rule) — one line per surface
-- =====================================================================================
--   · clara.counterparty_merges  — SELECT to clara_authenticated, firm-scoped. Home: the
--     counterparty HYGIENE PANEL (apps/web/components/registers/counterparty-hygiene-panel.tsx),
--     which already renders the ArApCounterparty.statusMerged chip on a merged row; PR-3
--     hangs the merge record (and PR-2's un-merge trigger) off exactly that row. Design §3.8.
--   · clara.merge_counterparties — an EXISTING clara_authenticated door, body replaced, no
--     new grant. Home unchanged: MergeCounterpartiesDialog.tsx / CounterpartyMergePreviewCard.tsx.
--     Its receipt gains ONE key, `merge_id` — PR-3's dialog and PR-2's un-merge key on it.
--   · clara._aging_core / clara._statement_core — internal cores behind ar_aging/ap_aging and
--     customer_statement/supplier_statement. Homes unchanged: aging-register.tsx and
--     counterparty-statement-panel.tsx; both gain recorded_counterparty_id in PR-3 (OQ-2).
--   · clara.list_open_items_by_counterparty — an EXISTING clara_authenticated door, body
--     replaced, no new grant. Home unchanged: apps/web/lib/bank/match-reads.ts →
--     the /bank settle_from_bank_line allocation picker (and apps/dashboard/app/shared/bankApi.ts).
--   · clara.event_types / clara.trigger_taxonomy rows — catalog vocabulary, no UI.
--
-- =====================================================================================
-- D1 WRITE-QUIESCE INVENTORY (packages/db/README.md "Deploy contract"; Annex B.3 window A)
-- =====================================================================================
--   A1 clara.merge_counterparties(uuid,uuid,uuid,text,text)  — AUDITED WRITER, replaced. A
--      merge in flight across this migration would write no counterparty_merges row and be
--      permanently un-un-mergeable.
--   A2 clara._aging_core(uuid,uuid,text,date)                — stable read, but called inside
--      _control_tie_core → _evaluate_one_gate → begin_close/finalize_close. A close spanning
--      the migration would mix generations across gate evaluations within ONE run.
--      ITS FOUR LIVE CONSUMERS, measured from the catalog rather than remembered:
--      clara.ar_aging, clara.ap_aging, clara._control_tie_core, and — the one the design's
--      §3.3 list omitted — clara._snapshot_dataset, which consumes the aging GRAND TOTAL only.
--      Regrouping cannot move a grand total, so that fourth consumer is benign by the same
--      arithmetic §3.3(a) rests on, and S7's own tie/totals rung re-measures it.
--      PERF — R-3's input, MEASURED on this lane's rig (104 counterparties, 4 000 and 2 800
--      timed calls, against a no-call control on the identical row set):
--        unmerged party  0.39 us/call gross - 0.06 us/row control = ~0.33 us MARGINAL
--        one-hop merged  0.71 us/call gross                       = ~0.65 us MARGINAL
--      i.e. roughly 0.3 us per CHAIN HOP. The recut calls the resolver TWICE per open item (the
--      coalesce and the is-null flag) and PostgreSQL does not common-subexpression-eliminate it
--      across a target list, so the recut's own added cost is ~0.7 us per item on an unmerged
--      book. A `cross join lateral (select clara._canonical_counterparty(...))` would halve the
--      call count. NOT TAKEN HERE: it is a second, larger rewrite of a body this file already
--      replaces under a D1 window, and R-3 asks for the number to be PUBLISHED, not for an
--      optimisation to ride the same window. Recorded for R-3's own round.
--      DIVERGENCE, recorded rather than reconciled away: the independent review of cf4c267c
--      reported 7-10 us/call. This lane cannot reproduce that on its rig by direct timing and
--      does not adopt a number it did not measure; the likely difference is instrument (an
--      end-to-end ar_aging on a large fixture, which also pays _subledger_outstanding_asof per
--      item, versus this direct per-call timing). R-3's own round should settle which
--      instrument the published number is taken with.
--   A3 clara._statement_core(uuid,uuid,text,uuid,date,date)  — read-only; a statement rendered
--      mid-migration would disagree with one rendered a second later.
--   A4 clara.list_open_items_by_counterparty(uuid,text,uuid) — read-only; a bank-matching
--      candidate list held open across the flip changes from [] to populated mid-session.
--   NOT on the list, and why: clara._tf_append_only, both subledger belts,
--   clara._subledger_outstanding*, clara._control_tie_core, clara._metric_input_dataset_v1,
--   clara._canonical_counterparty and clara._tf_counterparty_update_0011 are BYTE-UNTOUCHED,
--   proven by sha compare in S7. clara.counterparty_merges and its trigger are NEW objects.
--
-- CONSTRAINT 15: nothing in schema workflow / graphile_worker / spike is read or written by
-- this file; S7 re-proves it from the catalog rather than by assertion.
-- =====================================================================================

-- Precautionary, not load-bearing: this file replaces four function bodies and creates one
-- empty table. It performs no backfill and no data pass. The ceiling exists so a pathological
-- lock wait on clara.counterparties (the FK validation below takes a SHARE lock) fails loudly
-- inside the window instead of hanging it.
set local statement_timeout = '5min';

-- =====================================================================================
-- S0 — PRESTATE. Measure every claim this file makes about what it is editing, pin the
-- bodies it replaces AND the bodies it swears it does not touch, and abort on any
-- divergence. Instrument for every pin: encode(sha256(convert_to(prosrc,'UTF8')),'hex'),
-- the Annex B.1 instrument, re-derived here against the LIVE catalog (never migration text).
-- =====================================================================================
create temp table _cm1_pre(k text primary key, v text) on commit drop;

-- The one shared instrument every splice below uses: an anchor must occur EXACTLY the
-- expected number of times in the text about to be rewritten, or the file aborts before it
-- edits anything. It lives in pg_temp (never in clara) and is dropped at the end of this
-- file; it is a MEASUREMENT helper, not a shipped object.
create function pg_temp.cm1_n_check(p_text text, p_anchor text, p_want int, p_label text)
  returns void language plpgsql as $nc$
declare v_n int;
begin
  v_n := (length(p_text) - length(replace(p_text, p_anchor, ''))) / length(p_anchor);
  if v_n <> p_want then
    raise exception 'cpm-pr1 splice %: anchor occurs % time(s), expected % -- the live body is not the text this splice was derived against', p_label, v_n, p_want
      using errcode = 'CLR10';
  end if;
end $nc$;

do $s0$
declare
  r record; v_sha text; v_def text; v_n int; v_names text; v_cnt int;
begin
  -- (0.1) THE FOUR BODIES THIS FILE REPLACES, pinned at their EXACT signatures. Annex B.1's
  -- pins were derived at frontier 0142; they are re-derived here, live, and the file refuses
  -- if any body has moved under it (the superseded-body class — the estate's most expensive
  -- recurring error).
  for r in select * from (values
      ('clara.merge_counterparties(uuid,uuid,uuid,text,text)',
       'fc3ab723cec42c64a239fcb3b97d6683853356dd33dd4aab4a6dcde7d925e205'),
      ('clara._aging_core(uuid,uuid,text,date)',
       '6269d5322876a41306c0cad65748c2fbab198c667f787c6f14805e24fc22c9ad'),
      ('clara._statement_core(uuid,uuid,text,uuid,date,date)',
       'f9a9b8567ddf6a713f16a4557f329bfa7f3b6f975d2f1a5269608c5531d3fb39'),
      ('clara.list_open_items_by_counterparty(uuid,text,uuid)',
       '9c615636a8233abf2535c1402928c32c72defff38b064fe543889060254c9add')
    ) as t(sig, want) loop
    if to_regprocedure(r.sig) is null then
      raise exception 'cpm-pr1 prestate: % does not resolve at its pinned signature', r.sig
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), pg_get_functiondef(p.oid)
      into v_sha, v_def from pg_proc p where p.oid = r.sig::regprocedure;
    if v_sha is distinct from r.want then
      raise exception 'cpm-pr1 prestate: % live prosrc sha256 is %, the design pinned % -- the body moved under this file', r.sig, v_sha, r.want
        using errcode = 'CLR10';
    end if;
    -- Stash the WHOLE pre-image functiondef; S7's re-substitution proof reconstructs it
    -- byte-for-byte from the post-image and refuses on any divergence.
    insert into _cm1_pre(k, v) values ('def:' || r.sig, v_def);
    insert into _cm1_pre(k, v) values ('sha:' || r.sig, v_sha);
  end loop;

  -- (0.2) THE BODIES THIS FILE SWEARS IT DOES NOT TOUCH. Absence of an edit is not evidence
  -- (review law 2); S7 re-reads each of these and compares to the sha stashed here, so
  -- "untouched" is a MEASUREMENT on both sides of the file, never a claim.
  for r in select * from (values
      ('clara._canonical_counterparty(uuid,uuid)'),
      ('clara._tf_append_only()'),
      ('clara._control_tie_core(uuid,text,date)'),
      ('clara._subledger_outstanding(uuid)'),
      ('clara._subledger_outstanding_asof(uuid,date)'),
      ('clara._tf_subledger_item_belt()'),
      ('clara._tf_subledger_entry_belt()'),
      ('clara._tf_subledger_alloc_belt()'),
      ('clara._subledger_classify_entry(uuid)'),
      ('clara._metric_input_dataset_v1(uuid,uuid,uuid[])'),
      ('clara._tf_counterparty_update_0011()'),
      ('clara.ar_aging(uuid,date,uuid)'),
      ('clara.ap_aging(uuid,date,uuid)'),
      ('clara.customer_statement(uuid,uuid,date,date)'),
      ('clara.supplier_statement(uuid,uuid,date,date)')
    ) as t(sig) loop
    if to_regprocedure(r.sig) is null then
      raise exception 'cpm-pr1 prestate: witness body % does not resolve at its pinned signature', r.sig
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = r.sig::regprocedure;
    insert into _cm1_pre(k, v) values ('witness:' || r.sig, v_sha);
  end loop;

  -- (0.3) THE CARRIER MUST NOT ALREADY EXIST — a re-birth would silently drop the reversal
  -- ledger of every merge already recorded.
  if to_regclass('clara.counterparty_merges') is not null then
    raise exception 'cpm-pr1 prestate: clara.counterparty_merges already exists -- refusing to re-birth'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception 'cpm-pr1 prestate: clara._tf_no_truncate() is missing at its pinned signature'
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE _canonical_counterparty CALLER CENSUS (Annex B.2/C2), MEASURED HERE, not
  -- remembered. The annex recorded 32 members at frontier 0142; the live frontier carries
  -- 33 (clara.add_counterparty_alias joined at 0145). _aging_core's ABSENCE from this set IS
  -- finding M2 — S7 asserts the set becomes exactly these 33 PLUS _aging_core, so a future
  -- body that drops the resolver fails loudly instead of quietly un-consolidating aging.
  select count(*)::int, string_agg(p.proname, ',' order by p.proname)
    into v_n, v_names
    from pg_proc p join pg_namespace nn on nn.oid = p.pronamespace
    where nn.nspname = 'clara' and p.prosrc like '%_canonical_counterparty%';
  if v_n <> 33 then
    raise exception 'cpm-pr1 prestate: the _canonical_counterparty caller census is % bodies, expected 33 -- the frontier moved; re-derive Annex B.2 before landing this file', v_n
      using errcode = 'CLR10';
  end if;
  if position('_aging_core' in v_names) <> 0 then
    raise exception 'cpm-pr1 prestate: _aging_core ALREADY calls _canonical_counterparty -- finding M2 is not reproducible here, so this file is being applied to a database it was not derived against'
      using errcode = 'CLR10';
  end if;
  insert into _cm1_pre(k, v) values ('census:canonical_callers', v_names);

  -- (0.5) THE SPLICE ANCHORS, COUNTED BEFORE ANYTHING IS TOUCHED. Every count below is
  -- asserted against the RAW functiondef, which is also what the splice rewrites — the two
  -- must be the same text or the count proves nothing about the edit.
  v_def := (select v from _cm1_pre where k = 'def:clara._statement_core(uuid,uuid,text,uuid,date,date)');
  v_cnt := (length(v_def) - length(replace(v_def, 'and oi.counterparty_id = cp.id', ''))) / length('and oi.counterparty_id = cp.id');
  if v_cnt <> 4 then
    raise exception 'cpm-pr1 prestate: _statement_core carries the raw counterparty predicate % time(s), expected 4 (finding M3''s four sites)', v_cnt
      using errcode = 'CLR10';
  end if;
  v_cnt := (length(v_def) - length(replace(v_def, '_canonical_counterparty', ''))) / length('_canonical_counterparty');
  if v_cnt <> 1 then
    raise exception 'cpm-pr1 prestate: _statement_core names _canonical_counterparty % time(s), expected 1 (the cp CTE only -- finding M3)', v_cnt
      using errcode = 'CLR10';
  end if;

  v_def := (select v from _cm1_pre where k = 'def:clara.list_open_items_by_counterparty(uuid,text,uuid)');
  v_cnt := (length(v_def) - length(replace(v_def, '_canonical_counterparty(c.firm', ''))) / length('_canonical_counterparty(c.firm');
  if v_cnt <> 1 then
    raise exception 'cpm-pr1 prestate: list_open_items_by_counterparty carries the M9 firm-for-client defect % time(s), expected exactly 1 -- M9 is not reproducible here', v_cnt
      using errcode = 'CLR10';
  end if;

  -- (0.6) P4 / P5 — THE TIE BASELINE, per client and domain, taken through the OLD bodies.
  -- S7 re-measures through the NEW ones and refuses on ANY movement.
  --
  -- HONEST ABOUT ITS OWN REACH (fix round F5). On a virgin replay there are ZERO clients, so
  -- this rung captures nothing and proves nothing; on a freshly seeded chain the clients exist
  -- but carry no open items, so every baseline is an empty/`control_not_resolvable` object and
  -- the comparison is TRUE-BUT-CONTENT-FREE. **This rung is a COUNT on a rig and a
  -- MEASUREMENT only on a populated deploy target.** The battery is where the content proof
  -- lives (cell cm.5 drives a real merge and byte-compares both the aging `totals` object and
  -- ar_control_tie across it). To make the ceremony's own reading real rather than assumed,
  -- S7 RAISES THE BASELINE CONTENT ITSELF, not just how many baselines it took — so the
  -- operator on the night can see whether the rung had anything to compare.
  for r in select cl.id as client_id, d.domain
             from clara.clients cl cross join (values ('ar'),('ap')) as d(domain) loop
    insert into _cm1_pre(k, v)
      values ('tie:' || r.client_id || ':' || r.domain,
              clara._control_tie_core(r.client_id, r.domain, current_date)::text);
    insert into _cm1_pre(k, v)
      values ('agingtotals:' || r.client_id || ':' || r.domain,
              coalesce((clara._aging_core(
                 (select cl2.firm_id from clara.clients cl2 where cl2.id = r.client_id),
                 r.client_id, r.domain, current_date) -> 'totals')::text, 'null'));
  end loop;
  select count(*)::int into v_n from _cm1_pre where k like 'tie:%';
  insert into _cm1_pre(k, v) values ('meta:tie_baselines', v_n::text);

  -- (0.7) P1 — HOW MANY MERGES ALREADY EXIST. Every one of them lands with NO carrier row
  -- (this file deliberately back-populates nothing: merged_by, reason, op_key and alias_id
  -- are NOT recoverable from clara.counterparties, and inventing them would put four
  -- fabricated facts into an audit carrier). S7 raises the number so the ceremony records it
  -- and PROGRESS.md's Known issues can carry it — see the PR body.
  select count(*)::int into v_n from clara.counterparties where merged_into is not null;
  insert into _cm1_pre(k, v) values ('meta:pre_existing_merges', v_n::text);

  raise notice 'cpm-pr1 prestate: OK -- 4 replaced bodies pinned by prosrc sha256 to their Annex B.1 pre-images, 15 witness bodies stashed for the untouched-proof, clara.counterparty_merges absent, the _canonical_counterparty caller census measured at 33 WITHOUT _aging_core (finding M2 reproducible), _statement_core carrying M3''s 4 raw predicates and exactly 1 resolver call, list_open_items_by_counterparty carrying M9''s c.firm defect exactly once, % tie baselines captured through the OLD bodies, % pre-existing merge(s) with no carrier row.',
    (select v from _cm1_pre where k = 'meta:tie_baselines'),
    (select v from _cm1_pre where k = 'meta:pre_existing_merges');
end $s0$;

-- =====================================================================================
-- S1 — clara.counterparty_merges (design §3.4 / Annex A.2). D-05.
--
-- WHY A CARRIER AT ALL: the un-merge cannot be honest about an act the merge did not
-- record (M12). merge_counterparties' alias insert carries `on conflict do nothing`, so
-- after the fact NOTHING in the estate can say whether THIS merge created the alias it
-- would have to retire — and `retired` is terminal for a coding rule (M11), so the rule
-- ids must be recorded at merge time or the reversal is guesswork.
--
-- APPEND-ONLY PLUS EXACTLY ONE REVERSAL. The row is immutable except for the reversal trio
-- {unmerged_at, unmerged_by, unmerge_reason}, stamped once and never edited — a reversal
-- stamp that could be re-written is not a receipt.
-- =====================================================================================
set role clara_fn_owner;

create table clara.counterparty_merges (
  id                        uuid        primary key default gen_random_uuid(),

  -- TENANCY. firm_id is the RLS dimension; client_id scopes the merge, which never crosses
  -- clients (merge_counterparties refuses cross_client outright).
  firm_id                   uuid        not null,
  client_id                 uuid        not null,

  -- THE ACT.
  survivor_id               uuid        not null,
  merged_id                 uuid        not null,
  reason                    text        not null,
  merged_by                 uuid        not null references clara.users(id),
  merged_at                 timestamptz not null default now(),
  op_key                    text        not null,

  -- WHAT THE MERGE ACTUALLY DID, so the reversal is not guesswork. alias_id is NULL exactly
  -- when the alias insert hit `on conflict do nothing` — i.e. the alias already existed and
  -- does NOT belong to this merge, so an un-merge must not retire it (M12; the receipt says
  -- alias_restored:false, reason "not_created_by_merge").
  --
  -- ALL FIVE ARE TRIPLE-KEYED, like the two party columns below, and for a sharper reason:
  -- PR-2's un-merge does not merely READ these ids, it ACTS on them — it retires the alias and
  -- re-proposes the rule. A single-key FK would let a row of THIS firm/client name an alias or
  -- a coding rule belonging to ANOTHER tenant, and the reversal would then act across the
  -- tenancy wall on the strength of a stored id. clara.counterparty_aliases and
  -- clara.coding_rules both carry `unique(id, firm_id, client_id)` (0011), so the composite
  -- reference is available and costs nothing. A NULL in any of these columns leaves its FK
  -- unenforced under MATCH SIMPLE, which is exactly right: "this merge created no alias" and
  -- "this merge retired no rule" are the recorded facts M12/M11 need.
  alias_id                  uuid,
  retired_rule_id           uuid,
  reissued_rule_id          uuid,
  retired_autopost_rule_id  uuid,
  reissued_autopost_rule_id uuid,

  -- THE REVERSAL, stamped by PR-2's clara.unmerge_counterparties. All three together or
  -- none — a reversal with no reason is not auditable.
  unmerged_at               timestamptz,
  unmerged_by               uuid        references clara.users(id),
  unmerge_reason            text,

  constraint ck_cm_reason check (nullif(btrim(reason), '') is not null),
  constraint ck_cm_not_self check (survivor_id <> merged_id),
  constraint ck_cm_reversal_trio check (
        (unmerged_at is null) = (unmerged_by is null)
    and (unmerged_at is null) = (nullif(btrim(coalesce(unmerge_reason, '')), '') is null)),

  -- THE TRIPLE-KEY HOUSE PATTERN: a counterparty may only be named here by a row of the SAME
  -- firm AND client, enforced by the FK rather than by the writer's care.
  constraint fk_cm_survivor foreign key (survivor_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint fk_cm_merged foreign key (merged_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint fk_cm_alias foreign key (alias_id, firm_id, client_id)
    references clara.counterparty_aliases(id, firm_id, client_id),
  constraint fk_cm_retired_rule foreign key (retired_rule_id, firm_id, client_id)
    references clara.coding_rules(id, firm_id, client_id),
  constraint fk_cm_reissued_rule foreign key (reissued_rule_id, firm_id, client_id)
    references clara.coding_rules(id, firm_id, client_id),
  constraint fk_cm_retired_autopost foreign key (retired_autopost_rule_id, firm_id, client_id)
    references clara.coding_rules(id, firm_id, client_id),
  constraint fk_cm_reissued_autopost foreign key (reissued_autopost_rule_id, firm_id, client_id)
    references clara.coding_rules(id, firm_id, client_id)
);

-- D-12's structural half (M14): a party can be LIVE-merged at most once, so "which merge do
-- I reverse" is never ambiguous and PR-2's unmerge_counterparties(p_merge) is total. A
-- reversed row drops out of the index, so the same party may be merged again afterwards.
create unique index uq_cm_live_merged on clara.counterparty_merges (merged_id)
  where unmerged_at is null;

-- The hygiene panel's own read: "which merges does this survivor carry".
create index ix_cm_client_survivor on clara.counterparty_merges (client_id, survivor_id);

create function clara._tf_counterparty_merge_update() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'a counterparty merge record is never deleted'
      using errcode = 'CLR08', detail = '{"reason":"counterparty_merge_immutable"}';
  end if;
  -- Exactly one lawful UPDATE, ever: the reversal stamp, on a row that has not already been
  -- reversed. Everything else — including a second reversal and including an edit to the
  -- reversal's own reason — is refused. The diff is asserted on the WHOLE row minus the trio
  -- (to_jsonb minus the three keys), never column by column, so a column added to this table
  -- later is immutable by default rather than by remembering to extend a list.
  if old.unmerged_at is not null then
    raise exception 'a reversed counterparty merge record is immutable'
      using errcode = 'CLR08', detail = '{"reason":"counterparty_merge_already_reversed"}';
  end if;
  if new.unmerged_at is null or new.unmerged_by is null
     or (to_jsonb(new) - array['unmerged_at','unmerged_by','unmerge_reason'])
        is distinct from (to_jsonb(old) - array['unmerged_at','unmerged_by','unmerge_reason']) then
    raise exception 'clara.counterparty_merges admits exactly one update: the reversal stamp (unmerged_at, unmerged_by and unmerge_reason together, set once)'
      using errcode = 'CLR08', detail = '{"reason":"counterparty_merge_immutable"}';
  end if;
  return new;
end $fn$;
revoke all on function clara._tf_counterparty_merge_update() from public;

create trigger t_counterparty_merges_reversal_only
  before update or delete on clara.counterparty_merges
  for each row execute function clara._tf_counterparty_merge_update();
create trigger t_counterparty_merges_no_truncate
  before truncate on clara.counterparty_merges
  for each statement execute function clara._tf_no_truncate();

-- RLS: forced, owner policy + the SCOPED human read. The merge record is exactly the fact a
-- professional needs to see on a merged row ("who merged this into whom, when, why, and has
-- it been reversed"), so unlike a books table this one carries a real SELECT grant — the
-- clara.adjustment_runs shape, verbatim. NO agent policy and NO wake grant: C4's posture is
-- that the agent has no verb that creates a merge, so she has nothing here to read either.
alter table clara.counterparty_merges enable row level security;
alter table clara.counterparty_merges force row level security;
create policy p_counterparty_merges_owner on clara.counterparty_merges
  for all to clara_fn_owner using (true) with check (true);
create policy p_counterparty_merges_human on clara.counterparty_merges
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.counterparty_merges to clara_authenticated;

reset role;

-- =====================================================================================
-- S2 — clara.merge_counterparties: the CARRIER WRITE, and nothing else. D-05.
--
-- Same signature, same bookkeeper floor, same six refusals, same alias/rule side effects,
-- same clara._append_event payload (byte-identical — the event contract is not this PR's to
-- widen). What changes: four ids that were previously unrecoverable are now RECORDED, and
-- the door's own receipt returns merge_id so PR-2's un-merge and PR-3's dialog can key on
-- the merge ROW rather than on the party (D-12).
--
-- The splice reads pg_get_functiondef on its own target and rewrites it — never re-typed —
-- so every comment and every guard in the installed body survives byte-for-byte, and S7's
-- re-substitution proof reconstructs the pre-image from the post-image to prove it.
-- =====================================================================================
do $s2$
declare v_def text; v_next text; v_anchor text; v_repl text;
begin
  v_def := (select v from _cm1_pre where k = 'def:clara.merge_counterparties(uuid,uuid,uuid,text,text)');
  v_next := v_def;

  -- (a) four new locals.
  v_anchor := '  c record; v_dedupe jsonb; s record; m record; r record; v_new_rule uuid;';
  v_repl := v_anchor || E'\n' ||
            '  v_alias uuid; v_retired_rule uuid; v_retired_autopost uuid; v_merge_id uuid;';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'merge (a) declare');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (b) M12: capture the alias THIS merge created. `on conflict do nothing` writes no row and
  -- RETURNING then yields none, so v_alias stays NULL — which is precisely the fact the
  -- un-merge needs ("this alias is not mine to retire"), recorded rather than re-derived.
  v_anchor := '    on conflict do nothing;';
  v_repl := '    on conflict do nothing returning id into v_alias;';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'merge (b) alias');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (c)/(d) M11: capture which rule each arm RETIRED. The two arms are byte-identical for
  -- three lines and diverge only on rule_type, so each anchor carries its arm's rule_type
  -- line — anchoring on the shared update alone would rewrite both arms with one value.
  v_anchor := '    update clara.coding_rules set status=''retired'',retired_by=c.actor,' || E'\n' ||
              '      retired_at=now(),retire_reason=''merged'' where id=r.id;' || E'\n' ||
              '    if not exists(select 1 from clara.coding_rules where client_id=p_client' || E'\n' ||
              '        and counterparty_id=p_survivor and rule_type=''vendor_account'' and status=''live'') then';
  v_repl := '    update clara.coding_rules set status=''retired'',retired_by=c.actor,' || E'\n' ||
            '      retired_at=now(),retire_reason=''merged'' where id=r.id;' || E'\n' ||
            '    v_retired_rule:=r.id;' || E'\n' ||
            '    if not exists(select 1 from clara.coding_rules where client_id=p_client' || E'\n' ||
            '        and counterparty_id=p_survivor and rule_type=''vendor_account'' and status=''live'') then';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'merge (c) vendor rule');
  v_next := replace(v_next, v_anchor, v_repl);

  v_anchor := '    update clara.coding_rules set status=''retired'',retired_by=c.actor,' || E'\n' ||
              '      retired_at=now(),retire_reason=''merged'' where id=r.id;' || E'\n' ||
              '    if not exists(select 1 from clara.coding_rules where client_id=p_client' || E'\n' ||
              '        and counterparty_id=p_survivor and rule_type=''autopost'' and status=''live'') then';
  v_repl := '    update clara.coding_rules set status=''retired'',retired_by=c.actor,' || E'\n' ||
            '      retired_at=now(),retire_reason=''merged'' where id=r.id;' || E'\n' ||
            '    v_retired_autopost:=r.id;' || E'\n' ||
            '    if not exists(select 1 from clara.coding_rules where client_id=p_client' || E'\n' ||
            '        and counterparty_id=p_survivor and rule_type=''autopost'' and status=''live'') then';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'merge (d) autopost rule');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (e) THE CARRIER ROW, written in the SAME audited transaction as the merge itself, AFTER
  -- the identity is stamped so the FK sees a settled pair. A retry replays through
  -- _reserve_op above and never reaches this statement, so exactly one row per merge.
  v_anchor := '  update clara.counterparties set merged_into=p_survivor,retired_at=now(),' || E'\n' ||
              '    updated_at=now() where id=p_merged;';
  v_repl := v_anchor || E'\n' ||
            '  insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,' || E'\n' ||
            '      reason,merged_by,op_key,alias_id,retired_rule_id,reissued_rule_id,' || E'\n' ||
            '      retired_autopost_rule_id,reissued_autopost_rule_id)' || E'\n' ||
            '    values(c.firm,p_client,p_survivor,p_merged,p_reason,c.actor,p_op_key,v_alias,' || E'\n' ||
            '      v_retired_rule,v_new_rule,v_retired_autopost,v_new_autopost)' || E'\n' ||
            '    returning id into v_merge_id;';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'merge (e) carrier insert');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (f) the AUDIT detail gains the merge row's id. clara._append_event's payload is
  -- deliberately NOT touched: the event contract is a consumer-facing shape and widening it
  -- is not this PR's business (D-05, "the same event").
  v_anchor := '      ''reason'',p_reason,''reissued_rule'',v_new_rule,''reissued_autopost_rule'',v_new_autopost,' || E'\n' ||
              '      ''op_key'',p_op_key));';
  v_repl := '      ''reason'',p_reason,''reissued_rule'',v_new_rule,''reissued_autopost_rule'',v_new_autopost,' || E'\n' ||
            '      ''merge_id'',v_merge_id,''op_key'',p_op_key));';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'merge (f) audit detail');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (g) the caller-facing receipt gains merge_id. PR-2 keys the un-merge on the merge ROW
  -- (D-12) and PR-3's dialog needs the handle; the frontend type widens with PR-3.
  v_anchor := '  return clara._finish_op(c.firm,''merge_counterparties'',p_op_key,' || E'\n' ||
              '    jsonb_build_object(''survivor_id'',p_survivor,''merged_id'',p_merged,';
  v_repl := '  return clara._finish_op(c.firm,''merge_counterparties'',p_op_key,' || E'\n' ||
            '    jsonb_build_object(''merge_id'',v_merge_id,''survivor_id'',p_survivor,''merged_id'',p_merged,';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'merge (g) receipt');
  v_next := replace(v_next, v_anchor, v_repl);

  if v_next = v_def then
    raise exception 'cpm-pr1 S2: the merge_counterparties splice produced an identical body'
      using errcode = 'CLR10';
  end if;
  insert into _cm1_pre(k, v) values ('post:clara.merge_counterparties(uuid,uuid,uuid,text,text)', v_next);
  execute v_next;
end $s2$;

-- =====================================================================================
-- S3 — clara._aging_core: finding M2's recut. D-02 (the fail-closed party) and D-03
-- (recorded_counterparty_id, OQ-2).
--
-- The `rows` CTE gains a RESOLVED party column; the grouping and the name join both move
-- onto it, so a merged party stops being its own aging row and its money reads as the
-- survivor's. The RAW column is KEPT and surfaced per item as recorded_counterparty_id —
-- the accountant must still be able to see which name the invoice was raised under, which
-- is the audit-trail loss a physical repointing would have caused.
--
-- D-02, THE FAIL-CLOSED RUNG. clara._canonical_counterparty returns NULL on an unresolvable
-- row and RAISES CLR23 on a cyclic or over-deep chain. A NULL party must not silently drop
-- the item, because that would DELETE MONEY FROM A REPORT: the recut coalesces to the raw id
-- and stamps the counterparty entry "resolution":"unresolved". The RAISE is deliberately not
-- caught here — a broken merge chain is a data emergency, and a report that hides it is
-- worse than one that refuses.
--
-- WHAT THE RAISE ACTUALLY DOES TO A CLOSE — MEASURED, not reasoned. An earlier draft of this
-- comment said the raise "takes the close gate down with it". That is FALSE, and the true
-- mechanism is better. clara._measure_one_gate (0104) wraps EVERY gate probe — ar_control_tie
-- included — in `begin … exception when others then v_state := 'error'; v_measured :=
-- jsonb_build_object('state','error','sqlstate',sqlstate,'message',sqlerrm); end`. So the
-- CLR23 is CAUGHT and converted into a TYPED, RECORDED gate result carrying its own sqlstate,
-- and clara.finalize_close's drawer-1 sweep (0056) then refuses the close outright with CLR41
-- / reason `drawer1_state_unknown`, naming the check_key. Nothing crashes; the close REFUSES,
-- by name, with the evidence attached. THIS IS THE ANSWER TO THE GATE RECORD'S L5 — "is
-- raising out of ar_aging the right failure, or does it take the whole close gate down?" —
-- and it is L5's own numbered decision: the raise is right BECAUSE the close-gate machinery
-- already turns it into a typed refusal rather than an outage. Cell cm.20 drives both halves.
--
-- `totals` is a SUM OVER per_cp and is therefore invariant under regrouping — asserted
-- nowhere and MEASURED in S0/S7 against whatever data the target carries.
-- =====================================================================================
do $s3$
declare v_def text; v_next text; v_anchor text; v_repl text;
begin
  v_def := (select v from _cm1_pre where k = 'def:clara._aging_core(uuid,uuid,text,date)');
  v_next := v_def;

  -- (a) the resolved party and its unresolved flag, alongside the raw column.
  v_anchor := 'select oi.id as item_id, oi.counterparty_id, oi.item_kind,';
  v_repl := 'select oi.id as item_id, oi.counterparty_id,' || E'\n' ||
            '           coalesce(clara._canonical_counterparty(p_client, oi.counterparty_id),' || E'\n' ||
            '                    oi.counterparty_id) as party_id,' || E'\n' ||
            '           (clara._canonical_counterparty(p_client, oi.counterparty_id) is null) as party_unresolved,' || E'\n' ||
            '           oi.item_kind,';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'aging (a) rows CTE');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (b) per_cp groups on the resolved party and carries the resolution tag.
  v_anchor := '    select f.counterparty_id,' || E'\n';
  v_repl := '    select f.party_id,' || E'\n' ||
            '      (case when bool_or(f.party_unresolved) then ''unresolved'' else ''canonical'' end) as resolution,' || E'\n';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'aging (b) per_cp select');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (c) OQ-2: every item says which party it was RECORDED under.
  v_anchor := '''item_id'', f.item_id, ''item_kind'', f.item_kind,';
  v_repl := '''item_id'', f.item_id, ''recorded_counterparty_id'', f.counterparty_id,' || E'\n' ||
            '          ''item_kind'', f.item_kind,';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'aging (c) item payload');
  v_next := replace(v_next, v_anchor, v_repl);

  v_anchor := '    group by f.counterparty_id' || E'\n';
  v_repl := '    group by f.party_id' || E'\n';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'aging (d) group by');
  v_next := replace(v_next, v_anchor, v_repl);

  v_anchor := '''counterparty_id'', pc.counterparty_id, ''counterparty_name'', cp.name,';
  v_repl := '''counterparty_id'', pc.party_id, ''counterparty_name'', cp.name,' || E'\n' ||
            '          ''resolution'', pc.resolution,';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'aging (e) counterparty payload');
  v_next := replace(v_next, v_anchor, v_repl);

  v_anchor := 'on cp.id = pc.counterparty_id)';
  v_repl := 'on cp.id = pc.party_id)';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'aging (f) name join');
  v_next := replace(v_next, v_anchor, v_repl);

  insert into _cm1_pre(k, v) values ('post:clara._aging_core(uuid,uuid,text,date)', v_next);
  execute v_next;
end $s3$;

-- =====================================================================================
-- S4 — clara._statement_core: finding M3's recut. D-03.
--
-- M3, stated honestly, is an ABSENCE and not a divergence: the body canonicalises its
-- ARGUMENT (the cp CTE) but filters items on the RAW column at four sites, so after a merge
-- the merged party's balance is in NEITHER statement. All four predicates become canonical.
-- The returned counterparty_id stays the CANONICAL id (T8's redirect note depends on it and
-- it is correct); every transaction row gains recorded_counterparty_id, so a statement over
-- a merged pair shows, per line, which name the item was raised under (OQ-2).
--
-- The four predicates are TEXTUALLY IDENTICAL, which is exactly why one replace() is the
-- right instrument rather than the wrong one: replace() rewrites every occurrence, the
-- prestate has already counted them at 4, and S7 counts the resolver at 5 afterwards (the
-- cp CTE plus the four).
-- =====================================================================================
do $s4$
declare v_def text; v_next text; v_anchor text; v_repl text;
begin
  v_def := (select v from _cm1_pre where k = 'def:clara._statement_core(uuid,uuid,text,uuid,date,date)');
  v_next := v_def;

  v_anchor := 'and oi.counterparty_id = cp.id';
  v_repl := 'and clara._canonical_counterparty(p_client, oi.counterparty_id) = cp.id';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 4, 'statement (a) four raw predicates');
  v_next := replace(v_next, v_anchor, v_repl);

  v_anchor := 'oi.id as item_id, null::uuid as allocation_id';
  v_repl := 'oi.id as item_id, null::uuid as allocation_id,' || E'\n' ||
            '           oi.counterparty_id as recorded_counterparty_id';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'statement (b) item leg');
  v_next := replace(v_next, v_anchor, v_repl);

  v_anchor := 'oa.item_id, oa.id as allocation_id';
  v_repl := 'oa.item_id, oa.id as allocation_id,' || E'\n' ||
            '           oi.counterparty_id as recorded_counterparty_id';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'statement (c) allocation leg');
  v_next := replace(v_next, v_anchor, v_repl);

  v_anchor := '''item_id'', o.item_id, ''allocation_id'', o.allocation_id)';
  v_repl := '''item_id'', o.item_id, ''allocation_id'', o.allocation_id,' || E'\n' ||
            '          ''recorded_counterparty_id'', o.recorded_counterparty_id)';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'statement (d) row payload');
  v_next := replace(v_next, v_anchor, v_repl);

  insert into _cm1_pre(k, v) values ('post:clara._statement_core(uuid,uuid,text,uuid,date,date)', v_next);
  execute v_next;
end $s4$;

-- =====================================================================================
-- S5 — clara.list_open_items_by_counterparty: TWO edits, TWO findings. D-11 (OQ-6).
--
--   M9 — THE LIVE DEFECT, inert since 0038. The body passes c.firm where p_client is
--   expected: clara._canonical_counterparty(c.firm, p_counterparty). The resolver's first
--   statement is `select merged_into ... where id = v_id and client_id = p_client`, and a
--   FIRM id never equals a CLIENT id, so `not found` fires and the resolver returns NULL —
--   making the item predicate `oi.counterparty_id = NULL`, which is never true. THE DOOR HAS
--   RETURNED [] FOR EVERY COUNTERPARTY, ALWAYS, since it shipped. Its consumers are
--   apps/web/lib/bank/match-reads.ts (the settle_from_bank_line allocation picker) and
--   apps/dashboard/app/shared/bankApi.ts. Cell A-7 is the positive control whose ABSENCE let
--   this live for nine migrations: a non-empty list for a party with outstanding items and
--   no merge anywhere in the estate.
--
--   THE RE-HOME — the item-side predicate canonicalises too, so the door answers for the
--   merged party and the survivor with the same union.
--
-- Spliced as two sequential edits so each finding is separately provable, and S7 asserts the
-- string `_canonical_counterparty(c.firm` appears ZERO times in the live body — the drift
-- guard against M9's reintroduction.
-- =====================================================================================
do $s5$
declare v_def text; v_next text; v_anchor text; v_repl text;
begin
  v_def := (select v from _cm1_pre where k = 'def:clara.list_open_items_by_counterparty(uuid,text,uuid)');
  v_next := v_def;

  -- (a) M9.
  v_anchor := 'clara._canonical_counterparty(c.firm, p_counterparty)';
  v_repl := 'clara._canonical_counterparty(p_client, p_counterparty)';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'list (a) M9 firm-for-client');
  v_next := replace(v_next, v_anchor, v_repl);

  -- (b) the re-home read.
  v_anchor := 'and oi.counterparty_id = clara._canonical_counterparty(p_client, p_counterparty)';
  v_repl := 'and clara._canonical_counterparty(p_client, oi.counterparty_id)' || E'\n' ||
            '            = clara._canonical_counterparty(p_client, p_counterparty)';
  perform pg_temp.cm1_n_check(v_next, v_anchor, 1, 'list (b) canonical item predicate');
  v_next := replace(v_next, v_anchor, v_repl);

  insert into _cm1_pre(k, v) values ('post:clara.list_open_items_by_counterparty(uuid,text,uuid)', v_next);
  execute v_next;
end $s5$;

-- =====================================================================================
-- S6 — the counterparty.unmerged event type + its taxonomy row. OQ-7: 'context_update'.
--
-- Grounds (Annex D.2): an un-merge RESURRECTS an identity Clara resolves against, so her
-- context should learn immediately; 'ignore' (counterparty.merged's decision, unchanged
-- here) would leave her resolving against a party the human has just re-split until the next
-- pack build. Registered at the ACTIVE version — an additive insert into the live taxonomy,
-- NO version flip (the 0009 coupled-pair idiom). It lands in PR-1 rather than PR-2 because
-- clara.event_types' own coverage law (rig-events-structure §7) requires the active taxonomy
-- to route EVERY catalog row: shipping the pair together is the only shape that never leaves
-- the anti-join non-empty for even one migration.
-- =====================================================================================
set role clara_fn_owner;
insert into clara.event_types(name, client_scoped, description)
  values ('counterparty.unmerged', true,
          'A counterparty merge was reversed; the merged identity is live again');
insert into clara.trigger_taxonomy(version, event_type, decision, note)
  select ta.version, 'counterparty.unmerged', 'context_update',
         '裁-19/OQ-7: an un-merge resurrects an identity Clara resolves against, so the context pack learns immediately (counterparty.merged stays ignore)'
    from clara.taxonomy_active ta;
reset role;

-- =====================================================================================
-- S7 — TAIL CENSUS. Every claim re-READ from the live catalog. The census is the evidence a
-- reviewer reads; a tail that only says OK has proven nothing.
-- =====================================================================================
do $s7$
declare
  r record; v_sha text; v_def text; v_code text; v_n int; v_raw int;
  v_names text; v_want text; v_recon text; v_bad text; v_now text;
  v_pre text; v_msg text := ''; v_baselines text;
begin
  -- (1) THE FOUR REPLACED BODIES: genuinely changed, and each one's pre-image reconstructed
  -- BYTE-FOR-BYTE from the post-image by the inverse of its own splice. A sha that merely
  -- "moved" proves an edit happened; the re-substitution proves it was EXACTLY this edit and
  -- nothing else rode along.
  for r in select * from (values
      ('clara.merge_counterparties(uuid,uuid,uuid,text,text)'),
      ('clara._aging_core(uuid,uuid,text,date)'),
      ('clara._statement_core(uuid,uuid,text,uuid,date,date)'),
      ('clara.list_open_items_by_counterparty(uuid,text,uuid)')
    ) as t(sig) loop
    select pg_get_functiondef(p.oid), encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      into v_def, v_sha from pg_proc p where p.oid = r.sig::regprocedure;
    v_pre := (select v from _cm1_pre where k = 'def:' || r.sig);
    if v_def is null or v_def = v_pre then
      raise exception 'cpm-pr1 tail: % is unchanged -- the splice did not land', r.sig
        using errcode = 'CLR10';
    end if;
    if v_def is distinct from (select v from _cm1_pre where k = 'post:' || r.sig) then
      raise exception 'cpm-pr1 tail: %''s INSTALLED body is not the text this file spliced -- something else replaced it inside this transaction', r.sig
        using errcode = 'CLR10';
    end if;
    v_msg := v_msg || r.sig || ' -> ' || v_sha || ' (was ' ||
             (select v from _cm1_pre where k = 'sha:' || r.sig) || '); ';
  end loop;

  -- (1a) THE RE-SUBSTITUTION PROOFS, one inverse per splice, in reverse order.
  v_recon := (select v from _cm1_pre where k = 'post:clara._statement_core(uuid,uuid,text,uuid,date,date)');
  v_recon := replace(v_recon, '''item_id'', o.item_id, ''allocation_id'', o.allocation_id,' || E'\n' ||
                              '          ''recorded_counterparty_id'', o.recorded_counterparty_id)',
                              '''item_id'', o.item_id, ''allocation_id'', o.allocation_id)');
  v_recon := replace(v_recon, 'oa.item_id, oa.id as allocation_id,' || E'\n' ||
                              '           oi.counterparty_id as recorded_counterparty_id',
                              'oa.item_id, oa.id as allocation_id');
  v_recon := replace(v_recon, 'oi.id as item_id, null::uuid as allocation_id,' || E'\n' ||
                              '           oi.counterparty_id as recorded_counterparty_id',
                              'oi.id as item_id, null::uuid as allocation_id');
  v_recon := replace(v_recon, 'and clara._canonical_counterparty(p_client, oi.counterparty_id) = cp.id',
                              'and oi.counterparty_id = cp.id');
  if v_recon is distinct from (select v from _cm1_pre where k = 'def:clara._statement_core(uuid,uuid,text,uuid,date,date)') then
    raise exception 'cpm-pr1 tail: the _statement_core re-substitution does NOT reproduce the pre-image -- the splice changed more than the four predicates and the two recorded columns'
      using errcode = 'CLR10';
  end if;

  v_recon := (select v from _cm1_pre where k = 'post:clara.list_open_items_by_counterparty(uuid,text,uuid)');
  v_recon := replace(v_recon, 'and clara._canonical_counterparty(p_client, oi.counterparty_id)' || E'\n' ||
                              '            = clara._canonical_counterparty(p_client, p_counterparty)',
                              'and oi.counterparty_id = clara._canonical_counterparty(p_client, p_counterparty)');
  v_recon := replace(v_recon, 'clara._canonical_counterparty(p_client, p_counterparty)',
                              'clara._canonical_counterparty(c.firm, p_counterparty)');
  if v_recon is distinct from (select v from _cm1_pre where k = 'def:clara.list_open_items_by_counterparty(uuid,text,uuid)') then
    raise exception 'cpm-pr1 tail: the list_open_items_by_counterparty re-substitution does NOT reproduce the pre-image'
      using errcode = 'CLR10';
  end if;

  v_recon := (select v from _cm1_pre where k = 'post:clara._aging_core(uuid,uuid,text,date)');
  v_recon := replace(v_recon, 'on cp.id = pc.party_id)', 'on cp.id = pc.counterparty_id)');
  v_recon := replace(v_recon, '''counterparty_id'', pc.party_id, ''counterparty_name'', cp.name,' || E'\n' ||
                              '          ''resolution'', pc.resolution,',
                              '''counterparty_id'', pc.counterparty_id, ''counterparty_name'', cp.name,');
  v_recon := replace(v_recon, '    group by f.party_id' || E'\n', '    group by f.counterparty_id' || E'\n');
  v_recon := replace(v_recon, '''item_id'', f.item_id, ''recorded_counterparty_id'', f.counterparty_id,' || E'\n' ||
                              '          ''item_kind'', f.item_kind,',
                              '''item_id'', f.item_id, ''item_kind'', f.item_kind,');
  v_recon := replace(v_recon, '    select f.party_id,' || E'\n' ||
                              '      (case when bool_or(f.party_unresolved) then ''unresolved'' else ''canonical'' end) as resolution,' || E'\n',
                              '    select f.counterparty_id,' || E'\n');
  v_recon := replace(v_recon, 'select oi.id as item_id, oi.counterparty_id,' || E'\n' ||
                              '           coalesce(clara._canonical_counterparty(p_client, oi.counterparty_id),' || E'\n' ||
                              '                    oi.counterparty_id) as party_id,' || E'\n' ||
                              '           (clara._canonical_counterparty(p_client, oi.counterparty_id) is null) as party_unresolved,' || E'\n' ||
                              '           oi.item_kind,',
                              'select oi.id as item_id, oi.counterparty_id, oi.item_kind,');
  if v_recon is distinct from (select v from _cm1_pre where k = 'def:clara._aging_core(uuid,uuid,text,date)') then
    raise exception 'cpm-pr1 tail: the _aging_core re-substitution does NOT reproduce the pre-image -- the recut moved something beyond the six spliced sites'
      using errcode = 'CLR10';
  end if;

  v_recon := (select v from _cm1_pre where k = 'post:clara.merge_counterparties(uuid,uuid,uuid,text,text)');
  v_recon := replace(v_recon, 'jsonb_build_object(''merge_id'',v_merge_id,''survivor_id'',p_survivor,''merged_id'',p_merged,',
                              'jsonb_build_object(''survivor_id'',p_survivor,''merged_id'',p_merged,');
  v_recon := replace(v_recon, '''merge_id'',v_merge_id,''op_key'',p_op_key));', '''op_key'',p_op_key));');
  v_recon := replace(v_recon, E'\n' ||
            '  insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,' || E'\n' ||
            '      reason,merged_by,op_key,alias_id,retired_rule_id,reissued_rule_id,' || E'\n' ||
            '      retired_autopost_rule_id,reissued_autopost_rule_id)' || E'\n' ||
            '    values(c.firm,p_client,p_survivor,p_merged,p_reason,c.actor,p_op_key,v_alias,' || E'\n' ||
            '      v_retired_rule,v_new_rule,v_retired_autopost,v_new_autopost)' || E'\n' ||
            '    returning id into v_merge_id;', '');
  v_recon := replace(v_recon, E'\n' || '    v_retired_autopost:=r.id;', '');
  v_recon := replace(v_recon, E'\n' || '    v_retired_rule:=r.id;', '');
  v_recon := replace(v_recon, '    on conflict do nothing returning id into v_alias;',
                              '    on conflict do nothing;');
  v_recon := replace(v_recon, E'\n' ||
            '  v_alias uuid; v_retired_rule uuid; v_retired_autopost uuid; v_merge_id uuid;', '');
  if v_recon is distinct from (select v from _cm1_pre where k = 'def:clara.merge_counterparties(uuid,uuid,uuid,text,text)') then
    raise exception 'cpm-pr1 tail: the merge_counterparties re-substitution does NOT reproduce the pre-image -- the carrier splice touched a guard, a refusal or the event payload'
      using errcode = 'CLR10';
  end if;

  -- (2) THE WITNESS BODIES ARE BYTE-UNTOUCHED. Both belts, the append-only wall, the
  -- resolver, the tie core, both outstanding readers, the classifier, the sealed-snapshot
  -- source (OQ-3) and the identity trigger (PR-2's, not this file's).
  for r in select k, v from _cm1_pre where k like 'witness:%' loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = substr(r.k, 9)::regprocedure;
    if v_sha is distinct from r.v then
      raise exception 'cpm-pr1 tail: witness body % CHANGED (% -> %) -- this file swore it does not touch it', substr(r.k, 9), r.v, v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) THE CALLER CENSUS, re-measured: the pinned 33 PLUS _aging_core. M2 is closed, and a
  -- future body that drops the resolver from aging fails this assertion loudly.
  -- Compared as SETS, never as two sorted strings: pg_proc.proname is type `name` (C
  -- collation) while a text array sorts under the database collation, so two identical
  -- rosters serialise to two different strings and a string compare would red a correct
  -- census. The anti-join in BOTH directions is what actually says "same members".
  select count(*)::int, string_agg(p.proname, ',' order by p.proname)
    into v_n, v_names
    from pg_proc p join pg_namespace nn on nn.oid = p.pronamespace
    where nn.nspname = 'clara' and p.prosrc like '%_canonical_counterparty%';
  v_want := null;
  select string_agg(d.nm || ':' || d.side, ', ' order by d.nm) into v_want from (
    select nm, 'unexpected' as side from unnest(string_to_array(v_names, ',')) as nm
     where nm <> all (string_to_array((select v from _cm1_pre where k = 'census:canonical_callers'), ',')
                      || array['_aging_core'])
    union all
    select nm, 'missing' as side
      from unnest(string_to_array((select v from _cm1_pre where k = 'census:canonical_callers'), ',')
                  || array['_aging_core']) as nm
     where nm <> all (string_to_array(v_names, ','))
  ) d;
  if v_n <> 34 or v_want is not null then
    raise exception 'cpm-pr1 tail: the _canonical_counterparty caller census is % bodies, expected 34 = the pinned 33 + _aging_core; membership diff: %', v_n, coalesce(v_want, '(none)')
      using errcode = 'CLR10';
  end if;

  -- (3a) THE CENSUS ABOVE IS A RAW prosrc MATCH, so a body that lost the resolver from its
  -- CODE while keeping the name in a COMMENT would still be counted a member — the exact
  -- comment-hiding class 0141/0146's HIGH-1 discipline exists for. Each of the three recut
  -- bodies therefore carries its own CALL-SHAPED marker check against a COMMENT-STRIPPED copy
  -- (block comments first, then line comments — the order matters, a block comment must not
  -- hide a live line comment from the second pass). Annex A.1 promised this for all three;
  -- only _statement_core and list_open_items_by_counterparty had it. Cell cm.10 runs the same
  -- instrument from the outside, with a negative control that proves it can say NO.
  for r in select * from (values
      ('clara._aging_core(uuid,uuid,text,date)', 2),
      ('clara._statement_core(uuid,uuid,text,uuid,date,date)', 5),
      ('clara.list_open_items_by_counterparty(uuid,text,uuid)', 2)
    ) as t(sig, want) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = r.sig::regprocedure;
    v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
    v_n := (length(v_code) - length(replace(v_code, 'clara._canonical_counterparty(', '')))
           / length('clara._canonical_counterparty(');
    if v_n < 1 then
      raise exception 'cpm-pr1 tail (M2 drift guard): % names clara._canonical_counterparty( ZERO times IN CODE -- the raw census counted it a member on a COMMENT alone', r.sig
        using errcode = 'CLR10';
    end if;
    if v_n <> r.want then
      raise exception 'cpm-pr1 tail (M2 drift guard): % carries % CALL(s) to clara._canonical_counterparty( IN CODE, expected % -- the recut lost or gained a resolver call', r.sig, v_n, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (4) M3's postcheck: the resolver appears exactly FIVE times in _statement_core (the cp
  -- CTE plus the four predicates), and ZERO raw predicates survive. Counted IN CODE against a
  -- comment-stripped copy AND raw, so a marker hiding inside a comment cannot mask a site
  -- that failed to rewrite (the 0141/0146 HIGH-1 discipline).
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid = 'clara._statement_core(uuid,uuid,text,uuid,date,date)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  v_n := (length(v_code) - length(replace(v_code, '_canonical_counterparty', ''))) / length('_canonical_counterparty');
  v_raw := (length(v_def) - length(replace(v_def, '_canonical_counterparty', ''))) / length('_canonical_counterparty');
  if v_n <> 5 or v_raw <> v_n then
    raise exception 'cpm-pr1 tail: _statement_core names _canonical_counterparty % time(s) IN CODE / % raw, expected 5/5', v_n, v_raw
      using errcode = 'CLR10';
  end if;
  if position('and oi.counterparty_id = cp.id' in v_code) <> 0 then
    raise exception 'cpm-pr1 tail: _statement_core still carries a RAW counterparty predicate in code'
      using errcode = 'CLR10';
  end if;

  -- (5) M9's DRIFT GUARD: the firm-for-client spelling is gone, in code and raw.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid = 'clara.list_open_items_by_counterparty(uuid,text,uuid)'::regprocedure;
  v_code := regexp_replace(regexp_replace(v_def, '/\*.*?\*/', '', 'gs'), '--[^\n]*', '', 'g');
  if position('_canonical_counterparty(c.firm' in v_code) <> 0
     or position('_canonical_counterparty(c.firm' in v_def) <> 0 then
    raise exception 'cpm-pr1 tail: list_open_items_by_counterparty still carries the M9 firm-for-client spelling'
      using errcode = 'CLR10';
  end if;

  -- (6) P4/P5 — THE TIE DIGESTS, RE-MEASURED THROUGH THE NEW BODIES on whatever data this
  -- target carries. Any movement at all is a refusal: regrouping a sum must not move it, and
  -- this is where that stops being a design claim.
  v_bad := null;
  for r in select k, v from _cm1_pre where k like 'tie:%' loop
    v_now := clara._control_tie_core(split_part(r.k, ':', 2)::uuid, split_part(r.k, ':', 3),
                                     current_date)::text;
    if v_now is distinct from r.v then
      v_bad := coalesce(v_bad || ' | ', '') || substr(r.k, 5) || ': ' || r.v || ' -> ' || v_now;
    end if;
  end loop;
  if v_bad is not null then
    raise exception 'cpm-pr1 tail: the control tie MOVED across the recut -- %', v_bad
      using errcode = 'CLR10';
  end if;
  v_bad := null;
  for r in select k, v from _cm1_pre where k like 'agingtotals:%' loop
    v_now := coalesce((clara._aging_core(
               (select cl.firm_id from clara.clients cl where cl.id = split_part(r.k, ':', 2)::uuid),
               split_part(r.k, ':', 2)::uuid, split_part(r.k, ':', 3), current_date) -> 'totals')::text, 'null');
    if v_now is distinct from r.v then
      v_bad := coalesce(v_bad || ' | ', '') || substr(r.k, 13) || ': ' || r.v || ' -> ' || v_now;
    end if;
  end loop;
  if v_bad is not null then
    raise exception 'cpm-pr1 tail: an aging TOTALS object MOVED across the recut -- %', v_bad
      using errcode = 'CLR10';
  end if;
  -- F5: RAISE THE BASELINE CONTENT, not only its count. A rung that says "6 baselines, all
  -- unmoved" reads as a measurement even when all six were empty; the operator on the
  -- ceremony night must be able to see WHICH numbers were compared. Truncated so a large
  -- estate cannot flood the runner's log.
  select left(string_agg(substr(k, 5) || ' => ' || v, ' | ' order by k), 3000)
    into v_baselines from _cm1_pre where k like 'tie:%';
  raise notice 'cpm-pr1 tail (P4 baseline CONTENT, taken through the OLD bodies and reproduced through the NEW ones): %',
    coalesce(v_baselines, '(NO CLIENTS ON THIS TARGET -- this rung compared NOTHING here; the content proof is battery cell cm.5)');

  -- (7) THE CARRIER'S STRUCTURE, read from the catalog rather than from S1's say-so.
  if not exists (select 1 from pg_class c join pg_namespace nn on nn.oid = c.relnamespace
                 where nn.nspname = 'clara' and c.relname = 'counterparty_merges'
                   and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'cpm-pr1 tail: clara.counterparty_merges does not carry ENABLE + FORCE row level security'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_policy where polrelid = 'clara.counterparty_merges'::regclass;
  if v_n <> 2 then
    raise exception 'cpm-pr1 tail: clara.counterparty_merges carries % policies, expected exactly 2 (owner + scoped human read)', v_n
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_policy p
                 where p.polrelid = 'clara.counterparty_merges'::regclass
                   and p.polname = 'p_counterparty_merges_human' and p.polcmd = 'r'
                   and pg_get_expr(p.polqual, p.polrelid) = '(firm_id = clara.jwt_firm())'
                   and p.polroles = array[(select oid from pg_roles where rolname = 'clara_authenticated')]) then
    raise exception 'cpm-pr1 tail: the human read policy on clara.counterparty_merges is not the firm-scoped SELECT it must be'
      using errcode = 'CLR10';
  end if;
  -- No app role beyond clara_authenticated's SELECT may reach the carrier. Named roster, not
  -- an absence: each privilege is PROBED, and a hit is the failure.
  select string_agg(x.role || ':' || x.priv, ', ') into v_bad
    from (values
      ('clara_authenticated','insert'),('clara_authenticated','update'),('clara_authenticated','delete'),
      ('clara_agent_ro','select'),
      ('clara_wake_interactive','select'),('clara_wake_interactive','insert'),
      ('clara_wake_proactive','select'),('clara_wake_proactive','insert'),
      ('clara_runtime','select'),('clara_runtime','insert'),
      ('clara_freeform_ro','select')
    ) x(role, priv)
    where has_table_privilege(x.role, 'clara.counterparty_merges', x.priv);
  if v_bad is not null then
    raise exception 'cpm-pr1 tail: unexpected reach on clara.counterparty_merges -- %', v_bad
      using errcode = 'CLR10';
  end if;
  if not has_table_privilege('clara_authenticated', 'clara.counterparty_merges', 'select') then
    raise exception 'cpm-pr1 tail: clara_authenticated cannot SELECT clara.counterparty_merges -- the hygiene panel has no read'
      using errcode = 'CLR10';
  end if;
  -- The partial unique index asserted BY PROPERTY (unique, valid, ready, single key column
  -- merged_id, partial), never by name -- spelling is not identity (review law 3).
  if not exists (
    select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid
    where i.indrelid = 'clara.counterparty_merges'::regclass
      and i.indisunique and i.indisvalid and i.indisready
      and i.indnatts = 1 and i.indpred is not null
      and (select attname from pg_attribute where attrelid = i.indrelid and attnum = i.indkey[0]) = 'merged_id') then
    raise exception 'cpm-pr1 tail: the live-merge partial unique index on (merged_id) is missing or not unique/valid/ready'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
    where tgrelid = 'clara.counterparty_merges'::regclass and not tgisinternal;
  if v_n <> 2 then
    raise exception 'cpm-pr1 tail: clara.counterparty_merges carries % user triggers, expected 2 (reversal-only, no-truncate)', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.counterparty_merges;
  if v_n <> 0 then
    raise exception 'cpm-pr1 tail: clara.counterparty_merges carries % row(s); this file back-populates NOTHING', v_n
      using errcode = 'CLR10';
  end if;

  -- (8) THE EVENT PAIR: the type exists and the ACTIVE taxonomy routes it. The coverage law
  -- (every event_type routed at the active version) is re-proven here as an anti-join.
  if not exists (select 1 from clara.event_types where name = 'counterparty.unmerged' and client_scoped) then
    raise exception 'cpm-pr1 tail: counterparty.unmerged is not a client-scoped event type'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.trigger_taxonomy tt join clara.taxonomy_active ta on ta.version = tt.version
                 where tt.event_type = 'counterparty.unmerged' and tt.decision = 'context_update') then
    raise exception 'cpm-pr1 tail: counterparty.unmerged is not routed context_update at the ACTIVE taxonomy version'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.trigger_taxonomy tt join clara.taxonomy_active ta on ta.version = tt.version
             where tt.event_type = 'counterparty.merged' and tt.decision <> 'ignore') then
    raise exception 'cpm-pr1 tail: counterparty.merged no longer routes ignore -- this file must not have moved it'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.event_types et
    where et.name not like 'rig.%'
      and not exists (select 1 from clara.trigger_taxonomy tt
                      where tt.version = (select version from clara.taxonomy_active)
                        and tt.event_type = et.name);
  if v_n <> 0 then
    raise exception 'cpm-pr1 tail: % event type(s) are unrouted at the active taxonomy version', v_n
      using errcode = 'CLR10';
  end if;

  -- (9) CONSTRAINT 15, measured: nothing this file created lives outside schema clara, and
  -- the three protected schemas hold exactly what they held (this file names none of them).
  if exists (select 1 from pg_class c join pg_namespace nn on nn.oid = c.relnamespace
             where nn.nspname in ('workflow','graphile_worker','spike')
               and c.relname = 'counterparty_merges') then
    raise exception 'cpm-pr1 tail: the carrier landed in a protected schema' using errcode = 'CLR10';
  end if;

  raise notice 'cpm-pr1 tail: OK -- the READ HALF of 裁-24''s hybrid, the merge carrier and M9, all re-read from the live catalog. FOUR bodies replaced, each PROVEN to be exactly its own splice by a byte-for-byte re-substitution of the pre-image: %. FIFTEEN witness bodies (both subledger belts, _tf_append_only, _canonical_counterparty, _control_tie_core, both _subledger_outstanding readers, _subledger_classify_entry, _metric_input_dataset_v1 [OQ-3 LEAVE], _tf_counterparty_update_0011, the four public wrappers) are byte-UNTOUCHED on prosrc sha256. The _canonical_counterparty caller census moved from the pinned 33 to 34 = the same 33 PLUS _aging_core, so finding M2 is closed and a future body that drops the resolver reds this assertion. _statement_core names the resolver exactly 5 times (the cp CTE + M3''s four sites) with zero raw predicates left in code; list_open_items_by_counterparty carries the M9 firm-for-client spelling zero times, in code and raw. THE M2 DRIFT GUARD IS COMMENT-STRIPPED (F4): all three recut bodies name clara._canonical_counterparty( IN CODE at their expected call counts (2 / 5 / 2), so the raw caller census above cannot be satisfied by a comment alone. The control tie and the aging TOTALS object are unmoved across the recut on % client/domain baseline(s) taken through the OLD bodies -- READ THE BASELINE CONTENT NOTICE ABOVE before calling that a measurement: on a virgin or freshly-seeded rig every baseline is empty, so this rung is a COUNT there and a MEASUREMENT only on a populated target (F5; the content proof is battery cell cm.5). clara.counterparty_merges: forced RLS, exactly 2 policies (clara_fn_owner ALL + clara_authenticated firm-scoped SELECT), a clean 11-probe role roster, the (merged_id) partial unique index asserted by PROPERTY, 2 user triggers, ZERO rows. counterparty.unmerged is registered and routed context_update at the active version while counterparty.merged still routes ignore, and every event type stays covered. D1 OWED: clara.merge_counterparties(uuid,uuid,uuid,text,text), clara._aging_core(uuid,uuid,text,date), clara._statement_core(uuid,uuid,text,uuid,date,date), clara.list_open_items_by_counterparty(uuid,text,uuid). P1 MEASURED: % pre-existing merge(s) carry NO carrier row and are therefore not reversible by PR-2''s door -- stated in the PR body and owed to PROGRESS.md Known issues, never discovered by a user. THE WRITE HALF OF 裁-24 IS NOT IN THIS FILE: see the header block for the measured reason. No table in workflow/graphile_worker/spike touched.',
    v_msg,
    (select v from _cm1_pre where k = 'meta:tie_baselines'),
    (select v from _cm1_pre where k = 'meta:pre_existing_merges');
end $s7$;

-- The measurement helper leaves with the file. It was never in schema clara and it is not a
-- shipped object; dropping it explicitly keeps the runner's session clean for the next file.
drop function pg_temp.cm1_n_check(text, text, int, text);
