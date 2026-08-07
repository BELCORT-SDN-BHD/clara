-- 0048_direction_zero_evidence.sql -- THE TRI-STATE DIRECTION CONTRACT STOPS DEFAULTING TO
-- 'purchase' WHEN NOTHING WAS ACTUALLY TESTED.
--
-- GOVERNING LAW: ADR-063 / docs/plan/wave-7a-contract.md 7A-R2 (Q1 = A) -- direction is
-- {sales | purchase | unresolved}, DB-authoritative, and `unresolved` never drafts. And
-- CLAUDE.md review/evidence law 2: "absence is not evidence, and a derived state is not
-- evidence" -- every absence falls through to the fail-closed branch.
--
-- MIGRATION NUMBER claimed at MERGE time (standing law, CLAUDE.md + RENUMBER.md). 0048 is the
-- WORKING number; the frontier probe in SECTION 0 pins 0047_settle_guard_identity as the
-- applied predecessor.
--
-- =====================================================================================
-- WHAT WENT WRONG, IN ONE PARAGRAPH
-- =====================================================================================
-- clara._document_direction (0015:487) ends `if v_sales then return 'sales'; else return
-- 'purchase'; end if;`. Every path that is not a PROVEN sale therefore answers 'purchase' --
-- including the paths where nothing was proven either way, because nothing was READ:
--
--   (a) a null document or client;
--   (b) a document with no done invoice_facts extraction at all -- literally nothing read;
--   (c) an extraction that states no counterparty identity at all;
--   (d) THE ONE THAT ALREADY COST US A DAY -- an extraction that states a supplier
--       REGISTRATION while the client carries NO tin/ssm client_identifiers row to compare
--       it against. The `exists(...)` matcher answers false, the function reads that false as
--       "the supplier is not this client", and returns 'purchase'. The test was never
--       performed; its non-result was scored as a negative.
--
-- (d) is not hypothetical. §7-A Half-1 preflight measured
-- clara._document_direction(bd6d37fb..., ROME SECRETARY) => 'purchase' on a document ROME
-- SECRETARY had ISSUED -- one of its own 22 sales invoices. The lane read it as a purchase.
-- Seeding the missing identifiers (task #23) flipped the same document to 'sales' with no
-- code change at all, which is the proof that the answer had been a defaulted non-answer.
--
-- clara._autodraft_direction_tri (0046:1776) inherits the defect twice: it re-states the null
-- default itself (`if p_document is null or p_client is null then return 'purchase'`), and it
-- echoes whatever _document_direction returns. So the function the contract names as THE
-- tri-state authority -- the one that BINDS the coding-kind family in clara._draft_entry_core
-- -- reports a confident 'purchase' for documents about which it knows nothing.
--
-- =====================================================================================
-- THE SHAPE THIS FILE SHIPS, AND WHY IT IS NOT SIMPLY "NO SALES => UNRESOLVED"
-- =====================================================================================
-- 'purchase' is now a CONCLUSION that needs its own positive evidence, exactly as 'sales'
-- always has. Three things count, and nothing else does:
--
--   (P1) THE BUYER RESOLVES TO THIS CLIENT. The document names a customer and that customer
--        IS the client (hard id or name/alias). Decisive: the client is the buyer.
--   (P2) A SUPPLIER IDENTITY WAS STATED **AND EVERY STATED ARM WAS TESTABLE**, and none of
--        them matched the client. "Testable" is the whole fix: a stated supplier NAME is
--        always testable (clara.clients.name is NOT NULL, so the comparison really happens),
--        while a stated supplier REGISTRATION is testable ONLY if the client carries at
--        least one tin/ssm identifier. An untested hard identifier cannot be scored as a
--        miss -- that is (d) above, restated as a rule.
--   (P3) THE STATED SUPPLIER IS AN ACCEPTED VENDOR OF THIS CLIENT -- it matches a live
--        clara.counterparties row of kind='vendor' (by registration, by name, or by an
--        approved alias). A party the client's own books already hold as a supplier is
--        direct, positive purchase-side evidence, and it is what keeps a real purchase
--        pipeline working for a client that has not yet recorded its own identifiers.
--
-- Anything else raises CLR30 with reason `direction_unresolved`. The ERRCODE AND THE REASON
-- TOKEN ARE DELIBERATELY THE EXISTING ONES, not new: every caller in the live catalog
-- already handles CLR30, and clara._coding_lane_core already renders that token as a named
-- reason the dashboard has copy for. A new token would have been a second path to maintain
-- and a dashboard change for no gain. The detail payload gains ONE key, `"evidence":"none"`,
-- so a reader can tell "we read the page and it contradicted itself" from "we never got to
-- ask" without either becoming a new refusal class.
--
-- =====================================================================================
-- EVERY CALLER, MEASURED FROM THE LIVE CATALOG (not grepped from the repo), AND WHERE
-- 'unresolved' LANDS. The census is `select oid::regprocedure from pg_proc where prosrc like
-- '%_document_direction%' or ... '%_autodraft_direction_tri%' or ... '%_autodraft_sales_direction%'`,
-- run read-only against live 2026-08-07. TEN functions, and not one of them propagates:
--
--   clara._coding_lane_core                CLR30 -> reason `direction_unresolved`, lane HARD
--                                          (needs_you). A named refusal in the human queue.
--   clara.execute_rule_post                CLR30 -> a clara.rule_post_skips row with reason
--                                          `direction_unresolved` and status 'skipped'
--                                          (0023:456-464). A named skip, never a raise.
--   clara._autodraft_direction_tri         traps CLR30 -> 'unresolved'.
--   clara._autodraft_sales_direction       traps CLR30 -> false ("not provably sales").
--   clara.list_autodraft_candidates        goes through _autodraft_sales_direction ONLY --
--                                          0036 tail:1787 makes a bare call a deploy refusal.
--   clara._autodraft_attempt_budget        goes through _autodraft_sales_direction.
--   clara.admit_autodraft_task             'unresolved' takes NO branch and falls through to
--                                          the lane check, which refuses it (0046 SS7-A says
--                                          so in as many words).
--   clara._draft_entry_core                'unresolved' -> CLR21 `direction_family_mismatch`
--                                          in the DB writer -- the authority layer 7A-R2
--                                          names. A structured refusal, not an escape.
--   clara._document_direction / _at        the two this file recuts.
--
-- =====================================================================================
-- THE BLAST-RADIUS PROBE (read-only against live, 2026-08-07, python live_ro.py)
-- =====================================================================================
-- 129 non-retired document_filings across the four live clients. Evidence class by client,
-- with the answer today and the answer under this file:
--
--   CLIENT                     tin/ssm ids   n   evidence                     now -> after
--   BEE CREATIVE SOLUTION          NO       10   supplier NAME stated         purchase -> purchase  (P2)
--   BEE CREATIVE SOLUTION          NO       11   no invoice_facts extraction  purchase -> UNRESOLVED
--   ROME PROPERTIES                NO       27   supplier NAME stated         purchase -> purchase  (P2)
--   ROME PROPERTIES                NO        2   supplier NAME + REGISTRATION purchase -> purchase  (P3)
--   ROME PROPERTIES                NO       13   no invoice_facts extraction  purchase -> UNRESOLVED
--   ROME SECRETARY                YES       21   supplier = the client        sales    -> sales
--   ROME SECRETARY                YES        9   supplier NAME stated         purchase -> purchase  (P2)
--   ROME SECRETARY                YES        2   no invoice_facts extraction  purchase -> UNRESOLVED
--   Fictional Test Services       YES       22   supplier = the client        sales    -> sales
--   Fictional Test Services       YES       12   no invoice_facts extraction  purchase -> UNRESOLVED
--   (Alara / Borneo RLS fixtures: zero filings.)
--
-- READ THE ROME PROPERTIES ROW MARKED (P3) TWICE -- it is the trap this file had to clear.
-- Those two documents (BRIGHTPATH, BINV202510-018 / BINV202511-014) state a supplier
-- registration `2024010477561593602x`, and ROME PROPERTIES carries NO tin/ssm identifier at
-- all (its one client_identifiers row is kind='bank_account'). Under (P2) alone they would
-- have flipped to UNRESOLVED and a live purchase pipeline would have broken. They stay
-- 'purchase' because BRIGHTPATH is a live kind='vendor' counterparty of ROME PROPERTIES --
-- which is (P3), and which is exactly why (P3) is in the rule and not left as a nicety.
--
-- THE ONLY LIVE FLIPS ARE THE 38 FILINGS WITH NO invoice_facts EXTRACTION, and 36 of those
-- are documents that HAVE no direction: 20 bank statements, 4 management accounts, 2 consent
-- evidences, 1 receipt, 1 claim form, 1 other, 7 whose extraction FAILED. Their new answer is
-- the honest one. SECTION 3 is what stops that honesty from becoming noise -- see below.
-- The tail arms do not take this table on trust: tail arm 7 re-measures every filing before
-- and after the recut on whatever database this file is applied to, HARD-refuses anything
-- that crosses the sales boundary or widens off 'unresolved', hard-refuses any movement in
-- the human queue for an unread filing, and COUNTS AND NAMES every read filing that moved off
-- a defaulted direction. On live that count must be ZERO; the ceremony reads it.
--
-- =====================================================================================
-- WHY clara._coding_lane_core IS RECUT TOO (SECTION 3), AND WHY THAT IS NOT A LOOPHOLE
-- =====================================================================================
-- The lane calls _document_direction for EVERY filing, whatever the document is. Left alone,
-- the 38 filings above would each acquire the reason `direction_unresolved` and go HARD --
-- 20 bank statements telling a human "we could not tell if this is a sale or a purchase",
-- forever, and growing by one per statement per month. That is a real regression in signal
-- quality, produced by a fix whose whole purpose is honest signals.
--
-- So the lane no longer ASKS a question whose input has not been read. When the document has
-- no invoice_facts extraction the lane sets v_tri:='unresolved' (the honest tri answer, and
-- what SECTION 2 would have raised) and v_direction:='purchase' WITHOUT calling the function
-- and WITHOUT marking the lane hard. That is not the defaulting this file removes:
--   * `facts_pending` is ALREADY appended two lines above for exactly this state, so the
--     state is named -- this is one state with one name, not an absence read as a fact;
--   * v_direction inside this body is a REGION SELECTOR, not an authority. 0046 S9.1 says so
--     in its own comment ("v_direction keeps its 0031 meaning exactly -- including its
--     'purchase' fallback on CLR30, which selects which extraction fields are read"). The
--     fields it selects are absent either way, because there is no extraction;
--   * v_tri -- the value 0046 introduced as the honest one, and the only one that reaches
--     v_sales_lane -- becomes 'unresolved', which is the change;
--   * nothing downstream loosens. `facts_pending` is not in the {rule_backed, vendor_bound,
--     tier_a_fails} bypass sets, so the lane cannot be `ready`, so admission still refuses.
--
-- The guard is `clara._document_facts_extraction(f.document_id) is null` -- the SAME selector
-- clara._document_direction itself uses, extracted into a function in SECTION 2 precisely so
-- the two can never drift. It is not `v_state='{}'`: _invoice_fact_state answers a different
-- question and agreeing with it today (measured: 38/38 and 91/91 on live) is a coincidence,
-- not an identity. Law 3 -- prove the thing, do not match a spelling that resembles it.
--
-- =====================================================================================
-- WHAT THIS FILE DOES **NOT** CHANGE
-- =====================================================================================
--   * Every SALES arm of the decision is carried across byte-for-byte: the registration
--     match, the name/alias match, the name-only-with-no-registration arm, and BOTH
--     contradiction abstains (reg-matches-but-name-contradicts, name-matches-but-reg-does-not),
--     and the both-parties-are-the-client abstain. 0015's RESIDUAL-3 and RESIDUAL v3 fixes
--     and their rig cells stand untouched.
--   * clara._autodraft_sales_direction keeps its name, its boolean answer and its
--     never-null contract (0036:497). CLR30 was already false there and still is.
--   * The `sales_direction` receipt token (7A-R2's last sentence) is untouched.
--   * No workflow body moves; no runtime or dashboard code is in this PR.
--
-- THE DUPLICATE BODY IS REMOVED WHILE WE ARE HERE. clara._document_direction_at (0016:1852)
-- was a verbatim copy of the 0015 decision with one different extraction lookup, and both
-- copies had to be fixed identically or the fix would apply on the human lane and not on the
-- autopost executor (which calls the `_at` variant). Both now delegate to ONE core,
-- clara._direction_from_extraction, so a future change cannot land on one and miss the other.
--
-- D1 BINDS (packages/db/README.md:99-118). This file replaces live function bodies;
-- PostgreSQL runs each in-flight PL/pgSQL execution to completion on the body it STARTED
-- with, so a write-quiesce is the recorded procedure and this file does not license skipping
-- it. The change is NARROWING (answers that were 'purchase' can become a refusal), so an
-- interleaved apply is not corrupting but can produce one extra named skip.
--
-- STATEMENT TIMEOUT (ADR-059 ceremony law). Set inside the migration connection because role-
-- and database-level settings are invisible through Supavisor's pool. Load-bearing here: tail
-- arms 6 and 7 evaluate the direction and the coding lane once per non-retired filing, twice
-- (prestate + tail). O(filings), 129 on live today; a future estate large enough to matter
-- must revisit the arm rather than silently narrow it.
set local statement_timeout = '20min';

-- =====================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it edits is MEASURED here,
-- before a single object changes, and each failure names the drift.
-- =====================================================================
-- The pre-image of the one body this file SPLICES (rather than authors), plus the two
-- properties a careless re-ship silently drops. Stashed rather than pinned as literals in the
-- tail on purpose: the claim is "unchanged", and comparing post against pre states exactly
-- that (0047 SECTION 0's reasoning, and its recorded proconfig-rendering mistake).
create temp table _d48_pre(
  sig     text primary key,
  folded  text    not null,
  secdef  boolean not null,
  config  text    not null
) on commit drop;

-- The BEFORE half of the blast-radius table in the header, measured on THIS database rather
-- than trusted from a comment. One row per non-retired filing: what the tri-state authority
-- answers today, what the human queue shows today, and whether the document has any
-- invoice-facts extraction at all -- the one property that licenses a changed answer.
create temp table _d48_pre_dir(
  filing    uuid primary key,
  client    uuid not null,
  document  uuid not null,
  has_facts boolean not null,
  tri       text not null,
  lane      text not null,
  reasons   text not null
) on commit drop;

do $prestate$
declare
  v_n int; v_src text; v_anchor text; v_count int;
  v_secdef boolean; v_config text; v_sig text;
  r record; v_lane text; v_reasons text;
begin
  -- (0.1) FRONTIER. This file edits bodies 0046 spliced and 0047 left behind, so both must be
  -- recorded as applied. Applying it against an older schema would splice an anchor that
  -- means something else.
  foreach v_sig in array array['0046_wave_7a_sales_lane','0047_settle_guard_identity']
  loop
    select count(*) into v_n from clara.schema_migrations where version = v_sig;
    if v_n <> 1 then
      raise exception '0048 prestate: % is not recorded as applied -- apply in order', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.2) THE FOUR SIGNATURES THIS FILE RECUTS OR CALLS EXIST, EXACTLY AS NAMED. A recut that
  -- silently CREATED a new overload instead of REPLACING the live one would leave the old body
  -- reachable and every arm below would still pass on the new one.
  foreach v_sig in array array[
      'clara._document_direction(uuid,uuid)',
      'clara._document_direction_at(uuid,uuid,uuid)',
      'clara._autodraft_direction_tri(uuid,uuid)',
      'clara._autodraft_sales_direction(uuid,uuid)',
      'clara._coding_lane_core(uuid,uuid)']
  loop
    begin
      perform v_sig::regprocedure;
    exception when others then
      raise exception '0048 prestate: % does not exist at that exact signature', v_sig
        using errcode = 'CLR10';
    end;
  end loop;
  select count(*) into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace
      and p.proname in ('_document_direction','_document_direction_at','_autodraft_direction_tri');
  if v_n <> 3 then
    raise exception '0048 prestate: expected exactly THREE direction functions across those three names, found % -- an overload this file does not know about would keep the old answer reachable', v_n
      using errcode = 'CLR10';
  end if;

  -- (0.3) THE DEFECT IS PRESENT IN BOTH DIRECTION BODIES. If it is already gone this file is
  -- stale and must not re-ship a decision somebody else has since changed.
  foreach v_sig in array array[
      'clara._document_direction(uuid,uuid)',
      'clara._document_direction_at(uuid,uuid,uuid)']
  loop
    select prosrc into v_src from pg_proc where oid = v_sig::regprocedure;
    if position('if v_sales then return ''sales''; else return ''purchase''; end if;' in v_src) = 0 then
      raise exception '0048 prestate: % no longer ends in the sales-or-purchase fallthrough this file exists to remove -- the body has already been changed by something else', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;
  select prosrc into v_src from pg_proc where oid = 'clara._autodraft_direction_tri(uuid,uuid)'::regprocedure;
  if position('if p_document is null or p_client is null then return ''purchase''; end if;' in v_src) = 0 then
    raise exception '0048 prestate: clara._autodraft_direction_tri no longer carries 0046''s null-answers-purchase arm -- the body has already been changed'
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE THREE NORMALISATION VOCABULARIES ARE THE SAME ONE. Law 3, as a measurement:
  -- (P3) compares a document region normalised by THIS file's own
  -- lower(regexp_replace(x,'[^a-zA-Z0-9]','','g')) against columns normalised by the
  -- counterparty tables' CHECK constraints. If those constraints ever said something else,
  -- (P3) would be comparing two different alphabets and would quietly stop matching -- and
  -- the ROME PROPERTIES pair in the header would flip to unresolved with nothing failing.
  -- The constraint definitions are pinned as deparsed text, so even a PostgreSQL deparse
  -- change fails here loudly rather than weakening the claim silently.
  if not exists(select 1 from pg_constraint
      where conrelid='clara.counterparties'::regclass and conname='ck_counterparties_name_normalized'
        and pg_get_constraintdef(oid) =
            'CHECK ((name_normalized = lower(regexp_replace(name, ''[^a-zA-Z0-9]''::text, ''''::text, ''g''::text))))') then
    raise exception '0048 prestate: clara.counterparties.name_normalized is not the pinned lower/regexp_replace normalisation (found %) -- the vendor-evidence arm would compare two alphabets',
      (select coalesce(pg_get_constraintdef(oid),'<absent>') from pg_constraint
        where conrelid='clara.counterparties'::regclass and conname='ck_counterparties_name_normalized')
      using errcode = 'CLR10';
  end if;
  if not exists(select 1 from pg_constraint
      where conrelid='clara.counterparties'::regclass and conname='ck_counterparties_registration_normalized'
        and pg_get_constraintdef(oid) like '%lower(regexp_replace(registration_no, ''[^a-zA-Z0-9]''::text, ''''::text, ''g''::text))%') then
    raise exception '0048 prestate: clara.counterparties.registration_normalized is not the pinned normalisation (found %)',
      (select coalesce(pg_get_constraintdef(oid),'<absent>') from pg_constraint
        where conrelid='clara.counterparties'::regclass and conname='ck_counterparties_registration_normalized')
      using errcode = 'CLR10';
  end if;
  if not exists(select 1 from pg_constraint
      where conrelid='clara.counterparty_aliases'::regclass and conname='ck_counterparty_aliases_normalized'
        and pg_get_constraintdef(oid) =
            'CHECK ((alias_normalized = lower(regexp_replace(alias_display, ''[^a-zA-Z0-9]''::text, ''''::text, ''g''::text))))') then
    raise exception '0048 prestate: clara.counterparty_aliases.alias_normalized is not the pinned normalisation (found %)',
      (select coalesce(pg_get_constraintdef(oid),'<absent>') from pg_constraint
        where conrelid='clara.counterparty_aliases'::regclass and conname='ck_counterparty_aliases_normalized')
      using errcode = 'CLR10';
  end if;

  -- (0.5) THE HARD-IDENTIFIER DOMAIN IS THE THREE VALUES (P2) REASONS ABOUT. "Testable" means
  -- `kind in ('tin','ssm')` -- the same pair the sales arms have always used, and the same
  -- pair 0030's AB-3 matcher uses. A FOURTH kind arriving later (a distinct 'brn', say) would
  -- make a client that holds only that kind read as "no hard identifier" and send its
  -- purchases to unresolved, with no line of this file changing. Refuse instead.
  if not exists(select 1 from pg_constraint
      where conrelid='clara.client_identifiers'::regclass
        and conname='client_identifiers_kind_check'
        and pg_get_constraintdef(oid) =
            'CHECK ((kind = ANY (ARRAY[''tin''::text, ''ssm''::text, ''bank_account''::text])))') then
    raise exception '0048 prestate: clara.client_identifiers.kind is not the pinned tin/ssm/bank_account domain (found %) -- re-derive (P2)''s testability rule before applying',
      (select coalesce(pg_get_constraintdef(oid),'<absent>') from pg_constraint
        where conrelid='clara.client_identifiers'::regclass and conname='client_identifiers_kind_check')
      using errcode = 'CLR10';
  end if;

  -- (0.6) THE COLUMNS (P3) READS EXIST. A missing column would fail at first execution -- in
  -- the middle of a queue read -- rather than at deploy.
  foreach v_sig in array array[
      'clara.counterparties:kind','clara.counterparties:name_normalized',
      'clara.counterparties:registration_normalized','clara.counterparties:retired_at',
      'clara.counterparties:merged_into','clara.counterparties:client_id',
      'clara.counterparty_aliases:alias_normalized','clara.counterparty_aliases:client_id',
      'clara.counterparty_aliases:counterparty_id','clara.counterparty_aliases:retired_at']
  loop
    select count(*) into v_n from pg_attribute
      where attrelid = split_part(v_sig,':',1)::regclass
        and attname = split_part(v_sig,':',2) and attnum > 0 and not attisdropped;
    if v_n <> 1 then
      raise exception '0048 prestate: % does not exist', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.7) THE LANE ANCHOR OCCURS EXACTLY ONCE, AND THE PRE-IMAGE IS STASHED. Zero means the
  -- direction block has already been recut and this file is stale; more than one means the
  -- replace would edit something it never read. The whitespace-folded pre-image lets tail arm
  -- 1 prove MECHANICAL EQUIVALENCE -- the new body is this body plus exactly one documented
  -- substitution and nothing else -- which is what makes a harvest-and-splice safe rather
  -- than hopeful.
  v_anchor :=
    '  begin' || chr(10) ||
    '    v_direction:=clara._document_direction(f.document_id,p_client);' || chr(10) ||
    '    v_tri:=v_direction;' || chr(10) ||
    '  exception when sqlstate ''CLR30'' then' || chr(10) ||
    '    v_reasons:=array_append(v_reasons,''direction_unresolved''); v_hard:=true; v_direction:=''purchase'';' || chr(10) ||
    '    v_tri:=''unresolved'';' || chr(10) ||
    '  end;';
  select prosrc, prosecdef, coalesce(array_to_string(proconfig,'|'),'<none>')
    into v_src, v_secdef, v_config
    from pg_proc where oid = 'clara._coding_lane_core(uuid,uuid)'::regprocedure;
  v_count := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0048 prestate: the 0046 S9.1 direction block occurs % times in clara._coding_lane_core (expected 1) -- this is not the body this file was authored against', v_count
      using errcode = 'CLR10';
  end if;
  if not v_secdef or position('search_path=' in v_config) = 0 then
    raise exception '0048 prestate: clara._coding_lane_core is not SECURITY DEFINER with a pinned search_path (secdef %, proconfig %) -- refusing to re-ship a body whose privilege shape it does not recognise', v_secdef, v_config
      using errcode = 'CLR10';
  end if;
  insert into _d48_pre(sig, folded, secdef, config)
    values ('clara._coding_lane_core(uuid,uuid)', regexp_replace(v_src,'\s+',' ','g'), v_secdef, v_config);

  -- (0.8) THE 0046 SPLICES SURVIVED INTO THE BODY BEING HARVESTED. These are the receipts a
  -- re-typed body would have silently reverted, so they are the direct evidence that SECTION 3
  -- reads the live catalog and not a migration file.
  foreach v_sig in array array['customer_name_missing','customer_ambiguous','v_sales_lane','v_ready']
  loop
    if position(v_sig in v_src) = 0 then
      raise exception '0048 prestate: clara._coding_lane_core is missing 0046 S9''s ''%'' -- the live body is not post-0046', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.9) THE BEFORE HALF OF THE BLAST-RADIUS TABLE. One row per non-retired filing. Both
  -- reads are wrapped: the tri helper is documented never to raise and the lane traps CLR30,
  -- but an unexpected raise here would abort a migration over a MEASUREMENT, so it is
  -- recorded as a value and compared like-for-like afterwards.
  for r in select df.id as filing, df.client_id, df.document_id
             from clara.document_filings df where df.retired_at is null
  loop
    begin
      select l.lane, coalesce(array_to_string(l.reasons,','),'')
        into v_lane, v_reasons
        from clara._coding_lane_core(r.client_id, r.filing) l;
    exception when others then
      v_lane := '<raised:' || sqlstate || '>'; v_reasons := '<raised>';
    end;
    insert into _d48_pre_dir(filing, client, document, has_facts, tri, lane, reasons)
    values (
      r.filing, r.client_id, r.document_id,
      exists(select 1 from clara.document_processing_tasks t
             join clara.document_extractions e on e.document_id=t.document_id
               and e.engine_id=t.engine_id and e.version_n=t.version_n
               and e.engine_kind='invoice_facts' and e.status='done'
             where t.document_id=r.document_id
               and t.lane in ('invoice_facts','local_facts') and t.status='done'),
      coalesce((select clara._autodraft_direction_tri(r.document_id, r.client_id)), '<null>'),
      coalesce(v_lane,'<null>'), coalesce(v_reasons,''));
  end loop;
  select count(*) into v_n from _d48_pre_dir;
  raise notice '0048 prestate: clean (frontier 0047, 3 direction fns, 1 lane anchor, 3 pinned normalisations, % filings measured)', v_n;
end
$prestate$;

-- =====================================================================
-- SECTION 1 -- THE SHARED LEX INSTRUMENT (pg_temp), COPIED VERBATIM FROM 0047 SECTION 1
-- (itself 0046 SECTION 1, itself 0045:344-627 / 673-685, the origin of record).
--
-- WHY IT IS HERE AT ALL. The structural arms in the tail ask "does the live body EVALUATE
-- this predicate", and a raw prosrc match cannot answer that: the bodies being measured are
-- dense with explanatory comments -- including the ones this file itself splices in -- so an
-- arm reading raw source can be satisfied by prose and is then structurally incapable of
-- failing. Law 3 in one sentence: a guard that reads a NAME reads a projection of the thing,
-- not the thing.
--
-- IT IS COPIED, NOT SHARED, AND THAT IS NOT AN OVERSIGHT. These live in pg_temp, which is
-- session-scoped: 0047's copies died with 0047's connection. Every slice of this arc
-- re-creates them for the same reason. Only the two functions this file's arms use are
-- carried (_wdb_sql_code and _wdb_code_literal), byte-identical to 0047:284-584.
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


-- =====================================================================
-- SECTION 2 -- THE DECISION, IN ONE PLACE.
--
-- clara._document_direction (0015:487) and clara._document_direction_at (0016:1852) were
-- BYTE-DUPLICATE decisions with two different extraction lookups. That duplication is the
-- reason this fix could have half-landed: the human coding lane reads the 2-arity and the
-- autopost executor reads the 3-arity, so a fix applied to one and missed on the other would
-- have left the defect live on exactly the path that POSTS. Both now delegate to ONE core.
--
-- THE SELECTOR IS ALSO EXTRACTED, and not only for tidiness: SECTION 3 needs to ask "does
-- this document have any invoice facts to direct?" and the only honest way to ask it is with
-- the SAME selector the decision uses. A second, similar-looking lookup would be a spelling
-- that resembles the thing (law 3), free to drift the moment either is touched.
-- =====================================================================
set role clara_fn_owner;

-- (2.1) THE SELECTOR, VERBATIM FROM 0015:496-501. Latest done invoice_facts extraction whose
-- processing task is itself done on an invoice_facts/local_facts lane. Returns null when the
-- document has never been read -- which every caller must then treat as "no evidence", never
-- as a direction.
create or replace function clara._document_facts_extraction(p_document uuid) returns uuid
  language sql stable security definer set search_path=clara,pg_temp as $$
  select e.id
  from clara.document_processing_tasks t
  join clara.document_extractions e on e.document_id=t.document_id and e.engine_id=t.engine_id
    and e.version_n=t.version_n and e.engine_kind='invoice_facts' and e.status='done'
  where t.document_id=p_document and t.lane in ('invoice_facts','local_facts') and t.status='done'
  order by t.version_n desc, t.id desc limit 1;
$$;
revoke all on function clara._document_facts_extraction(uuid) from public;

-- (2.2) THE CORE. Client-RELATIVE (a document files to many clients), evidence-gated in BOTH
-- directions.
--
-- THE SALES HALF IS 0015's, CARRIED ACROSS UNCHANGED, and its comments come with it because
-- they are the record of two adversarial rounds:
--   * a hard-identifier (registration) match is decisive;
--   * a NAME-only match with no stated registration is also sales (adversarial #7 / native #3
--     -- a real e-invoice may state the exact registered name and no registration at all);
--   * a name match CONTRADICTED by a stated registration that matches nothing ABSTAINS;
--   * a registration match CONTRADICTED by a stated name that names someone else ABSTAINS
--     (RESIDUAL-3: the asymmetry was itself a defect);
--   * the buyer resolves through customer_registration, customer_taxid OR customer_name
--     (RESIDUAL v3), and supplier=client AND buyer=client together ABSTAIN.
--
-- WHAT IS NEW IS THE PURCHASE HALF. 'purchase' used to be the `else` of "not proven sales" --
-- a conclusion drawn from a failed test, including from tests that never ran. It now needs
-- one of three positive facts, and says so by name:
--   (P1) the BUYER resolves to this client -- decisive, the client is on the buying side;
--   (P2) a supplier identity was stated AND EVERY STATED ARM WAS TESTABLE and missed. A
--        stated NAME is always testable (clara.clients.name is NOT NULL). A stated
--        REGISTRATION is testable only when the client holds at least one tin/ssm identifier
--        -- otherwise `exists(...)` returns false because there was nothing to compare with,
--        and scoring that false as "not this client" is precisely the §7-A Half-1 defect;
--   (P3) the stated supplier is an ACCEPTED VENDOR of this client -- a live kind='vendor'
--        counterparty by registration, name or approved alias. This is what keeps a real
--        purchase pipeline working for a client that has not recorded its own identifiers
--        yet: ROME PROPERTIES has none, and its BRIGHTPATH bills state a registration, so
--        (P2) alone would have sent two live purchase documents to unresolved.
-- Anything else raises CLR30 `direction_unresolved` with `"evidence":"none"`.
--
-- (P3) IS A MATCH ACROSS TWO NORMALISATION VOCABULARIES AND THAT IS MEASURED, NOT ASSUMED.
-- The region text is normalised here; the counterparty columns are normalised by CHECK
-- constraints. Prestate arm (0.4) pins all three constraint definitions, so a change to
-- either side fails the deploy instead of quietly ending the match.
create or replace function clara._direction_from_extraction(p_client uuid, p_extraction uuid)
  returns text
  language plpgsql stable security definer set search_path=clara,pg_temp as $dir$
declare
  v_sup_reg text; v_sup_name text; v_cust_reg text; v_client_name text;
  v_cust_taxid text; v_cust_name text;
  v_reg_hit boolean:=false; v_name_hit boolean:=false;
  v_sales boolean:=false; v_cust boolean:=false;
  v_hard_id boolean:=false;
begin
  -- NOTHING TO READ IS NOT A DIRECTION. A null client, or a document with no done
  -- invoice_facts extraction, used to answer 'purchase' here; it is the plainest form of the
  -- defect this file removes (law 2: absence falls through to the fail-closed branch).
  if p_client is null or p_extraction is null then
    raise exception 'document direction is unresolved (nothing has been read for this document)'
      using errcode='CLR30',detail='{"reason":"direction_unresolved","evidence":"none"}';
  end if;
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_sup_reg from clara.document_regions r
    where r.extraction_id=p_extraction and r.field_path='invoice.vendor_registration';
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_sup_name from clara.document_regions r
    where r.extraction_id=p_extraction and r.field_path='invoice.vendor_name';
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_cust_reg from clara.document_regions r
    where r.extraction_id=p_extraction and r.field_path='invoice.customer_registration';
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_cust_taxid from clara.document_regions r
    where r.extraction_id=p_extraction and r.field_path='invoice.customer_taxid';
  select lower(regexp_replace(nullif(btrim(min(r.text_content)),''),'[^a-zA-Z0-9]','','g'))
    into v_cust_name from clara.document_regions r
    where r.extraction_id=p_extraction and r.field_path='invoice.customer_name';
  -- supplier REGISTRATION match against the client's own hard identifiers (kind tin/ssm; a
  -- Malaysian client's BRN is stored under kind='ssm' -- mirrors 0030's AB-3 matcher).
  if v_sup_reg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id=p_client and ci.kind in ('tin','ssm')
        and ci.value_normalized=v_sup_reg) then
    v_reg_hit:=true;
  end if;
  -- supplier NAME match against the client's registered name + approved (non-retired) aliases.
  if v_sup_name is not null then
    select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) into v_client_name
      from clara.clients where id=p_client;
    if v_client_name=v_sup_name
       or exists(select 1 from clara.client_aliases a
           where a.client_id=p_client and a.retired_at is null
             and a.alias_normalized=v_sup_name) then
      v_name_hit:=true;
    end if;
  end if;
  if v_reg_hit and v_sup_name is not null and not v_name_hit then
    raise exception 'document direction is unresolved (supplier registration matches the client but its stated name names a different entity)'
      using errcode='CLR30',detail='{"reason":"direction_unresolved","evidence":"contradiction"}';
  end if;
  if v_reg_hit then
    v_sales:=true;
  elsif v_name_hit and v_sup_reg is null then
    v_sales:=true;
  elsif v_name_hit and v_sup_reg is not null then
    raise exception 'document direction is unresolved (supplier name matches the client but its registration does not)'
      using errcode='CLR30',detail='{"reason":"direction_unresolved","evidence":"contradiction"}';
  end if;
  if (v_cust_reg is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=p_client and ci.kind in ('tin','ssm') and ci.value_normalized=v_cust_reg))
     or (v_cust_taxid is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=p_client and ci.kind in ('tin','ssm') and ci.value_normalized=v_cust_taxid))
     or (v_cust_name is not null and (
        v_cust_name = (select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) from clara.clients where id=p_client)
        or exists(select 1 from clara.client_aliases a where a.client_id=p_client
             and a.retired_at is null and a.alias_normalized=v_cust_name))) then
    v_cust:=true;
  end if;
  if v_sales and v_cust then
    raise exception 'document direction is unresolved (both parties match the client)'
      using errcode='CLR30',detail='{"reason":"direction_unresolved","evidence":"contradiction"}';
  end if;
  if v_sales then return 'sales'; end if;
  -- (P1) THE BUYER IS THIS CLIENT. Decisive on its own: whoever issued the page, this client
  -- is on the buying side of it.
  if v_cust then return 'purchase'; end if;
  if v_sup_reg is not null or v_sup_name is not null then
    if v_sup_reg is not null then
      v_hard_id:=exists(select 1 from clara.client_identifiers ci
        where ci.client_id=p_client and ci.kind in ('tin','ssm'));
    end if;
    -- (P2) A STATED SUPPLIER IDENTITY, EVERY ARM OF IT TESTABLE, AND IT IS NOT THIS CLIENT.
    -- The `v_sup_reg is null` limb is the name-only page: the name arm above really ran.
    -- The `v_hard_id` limb is the whole fix -- a stated registration only counts as MISSED
    -- when there was something to miss against.
    if v_sup_reg is null or v_hard_id then
      return 'purchase';
    end if;
    -- (P3) THE STATED SUPPLIER IS ALREADY A VENDOR IN THIS CLIENT'S OWN BOOKS. Reached only
    -- when a hard identifier was stated and could not be tested, so this is the arm that
    -- keeps an identifier-less client's real purchase pipeline alive rather than a nicety.
    -- Retired and merged-away counterparties are excluded: a party the books have retired is
    -- not evidence of a live supplier relationship.
    if exists(select 1 from clara.counterparties cp
          where cp.client_id=p_client and cp.kind='vendor'
            and cp.retired_at is null and cp.merged_into is null
            and (cp.registration_normalized=v_sup_reg
              or (v_sup_name is not null and cp.name_normalized=v_sup_name)))
       or (v_sup_name is not null and exists(select 1 from clara.counterparty_aliases ca
          join clara.counterparties cp on cp.id=ca.counterparty_id
          where ca.client_id=p_client and cp.kind='vendor'
            and ca.retired_at is null and cp.retired_at is null and cp.merged_into is null
            and ca.alias_normalized=v_sup_name)) then
      return 'purchase';
    end if;
  end if;
  -- NO SALES EVIDENCE AND NO PURCHASE EVIDENCE. The honest answer, and the one 7A-R2 asks
  -- for: unresolved never drafts and falls to the human lanes.
  raise exception 'document direction is unresolved (no testable direction evidence on this document for this client)'
    using errcode='CLR30',detail='{"reason":"direction_unresolved","evidence":"none"}';
end $dir$;
revoke all on function clara._direction_from_extraction(uuid,uuid) from public;

-- (2.3) THE LIVE-SELECTION ENTRY POINT (0015's signature, unchanged, ACLs preserved by
-- CREATE OR REPLACE). A null document reaches the core with a null extraction and is refused
-- there -- one refusal, one place, rather than a null guard that answered 'purchase'.
create or replace function clara._document_direction(p_document uuid, p_client uuid) returns text
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
begin
  return clara._direction_from_extraction(p_client, clara._document_facts_extraction(p_document));
end $$;
revoke all on function clara._document_direction(uuid,uuid) from public;

-- (2.4) THE PINNED-EXTRACTION ENTRY POINT (ADV-R3#1, 0016:1852). The autopost executor
-- resolves the document's ONE bound extraction and direction reads THAT extraction's identity
-- regions, never a re-selected latest. A null pin still delegates to the live resolver. A pin
-- that is not a done invoice_facts extraction OF THIS DOCUMENT is now UNRESOLVED rather than
-- 'purchase': a pin we cannot honour is a read that did not happen.
create or replace function clara._document_direction_at(p_document uuid, p_client uuid, p_extraction uuid) returns text
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_ext uuid;
begin
  if p_extraction is null then
    return clara._document_direction(p_document,p_client);
  end if;
  select e.id into v_ext from clara.document_extractions e
    where e.id=p_extraction and e.document_id=p_document
      and e.engine_kind='invoice_facts' and e.status='done';
  return clara._direction_from_extraction(p_client, v_ext);
end $$;
revoke all on function clara._document_direction_at(uuid,uuid,uuid) from public;

-- (2.5) THE TRI-STATE AUTHORITY (7A-R2). Total on {sales, purchase, unresolved} and NEVER
-- null -- it is consumed inside clara._draft_entry_core's refusal predicate, where a null
-- would make the comparison null and the refusal silently vanish (0046's own reasoning).
--
-- THE NULL ARM IS THE CHANGE. 0046 answered 'purchase' for a null document and argued that
-- was fail-closed "for THIS lane", because 'purchase' refuses a sales admission. It is
-- fail-OPEN for the other half: 'purchase' is also the answer that ADMITS a supplier_bill.
-- 'unresolved' is the only value that refuses both, and it is what the caller then names --
-- CLR21 `direction_family_mismatch` in the writer, a fall-through to the lane refusal in
-- admission. No caller sees an exception it does not already handle.
create or replace function clara._autodraft_direction_tri(p_document uuid, p_client uuid) returns text
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_direction text;
begin
  if p_document is null or p_client is null then return 'unresolved'; end if;
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

reset role;

-- =====================================================================
-- SECTION 3 -- clara._coding_lane_core: THE LANE STOPS ASKING A QUESTION WHOSE INPUT HAS NOT
-- BEEN READ.
--
-- Harvested from the live catalog and spliced with a count-guarded replace, NEVER re-typed --
-- 0046 S8 / 0047 S3's reason: this body is 0031's, plus 0036's, plus four separate 0046 S9
-- splices, and re-typing it would silently revert whichever recut this file failed to notice.
-- The tail then proves the result is the pre-image plus EXACTLY this one substitution.
--
-- WHY THE DELTA IS DECLARED ONCE, IN A TEMP TABLE: the splice and the tail's equivalence arm
-- must be applying and measuring THE SAME text. Typing it twice makes a transcription slip
-- look like a clean deploy.
-- =====================================================================
create temp table _d48_delta(anchor text not null, repl text not null) on commit drop;
grant select on _d48_delta to clara_fn_owner;

insert into _d48_delta(anchor, repl) values (
  -- THE ANCHOR: 0046 S9.1's whole direction block, verbatim from the live body.
  '  begin' || chr(10) ||
  '    v_direction:=clara._document_direction(f.document_id,p_client);' || chr(10) ||
  '    v_tri:=v_direction;' || chr(10) ||
  '  exception when sqlstate ''CLR30'' then' || chr(10) ||
  '    v_reasons:=array_append(v_reasons,''direction_unresolved''); v_hard:=true; v_direction:=''purchase'';' || chr(10) ||
  '    v_tri:=''unresolved'';' || chr(10) ||
  '  end;',

  '  -- [0048] THE LANE DOES NOT ASK A QUESTION WHOSE INPUT HAS NOT BEEN READ.' || chr(10) ||
  '  --' || chr(10) ||
  '  -- clara._document_direction now REFUSES (CLR30) instead of defaulting to ''purchase''' || chr(10) ||
  '  -- when there is no evidence to test. For a document with no invoice_facts extraction at' || chr(10) ||
  '  -- all that refusal is correct and useless here: this lane runs for EVERY filing, so the' || chr(10) ||
  '  -- handler below would have marked every bank statement, management account and' || chr(10) ||
  '  -- failed-extraction document HARD, with the reason `direction_unresolved`, forever.' || chr(10) ||
  '  -- Measured on live 2026-08-07: 38 of 129 non-retired filings, 36 of them documents that' || chr(10) ||
  '  -- HAVE no direction (20 bank statements, 4 management accounts, 2 consent evidences, a' || chr(10) ||
  '  -- receipt, a claim form, an other, 7 failed extractions).' || chr(10) ||
  '  --' || chr(10) ||
  '  -- THIS IS NOT THE DEFAULTING 0048 REMOVES, and the difference is worth being exact about:' || chr(10) ||
  '  --   * the state is ALREADY NAMED -- `facts_pending` was appended a few lines above for' || chr(10) ||
  '  --     exactly this condition. One state, one name; no absence is being read as a fact.' || chr(10) ||
  '  --   * v_direction in THIS body is a REGION SELECTOR, not an authority (0046 S9.1 says so:' || chr(10) ||
  '  --     it "selects which extraction fields are read"). There is no extraction, so both' || chr(10) ||
  '  --     branches read the same absent fields.' || chr(10) ||
  '  --   * v_tri -- the honest value, and the only one that reaches v_sales_lane -- is' || chr(10) ||
  '  --     ''unresolved'', which is exactly what the core would have raised.' || chr(10) ||
  '  --   * nothing loosens: `facts_pending` is in none of the bypass sets below, so the lane' || chr(10) ||
  '  --     still cannot be `ready` and admission still refuses.' || chr(10) ||
  '  --' || chr(10) ||
  '  -- THE GUARD USES THE DECISION''S OWN SELECTOR (clara._document_facts_extraction), not a' || chr(10) ||
  '  -- lookalike and not v_state=''{}'': clara._invoice_fact_state answers a different' || chr(10) ||
  '  -- question, and agreeing with it on today''s estate (measured 38/38 and 91/91) is a' || chr(10) ||
  '  -- coincidence rather than an identity. Law 3.' || chr(10) ||
  '  if clara._document_facts_extraction(f.document_id) is null then' || chr(10) ||
  '    v_direction:=''purchase'';' || chr(10) ||
  '    v_tri:=''unresolved'';' || chr(10) ||
  '  else' || chr(10) ||
  '    begin' || chr(10) ||
  '      v_direction:=clara._document_direction(f.document_id,p_client);' || chr(10) ||
  '      v_tri:=v_direction;' || chr(10) ||
  '    exception when sqlstate ''CLR30'' then' || chr(10) ||
  '      v_reasons:=array_append(v_reasons,''direction_unresolved''); v_hard:=true; v_direction:=''purchase'';' || chr(10) ||
  '      v_tri:=''unresolved'';' || chr(10) ||
  '    end;' || chr(10) ||
  '  end if;'
);

set role clara_fn_owner;
do $lane$
declare v_def text; v_anchor text; v_repl text; v_count int;
begin
  select pg_get_functiondef('clara._coding_lane_core(uuid,uuid)'::regprocedure) into v_def;
  select anchor, repl into v_anchor, v_repl from _d48_delta;
  -- The count guard is RE-MADE here rather than inherited from the prestate: the prestate
  -- measured prosrc, this measures the functiondef that is actually about to be edited.
  v_count := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_count <> 1 then
    raise exception '0048 S3: the 0046 S9.1 direction block occurs % times in the functiondef of clara._coding_lane_core (expected 1)', v_count
      using errcode = 'CLR10';
  end if;
  execute replace(v_def, v_anchor, v_repl);
  raise notice '0048 S3: clara._coding_lane_core no longer asks direction of an unread document';
end
$lane$;
reset role;

-- The grants are UNTOUCHED and deliberately not re-issued: CREATE OR REPLACE preserves a
-- function's existing ACL, so re-granting here would be noise that hides a real regression.
-- The tail asserts the post-state instead.

-- =====================================================================
-- TAIL -- IN-TRANSACTION SELF-VERIFICATION. Every raise is a real assertion failure.
--
-- THE INSTRUMENT LAW (0046's, restated because it governs here too). STRUCTURE is asserted on
-- the LEXED body -- comments are chr(1) and string literals are chr(2), both LENGTH-
-- PRESERVING -- so no comment this file splices into a body it also measures can forge a
-- shape. IDENTITY is then read out of RAW at the offset the lexed body reports. Both halves
-- sit in the same predicate: a shape without the literals is satisfied by a differently-worded
-- guard, and a literal without a shape is satisfied by prose.
-- =====================================================================
do $tail$
declare
  v_raw text; v_lex text; v_pre text; v_expected text; v_actual text;
  v_anchor text; v_repl text; v_shape_raw text; v_shape_lex text;
  v_sig text; v_off int; v_count int; v_n int; v_tri text; r record;
  v_changed int:=0; v_flipped int:=0; v_lane text; v_reasons text;
begin
  -- ------------------------------------------------------------------
  -- (1) MECHANICAL EQUIVALENCE FOR THE ONE SPLICED BODY. Not "the new guard is present" --
  -- "nothing else moved". A second edit, a dropped recut or a live hand-patch this file
  -- cannot account for all fail here. Whitespace-folded, so re-indentation is not a failure
  -- and a changed character anywhere is.
  -- ------------------------------------------------------------------
  select anchor, repl into v_anchor, v_repl from _d48_delta;
  select folded into v_pre from _d48_pre where sig = 'clara._coding_lane_core(uuid,uuid)';
  if v_pre is null then
    raise exception '0048 tail 1: no prestate pre-image was stashed for clara._coding_lane_core -- the identity proof did not run, so the splice is unverified';
  end if;
  select prosrc into v_raw from pg_proc where oid='clara._coding_lane_core(uuid,uuid)'::regprocedure;
  v_expected := replace(v_pre, regexp_replace(v_anchor,'\s+',' ','g'), regexp_replace(v_repl,'\s+',' ','g'));
  v_actual   := regexp_replace(v_raw,'\s+',' ','g');
  if v_actual is distinct from v_expected then
    raise exception '0048 tail 1: the recut clara._coding_lane_core is NOT its pre-image plus exactly the documented delta -- something else in the body moved';
  end if;

  -- ------------------------------------------------------------------
  -- (2) THE LANE'S NEW GUARD IS THE SHAPE, AS CODE, EXACTLY ONCE -- and it calls the
  -- DECISION'S OWN SELECTOR. A guard matched only in raw source could be forged by the very
  -- comment this file splices in one line above it.
  -- ------------------------------------------------------------------
  v_lex := pg_temp._wdb_sql_code(v_raw);
  v_shape_raw :=
    '  if clara._document_facts_extraction(f.document_id) is null then' || chr(10) ||
    '    v_direction:=''purchase'';' || chr(10) ||
    '    v_tri:=''unresolved'';' || chr(10) ||
    '  else';
  -- literal lengths MEASURED, not counted by eye: 'purchase' is 10 characters with its
  -- quotes, 'unresolved' is 12.
  v_shape_lex :=
    '  if clara._document_facts_extraction(f.document_id) is null then' || chr(10) ||
    '    v_direction:=' || repeat(chr(2),10) || ';' || chr(10) ||
    '    v_tri:=' || repeat(chr(2),12) || ';' || chr(10) ||
    '  else';
  v_count := (length(v_lex) - length(replace(v_lex, v_shape_lex, ''))) / length(v_shape_lex);
  if v_count <> 1 then
    raise exception '0048 tail 2: the unread-document guard occurs % times in the LEXED clara._coding_lane_core (expected 1)', v_count;
  end if;
  v_off := position(v_shape_lex in v_lex);
  if substr(v_raw, v_off, length(v_shape_raw)) <> v_shape_raw then
    raise exception '0048 tail 2: the unread-document guard matches the shape but not the literals -- it assigns some other pair of values than purchase/unresolved';
  end if;
  -- ...and the CLR30 handler it now sits beside is still there, still hard. Losing it would
  -- turn a genuine contradiction into a silent needs_review.
  -- literal length MEASURED, not counted by eye: 'direction_unresolved' is 22 characters
  -- with its quotes.
  if position('v_reasons:=array_append(v_reasons,' || repeat(chr(2),22) || '); v_hard:=true;' in v_lex) = 0 then
    raise exception '0048 tail 2: clara._coding_lane_core no longer marks a CLR30 direction contradiction HARD';
  end if;
  if not pg_temp._wdb_code_literal(v_raw, '''direction_unresolved''') then
    raise exception '0048 tail 2: clara._coding_lane_core no longer carries ''direction_unresolved'' as a CODE literal';
  end if;

  -- ------------------------------------------------------------------
  -- (3) THE DEFECT IS GONE FROM EVERY DIRECTION BODY -- not merely outnumbered. Asked on the
  -- LEXED body so that this file's own comments, which quote the old fallthrough to explain
  -- it, cannot keep the arm green OR red by accident.
  -- ------------------------------------------------------------------
  foreach v_sig in array array[
      'clara._document_direction(uuid,uuid)',
      'clara._document_direction_at(uuid,uuid,uuid)',
      'clara._direction_from_extraction(uuid,uuid)',
      'clara._autodraft_direction_tri(uuid,uuid)']
  loop
    select prosrc into v_raw from pg_proc where oid = v_sig::regprocedure;
    v_lex := pg_temp._wdb_sql_code(v_raw);
    if position('if v_sales then return ' || repeat(chr(2),7) || '; else return ' || repeat(chr(2),10) || '; end if;' in v_lex) <> 0 then
      raise exception '0048 tail 3: the sales-or-purchase fallthrough is STILL executable in % -- the recut added beside the defect instead of replacing it', v_sig;
    end if;
    if pg_temp._wdb_code_literal(v_raw, '''purchase''')
       and v_sig in ('clara._document_direction(uuid,uuid)','clara._document_direction_at(uuid,uuid,uuid)') then
      raise exception '0048 tail 3: % still names ''purchase'' as CODE -- the two entry points must carry no decision at all, only the delegation', v_sig;
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- (4) BOTH ENTRY POINTS DELEGATE TO THE ONE CORE. This is what makes the duplicate body
  -- unable to come back: a future fix applied to the human-lane function cannot miss the
  -- autopost executor's function, because there is only one decision to fix.
  -- ------------------------------------------------------------------
  foreach v_sig in array array[
      'clara._document_direction(uuid,uuid)',
      'clara._document_direction_at(uuid,uuid,uuid)']
  loop
    select prosrc into v_raw from pg_proc where oid = v_sig::regprocedure;
    v_lex := pg_temp._wdb_sql_code(v_raw);
    if position('clara._direction_from_extraction(' in v_lex) = 0 then
      raise exception '0048 tail 4: % does not call clara._direction_from_extraction as CODE -- it is carrying its own copy of the decision again', v_sig;
    end if;
  end loop;
  select prosrc into v_raw from pg_proc where oid='clara._document_direction(uuid,uuid)'::regprocedure;
  if position('clara._document_facts_extraction(' in pg_temp._wdb_sql_code(v_raw)) = 0 then
    raise exception '0048 tail 4: clara._document_direction no longer resolves its extraction through the shared selector';
  end if;

  -- ------------------------------------------------------------------
  -- (5) THE CORE CARRIES ALL THREE PURCHASE ARMS AND THE FINAL REFUSAL, AS CODE. Shape plus
  -- literals, as above. Losing (P3) silently would break ROME PROPERTIES' live purchase
  -- documents; losing the final raise would restore the whole defect while every other arm
  -- here stayed green.
  -- ------------------------------------------------------------------
  select prosrc into v_raw from pg_proc where oid='clara._direction_from_extraction(uuid,uuid)'::regprocedure;
  v_lex := pg_temp._wdb_sql_code(v_raw);
  -- (P1)
  v_shape_raw := '  if v_cust then return ''purchase''; end if;';
  v_shape_lex := '  if v_cust then return ' || repeat(chr(2),10) || '; end if;';
  if position(v_shape_lex in v_lex) = 0 then
    raise exception '0048 tail 5: the core is missing the (P1) buyer-is-the-client arm as code';
  end if;
  v_off := position(v_shape_lex in v_lex);
  if substr(v_raw, v_off, length(v_shape_raw)) <> v_shape_raw then
    raise exception '0048 tail 5: the (P1) arm matches the shape but not the literal';
  end if;
  -- (P2) -- the testability limb IS the fix; a body that returned 'purchase' on any stated
  -- supplier would satisfy a weaker arm and reintroduce the §7-A Half-1 defect exactly.
  v_shape_raw := '    if v_sup_reg is null or v_hard_id then' || chr(10) || '      return ''purchase'';';
  v_shape_lex := '    if v_sup_reg is null or v_hard_id then' || chr(10) || '      return ' || repeat(chr(2),10) || ';';
  if position(v_shape_lex in v_lex) = 0 then
    raise exception '0048 tail 5: the core is missing the (P2) testable-supplier arm as code -- an untestable stated registration would be scored as a miss again';
  end if;
  v_off := position(v_shape_lex in v_lex);
  if substr(v_raw, v_off, length(v_shape_raw)) <> v_shape_raw then
    raise exception '0048 tail 5: the (P2) arm matches the shape but not the literal';
  end if;
  -- ...and v_hard_id is DERIVED from the client's own identifiers, not assumed.
  if position('v_hard_id:=exists(select 1 from clara.client_identifiers ci' in v_lex) = 0 then
    raise exception '0048 tail 5: the core does not derive v_hard_id from clara.client_identifiers -- (P2) would be testing a constant';
  end if;
  -- (P3)
  if position('from clara.counterparties cp' in v_lex) = 0
     or position('from clara.counterparty_aliases ca' in v_lex) = 0
     or not pg_temp._wdb_code_literal(v_raw, '''vendor''') then
    raise exception '0048 tail 5: the core is missing the (P3) accepted-vendor arm as code';
  end if;
  -- THE FINAL REFUSAL, and that it really is CLR30 with the evidence-none reason.
  if not pg_temp._wdb_code_literal(v_raw, '''CLR30''')
     or not pg_temp._wdb_code_literal(v_raw, '''{"reason":"direction_unresolved","evidence":"none"}''') then
    raise exception '0048 tail 5: the core does not raise CLR30 with the evidence-none detail as code -- the zero-evidence answer would exist only in prose';
  end if;

  -- ------------------------------------------------------------------
  -- (6) BEHAVIOUR, ON THE TERNARY DOMAIN. Structure proves what the body says; these prove
  -- what it ANSWERS. The four null/unknown combinations are the cheapest total probe of a
  -- function whose whole contract is "never null, never a fourth value" -- and they are the
  -- exact inputs 0036's tail already pins for the boolean sibling.
  -- ------------------------------------------------------------------
  for r in select * from (values
      (null::uuid, null::uuid), (gen_random_uuid(), null::uuid),
      (null::uuid, gen_random_uuid()), (gen_random_uuid(), gen_random_uuid())) as t(d,c)
  loop
    v_tri := clara._autodraft_direction_tri(r.d, r.c);
    if v_tri is distinct from 'unresolved' then
      raise exception '0048 tail 6: clara._autodraft_direction_tri(%,%) answered ''%'' -- a document nothing is known about must answer unresolved, never a confident direction and never null',
        coalesce(r.d::text,'null'), coalesce(r.c::text,'null'), coalesce(v_tri,'<null>');
    end if;
    -- ...and the sibling boolean still answers FALSE rather than null: it is consumed as
    -- `and not clara._autodraft_sales_direction(...)` inside a language-sql WHERE clause,
    -- where a null silently DROPS the row and strands purchase work invisibly (0036:1794).
    if clara._autodraft_sales_direction(r.d, r.c) is not false then
      raise exception '0048 tail 6: clara._autodraft_sales_direction(%,%) is no longer FALSE for an unknown document -- 0036''s enumeration invariant is broken',
        coalesce(r.d::text,'null'), coalesce(r.c::text,'null');
    end if;
    -- ...and the two entry points REFUSE rather than answer.
    begin
      perform clara._document_direction(r.d, r.c);
      raise exception '0048 tail 6: clara._document_direction(%,%) returned a direction for a document nothing is known about',
        coalesce(r.d::text,'null'), coalesce(r.c::text,'null');
    exception when sqlstate 'CLR30' then null;
    end;
    begin
      perform clara._document_direction_at(r.d, r.c, gen_random_uuid());
      raise exception '0048 tail 6: clara._document_direction_at(%,%,<unknown pin>) returned a direction for a pin it could not honour',
        coalesce(r.d::text,'null'), coalesce(r.c::text,'null');
    exception when sqlstate 'CLR30' then null;
    end;
  end loop;

  -- ------------------------------------------------------------------
  -- (7) THE BLAST RADIUS, RE-MEASURED ON THIS DATABASE. The header's table is a claim about
  -- live; this is what is CHECKED wherever the file is applied.
  --
  -- WHAT IS **NOT** ASSERTED, AND WHY -- read this before strengthening it. An earlier cut of
  -- this arm demanded that any filing whose document HAS invoice facts answer exactly what it
  -- answered before. That is not the contract: a document that was READ and still carries no
  -- testable identity (an extraction with no counterparty fields; a stated registration on a
  -- client with neither a hard identifier nor an accepting vendor) is EXACTLY the case this
  -- file exists to move off 'purchase'. The rig's own D5 and D8 cells build that document on
  -- purpose. An arm that refused it would have made the migration unappliable to any database
  -- carrying one, and its greenness on live would have been luck.
  --
  -- SO THE HARD CLAIMS ARE THE ONES THE CHANGE ACTUALLY MAKES:
  --   (a) the answer stays inside the ternary domain;
  --   (b) NOTHING BECOMES 'sales' AND NO 'sales' MOVES -- the sales half is carried across
  --       byte-for-byte, so a moved sale means the carry-across was not faithful;
  --   (c) NOTHING MOVES OFF 'unresolved' -- this file only ever narrows confidence;
  --   (d) an UNREAD document answers 'unresolved' and its HUMAN QUEUE ROW IS BYTE-IDENTICAL,
  --       lane and reasons both. That is SECTION 3's whole claim, and it is where the 38 live
  --       filings live.
  -- The purchase -> unresolved movements among READ documents are COUNTED AND NAMED in the
  -- closing notice instead, because on live there are none (measured read-only 2026-08-07,
  -- all 91 read filings resolve) and on a rig database there are many. A ceremony reads that
  -- number; a wrong number is a stop, not a silent pass.
  --
  -- IT ASSUMES THE D1 WRITE-QUIESCE, and says so: the two measurements are separate
  -- statements, so a concurrent commit between them could move a lane for reasons that have
  -- nothing to do with this file. That is the recorded procedure for a body-replacing
  -- migration, not an extra requirement invented here.
  -- ------------------------------------------------------------------
  for r in select * from _d48_pre_dir
  loop
    v_tri := clara._autodraft_direction_tri(r.document, r.client);
    if v_tri is null or v_tri not in ('sales','purchase','unresolved') then
      raise exception '0048 tail 7: filing % answered ''%'' -- outside the ternary domain',
        r.filing, coalesce(v_tri,'<null>');
    end if;
    if (r.tri = 'sales') <> (v_tri = 'sales') then
      raise exception '0048 tail 7: filing % (client %) moved ''%'' -> ''%'' across the SALES boundary -- 0048 carries every sales arm across unchanged, so nothing may enter or leave it',
        r.filing, r.client, r.tri, v_tri;
    end if;
    if r.tri = 'unresolved' and v_tri <> 'unresolved' then
      raise exception '0048 tail 7: filing % (client %) moved ''unresolved'' -> ''%'' -- this file only ever narrows confidence, never widens it',
        r.filing, r.client, v_tri;
    end if;
    if not r.has_facts then
      if v_tri is distinct from 'unresolved' then
        raise exception '0048 tail 7: filing % (client %) has NO invoice facts but answered ''%'' -- an unread document must answer unresolved',
          r.filing, r.client, v_tri;
      end if;
      -- (d) THE QUEUE, for exactly the population SECTION 3 protects.
      begin
        select l.lane, coalesce(array_to_string(l.reasons,','),'')
          into v_lane, v_reasons
          from clara._coding_lane_core(r.client, r.filing) l;
      exception when others then
        v_lane := '<raised:' || sqlstate || '>'; v_reasons := '<raised>';
      end;
      if coalesce(v_lane,'<null>') is distinct from r.lane
         or coalesce(v_reasons,'') is distinct from r.reasons then
        raise exception '0048 tail 7: the human queue moved for UNREAD filing % (client %): lane ''%''/[%] -> ''%''/[%] -- SECTION 3 exists precisely so it does not',
          r.filing, r.client, r.lane, r.reasons, coalesce(v_lane,'<null>'), coalesce(v_reasons,'');
      end if;
    elsif v_tri is distinct from r.tri then
      v_flipped := v_flipped + 1;
      if v_flipped <= 5 then
        raise notice '0048 tail 7: READ filing % (client %) moved ''%'' -> ''%'' -- a document with no testable identity; expected ZERO of these on live',
          r.filing, r.client, r.tri, v_tri;
      end if;
    end if;
    v_changed := v_changed + 1;
  end loop;

  -- ------------------------------------------------------------------
  -- (8) THE SIGNATURES, THE PRIVILEGE SHAPE AND THE ACLs. CREATE OR REPLACE preserves ACLs,
  -- so this is what turns "preserves" from a documented property into a measured one -- and
  -- the two NEW internals must be reachable from nobody at all.
  -- ------------------------------------------------------------------
  select count(*) into v_n from pg_proc p
    where p.pronamespace='clara'::regnamespace
      and p.proname in ('_document_direction','_document_direction_at','_autodraft_direction_tri');
  if v_n <> 3 then
    raise exception '0048 tail 8: expected exactly THREE direction functions after the recut, found % -- a CREATE OR REPLACE became a CREATE and the old body is still reachable', v_n;
  end if;
  foreach v_sig in array array[
      'clara._document_direction(uuid,uuid)',
      'clara._document_direction_at(uuid,uuid,uuid)',
      'clara._autodraft_direction_tri(uuid,uuid)',
      'clara._direction_from_extraction(uuid,uuid)',
      'clara._document_facts_extraction(uuid)',
      'clara._coding_lane_core(uuid,uuid)']
  loop
    if not (select p.prosecdef from pg_proc p where p.oid=v_sig::regprocedure) then
      raise exception '0048 tail 8: % is not SECURITY DEFINER', v_sig;
    end if;
    if position('search_path=' in (select coalesce(array_to_string(p.proconfig,'|'),'<none>')
                                   from pg_proc p where p.oid=v_sig::regprocedure)) = 0 then
      raise exception '0048 tail 8: % carries no pinned search_path', v_sig;
    end if;
    if exists(select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid=v_sig::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception '0048 tail 8: PUBLIC holds EXECUTE on % -- these are internals', v_sig;
    end if;
    -- Not one of them is a human/agent surface: they are called only from inside other
    -- SECURITY DEFINER bodies, which run as the owner.
    if has_function_privilege('clara_authenticated', v_sig::regprocedure, 'execute')
       or has_function_privilege('clara_agent_ro', v_sig::regprocedure, 'execute') then
      raise exception '0048 tail 8: % is reachable from a non-definer role -- direction is an internal, never a verb', v_sig;
    end if;
  end loop;
  -- clara._coding_lane_core's own privilege shape is asserted as UNCHANGED FROM THE PRE-IMAGE
  -- rather than against a literal typed here: the claim CREATE OR REPLACE makes is
  -- "preserved", so "equal to what was there before" is the claim stated exactly.
  if (select p.prosecdef from pg_proc p where p.oid='clara._coding_lane_core(uuid,uuid)'::regprocedure)
     is distinct from (select secdef from _d48_pre where sig='clara._coding_lane_core(uuid,uuid)')
     or (select coalesce(array_to_string(p.proconfig,'|'),'<none>') from pg_proc p
         where p.oid='clara._coding_lane_core(uuid,uuid)'::regprocedure)
        is distinct from (select config from _d48_pre where sig='clara._coding_lane_core(uuid,uuid)') then
    raise exception '0048 tail 8: clara._coding_lane_core changed its privilege shape across the splice';
  end if;

  raise notice '0048 tail: 8 arms clean -- % filings re-measured; % READ filings moved off a defaulted direction (live expects ZERO); every unread filing now answers unresolved with a byte-identical queue row',
    v_changed, v_flipped;
end
$tail$;
