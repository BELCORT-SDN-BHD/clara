-- 0037_wave_c_a_subledger.sql -- Wave C-a: the AR/AP open-item subledger + allocation.
-- The design of record is docs/plan/wave-c-a-subledger-design.md (v2, review-hardened);
-- its section numbers are cited throughout. This migration EXECUTES that design's DB half:
-- the two settlement coding_kinds and their shape floors, the signed open_items +
-- balanced-pair open_item_allocations tables, the ONE classifier that decomposes an
-- approved entry, the hook on all FOUR live approve paths, the two structural belts, the
-- entries-driven backfill of the existing book, the four allocation composites, and the
-- two owner-ruled riders (the sighting-pool gate, the sweep force-complete guard).
--
-- =====================================================================================
-- WHY THIS EXISTS -- the F3 debt, stated in the opening line as the contract asks.
-- =====================================================================================
-- Every supplier_bill approved today -- the ADR-050 production autopost included -- credits
-- a payable control account with NO open item behind it. By PRD.md:119's own wording ("A
-- workflow FAILS if it posts or codes GL lines while leaving any required AR/AP/fixed-asset/
-- reconciliation/reporting/knowledge state stale") that is a failing workflow, and the
-- deferral to Wave C was never recorded as an F3 exception anywhere. C-a pays it.
--
-- THE MODEL, IN THREE LINES (design section 3). Items live at the grain (entry_id, domain,
-- counterparty_id); amount_cents is the SIGNED control net of that counterparty's
-- control-class legs in that domain on that entry (AR: + = the customer owes us; AP: + = we
-- owe the supplier). Allocations are BALANCED PAIRS: applying money to an invoice writes
-- -X against the invoice item and +X against the settlement entry's own full-gross item, so
-- every application_group nets to exactly zero per (client, domain). Therefore
--   control GL balance = SUM(open_items.amount_cents)   per (client, domain)   -- THE identity
--   outstanding(item)  = amount + SUM(its allocations)                          -- derived, never stored
-- and NO post-approval verb can perturb the identity, mathematically: unallocate and
-- apply_open_items only ever write zero-net pairs, and items are written exactly once per
-- approved entry by the classifier.
--
-- =====================================================================================
-- SECTION A -- TAXONOMY (WC-R9, design section 4.1). Two new coding_kinds, two floors.
-- =====================================================================================
-- ck_je_coding_kind gains 'customer_receipt' and 'supplier_payment' through the 0015
-- drop/re-add idiom (the constraint is explicitly named, so the drop is by name, not by
-- definition). WC-R9 fixes the MEANING of coding_kind as "which control account this entry
-- touches, and in which direction" -- not "what kind of document this is" -- which is why
-- two values suffice and why the customer_receipt floor's ZERO-INCOME-LEGS clause is the
-- structural foreclosure of the Gate-1 F3-3 defect (a bank receipt auto-posted
-- Dr Bank / Cr Revenue, double-counting income against the invoice that had already
-- recognised it).
--
-- The two floors are written in the SALES shape, not the purchase shape: fact-first, with a
-- full early return on `reversal_of is not null` (a reversal mirror copies its original's
-- legs verbatim with the sides swapped, so a leg-direction floor would refuse every mirror
-- of a settlement). The unwind is lineage-keyed on reversal_of instead -- design section 4.5,
-- and the reason the Wave-C contract's section-3 trap ("reverse_entry drops coding_kind and
-- document_id") is answered by NOT copying the kind rather than by a naive copy.
--
-- The trigger twins are AFTER INSERT OR UPDATE, not AFTER UPDATE like their 0009/0015
-- ancestors. Both design-review lanes converged on this independently: an INSERT that lands
-- a row already at status='approved' (a direct construction, a future bulk path) must be
-- caught too, and the AFTER-UPDATE-only form cannot see it. The WHEN clause is therefore
-- `new.status='approved'` alone -- OLD cannot be referenced in a trigger that fires on
-- INSERT, so the ancestors' `old.status is distinct from new.status` transition guard is
-- structurally unavailable here. The cost is that the floors also re-run on the
-- reversal-linkage UPDATE of an already-approved row; both floors are pure reads of the
-- entry, so a re-run is idempotent, and _tf_entry_immutable already bounds which columns
-- such an UPDATE may touch.
--
-- SETTLEMENT KINDS ARE CREATABLE ONLY BY THE SECTION-4.9 COMPOSITES (WCA-R6 as amended by
-- WCA-R7). _draft_entry_core's allowlist (0016:4020-4023) stays invoice-only and is NOT
-- widened -- a settlement kind passed to any draft verb raises its existing CLR10
-- 'unsupported coding kind'. The tail asserts that allowlist is untouched. Above the
-- high-stakes threshold the composite still leaves a DRAFT for the checker (WCA-R7), but
-- that draft is composite-born; no draft verb can mint one.
--
-- =====================================================================================
-- SECTION B -- THE AUTOPOST BELT (contract item 7, WCA-R6 ruled A+).
-- =====================================================================================
-- Which of three open bills a RM5,000 payment settles is a JUDGEMENT, not a document fact.
-- The belt is therefore three-layered and deliberately does NOT include an executor recut:
--   (1) ck_je_settlement_not_rule_checked -- a durable, caller-independent CHECK on
--       journal_entries: a settlement-kind row may never carry checked_via_rule_id. It is
--       NULL-safe in both directions (a NULL coding_kind passes; a NULL rule id passes) and
--       it binds every writer that ever exists, including one nobody has written yet.
--   (2) the early NAMED refusal in _approve_entry_core (CLR10, reason
--       settlement_not_autopostable), placed AFTER the locked status/revision checks -- so a
--       benign concurrent-approval race still reports as not_a_draft and execute_rule_post's
--       FIX-6 discrimination keeps working -- and BEFORE any mutation this function makes.
--   (3) NO executor recut. The risk asymmetry is the FIX-6 philosophy (0030:1359-1375): a
--       recut of execute_rule_post to add a fourth named skip buys a nicer receipt and costs
--       a rebuild of the most safety-critical body in the schema. The refusal propagates
--       honestly instead -- which is exactly why the rule-post dead-letter rider
--       (rule-post.mjs:48-55, whose SET ROLE in `finally` masks the original error in an
--       aborted transaction) lands as its own small PR BEFORE this one (WCA-R9c). The
--       "propagates honestly -> dead-letter" claim is only true once that rider is in.
-- control_shape gives incidental cover but it is GEOMETRY, not law -- the same distinction
-- the cn_not_autopostable precedent draws (0030:681-687), where the 0015 control-shape
-- refusal was incidental and the named skip is the rule.
--
-- =====================================================================================
-- SECTION C -- THE CLASSIFIER AND THE FOUR APPROVE PATHS (design section 4.3).
-- =====================================================================================
-- clara._subledger_classify_entry(p_entry) is the ONLY decomposition logic in the system.
-- The runtime hook calls it, the backfill calls it, the read-only preview calls it, and both
-- belts call it. There is deliberately no second implementation to drift.
--
-- ITS PRECEDENCE LADDER, pinned by a tail assert on normalized prosrc positions:
--   1. reversal_of is not null -> UNWIND rows: negate every item of the ORIGINAL entry
--      (item_kind 'reversal_unwind', reversal_unwind_of lineage). Section 4.5's reverse
--      refusal guarantees the original's items carry zero net allocations, so the unwind is
--      trivially total -- no stranded allocation, no phantom outstanding.
--   2. is_opening_balance -> 'opening' items per (domain, counterparty) from the control-leg
--      nets, with opening_item_id lineage joined FROM clara.opening_items where one exists.
--      NULLABLE on purpose: K6 replacement mirrors get no opening_items row at all
--      (0017:4105-4118). opening_items is NEVER an independent row source -- entries drive
--      everything and the GL is the tie target.
--   3. the typed anchors -> 'bill' / 'invoice' / 'credit_note'.
--   4. the settlement kinds -> the 'settlement' item (-gross).
--   5. coding_kind is null + control legs -> 'adjustment' items (WCA-R2).
--   6. else -> no rows.
-- Paths 3, 4 and 5 share ONE control-net query; only the item_kind label differs. That is
-- not a shortcut -- it is the reason the settlement item is exactly -gross without a special
-- case: the composite's entry credits (AR) or debits (AP) the control for amount+discount,
-- so the signed control net IS -gross by construction.
--
-- ZERO-NET PER COUNTERPARTY YIELDS NO ITEM (amount_cents <> 0 is a CHECK). An intra-domain
-- same-party reclass -- two control legs for one counterparty that cancel -- is a real GL
-- event with no subledger effect, and the identity is per DOMAIN, never per account, so the
-- tie is unaffected.
--
-- THE TWO NAMED REFUSALS (WCA-R9b) live in _subledger_on_approve, not in the classifier.
-- That placement is load-bearing: the classifier must stay TOTAL so the read-only preview
-- and the dry-run can decompose a contradicting entry and REPORT it, rather than erroring
-- out the whole estate-wide scan on one bad row -- the same reasoning 0036's
-- _autodraft_sales_direction applies to CLR30. The refusals are:
--   * counterparty_kind_mismatch -- a classified item whose counterparty kind contradicts
--     its domain (domain 'ar' demands kind 'customer'; 'ap' demands 'vendor'). Both lanes
--     write wrong attributions SILENTLY today (0035:222-227 defaults a NULL-coding_kind
--     birth to 'vendor'), so a refusal carrying a path -- "state kind:'customer' in the
--     proposal, or bind the correct counterparty" -- is the honest upgrade, not a new tax.
--   * cross_domain_control_entry -- one entry with control nets in BOTH domains. Applied
--     universally rather than only to generic entries: the typed floors already forbid the
--     shape (the sales floor admits no payable leg, the purchase floor no receivable leg),
--     so universality changes nothing for them and closes the generic lane properly.
--     Remedy: "split via a clearing account, one entry per domain".
--
-- THERE ARE FOUR LIVE APPROVE PATHS, and the v1 census missed the fourth:
--   1. clara._approve_entry_core (latest 0035:140-483; shared by approve_entry AND
--      execute_rule_post since 0015 -- one core, so teaching it covers autopost
--      automatically: contract item 5, satisfied with ZERO executor edits). The hook is
--      NEVER gated on checked_via_rule_id.
--   2. clara.reverse_entry's inline non-high-stakes branch (0009:1730-1731).
--   3. clara._approve_opening_entry (0017:3809-3811).
--   4. clara.approve_wrong_client_correction's inline mirror approve (0027:303-305) -- which
--      also ADOPTS an existing pending draft mirror (0027:276-280), a hole nothing else
--      covers.
-- A tail assert censuses the live catalog for bodies that flip journal_entries to
-- 'approved' and pins the list at exactly those four, each carrying the hook call. A fifth
-- path cannot appear unnoticed.
--
-- =====================================================================================
-- CoR DISCIPLINE -- the provenance map, verified with the 0036:381-413 DUAL GREP.
-- =====================================================================================
-- 0036's header records the method that failed and must not be repeated: establishing "the
-- last definition" by grepping `create (or replace )?function clara.<name>` alone is
-- STRUCTURALLY BLIND to the change-of-record idiom this repo uses constantly (0017 / 0018 /
-- 0019 / 0020 / 0024 / 0025 / 0026 all patch large bodies via pg_get_functiondef -> replace
-- -> the dynamic install, which contains no `create function` text at all). Both greps were
-- run for all five bodies below, and every one was then diffed against pg_get_functiondef on
-- a database migrated 0001..0036 from zero:
--
--   REBUILT from its genuine last definition:
--     clara._approve_entry_core(jsonb,uuid,uuid,text,text) -> 0035:140-483, its FIFTH recut.
--       Verified clean: no migration patches it dynamically after 0035 (0016:5068/5117 and
--       0015:3682 are prosrc ASSERTIONS, not definitions; 0017:230-253 patched the PRE-0035
--       body and 0035's own rebuild carries that R1-F1 splice forward -- confirmed present
--       in the live text). Live body diffed BYTE-IDENTICAL to the 0035 file text.
--     clara._approve_opening_entry(uuid,uuid,uuid,text,int) -> 0017:3784, never recut and
--       never dynamically patched (both greps clean). Live body diffed byte-identical.
--   PATCHED IN PLACE, because a rebuild would silently revert a prior change of record:
--     clara.reverse_entry(uuid,text,text) -> created 0004:560, recut 0005:903 and 0009:1697,
--       then PATCHED by 0017:255-271 with the CLR31 opening-boundary preflight (asserted at
--       0017:5324-5337). A rebuild from 0009's text would delete that boundary. The prestate
--       probe below is POSITIVE -- it demands 0017's own marker before touching anything.
--     clara.approve_wrong_client_correction(uuid,text,text,text) -> created 0007:2518, recut
--       0009:2421 and 0027:196 (the documents-before-document_filings lock-order fix). Live
--       body diffed byte-identical to 0027's text; patched anyway, per the work order, with
--       positive probes for 0027's own lock-order markers so a reverted body aborts.
--     clara.reconcile_sweep_runs() -> created 0011:2709, PATCHED by 0017:445-505 with the
--       R2-F6 active-client guard joins on all three surgeries. THE SPLICE ANCHOR IS THE
--       0017-SPLICED TEXT (0017:473-480, the active_completion_client join form) -- 0011's
--       three-line form NO LONGER EXISTS in the live body, and anchoring on it would
--       silently no-op.
--     clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb) -> created 0009:1750,
--       recut 0011:2815, 0015:2080 and 0016:4765, then PATCHED TWICE: 0017:291-308 (the
--       R1-F1 CLR31 opening-boundary preflight) and 0028:1443-1532 (FOUR regions -- the
--       binding-divergence declarations, the resolution read, the coding_kind /
--       vendor_binding_id strip plus the vendor_binding_resolutions row, and the
--       binding_resolved event). The `create function` grep stops at 0016 and is wrong by
--       five changes of record; the patch below probes 0017's AND 0028's own markers first.
-- Every patch below carries a two-sided probe: POSITIVE for the prior change-of-record's
-- markers BEFORE the splice, and POSITIVE for its own additions (counted, exactly once)
-- AFTER. Anchor drift aborts the deploy rather than shipping green.
--
-- =====================================================================================
-- D1 WRITE-QUIESCE -- required, and this one is stronger than usual.
-- =====================================================================================
-- Per packages/db/README.md:95-113, a migration that replaces writer bodies requires an
-- application write-quiesce for its deploy window: PostgreSQL runs each in-flight PL/pgSQL
-- execution to completion on the body it STARTED with, so a writer call that begins before
-- this commits and finishes after it runs on the OLD body -- and would therefore approve an
-- entry WITHOUT materialising its open items, leaving the belt to fail that transaction at
-- commit. This migration replaces or patches SIX live writer bodies
-- (_approve_entry_core, reverse_entry, revise_entry, approve_wrong_client_correction,
-- _approve_opening_entry, reconcile_sweep_runs).
--
-- IT ALSO TAKES ACCESS EXCLUSIVE ON clara.journal_entries, NAMED HERE BECAUSE IT IS THE
-- LONGEST LOCK IN THE FILE. Four statements do it:
--   * alter table clara.journal_entries drop constraint ck_je_coding_kind
--   * alter table clara.journal_entries add constraint ck_je_coding_kind ...  (full scan)
--   * alter table clara.journal_entries add constraint ck_je_settlement_not_rule_checked ...
--     (full scan -- section B layer 1)
--   * the two create constraint trigger statements for the settlement shape floors
-- Each blocks every read AND write of journal_entries for its duration. On the live corpus
-- the table is small and the scans are milliseconds, but the quiesce is what makes that
-- statement safe rather than lucky. Deploy through the repo's quiesced-apply ceremony, never
-- a bare migrate against a live target.
--
-- THE MANDATORY DRY-RUN PRECHECK (WCA-R9a). Before the ceremony starts, run
-- packages/db/scripts/subledger-dryrun.sql against live with
--     python ~/.clara-tools/live_psql_file.py packages/db/scripts/subledger-dryrun.sql
-- for the whole estate (the script is estate-wide: it groups by client and needs no
-- per-firm invocation). THE RUNNER IS live_psql_file.py, NOT live_ro.py, and the reason is
-- stated rather than assumed: live_ro.py runs psql with -c (ONE statement string) and cannot
-- run a file at all, and there is NO read-only database role in this estate -- both helpers
-- open the same owner DSN. The read-only property of this precheck is therefore enforced BY
-- THE SCRIPT (it opens `begin transaction read only` and ends with `rollback`), not by the
-- credential. The script does execute clara._canonical_counterparty, which is SECURITY
-- DEFINER and RAISES CLR23 on a broken merge chain -- a hard error there is a real finding
-- about the corpus, not a script bug, and with ON_ERROR_STOP set it aborts the run.
-- It inlines this migration's classifier logic (it cannot reference 0037 objects -- they do
-- not exist yet) and reports the per-client-per-domain tie diff plus the structural probes,
-- ending in ONE machine-checkable GO / NO-GO row. GO = the ceremony may start; ANYTHING
-- ELSE = THE CEREMONY DOES NOT START. That is how WC-R11's "new money-movement code must not
-- first execute against real books" survives a single shared database.
--
-- =====================================================================================
-- MIGRATION NUMBER. Named 0037 provisionally against a live frontier of 0036 (35
-- migrations). Numbers are claimed at MERGE time against the then-current frontier; CI's
-- deploy-onto-existing frontier check enforces it. The tail's content-dependency pin names
-- 0035_drafting_trio -- the deepest TRUE dependency across the five bodies (0035 recut
-- _approve_entry_core; the other four last changed at 0017 or 0027, which the runner's
-- ordering guarantees are in place if 0035 is). 0036 touches none of the five.
-- =====================================================================================
--
-- ORDER OF SECTIONS AS THEY APPEAR IN THIS FILE, because it is dependency order rather than
-- alphabetical order and a reader should not have to discover that: SECTION 0 (the pre-DDL
-- live probes) -> A.1/A.2/A.3 (the taxonomy widening, the autopost CHECK, the two settlement
-- floors) -> D (the two tables) -> E (the classifier, the hook, the preview, two internals)
-- -> F (the two belts) -> J (the backfill -- it needs the classifier AND both tables, and it
-- runs before the writer surgery so a failure costs no recut) -> H.1-H.4 (the four approve
-- paths) -> I (the sweep guard) -> K (the four composites) -> L (ACLs) -> M (the event
-- taxonomy) -> TAIL PART 1 and PART 2. The letters match the narrative sections A, B and C
-- above: B's belt is implemented across A.2 and H.1, and C's hook across E and H.1-H.4.
--
-- CELLS -- THE AS-BUILT MANIFEST. This list is the BUILT cell roster of
-- packages/db/tests/x37-wave-c-a-subledger.test.mjs, in file order, and it is kept in sync
-- with that file's own header. (The v1 manifest that stood here described a DIFFERENT,
-- planned lettering and claimed a section-4.10 sweep-guard cell that did not exist -- a
-- manifest that names cells nobody wrote is worse than no manifest, because the next reader
-- takes coverage on trust. The sweep-guard cell is x37.af below, built.)
--   x37.a  the identity holds FROM ZERO (a fresh client, both domains)
--   x37.b  the RM100 three ways: company card / employee claim / director-paid -- none of
--          the three may mint a domain='ap' item (WC-R10)
--   x37.c  a typed supplier_bill mints exactly ONE ap `bill` item; ties
--   x37.d  partial settlement (allocate_receipt) + the typed events
--   x37.e  a batch receipt clearing N open AR items in one group
--   x37.f  over-payment: the residue IS the settlement item's outstanding
--   x37.g  credit application via apply_open_items -- ZERO GL movement
--   x37.h  unallocate -> re-allocate (exact-negation pairs, no double-undo)
--   x37.i  the two-sided bound, BOTH directions (over-allocation AND inflation)
--   x37.j  group law refusals: cross-counterparty + non-zero net per domain
--   x37.k  the concurrent races (two sessions, blocking PROVEN): allocate vs allocate, and
--          reverse vs allocate (the client advisory rung)
--   x37.l  the reversal matrix (clean unwind / settled refused / receipt refused / a
--          high-stakes draft mirror approved later fires the hook / a revise of a mirror is
--          refused reversal_mirror_not_revisable / an allocation against a reversed entry's
--          item is refused allocation_target_reversed and the unwind applies instead)
--   x37.m  wrong-client correction of an open-itemed bill -> mirror unwind, ties
--   x37.n  the WCA-R9b named refusals (counterparty kind; cross-domain contra)
--   x37.o  the credit-note wall on allocate_payment + its approve-time re-derivation
--   x37.p  the A+ belt: a rule-stamped settlement row violates the CHECK
--   x37.q  the A+ core refusal, named: settlement_not_autopostable
--   x37.r  no draft verb can make a settlement kind (WCA-R6/R7)
--   x37.s  authority catalog: composites authenticated-ONLY; cores ungranted; zero wake
--          allowlist entries; the section-4.9 lock-order acquisition-sequence pins, off
--          prosrc, for all four composites and both patched verbs
--   x37.t  approve_entry passes NO checked_via_rule_id; execute_rule_post stays login-direct
--   x37.u  the high-stakes threshold: draft -> a DISTINCT checker approves -> ties, plus the
--          FIVE staleness axes that refuse CLR10 allocation_stale at the checker's approve
--          (counterparty / settlement_item_count / settlement_amount / outstanding /
--          proposal_unpinned)
--   x37.v  the solo-firm high-stakes variant (attestation)
--   x37.w  the WCA-R8 EVIDENCE PIN (three employee claims still breed a vendor_account
--          proposal -- the debt's live witness, not a fix)
--   x37.x  CLR26: an open client-scope question blocks money movement too (settlements
--          inherit 0035:290-296). Intended, named, and pinned.
--   x37.y  outbox law: a composite that fails AFTER its entry insert (the CLR26 block, inside
--          the core) leaves ZERO events/items/allocations/entries
--   x37.y2 input validation: a duplicated item in one allocation set, refused by name BEFORE
--          any write (the cell x37.y used to be, retitled honestly)
--   x37.z  decomposition correctness: a multi-counterparty generic JV and an opening entry,
--          classifier output vs materialised rows
--   x37.aa the structural belt: grain uniqueness (the backfill's idempotency), append-only,
--          force-RLS, the item_kind matrix, the allocation surface
--   x37.ab allocate_payment end-to-end (the AP mirror) with a discount received
--   x37.ac the SIX settlement-floor CLR23 refusals, one named reason each, plus the
--          deferred-trigger proof that the floor really fires at commit
--   x37.ad belt-1 REFUSES a raw-approved control entry with no item
--          (subledger_entry_untied) -- the belt's positive half is every other cell
--   x37.ae a REAL sales_credit_note end to end: the classifier's ladder-3 branch and the kind
--          matrix's negative sign on a live AR lane
--   x37.af the section-4.10 sweep force-complete guard: a recovered run completes the DRAFTED
--          task and leaves the non-drafted running task alone (both directions)
--   x37.ag the composites refuse a control-class discount account (both domains)
-- The four adapted fixtures stay green (x36-vendor-binding-helpers.mjs:154-157,
-- x31-autopost-lane-unify.test.mjs:264-267, a21-watch.test.mjs:358-360,
-- x35-drafting-trio.test.mjs:244 -- each adapted to a non-control shape or to matching
-- items; NO bypass GUC exists and none will). The from-zero upgrade drill against a real
-- pre-0037 book lives in its own reset-gated file beside the other four house drills.

-- =====================================================================================
-- SECTION 0 -- THE PRE-DDL LIVE PROBES (design section 4.4).
--
-- These run BEFORE any DDL, so a corpus that cannot satisfy the subledger's structural laws
-- aborts the migration with a REMEDY rather than dying half-way through the backfill on a
-- trigger error nobody can read. They are the in-migration twin of the dry-run precheck's
-- probes, and they are deliberately written in plain SQL over the base tables (the
-- classifier does not exist yet) so the two can be diffed by eye.
--
-- Remediation, if any probe hits, happens through SANCTIONED VERBS before 0037 is applied --
-- never a hand UPDATE. That is why each message names the verb rather than the table.
-- =====================================================================================
do $probe$
declare
  v_null_cp int; v_kind_bad int; v_cross int; v_mirror_bad int; v_matrix_bad int;
begin
  -- PROBE 1 -- every control-class line on an approved entry must carry a counterparty.
  -- A control leg with no counterparty contributes to the GL control balance but can produce
  -- NO item, so it breaks the identity outright. _assert_supplier_bill_shape_at's FIRST,
  -- UNCONDITIONAL check already demands this of every entry it sees, so a hit here means a
  -- row that predates that check or reached the books outside it.
  select count(*)::int into v_null_cp
  from clara.journal_entries e
  join clara.journal_lines l on l.entry_id=e.id
  join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
  where e.status='approved' and a.account_class in ('payable','receivable')
    and l.counterparty_id is null;
  if v_null_cp <> 0 then
    raise exception '0037 probe 1: % approved control-class journal line(s) carry no counterparty -- the open-item identity cannot hold. Remediate through the sanctioned verbs (reverse and re-code the affected entries) before applying 0037', v_null_cp;
  end if;

  -- PROBE 2 -- no kind-contradicting stamp. A receivable-class leg must carry a
  -- 'customer'-kind counterparty and a payable-class leg a 'vendor'. Canonicalised first:
  -- merges do not repoint history, so the stamped id may be a merged-away row.
  select count(*)::int into v_kind_bad
  from clara.journal_entries e
  join clara.journal_lines l on l.entry_id=e.id
  join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
  join clara.counterparties cp
    on cp.id=clara._canonical_counterparty(e.client_id,l.counterparty_id)
  where e.status='approved' and a.account_class in ('payable','receivable')
    and ((a.account_class='receivable' and cp.kind<>'customer')
      or (a.account_class='payable'    and cp.kind<>'vendor'));
  if v_kind_bad <> 0 then
    raise exception '0037 probe 2: % approved control-class line(s) carry a counterparty whose kind contradicts the account class (receivable demands customer, payable demands vendor) -- rebind through clara.create_counterparty / the draft proposal kind before applying 0037', v_kind_bad;
  end if;

  -- PROBE 3 -- no approved entry has control nets in BOTH domains. Such an entry is a
  -- cross-domain contra: a real GL event that must ride a clearing account, one entry per
  -- domain. After 0037 it refuses at approve; a pre-existing one would decompose into two
  -- domains and is an owner decision, not an engineering one.
  --
  -- COUNTED ON NETS, NOT ON LEGS. The runtime refusal this probe is the twin of counts
  -- `count(distinct cl.domain)` over CLASSIFIER output, and the classifier DROPS zero nets.
  -- A leg-counting probe therefore refuses to apply on a corpus the running system would
  -- happily accept -- an entry carrying a receivable leg pair that nets to zero has one
  -- domain, not two. The two must state the same law or the probe is not a probe.
  select count(*)::int into v_cross from (
    select z2.id from (
      select e.id,
             case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
             sum(case when a.account_class='receivable'
                      then l.debit_cents-l.credit_cents
                      else l.credit_cents-l.debit_cents end)::bigint as amt
      from clara.journal_entries e
      join clara.journal_lines l on l.entry_id=e.id
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where e.status='approved' and a.account_class in ('payable','receivable')
      group by 1,2
    ) z2
    where z2.amt <> 0
    group by z2.id
    having count(distinct z2.dom)>1
  ) z;
  if v_cross <> 0 then
    raise exception '0037 probe 3: % approved entry(ies) carry control nets in BOTH the receivable and payable domains -- split them via a clearing account, one entry per domain, before applying 0037', v_cross;
  end if;

  -- PROBE 4 -- THE MIRROR LEMMA. The classifier's path 1 negates the ORIGINAL's items; the
  -- backfill and the dry-run both rely on that being identical to the MIRROR's own control
  -- nets (reverse_entry and approve_wrong_client_correction copy journal_lines verbatim with
  -- the sides swapped). If any approved reversal mirror's own per-(domain, counterparty)
  -- nets are not the exact negation of its original's, the lemma is false for this corpus
  -- and the tie assert below would be arguing from an assumption instead of a fact.
  select count(*)::int into v_mirror_bad from (
    with mirror_nets as (
      select m.id as mid,
             case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
             clara._canonical_counterparty(m.client_id,l.counterparty_id) as cp,
             sum(case when a.account_class='receivable'
                      then l.debit_cents-l.credit_cents
                      else l.credit_cents-l.debit_cents end)::bigint as amt
      from clara.journal_entries m
      join clara.journal_entries o on o.id=m.reversal_of and o.status='approved'
      join clara.journal_lines l on l.entry_id=m.id
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where m.status='approved' and a.account_class in ('payable','receivable')
      group by 1,2,3
    ), orig_nets as (
      select m.id as mid,
             case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
             clara._canonical_counterparty(o.client_id,l.counterparty_id) as cp,
             sum(case when a.account_class='receivable'
                      then l.debit_cents-l.credit_cents
                      else l.credit_cents-l.debit_cents end)::bigint as amt
      from clara.journal_entries m
      join clara.journal_entries o on o.id=m.reversal_of and o.status='approved'
      join clara.journal_lines l on l.entry_id=o.id
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where m.status='approved' and a.account_class in ('payable','receivable')
      group by 1,2,3
    )
    select 1 from mirror_nets mn
    full outer join orig_nets onn
      on onn.mid=mn.mid and onn.dom=mn.dom and onn.cp=mn.cp
    where coalesce(mn.amt,0) is distinct from -coalesce(onn.amt,0)
  ) z;
  if v_mirror_bad <> 0 then
    raise exception '0037 probe 4: % approved reversal mirror(s) are not the exact per-(domain,counterparty) negation of their original -- the unwind lemma the backfill tie relies on does not hold for this corpus', v_mirror_bad;
  end if;

  -- PROBE 5 -- THE KIND-MATRIX SIGN LAW, on the live book, BEFORE ck_open_items_kind_matrix
  -- exists to enforce it. The matrix says a 'bill' is a POSITIVE ap claim, an 'invoice' a
  -- POSITIVE ar claim and a 'credit_note' a NEGATIVE ar claim. Nothing in the pre-0037 schema
  -- says so: account_class is a per-client CHART property that can be reclassified with
  -- add_coa_account / the chart verbs, and a typed entry whose control net came out on the
  -- wrong side (a supplier_bill whose payable net is negative -- e.g. a supplier credit
  -- mis-coded AS a bill, the very trap section 4.9's credit-note wall names) would decompose
  -- into a row the backfill INSERT cannot write. Without this probe that lands as a raw CHECK
  -- violation in the middle of section J with no remedy attached.
  --
  -- Only the three typed anchors are testable here: the settlement kinds cannot exist yet
  -- (section A.1 widens the CHECK below this block), and opening / reversal_unwind /
  -- adjustment admit EITHER sign by design.
  select count(*)::int into v_matrix_bad from (
    select e.id as eid,
           case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
           clara._canonical_counterparty(e.client_id,l.counterparty_id) as cp,
           case e.coding_kind when 'supplier_bill' then 'bill'
                              when 'sales_invoice' then 'invoice'
                              else 'credit_note' end as k,
           sum(case when a.account_class='receivable'
                    then l.debit_cents-l.credit_cents
                    else l.credit_cents-l.debit_cents end)::bigint as amt
    from clara.journal_entries e
    join clara.journal_lines l on l.entry_id=e.id
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where e.status='approved' and a.account_class in ('payable','receivable')
      and e.reversal_of is null and not e.is_opening_balance
      and e.coding_kind in ('supplier_bill','sales_invoice','sales_credit_note')
    group by 1,2,3,4
  ) z
  where z.amt <> 0
    and not ((z.k='bill'        and z.dom='ap' and z.amt > 0)
          or (z.k='invoice'     and z.dom='ar' and z.amt > 0)
          or (z.k='credit_note' and z.dom='ar' and z.amt < 0));
  if v_matrix_bad <> 0 then
    raise exception '0037 probe 5: % classified (kind, domain, sign) triple(s) contradict the open-item kind matrix (a bill must be a positive payable net, an invoice a positive receivable net, a credit note a negative receivable net) -- reverse and re-code the affected entries through the sanctioned verbs, or correct the account_class of the control account they touch, before applying 0037', v_matrix_bad;
  end if;

  raise notice '0037 probe OK (0/5): no counterparty-less control line, no kind contradiction, no cross-domain control NET, every approved reversal mirror is an exact negation, and every typed entry decomposes on the kind matrix''s side';
end
$probe$;

set role clara_fn_owner;

-- =====================================================================
-- SECTION A.1 -- ck_je_coding_kind widening (WC-R9). The 0015 drop/re-add idiom: the
-- constraint is EXPLICITLY named (0009:853, re-added 0015:218), so the drop is by name and
-- name-robust rather than by definition. Purely additive -- nothing is renamed or removed,
-- and cash_purchase / cash_sale / supplier_credit_note stay future-additive exactly as
-- WC-R9 ruled.
--
-- ACCESS EXCLUSIVE: the add re-scans clara.journal_entries. Named in the D1 note above.
-- =====================================================================
alter table clara.journal_entries drop constraint ck_je_coding_kind;
alter table clara.journal_entries add constraint ck_je_coding_kind check (
  coding_kind is null or coding_kind in
    ('supplier_bill','sales_invoice','sales_credit_note',
     'customer_receipt','supplier_payment'));

-- =====================================================================
-- SECTION A.2 -- ck_je_settlement_not_rule_checked (section B layer 1). The DURABLE,
-- caller-independent half of the A+ autopost belt: a settlement-kind entry may never carry
-- checked_via_rule_id, whatever writer built it. NULL-safe in both directions -- a NULL
-- coding_kind satisfies the first disjunct, a NULL rule id the third -- so it is inert for
-- every row that exists today and for every non-settlement row that ever will.
--
-- ck_je_flags_shape (0009:852) was checked and needs NO widening: its whole definition is
-- jsonb_typeof(flags) = 'object', so the composites' settlement_allocation proposal key
-- satisfies it unchanged. The tail asserts that constraint is still exactly that, so a
-- future reader can see the check was made rather than assumed.
--
-- ACCESS EXCLUSIVE: full table scan. Named in the D1 note above.
-- =====================================================================
alter table clara.journal_entries add constraint ck_je_settlement_not_rule_checked check (
  coding_kind is null
  or coding_kind not in ('customer_receipt','supplier_payment')
  or checked_via_rule_id is null);

-- =====================================================================
-- SECTION A.3 -- THE TWO SETTLEMENT SHAPE FLOORS.
--
-- Written in the SALES shape (fact-first, explicit NULL guard, full early return on a
-- reversal mirror) rather than the purchase shape, for the reason 0036 section A gave from
-- the other direction: a leg-driven floor asks its question only once a leg is already
-- there, and the corner it never asks about is the one that bites.
--
-- THE customer_receipt FLOOR, clause by clause:
--   * EXACTLY ONE receivable-class control leg, on the CREDIT side. One, because a receipt
--     settles one counterparty's position and the item grain is per counterparty per domain;
--     CREDIT, because money coming in REDUCES what the customer owes.
--   * ZERO income-class legs. THIS IS THE F3-3 FORECLOSURE and the single most important
--     line in the section. The Gate-1 defect auto-posted a bank receipt as
--     Dr Bank / Cr Revenue, recognising the income a second time on top of the invoice that
--     had already recognised it. Under this floor that entry cannot be a customer_receipt at
--     all -- it has to be coded as what it actually is.
--   * ZERO payable-class legs. A receipt that also touches AP is a cross-domain contra; it
--     rides a clearing account, one entry per domain (the same law the classifier's
--     cross_domain_control_entry refusal states).
--   * discount-expense legs are fine -- a settlement discount given to a customer is an
--     expense, and it is the reason the control credit is amount+discount while the bank
--     debit is only amount.
-- THE supplier_payment FLOOR is the exact mirror: exactly one payable-class control leg on
-- the DEBIT side; zero expense legs (the AP analogue of the income foreclosure -- a payment
-- that also books an expense is a cash purchase, which WC-R9 deliberately defers); zero
-- receivable legs; discount-INCOME legs fine.
--
-- Both refuse CLR23 with a named detail reason. CLR23 is the leg-SHAPE family in this
-- schema (0016's supplier floor uses it for every shape refusal and reserves CLR21 for the
-- two refusals that compare the entry against the DOCUMENT's stated facts). These floors
-- compare nothing to a document -- settlements have no facts lane -- so CLR23 it is.
--
-- The p_extraction parameter is carried for SIGNATURE SYMMETRY with the two existing _at
-- floors and is deliberately unused: a settlement is never bound to an invoice extraction,
-- and giving these floors a different arity would make the four-floor family harder to
-- reason about than one unused parameter does.
-- =====================================================================
create function clara._assert_customer_receipt_shape_at(p_entry uuid, p_extraction uuid)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_ctrl_correct int; v_ctrl_total int; v_income int; v_payable int;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  -- Act ONLY on customer receipts. NB coding_kind <> 'customer_receipt' is NULL (not
  -- true) when coding_kind is NULL, so the explicit NULL guard is required -- without it
  -- the floor would silently never run. The reversal early-return is total: a mirror copies
  -- its original's legs with the sides swapped, so a direction floor would refuse every one
  -- of them; the unwind is keyed on reversal_of instead (design section 4.5).
  if e.coding_kind is null or e.coding_kind <> 'customer_receipt'
     or e.reversal_of is not null then
    return;
  end if;
  select
    count(*) filter (where a.account_class='receivable' and l.credit_cents>0),
    count(*) filter (where a.account_class='receivable'),
    count(*) filter (where a.account_type='income'),
    count(*) filter (where a.account_class='payable')
    into v_ctrl_correct, v_ctrl_total, v_income, v_payable
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_correct <> 1 or v_ctrl_total <> 1 then
    raise exception 'a customer receipt requires exactly one receivable control leg, on the credit side'
      using errcode='CLR23',detail='{"reason":"receipt_control_shape"}';
  end if;
  if v_income <> 0 then
    raise exception 'a customer receipt admits no income leg (the invoice already recognised it)'
      using errcode='CLR23',detail='{"reason":"receipt_income_leg"}';
  end if;
  if v_payable <> 0 then
    raise exception 'a customer receipt admits no payable-class leg; split a cross-domain contra via a clearing account'
      using errcode='CLR23',detail='{"reason":"receipt_payable_leg"}';
  end if;
end $$;

create function clara._assert_supplier_payment_shape_at(p_entry uuid, p_extraction uuid)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_ctrl_correct int; v_ctrl_total int; v_expense int; v_recv int;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  if e.coding_kind is null or e.coding_kind <> 'supplier_payment'
     or e.reversal_of is not null then
    return;
  end if;
  select
    count(*) filter (where a.account_class='payable' and l.debit_cents>0),
    count(*) filter (where a.account_class='payable'),
    count(*) filter (where a.account_type='expense'),
    count(*) filter (where a.account_class='receivable')
    into v_ctrl_correct, v_ctrl_total, v_expense, v_recv
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_correct <> 1 or v_ctrl_total <> 1 then
    raise exception 'a supplier payment requires exactly one payable control leg, on the debit side'
      using errcode='CLR23',detail='{"reason":"payment_control_shape"}';
  end if;
  if v_expense <> 0 then
    raise exception 'a supplier payment admits no expense leg (a counter purchase is not a settlement)'
      using errcode='CLR23',detail='{"reason":"payment_expense_leg"}';
  end if;
  if v_recv <> 0 then
    raise exception 'a supplier payment admits no receivable-class leg; split a cross-domain contra via a clearing account'
      using errcode='CLR23',detail='{"reason":"payment_receivable_leg"}';
  end if;
end $$;

-- The thin wrappers, exactly the 0016:3957 idiom: a 1-arity entry point pinning the
-- extraction to null, so the deferred trigger twins and any future caller that has no
-- extraction in hand call one name rather than passing a literal null.
create function clara._assert_customer_receipt_shape(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._assert_customer_receipt_shape_at(p_entry, null);
end $$;

create function clara._assert_supplier_payment_shape(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._assert_supplier_payment_shape_at(p_entry, null);
end $$;

create function clara._tf_assert_customer_receipt_shape() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._assert_customer_receipt_shape(new.id);
  return null;
end $$;

create function clara._tf_assert_supplier_payment_shape() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform clara._assert_supplier_payment_shape(new.id);
  return null;
end $$;

-- AFTER INSERT OR UPDATE (both review lanes): an INSERT that lands a row already approved
-- must be caught too, and the 0009/0015 AFTER-UPDATE-only form structurally cannot see it.
-- The WHEN clause is new.status='approved' ALONE because OLD cannot be referenced in a
-- trigger that fires on INSERT -- so the ancestors' transition guard is unavailable and the
-- floors also re-run on the reversal-linkage UPDATE of an approved row. Both floors are pure
-- reads of the entry, so that re-run is idempotent.
--
-- ACCESS EXCLUSIVE on clara.journal_entries for each create. Named in the D1 note.
create constraint trigger t_je_customer_receipt_shape
  after insert or update on clara.journal_entries
  deferrable initially deferred
  for each row when (new.status = 'approved')
  execute function clara._tf_assert_customer_receipt_shape();

create constraint trigger t_je_supplier_payment_shape
  after insert or update on clara.journal_entries
  deferrable initially deferred
  for each row when (new.status = 'approved')
  execute function clara._tf_assert_supplier_payment_shape();

-- =====================================================================
-- SECTION D -- THE TWO TABLES (design section 4.2).
--
-- clara.open_items -- ONE table with a `domain` discriminator, not two (WCA-R1). Amounts are
-- SIGNED, and item_kind carries the sign law rather than a separate `origin` column: v1's
-- origin could not express "an opening item may be either sign because the K6 pure-reversal
-- writes negative ar/ap amounts directly" (0017:4127-4135) while still forbidding a negative
-- bill. The CHECK matrix below does exactly that.
--
-- THE GRAIN IS (entry_id, domain, counterparty_id), review-corrected from v1's per-entry
-- grain. Typed kinds do NOT structurally have exactly one control leg:
-- _assert_supplier_bill_shape_at admits several payable-class credit legs (0036:646-661) and
-- only the sales floor enforces exactly one (0022:789-802). Several payable legs for the
-- same counterparty net into ONE item; two counterparties on one entry produce TWO.
--
-- CONGRUENCE FKs use the triple-key house pattern (0009:797 idiom): every foreign key
-- carries firm_id and client_id, so a row can never point across a tenant boundary even if
-- an id were guessed. The self-FK for reversal_unwind_of additionally carries `domain`,
-- which is why the anchor unique is (id, firm_id, client_id, domain) rather than the usual
-- triple -- an AR item can never claim an AP item as its unwind origin.
--
-- COUNTERPARTY IS STORED CANONICAL-AT-WRITE (_canonical_counterparty). READS MUST STILL
-- CANONICALISE: merges do not repoint history, exactly as they do not for journal_lines. Both
-- halves are stated because neither is optional -- writing canonical stops NEW divergence,
-- canonicalising on read is what makes a merge performed AFTER the item was written still
-- resolve to one party.
--
-- item_date defaults to the entry's posting_date at write. An unwind item therefore lands in
-- the CURRENT bucket rather than the original's -- deliberate: the reversal is a current-period
-- event and aging (C-c) must show it there.
--
-- due_date ships as a nullable column with NO PRODUCER. The fact allowlist is closed
-- (0026:743-752) and no verb takes one, so C-c owes the producer; this design makes no
-- forward-compatibility promise beyond the column existing.
--
-- clara.open_item_allocations -- balanced pairs. There is deliberately NO entry_id: the
-- identity never needed one (items carry the entry anchor) and the pair's settlement side IS
-- the settlement entry's own item. application_group plus the audit rows carry operator
-- provenance.
-- =====================================================================
create table clara.open_items (
  id                   uuid        primary key default gen_random_uuid(),
  firm_id              uuid        not null,
  client_id            uuid        not null,
  domain               text        not null check (domain in ('ar','ap')),
  counterparty_id      uuid        not null,
  entry_id             uuid        not null,
  item_kind            text        not null check (item_kind in
                         ('invoice','credit_note','bill','settlement',
                          'adjustment','opening','reversal_unwind')),
  opening_item_id      uuid,
  reversal_unwind_of   uuid,
  item_date            date        not null,
  due_date             date,
  amount_cents         bigint      not null check (amount_cents <> 0),
  created_in_migration boolean     not null default false,
  created_by           uuid        not null references clara.users(id),
  created_at           timestamptz not null default now(),
  -- THE GRAIN. Also the idempotency key: the hook and the backfill both write
  -- `on conflict on constraint uq_open_items_grain do nothing`, so a re-approve that could
  -- never happen and a re-run of the backfill that can are both no-ops.
  constraint uq_open_items_grain unique (entry_id, domain, counterparty_id),
  -- The self-FK anchor. Carries `domain` so an unwind can never cross domains.
  constraint uq_open_items_id_firm_client_domain unique (id, firm_id, client_id, domain),
  constraint fk_open_items_entry foreign key (entry_id, firm_id, client_id)
    references clara.journal_entries(id, firm_id, client_id),
  constraint fk_open_items_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint fk_open_items_unwind
    foreign key (reversal_unwind_of, firm_id, client_id, domain)
    references clara.open_items(id, firm_id, client_id, domain),
  constraint fk_open_items_opening foreign key (opening_item_id, firm_id, client_id)
    references clara.opening_items(id, firm_id, client_id),
  -- THE SIGN LAW. invoice/bill are positive claims, credit_note is a negative AR claim, a
  -- settlement is always negative (it is -gross by construction). adjustment / opening /
  -- reversal_unwind admit EITHER sign, each for a stated reason: a generic control entry can
  -- go either way; opening items are bimodal AND the K6 pure-reversal writes negatives
  -- directly; an unwind is the exact negation of whatever it unwinds.
  constraint ck_open_items_kind_matrix check (
    (item_kind='invoice'     and domain='ar' and amount_cents > 0)
    or (item_kind='credit_note' and domain='ar' and amount_cents < 0)
    or (item_kind='bill'        and domain='ap' and amount_cents > 0)
    or (item_kind='settlement'  and amount_cents < 0)
    or item_kind in ('adjustment','opening','reversal_unwind')),
  -- Lineage pairing. An unwind ALWAYS has an origin (path 1 negates rows that exist), so the
  -- pairing is an iff. An opening item MAY have no opening_items row -- K6 replacement
  -- mirrors have none -- so that pairing is one-way only.
  constraint ck_open_items_unwind_pairing check (
    (item_kind='reversal_unwind') = (reversal_unwind_of is not null)),
  constraint ck_open_items_opening_pairing check (
    opening_item_id is null or item_kind='opening'),
  constraint ck_open_items_no_self_link check (reversal_unwind_of is distinct from id)
);
create index ix_open_items_client_domain on clara.open_items(client_id, domain, item_date);
create index ix_open_items_counterparty on clara.open_items(client_id, domain, counterparty_id);
create index ix_open_items_entry on clara.open_items(entry_id);

create table clara.open_item_allocations (
  id                     uuid        primary key default gen_random_uuid(),
  firm_id                uuid        not null,
  client_id              uuid        not null,
  domain                 text        not null check (domain in ('ar','ap')),
  item_id                uuid        not null,
  application_group      uuid        not null,
  operation_kind         text        not null check (operation_kind in
                           ('allocate','unallocate','apply')),
  reverses_allocation_id uuid,
  amount_cents           bigint      not null check (amount_cents <> 0),
  reason                 text,
  created_by             uuid        not null references clara.users(id),
  created_at             timestamptz not null default now(),
  constraint uq_oia_id_firm_client_domain unique (id, firm_id, client_id, domain),
  -- The item FK carries `domain` too, so an allocation can never be filed against an item in
  -- the other domain -- which is half of "an application_group nets to zero PER DOMAIN".
  constraint fk_oia_item foreign key (item_id, firm_id, client_id, domain)
    references clara.open_items(id, firm_id, client_id, domain),
  constraint fk_oia_reverses
    foreign key (reverses_allocation_id, firm_id, client_id, domain)
    references clara.open_item_allocations(id, firm_id, client_id, domain),
  -- An unallocation is EXACTLY a negation of one prior allocation row, and nothing else is.
  constraint ck_oia_unallocate_pairing check (
    (operation_kind='unallocate') = (reverses_allocation_id is not null)),
  constraint ck_oia_no_self_link check (reverses_allocation_id is distinct from id),
  -- unallocate and apply are HUMAN judgements about existing positions; both owe a reason.
  -- allocate carries the settlement entry's memo and its own audit row instead.
  constraint ck_oia_reason check (
    operation_kind='allocate' or nullif(btrim(reason),'') is not null)
);
-- NO DOUBLE-UNDO: one allocation row can be reversed at most once, ever.
create unique index uq_oia_reverses_once
  on clara.open_item_allocations(reverses_allocation_id)
  where reverses_allocation_id is not null;
create index ix_oia_item on clara.open_item_allocations(item_id);
create index ix_oia_group on clara.open_item_allocations(application_group);

-- Append-only / no-truncate posture (0011:1073-1077 idiom). Both tables are pure history:
-- an item is written once by the classifier and an allocation is undone by writing its
-- negation, never by deleting it.
create trigger t_open_items_append_only before update or delete
  on clara.open_items for each row execute function clara._tf_append_only();
create trigger t_open_items_no_truncate before truncate
  on clara.open_items for each statement execute function clara._tf_no_truncate();
create trigger t_open_item_allocations_append_only before update or delete
  on clara.open_item_allocations for each row execute function clara._tf_append_only();
create trigger t_open_item_allocations_no_truncate before truncate
  on clara.open_item_allocations for each statement execute function clara._tf_no_truncate();

-- FORCE row level security + the owner policy + a firm-scoped human read. There is
-- deliberately NO clara_agent_ro policy and NO wake-role grant of any kind: the subledger is
-- money-movement state, the agent reaches books figures only through the context pack, and
-- WCA-R1's "zero wake-role grants" is asserted in the tail rather than left to convention.
-- clara_runtime gets no policy either -- every runtime path into this data goes through a
-- SECURITY DEFINER verb owned by clara_fn_owner.
alter table clara.open_items enable row level security;
alter table clara.open_items force row level security;
alter table clara.open_item_allocations enable row level security;
alter table clara.open_item_allocations force row level security;
create policy p_open_items_owner on clara.open_items
  for all to clara_fn_owner using (true) with check (true);
create policy p_open_item_allocations_owner on clara.open_item_allocations
  for all to clara_fn_owner using (true) with check (true);
create policy p_open_items_human on clara.open_items
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
create policy p_open_item_allocations_human on clara.open_item_allocations
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.open_items, clara.open_item_allocations to clara_authenticated;

-- =====================================================================
-- SECTION E -- THE CLASSIFIER, THE HOOK, THE PREVIEW, AND TWO SMALL INTERNALS.
--
-- All five are definer-internal and granted to NOBODY (the "one ungranted _core +
-- grant-scoped entry points" law): every caller is itself a SECURITY DEFINER function owned
-- by clara_fn_owner, which holds EXECUTE implicitly as owner. 0009 already set
-- `alter default privileges for role clara_fn_owner in schema clara revoke execute on
-- functions from public`; each still carries its own explicit revoke as belt-and-braces (the
-- _coding_lane_core idiom), and the tail asserts they stay ungranted.
--
-- TWO OF THE FIVE ARE ADDITIONS TO THE DESIGN'S NAMED TRIO, and both are reported rather
-- than smuggled: _subledger_outstanding (the derived outstanding of one item -- computed
-- identically in five places otherwise, and a duplicated formula is exactly how a subledger
-- drifts from itself) and _subledger_allocated_items_present (the reverse refusal's
-- predicate -- extracted so the two CHANGE-OF-RECORD PATCHES into reverse_entry and
-- approve_wrong_client_correction stay one line each, which is what makes their anchors
-- readable and their drift probes exact).
-- =====================================================================

-- outstanding(item) = amount + SUM(its allocations). DERIVED, NEVER STORED -- design
-- section 3. Null for an unknown item, which every caller treats as "refuse", never as zero.
create function clara._subledger_outstanding(p_item uuid) returns bigint
  language sql stable security definer set search_path = clara, pg_temp as $$
  select i.amount_cents
       + coalesce((select sum(a.amount_cents) from clara.open_item_allocations a
                   where a.item_id = i.id), 0)
  from clara.open_items i where i.id = p_item;
$$;
revoke all on function clara._subledger_outstanding(uuid) from public;

-- TRUE when any item of this entry carries a non-zero NET allocation. The reverse refusal's
-- predicate (design section 4.5): an allocated invoice is not reversible in one step
-- anywhere in professional practice, and refusing here is what keeps the unwind trivially
-- TOTAL -- unwind items are exact negations, so there is no stranded allocation and no
-- phantom outstanding to reconcile afterwards.
create function clara._subledger_allocated_items_present(p_entry uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select exists (
    select 1 from clara.open_items i
    where i.entry_id = p_entry
      and coalesce((select sum(a.amount_cents) from clara.open_item_allocations a
                    where a.item_id = i.id), 0) <> 0);
$$;
revoke all on function clara._subledger_allocated_items_present(uuid) from public;

-- =====================================================================
-- clara._subledger_classify_entry -- THE ONLY DECOMPOSITION LOGIC IN THE SYSTEM.
-- The runtime hook, the backfill, the read-only preview and BOTH belts call this one body.
-- There is deliberately no second implementation to drift.
--
-- It is TOTAL by design: it never raises. The two WCA-R9b refusals live in the hook, so a
-- contradicting entry can still be DECOMPOSED and REPORTED by the preview and the dry-run
-- instead of erroring out an estate-wide scan on one bad row -- the same reasoning 0036's
-- _autodraft_sales_direction applies to a CLR30 direction contradiction.
--
-- The precedence ladder is pinned by a tail assert on normalized prosrc POSITIONS, so a
-- future edit that reorders the branches (which would silently reclassify every opening
-- reversal) fails the deploy rather than shipping.
-- =====================================================================
create function clara._subledger_classify_entry(p_entry uuid)
  returns table(domain text, counterparty_id uuid, item_kind text, amount_cents bigint,
                opening_item_id uuid, reversal_unwind_of uuid)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare e record; v_kind text;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;

  -- LADDER 1 -- REVERSAL. Negate every item of the ORIGINAL. Keyed on reversal_of, never on
  -- a copied coding_kind: reverse_entry deliberately does not copy the kind onto a mirror
  -- (Wave-C contract section 3 trap), and copying it would make a leg-flipped mirror fail the
  -- typed shape floors. The original's status join is not defensive padding -- an opening
  -- entry can be WITHDRAWN after its draft-time opening_items row exists (0017:3463-3471),
  -- so every subledger read in this migration joins status='approved'.
  --
  -- CANONICALISED AND AGGREGATED PER PARTY. The original's items store the counterparty that
  -- was canonical AT WRITE TIME; a merge_counterparties performed afterwards does NOT repoint
  -- history, exactly as it does not for journal_lines. Reading the stored id raw would emit
  -- an unwind row under a merged-away party while every other ladder (and the mirror's own
  -- control legs) speaks the canonical one -- so the belts would refuse the mirror with a
  -- wrong diagnosis and reverse_entry would be permanently wedged for that entry. The
  -- TWO-PARTY COLLAPSE follows from the same law: if the original carried items for A and B
  -- and A was later merged into B, ONE canonical party now owes the whole thing, so the
  -- negation is aggregated per canonical party (min(oi.id) carries the lineage of the
  -- collapsed set) and a set that nets to zero produces no row at all -- the same
  -- zero-net-drop every other ladder applies, and required here because amount_cents <> 0 is
  -- a CHECK.
  if e.reversal_of is not null then
    return query
      select oi.domain,
             clara._canonical_counterparty(e.client_id, oi.counterparty_id) as cp,
             'reversal_unwind'::text,
             (-sum(oi.amount_cents))::bigint,
             null::uuid,
             -- min(uuid) is not an aggregate in PostgreSQL 17; the house idiom for a
             -- deterministic pick is the text cast (0035:196 uses the same form).
             min(oi.id::text)::uuid
      from clara.open_items oi
      join clara.journal_entries orig on orig.id = oi.entry_id
      where oi.entry_id = e.reversal_of and orig.status = 'approved'
      group by 1, 2
      having sum(oi.amount_cents) <> 0
      order by 1, 2;
    return;
  end if;

  -- LADDER 2 -- OPENING. Items come from the control-leg NETS, exactly like every other
  -- path; opening_items supplies LINEAGE ONLY and is never an independent row source. That
  -- is the whole reason the backfill is entries-driven: the GL is the tie target, so
  -- anything that is not derived from journal_lines cannot be tied to it.
  -- opening_item_id is NULLABLE: a K6 replacement mirror gets no opening_items row at all
  -- (0017:4105-4118).
  if e.is_opening_balance then
    return query
      with nets as (
        select case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
               clara._canonical_counterparty(e.client_id, l.counterparty_id) as cp,
               sum(case when a.account_class='receivable'
                        then l.debit_cents - l.credit_cents
                        else l.credit_cents - l.debit_cents end)::bigint as amt
        from clara.journal_lines l
        join clara.coa_accounts a
          on a.client_id = l.client_id and a.account_code = l.account_code
        where l.entry_id = p_entry and a.account_class in ('payable','receivable')
        group by 1, 2
      )
      select n.dom, n.cp, 'opening'::text, n.amt,
        (select oi.id from clara.opening_items oi
          where oi.entry_id = p_entry
            and oi.item_kind = case when n.dom='ar' then 'ar_open_item' else 'ap_open_item' end
            and clara._canonical_counterparty(e.client_id, oi.counterparty_id) = n.cp),
        null::uuid
      from nets n where n.amt <> 0
      order by 1, 2;
    return;
  end if;

  -- LADDER 3, 4 and 5 share ONE control-net query; only the label differs. That is not a
  -- shortcut: it is the reason a settlement item is exactly -gross without a special case.
  -- The composite's entry credits (AR) or debits (AP) the control for amount+discount, so
  -- the signed control net IS -gross by construction, and nothing in this function has to
  -- know what a discount is.
  if e.coding_kind is null then
    v_kind := 'adjustment';                                      -- LADDER 5 (WCA-R2)
  elsif e.coding_kind = 'supplier_bill' then
    v_kind := 'bill';                                            -- LADDER 3
  elsif e.coding_kind = 'sales_invoice' then
    v_kind := 'invoice';                                         -- LADDER 3
  elsif e.coding_kind = 'sales_credit_note' then
    v_kind := 'credit_note';                                     -- LADDER 3
  elsif e.coding_kind in ('customer_receipt','supplier_payment') then
    v_kind := 'settlement';                                      -- LADDER 4
  else
    return;                                                      -- LADDER 6: no rows
  end if;

  -- ZERO NET PER COUNTERPARTY YIELDS NO ITEM. An intra-domain same-party reclass is a real
  -- GL event with no subledger effect, and the identity is per DOMAIN, never per account, so
  -- the tie is unaffected.
  return query
    with nets as (
      select case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
             clara._canonical_counterparty(e.client_id, l.counterparty_id) as cp,
             sum(case when a.account_class='receivable'
                      then l.debit_cents - l.credit_cents
                      else l.credit_cents - l.debit_cents end)::bigint as amt
      from clara.journal_lines l
      join clara.coa_accounts a
        on a.client_id = l.client_id and a.account_code = l.account_code
      where l.entry_id = p_entry and a.account_class in ('payable','receivable')
      group by 1, 2
    )
    select n.dom, n.cp, v_kind, n.amt, null::uuid, null::uuid
    from nets n where n.amt <> 0
    order by 1, 2;
end $$;
revoke all on function clara._subledger_classify_entry(uuid) from public;

-- =====================================================================
-- clara._subledger_on_approve -- the hook, called from ALL FOUR approve paths.
--
-- It does three things, in this order and for stated reasons:
--   (1) THE TWO WCA-R9b REFUSALS, before any write, so a contradicting entry never leaves a
--       half-materialised subledger behind (it could not anyway -- the whole approve is one
--       transaction -- but refusing first is what makes the error message the FIRST thing
--       the human sees rather than a trigger failure at commit).
--   (2) THE ITEMS, one per classified row, idempotent on the grain unique.
--   (3) THE SETTLEMENT ALLOCATION PAIRS, when the entry carries a composite-written
--       settlement_allocation proposal in flags. This is where WCA-R7's maker-checker split
--       is paid for: the SAME code materialises the pairs whether the composite approved in
--       the same call (below the high-stakes threshold) or a distinct checker approved a
--       draft days later, and in BOTH cases outstanding is re-validated at THIS moment.
--       A stale proposal refuses CLR10 allocation_stale and the maker re-runs.
--
-- The events are appended in-txn in a deterministic order and roll back with everything else
-- if the transaction aborts (outbox law).
-- =====================================================================
create function clara._subledger_on_approve(p_entry uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; r record; al record; si record;
  v_actor uuid; v_domains int; v_cp_kind text; v_item uuid;
  v_prop jsonb; v_group uuid; v_settle uuid; v_settle_dom text; v_settle_n int;
  v_out bigint; v_amt bigint; v_total bigint := 0; v_ids uuid[];
  v_exp bigint; v_pairs int := 0; v_prop_sum bigint; v_prop_cp uuid;
  v_doc_kind text; v_rev_by uuid;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  -- An internal-contract violation, not a lane: every call site places this AFTER its own
  -- status flip. Raising rather than returning is the 'unpinned_rule_post' precedent
  -- (0035:163-166) -- a mis-wired fifth path must be loud at its first execution.
  if e.status <> 'approved' then
    raise exception 'the subledger hook was called on a non-approved entry'
      using errcode='CLR10',detail='{"reason":"subledger_hook_not_approved"}';
  end if;
  v_actor := coalesce(e.checker_actor, e.maker_actor);

  -- (1a) CROSS-DOMAIN CONTRA. Applied universally rather than only to generic entries: the
  -- typed floors already forbid the shape, so universality costs them nothing and closes the
  -- generic lane properly. A set-off between a customer and a supplier is a GL event and
  -- must ride a (refused -> split) GL entry -- never an application. That is the
  -- teeming-and-lading wall, stated once, here.
  select count(distinct cl.domain)::int into v_domains
    from clara._subledger_classify_entry(p_entry) cl;
  if v_domains > 1 then
    raise exception 'this entry moves both receivable and payable control balances; split it via a clearing account, one entry per domain'
      using errcode='CLR10',detail='{"reason":"cross_domain_control_entry"}';
  end if;

  for r in select * from clara._subledger_classify_entry(p_entry) cl
           order by cl.domain, cl.counterparty_id loop
    -- (1b) KIND CONSISTENCY. Both lanes write wrong attributions SILENTLY today -- a
    -- NULL-coding_kind birth defaults to 'vendor' (0035:222-227) -- so this refusal is the
    -- honest upgrade, and its message carries the path rather than only the complaint.
    select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = r.counterparty_id;
    if (r.domain = 'ar' and v_cp_kind is distinct from 'customer')
       or (r.domain = 'ap' and v_cp_kind is distinct from 'vendor') then
      raise exception 'the counterparty kind contradicts the control domain; state kind:''customer'' in the proposal, or bind the correct counterparty'
        using errcode='CLR10',
          detail=jsonb_build_object('reason','counterparty_kind_mismatch',
            'domain',r.domain,'counterparty_id',r.counterparty_id,
            'counterparty_kind',v_cp_kind)::text;
    end if;

    -- (2) THE ITEM. item_date falls back to the entry's posting_date; due_date stays null
    -- until C-c ships its producer.
    v_item := null;
    insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
        item_kind, opening_item_id, reversal_unwind_of, item_date, amount_cents,
        created_in_migration, created_by)
      values (e.firm_id, e.client_id, r.domain, r.counterparty_id, p_entry,
        r.item_kind, r.opening_item_id, r.reversal_unwind_of, e.posting_date, r.amount_cents,
        false, v_actor)
      on conflict on constraint uq_open_items_grain do nothing
      returning id into v_item;
    if v_item is not null then
      perform clara._append_event(e.firm_id,
        case when r.item_kind = 'reversal_unwind' then 'open_item.unwound'
             else 'open_item.created' end,
        e.client_id, v_actor, null, null, p_entry, e.document_id, null,
        jsonb_build_object('item_id', v_item, 'domain', r.domain,
          'counterparty_id', r.counterparty_id, 'item_kind', r.item_kind,
          'amount_cents', r.amount_cents));
    end if;
  end loop;

  -- (3) THE SETTLEMENT ALLOCATION PROPOSAL. Absent on every non-settlement entry, so the
  -- rest of the books pay nothing for it.
  v_prop := e.flags -> 'settlement_allocation';
  if v_prop is null then return; end if;
  v_group := (v_prop ->> 'group')::uuid;
  v_settle_dom := v_prop ->> 'domain';
  -- Idempotent: a group already written is a replay, not a second application.
  if exists (select 1 from clara.open_item_allocations oa
             where oa.application_group = v_group) then
    return;
  end if;
  -- min(uuid) is not an aggregate in PostgreSQL 17; the text cast is the house idiom.
  select count(*)::int, min(oi.id::text)::uuid into v_settle_n, v_settle
    from clara.open_items oi
    where oi.entry_id = p_entry and oi.domain = v_settle_dom;
  if v_settle_n = 0 then
    raise exception 'the settlement entry produced no open item to allocate against'
      using errcode='CLR10',detail='{"reason":"settlement_item_missing"}';
  end if;
  select * into si from clara.open_items oi where oi.id = v_settle;

  -- (3a) PROPOSAL CONGRUENCE, RE-DERIVED UNDER THE LOCKS (WCA-R7's real cost). The draft
  -- window between the composite's validation and the checker's approve is also a REVISE
  -- window: revise_entry rewrites the entry's lines wholesale and does not carry
  -- counterparty_id onto the re-inserted legs (0016:4836-4840), so a revised settlement draft
  -- can reach this point pointing at a DIFFERENT customer, at a different gross, or at a
  -- shape that produces more than one control item. The stored proposal is a statement about
  -- a world; if the world moved, the honest answer is one named refusal the maker can act on,
  -- never a silent re-aim of somebody's money. All of it rides ONE reason token
  -- ('allocation_stale') because the remedy is identical in every case: re-run the
  -- allocation.
  if v_settle_n <> 1 then
    raise exception 'this settlement entry now carries % control items in the % domain; the stored allocation proposal no longer describes it -- re-run the allocation', v_settle_n, v_settle_dom
      using errcode='CLR10',
        detail=jsonb_build_object('reason','allocation_stale','axis','settlement_item_count',
          'settlement_items',v_settle_n)::text;
  end if;
  v_prop_cp := clara._canonical_counterparty(e.client_id,
    (v_prop ->> 'counterparty_id')::uuid);
  if v_prop_cp is null
     or clara._canonical_counterparty(e.client_id, si.counterparty_id)
        is distinct from v_prop_cp then
    raise exception 'this settlement entry no longer settles the counterparty the allocation proposal names; re-run the allocation'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','allocation_stale','axis','counterparty',
          'proposed_counterparty_id',v_prop_cp,
          'settlement_counterparty_id',si.counterparty_id)::text;
  end if;
  -- The settlement item is exactly -gross by construction, so the proposal can never allocate
  -- more than the entry as it NOW stands actually settles -- an amount revised DOWN is caught
  -- here, an amount revised UP is caught by the per-item outstanding equality below.
  select coalesce(sum((x.elem ->> 'amount_cents')::bigint), 0) into v_prop_sum
    from jsonb_array_elements(v_prop -> 'allocations') as x(elem);
  if v_prop_sum > -si.amount_cents then
    raise exception 'the stored allocations (% cents) exceed what this settlement entry now discharges (% cents); re-run the allocation', v_prop_sum, -si.amount_cents
      using errcode='CLR10',
        detail=jsonb_build_object('reason','allocation_stale','axis','settlement_amount',
          'allocated_cents',v_prop_sum,'settlement_gross_cents',-si.amount_cents)::text;
  end if;

  -- LOCK ORDER: the advisory client lock is already held by every caller that reaches here
  -- (_approve_entry_core takes 203005003 then 203005004 before the hook; the composites take
  -- both before they touch an item), so this batch lock is the LAST rung -- open_items FOR
  -- UPDATE, ORDER BY id, exactly as the total order says.
  select array_agg(distinct (x.elem ->> 'item_id')::uuid) into v_ids
    from jsonb_array_elements(v_prop -> 'allocations') as x(elem);
  if v_ids is not null then
    perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;
  end if;

  for al in select (x.elem ->> 'item_id')::uuid as item_id,
                  (x.elem ->> 'amount_cents')::bigint as amt,
                  (x.elem ->> 'expected_outstanding_cents')::bigint as exp_out
           from jsonb_array_elements(v_prop -> 'allocations') as x(elem)
           order by 1 loop
    v_out := clara._subledger_outstanding(al.item_id);
    v_exp := al.exp_out;
    -- RE-VALIDATION AT THE MOMENT OF APPROVAL, ON EQUALITY -- not on "still fits". Between
    -- the composite's validation and a checker's approve, another human may have allocated
    -- the same invoice. A "still fits" test silently accepts a world where the outstanding
    -- MOVED but happens to remain large enough, which quietly changes what the maker
    -- proposed; equality against the outstanding the composite actually saw is the only test
    -- that means "nothing moved". FAIL-CLOSED on an absent pin: a proposal with no
    -- expected_outstanding_cents was not written by the composites this migration ships.
    if v_exp is null then
      raise exception 'the stored allocation proposal carries no expected outstanding for open item %; re-run the allocation', al.item_id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_stale','axis','proposal_unpinned',
            'item_id',al.item_id)::text;
    end if;
    if v_out is null or v_out <= 0 or al.amt > v_out or v_out is distinct from v_exp then
      raise exception 'this item''s outstanding moved since the allocation was proposed (proposed against %, now %); re-run the allocation', v_exp, v_out
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_stale','axis','outstanding',
            'item_id',al.item_id,'requested_cents',al.amt,
            'expected_outstanding_cents',v_exp,'outstanding_cents',v_out)::text;
    end if;
    -- THE APPROVE-TIME TWIN of the composites' reversed-target refusal. reverse_entry only
    -- refuses an entry whose items carry non-zero NET allocations, and a DRAFT proposal has
    -- written none -- so the target of a high-stakes proposal can legitimately be reversed
    -- between maker and checker. Allocating cash against a claim that no longer exists is
    -- the defect the composites refuse; it must be refused here too, under the same token.
    select je.reversed_by into v_rev_by from clara.journal_entries je
      join clara.open_items oi on oi.entry_id = je.id where oi.id = al.item_id;
    if v_rev_by is not null then
      raise exception 'open item % belongs to an entry that has since been reversed; apply the reversal unwind instead of settling it', al.item_id
        using errcode='CLR10',
          detail=jsonb_build_object('reason','allocation_target_reversed',
            'item_id',al.item_id,'reversed_by',v_rev_by)::text;
    end if;
    -- THE CREDIT-NOTE WALL, RE-DERIVED (the approve-time re-derivation house pattern).
    -- set_document_kind can flip a document invoice -> credit_note at any moment, including
    -- inside the WCA-R7 draft window, so the composite's read is a TOCTOU snapshot and the
    -- wall has to be re-asked where the money actually moves. Same named reason as the
    -- composite's, because it is the same wall.
    if v_settle_dom = 'ap' then
      select d.document_kind into v_doc_kind
        from clara.open_items oi
        join clara.journal_entries je on je.id = oi.entry_id
        join clara.documents d on d.id = je.document_id
        where oi.id = al.item_id;
      if v_doc_kind = 'credit_note' then
        raise exception 'open item % comes from a document classified as a credit note; fix the coding before paying against it', al.item_id
          using errcode='CLR10',
            detail=jsonb_build_object('reason','credit_note_item','item_id',al.item_id)::text;
      end if;
    end if;
    -- THE BALANCED PAIR. -X against the settled item, +X against the settlement item. The
    -- group therefore nets to exactly zero per (client, domain) BY CONSTRUCTION, which is
    -- what makes the identity un-perturbable by any post-approval verb.
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (e.firm_id, e.client_id, v_settle_dom, al.item_id, v_group, 'allocate',
        -al.amt, null, v_actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (e.firm_id, e.client_id, v_settle_dom, v_settle, v_group, 'allocate',
        al.amt, null, v_actor);
    v_total := v_total + al.amt;
    v_pairs := v_pairs + 1;
  end loop;

  -- NO PAIRS, NO EVENT. A pure on-account receipt (every sen residue, nothing applied) writes
  -- no allocation row at all, and an open_item.allocated event naming a group that does not
  -- exist in clara.open_item_allocations is a lie in the stream -- C-c's aging and the
  -- reconciliation workbench both read the group back.
  if v_pairs > 0 then
    perform clara._append_event(e.firm_id, 'open_item.allocated', e.client_id, v_actor,
      null, null, p_entry, e.document_id, null,
      jsonb_build_object('application_group', v_group, 'domain', v_settle_dom,
        'settlement_item_id', v_settle, 'allocated_cents', v_total,
        'residue_cents', -clara._subledger_outstanding(v_settle)));
  end if;
end $$;
revoke all on function clara._subledger_on_approve(uuid) from public;

-- =====================================================================
-- clara._subledger_decompose_preview -- the READ-ONLY diff surface (design section 4.4).
-- One row per (approved entry x domain x counterparty) the classifier would produce, beside
-- what is actually materialised, with the difference. Shipped here so the ceremony's
-- post-apply verification and the pre-ceremony dry-run can be compared line by line;
-- packages/db/scripts/subledger-dryrun.sql inlines the same logic for the PRE-0037 live run,
-- where none of these objects exist yet.
-- p_domain null means both domains.
--
-- THE MATERIALISED SIDE IS CANONICALISED AND SUMMED, never joined on the stored id. Items
-- store the counterparty that was canonical at write; a later merge_counterparties does not
-- repoint history. A raw join would report a phantom diff (the whole classified amount as
-- "unmaterialised", plus an invisible orphan) for every entry whose party has since been
-- merged -- which is precisely the corpus a diff surface exists to be trusted on.
-- =====================================================================
create function clara._subledger_decompose_preview(p_client uuid, p_domain text)
  returns table(entry_id uuid, posting_date date, domain text, counterparty_id uuid,
                item_kind text, classified_cents bigint, materialised_cents bigint,
                diff_cents bigint)
  language sql stable security definer set search_path = clara, pg_temp as $$
  select e.id, e.posting_date, cl.domain, cl.counterparty_id, cl.item_kind,
         cl.amount_cents,
         it.amt,
         cl.amount_cents - coalesce(it.amt, 0)
  from clara.journal_entries e
  cross join lateral clara._subledger_classify_entry(e.id) cl
  left join lateral (
    -- ONE aggregation law across every surface (belt-1's two arms, this preview, the tail's
    -- D1): the item side drops a zero net exactly as the classifier does. Here it can never
    -- change diff_cents -- every classifier row is nonzero by construction, so a zero-summing
    -- group reads as unmaterialised either way -- and it is written this way so the four
    -- surfaces cannot drift into disagreeing about what a materialised group is.
    select sum(oi.amount_cents)::bigint as amt
    from clara.open_items oi
    where oi.entry_id = e.id and oi.domain = cl.domain
      and clara._canonical_counterparty(oi.client_id, oi.counterparty_id)
          = cl.counterparty_id
    having sum(oi.amount_cents) <> 0
  ) it on true
  where e.client_id = p_client and e.status = 'approved'
    and (p_domain is null or cl.domain = p_domain)
  order by e.posting_date, e.id, cl.domain, cl.counterparty_id;
$$;
revoke all on function clara._subledger_decompose_preview(uuid,text) from public;

-- =====================================================================
-- SECTION F -- THE TWO STRUCTURAL F3 BELTS. UNCONDITIONAL, NO BYPASS GUC, EVER.
--
-- BELT-1 lives on clara.journal_entries and answers "did the approve path remember the
-- subledger?". At COMMIT, for every approved entry, the per-(domain, counterparty) control
-- nets the classifier derives must equal the entry's materialised items EXACTLY -- same
-- grain, same amount, same kind. Any future FIFTH approve path that forgets the hook fails
-- at commit rather than shipping an F3 breach. This is the belt that makes the four-path
-- census a safety net rather than a promise.
--
-- BELT-2 lives on the two subledger tables and answers "is the subledger internally
-- coherent?": (a) the two-sided sign-aware bound on every item, (b) the group law, (c) the
-- kind/domain/tenant congruence the FKs and CHECKs cannot express because they cannot join.
-- v1 had a single belt on journal_entries and it structurally COULD NOT SEE an
-- allocation-only transaction (unallocate, apply_open_items) -- those touch no entry at all.
-- Belt-2 is re-validated at THEIR commit, which is the converged review finding.
--
-- BOTH BELTS RE-QUERY BY ID and never read the NEW tuple's columns (the 0009:524-529 idiom).
-- At deferred time the NEW tuple is a snapshot of the row as it was when the trigger was
-- QUEUED; a later statement in the same transaction may have changed it, and a belt that
-- trusted the snapshot would certify a row that no longer exists in that shape. Five
-- existing deferred asserts coexist on journal_entries without interaction.
--
-- FIXTURE BUDGET, named because belt-1 breaks raw-UPDATE approvals in tests:
-- x36-vendor-binding-helpers.mjs:154-157, x31-autopost-lane-unify.test.mjs:264-267,
-- a21-watch.test.mjs:358-360, x35-drafting-trio.test.mjs:244. Each is adapted to a
-- non-control shape or to matching items. NO BYPASS GUC WILL EXIST -- a belt with an escape
-- hatch is a belt that will be escaped.
-- =====================================================================

create function clara._tf_subledger_entry_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_id uuid; v_bad int; v_legs_bad int;
begin
  v_id := new.id;
  -- RE-QUERY BY ID. A row that is no longer approved at commit (there is no such transition
  -- today, and that is precisely why the belt must not assume it) has nothing to assert.
  if not exists (select 1 from clara.journal_entries je
                 where je.id = v_id and je.status = 'approved') then
    return null;
  end if;

  -- ARM 1 -- CLASSIFIER CONGRUENCE: the entry's items are exactly the rows the ONE classifier
  -- would produce, same grain, same amount, same KIND. The item side is aggregated by
  -- CANONICAL counterparty because items store the party that was canonical AT WRITE and a
  -- later merge does not repoint history -- joining the stored id raw would make every
  -- post-merge entry fail this belt (and would wedge reverse_entry on it forever with a
  -- diagnosis about the subledger being untied, which would be false).
  --
  -- THE ITEM SIDE DROPS ZERO NETS, exactly as every classifier ladder does. Without that the
  -- belt fires on a CANONICAL ZERO-NET COLLAPSE, which is a lawful state and not a breach: an
  -- entry that credited party A +100 and debited party B -100 minted two legitimate items,
  -- and a later merge of A into B makes the classifier net them to zero and emit no row at
  -- all. The two items still exist (history is never repointed), they still sum to what the
  -- ledger says for that canonical group (zero), and the section-3 identity is untouched --
  -- so the next UPDATE to touch this entry (a reverse stamping reversed_by, say) must not be
  -- refused with a diagnosis about a subledger that is in fact perfectly tied. A REAL breach
  -- still fires: if the classifier says the group is nonzero and the items sum to zero, the
  -- classifier row survives with no item side to match and the amount comparison catches it.
  select count(*)::int into v_bad from (
    select 1 from clara._subledger_classify_entry(v_id) cl
    full outer join (
      select oi.domain as d,
             clara._canonical_counterparty(oi.client_id, oi.counterparty_id) as cp,
             sum(oi.amount_cents)::bigint as amt,
             min(oi.item_kind) as k,
             count(distinct oi.item_kind)::int as kn
      from clara.open_items oi where oi.entry_id = v_id
      group by 1, 2
      having sum(oi.amount_cents) <> 0
    ) it on it.d = cl.domain and it.cp is not distinct from cl.counterparty_id
    where cl.amount_cents is distinct from it.amt
       or cl.item_kind is distinct from it.k
       or coalesce(it.kn, 1) <> 1
  ) z;
  if v_bad > 0 then
    raise exception 'approved entry % does not tie to its open items (% divergent grain row(s)) -- an approve path did not materialise the subledger', v_id, v_bad
      using errcode='CLR10',detail='{"reason":"subledger_entry_untied"}';
  end if;

  -- ARM 2 -- LEGS CONGRUENCE. The entry's OWN control legs, netted per (domain, canonical
  -- counterparty) and zero-nets dropped, must equal its items. Arm 1 alone is TAUTOLOGICAL on
  -- ladder 1: a reversal mirror's items are derived from the ORIGINAL's items, so an entry
  -- whose own legs have been rewritten -- reverse a high-stakes entry, revise_entry the draft
  -- mirror to different amounts (revise carries reversal_of ZERO times and re-inserts legs
  -- without counterparty_id, 0016:4836-4840), then approve it -- ties to arm 1 perfectly
  -- while the GL and the subledger have silently parted company. This arm is derived from the
  -- LEDGER, so it holds for EVERY entry including mirrors, and it is what makes the section-3
  -- identity a structural fact rather than a property of the write path. The cheap guard in
  -- clara.revise_entry refuses that sequence at its source; this is the belt behind it.
  select count(*)::int into v_legs_bad from (
    select 1 from (
      select case a.account_class when 'receivable' then 'ar' else 'ap' end as d,
             clara._canonical_counterparty(l.client_id, l.counterparty_id) as cp,
             sum(case when a.account_class = 'receivable'
                      then l.debit_cents - l.credit_cents
                      else l.credit_cents - l.debit_cents end)::bigint as amt
      from clara.journal_lines l
      join clara.coa_accounts a
        on a.client_id = l.client_id and a.account_code = l.account_code
      where l.entry_id = v_id and a.account_class in ('payable','receivable')
      group by 1, 2
      having sum(case when a.account_class = 'receivable'
                      then l.debit_cents - l.credit_cents
                      else l.credit_cents - l.debit_cents end) <> 0
    ) lg
    full outer join (
      -- Zero nets dropped on BOTH sides, for the reason arm 1 states: the legs side already
      -- drops them (the `having` above), so an item side that kept a zero-net canonical
      -- collapse would report a divergence between two sides that agree.
      select oi.domain as d,
             clara._canonical_counterparty(oi.client_id, oi.counterparty_id) as cp,
             sum(oi.amount_cents)::bigint as amt
      from clara.open_items oi where oi.entry_id = v_id
      group by 1, 2
      having sum(oi.amount_cents) <> 0
    ) it on it.d = lg.d and it.cp is not distinct from lg.cp
    where lg.amt is distinct from it.amt
  ) z;
  if v_legs_bad > 0 then
    raise exception 'approved entry % does not tie to its open items on its OWN control legs (% divergent grain row(s)) -- the ledger and the subledger disagree about who owes what', v_id, v_legs_bad
      using errcode='CLR10',detail='{"reason":"subledger_entry_untied"}';
  end if;
  return null;
end $$;

create constraint trigger t_je_subledger_belt
  after insert or update on clara.journal_entries
  deferrable initially deferred
  for each row when (new.status = 'approved')
  execute function clara._tf_subledger_entry_belt();

-- The IMMEDIATE, NAMED half of the domain-to-counterparty-kind law (design section 4.2). A
-- CHECK cannot join, and the counterparty kind is immutable in practice --
-- merge_counterparties refuses a cross-kind merge (0015:2279-2282) -- so a validating
-- trigger at insert is the enforcement, and doing it BEFORE INSERT means the human sees the
-- named refusal at the point of the write rather than a deferred failure at commit.
create function clara._tf_open_items_validate() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_kind text;
begin
  select cp.kind into v_kind from clara.counterparties cp where cp.id = new.counterparty_id;
  if (new.domain = 'ar' and v_kind is distinct from 'customer')
     or (new.domain = 'ap' and v_kind is distinct from 'vendor') then
    raise exception 'an open item in the % domain requires a counterparty of kind %, not %',
      new.domain, case when new.domain='ar' then 'customer' else 'vendor' end,
      coalesce(v_kind,'(unknown)')
      using errcode='CLR10',detail='{"reason":"counterparty_kind_mismatch"}';
  end if;
  return new;
end $$;

create trigger t_open_items_validate before insert on clara.open_items
  for each row execute function clara._tf_open_items_validate();

create function clara._tf_subledger_item_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare i record; e record; v_out bigint; v_sign int; v_kind text;
        v_sum bigint; v_gkind text; v_kinds int; v_cp uuid;
begin
  -- RE-QUERY BY ID (0009:524-529).
  select * into i from clara.open_items oi where oi.id = new.id;
  if not found then return null; end if;
  select * into e from clara.journal_entries je where je.id = i.entry_id;
  if not found then
    raise exception 'open item % has no entry' , i.id
      using errcode='CLR10',detail='{"reason":"subledger_item_orphan"}';
  end if;

  -- (c) TENANT AND LIFECYCLE CONGRUENCE beyond the FKs. The triple-key FK already binds
  -- firm and client; what it cannot say is that the entry must be APPROVED. Only approved is
  -- in the books, and an opening entry can be WITHDRAWN after its draft-time opening_items
  -- row exists, so this is a live corner rather than a hypothetical.
  if e.status <> 'approved' then
    raise exception 'open item % hangs off a non-approved entry', i.id
      using errcode='CLR10',detail='{"reason":"subledger_item_not_approved"}';
  end if;

  -- (c) KIND TO SOURCE. item_kind is not a label the writer chooses -- it is a statement
  -- about the entry, and this is where that statement is made checkable.
  if i.item_kind = 'reversal_unwind' then
    if e.reversal_of is null then v_kind := 'reversal_unwind'; end if;
  elsif i.item_kind = 'opening' then
    if not e.is_opening_balance or e.reversal_of is not null then v_kind := 'opening'; end if;
  elsif i.item_kind = 'bill' then
    if e.coding_kind is distinct from 'supplier_bill' then v_kind := 'bill'; end if;
  elsif i.item_kind = 'invoice' then
    if e.coding_kind is distinct from 'sales_invoice' then v_kind := 'invoice'; end if;
  elsif i.item_kind = 'credit_note' then
    if e.coding_kind is distinct from 'sales_credit_note' then v_kind := 'credit_note'; end if;
  elsif i.item_kind = 'settlement' then
    if e.coding_kind is distinct from (case when i.domain='ar' then 'customer_receipt'
                                            else 'supplier_payment' end) then
      v_kind := 'settlement';
    end if;
  elsif i.item_kind = 'adjustment' then
    if e.coding_kind is not null or e.is_opening_balance or e.reversal_of is not null then
      v_kind := 'adjustment';
    end if;
  end if;
  if v_kind is not null then
    raise exception 'open item % claims kind % but its entry does not support it', i.id, v_kind
      using errcode='CLR10',detail='{"reason":"subledger_item_kind_mismatch"}';
  end if;

  -- (c) CLASSIFIER CONGRUENCE, ASSERTED ON THE GROUP AGGREGATE -- the exact complement of
  -- belt-1's arm 1. Belt-1 fires only on a journal_entries write, so a LONE
  -- `insert into clara.open_items` against an entry that was approved in some EARLIER
  -- transaction touches no journal_entries row and dodges it completely: a second item for
  -- the same party would sail past every FK and past belt-1, and it would break the section-3
  -- identity on the spot.
  --
  -- WHY THE AGGREGATE AND NOT THE ROW. The grain unique is keyed on the STORED counterparty
  -- id, and merges never repoint history -- so once A has merged into B, an entry already
  -- carrying an item that names A can accept a SECOND item naming B at a different grain key.
  -- Row-wise that duplicate is indistinguishable from the real thing (the classifier's one
  -- row for the canonical group has exactly its amount and its kind, so a per-row test says
  -- yes), while the group it lands in now sums to twice what the ledger says. Only equality
  -- on the (entry, domain, CANONICAL counterparty) SUM can see it -- which is also the grain
  -- belt-1 and the tail assert on, so all three now speak one law. The kind census is carried
  -- across for the same reason: a group must be one kind, exactly as the classifier emits it.
  v_cp := clara._canonical_counterparty(i.client_id, i.counterparty_id);
  select sum(oi.amount_cents)::bigint, min(oi.item_kind), count(distinct oi.item_kind)::int
    into v_sum, v_gkind, v_kinds
    from clara.open_items oi
    where oi.entry_id = i.entry_id and oi.domain = i.domain
      and clara._canonical_counterparty(oi.client_id, oi.counterparty_id) = v_cp;
  if v_kinds is distinct from 1 or not exists (
    select 1 from clara._subledger_classify_entry(i.entry_id) cl
    where cl.domain = i.domain
      and cl.counterparty_id = v_cp
      and cl.amount_cents = v_sum
      and cl.item_kind = v_gkind) then
    raise exception 'open item % leaves its (entry, domain, counterparty) group at % / kind %, which is not what the classifier produces for entry % -- the subledger would no longer be derivable from the ledger', i.id, v_sum, coalesce(v_gkind,'(mixed)'), i.entry_id
      using errcode='CLR10',detail='{"reason":"subledger_item_not_classified"}';
  end if;

  -- (a) THE TWO-SIDED, SIGN-AWARE BOUND. sign(amount) * outstanding must stay within
  -- [0, abs(amount)]: no over-allocation past zero AND no inflation past face value. The
  -- second half is the one v1 lacked, and it is what stops a credit item being "settled"
  -- into a larger claim than the document ever supported.
  v_out := clara._subledger_outstanding(i.id);
  v_sign := case when i.amount_cents > 0 then 1 else -1 end;
  if v_sign * v_out < 0 or v_sign * v_out > abs(i.amount_cents) then
    raise exception 'open item % is allocated outside its two-sided bound (amount %, outstanding %)',
      i.id, i.amount_cents, v_out
      using errcode='CLR10',detail='{"reason":"subledger_bound_violated"}';
  end if;
  return null;
end $$;

create constraint trigger t_open_items_belt
  after insert on clara.open_items
  deferrable initially deferred
  for each row execute function clara._tf_subledger_item_belt();

create function clara._tf_subledger_alloc_belt() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare a record; i record; src record; v_out bigint; v_sign int; v_bad int; v_parties int;
begin
  -- RE-QUERY BY ID (0009:524-529).
  select * into a from clara.open_item_allocations oa where oa.id = new.id;
  if not found then return null; end if;
  select * into i from clara.open_items oi where oi.id = a.item_id;
  if not found then return null; end if;

  -- (d) AN UNALLOCATION IS AN EXACT NEGATION OF ONE PRIOR ROW, and the CHECK that pairs
  -- operation_kind with reverses_allocation_id cannot say WHICH row or by HOW MUCH -- a
  -- constraint cannot join. Without this, an 'unallocate' row could name any allocation in
  -- the estate, carry any amount, and still satisfy every declarative rule on the table:
  -- the group would net to zero (its own pair does), the FKs would hold, and the undo would
  -- have moved money between items. The four clauses are: SAME item, EXACT negation, the
  -- target is a real allocation or application (never another unallocate -- an undo of an
  -- undo is a re-allocation, and unallocate_group refuses it by name), and the target has no
  -- OTHER reverser (uq_oia_reverses_once is the structural half of no-double-undo; this is
  -- the half that survives a future partial index change).
  if a.operation_kind = 'unallocate' then
    select * into src from clara.open_item_allocations oa
      where oa.id = a.reverses_allocation_id;
    if not found
       or src.item_id <> a.item_id
       or src.amount_cents <> -a.amount_cents
       or src.operation_kind not in ('allocate','apply')
       or exists (select 1 from clara.open_item_allocations o2
                  where o2.reverses_allocation_id = src.id and o2.id <> a.id) then
      raise exception 'unallocation % is not the exact negation of one live allocation row', a.id
        using errcode='CLR10',detail='{"reason":"subledger_unallocation_not_exact"}';
    end if;
  end if;

  -- (a) the affected item's two-sided bound, re-checked at the ALLOCATION's commit. This is
  -- the half v1's single entry-side belt could not see: unallocate and apply_open_items
  -- touch no journal_entries row at all.
  v_out := clara._subledger_outstanding(i.id);
  v_sign := case when i.amount_cents > 0 then 1 else -1 end;
  if v_sign * v_out < 0 or v_sign * v_out > abs(i.amount_cents) then
    raise exception 'allocation drives open item % outside its two-sided bound (amount %, outstanding %)',
      i.id, i.amount_cents, v_out
      using errcode='CLR10',detail='{"reason":"subledger_bound_violated"}';
  end if;

  -- (b) THE GROUP LAW, half one: every application_group nets to EXACTLY ZERO per
  -- (client_id, domain). Balanced pairs make this true by construction for every verb this
  -- migration ships; the belt is what keeps it true for every verb that comes later.
  select count(*)::int into v_bad from (
    select 1 from clara.open_item_allocations oa
    where oa.application_group = a.application_group
    group by oa.client_id, oa.domain
    having sum(oa.amount_cents) <> 0
  ) z;
  if v_bad > 0 then
    raise exception 'application group % does not net to zero per client and domain', a.application_group
      using errcode='CLR10',detail='{"reason":"subledger_group_not_zero_net"}';
  end if;

  -- (b) THE GROUP LAW, half two: ONE canonical counterparty per group. A cross-party set-off
  -- is a GL event -- it changes what each party owes -- and must ride a (refused -> split)
  -- GL entry, never an application. This is the teeming-and-lading wall: without it, an
  -- application could move a balance from the customer who paid to the customer who did not,
  -- leaving both the GL and the control total perfectly tied.
  select count(distinct clara._canonical_counterparty(oi.client_id, oi.counterparty_id))::int
    into v_parties
    from clara.open_item_allocations oa
    join clara.open_items oi on oi.id = oa.item_id
    where oa.application_group = a.application_group;
  if v_parties <> 1 then
    raise exception 'application group % spans % canonical counterparties; a cross-party set-off must ride a GL entry, never an application', a.application_group, v_parties
      using errcode='CLR10',detail='{"reason":"subledger_group_multi_party"}';
  end if;
  return null;
end $$;

create constraint trigger t_open_item_allocations_belt
  after insert on clara.open_item_allocations
  deferrable initially deferred
  for each row execute function clara._tf_subledger_alloc_belt();

-- =====================================================================
-- SECTION J -- THE BACKFILL (WCA-R4). In-migration, one-shot, entries-driven, deterministic,
-- idempotent, with a hard sen-exact tail assert.
--
-- ENTRIES-DRIVEN, status='approved' ONLY. opening_items is a LINEAGE JOIN and never an
-- independent row source: only approved entries are in the books, and an opening entry can be
-- WITHDRAWN after its draft-time opening_items row exists (0017:3463-3471), so seeding from
-- opening_items would mint items for entries that never made it.
--
-- WHY IT IS MULTI-PASS, and why a single INSERT ... SELECT would be WRONG. The classifier's
-- ladder 1 reads the ORIGINAL entry's open_items to build the unwind rows. A single
-- INSERT ... SELECT runs under ONE snapshot, so the lateral could not see rows inserted by its
-- own statement and every reversal would decompose to zero rows -- silently, and the tie
-- assert would then fail with an unreadable message. So: pass 1 decomposes every non-reversal
-- entry, then a bounded loop decomposes reversals until it stops making progress. The bound is
-- 8 (reversals of reversals are structurally impossible -- reverse_entry refuses one outright
-- and uq_je_one_approved_reversal caps the other side -- so 8 is a generous ceiling on a chain
-- that cannot exceed 1), and the loop RAISES if any approved reversal is still undecomposed
-- rather than leaving it to the tie assert to discover.
--
-- created_in_migration=true marks every row this section writes. There is deliberately NO
-- 'backfill' item_kind: a backfilled bill and a bill approved tomorrow are the same economic
-- object, and giving them different kinds would fork every downstream read. One economic
-- class, one kind, one provenance flag.
-- =====================================================================
do $backfill$
declare
  v_pass int := 0; v_rows int; v_total int := 0; v_left int;
begin
  insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
      item_kind, opening_item_id, reversal_unwind_of, item_date, amount_cents,
      created_in_migration, created_by)
  select e.firm_id, e.client_id, cl.domain, cl.counterparty_id, e.id, cl.item_kind,
         cl.opening_item_id, cl.reversal_unwind_of, e.posting_date, cl.amount_cents,
         true, coalesce(e.checker_actor, e.maker_actor)
  from clara.journal_entries e
  cross join lateral clara._subledger_classify_entry(e.id) cl
  where e.status = 'approved' and e.reversal_of is null
  on conflict on constraint uq_open_items_grain do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;
  raise notice '0037 backfill: pass 0 (non-reversal entries) wrote % item(s)', v_rows;

  loop
    v_pass := v_pass + 1;
    insert into clara.open_items(firm_id, client_id, domain, counterparty_id, entry_id,
        item_kind, opening_item_id, reversal_unwind_of, item_date, amount_cents,
        created_in_migration, created_by)
    select e.firm_id, e.client_id, cl.domain, cl.counterparty_id, e.id, cl.item_kind,
           cl.opening_item_id, cl.reversal_unwind_of, e.posting_date, cl.amount_cents,
           true, coalesce(e.checker_actor, e.maker_actor)
    from clara.journal_entries e
    cross join lateral clara._subledger_classify_entry(e.id) cl
    where e.status = 'approved' and e.reversal_of is not null
      and not exists (select 1 from clara.open_items oi where oi.entry_id = e.id)
    on conflict on constraint uq_open_items_grain do nothing;
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
    raise notice '0037 backfill: reversal pass % wrote % item(s)', v_pass, v_rows;
    exit when v_rows = 0 or v_pass >= 8;
  end loop;

  -- Every approved reversal whose ORIGINAL produced items must itself have produced items.
  -- A reversal of an entry with no control legs legitimately produces none, so the check is
  -- conditional on the original having some.
  select count(*)::int into v_left
  from clara.journal_entries m
  where m.status = 'approved' and m.reversal_of is not null
    and exists (select 1 from clara.open_items oi where oi.entry_id = m.reversal_of)
    and not exists (select 1 from clara.open_items oi where oi.entry_id = m.id);
  if v_left <> 0 then
    raise exception '0037 backfill: % approved reversal(s) still undecomposed after % pass(es) -- the unwind chain is deeper than this migration assumes', v_left, v_pass;
  end if;

  raise notice '0037 backfill: % open item(s) materialised from the existing approved book', v_total;
end
$backfill$;

-- =====================================================================
-- SECTION H.1 -- clara._approve_entry_core, FIFTH RECUT (0009 -> 0016 -> 0029 -> 0035 ->
-- here). REBUILT from the 0035:140-483 text, which the dual grep proves is its genuine last
-- definition and which was diffed BYTE-IDENTICAL against pg_get_functiondef on a database
-- migrated 0001..0036 from zero. Three surgical additions, nothing else touched:
--   (1) the early settlement_not_autopostable refusal (section B, layer 2);
--   (2) the subledger hook after the reversal-linkage update (section C, path 1 of four);
--   (3) the NULL-safe sighting-pool exclusion (section G / design 4.8).
-- 0035's own two edits -- the no_counterparty_sighting advisory and the CLR23
-- withdraw-and-redraft remedy text -- ride through untouched and are re-asserted in the tail,
-- so a rebuild that lost either fails the deploy.
--
-- Same 5-arity CREATE OR REPLACE, so the as-built ACL is preserved (asserted in the tail).
-- =====================================================================
CREATE OR REPLACE FUNCTION clara._approve_entry_core(p_ctx jsonb, p_entry uuid, p_expected_revision uuid, p_attestation text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  c record; e record; v_dedupe jsonb; v_attest text; v_filing uuid;
  v_fingerprint jsonb; v_counterparty uuid; v_created boolean:=false;
  v_name text; v_reg text; v_tin text; v_name_n text; v_reg_n text;
  v_state jsonb; v_invoice_id text; v_question record; v_map record;
  v_rule uuid; v_question_id uuid; v_seen int;
  v_checked_via_rule uuid; v_kind text; v_bound uuid; v_no_cp_warning jsonb;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  v_checked_via_rule:=nullif(p_ctx->>'checked_via_rule_id','')::uuid;
  -- ADV-R3#1: the executor threads its ONE bound extraction through the ctx —
  -- every current-document fact consumer in this approval then reads that same
  -- extraction. A human approve (no ctx pin) keeps the live self-selection.
  v_bound:=nullif(p_ctx->>'bound_extraction','')::uuid;
  -- ADV-R4#1: a RULE-DRIVEN approval may never run unpinned — the executor
  -- always binds (zero lanes skip 'facts_missing' upstream), so a null pin
  -- here is an internal-contract violation, not a lane.
  if v_checked_via_rule is not null and v_bound is null then
    raise exception 'a rule-driven approval requires a bound extraction'
      using errcode='CLR10',detail='{"reason":"unpinned_rule_post"}';
  end if;
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  -- [R1-F1] K-family-only lifecycle boundary; preflight precedes every lock.
  if exists(select 1 from clara.journal_entries
      where id=p_entry and firm_id=c.firm and is_opening_balance) then
    raise exception 'opening entries are mutable only through the K-family'
      using errcode='CLR31',
        detail='{"reason":"opening_entry_k_family_only"}';
  end if;
  if not coalesce((p_ctx->>'receipt_preheld')::boolean,false) then
    v_dedupe:=clara._reserve_op(c.firm,'approve_entry',p_op_key,
      clara._hash(jsonb_build_object('e',p_entry,'rev',p_expected_revision,
        'att',p_attestation)));
    if v_dedupe is not null then return v_dedupe; end if;
  end if;

  select * into e from clara.journal_entries where id=p_entry;
  if not found or e.firm_id<>c.firm then
    raise exception 'entry not in your firm' using errcode='CLR11';
  end if;
  -- CLR26 document-scope serialization (see the as-built filing-lock header): the
  -- filing FOR SHARE vs the question writer's FOR UPDATE serialize on the filing row.
  if e.document_id is not null then
    v_filing:=clara._active_document_filing(e.document_id,e.source_doc_sha256,e.client_id,true);
    if v_filing<>e.filing_id then
      raise exception 'entry is not bound to the active filing' using errcode='CLR02';
    end if;
  end if;

  select * into e from clara.journal_entries where id=p_entry for update;
  if e.status<>'draft' then
    -- The detail reason lets execute_rule_post distinguish THIS benign status race
    -- (a human approved/withdrew concurrently) from every other CLR10 it must NOT mask
    -- (FIX-6 / adversarial #12). Human callers ignore the additive detail unchanged.
    raise exception 'entry is not a draft' using errcode='CLR10',detail='{"reason":"not_a_draft"}';
  end if;
  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;

  -- 0037 SECTION B (WCA-R6, ruled A+): a settlement kind is NEVER autopostable. Which of
  -- three open bills a RM5,000 payment settles is a JUDGEMENT, not a document fact. This is
  -- the NAMED half of the belt; ck_je_settlement_not_rule_checked is the durable,
  -- caller-independent half. Placed AFTER the locked status and revision checks, so a benign
  -- concurrent-approval race still reports as not_a_draft and execute_rule_post's FIX-6
  -- discrimination (0030:1364-1372) keeps working, and BEFORE any mutation this function
  -- makes. NULL-safe: e.coding_kind in (...) is NULL for a NULL kind, so the conjunction is
  -- NULL and nothing raises.
  if v_checked_via_rule is not null
     and e.coding_kind in ('customer_receipt','supplier_payment') then
    raise exception 'a settlement entry is never autopostable'
      using errcode='CLR10',detail='{"reason":"settlement_not_autopostable"}';
  end if;

  if e.reversal_of is not null then
    perform 1 from clara.journal_entries where id=e.reversal_of for update;
    if exists(select 1 from clara.journal_entries
              where id=e.reversal_of and reversed_by is not null) then
      raise exception 'the original was already reversed' using errcode='CLR10';
    end if;
    if exists(select 1 from clara.journal_entries r
              where r.reversal_of=e.reversal_of and r.status='approved'
                and r.id<>p_entry) then
      raise exception 'the original was already reversed by an approved reversal'
        using errcode='CLR10';
    end if;
  end if;

  -- S7: the birth kind follows the stored proposal's TOP-LEVEL kind (the same value
  -- draft/revise/_resolve_counterparty used), falling back to the coding_kind default
  -- (customer for a sales filing). Keeps birth consistent with the resolution scope.
  v_kind:=coalesce(nullif(btrim(e.proposed_counterparty->>'kind'),''),
    case when e.coding_kind in ('sales_invoice','sales_credit_note')
         then 'customer' else 'vendor' end);
  if e.proposed_counterparty is not null then
    v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
    if v_fingerprint is distinct from e.match_fingerprint then
      raise exception 'counterparty match landscape changed; withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape'
        using errcode='CLR23';
    end if;
    if v_fingerprint->>'decision'='birth' then
      v_name:=btrim(e.proposed_counterparty->'new'->>'name');
      v_reg:=nullif(btrim(e.proposed_counterparty->'new'->>'registration_no'),'');
      v_tin:=nullif(btrim(e.proposed_counterparty->'new'->>'tin'),'');
      v_name_n:=lower(regexp_replace(v_name,'[^a-zA-Z0-9]','','g'));
      v_reg_n:=case when v_reg is null then null else
        lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
      begin
        insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,
            registration_no,registration_normalized,tin,created_by)
          values(c.firm,e.client_id,v_kind,v_name,v_name_n,v_reg,v_reg_n,v_tin,c.actor)
          returning id into v_counterparty;
        v_created:=true;
      exception when unique_violation then
        v_fingerprint:=clara._resolve_counterparty(e.client_id,e.proposed_counterparty);
        if v_fingerprint is distinct from e.match_fingerprint then
          raise exception 'counterparty birth raced with a changed match landscape'
            using errcode='CLR23';
        end if;
        raise exception 'counterparty identity could not be resolved after birth race'
          using errcode='CLR23';
      end;
    else
      v_counterparty:=clara._canonical_counterparty(
        e.client_id,(v_fingerprint->>'counterparty_id')::uuid);
    end if;
    -- S7: stamp the control counterparty on payable OR receivable lines.
    update clara.journal_lines l set counterparty_id=v_counterparty
    from clara.coa_accounts a
    where l.entry_id=p_entry and a.client_id=l.client_id
      and a.account_code=l.account_code and a.account_class in ('payable','receivable');
  else
    select clara._canonical_counterparty(e.client_id,min(l.counterparty_id::text)::uuid)
      into v_counterparty
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class in ('payable','receivable')
        and l.counterparty_id is not null;
  end if;

  -- 0035 SECTION A (#21, owner-approved): an ADVISORY approve-time warning when a
  -- supplier_bill approves with NO counterparty bound. Advisory-never-blocking (owner
  -- law) -- the approval proceeds unchanged; the receipt and the audit trail carry a
  -- typed warning so the RPR-class silent dead-end (an approval that builds no
  -- autopost history because no counterparty was ever bound, so no rule_sightings row
  -- can ever be written for it) can never rebuild itself invisibly again.
  if e.coding_kind='supplier_bill' and v_counterparty is null then
    v_no_cp_warning:=jsonb_build_object('code','no_counterparty_sighting',
      'message','no sighting recorded - this approval builds no autopost history');
  end if;

  if v_counterparty is not null then
    perform pg_advisory_xact_lock(203005003,
      hashtext(e.client_id::text||':'||v_counterparty::text));
  end if;
  perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
  select * into v_question from clara._open_question_blocks(
    e.client_id,e.filing_id,v_counterparty) limit 1;
  if found then
    raise exception 'an open question blocks this entry'
      using errcode='CLR26',detail=jsonb_build_object('question_id',v_question.question_id,
        'scope',v_question.scope_kind)::text;
  end if;

  if e.document_id is not null then
    v_state:=case when v_bound is null then clara._invoice_fact_state(e.document_id)
      else clara._invoice_fact_state_at(e.document_id,v_bound) end;
    if coalesce((v_state->>'explicit_non_myr')::boolean,false) then
      raise exception 'newer facts identify an unsupported currency' using errcode='CLR25';
    end if;
    if e.coding_kind='supplier_bill'
       and coalesce((v_state->>'corroborated')::boolean,false) then
      if not clara._corroboration_bound(p_entry,(v_state->>'total_cents')::bigint) then
        raise exception 'newer machine facts contradict the draft evidence'
          using errcode='CLR25';
      end if;
      if (e.flags ? 'amount_exception') and not (e.flags ? 'amount_override') then
        raise exception 'proposed total conflicts with the machine-corroborated total'
          using errcode='CLR21',detail='{"reason":"amount_conflict"}';
      end if;
    end if;
    if e.coding_kind='supplier_bill' and e.reversal_of is null
       and v_counterparty is not null then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      if v_invoice_id is not null and not (e.flags ? 'duplicate_override') then
        perform pg_advisory_xact_lock(203005005,
          hashtext(e.client_id::text||':'||v_counterparty::text||':'||v_invoice_id));
        if exists (
          select 1 from clara.journal_entries e2
          where e2.client_id=e.client_id and e2.coding_kind='supplier_bill'
            and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
            and e2.document_id is not null
            and exists (select 1 from clara.journal_lines l2
              where l2.entry_id=e2.id
                and clara._canonical_counterparty(e.client_id,l2.counterparty_id)
                    =v_counterparty)
            and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id
        ) then
          raise exception 'an approved bill already exists for this vendor and invoice number'
            using errcode='CLR21',detail='{"reason":"duplicate_bill"}';
        end if;
      end if;
    end if;
    -- S7: sales duplicate = the SAME hard approve-time refusal (customer + invoice
    -- number; fallback customer + date + total). Override-flagged like duplicate_bill.
    if e.coding_kind in ('sales_invoice','sales_credit_note') and e.reversal_of is null
       and v_counterparty is not null and not (e.flags ? 'duplicate_override') then
      v_invoice_id:=nullif(v_state->>'invoice_id','');
      perform pg_advisory_xact_lock(203005005,
        hashtext(e.client_id::text||':'||v_counterparty::text||':'||coalesce(v_invoice_id,'')));
      if exists (
        select 1 from clara.journal_entries e2
        where e2.client_id=e.client_id and e2.coding_kind in ('sales_invoice','sales_credit_note')
          and e2.status='approved' and e2.reversed_by is null and e2.id<>p_entry
          and e2.document_id is not null
          and exists (select 1 from clara.journal_lines l2 where l2.entry_id=e2.id
            and clara._canonical_counterparty(e.client_id,l2.counterparty_id)=v_counterparty)
          and (
            (v_invoice_id is not null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_id')=v_invoice_id)
            or (v_invoice_id is null
              and (clara._invoice_fact_state(e2.document_id)->>'invoice_date')
                    =nullif(v_state->>'invoice_date','')
              and (clara._invoice_fact_state(e2.document_id)->>'total_cents')::bigint
                    =nullif(v_state->>'total_cents','')::bigint))
      ) then
        raise exception 'an approved sales invoice already exists for this customer'
          using errcode='CLR21',detail='{"reason":"duplicate_sales"}';
      end if;
    end if;
  end if;
  perform clara._assert_supplier_bill_shape_at(p_entry,v_bound);
  perform clara._assert_sales_invoice_shape_at(p_entry,v_bound);

  if clara.is_high_stakes(p_entry) then
    if e.last_human_editor is null then
      if p_attestation is null or btrim(p_attestation)='' then
        raise exception 'agent-made high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"attestation_required"}';
      end if;
      v_attest:=p_attestation;
    elsif e.last_human_editor=c.actor then
      if clara.eligible_checker_count(c.firm)>=2 then
        raise exception 'high-stakes entry needs a distinct checker'
          using errcode='CLR05',detail='{"reason":"distinct_checker"}';
      elsif p_attestation is null or btrim(p_attestation)='' then
        raise exception 'solo high-stakes approval requires an attestation'
          using errcode='CLR05',detail='{"reason":"self_attestation"}';
      else
        v_attest:=p_attestation;
      end if;
    end if;
  end if;

  update clara.journal_entries set status='approved',checker_actor=c.actor,
    approved_at=now(),self_approval_attestation=v_attest,
    proposed_counterparty=null,match_fingerprint=null,
    checked_via_rule_id=v_checked_via_rule,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'reversal'),updated_at=now()
      where id=e.reversal_of and reversed_by is null;
  end if;

  -- 0037 SECTION C (design 4.3, path 1 of four): the subledger hook. Placed AFTER the
  -- reversal-linkage update so the unwind classifier sees a fully linked, approved pair, and
  -- NEVER gated on checked_via_rule_id -- an autopost must materialise its open items
  -- exactly like a human approval, which is Wave-C contract item 5 satisfied with ZERO
  -- executor edits (one core, shared by approve_entry and execute_rule_post since 0015).
  perform clara._subledger_on_approve(p_entry);

  -- H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only. A rule-posted approval
  -- (checked_via_rule_id set) writes NO sighting and triggers NO proposal — else
  -- rules would breed rules from their own output (WA2-R9). The v_seen pool also
  -- filters to human-checked entries (checked_via_rule_id is null).
  -- 0016 P2 (§3.1): sightings are SIDE-aware. The 0015 debit pool states
  -- side='debit' explicitly; income-class CREDIT legs additionally record
  -- side='credit' sightings — the evidence pool for the sales-direction
  -- autopost floors. The 3-sighting vendor_account auto-proposal stays
  -- side='debit'-scoped (pin P2). The H2 carve-out + reversal guard above are
  -- verbatim.
  -- 0037 SECTION G (design 4.8): settlements never breed. The sighting pool exists to
  -- accumulate evidence that a COUNTERPARTY's document maps to an ACCOUNT; a receipt or a
  -- payment says nothing about coding and would breed toward a bank-account rule. The
  -- exclusion is written NULL-SAFE -- `coding_kind is null or coding_kind not in (...)` --
  -- because a bare NOT IN against a NULL yields NULL, which would silently stop EXISTING
  -- kind-NULL breeding dead. That trap is documented in-repo at 0022:726.
  if v_counterparty is not null and e.reversal_of is null and v_checked_via_rule is null
     and (e.coding_kind is null
          or e.coding_kind not in ('customer_receipt','supplier_payment')) then
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry,'debit'
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.debit_cents>0 and a.is_active
      on conflict on constraint uq_rule_sightings_mapping do nothing;
    insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
      select distinct c.firm,e.client_id,v_counterparty,l.account_code,p_entry,'credit'
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and l.credit_cents>0 and a.is_active
        and a.account_type='income'
      on conflict on constraint uq_rule_sightings_mapping do nothing;

    -- ADV-2: the vendor_account auto-proposal breeds ONLY for canonical
    -- VENDOR-kind counterparties onto NON-CONTROL accounts — a customer's AR
    -- control debit sighting must never spawn a vendor_account rule (nor a
    -- blocking vendor question) binding a customer to the receivable control.
    for v_map in select distinct s.account_code from clara.rule_sightings s
        join clara.coa_accounts am on am.client_id=s.client_id and am.account_code=s.account_code
        where s.entry_id=p_entry and s.counterparty_id=v_counterparty and s.side='debit'
          and coalesce(am.account_class,'') not in ('payable','receivable')
          and exists(select 1 from clara.counterparties cpv
            where cpv.id=v_counterparty and cpv.kind='vendor'
              and cpv.merged_into is null and cpv.retired_at is null)
    loop
      select count(distinct s.entry_id)::int into v_seen
      from clara.rule_sightings s join clara.journal_entries j on j.id=s.entry_id
      where s.client_id=e.client_id and s.account_code=v_map.account_code and s.side='debit'
        and clara._canonical_counterparty(e.client_id,s.counterparty_id)=v_counterparty
        and j.status='approved' and j.reversed_by is null and j.checked_via_rule_id is null;
      if v_seen=3 and not exists(select 1 from clara.coding_rules r
          where r.client_id=e.client_id and r.counterparty_id=v_counterparty
            and r.rule_type='vendor_account' and r.status in ('proposed','live')) then
        insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,
            account_code,status,pinned,origin,content_hash,created_by)
          values(c.firm,e.client_id,'vendor_account',v_counterparty,v_map.account_code,
            'proposed',false,'proposed',encode(clara._hash(jsonb_build_object(
              'type','vendor_account','client',e.client_id,'counterparty',v_counterparty,
              'account_code',v_map.account_code)),'hex'),c.actor)
          returning id into v_rule;
        insert into clara.open_questions(firm_id,client_id,scope_kind,scope_id,
            counterparty_id,origin,question_text,status,opener_kind,opened_by,spawned_rule_id)
          values(c.firm,e.client_id,'vendor',v_counterparty,v_counterparty,
            'rule_proposal','Use account '||v_map.account_code||' for this vendor?',
            'open','human',c.actor,v_rule) returning id into v_question_id;
        perform clara._append_event(c.firm,'kb_rule.proposed',e.client_id,c.actor,null,null,
          null,null,null,jsonb_build_object('rule_id',v_rule,'question_id',v_question_id,
            'counterparty_id',v_counterparty,'account_code',v_map.account_code));
      end if;
    end loop;
  end if;

  perform clara._audit(c.firm,c.actor,null,null,'approve_entry',p_entry,
    jsonb_build_object('filing',e.filing_id,'counterparty',v_counterparty,'op_key',p_op_key,
      'checked_via_rule_id',v_checked_via_rule)
      || case when v_no_cp_warning is not null
           then jsonb_build_object('warning',v_no_cp_warning) else '{}'::jsonb end);
  if v_created then
    perform clara._append_event(c.firm,'counterparty.created',e.client_id,c.actor,null,null,
      null,null,null,jsonb_build_object('counterparty_id',v_counterparty));
  end if;
  perform clara._append_event(c.firm,'entry.approved',e.client_id,c.actor,null,null,
    p_entry,e.document_id,null,'{}'::jsonb);
  if e.reversal_of is not null then
    perform clara._append_event(c.firm,'entry.reversed',e.client_id,c.actor,null,null,
      e.reversal_of,null,null,'{}'::jsonb);
  end if;
  return clara._finish_op(c.firm,'approve_entry',p_op_key,
    jsonb_build_object('entry_id',p_entry,'status','approved')
      || case when v_no_cp_warning is not null
           then jsonb_build_object('warnings',jsonb_build_array(v_no_cp_warning))
           else '{}'::jsonb end);
end $function$;

-- =====================================================================
-- SECTION H.2 -- clara.reverse_entry: a CHANGE-OF-RECORD PATCH, not a rebuild.
--
-- 0009:1697 is NOT its last definition. 0017:255-271 splices the R1-F1 CLR31 opening-boundary
-- preflight into the live body via pg_get_functiondef, and 0017's own tail (5324-5337) asserts
-- it. A rebuild from 0009's text would silently delete that boundary and re-open K-family
-- entries to the ordinary reversal verb. A `create (or replace )?function` grep cannot see a
-- dynamic patch; only reading the patch does (the 0036:381-395 dual-grep law).
--
-- TWO ADDITIONS:
--   (a) THE REVERSE REFUSAL (design 4.5). An entry whose open items carry non-zero NET
--       allocations is not reversible in one step -- not in this system and not in
--       professional practice anywhere. Refusing keeps the unwind trivially TOTAL: unwind
--       items are exact negations, so there is never a stranded allocation pointing at an
--       item whose entry has been reversed, and never a phantom outstanding. Placed after
--       the last cheap precondition and before the mirror is built, so a refusal costs no
--       write. The op-key reservation is already taken at that point, exactly as it is for
--       every other refusal in this body -- a rolled-back reservation vanishes with the
--       transaction (0004:43-60 semantics), so a retry re-executes cleanly.
--   (b) THE HOOK on the inline non-high-stakes approve branch, placed after BOTH updates so
--       the classifier sees a fully linked, approved pair. The high-stakes branch leaves a
--       draft and is caught later by path 1 (_approve_entry_core) when that draft is approved.
--
-- The prestate probes are POSITIVE for 0017's marker and fail-closed on a second application.
-- =====================================================================
do $rev37$
declare v_def text; v_next text; v_prior text;
begin
  select pg_get_functiondef('clara.reverse_entry(uuid,text,text)'::regprocedure) into v_def;
  if position('opening_entry_k_family_only' in v_def)=0 then
    raise exception '0037 section H.2 prestate: the live clara.reverse_entry body is missing 0017 R1-F1 CLR31 opening-boundary marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('clara._subledger_on_approve(' in v_def)<>0 then
    raise exception '0037 section H.2 prestate: clara.reverse_entry already carries the subledger hook -- 0037 has already been applied to this database'
      using errcode='CLR10';
  end if;
  -- Both anchors must occur EXACTLY ONCE: replace() rewrites every occurrence, so a drifted
  -- body carrying two copies would get two splices while a position()>0 post-check stayed
  -- green (0036's review F4 guard, applied here).
  if (length(v_def)-length(replace(v_def,
      $a$  if p_reason is null or btrim(p_reason)='' then raise exception 'a reversal reason is required' using errcode='CLR10'; end if;$a$,'')))
     / length($a$  if p_reason is null or btrim(p_reason)='' then raise exception 'a reversal reason is required' using errcode='CLR10'; end if;$a$) <> 1 then
    raise exception '0037 section H.2 prestate: the reverse_entry reason-check anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
$old$  if p_reason is null or btrim(p_reason)='' then raise exception 'a reversal reason is required' using errcode='CLR10'; end if;$old$,
$new$  if p_reason is null or btrim(p_reason)='' then raise exception 'a reversal reason is required' using errcode='CLR10'; end if;
  -- 0037: SERIALIZE REVERSE AGAINST ALLOCATION. The refusal below reads the subledger; the
  -- section-4.9 composites write it. reverse_entry holds only the JE row lock, which the
  -- composites never take on a PRE-EXISTING entry, so without this rung the check-then-act
  -- window is wide open: a concurrent allocate_receipt commits its pairs between this read
  -- and the mirror's approve, and the entry is reversed with live allocations pointing at
  -- items whose unwind has already been written. Same client advisory id, same order the
  -- core and the composites use -- JE row lock FIRST, then 203005004 -- so no rung inverts.
  perform pg_advisory_xact_lock(203005004,hashtext(o.client_id::text));
  -- 0037 (design 4.5): an entry whose open items carry non-zero NET allocations is not
  -- reversible in one step. Unallocate first, then reverse -- which keeps the unwind
  -- trivially total (unwind items are exact negations, so no allocation is ever stranded).
  if clara._subledger_allocated_items_present(p_entry) then
    raise exception 'open items on this entry carry allocations; unallocate them first'
      using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
  end if;$new$);
  if v_next=v_def or position('allocated_items_present' in v_next)=0
     or position('pg_advisory_xact_lock(203005004,hashtext(o.client_id::text))' in v_next)=0 then
    raise exception '0037 section H.2: reverse_entry reason-check anchor drift -- the reverse refusal was not installed'
      using errcode='CLR10';
  end if;
  -- SECOND ANCHOR, counted the same way as the first (0036 review F4): replace() rewrites
  -- EVERY occurrence, so a body carrying two copies would take two splices while a
  -- position()>0 post-check stayed green. Both anchors in this patch are now counted.
  if (length(v_next)-length(replace(v_next,
      $a$    update clara.journal_entries set reversed_by=v_mirror,reversal_reason=p_reason,
      updated_at=now() where id=p_entry;
    v_status:='approved';$a$,'')))
     / length($a$    update clara.journal_entries set reversed_by=v_mirror,reversal_reason=p_reason,
      updated_at=now() where id=p_entry;
    v_status:='approved';$a$) <> 1 then
    raise exception '0037 section H.2 prestate: the reverse_entry inline-approve anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
$old$    update clara.journal_entries set reversed_by=v_mirror,reversal_reason=p_reason,
      updated_at=now() where id=p_entry;
    v_status:='approved';$old$,
$new$    update clara.journal_entries set reversed_by=v_mirror,reversal_reason=p_reason,
      updated_at=now() where id=p_entry;
    -- 0037 (design 4.3, path 2 of four): the hook, after BOTH updates so the classifier sees
    -- a fully linked, approved pair. The high-stakes branch leaves a draft and is caught by
    -- path 1 when that draft is later approved.
    perform clara._subledger_on_approve(v_mirror);
    v_status:='approved';$new$);
  if v_next=v_prior or position('clara._subledger_on_approve(v_mirror)' in v_next)=0 then
    raise exception '0037 section H.2: reverse_entry inline-approve anchor drift -- the subledger hook was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$rev37$;

-- =====================================================================
-- SECTION H.2b -- clara.revise_entry: a CHANGE-OF-RECORD PATCH, the cheap guard behind
-- belt-1's arm 2.
--
-- THE HOLE. A fully sanctioned sequence breaks the section-3 identity with no unsanctioned
-- step anywhere in it: reverse a HIGH-STAKES entry (the mirror stays a DRAFT), then
-- revise_entry that draft mirror to different lines, then approve_entry it. The classifier's
-- ladder 1 decomposes the mirror from the ORIGINAL's items -- it never looks at the mirror's
-- own legs -- so the items say one thing and the GL says another, and belt-1's classifier arm
-- (which compares those same two derived-from-the-same-place quantities) ties perfectly.
-- revise_entry contains the string `reversal_of` ZERO times: nothing in it knows a mirror is
-- special, and its line re-insert additionally drops counterparty_id from every leg
-- (0016:4836-4840), so even an amount-preserving revise strips the attribution the subledger
-- is built on.
--
-- TWO FIXES, both shipped: belt-1's ARM 2 (structural -- the entry's own control legs must
-- tie to its items, which holds for mirrors and for every future path) and THIS guard, which
-- refuses the sequence at its source so the human gets a remedy instead of a commit-time
-- belt failure with no path forward.
--
-- PATCHED, NEVER REBUILT. The dual grep (0036:381-413): `create (or replace )?function
-- clara.revise_entry` last hits 0016:4765 -- but that is NOT its last definition. 0017:291-308
-- splices the R1-F1 CLR31 opening-boundary preflight in dynamically, and 0028:1443-1532
-- splices FOUR more regions (the binding-divergence declarations, the resolution read, the
-- coding_kind/vendor_binding_id strip + the vendor_binding_resolutions row, and the
-- binding_resolved event). A rebuild from 0016's text would silently delete all five. Both
-- prior changes of record are probed POSITIVELY before this patch touches anything.
-- =====================================================================
do $rev37b$
declare v_def text; v_next text;
begin
  select pg_get_functiondef(
    'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'::regprocedure) into v_def;
  if position('opening_entry_k_family_only' in v_def)=0
     or position('v_binding_divergence' in v_def)=0
     or position('clara.vendor_binding_resolutions' in v_def)=0 then
    raise exception '0037 section H.2b prestate: the live clara.revise_entry body is missing a 0017 R1-F1 or 0028 binding-divergence marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('reversal_mirror_not_revisable' in v_def)<>0 then
    raise exception '0037 section H.2b prestate: clara.revise_entry already carries the reversal-mirror guard -- 0037 has already been applied to this database'
      using errcode='CLR10';
  end if;
  if (length(v_def)-length(replace(v_def,
      $a$  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;$a$,'')))
     / length($a$  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;$a$) <> 1 then
    raise exception '0037 section H.2b prestate: the revise_entry revision-token anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
$old$  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;$old$,
$new$  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;
  -- 0037 (design 4.5 / the section-3 identity): a REVERSAL MIRROR is not editable. Its
  -- subledger decomposition is derived from the ORIGINAL's items, so revising its lines makes
  -- the ledger and the subledger disagree by construction -- and this function has no concept
  -- of reversal_of, so nothing else here would notice. The remedy is the honest one: withdraw
  -- the mirror and re-reverse the original with the lines you actually want.
  if e.reversal_of is not null then
    raise exception 'a reversal mirror cannot be revised; withdraw the mirror and re-reverse the original'
      using errcode='CLR10',detail='{"reason":"reversal_mirror_not_revisable"}';
  end if;$new$);
  if v_next=v_def or position('reversal_mirror_not_revisable' in v_next)=0 then
    raise exception '0037 section H.2b: revise_entry revision-token anchor drift -- the reversal-mirror guard was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$rev37b$;

-- =====================================================================
-- SECTION H.3 -- clara.approve_wrong_client_correction: a CHANGE-OF-RECORD PATCH.
--
-- THE FOURTH APPROVE PATH, and the one the v1 census missed. Its inline mirror approve
-- (0027:303-305) never touches _approve_entry_core, and it additionally ADOPTS an existing
-- pending draft mirror (0027:276-280) -- a hole nothing else in the system covers, because
-- an adopted mirror was drafted by some other lane and approved by this one.
--
-- PATCHED, not rebuilt: 0027:196 is the live definition (the documents-before-document_filings
-- lock-order fix, task #29) and the prestate probes demand its own markers before touching
-- anything. The live body was additionally diffed byte-identical against 0027's file text on a
-- database migrated 0001..0036 from zero.
--
-- Two additions, mirroring H.2: the reverse refusal (per correction ITEM, at the top of the
-- reverse branch, before any mirror is adopted or built) and the hook after the mirror approve.
-- =====================================================================
do $awcc37$
declare v_def text; v_next text; v_prior text;
begin
  select pg_get_functiondef(
    'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure) into v_def;
  if position('perform 1 from clara.documents where id=x.document_id for update;' in v_def)=0
     or position('opening_entry_k_family_only' in v_def)=0
     or position('adopted_reversal' in v_def)=0 then
    raise exception '0037 section H.3 prestate: the live clara.approve_wrong_client_correction body is missing a 0027 lock-order / 0017 R1-F1 / 0009 adoption marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('clara._subledger_on_approve(' in v_def)<>0 then
    raise exception '0037 section H.3 prestate: clara.approve_wrong_client_correction already carries the subledger hook -- 0037 has already been applied to this database'
      using errcode='CLR10';
  end if;
  if (length(v_def)-length(replace(v_def,
      $a$    if it.action='reverse' then
      v_mirror:=null; v_adopted:=false;$a$,'')))
     / length($a$    if it.action='reverse' then
      v_mirror:=null; v_adopted:=false;$a$) <> 1 then
    raise exception '0037 section H.3 prestate: the reverse-branch anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
$old$    if it.action='reverse' then
      v_mirror:=null; v_adopted:=false;$old$,
$new$    if it.action='reverse' then
      -- 0037: SERIALIZE REVERSE AGAINST ALLOCATION, exactly as reverse_entry now does. This
      -- body already holds the FIRM advisory rung (203005002) and the captured entries' JE
      -- row locks; neither serializes against a section-4.9 composite, which takes the CLIENT
      -- rung and locks only its OWN freshly-inserted entry. Taking 203005004 here -- AFTER
      -- the JE row locks above, so the JE -> advisory order the core uses is preserved --
      -- closes the check-then-act window on the refusal below. The full rung is
      -- firm(203005002) -> client(203005004); advisory xact locks are re-entrant, so taking
      -- it once per captured item costs nothing after the first.
      perform pg_advisory_xact_lock(203005004,hashtext(o.client_id::text));
      -- 0037 (design 4.5): the same reverse refusal reverse_entry carries. A correction that
      -- moves a filing between clients still REVERSES the entries it captures, so an
      -- allocated open item must be unallocated first here too.
      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;
      v_mirror:=null; v_adopted:=false;$new$);
  if v_next=v_def or position('allocated_items_present' in v_next)=0
     or position('pg_advisory_xact_lock(203005004,hashtext(o.client_id::text))' in v_next)=0 then
    raise exception '0037 section H.3: approve_wrong_client_correction reverse-branch anchor drift -- the reverse refusal was not installed'
      using errcode='CLR10';
  end if;
  -- SECOND ANCHOR, counted like the first (0036 review F4) -- replace() rewrites every
  -- occurrence, so an uncounted anchor can take two splices under a green position() check.
  if (length(v_next)-length(replace(v_next,
      $a$      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;$a$,'')))
     / length($a$      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;$a$) <> 1 then
    raise exception '0037 section H.3 prestate: the mirror-approve anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_prior:=v_next;
  v_next:=replace(v_next,
$old$      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;$old$,
$new$      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;
      -- 0037 (design 4.3, path 4 of four): the hook. Covers the ADOPTED-draft-mirror hole
      -- too -- a mirror drafted by another lane and approved here would otherwise reach the
      -- books with no unwind at all.
      perform clara._subledger_on_approve(v_mirror);$new$);
  if v_next=v_prior or position('clara._subledger_on_approve(v_mirror)' in v_next)=0 then
    raise exception '0037 section H.3: approve_wrong_client_correction mirror-approve anchor drift -- the subledger hook was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$awcc37$;

-- =====================================================================
-- SECTION H.4 -- clara._approve_opening_entry: a RECUT (0017:3784 verbatim + the hook).
--
-- The dual grep is clean for this one: 0017 created it, no migration recuts it, and no
-- migration patches it dynamically (checked both ways per 0036:392-395). The live body was
-- diffed byte-identical against 0017's file text on a database migrated 0001..0036 from zero,
-- so a rebuild reverts nothing. Same 5-arity, ACL preserved.
--
-- THE HOOK GOES AFTER THE STATUS FLIP AND AFTER THE REVERSAL LINKAGE, for the same reason it
-- does in the other three: a K6 supersede sets reversal_of, so the classifier's path 1 must
-- see the linkage before it decomposes. Note that the opening path reaches ladder 2 only when
-- reversal_of is null -- a K6 pure-reversal is an UNWIND of the superseded item, not a fresh
-- opening item, which is exactly what "supersede" means in the books.
-- =====================================================================
create or replace function clara._approve_opening_entry(
    p_seed uuid,p_entry uuid,p_checker uuid,p_attestation text,p_batch_n int)
  returns jsonb language plpgsql security definer set search_path=clara,pg_temp as $$
declare e record; s record; v_attest text; v_kind text; v_item uuid;
begin
  select * into s from clara.opening_seed_registry where id=p_seed;
  select * into e from clara.journal_entries where id=p_entry for update;
  if not found or e.firm_id<>s.firm_id or e.client_id<>s.client_id
     or e.status<>'draft' or not e.is_opening_balance then
    raise exception 'opening entry is not an approvable draft'
      using errcode='CLR31',detail='{"reason":"revision_mismatch"}';
  end if;
  if e.last_human_editor=p_checker then
    if clara.eligible_checker_count(s.firm_id)>=2 then
      raise exception 'opening entry needs a distinct checker'
        using errcode='CLR05',detail='{"reason":"distinct_checker"}';
    elsif nullif(btrim(p_attestation),'') is null then
      raise exception 'solo opening approval requires an attestation'
        using errcode='CLR05',detail='{"reason":"self_attestation"}';
    else
      v_attest:=p_attestation; v_kind:='self_approval_attestation';
    end if;
  else
    v_kind:='distinct_checker';
  end if;
  update clara.journal_entries set status='approved',checker_actor=p_checker,
    approved_at=now(),self_approval_attestation=v_attest,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'opening supersede'),
      updated_at=now() where id=e.reversal_of and reversed_by is null;
  end if;
  -- 0037 (design 4.3, path 3 of four): the hook. After the status flip AND the reversal
  -- linkage, so a K6 supersede decomposes as an UNWIND of the superseded item rather than as
  -- a second opening item.
  perform clara._subledger_on_approve(p_entry);
  select id into v_item from clara.opening_items where entry_id=p_entry;
  insert into clara.opening_seed_approvals(
      firm_id,client_id,seed_id,batch_n,entry_id,item_id,checker,attestation_kind)
    values(s.firm_id,s.client_id,p_seed,p_batch_n,p_entry,v_item,p_checker,v_kind);
  return jsonb_build_object('entry_id',p_entry,'item_id',v_item,
    'attestation_kind',v_kind);
end $$;

-- =====================================================================
-- SECTION I -- clara.reconcile_sweep_runs: the force-complete guard (owner-ruled addition,
-- Wave-C contract section 4 C-a).
--
-- THE DEFECT. The recovery pass force-completes every task in the run whose status is in
-- ('running','cancel_requested') the moment ANY filing in that run is recovered. One recovered
-- filing therefore completes every OTHER still-running task in the same run: the live run's
-- real outcome is discarded on the `completed` replay branch, and its attempt row wedges at
-- state='active' with a live reservation -- which 0034 then reads as `already_done` forever.
-- That is a stronger literal match for "the reconciler double-dispatch" than anything in
-- settle, and the fix is ONE predicate: complete only tasks that actually DRAFTED.
--
-- PATCHED, and THE ANCHOR IS THE 0017-SPLICED TEXT (0017:473-480 -- the
-- active_completion_client join form). 0011:2709's three-line form NO LONGER EXISTS in the
-- live body, so anchoring on it would silently no-op and ship a green migration that fixed
-- nothing. Two-sided probes: 0017's marker before, the new predicate after.
-- =====================================================================
do $sweep37$
declare v_def text; v_next text;
begin
  select pg_get_functiondef('clara.reconcile_sweep_runs()'::regprocedure) into v_def;
  if position('active_recovery_client.status=''active''' in v_def)=0
     or position('active_completion_client.status=''active''' in v_def)=0
     or position('active_release_client.status=''active''' in v_def)=0 then
    raise exception '0037 section I prestate: the live clara.reconcile_sweep_runs body is missing a 0017 R2-F6 active-client guard marker -- refusing to patch a body this migration cannot account for'
      using errcode='CLR10';
  end if;
  if position('and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id)' in v_def)<>0 then
    raise exception '0037 section I prestate: clara.reconcile_sweep_runs already carries the force-complete guard -- 0037 has already been applied to this database'
      using errcode='CLR10';
  end if;
  if (length(v_def)-length(replace(v_def,
      $a$        where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested');$a$,'')))
     / length($a$        where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested');$a$) <> 1 then
    raise exception '0037 section I prestate: the force-complete WHERE anchor must appear exactly once in the live body'
      using errcode='CLR10';
  end if;
  v_next:=replace(v_def,
$old$        where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested');$old$,
$new$        where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested')
          and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id);$new$);
  if v_next=v_def
     or position('and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id)' in v_next)=0 then
    raise exception '0037 section I: reconcile_sweep_runs force-complete anchor drift -- the guard was not installed'
      using errcode='CLR10';
  end if;
  execute v_next;
end
$sweep37$;

-- =====================================================================
-- SECTION K -- THE FOUR COMPOSITES (design section 4.9). Human verbs, bookkeeper floor,
-- granted to clara_authenticated ONLY -- no wake role, no runtime, no agent. A settlement is
-- a judgement about which obligation a payment discharges, and judgement is the one thing the
-- agent never makes.
--
-- THE LOCK ORDER, extended and stated once for all four -- AS BUILT, which is not the order
-- design v2 section 4.9 first wrote (it named journal_entries before open_items; the design
-- carries the amendment and the reason):
--   op-receipt  ->  advisory 203005003 (client:counterparty)  ->  advisory 203005004 (client)
--   ->  open_items (batch: FOR UPDATE ... ORDER BY id)  ->  journal_entries  ->  groups
-- The two advisory ids are the EXISTING ones _approve_entry_core already takes, in the
-- EXISTING order (0035:285-289). Taking them in the composites too, BEFORE the open_items row
-- locks, is what makes the extension deadlock-free rather than merely documented: an
-- allocate_* that locked items first and then called the core (which takes 203005004) would
-- invert against an unallocate_group that takes 203005004 and then locks the same items. The
-- design named the client advisory lock only for unallocate/apply because those two do not
-- reach the core at all; acquiring the same locks earlier in the allocate path is the
-- refinement that makes the single total order true for every actor. Advisory transaction
-- locks are re-entrant, so the core re-taking them inside the composite is free.
--
-- THE ADVISORY RUNG, WHOLE, so no reader has to reconstruct it from four call sites:
--   firm (203005002)  ->  client (203005004)  ->  client:counterparty (203005003)
-- read as a PARTIAL order over who takes what, not as a sequence anyone walks end to end.
-- approve_wrong_client_correction is the only body that takes the firm rung (0027-era, before
-- everything else it does); the composites and _approve_entry_core take
-- 203005003 then 203005004 with no firm rung at all; reverse_entry and
-- approve_wrong_client_correction now take 203005004 AFTER their journal_entries row locks,
-- which is the same relative order _approve_entry_core has always used (JE row lock at
-- 0035-era, advisory after) -- so adding the rung inverts nothing.
--
-- TWO NAMED INVARIANTS hold this together, and a future verb that breaks either one is the
-- thing to catch in review:
--   (1) A COMPOSITE LOCKS ONLY ITS OWN FRESHLY-INSERTED ENTRY ROW. It inserts the settlement
--       entry and the core then takes FOR UPDATE on that same brand-new id; no composite ever
--       row-locks a PRE-EXISTING journal_entries row. That is precisely why the composites
--       may take open_items BEFORE journal_entries while reverse_entry and
--       approve_wrong_client_correction take journal_entries first: the two orders never meet
--       on the same object. ANY FUTURE VERB THAT LOCKS A PRE-EXISTING ENTRY MUST TAKE
--       journal_entries BEFORE open_items.
--   (2) THE CORE'S OWN INTERNAL ORDER IS PRE-EXISTING AND IS NOT REORDERED BY THIS WAVE.
--       _approve_entry_core takes the document filing, then the entry row, then the advisory
--       pair -- a 0029/0035-era sequence that predates the subledger and that several other
--       verbs are already ordered against. Wave C-a extends the order with new rungs at the
--       END; it does not renumber the ones that were already there.
--
-- OP-KEYS. Each composite reserves its own key over the hash of the FULL NORMALIZED request
-- -- every argument that reaches a stored column or a decision, with the allocation array
-- canonicalised (sorted, integer amounts) so two spellings of the same request hash the same
-- and two different requests can never share a receipt. 0004:43-60 semantics: a rolled-back
-- reservation vanishes with its transaction, so a retry re-executes cleanly. The same-call
-- approve gets a DERIVED SUB-KEY (p_op_key || ':approve') pre-reserved by the composite and
-- passed with receipt_preheld:true -- the 0030:1368 idiom -- so a later human approve_entry
-- replay can never collide with it.
--
-- THE HIGH-STAKES SPLIT (WCA-R7). Below the firm's threshold the composite approves through
-- the core in the same call. At or above it, the entry is left a DRAFT carrying the validated
-- allocation proposal in flags, and an ordinary approve_entry by the checker materialises
-- everything through the same hook -- /queue muscle memory, CLR05 law untouched. Both branches
-- run the identical materialisation code in clara._subledger_on_approve; the only difference
-- is WHEN it runs and that the draft branch re-validates outstanding at the checker's approve,
-- refusing CLR10 allocation_stale if the world moved.
--
-- THE SHAPE FLOORS ARE ENFORCED BY THE DEFERRED TRIGGER TWINS, not by a call inside
-- _approve_entry_core, and that asymmetry with supplier_bill / sales_invoice is deliberate:
-- settlement kinds are creatable ONLY by these composites (WCA-R6 as amended by WCA-R7), which
-- build the shape themselves, so the only way to present a wrong-shaped settlement is direct
-- row construction -- exactly what a commit-time constraint trigger exists to catch.
--
-- p_attestation is the CLR05 carrier for the same-call approve path. Below the threshold the
-- core never reaches its high-stakes branch, so it is inert there; it stays in the signature
-- for solo-firm symmetry with every other approve-bearing verb and it is HASHED regardless, so
-- a caller cannot change it under a re-used op_key and have it silently ignored.
-- =====================================================================

create function clara.allocate_receipt(
    p_client uuid, p_counterparty uuid, p_posting_date date, p_memo text,
    p_bank_account text, p_amount_cents bigint, p_allocations jsonb, p_op_key text,
    p_discount_cents bigint default 0, p_discount_account text default null,
    p_attestation text default null, p_control_account text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  v_memo text; v_disc bigint; v_gross bigint; v_ctrl text; v_ctrl_n int;
  v_allocs jsonb; v_prop_allocs jsonb; v_n int; v_dis int; v_sum bigint; v_residue bigint;
  v_ids uuid[]; al record; v_out bigint; i record; v_rev_by uuid;
  v_group uuid; v_entry uuid; v_rev uuid; v_line int; v_status text; v_approve_key text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a receipt amount must be positive'
      using errcode='CLR10',detail='{"reason":"amount_invalid"}';
  end if;
  v_disc := coalesce(p_discount_cents, 0);
  if v_disc < 0 then
    raise exception 'a settlement discount cannot be negative'
      using errcode='CLR10',detail='{"reason":"discount_invalid"}';
  end if;
  v_gross := p_amount_cents + v_disc;
  -- ck_je_basis demands a document or a memo, and a settlement never has a document, so the
  -- memo is synthesised rather than refused when blank: a receipt is real work and should not
  -- fail on a blank field the system can fill honestly.
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Customer receipt');
  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;
  if v_cp_kind is distinct from 'customer' then
    raise exception 'a customer receipt requires a counterparty of kind customer'
      using errcode='CLR10',detail='{"reason":"counterparty_kind_mismatch"}';
  end if;

  -- NORMALIZE the allocation set BEFORE hashing it. Validated straight off the raw argument
  -- so a malformed uuid or a fractional amount becomes a NAMED refusal rather than a raw cast
  -- error a caller cannot act on.
  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'the allocation set must be a json array'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'amount_cents') <> 'number'
       or (x.elem->>'amount_cents')::numeric <= 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each allocation must state an item_id and a positive whole amount_cents'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'amount_cents', t.amt)
           order by t.item_id), '[]'::jsonb),
         count(*)::int, count(distinct t.item_id)::int, coalesce(sum(t.amt), 0)
    into v_allocs, v_n, v_dis, v_sum
    from (select (x.elem->>'item_id')::uuid as item_id,
                 (x.elem->>'amount_cents')::bigint as amt
          from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same open item appears twice in one allocation set; state one line per item'
      using errcode='CLR10',detail='{"reason":"allocations_duplicated"}';
  end if;
  v_residue := v_gross - v_sum;
  if v_residue < 0 then
    raise exception 'the allocations exceed the receipt (amount plus discount)'
      using errcode='CLR10',detail='{"reason":"allocations_exceed_receipt"}';
  end if;

  -- THE REQUEST HASH CARRIES EVERY ARGUMENT THAT REACHES A STORED COLUMN OR A DECISION, and
  -- p_control_account is both: it decides WHICH receivable control account the entry credits.
  -- Omitting it would let the same op_key replayed with a different control account return
  -- the FIRST call's receipt while the caller believes the second request landed -- a silent
  -- wrong-account post with a green receipt, which is exactly the failure mode op hashes
  -- exist to prevent.
  v_dedupe := clara._reserve_op(c.firm, 'allocate_receipt', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'counterparty', v_cp,
      'posting_date', p_posting_date, 'memo', v_memo, 'bank_account', p_bank_account,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'discount_account', p_discount_account, 'control_account', p_control_account,
      'attestation', p_attestation, 'allocations', v_allocs)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- PRE-RESERVE THE DERIVED APPROVE SUB-KEY HERE, BEFORE ANY LOCK. _reserve_op writes an
  -- op_receipts row, so it can BLOCK on a concurrent inserter of the same key. Taking that
  -- block while already holding the two client advisory locks (as the original build did, at
  -- the bottom of this body) makes a deadlock reachable: two sessions, each holding the other
  -- session's next rung. Claiming the sub-key namespace first -- before 203005003 -- closes
  -- the window entirely, and it costs nothing, because the reservation is rolled back with
  -- everything else if this call fails (0004:43-60). The hash pins the COMPOSITE's own key
  -- rather than (entry, revision), which do not exist yet; the core never re-checks it
  -- (receipt_preheld:true skips its own reserve) and its only jobs are to claim the namespace
  -- against a later human approve_entry replay and to be finished by the core's _finish_op.
  -- ON THE WCA-R7 DRAFT BRANCH the core is never called, so the sub-key stays CLAIMED BUT
  -- UNFINISHED for the life of the draft. That is the honest cost of moving the reservation
  -- ahead of the locks, and it is the safe direction: the namespace stays reserved, and the
  -- checker approves through their OWN op_key on the ordinary /queue lane.
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'allocate_receipt',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
  end if;

  -- LOCKS, in the total order. See the section header for why the two advisory locks are
  -- taken HERE rather than left to the core.
  perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_cp::text));
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- THE CONTROL ACCOUNT. Plural control accounts per class are legal (design 2.7), so the
  -- composite NEVER silently picks: with one active receivable-class account it is used;
  -- with several, the caller must name one via p_control_account (the explicit lane).
  if p_control_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_control_account
                     and a.account_class = 'receivable' and a.is_active) then
      raise exception 'p_control_account % is not an active receivable-class account of this client', p_control_account
        using errcode='CLR10',detail='{"reason":"control_account_invalid"}';
    end if;
    v_ctrl := p_control_account;
  else
    select count(*)::int, min(a.account_code) into v_ctrl_n, v_ctrl
      from clara.coa_accounts a
      where a.client_id = p_client and a.account_class = 'receivable' and a.is_active;
    if v_ctrl_n <> 1 then
      raise exception 'this client has % active receivable control accounts; name one via p_control_account', v_ctrl_n
        using errcode='CLR10',detail='{"reason":"ar_control_not_unique"}';
    end if;
  end if;
  -- The bank leg must be an ACTIVE, ASSET-typed, NON-CONTROL account. Asset-typed is not
  -- decoration: the receipt floor forbids income legs, so an income-typed "bank" account would
  -- build an entry that refuses at commit with a message about the floor rather than about the
  -- account the caller actually got wrong.
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_bank_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the receipt account must be an active, asset-typed, non-control account on this chart'
      using errcode='CLR10',detail='{"reason":"bank_account_invalid"}';
  end if;
  -- account_class IS NULL on the discount account too, for the same reason it is demanded of
  -- the bank leg: a control-class account admitted here would put a SECOND receivable leg on
  -- a customer_receipt, which the shape floor refuses at commit with a message about the
  -- floor rather than about the account the caller actually got wrong -- and, worse, a
  -- payable-class "discount" account would build a cross-domain contra out of a settlement.
  if v_disc > 0 then
    if p_discount_account is null
       or not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = p_discount_account
                        and a.is_active and a.account_type = 'expense'
                        and a.account_class is null) then
      raise exception 'a receipt discount must be booked to an active, non-control expense account'
        using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
    end if;
  elsif p_discount_account is not null then
    raise exception 'a discount account was named but no discount amount was stated'
      using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
  end if;

  -- VALIDATE THE ALLOCATION SET AGAINST OUTSTANDING, UNDER THE BATCH ROW LOCK.
  select array_agg(distinct (x.elem->>'item_id')::uuid) into v_ids
    from jsonb_array_elements(v_allocs) as x(elem);
  if v_ids is not null then
    perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;
  end if;
  v_prop_allocs := '[]'::jsonb;
  for al in select (x.elem->>'item_id')::uuid as item_id,
                  (x.elem->>'amount_cents')::bigint as amt
           from jsonb_array_elements(v_allocs) as x(elem) order by 1 loop
    select * into i from clara.open_items oi where oi.id = al.item_id;
    if not found or i.client_id <> p_client or i.firm_id <> c.firm then
      raise exception 'open item % is not in this client', al.item_id using errcode='CLR11';
    end if;
    if i.domain <> 'ar' then
      raise exception 'open item % is not a receivable item', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_domain_mismatch"}';
    end if;
    -- Canonicalise on READ as well as on write: a merge performed after the item was written
    -- does not repoint history, exactly as it does not for journal_lines.
    if clara._canonical_counterparty(p_client, i.counterparty_id) <> v_cp then
      raise exception 'open item % belongs to a different customer', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_counterparty_mismatch"}';
    end if;
    -- THE REVERSED-ENTRY WALL, on the real-cash path. An entry that has been REVERSED is out
    -- of the books; its item's outstanding is a number the reversal has already answered with
    -- an unwind item of the exact opposite sign. Receipting against it would take real money
    -- in against a claim that no longer exists, leave the unwind permanently un-applied, and
    -- show the customer as paid on an invoice that was cancelled. The remedy is the sanctioned
    -- one and the message names it: apply the unwind to the item (apply_open_items), which
    -- takes both to zero with no GL movement at all.
    --
    -- READ SEPARATELY, not folded into the credit-note wall's `join clara.documents`: that
    -- join is INNER and silently skips every entry with no document -- which is every generic
    -- JV, every opening entry and every entry born outside a filing. A wall that cannot see
    -- document-less entries is not a wall.
    select je.reversed_by into v_rev_by
      from clara.journal_entries je where je.id = i.entry_id;
    if v_rev_by is not null then
      raise exception 'open item % belongs to an entry that has been reversed; apply the reversal unwind to it instead of receipting against it', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_reversed"}';
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to receipt against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
    if al.amt > v_out then
      raise exception 'allocation of % exceeds the % outstanding on open item %', al.amt, v_out, al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_exceeds_outstanding"}';
    end if;
    -- PIN THE OUTSTANDING THIS VALIDATION ACTUALLY SAW into the stored proposal. On the
    -- WCA-R7 draft branch the hook re-validates at the CHECKER's approve, and "still fits"
    -- is not the same statement as "nothing moved": an intervening partial allocation that
    -- leaves room would silently change what the maker proposed. The pin rides the PROPOSAL,
    -- never the op hash -- the hash must stay a function of the CALLER's request alone, or a
    -- legitimate retry of the identical request would be rejected as different args.
    v_prop_allocs := v_prop_allocs || jsonb_build_object('item_id', al.item_id,
      'amount_cents', al.amt, 'expected_outstanding_cents', v_out);
  end loop;

  -- THE SETTLEMENT ENTRY. Dr bank (amount) [+ Dr discount] / Cr receivable control (gross).
  -- The control credit of amount+discount is what makes the settlement item exactly -gross,
  -- so the classifier needs no knowledge of discounts at all.
  v_group := gen_random_uuid();
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      'customer_receipt', c.actor, c.actor,
      jsonb_build_object('settlement_allocation', jsonb_build_object(
        'domain', 'ar', 'counterparty_id', v_cp, 'group', v_group,
        'control_account', v_ctrl,
        'allocations', v_prop_allocs, 'residue_cents', v_residue, 'proposed_by', c.actor)))
    returning id into v_entry;
  v_line := 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, p_bank_account, p_amount_cents, 0, v_memo, null);
  if v_disc > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, v_line, p_discount_account, v_disc, 0, 'Settlement discount', null);
  end if;
  v_line := v_line + 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, v_ctrl, 0, v_gross, v_memo, v_cp);
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read
  -- at INSERT ... RETURNING time is already stale by the time the core checks it.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if clara.is_high_stakes(v_entry) then
    -- WCA-R7: leave a DRAFT carrying the validated proposal. The checker approves it through
    -- the ordinary /queue lane and the hook materialises everything, re-validating outstanding
    -- at that moment.
    v_status := 'draft';
  else
    -- The sub-key was pre-reserved at the top of this body, before any lock (see there).
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'allocate_receipt', v_entry,
    jsonb_build_object('client', p_client, 'counterparty', v_cp, 'group', v_group,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'control_account', v_ctrl, 'bank_account', p_bank_account,
      'allocated_cents', v_sum, 'residue_cents', v_residue, 'status', v_status,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'allocate_receipt', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'status', v_status,
      'group_id', v_group, 'control_account', v_ctrl, 'residue_cents', v_residue));
end $$;

-- The EXACT MIRROR for AP. Dr payable control (gross) / Cr bank (amount) [+ Cr discount
-- INCOME]. Every clause has the same justification as its AR twin above and is not repeated;
-- the two genuine differences are commented where they occur.
create function clara.allocate_payment(
    p_client uuid, p_counterparty uuid, p_posting_date date, p_memo text,
    p_bank_account text, p_amount_cents bigint, p_allocations jsonb, p_op_key text,
    p_discount_cents bigint default 0, p_discount_account text default null,
    p_attestation text default null, p_control_account text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_cp uuid; v_cp_kind text;
  v_memo text; v_disc bigint; v_gross bigint; v_ctrl text; v_ctrl_n int;
  v_allocs jsonb; v_prop_allocs jsonb; v_n int; v_dis int; v_sum bigint; v_residue bigint;
  v_ids uuid[]; al record; v_out bigint; i record; v_doc_kind text; v_rev_by uuid;
  v_group uuid; v_entry uuid; v_rev uuid; v_line int; v_status text; v_approve_key text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'a payment amount must be positive'
      using errcode='CLR10',detail='{"reason":"amount_invalid"}';
  end if;
  v_disc := coalesce(p_discount_cents, 0);
  if v_disc < 0 then
    raise exception 'a settlement discount cannot be negative'
      using errcode='CLR10',detail='{"reason":"discount_invalid"}';
  end if;
  v_gross := p_amount_cents + v_disc;
  v_memo := coalesce(nullif(btrim(p_memo), ''), 'Supplier payment');
  v_cp := clara._canonical_counterparty(p_client, p_counterparty);
  if v_cp is null then
    raise exception 'counterparty not found for this client' using errcode='CLR11';
  end if;
  select cp.kind into v_cp_kind from clara.counterparties cp where cp.id = v_cp;
  if v_cp_kind is distinct from 'vendor' then
    raise exception 'a supplier payment requires a counterparty of kind vendor'
      using errcode='CLR10',detail='{"reason":"counterparty_kind_mismatch"}';
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'the allocation set must be a json array'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'amount_cents') <> 'number'
       or (x.elem->>'amount_cents')::numeric <= 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each allocation must state an item_id and a positive whole amount_cents'
      using errcode='CLR10',detail='{"reason":"allocations_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_id, 'amount_cents', t.amt)
           order by t.item_id), '[]'::jsonb),
         count(*)::int, count(distinct t.item_id)::int, coalesce(sum(t.amt), 0)
    into v_allocs, v_n, v_dis, v_sum
    from (select (x.elem->>'item_id')::uuid as item_id,
                 (x.elem->>'amount_cents')::bigint as amt
          from jsonb_array_elements(coalesce(p_allocations,'[]'::jsonb)) as x(elem)) t;
  if v_n <> v_dis then
    raise exception 'the same open item appears twice in one allocation set; state one line per item'
      using errcode='CLR10',detail='{"reason":"allocations_duplicated"}';
  end if;
  v_residue := v_gross - v_sum;
  if v_residue < 0 then
    raise exception 'the allocations exceed the payment (amount plus discount)'
      using errcode='CLR10',detail='{"reason":"allocations_exceed_payment"}';
  end if;

  -- p_control_account is in the hash for the reason its AR twin states: it decides WHICH
  -- payable control account the entry debits, so a replay under the same key with a different
  -- control account must not return the first call's receipt.
  v_dedupe := clara._reserve_op(c.firm, 'allocate_payment', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'counterparty', v_cp,
      'posting_date', p_posting_date, 'memo', v_memo, 'bank_account', p_bank_account,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'discount_account', p_discount_account, 'control_account', p_control_account,
      'attestation', p_attestation, 'allocations', v_allocs)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- The derived approve sub-key is pre-reserved BEFORE any lock, exactly as in the AR twin
  -- (see the full reasoning there): _reserve_op can block on a concurrent inserter, and
  -- blocking on it while holding the two client advisory locks makes a deadlock reachable.
  v_approve_key := p_op_key || ':approve';
  if clara._reserve_op(c.firm, 'approve_entry', v_approve_key,
       clara._hash(jsonb_build_object('composite', 'allocate_payment',
         'op_key', p_op_key))) is not null then
    raise exception 'the derived approve op key is already in use'
      using errcode='CLR10',detail='{"reason":"approve_key_collision"}';
  end if;

  perform pg_advisory_xact_lock(203005003, hashtext(p_client::text||':'||v_cp::text));
  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  -- The control account: same explicit-lane law as the receipt side (never a silent pick).
  if p_control_account is not null then
    if not exists (select 1 from clara.coa_accounts a
                   where a.client_id = p_client and a.account_code = p_control_account
                     and a.account_class = 'payable' and a.is_active) then
      raise exception 'p_control_account % is not an active payable-class account of this client', p_control_account
        using errcode='CLR10',detail='{"reason":"control_account_invalid"}';
    end if;
    v_ctrl := p_control_account;
  else
    select count(*)::int, min(a.account_code) into v_ctrl_n, v_ctrl
      from clara.coa_accounts a
      where a.client_id = p_client and a.account_class = 'payable' and a.is_active;
    if v_ctrl_n <> 1 then
      raise exception 'this client has % active payable control accounts; name one via p_control_account', v_ctrl_n
        using errcode='CLR10',detail='{"reason":"ap_control_not_unique"}';
    end if;
  end if;
  if not exists (select 1 from clara.coa_accounts a
                 where a.client_id = p_client and a.account_code = p_bank_account
                   and a.is_active and a.account_type = 'asset' and a.account_class is null) then
    raise exception 'the payment account must be an active, asset-typed, non-control account on this chart'
      using errcode='CLR10',detail='{"reason":"bank_account_invalid"}';
  end if;
  -- THE ONE ASYMMETRY: a supplier settlement discount is INCOME (a discount received), where a
  -- customer settlement discount is an expense (a discount given). account_class IS NULL is
  -- demanded here too -- a control-class "discount" account would put a second payable leg on
  -- the payment, or a receivable one, which is a cross-domain contra dressed as a discount.
  if v_disc > 0 then
    if p_discount_account is null
       or not exists (select 1 from clara.coa_accounts a
                      where a.client_id = p_client and a.account_code = p_discount_account
                        and a.is_active and a.account_type = 'income'
                        and a.account_class is null) then
      raise exception 'a payment discount must be booked to an active, non-control income account'
        using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
    end if;
  elsif p_discount_account is not null then
    raise exception 'a discount account was named but no discount amount was stated'
      using errcode='CLR10',detail='{"reason":"discount_account_invalid"}';
  end if;

  select array_agg(distinct (x.elem->>'item_id')::uuid) into v_ids
    from jsonb_array_elements(v_allocs) as x(elem);
  if v_ids is not null then
    perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;
  end if;
  v_prop_allocs := '[]'::jsonb;
  for al in select (x.elem->>'item_id')::uuid as item_id,
                  (x.elem->>'amount_cents')::bigint as amt
           from jsonb_array_elements(v_allocs) as x(elem) order by 1 loop
    select * into i from clara.open_items oi where oi.id = al.item_id;
    if not found or i.client_id <> p_client or i.firm_id <> c.firm then
      raise exception 'open item % is not in this client', al.item_id using errcode='CLR11';
    end if;
    if i.domain <> 'ap' then
      raise exception 'open item % is not a payable item', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_domain_mismatch"}';
    end if;
    if clara._canonical_counterparty(p_client, i.counterparty_id) <> v_cp then
      raise exception 'open item % belongs to a different supplier', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_counterparty_mismatch"}';
    end if;
    -- THE REVERSED-ENTRY WALL, on the real-cash path -- and on THIS side it is money going
    -- OUT. Paying against an item whose entry has been reversed pays a bill the books have
    -- already cancelled. Read as its OWN statement rather than folded into the credit-note
    -- join below: that join is INNER on clara.documents and cannot see a document-less entry
    -- at all, which is every generic JV and every opening entry. The remedy named in the
    -- message is the sanctioned one -- apply the unwind item to this item, zero GL movement.
    select je.reversed_by into v_rev_by
      from clara.journal_entries je where je.id = i.entry_id;
    if v_rev_by is not null then
      raise exception 'open item % belongs to an entry that has been reversed; apply the reversal unwind to it instead of paying against it', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_reversed"}';
    end if;
    -- THE CREDIT-NOTE WALL (Wave-C contract section 3, discharged). supplier_credit_note has
    -- no coding home yet, so a supplier CN mis-coded AS a bill still mints a payable item --
    -- and paying against it would turn a coding error into a path to real cash. Refusing when
    -- the item's entry is bound to a document the classifier called a credit_note converts the
    -- trap back into a VISIBLE coding error the human must fix first. The residual exposure is
    -- recorded honestly: a CN whose document was never classified as one is still reachable,
    -- and only supplier_credit_note closes that for good.
    select d.document_kind into v_doc_kind
      from clara.journal_entries je
      join clara.documents d on d.id = je.document_id
      where je.id = i.entry_id;
    if v_doc_kind = 'credit_note' then
      raise exception 'open item % comes from a document classified as a credit note; fix the coding before paying against it', al.item_id
        using errcode='CLR10',detail='{"reason":"credit_note_item"}';
    end if;
    v_out := clara._subledger_outstanding(al.item_id);
    if v_out is null or v_out <= 0 then
      raise exception 'open item % has nothing outstanding to pay against', al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_target_not_open"}';
    end if;
    if al.amt > v_out then
      raise exception 'allocation of % exceeds the % outstanding on open item %', al.amt, v_out, al.item_id
        using errcode='CLR10',detail='{"reason":"allocation_exceeds_outstanding"}';
    end if;
    -- The outstanding THIS validation saw, pinned into the proposal so the hook can require
    -- EQUALITY at the checker's approve rather than "still fits" (see the AR twin).
    v_prop_allocs := v_prop_allocs || jsonb_build_object('item_id', al.item_id,
      'amount_cents', al.amt, 'expected_outstanding_cents', v_out);
  end loop;

  v_group := gen_random_uuid();
  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      coding_kind, maker_actor, last_human_editor, flags)
    values (p_client, 'draft', p_posting_date, v_memo, 'manual',
      'supplier_payment', c.actor, c.actor,
      jsonb_build_object('settlement_allocation', jsonb_build_object(
        'domain', 'ap', 'counterparty_id', v_cp, 'group', v_group,
        'control_account', v_ctrl,
        'allocations', v_prop_allocs, 'residue_cents', v_residue, 'proposed_by', c.actor)))
    returning id into v_entry;
  v_line := 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, v_ctrl, v_gross, 0, v_memo, v_cp);
  v_line := v_line + 1;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
      credit_cents, description, counterparty_id)
    values (v_entry, v_line, p_bank_account, 0, p_amount_cents, v_memo, null);
  if v_disc > 0 then
    v_line := v_line + 1;
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents,
        credit_cents, description, counterparty_id)
      values (v_entry, v_line, p_discount_account, 0, v_disc, 'Settlement discount', null);
  end if;
  perform clara._assert_balanced(v_entry);
  -- Read the revision token AFTER the lines land: the line writes rotate it, so a token read
  -- at INSERT ... RETURNING time is already stale by the time the core checks it.
  select je.revision_token into v_rev from clara.journal_entries je where je.id = v_entry;

  if clara.is_high_stakes(v_entry) then
    v_status := 'draft';
  else
    -- The sub-key was pre-reserved at the top of this body, before any lock (see there).
    perform clara._approve_entry_core(
      jsonb_build_object('actor', c.actor, 'firm', c.firm, 'receipt_preheld', true),
      v_entry, v_rev, p_attestation, v_approve_key);
    v_status := 'approved';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'allocate_payment', v_entry,
    jsonb_build_object('client', p_client, 'counterparty', v_cp, 'group', v_group,
      'amount_cents', p_amount_cents, 'discount_cents', v_disc,
      'control_account', v_ctrl, 'bank_account', p_bank_account,
      'allocated_cents', v_sum, 'residue_cents', v_residue, 'status', v_status,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'allocate_payment', p_op_key,
    jsonb_build_object('entry_id', v_entry, 'status', v_status,
      'group_id', v_group, 'control_account', v_ctrl, 'residue_cents', v_residue));
end $$;

-- =====================================================================
-- clara.unallocate_group -- the EXACT NEGATION of an entire application_group.
--
-- Whole-group, never row-by-row: a group is one human act ("this payment settles these three
-- invoices") and undoing half of it would leave a state no human ever intended. The negation
-- rows carry reverses_allocation_id, which is UNIQUE where not null -- so no allocation can be
-- undone twice, structurally, and a replayed op_key returns the first receipt rather than
-- writing a second negation.
--
-- It takes the client advisory lock BEFORE the item row locks (design 4.9): that is what makes
-- it serialize against a composite approve rather than race it, and it is the same order the
-- allocate composites use.
-- =====================================================================
create function clara.unallocate_group(
    p_client uuid, p_group uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_reason text; v_ids uuid[];
  v_new uuid; v_n int; v_dom text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'an unallocation reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'unallocate_group', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'group', p_group,
      'reason', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select count(*)::int, min(oa.domain) into v_n, v_dom
    from clara.open_item_allocations oa
    where oa.application_group = p_group and oa.client_id = p_client and oa.firm_id = c.firm;
  if v_n = 0 then
    raise exception 'application group not found for this client' using errcode='CLR11';
  end if;
  if exists (select 1 from clara.open_item_allocations oa
             where oa.application_group = p_group and oa.operation_kind = 'unallocate') then
    raise exception 'an unallocation cannot itself be unallocated; re-allocate instead'
      using errcode='CLR10',detail='{"reason":"not_unallocatable"}';
  end if;
  if exists (select 1 from clara.open_item_allocations src
             join clara.open_item_allocations rev on rev.reverses_allocation_id = src.id
             where src.application_group = p_group) then
    raise exception 'this application group has already been unallocated'
      using errcode='CLR10',detail='{"reason":"already_unallocated"}';
  end if;

  select array_agg(distinct oa.item_id) into v_ids
    from clara.open_item_allocations oa where oa.application_group = p_group;
  perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;

  v_new := gen_random_uuid();
  insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
      application_group, operation_kind, reverses_allocation_id, amount_cents, reason,
      created_by)
    select oa.firm_id, oa.client_id, oa.domain, oa.item_id, v_new, 'unallocate', oa.id,
           -oa.amount_cents, v_reason, c.actor
    from clara.open_item_allocations oa
    where oa.application_group = p_group order by oa.id;
  get diagnostics v_n = row_count;

  perform clara._audit(c.firm, c.actor, null, null, 'unallocate_group', null,
    jsonb_build_object('client', p_client, 'reversed_group', p_group,
      'group', v_new, 'rows', v_n, 'reason', v_reason, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'open_item.unallocated', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('application_group', v_new, 'reversed_group', p_group,
      'domain', v_dom, 'rows', v_n));
  return clara._finish_op(c.firm, 'unallocate_group', p_op_key,
    jsonb_build_object('group_id', v_new, 'reversed_group', p_group, 'allocations', v_n));
end $$;

-- =====================================================================
-- clara.apply_open_items (WCA-R3) -- pair mechanics between two EXISTING items, with no GL
-- movement at all. The canonical case is applying a credit note to an invoice: both positions
-- already exist in the books, nothing new is recognised, and the only thing that changes is
-- which of them is still outstanding.
--
-- +amt goes on the NEGATIVE source item and -amt on the POSITIVE target: both move TOWARD
-- ZERO, which is what makes the two-sided bound the right guard for this verb as well as for
-- allocation. Same domain, same canonical counterparty, and the group nets to zero per
-- (client, domain) by construction. CROSS-ANYTHING IS REFUSED WITH THE GL ROUTE NAMED: a
-- set-off between two parties, or across AR and AP, changes what each party owes and is a GL
-- event -- it rides a clearing entry, never an application. That is the teeming-and-lading
-- wall, and it is the reason this verb is safe to give a bookkeeper.
-- =====================================================================
create function clara.apply_open_items(
    p_client uuid, p_applications jsonb, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; v_firm uuid; v_reason text; v_apps jsonb;
  v_ids uuid[]; v_group uuid; v_n int; v_doms int; v_parties int; v_dom text;
  al record; si record; ti record; v_sout bigint; v_tout bigint; v_total bigint := 0;
  v_orig uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select cl.firm_id into v_firm from clara.clients cl where cl.id = p_client;
  if v_firm is null or v_firm <> c.firm then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'an application reason is required'
      using errcode='CLR10',detail='{"reason":"reason_required"}';
  end if;
  if p_applications is null or jsonb_typeof(p_applications) <> 'array'
     or jsonb_array_length(p_applications) = 0 then
    raise exception 'the application set must be a non-empty json array'
      using errcode='CLR10',detail='{"reason":"applications_malformed"}';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_applications) as x(elem)
    where jsonb_typeof(x.elem) <> 'object'
       or coalesce(x.elem->>'source_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(x.elem->>'target_item_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(x.elem->'amount_cents') <> 'number'
       or (x.elem->>'amount_cents')::numeric <= 0
       or (x.elem->>'amount_cents')::numeric <> trunc((x.elem->>'amount_cents')::numeric)
  ) then
    raise exception 'each application must state a source_item_id, a target_item_id and a positive whole amount_cents'
      using errcode='CLR10',detail='{"reason":"applications_malformed"}';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('source_item_id', t2.s,
           'target_item_id', t2.t, 'amount_cents', t2.amt) order by t2.s, t2.t, t2.amt),
           '[]'::jsonb)
    into v_apps
    from (select (x.elem->>'source_item_id')::uuid as s,
                 (x.elem->>'target_item_id')::uuid as t,
                 (x.elem->>'amount_cents')::bigint as amt
          from jsonb_array_elements(p_applications) as x(elem)) t2;

  v_dedupe := clara._reserve_op(c.firm, 'apply_open_items', p_op_key,
    clara._hash(jsonb_build_object('client', p_client, 'reason', v_reason,
      'applications', v_apps)));
  if v_dedupe is not null then return v_dedupe; end if;

  perform pg_advisory_xact_lock(203005004, hashtext(p_client::text));

  select array_agg(distinct z.id) into v_ids from (
    select (x.elem->>'source_item_id')::uuid as id from jsonb_array_elements(v_apps) as x(elem)
    union
    select (x.elem->>'target_item_id')::uuid from jsonb_array_elements(v_apps) as x(elem)
  ) z;
  perform 1 from clara.open_items oi where oi.id = any(v_ids) order by oi.id for update;

  select count(*)::int into v_n from clara.open_items oi
    where oi.id = any(v_ids) and oi.client_id = p_client and oi.firm_id = c.firm;
  if v_n <> array_length(v_ids, 1) then
    raise exception 'one or more open items are not in this client' using errcode='CLR11';
  end if;
  select count(distinct oi.domain)::int, min(oi.domain),
         count(distinct clara._canonical_counterparty(oi.client_id, oi.counterparty_id))::int
    into v_doms, v_dom, v_parties
    from clara.open_items oi where oi.id = any(v_ids);
  if v_doms <> 1 then
    raise exception 'an application cannot span the receivable and payable domains; post a clearing entry instead'
      using errcode='CLR10',detail='{"reason":"cross_domain_application"}';
  end if;
  if v_parties <> 1 then
    raise exception 'an application cannot span counterparties; a set-off between parties is a GL event and must ride a clearing entry'
      using errcode='CLR10',detail='{"reason":"cross_counterparty_application"}';
  end if;

  v_group := gen_random_uuid();
  for al in select (x.elem->>'source_item_id')::uuid as s,
                  (x.elem->>'target_item_id')::uuid as t,
                  (x.elem->>'amount_cents')::bigint as amt
           from jsonb_array_elements(v_apps) as x(elem) order by 1, 2, 3 loop
    if al.s = al.t then
      raise exception 'an application cannot point an open item at itself'
        using errcode='CLR10',detail='{"reason":"application_self_reference"}';
    end if;
    select * into si from clara.open_items oi where oi.id = al.s;
    select * into ti from clara.open_items oi where oi.id = al.t;
    -- THE REVERSED-ENTRY WALL, with the ONE exception that makes reversal survivable -- and
    -- the exception is an ENTRY-LEVEL LINEAGE LAW, not an exact-id one. An item whose entry
    -- has been reversed is a claim the books have cancelled, and applying an unrelated credit
    -- to it (or applying it, as a credit, to something else) launders a cancelled position
    -- into a live one. The SANCTIONED remedy for a reversed entry is exactly an application:
    -- the mirror's reversal_unwind item against the original entry's item(s), everything to
    -- zero, zero GL movement.
    --
    -- WHY THE ORIGINAL ENTRY AND NOT THE reversal_unwind_of POINTER. An exact-id test carries
    -- two defects, one of them a hole.
    --   (a) THE HOLE. An unwind item's OWN entry is the MIRROR, which carries reversal_of and
    --       never reversed_by. So a pair of (unwind, some UNRELATED LIVE invoice) failed the
    --       id test, fell through to the reversed-entry probe, found nothing reversed on
    --       either side -- and committed. The unwind then settled a live claim while the item
    --       it was minted to cancel stayed open at full face value. The wall has to be a wall
    --       from the unwind's side too, and only its lineage can say so.
    --   (b) THE MANY-TO-ONE CLOSURE. When a merge collapses two parties of one original into
    --       one canonical party, the mirror mints ONE unwind for the whole collapsed set, and
    --       reversal_unwind_of can name only min(id) of it. An exact-id test therefore left
    --       every OTHER original item permanently unclosable by the only instrument that
    --       exists for it.
    -- The law: an item of kind 'reversal_unwind' pairs ONLY with items anchored to the entry
    -- its own entry reverses. Same domain and ONE canonical counterparty already hold across
    -- the whole set (the two refusals above), so the entry is the remaining degree of freedom.
    -- reversal_unwind_of stays as LINEAGE -- which item headed the collapsed set -- and is
    -- never again read as an authorisation. A NON-unwind pair cannot enter the exemption at
    -- all (the branch is keyed on item_kind, which belt-2 ties to the entry's reversal_of), so
    -- the wall below still refuses a pair where EITHER side's entry has been reversed. Read
    -- from journal_entries directly on both sides: apply_open_items touches documents nowhere
    -- and must not start.
    if si.item_kind = 'reversal_unwind' or ti.item_kind = 'reversal_unwind' then
      if si.item_kind = 'reversal_unwind' then
        select je.reversal_of into v_orig
          from clara.journal_entries je where je.id = si.entry_id;
        if v_orig is null or ti.entry_id is distinct from v_orig then
          raise exception 'open item % is a reversal unwind; it discharges only the entry it reverses, and open item % does not belong to that entry', al.s, al.t
            using errcode='CLR10',detail='{"reason":"unwind_lineage_mismatch"}';
        end if;
      end if;
      if ti.item_kind = 'reversal_unwind' then
        select je.reversal_of into v_orig
          from clara.journal_entries je where je.id = ti.entry_id;
        if v_orig is null or si.entry_id is distinct from v_orig then
          raise exception 'open item % is a reversal unwind; it discharges only the entry it reverses, and open item % does not belong to that entry', al.t, al.s
            using errcode='CLR10',detail='{"reason":"unwind_lineage_mismatch"}';
        end if;
      end if;
    elsif exists (select 1 from clara.journal_entries je
                  where je.id in (si.entry_id, ti.entry_id) and je.reversed_by is not null) then
      raise exception 'one of open items % / % belongs to a reversed entry; the only application a reversed entry admits is its own unwind', al.s, al.t
        using errcode='CLR10',detail='{"reason":"allocation_target_reversed"}';
    end if;
    v_sout := clara._subledger_outstanding(al.s);
    v_tout := clara._subledger_outstanding(al.t);
    -- The SOURCE must have a NEGATIVE outstanding (a credit the client holds) and the TARGET
    -- a POSITIVE one (a claim still open). Both move toward zero by exactly amt.
    if v_sout is null or v_sout >= 0 then
      raise exception 'open item % has no credit outstanding to apply', al.s
        using errcode='CLR10',detail='{"reason":"application_target_not_open"}';
    end if;
    if v_tout is null or v_tout <= 0 then
      raise exception 'open item % has nothing outstanding to apply against', al.t
        using errcode='CLR10',detail='{"reason":"application_target_not_open"}';
    end if;
    if al.amt > -v_sout or al.amt > v_tout then
      raise exception 'application of % exceeds the outstanding on open item % or %', al.amt, al.s, al.t
        using errcode='CLR10',detail='{"reason":"allocation_exceeds_outstanding"}';
    end if;
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (si.firm_id, si.client_id, si.domain, al.s, v_group, 'apply', al.amt, v_reason, c.actor);
    insert into clara.open_item_allocations(firm_id, client_id, domain, item_id,
        application_group, operation_kind, amount_cents, reason, created_by)
      values (ti.firm_id, ti.client_id, ti.domain, al.t, v_group, 'apply', -al.amt, v_reason, c.actor);
    v_total := v_total + al.amt;
  end loop;

  perform clara._audit(c.firm, c.actor, null, null, 'apply_open_items', null,
    jsonb_build_object('client', p_client, 'group', v_group, 'domain', v_dom,
      'applied_cents', v_total, 'reason', v_reason, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'open_item.applied', p_client, c.actor,
    null, null, null, null, null,
    jsonb_build_object('application_group', v_group, 'domain', v_dom,
      'applied_cents', v_total));
  return clara._finish_op(c.firm, 'apply_open_items', p_op_key,
    jsonb_build_object('group_id', v_group, 'domain', v_dom, 'applied_cents', v_total));
end $$;

-- =====================================================================
-- SECTION L -- ACLs. The four composites are HUMAN VERBS and reach clara_authenticated ONLY.
-- No wake role, no clara_runtime, no clara_agent_ro, no PUBLIC: which obligation a payment
-- discharges is a judgement, and the agent never makes one. Every internal above carries its
-- own revoke; 0009 already set the default-privileges sweep, so these are belt-and-braces (the
-- _coding_lane_core idiom). Both new tables grant SELECT to clara_authenticated only, behind
-- FORCE RLS with a firm-scoped policy. All of it is asserted in TAIL PART 2.
-- =====================================================================
revoke all on function clara._assert_customer_receipt_shape_at(uuid,uuid) from public;
revoke all on function clara._assert_supplier_payment_shape_at(uuid,uuid) from public;
revoke all on function clara._assert_customer_receipt_shape(uuid) from public;
revoke all on function clara._assert_supplier_payment_shape(uuid) from public;
-- The six TRIGGER functions too: PostgreSQL grants EXECUTE to PUBLIC on every new
-- function by default and ADP does not stop it (the T17b-proven mechanism); a trigger
-- function needs no caller EXECUTE at all -- the trigger machinery runs it as the
-- table owner. Caught by the rig grant matrix on the first suite run.
revoke all on function clara._tf_assert_customer_receipt_shape() from public;
revoke all on function clara._tf_assert_supplier_payment_shape() from public;
revoke all on function clara._tf_subledger_entry_belt() from public;
revoke all on function clara._tf_subledger_item_belt() from public;
revoke all on function clara._tf_subledger_alloc_belt() from public;
revoke all on function clara._tf_open_items_validate() from public;

revoke all on function clara.allocate_receipt(
  uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text) from public;
revoke all on function clara.allocate_payment(
  uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text) from public;
revoke all on function clara.unallocate_group(uuid,uuid,text,text) from public;
revoke all on function clara.apply_open_items(uuid,jsonb,text,text) from public;

grant execute on function
  clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text),
  clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text),
  clara.unallocate_group(uuid,uuid,text,text),
  clara.apply_open_items(uuid,jsonb,text,text)
to clara_authenticated;

reset role;

-- =====================================================================
-- SECTION M -- Event taxonomy additions against the active taxonomy version (the 0028:1682
-- idiom). Five typed events, all client-scoped, all decision 'ignore': the subledger is
-- STATE, and the surfaces that read it (the queue, C-c's aging, the reconciliation workbench)
-- read the tables, not the stream. An event that claimed a notification would put a receipt
-- allocation in front of a human who has nothing to decide about it.
-- =====================================================================
with added(name,client_scoped,description,decision,note) as (values
  ('open_item.created',true,
    'An approved entry materialised an AR/AP open item','ignore',null::text),
  ('open_item.unwound',true,
    'A reversal unwound an AR/AP open item','ignore',null::text),
  ('open_item.allocated',true,
    'A settlement allocated against open items','ignore',null::text),
  ('open_item.unallocated',true,
    'An application group was unallocated','ignore',null::text),
  ('open_item.applied',true,
    'Two open items were applied against each other','ignore',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note
from added x
join inserted_types i on i.name=x.name
cross join clara.taxonomy_active a;

-- =====================================================================
-- TAIL, PART 1 of 2 -- the SOURCE-SHAPE self-verification. Every raise is a real assertion
-- failure, not a soft warning.
--
-- WHY THIS IS SPLIT IN TWO, since the seam is not cosmetic: scripts/check-wiki-dynamic-sql
-- fail-closes on any `do` block that BOTH reads a function body via pg_get_functiondef AND
-- carries the bare dynamic-SQL keyword, because that is precisely the change-of-record-patch
-- signature whose dynamically-constructed relation name migration 0019's prosrc scan cannot
-- see. This block genuinely reads bodies but installs nothing; the ACL assertions in PART 2
-- genuinely need that keyword (it is the spelling of has_function_privilege's privilege
-- argument) but read no body. Keeping them together would trip the gate, and the two dishonest
-- ways to silence it -- splitting the keyword across string literals, or widening the
-- allowlist -- are exactly what the gate exists to catch. Separating the concerns satisfies it
-- truthfully. (Sections H.2, H.3 and I earlier in this file ARE genuine change-of-record
-- patches and pass the same gate the way every prior one does: their replacement literals name
-- no wiki relation and carry no dynamic statement of their own.)
-- =====================================================================
do $tail$
declare
  v_prior int; r record; v_src text;
  v_core text; v_rev text; v_awcc text; v_aoe text; v_rsr text; v_cls text; v_draft text;
  v_revise text; v_pin text;
  v_a int; v_b int; v_c int; v_d int; v_e int; v_f int; v_n int;
  v_paths text[]; v_writers text[]; v_alloc_writers text[]; v_callers text[];
  v_oid_hook oid; v_marker text;
begin
  -- (1) MANDATORY PRIOR-MIGRATION CHECK. The deepest TRUE content dependency across the five
  -- bodies this migration recuts or patches is 0035's recut of clara._approve_entry_core; the
  -- other four last changed at 0017 or 0027, which the runner's ordering guarantees are in
  -- place if 0035 is. Independent of the tooling's own numeric frontier (0036), which touches
  -- none of the five.
  select count(*)::int into v_prior from clara.schema_migrations
    where version = '0035_drafting_trio';
  if v_prior <> 1 then
    raise exception '0037 tail: migration 0035_drafting_trio is not recorded as applied -- apply in order';
  end if;

  -- The 0035/0036 normalizer, reused verbatim: strip block comments, then line comments, then
  -- collapse whitespace, then lowercase. Stripping comments FIRST is load-bearing -- this
  -- migration's own commentary quotes almost every token probed below, so an un-normalized
  -- scan would pass on the prose alone.
  select pg_get_functiondef('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure) into v_core;
  select pg_get_functiondef('clara.reverse_entry(uuid,text,text)'::regprocedure) into v_rev;
  select pg_get_functiondef('clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure) into v_awcc;
  select pg_get_functiondef('clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure) into v_aoe;
  select pg_get_functiondef('clara.reconcile_sweep_runs()'::regprocedure) into v_rsr;
  select pg_get_functiondef('clara._subledger_classify_entry(uuid)'::regprocedure) into v_cls;
  select pg_get_functiondef(
    'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)'::regprocedure)
    into v_revise;
  select pg_get_functiondef(p.oid) into v_draft from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='clara' and p.proname='_draft_entry_core';
  v_core :=lower(regexp_replace(regexp_replace(regexp_replace(v_core ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_rev  :=lower(regexp_replace(regexp_replace(regexp_replace(v_rev  ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_awcc :=lower(regexp_replace(regexp_replace(regexp_replace(v_awcc ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_aoe  :=lower(regexp_replace(regexp_replace(regexp_replace(v_aoe  ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_rsr  :=lower(regexp_replace(regexp_replace(regexp_replace(v_rsr  ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_cls  :=lower(regexp_replace(regexp_replace(regexp_replace(v_cls  ,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_draft:=lower(regexp_replace(regexp_replace(regexp_replace(v_draft,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
  v_revise:=lower(regexp_replace(regexp_replace(regexp_replace(v_revise,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));

  -- (2) SECTION B, layer 2 -- the settlement refusal exists EXACTLY ONCE, with CLR10 and its
  -- named reason attached, and it sits AFTER the locked revision check (so a benign status
  -- race still reports not_a_draft first) and BEFORE the reversal-linkage mutation.
  v_n:=(length(v_core)-length(replace(v_core,'"reason":"settlement_not_autopostable"','')))
    / length('"reason":"settlement_not_autopostable"');
  if v_n <> 1 then
    raise exception '0037 tail: the settlement_not_autopostable refusal must appear exactly once in _approve_entry_core -- found %', v_n;
  end if;
  if position('using errcode=''clr10'',detail=''{"reason":"settlement_not_autopostable"}''' in v_core)=0 then
    raise exception '0037 tail: the settlement refusal is not raised as CLR10 with the named detail reason';
  end if;
  if position('if v_checked_via_rule is not null and e.coding_kind in (''customer_receipt'',''supplier_payment'') then' in v_core)=0 then
    raise exception '0037 tail: the settlement refusal does not test the rule id AND the settlement kinds -- the NULL-safe form was lost';
  end if;
  v_a:=position('if e.revision_token is distinct from p_expected_revision then' in v_core);
  v_b:=position('if v_checked_via_rule is not null and e.coding_kind in (''customer_receipt'',''supplier_payment'') then' in v_core);
  v_c:=position('update clara.journal_entries set reversed_by=p_entry,' in v_core);
  v_d:=position('perform clara._subledger_on_approve(p_entry);' in v_core);
  v_e:=position('and (e.coding_kind is null or e.coding_kind not in (''customer_receipt'',''supplier_payment'')) then' in v_core);
  if v_a=0 or v_b=0 or v_c=0 or v_d=0 or v_e=0
     or not (v_a < v_b and v_b < v_c and v_c < v_d and v_d < v_e) then
    raise exception '0037 tail: _approve_entry_core ordering is wrong (revision=%, settlement_refusal=%, reversal_linkage=%, hook=%, sighting_gate=%)',
      v_a, v_b, v_c, v_d, v_e;
  end if;
  v_n:=(length(v_core)-length(replace(v_core,'perform clara._subledger_on_approve(p_entry);','')))
    / length('perform clara._subledger_on_approve(p_entry);');
  if v_n <> 1 then
    raise exception '0037 tail: the subledger hook must appear exactly once in _approve_entry_core -- found %', v_n;
  end if;
  -- The hook must NEVER be gated on the rule id: an autopost materialises open items exactly
  -- like a human approval (contract item 5).
  if position('if v_checked_via_rule is null then perform clara._subledger_on_approve' in v_core)<>0 then
    raise exception '0037 tail: the subledger hook is gated on checked_via_rule_id -- autopost would leave an F3 breach behind';
  end if;
  -- 0035's own two edits must survive the rebuild.
  if position('no_counterparty_sighting' in v_core)=0
     or position('withdraw the draft and re-draft; the new draft will resolve against the current counterparty landscape' in v_core)=0 then
    raise exception '0037 tail: a 0035 edit (the no_counterparty_sighting advisory or the CLR23 withdraw-and-redraft remedy) did not survive the recut of _approve_entry_core';
  end if;

  -- (3) THE THREE PATCHED / RECUT PATHS keep their prior change-of-record markers AND carry
  -- their additions exactly once, in the right order.
  if position('opening_entry_k_family_only' in v_rev)=0 then
    raise exception '0037 tail: reverse_entry lost 0017 R1-F1 CLR31 opening boundary -- section H.2 rebuilt the body instead of patching it';
  end if;
  v_n:=(length(v_rev)-length(replace(v_rev,'"reason":"allocated_items_present"','')))
    / length('"reason":"allocated_items_present"');
  if v_n <> 1 then
    raise exception '0037 tail: the reverse refusal must appear exactly once in reverse_entry -- found %', v_n;
  end if;
  v_a:=position('if clara._subledger_allocated_items_present(p_entry) then' in v_rev);
  v_b:=position('insert into clara.journal_entries(client_id,status,posting_date,memo,origin,resolution_id,' in v_rev);
  v_c:=position('perform clara._subledger_on_approve(v_mirror);' in v_rev);
  if v_a=0 or v_b=0 or v_c=0 or not (v_a < v_b and v_b < v_c) then
    raise exception '0037 tail: reverse_entry ordering is wrong (refusal=%, mirror_insert=%, hook=%)', v_a, v_b, v_c;
  end if;

  if position('perform 1 from clara.documents where id=x.document_id for update;' in v_awcc)=0 then
    raise exception '0037 tail: approve_wrong_client_correction lost 0027 documents-before-document_filings lock order -- section H.3 rebuilt the body instead of patching it';
  end if;
  if position('adopted_reversal' in v_awcc)=0 then
    raise exception '0037 tail: approve_wrong_client_correction lost its reversal-adoption branch';
  end if;
  v_n:=(length(v_awcc)-length(replace(v_awcc,'perform clara._subledger_on_approve(v_mirror);','')))
    / length('perform clara._subledger_on_approve(v_mirror);');
  if v_n <> 1 then
    raise exception '0037 tail: the subledger hook must appear exactly once in approve_wrong_client_correction -- found %', v_n;
  end if;
  if position('if clara._subledger_allocated_items_present(o.id) then' in v_awcc)=0 then
    raise exception '0037 tail: approve_wrong_client_correction does not carry the allocated-items reverse refusal';
  end if;

  v_a:=position('update clara.journal_entries set status=''approved'',checker_actor=p_checker,' in v_aoe);
  v_b:=position('perform clara._subledger_on_approve(p_entry);' in v_aoe);
  v_c:=position('insert into clara.opening_seed_approvals(' in v_aoe);
  if v_a=0 or v_b=0 or v_c=0 or not (v_a < v_b and v_b < v_c) then
    raise exception '0037 tail: _approve_opening_entry ordering is wrong (status_flip=%, hook=%, seed_approval=%)', v_a, v_b, v_c;
  end if;

  -- (3c) SECTION H.2b -- revise_entry keeps BOTH its prior changes of record (0017's R1-F1
  -- boundary and 0028's binding-divergence surgery) and carries the reversal-mirror guard
  -- exactly once, positioned after the revision-token check so a stale token still reports
  -- CLR06 first.
  -- ONE MARKER PER SPLICED REGION, not one per migration. 0028 spliced revise_entry in FOUR
  -- places (0028:1446-1531) -- the declaration block, the binding-divergence derivation after
  -- _resolve_counterparty, the UPDATE that strips the two divergence columns plus the
  -- vendor_binding_resolutions row it writes, and the counterparty.binding_resolved event --
  -- and 0017 spliced the K-family lifecycle boundary before the op reservation. A marker set
  -- that named only three of those five could lose the event region (an entire change of
  -- record: the divergence stops being observable in the stream) and still pass. Each region
  -- now owns a marker that appears NOWHERE else in the body, so dropping any one of them
  -- fails the deploy. Whole-body pins are still rejected for the reason (3d) states.
  foreach v_marker in array array[
      'opening_entry_k_family_only',
      'v_binding_divergence boolean:=false',
      'v_binding_divergence:=v_binding_counterparty is not null',
      'coding_kind=case when v_binding_divergence then null else coding_kind end',
      'clara.vendor_binding_resolutions',
      '''counterparty.binding_resolved'''] loop
    if position(v_marker in v_revise)=0 then
      raise exception '0037 tail: revise_entry lost the 0017/0028 spliced region marked by "%" -- section H.2b rebuilt the body instead of patching it', v_marker;
    end if;
  end loop;
  v_n:=(length(v_revise)-length(replace(v_revise,'"reason":"reversal_mirror_not_revisable"','')))
    / length('"reason":"reversal_mirror_not_revisable"');
  if v_n <> 1 then
    raise exception '0037 tail: the reversal-mirror guard must appear exactly once in revise_entry -- found %', v_n;
  end if;
  v_a:=position('if e.revision_token is distinct from p_expected_revision then' in v_revise);
  v_b:=position('if e.reversal_of is not null then' in v_revise);
  v_c:=position('delete from clara.journal_lines where entry_id=p_entry;' in v_revise);
  if v_a=0 or v_b=0 or v_c=0 or not (v_a < v_b and v_b < v_c) then
    raise exception '0037 tail: revise_entry ordering is wrong (revision=%, mirror_guard=%, line_rewrite=%)', v_a, v_b, v_c;
  end if;

  -- (3d) THE EXACT SPLICED-REGION PINS. Every assert above this point is a TOKEN census: it
  -- says the addition is somewhere in the body, in some order. These say something stronger
  -- and different -- that the body contains EXACTLY the text this migration spliced,
  -- contiguously, once. The expected text is RESTATED here and pushed through the SAME
  -- normalizer the body went through, so a future edit to a splice that forgets to edit its
  -- pin fails the deploy instead of shipping a body nobody actually asserted. (A whole-body
  -- hash was considered and rejected: it would also pin the PostgreSQL functiondef renderer's
  -- formatting, turning a server upgrade into a migration failure on a from-zero rebuild,
  -- while adding nothing about the regions this migration is responsible for.)
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p1$  if p_reason is null or btrim(p_reason)='' then raise exception 'a reversal reason is required' using errcode='CLR10'; end if;
  perform pg_advisory_xact_lock(203005004,hashtext(o.client_id::text));
  if clara._subledger_allocated_items_present(p_entry) then
    raise exception 'open items on this entry carry allocations; unallocate them first'
      using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
  end if;$p1$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_rev)-length(replace(v_rev,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: reverse_entry does not carry the spliced reverse-refusal region verbatim, exactly once';
  end if;
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p2$    update clara.journal_entries set reversed_by=v_mirror,reversal_reason=p_reason,
      updated_at=now() where id=p_entry;
    perform clara._subledger_on_approve(v_mirror);
    v_status:='approved';$p2$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_rev)-length(replace(v_rev,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: reverse_entry does not carry the spliced inline-approve hook region verbatim, exactly once';
  end if;
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p3$  if e.revision_token is distinct from p_expected_revision then
    raise exception 'stale revision token' using errcode='CLR06';
  end if;
  if e.reversal_of is not null then
    raise exception 'a reversal mirror cannot be revised; withdraw the mirror and re-reverse the original'
      using errcode='CLR10',detail='{"reason":"reversal_mirror_not_revisable"}';
  end if;$p3$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_revise)-length(replace(v_revise,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: revise_entry does not carry the spliced reversal-mirror guard region verbatim, exactly once';
  end if;
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p4$    if it.action='reverse' then
      perform pg_advisory_xact_lock(203005004,hashtext(o.client_id::text));
      if clara._subledger_allocated_items_present(o.id) then
        raise exception 'open items on this entry carry allocations; unallocate them first'
          using errcode='CLR10',detail='{"reason":"allocated_items_present"}';
      end if;
      v_mirror:=null; v_adopted:=false;$p4$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_awcc)-length(replace(v_awcc,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: approve_wrong_client_correction does not carry the spliced reverse-branch region verbatim, exactly once';
  end if;
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p5$      update clara.journal_entries set reversed_by=v_mirror,reversal_reason=x.reason,
        updated_at=now() where id=o.id;
      perform clara._subledger_on_approve(v_mirror);$p5$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_awcc)-length(replace(v_awcc,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: approve_wrong_client_correction does not carry the spliced mirror-approve hook region verbatim, exactly once';
  end if;
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p6$        where a.run_id=sr.id and a.task_id=t.id
          and t.status in ('running','cancel_requested')
          and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id);$p6$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_rsr)-length(replace(v_rsr,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: reconcile_sweep_runs does not carry the spliced force-complete guard region verbatim, exactly once';
  end if;
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p7$  if v_checked_via_rule is not null
     and e.coding_kind in ('customer_receipt','supplier_payment') then
    raise exception 'a settlement entry is never autopostable'
      using errcode='CLR10',detail='{"reason":"settlement_not_autopostable"}';
  end if;$p7$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_core)-length(replace(v_core,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: _approve_entry_core does not carry the settlement refusal region verbatim, exactly once';
  end if;
  v_pin:=btrim(lower(regexp_replace(regexp_replace(regexp_replace(
$p8$  update clara.journal_entries set status='approved',checker_actor=p_checker,
    approved_at=now(),self_approval_attestation=v_attest,updated_at=now()
    where id=p_entry;
  if e.reversal_of is not null then
    update clara.journal_entries set reversed_by=p_entry,
      reversal_reason=coalesce(e.reversal_reason,'opening supersede'),
      updated_at=now() where id=e.reversal_of and reversed_by is null;
  end if;
  perform clara._subledger_on_approve(p_entry);$p8$,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g')));
  if (length(v_aoe)-length(replace(v_aoe,v_pin,'')))/length(v_pin) <> 1 then
    raise exception '0037 tail: _approve_opening_entry does not carry the status-flip / linkage / hook region verbatim, exactly once';
  end if;

  -- (4) SECTION I -- the sweep guard, spliced into the 0017 body, exactly once.
  if position('active_recovery_client.status=''active''' in v_rsr)=0
     or position('active_completion_client.status=''active''' in v_rsr)=0
     or position('active_release_client.status=''active''' in v_rsr)=0 then
    raise exception '0037 tail: reconcile_sweep_runs lost a 0017 R2-F6 active-client guard -- section I rebuilt the body instead of patching it';
  end if;
  v_n:=(length(v_rsr)-length(replace(v_rsr,
      'and t.status in (''running'',''cancel_requested'') and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id);','')))
    / length('and t.status in (''running'',''cancel_requested'') and exists(select 1 from clara.coding_attempts ca where ca.task_id=t.id);');
  if v_n <> 1 then
    raise exception '0037 tail: the force-complete guard must sit on the completion UPDATE exactly once -- found %', v_n;
  end if;

  -- (5) THE PRECEDENCE LADDER, pinned by POSITION. A future edit that reorders these branches
  -- would silently reclassify every opening reversal and every settlement; it fails here first.
  v_a:=position('if e.reversal_of is not null then' in v_cls);
  v_b:=position('if e.is_opening_balance then' in v_cls);
  v_c:=position('if e.coding_kind is null then v_kind := ''adjustment'';' in v_cls);
  v_d:=position('elsif e.coding_kind = ''supplier_bill'' then v_kind := ''bill'';' in v_cls);
  v_e:=position('elsif e.coding_kind in (''customer_receipt'',''supplier_payment'') then v_kind := ''settlement'';' in v_cls);
  v_f:=position('else return; end if;' in v_cls);
  if v_a=0 or v_b=0 or v_c=0 or v_d=0 or v_e=0 or v_f=0
     or not (v_a < v_b and v_b < v_c and v_c < v_d and v_d < v_e and v_e < v_f) then
    raise exception '0037 tail: the classifier precedence ladder is not reversal < opening < adjustment < typed < settlement < else (%, %, %, %, %, %)',
      v_a, v_b, v_c, v_d, v_e, v_f;
  end if;
  -- Ladder 1 and 2 both join the ORIGINAL/entry status: only approved is in the books, and an
  -- opening entry can be WITHDRAWN after its draft-time opening_items row exists.
  if position('where oi.entry_id = e.reversal_of and orig.status = ''approved''' in v_cls)=0 then
    raise exception '0037 tail: the classifier unwind path does not join the original entry status=approved';
  end if;

  -- (6) THE FOUR-PATH CENSUS (design 4.3). Every live body that flips a journal entry to
  -- approved must be one of the four AND must call the hook. A fifth path cannot appear
  -- unnoticed, and one of the four losing its hook fails the deploy.
  -- MATCHED BY REGEX, NOT BY A LITERAL LIKE. The normalizer collapses runs of whitespace but
  -- does not remove the optional spaces PostgreSQL and human authors both put around `=`, so
  -- `set status = 'approved'` -- a legal, ordinary spelling -- would have been invisible to
  -- the literal form. A census that a fifth approve path can dodge by adding one space is
  -- not a census.
  select array_agg(p.proname order by p.proname) into v_paths
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='clara'
    and lower(regexp_replace(regexp_replace(regexp_replace(p.prosrc,'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'))
        ~ 'update +clara\.journal_entries +set +status *= *''approved''';
  if v_paths is distinct from array['_approve_entry_core','_approve_opening_entry',
      'approve_wrong_client_correction','reverse_entry']::text[] then
    raise exception '0037 tail: the approve-path census is not the pinned FOUR -- found %', v_paths;
  end if;
  select count(*)::int into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='clara' and p.proname = any(v_paths)
    and position('clara._subledger_on_approve(' in p.prosrc) > 0;
  if v_n <> 4 then
    raise exception '0037 tail: only % of the four approve paths call the subledger hook', v_n;
  end if;

  -- (7) THE WHOLE-SCHEMA LEAK SCAN. The subledger tables have exactly the writers this
  -- migration ships, and the hook has exactly the four callers above.
  --
  -- THREE THINGS THIS SCAN DOES DIFFERENTLY FROM ITS FIRST CUT, each because the first cut
  -- could be walked past:
  --   * IT FAILS CLOSED. A pg_get_functiondef error used to raise a NOTICE and `continue` --
  --     i.e. a body that could not be read was counted as a body with no writes in it, which
  --     is exactly backwards for a scan whose whole job is to find an unexpected writer. The
  --     scan is restricted to prokind='f' (there is no aggregate or window function in this
  --     schema; the restriction says so rather than assuming it) and ANY remaining read
  --     failure aborts the migration.
  --   * IT CENSUSES BY SIGNATURE, not by bare proname. Two overloads of one name are two
  --     bodies; naming them identically in the census makes the array comparison ambiguous
  --     about which one was seen. regprocedure renders the signature, and the EXPECTED arrays
  --     are built through the same cast so the two sides can never disagree about spelling.
  --   * IT MATCHES BY REGEX. `insert into clara.open_items (` with a space before the paren
  --     is the same statement and was invisible to the literal form.
  select p.oid into v_oid_hook from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='_subledger_on_approve';
  v_writers:=array[]::text[]; v_alloc_writers:=array[]::text[]; v_callers:=array[]::text[];
  for r in select p.oid, p.proname, (p.oid::regprocedure)::text as sig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.prokind='f' order by p.proname, p.oid loop
    begin
      v_src := lower(regexp_replace(regexp_replace(regexp_replace(
        pg_get_functiondef(r.oid),'/\*[\s\S]*?\*/','','g'),'--[^\n]*','','g'),'\s+',' ','g'));
    exception when others then
      raise exception '0037 tail: the whole-schema leak scan could not read the body of % (%) -- a body this scan cannot read is a body it cannot clear, and this assertion fails closed', r.proname, sqlerrm;
    end;
    if v_src ~ 'insert into clara\.open_items *\(' then
      v_writers := v_writers || r.sig;
    end if;
    if v_src ~ 'insert into clara\.open_item_allocations *\(' then
      v_alloc_writers := v_alloc_writers || r.sig;
    end if;
    if r.oid <> v_oid_hook and v_src ~ 'clara\._subledger_on_approve *\(' then
      v_callers := v_callers || r.sig;
    end if;
  end loop;
  if v_writers is distinct from array[
      ('clara._subledger_on_approve(uuid)'::regprocedure)::text] then
    raise exception '0037 tail: clara.open_items has writers beyond the classifier hook -- %', v_writers;
  end if;
  if v_alloc_writers is distinct from array[
      ('clara._subledger_on_approve(uuid)'::regprocedure)::text,
      ('clara.apply_open_items(uuid,jsonb,text,text)'::regprocedure)::text,
      ('clara.unallocate_group(uuid,uuid,text,text)'::regprocedure)::text] then
    raise exception '0037 tail: clara.open_item_allocations has writers beyond the three sanctioned verbs -- %', v_alloc_writers;
  end if;
  if v_callers is distinct from array[
      ('clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure)::text,
      ('clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure)::text,
      ('clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure)::text,
      ('clara.reverse_entry(uuid,text,text)'::regprocedure)::text] then
    raise exception '0037 tail: the subledger hook has callers beyond the pinned four -- %', v_callers;
  end if;

  -- (8) THE DRAFT ALLOWLIST IS UNTOUCHED (WCA-R6 as amended by WCA-R7): settlement kinds are
  -- creatable ONLY by the composites, so no draft verb may learn them.
  if position('p_coding_kind not in (''supplier_bill'',''sales_invoice'',''sales_credit_note'')' in v_draft)=0 then
    raise exception '0037 tail: _draft_entry_core''s coding-kind allowlist is no longer invoice-only -- a draft verb can now mint a settlement kind';
  end if;

  raise notice '0037 tail OK (1/8): prior-migration chain intact through 0035''s recut of _approve_entry_core';
  raise notice '0037 tail OK (2/8): the settlement_not_autopostable refusal is present exactly once, CLR10 + named reason, NULL-safe, ordered after the revision check and before the reversal linkage';
  raise notice '0037 tail OK (3/8): the subledger hook is in _approve_entry_core exactly once, ungated on checked_via_rule_id, and 0035''s two edits survived the recut';
  raise notice '0037 tail OK (4/8): reverse_entry, revise_entry, approve_wrong_client_correction and _approve_opening_entry carry their additions once each with every prior change-of-record marker intact, and all EIGHT spliced regions match their restated text verbatim, exactly once';
  raise notice '0037 tail OK (5/8): the sweep force-complete guard is spliced into the 0017 completion UPDATE exactly once, with all three R2-F6 active-client guards intact';
  raise notice '0037 tail OK (6/8): the classifier precedence ladder is pinned reversal < opening < adjustment < typed < settlement < else, with the approved-status join on the unwind path';
  raise notice '0037 tail OK (7/8): the approve-path census is exactly FOUR (matched by regex, whitespace-tolerant), each calling the hook, and the fail-closed whole-schema scan by SIGNATURE finds no other writer of either subledger table and no fifth caller of the hook';
  raise notice '0037 tail OK (8/8): _draft_entry_core''s allowlist is still invoice-only -- no draft verb can mint a settlement kind';
end
$tail$;

-- =====================================================================
-- TAIL, PART 2 of 2 -- the CATALOG, ACL and TIE assertions. Deliberately a SEPARATE block
-- that reads NO function body (see part 1's header for why the seam exists, and why the two
-- shortcuts that would have avoided it are not acceptable).
-- =====================================================================
do $acl$
declare
  v_fn text; v_role text; v_def text; v_n int; v_bad int; v_bad2 int; v_vals text[];
begin
  -- (A) THE CONSTRAINT CATALOG. Named, not token-counted: a CHECK that exists under a
  -- different definition is not the CHECK this migration claims to have added.
  --
  -- ck_je_coding_kind is asserted on its EXACT ADMITTED VALUE SET, not on five substring
  -- probes. A substring test is a one-way assertion: it proves the five values 0037 needs are
  -- there and says nothing at all about a SIXTH that someone added -- and a sixth coding kind
  -- is a sixth classifier branch that does not exist, i.e. an entry class the subledger
  -- silently drops on the floor (ladder 6: no rows) while its control legs move the GL. The
  -- set is extracted from the constraint text and compared whole.
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.journal_entries'::regclass and con.conname='ck_je_coding_kind';
  if v_def is null then
    raise exception '0037 tail: ck_je_coding_kind is absent';
  end if;
  select array_agg(m[1] order by m[1]) into v_vals
    from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
  if v_vals is distinct from array['customer_receipt','sales_credit_note','sales_invoice',
      'supplier_bill','supplier_payment']::text[] then
    raise exception '0037 tail: ck_je_coding_kind does not admit EXACTLY the five values 0037 classifies -- found % in %', v_vals, v_def;
  end if;
  -- The settlement CHECK must bind the rule id AND name BOTH settlement kinds. Naming only
  -- one of them would leave the other autopostable through the durable half of the belt while
  -- every token census still passed.
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.journal_entries'::regclass
      and con.conname='ck_je_settlement_not_rule_checked';
  if v_def is null or v_def not like '%checked_via_rule_id%'
     or v_def not like '%customer_receipt%' or v_def not like '%supplier_payment%' then
    raise exception '0037 tail: ck_je_settlement_not_rule_checked is absent, does not bind checked_via_rule_id, or does not name both settlement kinds -- %', v_def;
  end if;
  -- ck_je_flags_shape was CHECKED, not assumed: it is a pure jsonb_typeof test, so the
  -- composites' settlement_allocation proposal key needs no widening. Pinned so a future
  -- narrowing of it would surface here rather than at the first high-stakes settlement.
  select pg_get_constraintdef(con.oid) into v_def from pg_constraint con
    where con.conrelid='clara.journal_entries'::regclass and con.conname='ck_je_flags_shape';
  if v_def is null or v_def not like '%jsonb_typeof%' or v_def like '%settlement%' then
    raise exception '0037 tail: ck_je_flags_shape is no longer the pure jsonb_typeof object test 0037 relied on -- %', v_def;
  end if;

  -- (B) THE TABLES. FORCE RLS, the grain unique, and the no-double-undo index.
  select count(*)::int into v_n from pg_class c
    where c.oid in ('clara.open_items'::regclass, 'clara.open_item_allocations'::regclass)
      and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 2 then
    raise exception '0037 tail: the two subledger tables are not both FORCE RLS';
  end if;
  if not exists (select 1 from pg_constraint con
                 where con.conrelid='clara.open_items'::regclass
                   and con.conname='uq_open_items_grain') then
    raise exception '0037 tail: the (entry_id, domain, counterparty_id) grain unique is absent';
  end if;
  if not exists (select 1 from pg_class c where c.relname='uq_oia_reverses_once'
                 and c.relnamespace='clara'::regnamespace) then
    raise exception '0037 tail: the no-double-undo unique index on reverses_allocation_id is absent';
  end if;
  -- The two settlement floors and both belts must be DEFERRED constraint triggers that fire on
  -- INSERT as well as UPDATE (the review-converged widening).
  foreach v_fn in array array['t_je_customer_receipt_shape','t_je_supplier_payment_shape',
      't_je_subledger_belt'] loop
    if not exists (select 1 from pg_trigger t
                   where t.tgrelid='clara.journal_entries'::regclass and t.tgname=v_fn
                     and t.tgdeferrable and t.tginitdeferred
                     and (t.tgtype & 4) > 0 and (t.tgtype & 16) > 0) then
      raise exception '0037 tail: trigger % is not a deferred AFTER INSERT OR UPDATE constraint trigger', v_fn;
    end if;
  end loop;
  -- BELT-2's TWO TRIGGERS ARE PINNED TOO. They fire AFTER INSERT only (an item and an
  -- allocation are both append-only, so there is no UPDATE to catch), but their DEFERRED-ness
  -- is exactly as load-bearing as belt-1's: an IMMEDIATE belt would fire between the two rows
  -- of a balanced pair and refuse the group for not netting to zero -- i.e. it would make
  -- every legitimate allocation impossible. Unpinned, a future migration recreating them
  -- without `deferrable initially deferred` would break every settlement in the system, and
  -- nothing in this file would have said so.
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid='clara.open_items'::regclass and t.tgname='t_open_items_belt'
                   and t.tgdeferrable and t.tginitdeferred and (t.tgtype & 4) > 0) then
    raise exception '0037 tail: t_open_items_belt is not a deferred AFTER INSERT constraint trigger';
  end if;
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid='clara.open_item_allocations'::regclass
                   and t.tgname='t_open_item_allocations_belt'
                   and t.tgdeferrable and t.tginitdeferred and (t.tgtype & 4) > 0) then
    raise exception '0037 tail: t_open_item_allocations_belt is not a deferred AFTER INSERT constraint trigger';
  end if;

  -- (C) ACLs. The four composites are human-only; every internal is granted to nobody.
  foreach v_fn in array array[
      'clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)',
      'clara.unallocate_group(uuid,uuid,text,text)',
      'clara.apply_open_items(uuid,jsonb,text,text)'] loop
    if not pg_catalog.has_function_privilege('clara_authenticated', v_fn, 'execute') then
      raise exception '0037 acl: % is not granted to clara_authenticated', v_fn;
    end if;
    foreach v_role in array array['clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_function_privilege(v_role::name, v_fn, 'execute') then
        raise exception '0037 acl: % is granted to % -- settlement is a human judgement', v_fn, v_role;
      end if;
    end loop;
    if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl,'{}'::aclitem[])) acl
               where p.oid = v_fn::regprocedure and acl::text like '=%') then
      raise exception '0037 acl: % still carries a PUBLIC grant', v_fn;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_fn::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0037 acl: % is not owned by clara_fn_owner', v_fn;
    end if;
  end loop;
  -- The definer-only roster now also carries the SIX trigger functions and the two thin
  -- 1-arity wrappers. PostgreSQL grants EXECUTE to PUBLIC on every new function by default
  -- and ALTER DEFAULT PRIVILEGES does not stop it (the T17b-proven mechanism); a trigger
  -- function needs no caller EXECUTE at all -- the trigger machinery runs it as the table
  -- owner -- so any grant on one is pure surface. Section L revokes them; this is where that
  -- revoke stops being a hope.
  foreach v_fn in array array[
      'clara._subledger_classify_entry(uuid)',
      'clara._subledger_on_approve(uuid)',
      'clara._subledger_decompose_preview(uuid,text)',
      'clara._subledger_outstanding(uuid)',
      'clara._subledger_allocated_items_present(uuid)',
      'clara._assert_customer_receipt_shape_at(uuid,uuid)',
      'clara._assert_supplier_payment_shape_at(uuid,uuid)',
      'clara._assert_customer_receipt_shape(uuid)',
      'clara._assert_supplier_payment_shape(uuid)',
      'clara._tf_assert_customer_receipt_shape()',
      'clara._tf_assert_supplier_payment_shape()',
      'clara._tf_subledger_entry_belt()',
      'clara._tf_subledger_item_belt()',
      'clara._tf_subledger_alloc_belt()',
      'clara._tf_open_items_validate()'] loop
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_function_privilege(v_role::name, v_fn, 'execute') then
        raise exception '0037 acl: % is granted to % -- the subledger internals are definer-only', v_fn, v_role;
      end if;
    end loop;
    if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl,'{}'::aclitem[])) acl
               where p.oid = v_fn::regprocedure and acl::text like '=%') then
      raise exception '0037 acl: % still carries a PUBLIC grant', v_fn;
    end if;
  end loop;
  -- THE FIVE SURGICAL BODIES keep their as-built authority. The 0037 header claims a tail ACL
  -- assert for them; this is it. _approve_entry_core and _approve_opening_entry are private
  -- cores reached only through their own definer wrappers -- a CREATE OR REPLACE preserves an
  -- existing ACL, but a hand-edited redeploy that dropped and recreated one would silently
  -- hand PUBLIC an approve path straight past every wrapper's role floor
  -- (0016:5068 / 0029:1445 precedent).
  foreach v_fn in array array[
      'clara._approve_entry_core(jsonb,uuid,uuid,text,text)',
      'clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'] loop
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_function_privilege(v_role::name, v_fn, 'execute') then
        raise exception '0037 acl: % is granted to % -- it is a private core reached only through its wrapper', v_fn, v_role;
      end if;
    end loop;
    if exists (select 1 from pg_proc p, unnest(coalesce(p.proacl,'{}'::aclitem[])) acl
               where p.oid = v_fn::regprocedure and acl::text like '=%') then
      raise exception '0037 acl: % still carries a PUBLIC grant', v_fn;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_fn::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0037 acl: % is not owned by clara_fn_owner', v_fn;
    end if;
  end loop;
  -- The three PATCHED bodies keep their human floor and their owner: a dynamic patch runs
  -- CREATE OR REPLACE, which preserves both, and this says so out loud rather than trusting
  -- it.
  foreach v_fn in array array[
      'clara.reverse_entry(uuid,text,text)',
      'clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)',
      'clara.approve_wrong_client_correction(uuid,text,text,text)'] loop
    if not pg_catalog.has_function_privilege('clara_authenticated', v_fn, 'execute') then
      raise exception '0037 acl: the patch to % dropped its clara_authenticated grant', v_fn;
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_fn::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0037 acl: % is not owned by clara_fn_owner after the patch', v_fn;
    end if;
  end loop;
  -- ZERO wake-role and zero agent table grants on either subledger table.
  foreach v_role in array array['clara_agent_ro','clara_runtime','clara_wake_interactive',
      'clara_wake_proactive'] loop
    if pg_catalog.has_table_privilege(v_role::name,'clara.open_items','select')
       or pg_catalog.has_table_privilege(v_role::name,'clara.open_item_allocations','select') then
      raise exception '0037 acl: % can read a subledger table -- the design grants none', v_role;
    end if;
  end loop;
  if not pg_catalog.has_table_privilege('clara_authenticated','clara.open_items','select')
     or not pg_catalog.has_table_privilege('clara_authenticated','clara.open_item_allocations','select') then
    raise exception '0037 acl: clara_authenticated cannot read the subledger tables';
  end if;
  -- SELECT AND NOTHING ELSE. clara_authenticated reads the subledger through RLS; every WRITE
  -- goes through a SECURITY DEFINER verb owned by clara_fn_owner. A stray INSERT/UPDATE/
  -- DELETE/TRUNCATE grant to ANY non-owner role would let a human bypass belt-1 entirely (a
  -- lone item insert touches no journal_entries row), so the absence is asserted rather than
  -- inferred from the fact that this file grants none.
  foreach v_fn in array array['clara.open_items','clara.open_item_allocations'] loop
    foreach v_role in array array['clara_authenticated','clara_agent_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_proactive'] loop
      if pg_catalog.has_table_privilege(v_role::name, v_fn, 'insert')
         or pg_catalog.has_table_privilege(v_role::name, v_fn, 'update')
         or pg_catalog.has_table_privilege(v_role::name, v_fn, 'delete')
         or pg_catalog.has_table_privilege(v_role::name, v_fn, 'truncate') then
        raise exception '0037 acl: % holds a DML grant on % -- the subledger is written by definer verbs only', v_role, v_fn;
      end if;
    end loop;
    if exists (select 1 from pg_class cc, unnest(coalesce(cc.relacl,'{}'::aclitem[])) acl
               where cc.oid = v_fn::regclass and acl::text like '=%') then
      raise exception '0037 acl: % carries a PUBLIC table grant', v_fn;
    end if;
  end loop;

  -- (D) THE BACKFILL TIES -- both directions, sen-exact (WCA-R4).
  -- (D1) per-entry x domain x CANONICAL counterparty: every classified row is materialised at
  -- the same amount and kind, and every materialised row is still classified. Both directions
  -- canonicalise the stored item counterparty before comparing, for the reason belt-1 and the
  -- preview do: items hold the party that was canonical AT WRITE, and merge_counterparties
  -- does not repoint history. A raw comparison would fail this assert on any estate where a
  -- merge has ever followed an approval -- i.e. it would report the backfill as broken when
  -- what actually happened is that two names became one.
  -- BOTH DIRECTIONS DROP ZERO NETS ON THE ITEM SIDE, the same law belt-1's two arms and the
  -- preview apply. A canonical zero-net collapse (two items of one entry whose parties later
  -- merged into one, netting to zero) is a LAWFUL state: the classifier emits no row for that
  -- group, the items still exist because history is never repointed, and the group's
  -- contribution to the identity is zero on both sides. Direction 2 is therefore expressed on
  -- the GROUP rather than the row -- a row-wise orphan test would report exactly that lawful
  -- state as a broken backfill and abort a correct deploy.
  select count(*)::int into v_bad from (
    select 1
    from clara.journal_entries e
    cross join lateral clara._subledger_classify_entry(e.id) cl
    left join lateral (
      select sum(oi.amount_cents)::bigint as amt, min(oi.item_kind) as k,
             count(distinct oi.item_kind)::int as kn
      from clara.open_items oi
      where oi.entry_id = e.id and oi.domain = cl.domain
        and clara._canonical_counterparty(oi.client_id, oi.counterparty_id)
            = cl.counterparty_id
      having sum(oi.amount_cents) <> 0
    ) it on true
    where e.status = 'approved'
      and (it.amt is distinct from cl.amount_cents
        or it.k is distinct from cl.item_kind
        or coalesce(it.kn, 1) <> 1)
  ) z;
  select count(*)::int into v_bad2 from (
    select oi.entry_id as eid, oi.domain as dom,
           clara._canonical_counterparty(oi.client_id, oi.counterparty_id) as cp
    from clara.open_items oi
    group by 1, 2, 3
    having sum(oi.amount_cents) <> 0
  ) g
  where not exists (select 1 from clara._subledger_classify_entry(g.eid) cl
                    where cl.domain = g.dom and cl.counterparty_id = g.cp);
  if v_bad <> 0 or v_bad2 <> 0 then
    raise exception '0037 tail: the backfill does not reproduce the classifier exactly (% unmaterialised/divergent, % orphaned item group(s))', v_bad, v_bad2;
  end if;

  -- (D2) THE IDENTITY, per client x domain, summed over EVERY account of that account_class
  -- (plural control accounts are legal): SUM(open_items.amount_cents) = the control GL
  -- balance, to the sen. This is the assertion the whole migration exists to make true.
  select count(*)::int into v_bad from (
    select coalesce(gl.cid, it.cid) as cid, coalesce(gl.dom, it.dom) as dom
    from (
      select e.client_id as cid,
             case a.account_class when 'receivable' then 'ar' else 'ap' end as dom,
             sum(case when a.account_class='receivable'
                      then l.debit_cents - l.credit_cents
                      else l.credit_cents - l.debit_cents end)::bigint as bal
      from clara.journal_entries e
      join clara.journal_lines l on l.entry_id = e.id
      join clara.coa_accounts a on a.client_id = l.client_id and a.account_code = l.account_code
      where e.status = 'approved' and a.account_class in ('payable','receivable')
      group by 1, 2
    ) gl
    full outer join (
      select oi.client_id as cid, oi.domain as dom, sum(oi.amount_cents)::bigint as tot
      from clara.open_items oi group by 1, 2
    ) it on it.cid = gl.cid and it.dom = gl.dom
    where coalesce(gl.bal, 0) is distinct from coalesce(it.tot, 0)
  ) z;
  if v_bad <> 0 then
    raise exception '0037 tail: the control-account identity does not hold for % client/domain pair(s) -- SUM(open_items) <> the control GL balance', v_bad;
  end if;

  -- (E) THE EVENT TAXONOMY is complete against the ACTIVE version.
  select count(*)::int into v_n from clara.event_types
    where name in ('open_item.created','open_item.unwound','open_item.allocated',
                   'open_item.unallocated','open_item.applied');
  if v_n <> 5 then
    raise exception '0037 tail: only % of the five open_item event types were registered', v_n;
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version = t.version and a.singleton
    where t.event_type in ('open_item.created','open_item.unwound','open_item.allocated',
                           'open_item.unallocated','open_item.applied');
  if v_n <> 5 then
    raise exception '0037 tail: only % of the five open_item events are bound to the active taxonomy version', v_n;
  end if;

  raise notice '0037 acl OK (1/4): ck_je_coding_kind is the widened five-value form, ck_je_settlement_not_rule_checked binds the rule id, and ck_je_flags_shape is still the pure jsonb_typeof test 0037 relied on';
  raise notice '0037 acl OK (2/4): both subledger tables are FORCE RLS with the grain unique and the no-double-undo index; the two floors and belt-1 are deferred AFTER INSERT OR UPDATE constraint triggers';
  raise notice '0037 acl OK (3/4): the four composites are clara_authenticated-only and owned by clara_fn_owner; every internal is granted to nobody; no wake, runtime or agent role can read either table';
  raise notice '0037 acl OK (4/4): the backfill reproduces the classifier exactly in BOTH directions and the control-account identity holds to the sen for every client and domain; the five open_item event types are registered against the active taxonomy';
end
$acl$;
