-- UNNUMBERED_f_a2_pack_splice.sql — F-A2 PR-1b: the context pack's FIFTH SPLICE.
-- =====================================================================================
-- Number claimed at MERGE time (hard constraint 10). Design of record:
-- docs/plan/active/f-a2-agentic-posting-design.md v6 §3.6 and §5 step 3; the mechanism is
-- annex `f-a2-annexes-2-mechanics.md` §D.4; the register row is `-3-record.md` D16; the cell
-- manifest is annex C.10. PR-0's gate record is `f-a2-pr0-gate-record.md`.
--
-- WHAT THIS FILE SHIPS. One thing: `clara.get_context_pack(uuid,text)` gains a fifth dynamic
-- splice contributing ONE additive top-level key, `approved_coding_patterns` — a client-scoped,
-- budget-capped aggregate over APPROVED, UNREVERSED entries, RECOMPUTED ON READ and never
-- accrued. Nothing else moves: no new object, no new grant, no new table, no ALTER, no CHECK.
--
-- **NO D1 WRITE-QUIESCE WINDOW, AND THE INVENTORY IS EMPTY BY CONSTRUCTION.** The estate's D1
-- rule binds a migration that replaces a live WRITER's body, because a writer replaced under
-- traffic can strand a half-written act. `get_context_pack` is a READ body: it is STABLE, it
-- carries no DML, and the splice adds a SELECT. A concurrent reader either sees the old body or
-- the new one and both are complete answers, so there is nothing to quiesce. Design §5 step 3
-- says "no D1" and the rig replay confirms the premise rather than assuming it. The prosrc-SHA
-- prestate pin below is kept ANYWAY — the pin is how a body's provenance is proven, and that
-- discipline is not conditional on the window.
--
-- PATCHED, NOT REBUILT, and the reason is sharper here than anywhere else in the estate.
-- `0016:4262` is the last CREATE of this function; `0017` (the wiki block), `0018` (the
-- resolution-exclusion strip), `0019` (the wiki boundary), `0036 §E` (the msic key), `0055` (the
-- client_facts fallback) and `0061` (the period/snapshot registry) each rewrote the LIVE body by
-- reading it back and re-installing a patched copy. A rebuild from ANY file text would silently
-- revert every one of them. So this file patches whatever body is live, positively probes one
-- marker from each prior surgery FIRST, pins the prestate by prosrc SHA, and aborts on any drift.
--
-- THE ANCHOR AND ITS DISCIPLINE (`0018:452-461`, `0019:1019-1032`): exactly ONE match, and a
-- CHANGED result. A splice that matched twice, or that matched and changed nothing, is precisely
-- the failure the discipline exists to catch, and both are invisible to a migration that only
-- checks it applied cleanly. Both are asserted here, at apply, and again by battery cell
-- `f-a2.c10.anchor` as the standing regression.
--
-- WHY THE AGGREGATE IS RECOMPUTED AND NOT ACCRUED (design §3.6 / D.4 / D16). This is exactly the
-- aggregate the retired rules machine ACCRUED into a sightings table, and exactly what its
-- >=3-distinct-entry threshold bred rules from. Recomputing it removes a WRITE from the approve
-- core — F-A2's part-1 excision deletes that insert rather than leaving it behind as a vestigial
-- accrual — and it CANNOT DRIFT FROM THE BOOKS, because there is no second copy to drift. Two
-- consequences follow and both have cells: the block MOVES when an entry is reversed
-- (`f-a2.c10.recomputed`), and the historical corpus, though KEPT AS DATA with every row and
-- every reader it has, is NOT read here (`f-a2.c10.no-sightings`) — reading both would mean
-- learning twice from the same events. **Those two historical relation names are written in
-- PROSE and never spelled in this file's injected text, deliberately: the cell that proves the
-- non-read is a word-bounded token scan of the LIVE BODY, and a body that named them in a
-- comment would be indistinguishable from one that read them.**
--
-- THE LAW-73 LINE, restated where the mechanism lives. The pack reads wiki and now reads approved
-- history; NEITHER may ever be read by a gate, a bound or a floor. The pack lawfully INFORMS the
-- judgement that IS the posting authority — that is law 73 working as designed. What it may never
-- do is BE the authority, because a wall whose answer is learned from the books drifts with the
-- books it is supposed to be judging. `WB_AUTHORITY_FNS` is the mechanism; F-A2 extends it with
-- the three post-path verbs and keeps `get_context_pack` OFF it. Cells: C.10 and C.11.
--
-- TWO JUDGEMENT CALLS THIS FILE MAKES, RECORDED SO A REVIEWER DOES NOT HAVE TO RE-DERIVE THEM:
--
--   (1) `pack_schema_version` IS NOT BUMPED, and the silence is deliberate rather than an
--       oversight — a future reader who sees `0016`->3, `0017`->4, `0061`->5 and then no bump at
--       F-A2 would otherwise read this as a miss, so the grounds are written out. Design §3.6 and
--       D.4 are silent; `f-a2-annexes-1-estate.md:128` calls the block a PURE ADDITION; and D22
--       already ruled that the runtime's `pack_consumer='v25'` is a **CAPABILITY TOKEN, not a
--       version assertion** — the pack's consumers were deliberately moved OFF version-keying, so
--       the integer is no longer anyone's compatibility gate. That is the reason, and the census
--       below is the evidence rather than the assumption:
--         · `packages/runtime/**` and `apps/**`: ZERO readers. No frozen `_vN` body reads it.
--         · LIVE SQL: ZERO readers. Every SQL mention is either the pack's own WRITE site or an
--           apply-time probe in `0016`/`0017`/`0061` that ran once and never runs again.
--         · TESTS: EIGHT sites pin the integer — `a21-read-surfaces:183`,
--           `delta-context-pack-residual:44/:84/:98`, `rig-events-structure:297`,
--           `wave-b/wb-g-tail:125`, `wave-b/wb-o-routing:168`, `wave-b/wb-w-pack:47`.
--       AND THE COST THAT SETTLES IT, measured rather than argued: `pnpm db:migrate` SKIPS any
--       file whose name does not begin with a digit, so CI never applies an `UNNUMBERED_*`
--       migration. A bumped expectation of `6` would therefore RED THE ESTATE SUITE ON THE VERY
--       PR THAT BUMPS — the suite runs against a pack that is still v5 — and again on `main` for
--       the whole window between PR-1 and PR-1b, and on every D-b frontier leg (at `0045` the
--       pack is v4). The only safe bump makes all eight assertions frontier-CONDITIONAL on this
--       file's stem, i.e. pushes an F-A2 gate into FIVE other waves' batteries for an integer no
--       runtime body and no SQL consumer reads. Not bumping keeps every existing proof running
--       and misleads no consumer: a v5 reader still receives everything v5 promised. Reversing
--       this is a one-line change here plus those eight conditional trues.
--       (Noted and NOT fixed here: `delta-context-pack-residual.test.mjs:44` gates a whole suite
--       on the literal `'pack_schema_version',5`, so it FAILS OPEN — it would skip silently on
--       any future bump, by anyone. That latent vacuous-green predates F-A2 and is carried as a
--       known issue rather than smuggled into this file.)
--
--   (2) THE COUNTERPARTY COMES FROM THE LINE, NOT THE ENTRY, and D.4's fence
--       (`over journal_entries |><| journal_lines`) could not have said so: `journal_entries` has
--       NO counterparty column. The entry's counterparty is written onto its payable-class LINE
--       at approve time (`0011:3057`) and is read back by the estate's own idiom at `0011:3794` —
--       first line carrying one, in `line_no` order, folded through
--       `clara._canonical_counterparty` so a counterparty merged AFTER approval follows its
--       survivor instead of showing up as a second party. This file uses that idiom verbatim.
--
-- THREE NARROWINGS THE ACCRUAL HAD AND THIS BLOCK DOES NOT, each with its reason, because a
-- silent divergence from "precisely the aggregate the sightings table accrued" is the kind of
-- thing that rots into folklore:
--   · ACTIVE-ACCOUNT ONLY — dropped. It needed a third relation the fence does not name, and a
--     retired account that WAS coded this way is still true history for a block that informs.
--   · CREDIT LEGS ONLY WHEN THE ACCOUNT IS INCOME — dropped, same reason (it is an account-type
--     test), and the `side` column already tells the reader which way the leg went.
--   · SETTLEMENT KINDS EXCLUDED — dropped, and this one is a real argument rather than a
--     simplification. `0037` section G excluded receipts and payments because the sighting pool
--     was KIND-BLIND: a receipt's bank-account mapping polluted one undifferentiated pool and
--     bred toward a bank-account rule. This block is GROUPED BY `coding_kind`, so the confusion
--     the exclusion existed to prevent cannot arise — a settlement row is labelled a settlement
--     row. Suppressing it instead would hide real history from a reader that only informs.
-- ONE NARROWING IS KEPT, and it is kept for an accounting reason rather than a fence reason:
-- REVERSAL ENTRIES (`reversal_of is not null`) are excluded, exactly as the accrual excluded them.
-- A reversal is not a coding decision; its legs are the original's with the sides flipped, so
-- admitting them would teach the reader the opposite of what the firm actually decided.
--
-- BUDGET CAP. The block is capped at 200 aggregated rows, ordered by `n` desc then recency, with
-- a total ordering so the cap is DETERMINISTIC rather than whatever the planner returned. An
-- uncapped block would silently eat the prompt window the rest of the pack needs; the cell
-- `f-a2.c10.block` measures the serialized size rather than trusting this sentence.
--
--   §0  prestate — the prosrc SHA pin, one positive marker per prior surgery, the anchor count,
--       the already-applied guard, and the marker counts the tail re-compares against
--   §A  the splice
--   §B  tail — the source-shape self-proof. Every raise is a real assertion failure.
--
-- No table in `workflow` / `graphile_worker` / `spike` is touched (hard constraint 15): this file
-- reads `pg_proc` and re-installs one `clara` function.
-- =====================================================================================


-- =====================================================================================
-- §0 · PRESTATE. Positive probes only — every one of them says what it SAW, and every failure
-- aborts the migration rather than proceeding on a wrong premise. The recorded counts land in a
-- temp ledger so the tail can compare POSTSTATE against PRESTATE differentially, instead of
-- pinning magic constants that rot the next time an unrelated splice lands.
-- =====================================================================================
create temp table _fa2pack_pre(k text primary key, v text) on commit drop;

do $p1b0$
declare
  v_def text;
  v_src text;
  v_sha text;
  v_anchor text;
  v_n int;
  -- The frontier this file was authored and rig-replayed against: `0102` plus F-A2 PR-1's three
  -- files. PR-1 does NOT touch this body — that is a measured fact, not an assumption, and this
  -- pin is what makes it one. A drift here means the live body is not the body PR-1b accounts
  -- for, and the only safe answer is to stop.
  c_prosrc_sha constant text :=
    '0d809fb320abdc11f8e105d4db24a79146edb07a0684a404de5e54e638939d1b';
begin
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) into v_def;
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname = 'get_context_pack';
  if v_def is null or v_src is null then
    raise exception 'F-A2 PR-1b §0: clara.get_context_pack(uuid,text) does not resolve on this database'
      using errcode = 'CLR10';
  end if;

  -- THE PROSRC-SHA PRESTATE PIN. Named in the error both ways, so an operator reading the abort
  -- can tell "someone else recut this body" from "this file is being applied to the wrong estate".
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');
  if v_sha <> c_prosrc_sha then
    raise exception 'F-A2 PR-1b §0: get_context_pack prestate SHA drift -- expected % (frontier 0102 + PR-1), found % (prosrc length %). The live body is not the body this file accounts for.',
      c_prosrc_sha, v_sha, length(v_src) using errcode = 'CLR10';
  end if;

  -- ALREADY-APPLIED GUARD, before any marker probe: a re-run must say so plainly rather than
  -- failing later on an anchor that has already moved.
  if position('approved_coding_patterns' in v_def) <> 0 then
    raise exception 'F-A2 PR-1b §0: get_context_pack already carries the patterns block -- this file has already been applied to this database'
      using errcode = 'CLR10';
  end if;

  -- ONE POSITIVE MARKER PER PRIOR SURGERY. A body reverted past any of them would carry a
  -- matching anchor and take the splice cleanly, and re-blessing it would silently undo that
  -- surgery. `0036 §E` established this probe set; `0061`'s registry key extends it.
  if position('sst_registration_watch' in v_def) = 0 then
    raise exception 'F-A2 PR-1b §0: the 0016 sst_registration_watch block is absent -- not the body this file accounts for'
      using errcode = 'CLR10';
  end if;
  if position('''wiki''' in v_def) = 0 then
    raise exception 'F-A2 PR-1b §0: the 0017 wiki block is absent -- a rebuilt or reverted body must abort rather than be re-blessed'
      using errcode = 'CLR10';
  end if;
  if position('-''bound_scope_kind''-''bound_scope_id''' in v_def) = 0 then
    raise exception 'F-A2 PR-1b §0: the 0018 resolution-exclusion strip is absent -- re-blessing this body would leak the binding columns back into the agent pack'
      using errcode = 'CLR10';
  end if;
  if position('''stale_at'',wc.stale_at' in v_def) = 0
     or position('''has_stale_sources''' in v_def) = 0 then
    raise exception 'F-A2 PR-1b §0: a 0019 wiki-boundary marker (citation stale_at / has_stale_sources) is absent'
      using errcode = 'CLR10';
  end if;
  if position('''msic''' in v_def) = 0 then
    raise exception 'F-A2 PR-1b §0: the 0036 section E msic key is absent'
      using errcode = 'CLR10';
  end if;
  if position('''period_snapshot_registry''' in v_def) = 0
     or position('''pack_schema_version'',5' in v_def) = 0 then
    raise exception 'F-A2 PR-1b §0: the 0061 period/snapshot registry block or its schema version 5 is absent'
      using errcode = 'CLR10';
  end if;
  if position('pack_consumer' in v_def) = 0 then
    raise exception 'F-A2 PR-1b §0: the wiki block''s pack_consumer capability gate is absent -- this splice must move no gate, and it cannot prove that against a body that has none'
      using errcode = 'CLR10';
  end if;

  -- THE ANCHOR, COUNTED. Exactly one occurrence or nothing happens.
  v_anchor := '      ''sst_registration_watch'',(select coalesce(jsonb_agg(jsonb_build_object(';
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception 'F-A2 PR-1b §0: the splice anchor must occur EXACTLY ONCE in the live body (found %)', v_n
      using errcode = 'CLR10';
  end if;

  -- The differential ledger the tail re-reads. Counts, not constants: the tail asserts each is
  -- UNCHANGED across the splice, which is the claim that actually matters ("a pure addition
  -- moved nothing") and which survives an unrelated future splice landing first.
  insert into _fa2pack_pre(k, v) values
    ('prosrc_sha',        v_sha),
    ('prosrc_len',        length(v_src)::text),
    ('marker:sst',        ((length(v_def) - length(replace(v_def, 'sst_registration_watch', ''))) / length('sst_registration_watch'))::text),
    ('marker:wiki',       ((length(v_def) - length(replace(v_def, '''wiki''', ''))) / length('''wiki'''))::text),
    ('marker:bound',      ((length(v_def) - length(replace(v_def, 'bound_scope_', ''))) / length('bound_scope_'))::text),
    ('marker:stale_at',   ((length(v_def) - length(replace(v_def, 'stale_at', ''))) / length('stale_at'))::text),
    ('marker:has_stale',  ((length(v_def) - length(replace(v_def, 'has_stale_sources', ''))) / length('has_stale_sources'))::text),
    ('marker:msic',       ((length(v_def) - length(replace(v_def, '''msic''', ''))) / length('''msic'''))::text),
    ('marker:registry',   ((length(v_def) - length(replace(v_def, '''period_snapshot_registry''', ''))) / length('''period_snapshot_registry'''))::text),
    ('marker:consumer',   ((length(v_def) - length(replace(v_def, 'pack_consumer', ''))) / length('pack_consumer'))::text),
    ('marker:version5',   ((length(v_def) - length(replace(v_def, '''pack_schema_version'',5', ''))) / length('''pack_schema_version'',5'))::text),
    ('anchor',            v_n::text);

  raise notice 'F-A2 PR-1b §0 prestate: clean -- get_context_pack pinned at prosrc sha % (length %), all SIX prior surgery markers present, the splice anchor occurs exactly once, and the patterns block is absent.',
    v_sha, length(v_src);
end
$p1b0$;


-- =====================================================================================
-- §A · THE SPLICE. The fifth block is PREPENDED to the anchor, so the anchor itself survives
-- byte-for-byte and the prior five markers are carried through unchanged by construction rather
-- than by care. The injected text is written in a nested dollar quote so that the SQL a reviewer
-- reads here is character-for-character the SQL that lands in the body — a replacement built out
-- of doubled quotes and concatenation is a second dialect nobody can proofread.
-- =====================================================================================
do $p1b1$
declare
  v_def text;
  v_next text;
  v_anchor text;
  v_ins text;
begin
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) into v_def;

  v_anchor := '      ''sst_registration_watch'',(select coalesce(jsonb_agg(jsonb_build_object(';

  v_ins := $ins$      'approved_coding_patterns',(
        -- F-A2 PR-1b (design v6 §3.6, annex D.4, register D16). RECOMPUTED ON READ, NEVER
        -- ACCRUED: derived from the BOOKS on every call, so it cannot become a second copy of
        -- the truth that drifts from them. The frozen corpus the retired rules machine accrued
        -- is KEPT AS DATA and is deliberately NOT read here -- reading both would mean learning
        -- twice from the same events. INFORMS, NEVER DECIDES (law 73): no gate, bound or floor
        -- may read this block, and `WB_AUTHORITY_FNS` is the mechanism that proves it.
        -- The counterparty is the ENTRY's, read off its payable-class line (0011:3057) by the
        -- 0011:3794 idiom and folded through the canonical resolver so a post-approval merge
        -- follows its survivor. Reversal entries are excluded: a reversal is not a coding
        -- decision, and its flipped legs would teach the reader the opposite of the firm's own.
        -- Capped at 200 rows under a TOTAL ordering, so the cap is deterministic.
        select coalesce(jsonb_agg(jsonb_build_object(
          'counterparty_id',t.counterparty_id,'coding_kind',t.coding_kind,
          'account_code',t.account_code,'side',t.side,'n',t.n,
          'first_seen',t.first_seen,'last_seen',t.last_seen)
          order by t.n desc,t.last_seen desc,t.counterparty_id,t.coding_kind,
            t.account_code,t.side),'[]'::jsonb)
        from (select g.counterparty_id,g.coding_kind,g.account_code,g.side,
                count(distinct g.entry_id)::int as n,
                min(g.approved_at) as first_seen,max(g.approved_at) as last_seen
              from (select pe.cp_id as counterparty_id,pe.coding_kind,pl.account_code,
                      case when pl.debit_cents>0 then 'debit' else 'credit' end as side,
                      pe.id as entry_id,pe.approved_at
                    from (select je.id,je.coding_kind,je.approved_at,
                            clara._canonical_counterparty(je.client_id,
                              (select l2.counterparty_id from clara.journal_lines l2
                                where l2.entry_id=je.id and l2.counterparty_id is not null
                                order by l2.line_no limit 1)) as cp_id
                          from clara.journal_entries je
                          where je.client_id=cl.id and je.status='approved'
                            and je.reversed_by is null and je.reversal_of is null
                            and je.approved_at is not null) pe
                    join clara.journal_lines pl on pl.entry_id=pe.id
                    where pe.cp_id is not null
                      and (pl.debit_cents>0 or pl.credit_cents>0)) g
              group by g.counterparty_id,g.coding_kind,g.account_code,g.side
              order by n desc,last_seen desc,g.counterparty_id,g.coding_kind,
                g.account_code,g.side
              limit 200) t),
$ins$;

  v_next := replace(v_def, v_anchor, v_ins || v_anchor);

  -- BOTH HALVES OF THE ANCHORING RULE, asserted before anything is installed: the result CHANGED,
  -- and the anchor was not matched twice. A splice that changed nothing applies cleanly and
  -- reports success, which is exactly why this check is here and not in a review comment.
  if v_next = v_def then
    raise exception 'F-A2 PR-1b §A: the splice changed NOTHING -- the anchor did not match the live body'
      using errcode = 'CLR10';
  end if;
  if (length(v_next) - length(replace(v_next, '''approved_coding_patterns''', '')))
     / length('''approved_coding_patterns''') <> 1 then
    raise exception 'F-A2 PR-1b §A: the patterns key must be installed EXACTLY ONCE -- a double-matching anchor emitted it more than once'
      using errcode = 'CLR10';
  end if;

  execute v_next;
end
$p1b1$;


-- =====================================================================================
-- §B · TAIL — the source-shape self-verification, read back from the CATALOG rather than from
-- the text this file just built. Every raise is a real assertion failure, not a soft warning.
--
-- WHY THE TAIL IS SOURCE-SHAPED AND NOT BEHAVIOURAL, said plainly rather than left as a gap: the
-- pack refuses any caller that is neither an authorized agent (a live wake credential) nor an
-- authenticated firm member, and a migration running as the deploy role is neither. Building a
-- credentialed caller here would mean minting one inside a migration, which is a worse thing than
-- the gap it closes. The BEHAVIOURAL proofs live in the battery, where a real credential exists:
-- `f-a2.c10.block` (the block appears, is client-scoped against a same-firm sibling, and is size
-- capped), `f-a2.c10.recomputed` (it MOVES when an entry is reversed, and a directly-seeded
-- historical corpus row does NOT resurrect it), and `f-a2.c10.wiki-gate` (the wiki block still
-- REFUSES without the purpose and the capability token). This tail proves what the catalog can
-- see: that the splice landed once, changed the body, moved no prior marker, and left the
-- function's own posture untouched.
-- =====================================================================================
do $p1b2$
declare
  v_def text;
  v_src text;
  v_sha text;
  v_row record;
  v_key text;
  v_now int;
  v_then int;
begin
  select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) into v_def;
  select p.prosrc, p.provolatile, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner,
         p.proacl::text as acl
    into v_row
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname = 'get_context_pack';
  v_src := v_row.prosrc;
  v_sha := encode(sha256(convert_to(v_src, 'UTF8')), 'hex');

  -- 1 · EXACTLY ONE OVERLOAD still. A splice that changed the signature would have CREATED a
  -- second function rather than replacing one, and every whitelist in the estate is keyed by
  -- exact signature.
  select count(*)::int into v_now
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname = 'get_context_pack';
  if v_now <> 1 then
    raise exception 'F-A2 PR-1b tail: get_context_pack must have exactly ONE overload (found %)', v_now
      using errcode = 'CLR10';
  end if;

  -- 2 · THE BODY CHANGED, and it changed in the one way this file intends.
  if v_sha = (select v from _fa2pack_pre where k = 'prosrc_sha') then
    raise exception 'F-A2 PR-1b tail: the body is byte-identical to the prestate -- the splice installed nothing'
      using errcode = 'CLR10';
  end if;
  if position('approved_coding_patterns' in v_def) = 0 then
    raise exception 'F-A2 PR-1b tail: the patterns block is absent from the live body'
      using errcode = 'CLR10';
  end if;
  if (length(v_def) - length(replace(v_def, '''approved_coding_patterns''', '')))
     / length('''approved_coding_patterns''') <> 1 then
    raise exception 'F-A2 PR-1b tail: the patterns key must be emitted exactly ONCE in the live body'
      using errcode = 'CLR10';
  end if;

  -- 3 · THE BLOCK READS THE BOOKS. Both halves, because "it reads journal_entries" alone would
  -- be satisfied by the pack's pre-existing recent-entries block and would prove nothing new.
  if position('je.reversed_by is null' in v_def) = 0
     or position('je.status=''approved''' in v_def) = 0 then
    raise exception 'F-A2 PR-1b tail: the patterns block must be scoped to APPROVED and UNREVERSED entries -- that scoping IS the "cannot drift from the books" claim'
      using errcode = 'CLR10';
  end if;
  if position('je.reversal_of is null' in v_def) = 0 then
    raise exception 'F-A2 PR-1b tail: the reversal-entry exclusion is missing -- a reversal''s flipped legs would teach the reader the opposite of the firm''s own coding'
      using errcode = 'CLR10';
  end if;
  if position('limit 200) t)' in v_def) = 0 then
    raise exception 'F-A2 PR-1b tail: the block''s row cap is missing -- an uncapped block silently eats the prompt window the rest of the pack needs'
      using errcode = 'CLR10';
  end if;

  -- 4 · EVERY PRIOR MARKER SURVIVED, COUNTED AND DIFFERENTIAL. `0036:1826-1850` asserted that
  -- every post-0016 surgery marker survived ITS splice; this is the same assertion for the fifth,
  -- and it compares against the PRESTATE COUNT rather than a constant, so an unrelated splice
  -- landing before this one cannot make it either red or vacuous.
  for v_key, v_then in
    select k, v::int from _fa2pack_pre where k like 'marker:%' order by k
  loop
    v_now := case v_key
      when 'marker:sst'       then (length(v_def) - length(replace(v_def, 'sst_registration_watch', ''))) / length('sst_registration_watch')
      when 'marker:wiki'      then (length(v_def) - length(replace(v_def, '''wiki''', ''))) / length('''wiki''')
      when 'marker:bound'     then (length(v_def) - length(replace(v_def, 'bound_scope_', ''))) / length('bound_scope_')
      when 'marker:stale_at'  then (length(v_def) - length(replace(v_def, 'stale_at', ''))) / length('stale_at')
      when 'marker:has_stale' then (length(v_def) - length(replace(v_def, 'has_stale_sources', ''))) / length('has_stale_sources')
      when 'marker:msic'      then (length(v_def) - length(replace(v_def, '''msic''', ''))) / length('''msic''')
      when 'marker:registry'  then (length(v_def) - length(replace(v_def, '''period_snapshot_registry''', ''))) / length('''period_snapshot_registry''')
      when 'marker:consumer'  then (length(v_def) - length(replace(v_def, 'pack_consumer', ''))) / length('pack_consumer')
      when 'marker:version5'  then (length(v_def) - length(replace(v_def, '''pack_schema_version'',5', ''))) / length('''pack_schema_version'',5')
      else null end;
    if v_now is null then
      raise exception 'F-A2 PR-1b tail: prestate ledger key % has no poststate counter -- the tail cannot vouch for a marker it never re-read', v_key
        using errcode = 'CLR10';
    end if;
    if v_now <> v_then then
      raise exception 'F-A2 PR-1b tail: prior marker % moved across the fifth splice (prestate %, poststate %) -- this splice is a PURE ADDITION and may move nothing',
        v_key, v_then, v_now using errcode = 'CLR10';
    end if;
  end loop;

  -- 5 · POSTURE UNMOVED. A same-arity CREATE OR REPLACE keeps its ACL, owner, volatility, definer
  -- flag and search_path — and this is where that is PROVEN rather than relied on. The pack is
  -- SECURITY DEFINER by design: it reads relations its callers cannot, behind its own client and
  -- firm scoping, and a splice that flipped it to INVOKER would break every caller silently.
  if v_row.provolatile <> 's' or v_row.prosecdef is not true
     or v_row.owner <> 'clara_fn_owner'
     or v_row.proconfig is distinct from array['search_path=clara, pg_temp'] then
    raise exception 'F-A2 PR-1b tail: get_context_pack posture moved (volatility %, secdef %, owner %, config %) -- expected STABLE / SECURITY DEFINER / clara_fn_owner / search_path=clara, pg_temp',
      v_row.provolatile, v_row.prosecdef, v_row.owner, v_row.proconfig using errcode = 'CLR10';
  end if;
  if v_row.acl is distinct from
     '{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner,clara_agent_ro=X/clara_fn_owner}' then
    raise exception 'F-A2 PR-1b tail: get_context_pack ACL moved (%) -- no role gains or loses EXECUTE in this file', v_row.acl
      using errcode = 'CLR10';
  end if;

  -- 6 · NO NEW GRANT, NO NEW OBJECT, NO DML. This file installs one function body and nothing
  -- else; the census is a read that can say NO, naming anything it finds.
  select count(*)::int into v_now
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname = 'get_context_pack'
      and p.prosrc ~* '\minsert\M|\mupdate\M|\mdelete\M|\mtruncate\M';
  if v_now <> 0 then
    raise exception 'F-A2 PR-1b tail: the pack body carries DML -- it is a READ body, which is the whole reason this PR needs no write-quiesce window'
      using errcode = 'CLR10';
  end if;

  raise notice 'F-A2 PR-1b tail: OK -- get_context_pack carries the approved_coding_patterns block exactly once, recomputed from APPROVED + UNREVERSED + non-reversal entries and capped at 200 rows; all NINE prestate markers are byte-for-byte unmoved (a pure addition); exactly one overload; volatility, definer flag, owner, search_path and ACL unmoved; the body still carries NO DML, so there is no D1 write-quiesce term in this file. pack_schema_version is deliberately NOT bumped (see the header). prosrc sha256 % -> %. Behaviour is proven by battery cells f-a2.c10.block / .recomputed / .no-sightings / .markers / .anchor / .wiki-gate, which need a credentialed caller this migration deliberately does not mint. No table in workflow/graphile_worker/spike touched.',
    (select v from _fa2pack_pre where k = 'prosrc_sha'), v_sha;
end
$p1b2$;
