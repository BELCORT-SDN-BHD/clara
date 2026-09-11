-- 0183_activity_sweep_attribution — #728 (2026-09-11 signed-in hosted walk, findings 1 and 5):
-- the Activity feed stops being buried by unattributed sweep heartbeats, and a new read tells
-- the evidence pickers which documents already back a posted entry.
--
-- WHAT THE OWNER SAW ON THE LIVE FIRM (#728 item 1). `/activity` showed "An autodraft sweep run
-- completed" every five minutes -- kind Documents, Actor "--", Client "No client" -- 20+ of the
-- first 25 rows. `clara.reconcile_sweep_runs` (0011:2709-2769) finalises a `clara.sweep_runs` row
-- and appends `sweep.run_completed` (0011:2763-2764) EVERY TIME a run's window closes, whether or
-- not it drafted anything -- the payload carries `run_id` and `expected_count` only, and the event
-- itself is firm-level (`actor`/`on_behalf_of`/`client_id` all null: 0011:3886's own
-- `client_scoped=false` registration). `clara.list_activity`'s 0181 kind ladder has no arm for
-- `sweep.%`, so it fell through to the broadest bucket, `'documents'` -- exactly the row C77.3 says
-- must not exist without an actor, and on a firm running the sweep every five minutes it drowns
-- real postings.
--
-- THE FIX, PER ARM. (a) a sweep receipt that changed NOTHING (`sweep_runs.drafted_count = 0` --
-- the common case: most five-minute windows draft zero new entries) is EXCLUDED from the union
-- entirely, in BOTH `clara.list_activity` and `clara.get_activity_event` (a deep link to an
-- excluded heartbeat answers the SAME CLR11 the door already uses for any other denied/absent
-- id -- no oracle). (b) a sweep receipt that DID draft something is KEPT, but reclassified
-- `kind = 'agent'` (it is an agent act on the books, not a document act) -- the closed kind
-- roster (`documents|journal|close|report|agent|work`, 0181:257) is NOT widened. `actor` stays
-- NULL -- that is the truth, the sweep has no human or agent-uuid actor of its own -- and the web
-- lane (apps/web, this ticket's own C1) recognises `kind='agent' and event_type=
-- 'sweep.run_completed'` off columns THIS door already outputs, so no new output column is added
-- and no ordinal any reader is pinned to moves.
--
-- WHY A NEW SECURITY DEFINER HELPER RATHER THAN A BARE JOIN TO `clara.sweep_runs`, MEASURED ON
-- THE LIVE CATALOG (not assumed from 0181's own reasoning about its OTHER two sources). Every
-- relation `clara.list_activity`/`clara.get_activity_event` read before this file is ALREADY
-- granted to `clara_authenticated` (0181's own header states this is WHY they are SECURITY
-- INVOKER) -- but `clara.sweep_runs` (0011:674-696) carries NO grant to `clara_authenticated` at
-- all (only `clara_fn_owner`, the table's own definer-function owner, has any privilege on it;
-- confirmed against `information_schema.role_table_grants` on this chain's own database). An
-- INVOKER body running as the caller would hit a raw `permission denied for table sweep_runs`,
-- exactly the class of gap 0181's header names for `clara._human_ctx` (an invoker body cannot
-- reach a helper -- or a table -- the calling role holds no grant on). Two ways to close that gap
-- were weighed: (1) widen `clara.sweep_runs`' own grant to `clara_authenticated` -- rejected,
-- because it is a wall change on a table the runtime's autodraft lane also writes, with no floor
-- of its own, and it would hand every bookkeeper direct SELECT on token/budget bookkeeping this
-- door has no reason to expose wholesale; (2) a NEW, NARROW `security definer` helper that reads
-- exactly the one fact this door needs (which of this firm's sweep receipts report a run that
-- actually drafted or posted something) and returns nothing else -- taken.
-- `clara._sweep_events_with_effect()` (and its point-lookup twin `clara._sweep_event_has_effect
-- (uuid)`) is SELF-SCOPED to the session's own firm and FLOORED at
-- bookkeeper INSIDE its own body (never a caller-supplied firm argument),
-- so calling it directly (it must carry a `clara_authenticated` grant for an INVOKER caller to
-- reach it at all, and PostgREST exposes any granted function as its own RPC endpoint regardless
-- of an underscore prefix -- 0181's own header names this exact class of caveat for
-- `_human_ctx`) can never answer for a firm other than the caller's own, no matter what uuid is
-- passed. This is the "expose what you need through the view's own contract" alternative the
-- work order names, chosen over widening `clara.firm_timeline_visible` itself: the view's
-- payload-free projection (0174's own header, "the raw spine's payload is unredacted call
-- payload... the view already drops it") is untouched, and the one fact this door borrows is a
-- run's own effect count, never the payload verbatim.
--
-- THE CORRELATION IS EXACT, NOT A TIME WINDOW. The work order's own fallback ("join sweep_runs by
-- firm + the event's occurred_at/finalized_at window ONLY if it is unambiguous") is not needed:
-- `clara._append_event(sr.firm_id,'sweep.run_completed',...,jsonb_build_object('run_id',sr.id,
-- 'expected_count',sr.expected_count))` (0011:2763-2764) carries the run's OWN id in the payload,
-- so `clara._sweep_events_with_effect` joins `clara.domain_events` (by the event's own `id`, which
-- `clara.firm_timeline_visible.event_id` already names) to `clara.sweep_runs` (by
-- `payload->>'run_id'`) -- a direct reference, never a heuristic near a boundary tie.
--
-- WHY `clara.domain_events` IS READABLE INSIDE THIS HELPER WITHOUT WIDENING ANYTHING. It already
-- carries a `clara_authenticated` grant with a firm-only RLS predicate (0005:380-381,
-- `p_domain_events_human`, `firm_id = clara.jwt_firm()`) -- the helper does not need to borrow
-- privilege for that half; it needs to borrow privilege ONLY for `clara.sweep_runs`, and being
-- `security definer` it borrows exactly that and nothing more (it does not touch `clara.
-- sweep_run_items`, `clara.autodraft_attempts` or any other sweep-lane table).
--
-- ARM (B): `clara.list_spoken_for_documents` -- #728 item 5. The evidence pickers
-- (`journal-composer.tsx`'s native select, `attach-evidence-dialog.tsx`'s late-attach select)
-- offer documents that already back a posted entry; the conflict is caught on submit today
-- (`attach_entry_evidence`'s CLR13 `source_already_posted`, `admit_journal_work`'s own check) and
-- that typed refusal STAYS the law -- this is a NEW, ADVISORY read the picker consults ALONGSIDE
-- the document list, never a replacement for the door's own check. TWO LANES, the SAME pair
-- migration 0182's `clara._document_posting_entry` already asks per-document (its own header,
-- "WHICH POSTED ENTRY ALREADY STANDS ON THIS DOCUMENT"): a LIVE `clara.entry_evidence_links`
-- binding (`via='evidence_link'`, `released_at is null`) and the document-coding lane's own
-- `clara.journal_entries.document_id` (`via='coding'`, approved, not reversed). This door answers
-- for a WHOLE CLIENT's documents at once (a set), where `_document_posting_entry` answers for one
-- document at a time (a priority pick) -- different shapes for different callers, same two facts.
--
-- ADDITIVE FOR THE SCHEMA (one new table object: none: this file creates functions only), ADDITIVE
-- FOR THE GRANT SURFACE (one new SELECT-nothing helper plus one new read door, both
-- `clara_authenticated`-only), and a RECUT for the TWO 0181 door bodies at their SAME signatures
-- (SAME 18-column projection, SAME SECURITY INVOKER posture, SAME grants -- `create or replace`
-- preserves an unchanged signature's ACL, and this file restates both anyway, belt-and-suspenders,
-- the same house habit every prior recut in this estate follows). Migrations 0184 (the #630
-- cancel-ordering lane of the same refresh train) is owned by another lane and this file names
-- none of its objects.
--
-- FRONTEND HOME (apps/web): the actor-line, focus and evidence-picker fixes this ticket also
-- carries are entirely web-side and touch no door this file did not already name; see the ticket
-- and the session's own work order for the full web-side map.

set local statement_timeout = '2min';
set local lock_timeout = '5s';

-- ==============================================================================================
-- 0. PRESTATE.
-- ==============================================================================================
do $pre$
declare v_missing text; v_sha text;
begin
  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.firm_timeline_visible'), ('clara.agent_receipts_visible'),
                 ('clara.operation_receipts'), ('clara.accounting_work'),
                 ('clara.journal_entries'), ('clara.clients'), ('clara.event_types'),
                 ('clara.domain_events'), ('clara.sweep_runs'), ('clara.entry_evidence_links')) t(n)
   where to_regclass(t.n) is null;
  if v_missing is not null then
    raise exception 'activity_sweep_attribution prestate: required relation(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  select string_agg(t.n, ', ' order by t.n) into v_missing
    from (values ('clara.jwt_sub()'), ('clara.jwt_firm()'), ('clara.actor_role_rank()'),
                 ('clara.role_rank(text)'), ('clara._human_ctx(integer)'),
                 ('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'),
                 ('clara.get_activity_event(text,text)')) t(n)
   where to_regprocedure(t.n) is null;
  if v_missing is not null then
    raise exception 'activity_sweep_attribution prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- PARTIAL BIRTH -- nothing this file creates may already exist.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara'
       and p.proname in ('_sweep_events_with_effect', '_sweep_event_has_effect',
                         'list_spoken_for_documents')
  ) then
    raise exception 'activity_sweep_attribution prestate: a new function name already resolves'
      using errcode = 'CLR10';
  end if;

  -- …and neither may the two indexes section 0b creates.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'clara' and c.relkind = 'i'
       and c.relname in ('ix_domain_events_sweep_run', 'ix_sweep_runs_firm_effect')
  ) then
    raise exception 'activity_sweep_attribution prestate: a new index name already resolves'
      using errcode = 'CLR10';
  end if;

  -- clara.sweep_runs carries NO grant to clara_authenticated -- the measured fact this file's
  -- header reasons the whole helper-vs-bare-join design from. A later migration widening this
  -- would make the helper redundant, not wrong, so this is stated rather than enforced as a wall.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'clara' and table_name = 'sweep_runs' and grantee = 'clara_authenticated'
  ) then
    raise notice 'activity_sweep_attribution prestate: clara.sweep_runs now carries a clara_authenticated grant it did not have when this file was written -- the _sweep_events_with_effect helper is still correct, merely no longer the only way to read this fact.';
  end if;

  -- THE TWO LIVE BODIES THIS FILE RECUTS, pinned by prosrc sha-256 at the 0181 frontier. A
  -- drifted body is REFUSED rather than silently overwritten -- the recuts below are full-body
  -- rewrites of these exact texts plus this file's sweep arm, and a different text may carry an
  -- arm this file would delete without ever reading it.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_sha <> 'e8c3b7b8d4df2dd35058d6d178d125cda4267d033c78bc0302271e376c9d3cf9' then
    raise exception 'activity_sweep_attribution prestate: clara.list_activity has DRIFTED from the pinned 0181 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_sha <> 'a5585bdfd23af24e1a4a693242cb959b818913a7cde687a443f0682423601b32' then
    raise exception 'activity_sweep_attribution prestate: clara.get_activity_event has DRIFTED from the pinned 0181 body (sha %) -- re-derive the recut against the live body before applying', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice 'activity_sweep_attribution prestate: clean -- both 0181 bodies at their pinned text, clara.sweep_runs still ungranted to clara_authenticated, no new function name resolves yet.';
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 0b. TWO INDEXES, so the cost of the sweep exclusion is the size of the KEPT SET, not of the
--     firm's whole append-only sweep history (delta review of the fix round, 2026-09-11,
--     finding [1]).
--
--     WHAT WAS WRONG WITHOUT THEM. Nothing indexed `de.payload ->> 'run_id'` and nothing indexed
--     "a run that did something", so even the GOOD plan for section 1's join sorted EVERY
--     `sweep.run_completed` event of the firm and EVERY `clara.sweep_runs` row of the firm and
--     merge-joined the two, on EVERY feed read. Measured on this rig at 30,000 kept sweep
--     receipts: Merge Join, 592 ms, `Sort Method: external sort Disk: 4936kB` over a Seq Scan of
--     `clara.domain_events`. Both relations grow 288 rows a DAY on the live firm and are
--     append-only, so that cost never comes back down.
--
--     AND THE FIRST CUT OF THE RECEIPT INDEX DID NOT FIX IT -- MEASURED, NOT ASSUMED (delta
--     review round 3, finding [2]). That cut indexed the expression ALONE,
--     `domain_events((payload ->> 'run_id')) where event_type = 'sweep.run_completed'`, and NO
--     plan the planner actually chose ever used it: with the kept set held at 200 and the firm's
--     history grown 1,000 -> 6,000 -> 30,000 receipts, section 1's join stayed a Merge Join over a
--     Seq Scan of `clara.domain_events` (3.3 / 7.2 / 134.2 ms), and DROPPING the index changed
--     nothing (2.2 / 4.9 / 96.9 ms -- if anything faster). An index nobody reads is a write cost
--     on every one of the 288 sweep receipts a firm appends a day, so it does not stay.
--
--     WHAT EARNS ITS PLACE IS THE COMPOSITE, and it only earns it TOGETHER WITH THE LATERAL FENCE
--     in section 1: `(firm_id, (payload ->> 'run_id')) where event_type = 'sweep.run_completed'`
--     matches the WHOLE correlated predicate -- the firm bound and the run reference -- so one
--     kept run is one index scan returning one row, with no BitmapAnd against
--     `domain_events_pkey` (the single-column cut's plan re-read the firm's ENTIRE history per
--     probe: `Bitmap Index Scan[domain_events_pkey] rows=30031 x200`, 469 ms). MEASURED at the
--     same three loads, kept set fixed at 200: 1.8 / 1.9 / 1.6 ms -- FLAT. That is the cost of the
--     KEPT SET, which is what this section's first line claims and what the single-column cut
--     could not deliver.
--
--     AN INDEX IS NOT A WRITE. `clara.domain_events` carries the estate's append-only/no-truncate
--     belts (`t_domain_events_append_only`) and an immutability trigger; those are row triggers on
--     UPDATE/DELETE and constrain DML, not DDL, so `create index` is lawful here -- and it runs
--     WITHOUT `concurrently`, which is what keeps this migration ONE transaction (the estate's
--     first law for a migration file). Both tables are owned by `clara_fn_owner`, the role this
--     file has already assumed, so no ownership change is needed either.
--
--     NAMING follows the estate's own `ix_<table>_<subject>` habit, and the partial-expression
--     shape follows two live precedents: `ix_domain_events_classified_document` (0020:292-294, a
--     partial index on this very table, added for the same reason -- an existence probe that
--     would otherwise be a full relation scan on every append) and `ix_operation_receipts_entry`
--     (0178:454-455, an index ON a `->>` expression, joined the same cast-the-other-side way).
-- ==============================================================================================
create index ix_domain_events_sweep_run
  on clara.domain_events(firm_id, (payload ->> 'run_id'))
  where event_type = 'sweep.run_completed';
comment on index clara.ix_domain_events_sweep_run is
  '#728. The sweep receipt of a given firm that reports a given clara.sweep_runs id. Partial on '
  'the receipt type and COMPOSITE on (firm_id, payload->>''run_id''), which is the whole of '
  'clara._sweep_events_with_effect''s correlated predicate: the firm bound (wall b) and the run '
  'reference, so one kept run is ONE index scan returning ONE row. Built ON THE TEXT EXPRESSION '
  'because that helper compares payload->>''run_id'' to sr.id::text rather than casting free jsonb '
  'text to uuid (0183 section 1, wall four) -- an index on a different expression would never be '
  'matched. The expression-ONLY form this replaced was never chosen by any plan at any load '
  '(1k/6k/30k receipts, kept set fixed at 200) and, when forced, cost 469 ms because the planner '
  'AND-ed it with domain_events_pkey and re-read the firm''s whole history per probe.';

create index ix_sweep_runs_firm_effect
  on clara.sweep_runs(firm_id)
  where drafted_count + posted_count > 0;
comment on index clara.ix_sweep_runs_firm_effect is
  '#728. The runs of a firm that actually did something (drafted_count + posted_count > 0 -- a '
  'post is not a draft, 0108). This is the SMALL side of the sweep-attribution join and the side '
  'the planner drives from; without it "which of this firm''s runs had an effect" is a scan of '
  'the firm''s entire append-only sweep history, which grows 288 rows a day.';

-- ==============================================================================================
-- 1. clara._sweep_events_with_effect / clara._sweep_event_has_effect -- the ONE fact
--    list_activity/get_activity_event borrow from clara.sweep_runs. TWO functions, one query
--    shape each.
--
--    WHY A SET AND NOT A SCALAR (native seven-lens review, 2026-09-11, BLOCKER). The first cut of
--    this file spelled the exclusion as a per-row scalar call inside `ev_base`'s WHERE. That
--    predicate runs BEFORE the `order by ... limit`, a SECURITY DEFINER function with its own
--    `set search_path` can never be inlined by the planner, and the body re-derives the session's
--    firm on every call -- so the cost grew with the firm's whole sweep history, which is
--    append-only and on the live firm gains 288 rows a DAY. MEASURED on this rig at 6,000
--    synthetic sweep events (21 days at the live five-minute cadence): 142 ms -> 4.8 s for one
--    25-row page. The set form below is invoked ONCE per feed read (list_activity materialises it
--    into a local array before the union) and at most once per detail read, so the page cost is a
--    single bounded scan of this firm's sweep receipts instead of a function call per row.
--
--    THREE WALLS, ALL INSIDE THE BODY, because a clara_authenticated-granted function is a door
--    whatever its name says -- and it MUST be granted, since the two callers are SECURITY INVOKER
--    and PostgREST exposes any granted function as an RPC endpoint regardless of an underscore
--    prefix (0181's own header names this exact caveat for `_human_ctx`):
--      (a) THE FEED'S OWN FLOOR, restated from scratch via clara._human_ctx(role_rank(
--          'bookkeeper')) (cross-model review, Codex: the first cut had none). Same-firm event ids
--          are readable by ANY member under the firm-only clara.domain_events read policy
--          (0005:379-385), so a floorless helper would let a VIEWER -- refused CLR04 by
--          clara.list_activity itself -- enumerate which sweeps had an effect. The floor is
--          reachable HERE and not in the two INVOKER doors for one measured reason:
--          clara._human_ctx is executable by clara_fn_owner ONLY (0004:299, catalog-confirmed),
--          which 0174's own note on clara.list_firm_timeline already records.
--      (b) THE FIRM BOUND ON THE RUN ITSELF (`sr.firm_id = de.firm_id`), not only on the event.
--          `payload` is a free jsonb column no constraint validates: an event of THIS firm whose
--          run_id names ANOTHER firm's run is reachable by a bug, a replayed payload or a restore,
--          and a lookup keyed on run_id alone would answer this firm's feed with that firm's
--          count.
--      (c) THE EVENT TYPE (`de.event_type = 'sweep.run_completed'`), because the whole contract is
--          "the sweep receipts of this firm whose run DID something"; an unrelated event type that
--          happens to carry a `run_id` key is not a sweep receipt.
--    NO CAST AT ALL, which is how the fourth wall is spelled. `payload ->> 'run_id'` is free text;
--    casting it to uuid raises an untyped 22P02 on a malformed value from inside the scan, taking
--    the ENTIRE feed down for the firm rather than hiding the one heartbeat nobody can verify (the
--    native review's N5 -- and it is not hypothetical: the first perf run of this fix round hit
--    exactly that error on a junk row the battery's own af.18 cell had left in the rig). So the
--    comparison runs the OTHER way, `de.payload ->> 'run_id' = sr.id::text` -- the SAME
--    cast-the-other-side idiom this file already applies to `orr.effects->>'entry_id'` below, and
--    the same canonical text `clara._append_event(...,jsonb_build_object('run_id', sr.id))`
--    (0011:2763-2764) writes. A malformed run_id simply matches nothing, which is the contract.
--
--    DRIVEN FROM clara.sweep_runs, not from the events. The runs that DID something are a handful
--    (the whole premise of this ticket is that most windows change nothing), while the receipts
--    grow at 288 a day, so the small side leads. MEASURED on this rig at 6,000 synthetic sweep
--    events: the event-driven, regex-guarded, uuid-casting form this replaced cost ~115-180 ms
--    per read against ~45 ms for the form below, on the same data in the same session.
--
--    "EFFECT" IS drafted_count + posted_count, NOT drafted_count ALONE (native review). 0108 split
--    the sweep's own bookkeeping into four counters and its header states the reason in so many
--    words -- "a post is not a draft": a run that POSTED entries and drafted none changed the
--    books MORE than one that merely drafted, and reading `drafted_count` alone would have hidden
--    exactly the sweep a bookkeeper most needs to see. `refused_count` and `skipped_count` are
--    deliberately NOT part of the sum: neither moved a cent, a refusal already has its own
--    attributable surface in the agent-receipt lane, and folding them in would re-open the flood
--    this ticket exists to close (a firm whose sweeps refuse every window would be back to 288
--    rows a day). If that turns out to be the wrong product call, it is a ONE-TERM change here.
--
--    TWO FUNCTIONS, NOT ONE WITH AN OPTIONAL PARAMETER (delta review of the fix round,
--    2026-09-11, BLOCKER [0]). The first cut of THIS section spelled both callers' needs as one
--    `return query` carrying `and (p_event is null or de.id = p_event)`. plpgsql caches that
--    statement per SESSION and, after five custom-plan executions, switches to the GENERIC plan;
--    the generic plan gives `($2 IS NULL) OR (id = $2)` default eq-selectivity, estimates
--    `clara.domain_events` at ONE row, puts it on the OUTER side of a Nested Loop and rescans
--    `clara.sweep_runs` once per sweep receipt of the firm. MEASURED on this rig (6,000 receipts
--    for the caller's firm, 200 sibling firms also sweeping, ONE psql session, default
--    plan_cache_mode, all in a rolled-back transaction): calls 1-5 of clara.list_activity took
--    46/18/19/18/18 ms and calls 6-10 took 13.8 / 14.3 / 16.4 / 13.9 / 13.5 SECONDS.
--    PostgREST pools long-lived connections, so that is every Activity read from the sixth on.
--    The rule this file now keeps: NEVER one statement with `x is null or ...` in a plpgsql body
--    two callers share. Each caller gets its own function, and each function's single statement
--    gets its own cached plan whose shape is FIXED -- necessary, and (the next paragraph
--    measures it) not sufficient:
--      * clara._sweep_events_with_effect()  -- the firm's kept receipt ids (the FEED's shape).
--      * clara._sweep_event_has_effect(uuid) -- one receipt, yes or no (the DETAIL door's shape).
--    An absent event, another firm's, a non-sweep, an unresolvable run and a zero-effect run all
--    answer NO ROW / false, which is exactly the safe default both callers want.
--
--    …AND SPLITTING THE CALLERS WAS NOT ENOUGH: THE FIRM IS STILL A PARAMETER (delta review
--    round 3, 2026-09-11, BLOCKER [0]). The split lowered the cliff; it did not remove it. The
--    set form's one remaining variable is `c.firm`, which plpgsql passes as `$1`, and a GENERIC
--    plan estimates `sr.firm_id = $1` at the per-firm AVERAGE of a MULTI-TENANT table -- which is
--    exactly wrong for any firm whose sweep history is above average, i.e. every firm this ticket
--    is about. MEASURED on a PRISTINE database (fresh 0183 chain, 1,500 sibling firms sweeping,
--    4,000 receipts / 200 kept for the caller, ANALYZE inside the transaction, ONE session,
--    default plan_cache_mode): calls 1-5 of `clara._sweep_events_with_effect()` took
--    4.9/4.4/4.1/4.2/4.3 ms and calls 6-10 took 174.1/177.3/178.0/168.1/161.6 ms -- a 35x step at
--    exactly the sixth execution, the plpgsql plan-cache boundary. No rewrite of the statement can
--    close this: a parameter is a parameter.
--
--    SO THE FUNCTION ITSELF PINS CUSTOM PLANS. `set plan_cache_mode = force_custom_plan` sits on
--    BOTH helpers beside their `set search_path`; a function-level GUC is in force for the
--    duration of the call, so every statement plpgsql caches inside these bodies is re-planned
--    against the REAL firm id, every time. It costs one planning pass (~1 ms against a 4 ms
--    query) and it is the only remedy no future edit can quietly undo, because it does not depend
--    on the shape of the statement at all. Same load, same session, after: 4.9/4.4/4.1/4.2/4.3/
--    4.3/4.9/4.7/4.6/4.8 ms -- FLAT across the boundary. `explain (generic_plan)` of the bare
--    statement text still renders that Nested Loop; it is simply never the plan these functions
--    run, which is why af.20 pins the plan the catalog says will BE run (proconfig) and the plan
--    the planner actually chooses (`explain (analyze)`), and never the generic rendering.
--
--    AND THE COST IS BOUNDED BY THE KEPT SET, WHICH TOOK A LATERAL FENCE (delta review round 3,
--    finding [2]). Written as a plain join, the planner reads the firm's WHOLE receipt history
--    (Merge Join over a Seq Scan: 3.3 / 7.2 / 134.2 ms at 1,000 / 6,000 / 30,000 receipts with the
--    kept set held at 200) and never touches section 0b's receipt index. `cross join lateral
--    (... offset 0)` is what stops the planner flattening the correlated probe back into that
--    join -- measured: WITHOUT the `offset 0` the lateral is flattened and the plan is the same
--    Merge Join + Seq Scan (97-136 ms at 30,000); WITH it, and with the composite index of
--    section 0b, the plan is `Nested Loop -> Index Scan using ix_domain_events_sweep_run
--    (loops=200, 1 row each)` at 1.8 / 1.9 / 1.6 ms -- the same cost at 3.5 days, 21 days and 105
--    days of sweeping. `offset 0` is an optimisation fence and nothing else: no LIMIT, no
--    ordering, so the rows it yields are exactly the join's rows (a run named by two receipts
--    still contributes both).
--
--    AND BOTH REMEDIES STAY, WHICH IS WORTH SAYING BECAUSE THEY OVERLAP. Once the composite index
--    and the fence are in, the GENERIC plan for this statement is the same Nested Loop -> Index
--    Scan the custom plan is, so at the loads above the flip no longer shows even with the
--    plan_cache_mode clause removed (measured on the fixed chain, clause dropped by ALTER
--    FUNCTION: 1.8/1.2/1.0/1.0/0.9/0.9/0.8/0.7/0.7/0.7 ms at 4,000 receipts, and
--    27.6/19.1/22.3/26.8/22.5/22.3/19.8/27.8/27.7/33.8 ms at 30,000 with 1,500 kept). That is a
--    STATISTICS ACCIDENT, not a guarantee: the generic estimate for `sr.firm_id = $1` is still
--    the per-firm average, and it is the estimate -- not the index -- that decides which plan is
--    cheapest on a table whose shape this file cannot see. The clause is what makes the answer
--    independent of that, for ~1 ms a call, and af.20's catalog arm is what keeps it here (it is
--    the arm that reds when the clause alone is removed; the wall-clock arm, on this fixed body,
--    does not).
-- ==============================================================================================
-- THE FEED'S SHAPE: the whole kept set of this firm. One statement, one plan, re-planned per call
-- against the real firm id (plan_cache_mode above), probing ONE receipt per kept run.
create function clara._sweep_events_with_effect()
returns table(event_id uuid)
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  -- THE FIRM IS A PARAMETER AND ALWAYS WILL BE: re-plan every call against its real value rather
  -- than let plpgsql settle on a generic plan built for the per-firm average. See this section's
  -- header for the 35x step at the sixth call this removes, and its cost (~1 ms of planning).
  set plan_cache_mode = force_custom_plan
  as $$
declare c record;
begin
  -- (a) THE FLOOR, FIRST and unconditionally: a caller below bookkeeper learns nothing at all --
  -- not which sweeps had an effect, not whether an id names an event, not whether it is a sweep.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return query
  -- Driven from clara.sweep_runs THROUGH ix_sweep_runs_firm_effect (section 0b): the rows this
  -- reads are the firm's runs that DID something, and each one probes at most one receipt through
  -- ix_domain_events_sweep_run. The firm's zero-effect history is never touched.
  select e.id
    from clara.sweep_runs sr
    cross join lateral (
      select de.id
        from clara.domain_events de
        -- (b) the run must belong to the SAME firm as the event that reports it -- `payload` is a
        -- free jsonb column no constraint validates, and a run_id alone would cross the boundary.
       where de.firm_id = sr.firm_id
         -- (c) …and the event must be a sweep receipt.
         and de.event_type = 'sweep.run_completed'
         -- …compared as TEXT, never cast to uuid: see this section's header, wall four.
         and de.payload ->> 'run_id' = sr.id::text
         -- THE FENCE, and it is load-bearing rather than decorative: without it the planner pulls
         -- this subquery up into a plain join and reads the firm's whole history (measured in this
         -- section's header). No LIMIT and no ORDER BY, so the rows are exactly the join's rows.
       offset 0
    ) e
   where sr.firm_id = c.firm
     and sr.drafted_count + sr.posted_count > 0;
end $$;
revoke all on function clara._sweep_events_with_effect() from public;
grant execute on function clara._sweep_events_with_effect() to clara_authenticated;
comment on function clara._sweep_events_with_effect() is
  '#728. The sweep.run_completed domain events of THIS session''s firm whose clara.sweep_runs row '
  'actually did something (drafted_count + posted_count > 0 -- a post is not a draft, 0108; '
  'refused/skipped deliberately excluded, see 0183 section 1). An absent event, another firm''s, a '
  'non-sweep, an unresolvable or non-uuid run_id, and a zero-effect run all contribute NO ROW (the '
  'run_id is compared as TEXT, never cast, so a malformed one matches nothing instead of raising). '
  'Carries clara.list_activity''s OWN bookkeeper floor (clara._human_ctx) because it is '
  'clara_authenticated-granted and therefore PostgREST-reachable directly despite the leading '
  'underscore. TAKES NO ARGUMENT ON PURPOSE: the optional-parameter form it replaced shared one '
  'cached plan with the detail door and flipped to a generic Nested Loop on the 6th call of a '
  'session (13.8 s a page, measured) -- see 0183 section 1. PINS plan_cache_mode = '
  'force_custom_plan, because the session firm is still a parameter and a generic plan estimates '
  'it at the per-firm average of a multi-tenant table (4 ms -> 174 ms at the 6th call, measured); '
  'and probes one receipt per KEPT run through a lateral fence, so its cost is the kept set and '
  'not the firm''s 288-a-day receipt history. The point lookup is '
  'clara._sweep_event_has_effect(uuid).';

-- THE DETAIL DOOR'S SHAPE: one receipt, yes or no. A SEPARATE function, not a parameter on the
-- one above, so its statement gets its OWN cached plan -- re-planned per call for the same reason
-- the set form's is, and for symmetry: `de.id = $2` really does select one row, but `sr.firm_id =
-- $1` is the same multi-tenant average the set form flipped on, and a helper whose two halves
-- disagree about their own plan discipline is a helper someone will later "tidy" the wrong way.
create function clara._sweep_event_has_effect(p_event uuid)
returns boolean
  language plpgsql stable security definer
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare c record; v_has boolean;
begin
  -- The SAME floor, restated: this function is granted and therefore PostgREST-reachable too, and
  -- "did this sweep do anything" is the very fact the floor above exists to withhold.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select exists (
    select 1
      from clara.sweep_runs sr
      join clara.domain_events de
        on de.firm_id = sr.firm_id
       and de.event_type = 'sweep.run_completed'
       and de.payload ->> 'run_id' = sr.id::text
     where sr.firm_id = c.firm
       and sr.drafted_count + sr.posted_count > 0
       and de.id = p_event)
    into v_has;
  return coalesce(v_has, false);
end $$;
revoke all on function clara._sweep_event_has_effect(uuid) from public;
grant execute on function clara._sweep_event_has_effect(uuid) to clara_authenticated;
comment on function clara._sweep_event_has_effect(uuid) is
  '#728. TRUE when p_event names a sweep.run_completed receipt of THIS session''s firm whose '
  'clara.sweep_runs row actually did something (the same drafted_count + posted_count > 0 rule '
  'clara._sweep_events_with_effect applies to the set). An absent event, another firm''s, a '
  'non-sweep, an unresolvable or non-uuid run_id and a zero-effect run are all FALSE -- the same '
  'answer, so the boolean is no existence oracle. Bookkeeper-floored (clara._human_ctx) and '
  'self-scoped to the session firm for the same reason the set form is. Separate from the set '
  'form so the two callers never share one cached plan, and pins plan_cache_mode = '
  'force_custom_plan for the same reason the set form does: see 0183 section 1.';

-- ==============================================================================================
-- 2. clara.list_activity -- RECUT. Full 0181 body (sha e8c3b7b8..., pinned above); the ONLY
--    changes are marked #728 below. SAME signature, SAME 18-column projection, SAME SECURITY
--    INVOKER posture, SAME floor.
-- ==============================================================================================
create or replace function clara.list_activity(
  p_cursor text default null,
  p_limit  int  default 50,
  p_client uuid default null,
  p_kinds  text[] default null,
  p_since  timestamptz default null,
  p_until  timestamptz default null
) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
declare
  c record;
  v_limit int;
  v_cursor_ts timestamptz := null;
  v_cursor_id text := null;
  v_decoded text;
  v_pipe int;
  v_kind text;
  v_all jsonb;
  v_total int;
  v_truncated boolean;
  v_page jsonb;
  v_last jsonb;
  v_next_cursor text;
  -- #728 (N1): the KEPT sweep receipts of this firm, read ONCE per call -- see the predicate
  -- inside ev_base below, and section 1's header for why this is not a per-row call.
  v_kept_sweeps uuid[];
begin
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);

  if p_kinds is not null then
    foreach v_kind in array p_kinds loop
      if v_kind not in ('documents', 'journal', 'close', 'report', 'agent', 'work') then
        raise exception 'unknown activity kind %', v_kind using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'invalid_kind', 'kind', v_kind)::text;
      end if;
    end loop;
  end if;

  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      v_pipe := position('|' in v_decoded);
      if v_pipe < 2 or v_pipe = length(v_decoded) then
        raise exception 'malformed cursor shape';
      end if;
      v_cursor_ts := substr(v_decoded, 1, v_pipe - 1)::timestamptz;
      v_cursor_id := substr(v_decoded, v_pipe + 1);
    exception when others then
      raise exception 'malformed activity cursor' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'invalid_cursor')::text;
    end;
  end if;

  -- #728 (N1): ONE invocation of the definer set helper per feed read, materialised into a local
  -- array the union's predicate can test with a plain `= any(...)`. Placed AFTER the floor checks
  -- (a refused caller never pays for it) and BEFORE the union, so no plan the planner might choose
  -- can turn it back into a per-row call.
  --
  -- …and NOT paid at all when no sweep row could survive this read's own filters (delta review of
  -- the fix round, finding [1]: the read was unconditional). A sweep receipt's `kind` is
  -- unconditionally 'agent' -- ev_base's FIRST case arm below, ahead of the 0181 ladder -- so a
  -- p_kinds list that omits 'agent' can never return one, and an EMPTY kept set then excludes
  -- every sweep row in ev_base, which is where those rows were headed anyway. The guard is on
  -- p_kinds ONLY and deliberately not on p_client: a sweep receipt written by
  -- clara.reconcile_sweep_runs is firm-level (client_id null, 0011:2763-2764), but `client_id` is
  -- a column on the event, not a law about it, and a client-scoped read must not start deciding
  -- what a row IS from what this file expects it to be.
  if p_kinds is null or 'agent' = any(p_kinds) then
    select coalesce(array_agg(k.event_id), '{}'::uuid[]) into v_kept_sweeps
      from clara._sweep_events_with_effect() k;
  else
    v_kept_sweeps := '{}'::uuid[];
  end if;

  with
  ev_base as (
    select
      v.event_id::text                                                    as id,
      'event'::text                                                       as source,
      v.event_type                                                        as event_type,
      v.event_description                                                 as description,
      v.client_id                                                         as client_id,
      v.actor                                                             as actor,
      v.on_behalf_of                                                      as on_behalf_of,
      v.via_wake_kind                                                     as via_wake_kind,
      v.created_at                                                        as occurred_at,
      v.object_kind                                                       as object_kind,
      v.object_id                                                         as object_id,
      orr.work_id                                                         as work_id,
      orr.id::text                                                        as receipt_id,
      case when v.object_kind = 'document' then v.object_id end           as document_id,
      case when v.object_kind = 'entry' then je.reversal_of end           as original_entry_id,
      case when v.object_kind = 'entry' then je.reversed_by end           as replacement_entry_id,
      case
        when v.object_kind <> 'entry' then null
        when je.status = 'approved' and je.reversed_by is not null then 'reversed'
        when je.status = 'approved' then 'approved'
        when je.status = 'withdrawn' and je.withdrawal_reason = 'superseded-by-correction' then 'superseded'
        when je.status = 'withdrawn' then 'withdrawn'
        else je.status
      end                                                                 as status,
      case
        -- #728 (C77.3): a sweep heartbeat is an AGENT ACT on the books, never a document act --
        -- checked FIRST, ahead of the untouched 0181 ladder below, because 'sweep.run_completed'
        -- matches none of those prefixes anyway and this keeps the one new rule visually apart
        -- from the three it does not change.
        when v.event_type = 'sweep.run_completed' then 'agent'
        when v.event_type like 'entry.%' then 'journal'
        when v.event_type like 'document.%' then 'documents'
        when v.event_type like 'close.%' then 'close'
        else 'documents'
      end                                                                 as kind
    from clara.firm_timeline_visible v
    left join clara.journal_entries je
      on v.object_kind = 'entry' and je.id = v.object_id and je.firm_id = c.firm
    left join clara.operation_receipts orr
      on v.object_kind = 'entry' and orr.firm_id = c.firm and orr.outcome = 'committed'
     -- Text comparison, not a uuid cast of the jsonb text expression: `ix_operation_receipts_entry`
     -- (0178:454-455) is built ON THE TEXT EXPRESSION `(effects->>'entry_id')`, and casting that
     -- expression to uuid before comparing defeats the index (the planner cannot match an
     -- expression index against a different expression on the same column, even a semantically
     -- equivalent one) -- cast the OTHER side instead, which is already a plain uuid column.
     and nullif(orr.effects->>'entry_id', '') = v.object_id::text
    -- #728: EXCLUDE a sweep heartbeat that changed nothing. `v_kept_sweeps` holds the receipts
    -- whose run actually drafted or posted something (clara._sweep_events_with_effect, read once
    -- above); a run that cannot be resolved at all contributes no id and is therefore treated the
    -- SAME as a zero-effect one -- an unverifiable heartbeat is not evidence of one, and is never
    -- shown by default. Every non-sweep row is untouched: the left side of the `or` is true for
    -- all of them, so this predicate can only ever remove sweep.run_completed rows, nothing else.
   where v.event_type <> 'sweep.run_completed' or v.event_id = any(v_kept_sweeps)
  ),
  ev as (
    select * from ev_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  ar_base as (
    select
      (r.receipt_kind || ':' || r.receipt_id)                             as id,
      'agent_receipt'::text                                               as source,
      null::text                                                          as event_type,
      null::text                                                          as description,
      r.client_id                                                         as client_id,
      r.acting_actor                                                      as actor,
      r.on_behalf_of                                                      as on_behalf_of,
      r.via_wake_kind                                                     as via_wake_kind,
      r.occurred_at                                                       as occurred_at,
      null::text                                                          as object_kind,
      null::uuid                                                          as object_id,
      null::uuid                                                          as work_id,
      (r.receipt_kind || ':' || r.receipt_id)                             as receipt_id,
      null::uuid                                                          as document_id,
      null::uuid                                                          as original_entry_id,
      null::uuid                                                          as replacement_entry_id,
      null::text                                                          as status,
      case when r.receipt_kind = 'report_agent' then 'report' else 'agent' end as kind
    from clara.agent_receipts_visible r
  ),
  ar as (
    select * from ar_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  orx_base as (
    select
      orr.id::text                                                       as id,
      'operation_receipt'::text                                          as source,
      w.purpose                                                          as event_type,
      null::text                                                         as description,
      orr.client_id                                                      as client_id,
      orr.acting_actor                                                   as actor,
      orr.on_behalf_of                                                   as on_behalf_of,
      orr.via_wake_kind                                                  as via_wake_kind,
      orr.created_at                                                     as occurred_at,
      'entry'::text                                                      as object_kind,
      nullif(orr.effects->>'entry_id', '')::uuid                         as object_id,
      orr.work_id                                                        as work_id,
      orr.id::text                                                       as receipt_id,
      null::uuid                                                         as document_id,
      je2.reversal_of                                                    as original_entry_id,
      je2.reversed_by                                                    as replacement_entry_id,
      case
        when je2.status = 'approved' and je2.reversed_by is not null then 'reversed'
        when je2.status = 'approved' then 'approved'
        when je2.status = 'withdrawn' and je2.withdrawal_reason = 'superseded-by-correction' then 'superseded'
        when je2.status = 'withdrawn' then 'withdrawn'
        else je2.status
      end                                                                as status,
      'work'::text                                                       as kind
    from clara.operation_receipts orr
    left join clara.accounting_work w on w.id = orr.work_id and w.firm_id = c.firm
    left join clara.journal_entries je2
      -- Same index-preserving text comparison as the ev_base join above.
      on je2.id::text = nullif(orr.effects->>'entry_id', '') and je2.firm_id = c.firm
    where orr.firm_id = c.firm and orr.outcome = 'committed'
  ),
  orx as (
    select * from orx_base
     where (p_client is null or client_id = p_client)
       and (p_kinds is null or kind = any(p_kinds))
       and (p_since is null or occurred_at >= p_since)
       and (p_until is null or occurred_at < p_until)
       and (v_cursor_ts is null or (occurred_at, id) < (v_cursor_ts, v_cursor_id))
     order by occurred_at desc, id desc
     limit v_limit + 1
  ),
  unioned as (
    select * from ev union all select * from ar union all select * from orx
  )
  -- `jsonb_agg(to_jsonb(u.*))` with NO `order by` INSIDE the aggregate call is not guaranteed to
  -- respect the subquery's own `order by` -- an aggregate over a subquery may see its input rows
  -- in whatever order the planner chooses to feed them (a parallel worker, a different join
  -- strategy on a future replan), so the page and its `next_cursor` must never be minted from an
  -- order the aggregate itself did not pin. `order by u.occurred_at desc, u.id desc` INSIDE
  -- `jsonb_agg` makes that order part of the aggregate's own contract, not an incidental property
  -- borrowed from the subquery underneath it.
  select coalesce(jsonb_agg(to_jsonb(u.*) order by u.occurred_at desc, u.id desc), '[]'::jsonb) into v_all
    from (
      select * from unioned
       order by occurred_at desc, id desc
       limit v_limit + 1
    ) u;

  v_total := jsonb_array_length(v_all);
  v_truncated := v_total > v_limit;

  if v_truncated then
    -- Same guarantee on the truncation slice: `ord` (the ordinality `jsonb_array_elements` mints
    -- over the ALREADY-ordered `v_all`) is projected back OUT to the aggregate's own `order by`
    -- rather than being dropped after the `where` filters on it -- the prior shape selected only
    -- `elem`, so the page these rows became had no aggregate-level order guarantee, only the
    -- current statement's plan happening to preserve one.
    select jsonb_agg(x.elem order by x.ord) into v_page
      from (
        select elem, ord from jsonb_array_elements(v_all) with ordinality as t(elem, ord)
         where ord <= v_limit
      ) x;
    v_last := v_page -> (v_limit - 1);
    v_next_cursor := encode(
      convert_to((v_last->>'occurred_at') || '|' || (v_last->>'id'), 'UTF8'), 'base64');
  else
    v_page := v_all;
    v_next_cursor := null;
  end if;

  return jsonb_build_object('rows', v_page, 'next_cursor', v_next_cursor, 'truncated', v_truncated);
end $$;
comment on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) is
  '#632 B5, recut #728. The firm activity feed: a keyset-paged union of clara.firm_timeline_visible '
  '(domain events), clara.agent_receipts_visible (agent act receipts) and '
  'clara.operation_receipts (#623 committed operation receipts), newest first over '
  '(occurred_at desc, id desc). SECURITY INVOKER over three already-clara_authenticated-granted '
  'sources; refuses CLR04 below bookkeeper before running. p_kinds is the closed set '
  '{documents,journal,close,report,agent,work}, refused CLR10 invalid_kind otherwise. p_limit '
  'clamps 1..100. p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a '
  'malformed one refuses CLR10 invalid_cursor. #728: a sweep.run_completed event with no drafted '
  'effect is excluded entirely; one that drafted something is kind=agent (never documents), actor '
  'stays null. See this migration''s and 0181''s headers for the full rationale.';

-- ==============================================================================================
-- 3. clara.get_activity_event -- RECUT. Full 0181 body (sha a5585bdf..., pinned above); the SAME
--    #728 sweep rule applied to the 'event' source branch, so a deep link to an excluded
--    heartbeat answers the SAME CLR11 no-oracle refusal this door already uses.
-- ==============================================================================================
create or replace function clara.get_activity_event(p_source text, p_id text) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
declare
  c record;
  v_row jsonb;
  v_kind text;
  v_rid text;
  v_colon int;
begin
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  if p_source is null or p_id is null or btrim(p_id) = '' then
    raise exception 'source and id are required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'activity_source_or_id_missing')::text;
  end if;

  if p_source = 'event' then
    select jsonb_build_object(
        'id', v.event_id::text, 'source', 'event', 'event_type', v.event_type,
        'description', v.event_description, 'client_id', v.client_id, 'actor', v.actor,
        'on_behalf_of', v.on_behalf_of, 'via_wake_kind', v.via_wake_kind, 'occurred_at', v.created_at,
        'object_kind', v.object_kind, 'object_id', v.object_id,
        'work_id', orr.work_id, 'receipt_id', orr.id::text,
        'document_id', case when v.object_kind = 'document' then v.object_id end,
        'original_entry_id', case when v.object_kind = 'entry' then je.reversal_of end,
        'replacement_entry_id', case when v.object_kind = 'entry' then je.reversed_by end,
        'status', case
          when v.object_kind <> 'entry' then null
          when je.status = 'approved' and je.reversed_by is not null then 'reversed'
          when je.status = 'approved' then 'approved'
          when je.status = 'withdrawn' and je.withdrawal_reason = 'superseded-by-correction' then 'superseded'
          when je.status = 'withdrawn' then 'withdrawn'
          else je.status
        end,
        'kind', case
          -- #728: same rule as list_activity's ev_base -- see that function's own comment.
          when v.event_type = 'sweep.run_completed' then 'agent'
          when v.event_type like 'entry.%' then 'journal'
          when v.event_type like 'document.%' then 'documents'
          when v.event_type like 'close.%' then 'close'
          else 'documents'
        end,
        'client_name', cl.name
      ) into v_row
      from clara.firm_timeline_visible v
      left join clara.journal_entries je
        on v.object_kind = 'entry' and je.id = v.object_id and je.firm_id = c.firm
      left join clara.operation_receipts orr
        on v.object_kind = 'entry' and orr.firm_id = c.firm and orr.outcome = 'committed'
       -- Same index-preserving text comparison as list_activity's ev_base join.
       and nullif(orr.effects->>'entry_id', '') = v.object_id::text
      left join clara.clients cl on cl.id = v.client_id and cl.firm_id = c.firm
     where v.event_id::text = p_id;

    -- #728: the SAME exclusion list_activity applies -- a deep link to a zero-effect sweep
    -- heartbeat is dropped here, falls through to `v_row is null` below, and answers the SAME
    -- CLR11 activity_event_not_found every other denied/absent id already gets (no oracle: an
    -- excluded heartbeat must not read differently from one that never existed).
    --
    -- AFTER the row is fetched, not as another WHERE predicate beside `v.event_id::text = p_id`
    -- (native review, N1): a definer function in the WHERE is a filter the planner is free to
    -- order however it costs it, and one bad estimate would run it once per row of the whole
    -- timeline. Hoisted out like this it runs at most once per call, and only for a sweep receipt.
    -- It calls clara._sweep_event_has_effect, NOT the set form the feed calls: one cached plan per
    -- caller shape is the whole point of splitting them (0183 section 1, BLOCKER [0]).
    if v_row is not null and v_row ->> 'event_type' = 'sweep.run_completed'
       and not clara._sweep_event_has_effect((v_row ->> 'id')::uuid) then
      v_row := null;
    end if;

  elsif p_source = 'agent_receipt' then
    v_colon := position(':' in p_id);
    if v_colon < 2 or v_colon = length(p_id) then
      raise exception 'activity event not found' using errcode = 'CLR11',
        detail = jsonb_build_object('reason', 'activity_event_not_found')::text;
    end if;
    v_kind := substr(p_id, 1, v_colon - 1);
    v_rid := substr(p_id, v_colon + 1);
    select jsonb_build_object(
        'id', (r.receipt_kind || ':' || r.receipt_id), 'source', 'agent_receipt',
        'event_type', null, 'description', null, 'client_id', r.client_id,
        'actor', r.acting_actor, 'on_behalf_of', r.on_behalf_of, 'via_wake_kind', r.via_wake_kind,
        'occurred_at', r.occurred_at, 'object_kind', null, 'object_id', null,
        'work_id', null, 'receipt_id', (r.receipt_kind || ':' || r.receipt_id),
        'document_id', null, 'original_entry_id', null, 'replacement_entry_id', null,
        'status', null,
        'kind', case when r.receipt_kind = 'report_agent' then 'report' else 'agent' end,
        'receipt_kind', r.receipt_kind, 'client_name', cl.name
      ) into v_row
      from clara.agent_receipts_visible r
      left join clara.clients cl on cl.id = r.client_id and cl.firm_id = c.firm
     where r.receipt_kind = v_kind and r.receipt_id = v_rid;

  elsif p_source = 'operation_receipt' then
    select jsonb_build_object(
        'id', orr.id::text, 'source', 'operation_receipt', 'event_type', w.purpose,
        'description', null, 'client_id', orr.client_id, 'actor', orr.acting_actor,
        'on_behalf_of', orr.on_behalf_of, 'via_wake_kind', orr.via_wake_kind,
        'occurred_at', orr.created_at, 'object_kind', 'entry',
        'object_id', nullif(orr.effects->>'entry_id', '')::uuid,
        'work_id', orr.work_id, 'receipt_id', orr.id::text, 'document_id', null,
        'original_entry_id', je2.reversal_of, 'replacement_entry_id', je2.reversed_by,
        'status', case
          when je2.status = 'approved' and je2.reversed_by is not null then 'reversed'
          when je2.status = 'approved' then 'approved'
          when je2.status = 'withdrawn' and je2.withdrawal_reason = 'superseded-by-correction' then 'superseded'
          when je2.status = 'withdrawn' then 'withdrawn'
          else je2.status
        end,
        'kind', 'work',
        'purpose', w.purpose, 'basis_origin', w.basis_origin, 'initiator', w.initiator,
        'client_name', cl.name
      ) into v_row
      from clara.operation_receipts orr
      left join clara.accounting_work w on w.id = orr.work_id and w.firm_id = c.firm
      left join clara.journal_entries je2
        -- Same index-preserving text comparison as list_activity's orx_base join.
        on je2.id::text = nullif(orr.effects->>'entry_id', '') and je2.firm_id = c.firm
      left join clara.clients cl on cl.id = orr.client_id and cl.firm_id = c.firm
     where orr.id::text = p_id and orr.firm_id = c.firm and orr.outcome = 'committed';

  else
    -- Folded into the SAME shared refusal below rather than raised here with its own distinct
    -- 'activity_source_unknown' reason -- this function's own comment already claims "an unknown
    -- source... refuse the SAME CLR11 activity_event_not_found", and a caller-visible SECOND
    -- reason token for the identical no-oracle situation would make that claim false. Leaving
    -- `v_row` at its declared NULL lets the common check right below raise the one shared refusal.
    v_row := null;
  end if;

  if v_row is null then
    raise exception 'activity event not found' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'activity_event_not_found')::text;
  end if;
  return v_row;
end $$;
comment on function clara.get_activity_event(text, text) is
  '#632 B5, recut #728. The detail record for one clara.list_activity row, addressed by (source, '
  'id) -- see that function''s own comment for the shapes. Another firm''s row, an unknown source, '
  'a malformed agent_receipt pair, a genuinely absent id, or an EXCLUDED zero-effect sweep '
  'heartbeat (#728) all refuse the SAME CLR11 activity_event_not_found (no oracle). p_id is TEXT '
  '-- see this function''s header comment for why.';

-- ==============================================================================================
-- 4. clara.list_spoken_for_documents -- #728 item 5. The evidence pickers' advisory read: which
--    of the documents THIS CLIENT'S PICKER CAN OFFER already back a LIVE posted entry, WHOSE entry
--    it is, and through which lane. Bookkeeper+, firm+client floored, no-oracle CLR11 on a
--    cross-firm or absent client. Read-only; the door-side refusal (attach_entry_evidence's CLR13
--    source_already_posted, admit_journal_work's own check) is unchanged and stays the law -- this
--    read is advisory only (see this file's header, arm B).
--
--    THE CLAIM IS FIRM-WIDE, AND SO IS THIS READ (cross-model review, Codex, 2026-09-11: the first
--    cut asked a CLIENT-scoped question against a firm-wide invariant). `uq_document_filing_active`
--    is `(document_id, client_id) where retired_at is null` (0007:93), so ONE document may be
--    actively filed to TWO clients of a firm at once; `uq_entry_evidence_links_document` (0182:345)
--    carries no client column at all, and `clara._document_posting_entry` (0182:579-590) scopes its
--    own lookup to the FIRM for exactly that reason -- its header records the same finding from
--    #634's review round. A client-scoped read here would call a document FREE for client B while
--    client A's entry already stands on it, and the person would learn otherwise only from the
--    door's refusal on submit -- which is the whole defect this item exists to close.
--
--    THE CANDIDATE SET IS THE PICKER'S OWN, which is what keeps a firm-wide claim scan bounded and
--    the answer relevant: a claim is reported only when the document it names is an ACTIVE FILING
--    of p_client (`clara.document_filings`, `retired_at is null` -- the SAME relation and predicate
--    `listClientEvidenceDocuments` builds the option list from, apps/web/lib/work/evidence.ts). A
--    document nobody offers this client is not this client's business, spoken for or not.
--
--    ONE ROW PER DOCUMENT, ranked the way clara._document_posting_entry ranks: a LIVE evidence link
--    beats a coding-lane binding. #718 records that the coding lane can still post on a document
--    this lane has already bound, so a double claim is a state that exists and the read answers it
--    deterministically (a picker option carries one reason, not two) rather than assuming it away.
--
--    `client_name` IS JOINED IN rather than left to the caller: naming the claimant is the whole
--    point of the firm-wide scope -- "already backs a posted entry" is unactionable if the person
--    cannot see WHOSE entry -- and clara.clients is firm-scoped and already readable by this
--    caller (the same fact clara.get_activity_event returns as its own `client_name`), so this is
--    a round trip saved, never a disclosure widened.
-- ==============================================================================================
create function clara.list_spoken_for_documents(p_client uuid)
returns table(document_id uuid, entry_id uuid, client_id uuid, client_name text, via text)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    -- NO EXISTENCE ORACLE: a client of another firm reads identically to a uuid naming nothing.
    raise exception 'client not found in your firm' using errcode = 'CLR11',
      detail = jsonb_build_object('reason', 'client_not_found')::text;
  end if;

  return query
  select distinct on (s.doc) s.doc, s.ent, s.cli, cl.name, s.lane
    from (
      -- Arm 1: a LIVE clara.entry_evidence_links binding (0182), ANY client of the firm.
      -- `released_at is null` is the SAME predicate `uq_entry_evidence_links_document` enforces
      -- (0182:345-346) -- a reversed entry's released binding must not show as "already used",
      -- because the correction is free to cite it.
      select l.document_id as doc, l.entry_id as ent, l.client_id as cli,
             'evidence_link'::text as lane, 0 as rank
        from clara.entry_evidence_links l
       where l.firm_id = c.firm
         and l.released_at is null
         and exists (select 1 from clara.document_filings f
                      where f.document_id = l.document_id and f.client_id = p_client
                        and f.firm_id = c.firm and f.retired_at is null)
      union all
      -- Arm 2: the document-coding lane's own binding -- approved, not reversed, ANY client of the
      -- firm. The SAME pair migration 0182's clara._document_posting_entry asks per-document (its
      -- own header names this exact predicate for the exact same reason: LAW 6 leaves a reversed
      -- entry's status 'approved', so "not reversed" cannot be read off status alone).
      select je.document_id, je.id, je.client_id, 'coding'::text, 1
        from clara.journal_entries je
       where je.firm_id = c.firm
         and je.document_id is not null
         and je.status = 'approved'
         and je.reversed_by is null
         and exists (select 1 from clara.document_filings f
                      where f.document_id = je.document_id and f.client_id = p_client
                        and f.firm_id = c.firm and f.retired_at is null)
    ) s
    -- An INNER join: a claimant whose client row this firm cannot read is not a claim this firm
    -- may be told about. Every row above is already firm-bound, so this drops nothing in practice
    -- and is a belt on the one column that leaves the firm's own relations.
    join clara.clients cl on cl.id = s.cli and cl.firm_id = c.firm
   order by s.doc, s.rank;
end $$;
revoke all on function clara.list_spoken_for_documents(uuid) from public;
grant execute on function clara.list_spoken_for_documents(uuid) to clara_authenticated;
comment on function clara.list_spoken_for_documents(uuid) is
  '#728. Documents ACTIVELY FILED to p_client that already back a LIVE posted entry of ANY client '
  'of the caller''s firm: a live clara.entry_evidence_links binding (via=evidence_link, '
  'released_at is null) union an approved, not-reversed journal_entries.document_id binding '
  '(via=coding), one row per document with the live link winning -- the same two facts and the '
  'same precedence migration 0182''s clara._document_posting_entry applies per document, answered '
  'here for a whole picker at once. client_id/client_name name the CLAIMANT, which may be a '
  'sibling client the document is also filed to (uq_document_filing_active is per (document, '
  'client); the evidence invariant is firm-wide). Bookkeeper+ (_human_ctx), no-oracle CLR11 '
  'client_not_found. Advisory only: the picker uses this to disable an option, but '
  'attach_entry_evidence/admit_journal_work stay the actual law and their own typed conflict '
  'refusal is unchanged by this door''s existence.';

-- ==============================================================================================
-- 5. GRANTS -- restated for the two recut doors (create or replace preserves an unchanged
--    signature's ACL on its own; this is belt-and-suspenders, the same house habit every prior
--    recut in this estate follows).
-- ==============================================================================================
revoke all on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) from public;
revoke all on function clara.get_activity_event(text, text) from public;

grant execute on function clara.list_activity(text, int, uuid, text[], timestamptz, timestamptz) to clara_authenticated;
grant execute on function clara.get_activity_event(text, text) to clara_authenticated;

reset role;

-- ==============================================================================================
-- 6. TAIL POSTCHECK.
-- ==============================================================================================
do $tail$
declare v_n int; v_mode boolean; v_kind_count int; v_body text;
begin
  if to_regprocedure('clara._sweep_events_with_effect()') is null then
    raise exception 'activity_sweep_attribution tail: clara._sweep_events_with_effect is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara._sweep_event_has_effect(uuid)') is null then
    raise exception 'activity_sweep_attribution tail: clara._sweep_event_has_effect is absent' using errcode = 'CLR10';
  end if;
  -- The optional-parameter form is GONE, not merely unused: one statement serving both callers is
  -- what flipped to a generic Nested Loop on the 6th call of a session (0183 section 1).
  if to_regprocedure('clara._sweep_events_with_effect(uuid)') is not null then
    raise exception 'activity_sweep_attribution tail: the optional-parameter clara._sweep_events_with_effect(uuid) still resolves -- the two callers must not share one cached plan'
      using errcode = 'CLR10';
  end if;
  -- BOTH helpers pin custom plans. This is the remedy for the generic-plan flip (section 1), and
  -- it is asserted HERE rather than only in the battery because a body re-shipped without the
  -- clause answers correctly and slowly -- the failure mode a correctness test cannot see.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname in ('_sweep_events_with_effect', '_sweep_event_has_effect')
     and 'plan_cache_mode=force_custom_plan' = any(coalesce(p.proconfig, '{}'::text[]));
  if v_n <> 2 then
    raise exception 'activity_sweep_attribution tail: % of 2 sweep helpers pin plan_cache_mode=force_custom_plan -- without it the session firm is planned at the per-firm average and the 6th call of a session flips to a generic Nested Loop', v_n
      using errcode = 'CLR10';
  end if;
  -- …and both still pin their search_path, which the clause above sits BESIDE and never replaces.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.proname in ('_sweep_events_with_effect', '_sweep_event_has_effect')
     and 'search_path=clara, pg_temp' = any(coalesce(p.proconfig, '{}'::text[]));
  if v_n <> 2 then
    raise exception 'activity_sweep_attribution tail: % of 2 sweep helpers still pin search_path=clara, pg_temp', v_n
      using errcode = 'CLR10';
  end if;
  -- Section 0b's two indexes, without which the kept-set read is a scan of the firm's whole
  -- append-only sweep history.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relkind = 'i'
     and c.relname in ('ix_domain_events_sweep_run', 'ix_sweep_runs_firm_effect');
  if v_n <> 2 then
    raise exception 'activity_sweep_attribution tail: expected both sweep-attribution indexes, found %', v_n
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.list_spoken_for_documents(uuid)') is null then
    raise exception 'activity_sweep_attribution tail: clara.list_spoken_for_documents is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)') is null then
    raise exception 'activity_sweep_attribution tail: clara.list_activity is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.get_activity_event(text,text)') is null then
    raise exception 'activity_sweep_attribution tail: clara.get_activity_event is absent' using errcode = 'CLR10';
  end if;

  -- Security postures: list_activity/get_activity_event stay INVOKER (unmoved from 0181); the two
  -- new functions are DEFINER (they read a relation their caller has no grant on / restate the
  -- floor from scratch).
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'activity_sweep_attribution tail: list_activity is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.get_activity_event(text,text)'::regprocedure;
  if v_mode is distinct from false then
    raise exception 'activity_sweep_attribution tail: get_activity_event is not SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara._sweep_events_with_effect()'::regprocedure;
  if v_mode is distinct from true then
    raise exception 'activity_sweep_attribution tail: _sweep_events_with_effect is not SECURITY DEFINER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara._sweep_event_has_effect(uuid)'::regprocedure;
  if v_mode is distinct from true then
    raise exception 'activity_sweep_attribution tail: _sweep_event_has_effect is not SECURITY DEFINER' using errcode = 'CLR10';
  end if;
  select prosecdef into v_mode from pg_proc
   where oid = 'clara.list_spoken_for_documents(uuid)'::regprocedure;
  if v_mode is distinct from true then
    raise exception 'activity_sweep_attribution tail: list_spoken_for_documents is not SECURITY DEFINER' using errcode = 'CLR10';
  end if;

  -- PUBLIC holds no EXECUTE on any of the five functions this file touches.
  select count(*) into v_n from information_schema.routine_privileges
   where routine_schema = 'clara'
     and routine_name in ('list_activity', 'get_activity_event', '_sweep_events_with_effect',
                           '_sweep_event_has_effect', 'list_spoken_for_documents')
     and grantee = 'PUBLIC';
  if v_n <> 0 then
    raise exception 'activity_sweep_attribution tail: PUBLIC holds an EXECUTE grant on one of this file''s functions'
      using errcode = 'CLR10';
  end if;

  -- clara_authenticated holds EXECUTE on all five, and on nothing else new (this file grants no
  -- other role anything).
  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'clara' and grantee = 'clara_authenticated'
     and routine_name in ('list_activity', 'get_activity_event', '_sweep_events_with_effect',
                           '_sweep_event_has_effect', 'list_spoken_for_documents');
  if v_n <> 5 then
    raise exception 'activity_sweep_attribution tail: expected exactly 5 clara_authenticated grants across this file''s functions, found %', v_n
      using errcode = 'CLR10';
  end if;
  if exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'clara' and routine_name = 'list_spoken_for_documents'
       and grantee in ('clara_agent_ro', 'clara_runtime', 'clara_wake_interactive', 'clara_wake_filing')
  ) then
    raise exception 'activity_sweep_attribution tail: list_spoken_for_documents must not be reachable by any agent/wake/runtime role'
      using errcode = 'CLR10';
  end if;

  -- The closed kind roster is UNCHANGED (still 6 members) -- this file relabels a fall-through,
  -- it does not widen the vocabulary. Read straight from the installed body text rather than
  -- asserted -- the SAME raw prosrc column the prestate sha-pin above reads, not a wrapped
  -- definition-with-signature form this check has no use for.
  select p.prosrc into v_body from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)'::regprocedure;
  v_kind_count := length(v_body) - length(replace(v_body, 'unknown activity kind', ''));
  if v_kind_count <> length('unknown activity kind') then
    raise exception 'activity_sweep_attribution tail: the kind-validation ladder no longer reads exactly once -- re-derive against the live body'
      using errcode = 'CLR10';
  end if;

  raise notice 'activity_sweep_attribution tail: OK -- clara.list_activity/get_activity_event still SECURITY INVOKER, PUBLIC-revoked, clara_authenticated-granted, and now exclude a zero-effect sweep.run_completed row (relabelling a kept one to kind=agent, actor untouched); clara._sweep_events_with_effect() (the feed''s set) and clara._sweep_event_has_effect(uuid) (the detail door''s point lookup) are the two SECURITY DEFINER helpers this needed -- ONE query shape each AND plan_cache_mode = force_custom_plan on both, so neither caller can drag the other onto a shared cached plan and neither can be planned for the per-firm average of a multi-tenant table (measured: 4 ms -> 174 ms from the 6th call of a session without it, flat with it); the set form probes ONE receipt per KEPT run through a lateral fence and ix_domain_events_sweep_run (firm_id, payload->>''run_id''), measured flat at 1.8/1.9/1.6 ms across 1,000/6,000/30,000 receipts of history, while ix_sweep_runs_firm_effect supplies the kept runs themselves (bookkeeper-floored and self-scoped to the session firm inside its own body, read once per call rather than once per row, clara.sweep_runs itself still ungranted to clara_authenticated); clara.list_spoken_for_documents is a new bookkeeper+ SECURITY DEFINER read, clara_authenticated-only, reachable by no agent/wake/runtime role, unioning a live entry_evidence_links binding with an approved not-reversed document-coding binding.';
end $tail$;
