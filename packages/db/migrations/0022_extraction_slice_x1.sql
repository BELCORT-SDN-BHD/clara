-- 0022_extraction_slice_x1 — the EXTRACTION SLICE, block X1 (the DB block, first).
--
-- Authority: docs/plan/extraction-slice-contract.md (v1.0, RATIFIED 2026-07-27, ADR-047).
-- Shaped by the adversarial refusal recorded in
-- docs/plan/research/wave-b/gate-p-build-refused-2026-07-27.md. Scope is fixed by that
-- contract's §2 "X1" + "X3" + "X4" rows and is neither widened nor narrowed here.
--
-- WHAT THIS DELIVERS, section by section:
--   §A  clara.request_reextraction(p_document, p_reason, p_op_key) — the re-extraction
--       path that does not exist anywhere in 0001..0021 (refusal record FATAL 1). A new
--       invoice_facts task VERSION for a document that already carries a settled
--       extraction, so a corrected mapper can reach the 29 documents already extracted.
--       BOOKKEEPER floor (ADR-047 Q2), audited, op-key idempotent, HUMAN-INVOKED ONLY.
--   §B  clara.set_firm_high_stakes_threshold(p_cents, p_op_key) — OWNER floor. Pays the
--       debt left by PR #109, whose RM100,000 change was a hand-run file
--       (packages/db/deploy/wave-b-highstakes-rm100k-amendment.sql) because no governed
--       verb existed.
--   §C  X3 — the SALES TIE, corrected. `net + tax + rounding = gross` is WRONG for any
--       document carrying a service charge, a discount, or a delivery line — i.e. for
--       most Malaysian F&B and retail invoices (the refusal record's MAJOR 3, measured on
--       LAI LOU MEI: 94.30 + 5.66 + 0.02 = 99.98 <> 103.75). It becomes
--       sum-of-stated-components = stated total, over the CLOSED taxonomy ratified at
--       ADR-047: subtotal · service charge · discount · delivery/handling · tax ·
--       rounding. Three NEW field_paths join persist_invoice_facts' allowlist and its two
--       monetary guards so the tie has something to read and nothing can arrive unguarded.
--   §D  X4 — `anchor_missing` DECIDED, not drifted. The OCR-sales corroboration block
--       gains the corrected identity AND an explicit dark guard, so the lane stays
--       structurally shut until X5's corroboration micro-migration removes the guard
--       deliberately (contract §2 X4; gate XG5).
--
-- WHY §C AND §D SHIP IN THE SAME MIGRATION AS §A. §A makes re-extraction possible and X2
-- (runtime) will make the tax fields emittable. Both of the live consumers those fields
-- wake — the four dormant sales ties and the executor's anchor block — must already be
-- CORRECT before any document can carry the fields. Landing them apart would open a
-- window in which a service-charge invoice is coded by a human and then refused at approve
-- with no override (the supplier floor's `amount_override` hatch has no sales counterpart),
-- or in which a structural posting barrier switches itself off as a side effect.
--
-- DEPLOY SHAPE: **A BRIEF RUNTIME QUIESCE** (this is NOT the 0021 no-quiescence shape — see
-- the §D header for why the earlier claim was withdrawn). Stop `clara-runtime`, apply, start.
-- The window being closed is small and specific: `execute_rule_post` is a LIVE writer being
-- replaced by change-of-record, and per the repo's binding D1 rule a call already inside the
-- OLD body finishes on the OLD body — no `create or replace` reaches into it and no tail
-- assertion can see it. With the runtime stopped, no in-flight executor call can exist across
-- the CoR commit, so the old body cannot post after the new one is installed. Everything
-- BELOW is still true and is why the quiesce only has to be brief:
--
-- This migration changes NO grant on any machine lane, adds
-- no relation, and alters no constraint. The three CoR'd bodies are reachable-identically
-- for every extraction that exists today:
--   * `_assert_sales_invoice_shape_at` — ties 2 and 3 are guarded on `v_net`/`v_tax`, which
--     are NULL on 29/29 live extractions (invoice.total_excl_tax / invoice.tax_total have
--     zero occurrences), so both stay exactly as dormant as they are now; the three new
--     component regions cannot exist yet because persist_invoice_facts refused their
--     field_paths until this migration.
--   * `execute_rule_post` — the anchor block's outcome is `anchor_missing` for every
--     existing OCR-sales document today (because `v_net is null or v_tax is null` is true
--     29/29) and the dark guard keeps it `anchor_missing` for every FUTURE one until X5.
--     THE IN-FLIGHT CASE, STATED PRECISELY (raised by adversarial round 1). Per the repo's
--     binding D1 rule an execution already inside the OLD body finishes on the OLD body;
--     a `create or replace` cannot reach into it, and this migration's tail can only
--     inspect the newly installed body. So the guard ALONE does not make an unattended
--     OCR-sales post impossible at the deploy instant — the STAGING does, and the claim
--     rests on it: the old anchor block needs `invoice.total_excl_tax` AND
--     `invoice.tax_total`, those two paths have zero occurrences across all 29 live
--     extractions, `persist_invoice_facts` is the only writer that can create them and it
--     is granted to `clara_runtime` alone, and the pre-X2 mapper does not emit them. No
--     input that exists at deploy time can satisfy the old body either. THIS IS A
--     DEPLOY-ORDER OBLIGATION, not an inference: **0022 must be deployed while the pre-X2
--     runtime is still live.** Deploying X2 first, or concurrently, would create documents
--     that satisfy the old body and re-open exactly the window this section closes.
--   * `persist_invoice_facts` — three field_paths that were CLR10-refused become
--     acceptable; no previously-accepted payload changes shape.
-- The two new verbs are granted to clara_authenticated only and appear in no wake
-- allowlist, so no running workflow gains a capability at deploy.
--
-- WHAT IS DELIBERATELY NOT HERE. No re-extract ATTEMPT CAP (ADR-047 Q4 ruled: no cap,
-- audit only — the structural bound is that no machine caller can reach the verb). No
-- change to `_invoice_fact_state_at` (the corroboration terms are X5's, alone). No change
-- to `_assert_supplier_bill_shape_at` (the supplier floor's exact
-- `sst_purchase_cost = tax_total` tie is untouched). No change to the XML/structured
-- corroboration branch. No new domain event: as at 0020's classify-evidence verb, no
-- `firm.updated`-class event type exists, no consumer is designed to react to one, and the
-- audit row plus the processing-task trail are the receipts. Do not add event types here.

-- =====================================================================
-- §0 — THE QUIESCE GUARD. Runs FIRST, before any DDL in this file.
-- =====================================================================
--
-- WHY A GUARD AND NOT A SENTENCE IN A RUNBOOK. This migration replaces
-- `execute_rule_post`, a live posting writer, by change-of-record. Per the binding D1 rule a
-- call already inside the OLD body finishes on the OLD body — the CoR cannot reach it and
-- the tail at the bottom of this file cannot see it. Every earlier draft of this migration
-- tried to argue that window away and got it wrong twice (see the §D header). The window is
-- real; what closes it is that no executor call is running when the CoR commits. That is a
-- CEREMONY step, and a ceremony step that lives only in prose is one somebody eventually
-- skips at 2am. So the migration refuses instead.
--
-- THE THRESHOLD. The `control` component beats on every control cycle —
-- `CLARA_CTL_POLL_MS`, default **2000ms** (packages/runtime/lib/control.mjs:37, 202-205) —
-- and the runtime's own health check calls a heartbeat stale at
-- `CLARA_HEARTBEAT_STALE_MS`, default **30000ms** (packages/runtime/lib/health.mjs:27).
-- 90 seconds is 45x the write cadence and 3x the runtime's own staleness bound, so a beat
-- younger than 90s means the runtime is not merely slow, it is UP. Generous on purpose: the
-- cost of waiting another minute is nothing, and the cost of a false pass is an unattended
-- post through a body this migration is in the middle of replacing.
--
-- WHY THIS IS SAFE ON EVERY RIG, CI AND UPGRADE PATH — the claim, and how it was checked:
--   * `clara.runtime_heartbeats` is created by 0006 and written ONLY by the live runtime
--     (control.mjs:202-205 and reconciler.mjs heartbeat(); the table is granted to
--     clara_runtime alone, 0006:791). On a fresh database it is created inside the very same
--     `migrate` run that reaches this file, so it is EMPTY here and the guard cannot fire.
--   * The reset-gated rig drills DROP schema clara and re-migrate: the table goes with the
--     schema and comes back empty, so those paths are unaffected too.
--   * The runtime's own test files that write beats (tests/ready.test.mjs,
--     tests/reconcile.test.mjs) do not migrate — they run against an ALREADY-migrated
--     database, so their beats land strictly after this guard has run. Verified by reading
--     both files: neither calls ensureReady()/migrate().
--   * 0022 is applied at most once per database (the runner skips applied versions), so this
--     block runs on the transition and never again.
-- The one path it DOES fire on is the one it exists for: a live project with the runtime up.
do $quiesce$
declare v_component text; v_beat timestamptz;
begin
  -- Defensive: if the relation is somehow absent there is nothing to check and nothing to
  -- protect against — never let the guard itself be the thing that breaks an apply.
  if to_regclass('clara.runtime_heartbeats') is null then return; end if;
  select h.component, h.beat_at into v_component, v_beat
    from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds'
   order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception '0022 QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) — this migration replaces execute_rule_post, and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for heartbeat staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$quiesce$;

-- =====================================================================
-- §A — clara.request_reextraction
-- =====================================================================
--
-- WHY IT IS NOT `_enqueue_invoice_facts_core`. That core short-circuits with
-- `already_completed` the moment a done invoice_facts extraction exists (0016:3436-3443),
-- which is precisely the population this verb exists to serve. The short-circuit is shared
-- by four live callers (the coding-time backstop, the intake finalizer, the classify
-- consumer and the runtime re-drive) whose behaviour must not change, so this verb owns its
-- logic instead of widening theirs.
--
-- WHY BOOKKEEPER. Ruled at ADR-047 Q2 (the draft proposed admin; the owner widened it): the
-- person doing intake is the person who sees a bad extraction, and fixing one authorizes
-- nothing on its own. Re-extraction mints no number and no posting authority — the new
-- extraction still has to corroborate, and a posting still passes human approval.
--
-- WHY NO CAP. ADR-047 Q4: the per-page cost is noise, and a cap would be a second thing to
-- reason about at exactly the moment someone is trying to fix a document. The bound that
-- matters is STRUCTURAL and is asserted in the tail: this verb is granted to
-- clara_authenticated and to nothing else, so no workflow, sweep, wake or machine caller can
-- ever enqueue it. The firm-level page BUDGET is kept, because it is a standing control on
-- all Azure spend rather than a re-extraction cap — a re-extraction that would breach it
-- fails the same way a first extraction does.
create function clara.request_reextraction(
    p_document uuid, p_reason text, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c         record;
  d         record;
  t         record;
  v_dedupe  jsonb;
  v_reason  text;
  v_lane    text;
  v_engine  text;
  v_task    uuid;
  v_version int;
  v_status  text;
  v_pages   int;
  v_attempt int;
  v_reused  boolean := false;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- The reason is the whole audit value of this verb: an unexplained re-extraction is an
  -- unexplained change of the evidence a posted entry rests on. Normalised BEFORE the
  -- request hash so a trailing space cannot make an identical retry look like a new request.
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'a re-extraction reason is required' using errcode = 'CLR10';
  end if;

  -- The document must belong to the caller's firm. Checked explicitly rather than left to
  -- RLS (the 0021 rule): a cross-firm document id must be an honest refusal, never a silent
  -- no-op, and never an existence oracle either — the same CLR11 covers absent and foreign.
  select * into d from clara.documents where id = p_document;
  if not found or d.firm_id is distinct from c.firm then
    raise exception 'document is not in your firm' using errcode = 'CLR11';
  end if;

  -- Lane + engine by mime, the SAME mapping the core uses (0016:3394-3426), so a
  -- re-extraction lands on the identical engine the first extraction used and the
  -- version chain composes. A kind gate applies for the same reason it does there: a
  -- re-extraction of a non-invoice kind through the invoice engine is meaningless work.
  if lower(coalesce(d.mime_type, '')) = 'application/pdf'
     or lower(coalesce(d.mime_type, '')) like 'image/%' then
    if coalesce(d.document_kind, '') not in ('invoice', 'credit_note', 'debit_note') then
      raise exception 'only an invoice-shaped document can be re-extracted (kind is %)',
        coalesce(d.document_kind, 'unset') using errcode = 'CLR16';
    end if;
    v_lane := 'invoice_facts'; v_engine := 'azure-di:prebuilt-invoice:2024-11-30';
  elsif lower(coalesce(d.mime_type, '')) in ('application/xml', 'text/xml') then
    v_lane := 'local_facts'; v_engine := 'clara-myinvois:v1';
  else
    raise exception 'this document type has no facts-extraction lane' using errcode = 'CLR16';
  end if;

  -- A RE-extraction supersedes something. Without a settled extraction there is nothing to
  -- supersede and the ORDINARY pipeline is the right door — routing a first extraction
  -- through a human verb would hide it from the intake path's own receipts.
  if not exists (select 1 from clara.document_extractions e
                  where e.document_id = p_document
                    and e.engine_kind = 'invoice_facts' and e.status = 'done') then
    raise exception 'no completed extraction to re-extract' using errcode = 'CLR16';
  end if;

  -- The request hash covers EVERY argument that reaches a stored column or an audit row.
  -- An argument left OUT is one a caller can change under a re-used op_key and have
  -- silently ignored — so a corrected reason under the old key is an honest CLR10, not a
  -- stale receipt for the request they were trying to fix.
  v_dedupe := clara._reserve_op(c.firm, 'request_reextraction', p_op_key,
    clara._hash(jsonb_build_object('d', p_document, 'r', v_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- An extraction is ALREADY in flight for this lane: return ITS identity rather than
  -- queueing a second one. Two live tasks on one document/lane would race to persist and
  -- the loser would fail on the (document_id, engine_id, version_n) unique — a confusing
  -- failure for a human who simply pressed the button twice.
  select * into t from clara.document_processing_tasks
    where document_id = p_document and lane = v_lane
      and status in ('queued', 'held_egress', 'running')
    order by id limit 1;
  if found then
    v_task := t.id; v_version := t.version_n; v_status := t.status; v_reused := true;
  else
    -- BOUNDED RETRY (adversarial round 1 — MAJOR). 0016:3463-3473's shape is
    -- compute-version / insert-on-conflict-do-nothing / re-select-ACTIVE, and it is right
    -- for the first-extraction path because a losing caller's winner is always still
    -- active there. It is NOT right here. Losing `on conflict do nothing` does not imply
    -- the winner is still active: an OVER-BUDGET winner catches CLR18 and marks its own
    -- row `failed`/`budget` in the same transaction, so a re-select restricted to active
    -- statuses can legitimately find NOTHING. The single-shot version of this code then
    -- fell through with a NULL task and finished a receipt carrying no task, no version
    -- and no status — memoized under that op_key forever.
    -- So: recompute the version and try again, up to three times. Three is not a magic
    -- number, it is "more losses than a real operator can generate", and the bound is what
    -- keeps a pathological loop out of a human-invoked verb.
    for v_attempt in 1..3 loop
      select coalesce(max(version_n), 0) + 1 into v_version
        from clara.document_processing_tasks
        where document_id = p_document and lane = v_lane;
      insert into clara.document_processing_tasks(firm_id, document_id, engine_id, engine_config,
          version_n, lane, status)
        values (d.firm_id, p_document, v_engine, '{}'::jsonb, v_version, v_lane, 'queued')
        on conflict do nothing returning id into v_task;
      if v_task is not null then
        v_status := 'queued';
        exit;
      end if;
      -- Lost the version. If the winner is still ACTIVE this is the ordinary
      -- two-people-pressed-the-button case and its task is the honest answer.
      select id, version_n, status into v_task, v_version, v_status
        from clara.document_processing_tasks
        where document_id = p_document and lane = v_lane
          and status in ('queued', 'held_egress', 'running')
        order by id limit 1;
      if v_task is not null then
        v_reused := true;
        exit;
      end if;
      -- Otherwise the winner already went terminal. Loop: recompute above the row it took.
    end loop;
    if v_task is null then
      -- Three consecutive losses to terminal winners. RAISING rather than returning a
      -- partial receipt is the whole safety property: the raise rolls back the
      -- `_reserve_op` reservation in this same transaction, so the SAME op_key retries
      -- cleanly and a malformed receipt can never be finished. A returned partial would
      -- be permanent.
      raise exception 'a concurrent request settled this document — retry'
        using errcode = 'CLR16';
    end if;
    -- Only the Azure lane consumes the firm page budget; the local XML parse is free.
    -- KEPT deliberately (see the header): the budget is a standing control on Azure
    -- spend, not a re-extraction cap, and a breach must refuse here exactly as it does
    -- on a first extraction (0016:3477-3486). Skipped when we recovered someone else's
    -- in-flight task — that task reserved its own pages.
    if not v_reused and v_lane = 'invoice_facts' then
      v_pages := greatest(coalesce(d.page_count, 1), 1);
      begin
        perform clara._reserve_processing_call(v_task, v_pages);
      exception when sqlstate 'CLR18' then
        update clara.document_processing_tasks set status = 'failed', error_code = 'budget',
          finished_at = now() where id = v_task;
        v_status := 'failed';
      end;
    end if;
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'request_reextraction', null,
    jsonb_build_object('document_id', p_document, 'lane', v_lane, 'version_n', v_version,
      'task_id', v_task, 'reason', v_reason, 'reused', v_reused, 'status', v_status,
      'op_key', p_op_key));

  return clara._finish_op(c.firm, 'request_reextraction', p_op_key,
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', v_task, 'document_id', p_document, 'version_n', v_version,
      'status', v_status, 'reused', v_reused,
      'reason', case when v_status = 'failed' then 'budget' end)));
end $$;

alter function clara.request_reextraction(uuid, text, text) owner to clara_fn_owner;
revoke all on function clara.request_reextraction(uuid, text, text) from public;
grant execute on function clara.request_reextraction(uuid, text, text) to clara_authenticated;

-- =====================================================================
-- §B — clara.set_firm_high_stakes_threshold
-- =====================================================================
--
-- WHY IT EXISTS. `firms.high_stakes_amount_cents` is the DB-derived, non-bypassable
-- criterion for the maker-checker lane (0002:204; 0004:70-76). It has been settable only by
-- direct SQL since 0002. When BELCORT moved from RM10,000 to RM100,000 (PR #109) the change
-- shipped as a hand-run file, `packages/db/deploy/wave-b-highstakes-rm100k-amendment.sql`,
-- whose own header records the debt this section pays.
--
-- OWNER floor. Raising the threshold WIDENS what may be approved by one person: it is the
-- firm's own risk posture, not bookkeeping. (The code is CLR04 — the authz family the
-- working `_human_ctx` raises; 0020's stray CLR03 comment describes no live behaviour.)
--
-- Setting the SAME value again under a NEW op_key is allowed and audited. The outcome is
-- idempotent but the act is not: "the owner re-affirmed RM100,000 today" is a receipt worth
-- having, and refusing it would only teach people to work around the verb.
create function clara.set_firm_high_stakes_threshold(
    p_cents bigint, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c        record;
  v_dedupe jsonb;
  v_old    bigint;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  -- Mirror the column CHECK (high_stakes_amount_cents > 0) and refuse BEFORE the constraint
  -- does, so a caller gets a Clara refusal it can render rather than a raw 23514.
  if p_cents is null or p_cents <= 0 then
    raise exception 'the high-stakes threshold must be a positive amount in cents'
      using errcode = 'CLR10';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'set_firm_high_stakes_threshold', p_op_key,
    clara._hash(jsonb_build_object('cents', p_cents)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- The caller's OWN firm, always. There is no p_firm argument by design: a firm id
  -- parameter would make cross-firm reach a body check rather than a structural
  -- impossibility, and this verb changes an authority threshold.
  --
  -- FOR UPDATE (adversarial round 1 — MAJOR). Without the row lock two concurrent owners
  -- both read the SAME old value before either writes, and both audit rows then claim the
  -- same `old_cents`: RM10k->RM100k and RM10k->RM200k, with a final value of RM200k. No
  -- serial order of those two calls is consistent with both receipts, so the old/new chain
  -- this verb exists to provide is simply false at exactly the moment it matters — a
  -- contested change to an authority boundary. The lock serializes the pair, so the second
  -- caller reads the first's committed value and the chain reads 10k->100k->200k.
  select high_stakes_amount_cents into v_old from clara.firms where id = c.firm for update;
  if v_old is null then
    raise exception 'firm not found' using errcode = 'CLR11';
  end if;
  update clara.firms set high_stakes_amount_cents = p_cents where id = c.firm;

  -- Both figures ride the audit row: an audit that records only the new value cannot
  -- answer "what was it before this call", which is the question an investigation asks.
  perform clara._audit(c.firm, c.actor, null, null, 'set_firm_high_stakes_threshold', null,
    jsonb_build_object('firm_id', c.firm, 'old_cents', v_old, 'new_cents', p_cents,
      'op_key', p_op_key));

  return clara._finish_op(c.firm, 'set_firm_high_stakes_threshold', p_op_key,
    jsonb_build_object('firm_id', c.firm, 'old_cents', v_old, 'new_cents', p_cents));
end $$;

alter function clara.set_firm_high_stakes_threshold(bigint, text) owner to clara_fn_owner;
revoke all on function clara.set_firm_high_stakes_threshold(bigint, text) from public;
grant execute on function clara.set_firm_high_stakes_threshold(bigint, text)
  to clara_authenticated;

-- =====================================================================
-- §C — X3: the SUM-OF-STATED-COMPONENTS sales tie
-- =====================================================================
--
-- (C1) persist_invoice_facts CoR — the three NEW component field_paths.
--
-- The write boundary carries a CLOSED field_path allowlist (0016:3556-3562): an unlisted
-- path is a CLR10 refusal of the whole payload. The three new components must therefore be
-- admitted HERE before any mapper can emit them, and they must be admitted into all four
-- of the enumerations that make a monetary fact safe, not just the first:
--   (a) the allowlist itself;
--   (b) the normalize-to-cents set, so the value lands in `monetary_cents` (a component
--       admitted to the allowlist but left OUT of this set would store text with a NULL
--       amount, and the tie below would read it as "not stated" — a silent zero);
--   (c) the conflicting-duplicate forfeit (0016:3609-3628), so two disagreeing service
--       charges forfeit the extraction instead of being min()-selected;
--   (d) the present-but-unparseable refusal (0016:3638-3646), so a stated-but-unreadable
--       component is a data error rather than a silent zero.
-- Everything else in this body is byte-identical to the 0016 CoR. Nothing that persists
-- today changes shape: these paths were refused outright until this line.
create or replace function clara.persist_invoice_facts(p_task uuid, p_fields jsonb,
    p_raw_sha256 text, p_normalization_version text, p_pages_used int,
    p_envelope jsonb default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  t record; d record; v_ext uuid; v_existing uuid; v_entry uuid; v_date date;
  elem jsonb; v_path text; v_raw text; v_page int; v_conf numeric;
  v_cents bigint; v_region uuid; v_token uuid;
  v_newstate jsonb; v_p_payable bigint; v_p_expense bigint;
  v_eflags jsonb; v_ekind text;
begin
  select * into t from clara.document_processing_tasks where id=p_task;
  if not found or t.lane not in ('invoice_facts','local_facts') then
    raise exception 'invoice-facts task not found' using errcode='CLR16';
  end if;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if jsonb_typeof(p_fields)<>'array' or p_raw_sha256 !~ '^[0-9a-f]{64}$'
     or p_normalization_version is null or btrim(p_normalization_version)=''
     or p_pages_used is null or p_pages_used<0 then
    raise exception 'invoice-facts payload is malformed' using errcode='CLR10';
  end if;

  perform 1 from clara.document_filings f
    where f.document_id=t.document_id and f.retired_at is null
    order by f.id for update;
  perform 1 from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id for update of e;
  select * into t from clara.document_processing_tasks where id=p_task for update;
  if t.status='done' then
    select id into v_existing from clara.document_extractions
      where document_id=t.document_id and engine_id=t.engine_id
        and version_n=t.version_n and engine_kind='invoice_facts';
    return jsonb_build_object('task_id',p_task,'extraction_id',v_existing,
      'status','done','replayed',true);
  end if;
  if t.status<>'running' then
    raise exception 'invoice-facts task is not running' using errcode='CLR16';
  end if;

  insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,
      version_n,status,page_count,envelope)
    values(t.firm_id,t.document_id,t.engine_id,
      'invoice_facts',t.version_n,'done',p_pages_used,
      coalesce(p_envelope,'{}'::jsonb) || jsonb_build_object('raw_sha256',p_raw_sha256,
        'normalization_version',p_normalization_version,
        'field_count',jsonb_array_length(p_fields)))
    returning id into v_ext;

  for elem in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(elem)<>'object' or nullif(elem->>'field_path','') is null
       or not (elem ? 'page') or not (elem ? 'polygon') then
      raise exception 'invoice-facts field is malformed' using errcode='CLR10';
    end if;
    v_path:=elem->>'field_path';
    -- 0022 (X3): the three stated-component paths join the CLOSED allowlist. The taxonomy
    -- is closed on purpose (ADR-047): a component read off the face of the document is a
    -- first-class fact, and anything NOT in the enumeration is not silently absorbed.
    if v_path not in ('invoice.total','invoice.amount_due','invoice.currency',
        'invoice.vendor_name','invoice.vendor_registration','invoice.invoice_id',
        'invoice.invoice_date','invoice.deposit',
        'invoice.customer_name','invoice.customer_registration','invoice.customer_taxid',
        'invoice.type_code','invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.service_charge','invoice.discount','invoice.delivery',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid') then
      raise exception 'unsupported invoice field_path %',v_path using errcode='CLR10';
    end if;
    begin
      v_page:=(elem->>'page')::int;
      v_conf:=(elem->>'confidence')::numeric;
    exception when others then
      raise exception 'invoice-facts page/confidence is malformed' using errcode='CLR10';
    end;
    if v_page<1 or v_conf<0 or v_conf>1
       or jsonb_typeof(elem->'polygon') not in ('array','object') then
      raise exception 'invoice-facts locator/confidence is invalid' using errcode='CLR10';
    end if;
    v_raw:=elem->>'value_raw';
    v_cents:=case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
                  'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
                  'invoice.service_charge','invoice.discount','invoice.delivery')
                  then clara._normalize_invoice_cents(v_raw) else null end;
    insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,
        field_path,text_content,engine_confidence,monetary_raw,monetary_cents)
      values(t.firm_id,v_ext,'page_polygon',
        jsonb_build_object('page',v_page,'polygon',elem->'polygon'),
        v_path,v_raw,v_conf,
        case when v_path in ('invoice.total','invoice.amount_due','invoice.deposit',
             'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
             'invoice.service_charge','invoice.discount','invoice.delivery')
             then v_raw end,v_cents)
      returning id into v_region;
    if v_path='invoice.invoice_date' and v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin v_date:=v_raw::date; exception when others then v_date:=null; end;
    end if;
  end loop;

  -- FIX-2/3/4 + FIX-3/4/5 v4 (the DB owns the number — REJECT bad facts at the WRITE BOUNDARY
  -- rather than min()-selecting one at read time, where SQL NULL semantics silently drop a
  -- blank). All checks are inert for the Azure/OCR corpus (one region per field, no rounding
  -- fact, no conflicts) and for the MyInvois parser (mapFactsFields emits each path at most
  -- once + always a type_code), so the AP exact-diff and the live local_facts producer are
  -- unaffected.
  --   (a) CONFLICTING duplicates, UNIFORM over EVERY per-field fact: a field appearing more
  --     than once with ANY differing value — INCLUDING a blank/NULL vs a real value — is a
  --     contradiction the DB refuses; IDENTICAL duplicates collapse. The v3 checks used
  --     count(distinct <value>), which IGNORES a NULL/blank (SQL semantics) — so a crafted
  --     ['', real] pair slipped past and min() then selected the blank -> NULL, re-opening
  --     polarity (type_code) / direction (customer_taxid) / duplicate-bill (invoice_id/date).
  --     Coalescing to a control-char SENTINEL (chr(1), never a real cents/text value) makes
  --     the blank a DISTINCT value, so ['', '02'] / ['', clientTIN] / ['', 'N/A'] all conflict.
  --     Monetary fields compare on normalized cents; text fields on the trimmed value. The
  --     text set now also covers invoice_id / invoice_date / tax_breakdown / myinvois_* (a
  --     conflicting id/date/breakdown was otherwise min-selected past the guard).
  --     0022 (X3): the three stated components join the MONETARY set — two disagreeing
  --     service charges must forfeit the extraction, exactly as two disagreeing totals do.
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.total','invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.service_charge','invoice.discount','invoice.delivery')
    group by r.field_path
    having count(distinct coalesce(r.monetary_cents::text, chr(1))) > 1
  ) or exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.type_code','invoice.currency','invoice.vendor_name',
        'invoice.vendor_registration','invoice.customer_name','invoice.customer_registration',
        'invoice.customer_taxid','invoice.invoice_id','invoice.invoice_date',
        'invoice.tax_breakdown','invoice.myinvois_uuid','invoice.myinvois_longid')
    group by r.field_path
    having count(distinct coalesce(nullif(btrim(r.text_content),''), chr(1))) > 1
  ) then
    raise exception 'invoice-facts payload carries conflicting duplicate facts for a single field'
      using errcode='CLR10';
  end if;
  --   (b) a PRESENT-but-malformed monetary value (raw text stated, cents normalize to NULL)
  --     is REFUSED for every REQUIRED monetary field — never silently treated as zero or
  --     "not stated" (item 5). Covers amount_due / deposit ('N/A' -> NULL was accepted as
  --     "no due" and defaulted deposit to 0, re-opening the total/deposit corroboration
  --     guards) and total_excl_tax / tax_total / rounding (a stated-but-unparseable component
  --     is a data error). NB: invoice.total is DELIBERATELY EXCLUDED — an unreadable OCR total
  --     still persists (non-corroborated: v_total NULL => corroborated=false, fail-closed),
  --     exactly as before; a blank (empty) raw is "not stated" and is unaffected (nullif
  --     drops it, so an omitted/empty field never trips this).
  --     0022 (X3): the three stated components join this set for the same reason the other
  --     components are in it — a component the reader can SEE but cannot PARSE must never
  --     reach the tie as a zero, because a zero would make a wrong identity balance.
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.amount_due','invoice.deposit',
        'invoice.total_excl_tax','invoice.tax_total','invoice.rounding',
        'invoice.service_charge','invoice.discount','invoice.delivery')
      and nullif(btrim(r.monetary_raw),'') is not null and r.monetary_cents is null
  ) then
    raise exception 'invoice-facts monetary value is malformed' using errcode='CLR10';
  end if;
  --   (b2) 0022 (X3, adversarial round 1 — FATAL): the three STATED COMPONENTS must be
  --     NON-NEGATIVE. ADR-047's "every component is stored positive as printed" was written
  --     as an EMITTER convention, and an emitter convention is not a control.
  --     `_normalize_invoice_cents` (0009:110-121) accepts BOTH `-5.00` and the accounting
  --     parenthesis form `(5.00)`, so a negative discount is persistable — and the identity
  --     SUBTRACTS the discount, which turns that minus into a plus:
  --         net 100.00 + tax 6.00 - (-5.00) = 111.00  ties against a stated gross of 111.00
  --     while the document's own face reads 100.00 + 6.00 - 5.00 = 101.00. The tie passes,
  --     tie 3 accepts revenue = gross - tax, and Clara posts RM111.00 for a RM101.00
  --     document. Every figure is "read off the document" and the answer is still wrong, so
  --     the sign convention is enforced HERE, at the write boundary, in cents.
  --     DELIBERATELY NARROW: only the three NEW component paths. `invoice.rounding` may
  --     legitimately be negative (a downward rounding adjustment) and net/tax/total are the
  --     pre-existing 0016 surface, out of X1's scope — widening either would be a change
  --     this slice was not grilled for.
  if exists (
    select 1 from clara.document_regions r
    where r.extraction_id=v_ext
      and r.field_path in ('invoice.service_charge','invoice.discount','invoice.delivery')
      and r.monetary_cents < 0
  ) then
    raise exception 'a stated invoice component must not be negative (components are stated positive; the discount subtracts in the identity)'
      using errcode='CLR10';
  end if;
  --   (2c) a local-facts (MyInvois structured) payload MUST state a type_code — a structured
  --     e-invoice with no document type cannot be polarity-bound. OCR/Azure (invoice_facts)
  --     carry no type_code and are unaffected.
  if t.lane='local_facts'
     and not exists(select 1 from clara.document_regions
       where extraction_id=v_ext and field_path='invoice.type_code'
         and nullif(btrim(text_content),'') is not null) then
    raise exception 'a local-facts payload must state invoice.type_code' using errcode='CLR10';
  end if;

  -- Only the Azure lane carries a processing-call reservation; the local parse is free.
  if t.lane='invoice_facts' then
    perform clara._settle_processing_call(p_task,p_pages_used);
  end if;
  update clara.document_processing_tasks set status='done',vendor_op_ref=p_raw_sha256,
    finished_at=now() where id=p_task;
  select * into d from clara.documents where id=t.document_id;
  -- 0016 (P3/WA21-R7): the kind stamp is ONLY-IF-NULL — the facts writer's
  -- lane default never overwrites a classifier verdict or a human attestation.
  update clara.documents set
    document_kind=coalesce(document_kind,
      case when t.lane='local_facts' then 'e_invoice_xml' else 'invoice' end),
    financial_date=coalesce(v_date,financial_date) where id=t.document_id;

  v_newstate:=clara._invoice_fact_state(t.document_id);
  for v_entry in
    select e.id from clara.journal_entries e
    join clara.document_filings f on f.id=e.filing_id
    where f.document_id=t.document_id and f.retired_at is null and e.status='draft'
    order by e.id
  loop
    select coding_kind,coalesce(flags,'{}'::jsonb) into v_ekind,v_eflags
      from clara.journal_entries where id=v_entry;
    v_eflags:=v_eflags - 'amount_exception' - 'amount_override';
    if v_ekind='supplier_bill'
       and coalesce((v_newstate->>'corroborated')::boolean,false) then
      select coalesce(sum(l.credit_cents),0) into v_p_payable
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_class='payable';
      select coalesce(sum(l.debit_cents),0) into v_p_expense
      from clara.journal_lines l join clara.coa_accounts a
        on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=v_entry and a.account_type='expense';
      if v_p_payable<>(v_newstate->>'total_cents')::bigint
         or v_p_expense<>(v_newstate->>'total_cents')::bigint then
        v_eflags:=v_eflags||jsonb_build_object('amount_exception',jsonb_build_object(
          'machine_total_cents',(v_newstate->>'total_cents')::bigint,
          'proposed_cents',v_p_payable,
          'fact_hash',v_newstate->>'total_fact_hash','at',now()));
      end if;
    end if;
    update clara.journal_entries set revision_token=gen_random_uuid(),
      flags=v_eflags,updated_at=now()
      where id=v_entry and status='draft' returning revision_token into v_token;

    insert into clara.journal_entry_revisions(firm_id,client_id,entry_id,revision_no,
        revision_token,actor_kind,actor,reason,header,legs,rule_decision_id,evidence_refs)
      select j.firm_id,j.client_id,j.id,
        coalesce((select max(r.revision_no)+1 from clara.journal_entry_revisions r
          where r.entry_id=j.id),0),v_token,'facts',null,'facts_rotated',
        to_jsonb(j)-'firm_id'-'client_id'-'id'-'created_at'-'updated_at',
        coalesce((select jsonb_agg(jsonb_build_object('line_no',l.line_no,
          'account_code',l.account_code,'debit_cents',l.debit_cents,
          'credit_cents',l.credit_cents,'side',case when l.debit_cents>0 then 'debit'
            else 'credit' end,'counterparty_id',l.counterparty_id,
          'description',l.description) order by l.line_no)
          from clara.journal_lines l where l.entry_id=j.id),'[]'::jsonb),
        (select rd.id from clara.rule_decisions rd where rd.entry_id=j.id
          order by rd.created_at desc,rd.id desc limit 1),
        coalesce((select jsonb_agg(jsonb_build_object('evidence_id',ev.id,
          'region_id',ev.region_id,'fact_hash',ev.fact_hash,
          'provenance_tier',ev.provenance_tier) order by ev.id)
          from clara.entry_evidence ev where ev.entry_id=j.id),'[]'::jsonb)
      from clara.journal_entries j where j.id=v_entry;
  end loop;
  perform clara._audit(t.firm_id,null,null,null,'persist_invoice_facts',null,
    jsonb_build_object('task',p_task,'document',t.document_id,'extraction',v_ext,
      'version',t.version_n,'pages',p_pages_used));
  perform clara._append_event(t.firm_id,'document.invoice_facts_completed',null,null,null,null,
    null,t.document_id,null,jsonb_build_object('task_id',p_task,
      'extraction_id',v_ext,'version_n',t.version_n));
  return jsonb_build_object('task_id',p_task,'extraction_id',v_ext,'status','done');
end $$;

alter function clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)
  owner to clara_fn_owner;

-- (C2) _assert_sales_invoice_shape_at CoR — the corrected ties.
--
-- The 0016 body is byte-identical EXCEPT the two ties named below. The components are read
-- HERE rather than in `_invoice_fact_state_at`, deliberately: leaving the fact-state helper
-- untouched is what makes "the XML/structured corroboration branch is byte-identical"
-- (contract gate XG4) provable by inspection rather than by argument.
--
-- SIGN CONVENTION (ADR-047, recorded once, here): every component is stored POSITIVE as it
-- is printed on the document. The DISCOUNT subtracts in the identity; everything else adds.
-- A negative-signed discount region would therefore double-count, which is why the write
-- boundary normalises through the same `_normalize_invoice_cents` grammar as every other
-- monetary fact and the reader never takes an absolute value.
create or replace function clara._assert_sales_invoice_shape_at(p_entry uuid, p_extraction uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  e record; v_state jsonb; v_gross bigint; v_net bigint; v_tax bigint; v_round bigint;
  v_recv bigint; v_rev bigint; v_sst bigint; v_sst_acct text; v_type text;
  v_is_cn boolean; v_ctrl_correct int; v_ctrl_total int; v_outside int;
  v_round_imb bigint; v_leg_n int;
  v_ext uuid; v_sc bigint; v_disc bigint; v_dlv bigint;
  v_sc_c int; v_disc_c int; v_dlv_c int; v_consideration bigint;
begin
  select * into e from clara.journal_entries where id = p_entry;
  if not found then return; end if;
  -- Act ONLY on sales entries. NB: `coding_kind not in (...)` is NULL (not true) when
  -- coding_kind is NULL, so an explicit NULL guard is required — otherwise the whole
  -- floor would run on non-sales entries (manual JVs, supplier bills) and its
  -- complete-shape check would reject their legitimate legs.
  if e.coding_kind is null
     or e.coding_kind not in ('sales_invoice','sales_credit_note')
     or e.reversal_of is not null then
    return;
  end if;
  if e.document_id is null then return; end if;
  v_is_cn := e.coding_kind = 'sales_credit_note';
  v_state := case when p_extraction is null then clara._invoice_fact_state(e.document_id) else clara._invoice_fact_state_at(e.document_id, p_extraction) end;
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_net   := nullif(v_state->>'total_excl_tax_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;
  v_round := nullif(v_state->>'rounding_cents','')::bigint;
  v_type  := nullif(v_state->>'type_code','');

  -- FIX-2 + RESIDUAL-2 (type_code bound to polarity, EXHAUSTIVE). When the source states a
  -- document type, bind it to the coding polarity with a POSITIVE whitelist: a sales_invoice
  -- (incl. a debit note) codes ONLY from type 01/03; a sales_credit_note ONLY from 02/04.
  -- Any OTHER stated type (a self-billed 11-14, an unknown code, or the cross-polarity code)
  -- REFUSES => NEEDS YOU, rather than silently coding an unrecognized document. OCR docs
  -- carry no type_code => the binding is inert (unchanged for the RPR OCR corpus).
  if v_type is not null then
    if v_is_cn then
      if v_type not in ('02','04') then
        raise exception 'document type % does not match a credit-note coding', v_type
          using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
      end if;
    else
      if v_type not in ('01','03') then
        raise exception 'document type % does not match an invoice coding', v_type
          using errcode='CLR21',detail='{"reason":"type_polarity_mismatch"}';
      end if;
    end if;
  end if;

  -- SST account presence (only demanded when tax facts are actually present). Ordered
  -- BEFORE the whole-shape check so a missing sst_output account on the chart surfaces
  -- sst_account_missing rather than the generic shape refusal.
  select account_code into v_sst_acct from clara.coa_accounts
    where client_id=e.client_id and special_acc_type='sst_output' and is_active;
  if v_tax is not null and v_tax > 0 and v_sst_acct is null then
    raise exception 'a tax-bearing sales invoice needs an sst_output account'
      using errcode='CLR10',detail='{"reason":"sst_account_missing"}';
  end if;

  -- FIX-1 (adversarial #2, control-account laundering): the entry must consist ONLY of
  -- the expected legs — receivable control, income, sst_output, rounding — and NOTHING
  -- else (a payable-class or otherwise-unrelated leg RAISES). Combined with the ties
  -- below + the balance invariant, every cent is accounted for, so a split can never
  -- launder an amount into a control account outside the signed sales shape.
  select count(*) into v_outside from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry
      and a.account_class is distinct from 'receivable'
      and a.account_type is distinct from 'income'
      and coalesce(a.special_acc_type,'') not in ('sst_output','rounding');
  if v_outside > 0 then
    raise exception 'a sales entry admits only receivable, income, sst_output and rounding legs'
      using errcode='CLR23';
  end if;
  -- EXACTLY ONE receivable control leg, on the direction-correct side (invoice DEBIT,
  -- credit-note CREDIT); no opposite or additional receivable control leg.
  select
    count(*) filter (where a.account_class='receivable'
      and ((not v_is_cn and l.debit_cents>0) or (v_is_cn and l.credit_cents>0))),
    count(*) filter (where a.account_class='receivable')
    into v_ctrl_correct, v_ctrl_total
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_correct <> 1 or v_ctrl_total <> 1 then
    raise exception 'a sales entry requires exactly one direction-correct receivable control leg'
      using errcode='CLR23';
  end if;
  -- RESIDUAL-1 (defense-in-depth): after bounding the leg CATEGORIES above, bound the
  -- rounding leg's AMOUNT. A 'rounding' leg is admitted by category but may carry only an
  -- immaterial amount; aggregate |dr−cr| over any leg outside {receivable, income,
  -- sst_output} (i.e. the rounding legs) must be <= greatest(5, n_legs) sen. Without this
  -- an entry stating no net/tax facts could launder a material amount into rounding while
  -- passing the gross tie (net/tax ties are skipped when those facts are absent).
  select count(*)::int into v_leg_n from clara.journal_lines where entry_id=p_entry;
  select coalesce(sum(abs(l.debit_cents-l.credit_cents)),0) into v_round_imb
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry
      and a.account_class is distinct from 'receivable'
      and a.account_type is distinct from 'income'
      and coalesce(a.special_acc_type,'') is distinct from 'sst_output';
  if v_round_imb > greatest(5, v_leg_n) then
    raise exception 'a sales entry admits no material amount outside the receivable/income/sst legs'
      using errcode='CLR23';
  end if;

  -- Nothing to tie against without a stated gross (mirrors AP: enforce only when
  -- the facts declare a total). Human/agent judgment carries an uncorroborated draft.
  if v_gross is null then return; end if;

  -- 0022 (X3): the STATED COMPONENTS, read off the bound extraction. Placed AFTER the
  -- no-gross return so an extraction that states nothing costs nothing, and read by
  -- COUNT as well as value so a present-but-unreadable component can never arrive as a
  -- silent zero (the read guard mirroring 0016:2221-2224; the write boundary in
  -- persist_invoice_facts already refuses such a row outright).
  v_ext := nullif(v_state->>'extraction_id','')::uuid;
  select count(*)::int, min(monetary_cents) into v_sc_c, v_sc from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.service_charge';
  select count(*)::int, min(monetary_cents) into v_disc_c, v_disc from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.discount';
  select count(*)::int, min(monetary_cents) into v_dlv_c, v_dlv from clara.document_regions
    where extraction_id = v_ext and field_path = 'invoice.delivery';
  if (v_sc_c > 0 and v_sc is null)
     or (v_disc_c > 0 and v_disc is null)
     or (v_dlv_c > 0 and v_dlv is null) then
    raise exception 'a stated invoice component is present but unreadable'
      using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
  end if;
  -- THE BELT on the sign convention (adversarial round 1 — FATAL). The write boundary
  -- refuses a negative component, and that is the buckle; this is the belt. It costs one
  -- comparison and it covers the cases the write boundary cannot: a region written before
  -- 0022 by any path, a root/superuser insert, or a future writer that forgets. The
  -- identity SUBTRACTS the discount, so a negative one turns a subtraction into an
  -- addition and forges a larger gross that ties — the money-wrong outcome this floor
  -- exists to make impossible. Refusing is always correct here: a negative component is
  -- not a document Clara can read, whatever put it there.
  if coalesce(v_sc,0) < 0 or coalesce(v_disc,0) < 0 or coalesce(v_dlv,0) < 0 then
    raise exception 'a stated invoice component is negative (components are stated positive; the discount subtracts in the identity)'
      using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
  end if;

  -- TIE 2, corrected (X3 / ADR-047). The 0016 identity was `net + tax + rounding = gross`,
  -- which is simply WRONG for any document that prints a service charge, a discount or a
  -- delivery line: on LAI LOU MEI (94.30 + 3.77 service charge + 5.66 tax + 0.02 rounding
  -- = 103.75) every figure is read correctly off the face of the document and the old tie
  -- still fails, with no override available on the sales side. The identity is now the SUM
  -- OF STATED COMPONENTS, over the closed taxonomy: absent components coalesce to zero
  -- (they were not printed), the discount subtracts, and the sum must equal the stated
  -- total EXACTLY — every failure mode is a refusal, never a wrong post.
  -- Dormancy is unchanged: the guard is still `net and tax both stated`, which is false for
  -- all 29 live extractions.
  if v_net is not null and v_tax is not null
     and (v_net + coalesce(v_sc,0) + coalesce(v_dlv,0) + v_tax + coalesce(v_round,0)
          - coalesce(v_disc,0)) <> v_gross then
    raise exception 'sales tax breakdown does not tie to the gross total'
      using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
  end if;
  if v_is_cn then
    -- type 02 mirror: receivable CREDIT = gross, revenue DEBIT = net, sst DEBIT = tax.
    select coalesce(sum(l.credit_cents),0) into v_recv from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class='receivable';
    select coalesce(sum(l.debit_cents),0) into v_rev from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='income';
    select coalesce(sum(l.debit_cents),0) into v_sst from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.special_acc_type='sst_output';
  else
    -- sales_invoice (type 01, and DN 03 which RAISES receivable like an invoice):
    -- receivable DEBIT = gross, revenue CREDIT = net, sst CREDIT = tax.
    select coalesce(sum(l.debit_cents),0) into v_recv from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_class='receivable';
    select coalesce(sum(l.credit_cents),0) into v_rev from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.account_type='income';
    select coalesce(sum(l.credit_cents),0) into v_sst from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and a.special_acc_type='sst_output';
  end if;
  if v_recv <> v_gross then
    raise exception 'receivable-class total differs from the stated gross'
      using errcode='CLR23';
  end if;
  -- TIE 3, corrected (X3). The income side must equal the CONSIDERATION — everything the
  -- customer is charged EXCEPT the tax and the rounding residual. The 0016 form compared
  -- revenue to `net` alone, which breaks on the same service-charge documents tie 2 broke
  -- on: a service charge is income, so the income legs legitimately exceed the subtotal.
  --   * when the document states a tax, the consideration is `gross - tax - rounding`
  --     (identical to net + sc + dlv - disc, which tie 2 has just proven);
  --   * when it states a net but NO tax, the consideration is built from the components
  --     directly — this branch is what keeps the LIVE structured/MyInvois path exactly as
  --     enforced as it is today. Dropping it in favour of a tax-only guard would silently
  --     stop checking any net-stating, tax-silent document, which is a weakening, not a fix.
  -- On a component-less extraction the second branch reduces to `v_rev <> v_net` — the 0016
  -- expression, byte-for-byte in behaviour.
  if v_tax is not null then
    v_consideration := v_gross - v_tax - coalesce(v_round,0);
    if v_rev <> v_consideration then
      raise exception 'revenue total differs from the stated non-tax consideration'
        using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
    end if;
  elsif v_net is not null then
    v_consideration := v_net + coalesce(v_sc,0) + coalesce(v_dlv,0) - coalesce(v_disc,0);
    if v_rev <> v_consideration then
      raise exception 'revenue total differs from the stated net'
        using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
    end if;
  end if;
  if v_tax is not null and v_tax > 0 and v_sst <> v_tax then
    raise exception 'sst_output total differs from the stated tax'
      using errcode='CLR21',detail='{"reason":"tax_tie_failed"}';
  end if;
end $$;

alter function clara._assert_sales_invoice_shape_at(uuid,uuid) owner to clara_fn_owner;

-- =====================================================================
-- §D — X4: the anchor DARK GUARD
-- =====================================================================
--
-- `anchor_missing` (0016:2715-2722) is the OCR-sales compensating control inside the posting
-- executor. It is TODAY an unconditional, structural refusal — not because anyone decided
-- so, but because `invoice.tax_total` and `invoice.total_excl_tax` have zero occurrences
-- across all 29 extractions, so `v_net is null or v_tax is null` is true for every OCR
-- document that exists. X2 supplies exactly those two inputs. Emitting them would therefore
-- switch a live posting barrier OFF as a SIDE EFFECT of a feature — the refusal record's
-- FATAL 2, and the reason the naive build was refused.
--
-- So the block changes in two ways at once, and only one of them is behavioural:
--   * the identity becomes the corrected component identity from §C (so that when the lane
--     does open, it opens on an equation that is right about Malaysian invoices);
--   * a DARK GUARD disjunct keeps the block firing unconditionally, so the outcome for
--     every document — today's 29 and every future one — is byte-stable until the X5
--     corroboration micro-migration removes it deliberately, with its own review and its
--     own before/after measurement on live (contract gate XG5).
-- Every other line of this function is byte-identical to the 0016 CoR.
--
-- WHAT THE GUARD DOES AND DOES NOT PROVE (rewritten after adversarial round 2; BOTH earlier
-- versions of this paragraph were wrong, in different ways, and the second was wrong in a
-- more dangerous way because it sounded rigorous).
--
-- What is true: the guard makes the NEW body unable to pass the anchor block for ANY input.
--
-- What it says nothing about: a call already executing the OLD body when this migration
-- commits. Per the repo's binding D1 rule that call finishes on the old body; no
-- `create or replace` reaches into it and no tail assertion can see it.
--
-- The round-1 wording then claimed the in-flight window was harmless because "the pre-X2
-- mapper cannot emit `invoice.total_excl_tax` / `invoice.tax_total`". THAT IS FALSE.
-- `invoiceFacts.v1.azure.mjs`'s FIELD_MAP has mapped `SubTotal -> invoice.total_excl_tax`
-- and `TotalTax -> invoice.tax_total` since Wave A2 — the deployed v5 mapper, today. The
-- 0/29 measurement is EMPIRICAL (Azure does not return those fields on the layouts in this
-- corpus), not STRUCTURAL (the mapper is perfectly able to emit them). A single future
-- document on a layout where Azure does return both, at >=0.95 confidence with a polygon
-- and MYR, would satisfy the OLD body's whole stack — Tier-A corroboration, the old
-- `net + tax + rounding = gross` anchor, the rule gates and the sighting floor — and post.
-- That is not a defect in 0016: it is 0016's sanctioned law, and changing it is exactly why
-- X4 exists. But it means the in-flight window is a REAL window, not an empty one.
--
-- So the window is closed by CEREMONY, not by staging: **0022 applies under a brief runtime
-- quiesce** (stop `clara-runtime`, apply, start). With no runtime there is no in-flight
-- executor call to finish on the old body, and the D1 rule has nothing to act on. The
-- quiesce is seconds, because this migration takes no long lock and rewrites no table.
--
-- The deploy-ORDER obligation stands on its own and is unaffected by the above: **deploy
-- 0022 BEFORE X2, never after and never concurrently.** X2 exists precisely to make Azure's
-- net/tax fields arrive reliably, so shipping it first would flood the corpus with documents
-- that satisfy the old body — turning a narrow, quiesced window into a wide one.
create or replace function clara.execute_rule_post(p_entry uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  e record; r record; v_direction text; v_kind text; v_fp jsonb;
  v_counterparty uuid; v_total bigint; v_window_start timestamptz; v_count int;
  v_result jsonb; v_run uuid; v_ctrl_total int; v_ctrl_ok int; v_detail text;
  v_state jsonb; v_gross bigint; v_tax bigint; v_ctrl_amount bigint;
  v_signed_ok int; v_signed_wrong int; v_sst_legs int; v_sst_amt bigint;
  v_round_legs int; v_round_imb bigint; v_outside_legs int;
  v_net bigint; v_round bigint; v_inv_id text; v_inv_date text;
  v_kind_doc text; v_fx uuid; v_sup_reg text; v_sup_name text;
  v_cust_reg text; v_cust_taxid text; v_cust_name text; v_client_name text;
  v_hard_ok boolean; v_name_ok boolean; v_buyer_hit boolean;
  v_due_c int; v_due_amt bigint; v_skips int; v_suspended boolean:=false;
  v_doc_lane text; v_doc_class text; v_verdict jsonb; v_lane_n int;
  v_cust_name_raw text; v_cust_reg_raw text; v_buyer_fp jsonb; v_buyer_id uuid;
  v_fseen int; v_fdocs int; v_fspan int;
  v_sc bigint; v_disc bigint; v_dlv bigint; v_sc_c int; v_disc_c int; v_dlv_c int;
begin
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  select * into e from clara.journal_entries where id=p_entry;
  if not found then raise exception 'entry not found' using errcode='CLR11'; end if;

  if e.status<>'draft' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_a_draft');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
  end if;
  if e.coding_kind is null or e.document_id is null or e.proposed_counterparty is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'not_eligible_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_eligible_shape');
  end if;

  -- ADV-R2 (R1#1): ONE BOUND EXTRACTION per document per post, resolved BEFORE
  -- the direction step (direction itself consumes the doc's facts). A document
  -- with done facts in BOTH lanes (a historical OCR pass beside a later XML
  -- parse) is inherently ambiguous evidence — a named visible skip, never a
  -- coin-flip between potentially disagreeing extractions. With exactly one
  -- done lane the extraction is bound ONCE (v_fx) and every consumer — the
  -- direction, the class check, the fact state, and every envelope field —
  -- reads that SAME single-lane extraction.
  select count(distinct t.lane)::int into v_lane_n
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done';
  if v_lane_n>1 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'evidence_lane_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','evidence_lane_ambiguous');
  end if;
  select t.lane,x.id into v_doc_lane,v_fx
    from clara.document_processing_tasks t
    join clara.document_extractions x on x.document_id=t.document_id
      and x.engine_id=t.engine_id and x.version_n=t.version_n
      and x.engine_kind='invoice_facts' and x.status='done'
    where t.document_id=e.document_id
      and t.lane in ('invoice_facts','local_facts') and t.status='done'
    order by t.version_n desc,t.id desc limit 1;
  -- ADV-R4#1: ZERO done lanes = facts-absent — a named skip BEFORE direction.
  -- The post path NEVER proceeds unpinned: a later/concurrent extraction commit
  -- could otherwise be picked up mid-post by the live selectors.
  if v_fx is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'facts_missing');
    return jsonb_build_object('entry_id',p_entry,'status','skipped',
      'reason','facts_missing');
  end if;

  -- direction (client-aware, pinned to the ONE bound extraction — ADV-R3#1) —
  -- an unresolved direction is a skip, never a raise.
  begin
    v_direction:=clara._document_direction_at(e.document_id,e.client_id,v_fx);
  exception when sqlstate 'CLR30' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'direction_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','direction_unresolved');
  end;
  v_kind:=case when v_direction='sales' then 'customer' else 'vendor' end;

  -- resolve the draft's counterparty (kind-scoped by direction) to match the rule.
  begin
    v_fp:=clara._resolve_counterparty(e.client_id,
      e.proposed_counterparty || jsonb_build_object('kind',v_kind));
  exception when sqlstate 'CLR23' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_ambiguous');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_ambiguous');
  end;
  if v_fp is null or v_fp->>'decision'='birth' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'counterparty_unresolved');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','counterparty_unresolved');
  end if;
  v_counterparty:=clara._canonical_counterparty(e.client_id,(v_fp->>'counterparty_id')::uuid);

  -- match + LOCK the live autopost rule (count-and-post atomic per rule).
  select * into r from clara.coding_rules
    where client_id=e.client_id and counterparty_id=v_counterparty
      and direction=v_direction and rule_type='autopost' and status='live'
    for update;
  if not found then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,null,'no_live_rule');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_live_rule');
  end if;

  -- RE-DERIVE every gate against live rows -----------------------------------
  if clara.is_high_stakes(p_entry) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'high_stakes');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','high_stakes');
  end if;
  -- 0016 P2(e)/P6: CN autopost is IMPOSSIBLE — a sales_credit_note draft skips
  -- by NAME (the 0015 control-shape refusal was incidental; this is the law).
  if v_direction='sales' and e.coding_kind='sales_credit_note' then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'cn_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','cn_not_autopostable');
  end if;
  -- 0016 P4 (WA21-R1): the sst_purchase_cost visibility leg is NOT sanctioned
  -- for autopost — human lanes only. A purchase draft carrying one skips by
  -- NAME before the generic account enumeration.
  if v_direction='purchase' and exists(select 1 from clara.journal_lines l
      join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=p_entry and coalesce(a.special_acc_type,'')='sst_purchase_cost') then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'purchase_sst_not_autopostable');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','purchase_sst_not_autopostable');
  end if;
  -- FIX-1+7 (adversarial laundering — COUNT+IDENTITY enumeration, REPLACING the v2
  -- Σ|dr−cr| tolerance). N tiny decoy legs could inflate a sum tolerance (each extra leg
  -- lifts the old greatest(5,n_legs) bound), and the old sst_output exemption was an
  -- untied free bucket. Instead the entry's legs must form EXACTLY the sanctioned set,
  -- verified by leg COUNT + account IDENTITY — there is NO aggregate tolerance to inflate.
  -- The post is REJECTED (control_shape / account_mismatch skip) if ANY of these fails:
  --   (a) EXACTLY ONE direction-correct control leg (purchase => one payable CREDIT;
  --       sales => one receivable DEBIT), whose amount = the stated gross when the facts
  --       state one (a control<>gross entry never auto-posts — the DB owns the number);
  --   (b) >= 1 leg to the rule's signed account on the direction-correct side, and ZERO
  --       signed-account legs on the wrong side;
  --   (c) sst_output is a SALES-side (output-tax) role ONLY (FIX-2 v4). On a SALES post it
  --       is a sanctioned role bounded to AT MOST ONE leg tied to the stated tax fact
  --       (invoice.tax_total). On a PURCHASE post it is NOT sanctioned at all — a purchase
  --       sst_output leg is an OUTSIDE leg (Malaysian purchase SST is expensed INTO cost,
  --       expense=gross; a separate sst leg is the item-7 laundering vector) → refuse (e).
  --   (d) AT MOST ONE rounding leg (special_acc_type='rounding'), |dr−cr| <= 5 sen;
  --   (e) ZERO legs to ANY OTHER account (every leg is one of the sanctioned roles above —
  --       a decoy leg to an unaccounted account, at ANY count or size, refuses — closes item
  --       1; on a purchase an sst_output leg lands here too — closes item 2). 0016: an
  --       sst_purchase_cost leg is never sanctioned either — the named skip above fires
  --       first on a purchase; on a sales draft it lands here as an outside leg.
  -- (v_fx/v_doc_lane were bound ONCE at the top of the fn — ADV-R2 R1#1.)
  v_state := case when v_fx is null then '{}'::jsonb
    else clara._invoice_fact_state_at(e.document_id,v_fx) end;
  v_gross := nullif(v_state->>'total_cents','')::bigint;
  v_tax   := nullif(v_state->>'tax_total_cents','')::bigint;

  -- (a) the single direction-correct control leg + its amount.
  select
    count(*) filter (where a.account_class in ('payable','receivable')),
    count(*) filter (where (v_direction='purchase' and a.account_class='payable'    and l.credit_cents>0)
                        or (v_direction='sales'    and a.account_class='receivable' and l.debit_cents>0)),
    coalesce(sum(case when v_direction='purchase' and a.account_class='payable'    then l.credit_cents
                      when v_direction='sales'    and a.account_class='receivable' then l.debit_cents
                      else 0 end),0)
    into v_ctrl_total, v_ctrl_ok, v_ctrl_amount
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_ctrl_total<>1 or v_ctrl_ok<>1
     or (v_gross is not null and v_ctrl_amount<>v_gross) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'control_shape');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','control_shape');
  end if;

  -- (b) signed-account legs by side; (c) sst_output legs + tied magnitude; (d) rounding
  -- legs + imbalance; (e) legs to an account OUTSIDE the four sanctioned roles. Every leg
  -- is classified by its account (join to coa_accounts) — count+identity, never a Σ bound.
  select
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.debit_cents>0) or (v_direction='sales' and l.credit_cents>0))),
    count(*) filter (where l.account_code=r.account_code
      and ((v_direction='purchase' and l.credit_cents>0) or (v_direction='sales' and l.debit_cents>0))),
    count(*) filter (where coalesce(a.special_acc_type,'')='sst_output'),
    coalesce(sum(l.debit_cents+l.credit_cents) filter (where coalesce(a.special_acc_type,'')='sst_output'),0),
    count(*) filter (where coalesce(a.special_acc_type,'')='rounding'),
    coalesce(sum(abs(l.debit_cents-l.credit_cents)) filter (where coalesce(a.special_acc_type,'')='rounding'),0),
    count(*) filter (where coalesce(a.account_class,'') not in ('payable','receivable')
      and l.account_code<>r.account_code
      and coalesce(a.special_acc_type,'')<>'rounding'
      and not (v_direction='sales' and coalesce(a.special_acc_type,'')='sst_output'))
    into v_signed_ok, v_signed_wrong, v_sst_legs, v_sst_amt, v_round_legs, v_round_imb, v_outside_legs
    from clara.journal_lines l
    join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
    where l.entry_id=p_entry;
  if v_signed_ok<1 or v_signed_wrong>0
     or v_outside_legs>0
     or v_sst_legs>1 or (v_sst_legs=1 and (v_tax is null or v_sst_amt<>v_tax))
     or v_round_legs>1 or v_round_imb>5 then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'account_mismatch');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','account_mismatch');
  end if;
  select coalesce(sum(debit_cents),0) into v_total from clara.journal_lines where entry_id=p_entry;
  if v_total>r.amount_cap_cents then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'over_cap');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','over_cap');
  end if;
  v_window_start:=case when r.frequency_window='monthly'
    then (date_trunc('month',now() at time zone 'utc') at time zone 'utc')
    else now()-interval '30 days' end;
  select count(*)::int into v_count from clara.rule_post_runs
    where rule_id=r.id and posted_at>=v_window_start;
  if v_count>=r.window_max_posts then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'window_exhausted');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','window_exhausted');
  end if;
  if r.expires_at<=now() then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'expired');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','expired');
  end if;
  if e.revision_token is null then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'no_revision');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','no_revision');
  end if;

  -- FIX v5 (item 5 — CORROBORATION-REQUIRED to auto-post): the confidence ladder auto-posts
  -- ONLY DB-VERIFIED entries. Every rule gate above re-derives cap/window/shape, but the
  -- control-leg tie (a) only anchors to gross when gross is non-NULL. A NON-corroborated
  -- document — a blank / malformed / unreadable total, or ANY state short of Tier-A — leaves
  -- v_gross NULL, so the tie stays inert and an interactive wake draft (the runtime submits
  -- EVERY coded entry.drafted to this executor — rule-post.mjs, not only autodraft) could cite
  -- a non-total region, carry an ARBITRARY under-cap balanced amount, and be auto-posted with
  -- no verified anchor ("the DB owns every number"). Require the document fact-state's
  -- `corroborated` signal to be true before driving the post; otherwise SKIP `not_corroborated`
  -- and leave the entry in the human queue. This is the executor's ADMISSION gate, not a persist
  -- refusal: `invoice.total` still persists blank/non-corroborated at the write boundary
  -- (fail-closed, unchanged). A corroborated bill (gross verified ⇒ the (a) tie already fired)
  -- is unaffected — the positive path still auto-posts. Placed LAST so every specific rule-gate
  -- skip (control_shape / account_mismatch / over_cap / window_exhausted / expired / no_revision)
  -- still fires first for a shaped-but-non-corroborated draft; a CLEAN-shaped non-corroborated
  -- draft (the residual-5 laundering path) lands here.
  if not coalesce((v_state->>'corroborated')::boolean,false) then
    insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
      values(e.firm_id,e.client_id,p_entry,r.id,'not_corroborated');
    return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_corroborated');
  end if;

  -- ADV-1: the DOCUMENT's ACTUAL evidence class, derived from its latest done
  -- facts task lane (the local no-egress MyInvois parse = 'structured'; the
  -- Azure OCR lane = 'ocr_sales') — NEVER from the rule label alone. A signed
  -- class that does not match the document's real extraction source is a named
  -- visible skip: an OCR document can never ride a 'structured' rule around
  -- the envelope, and an XML document never consumes an OCR authority.
  if v_direction='sales' then
    -- ADV-R2 (R1#1): the class derives from the ONE BOUND lane resolved above
    -- (v_doc_lane rides the same single resolution as v_fx and v_state).
    v_doc_class:=case v_doc_lane when 'local_facts' then 'structured'
                                 when 'invoice_facts' then 'ocr_sales' end;
    if v_doc_class is null or v_doc_class is distinct from r.evidence_class then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'evidence_class_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','evidence_class_mismatch','document_class',v_doc_class,
        'rule_class',r.evidence_class);
    end if;
  end if;

  -- 0016 §3.3: the OCR compensating-control envelope, RE-DERIVED at post time
  -- (control 8 — no trust in signing-time state).
  if v_direction='sales' and r.evidence_class='ocr_sales' then
    -- (a) positive polarity evidence (ADV-3: a done classifier row is not by
    -- itself positive evidence — the WINNING verdict must POSITIVELY say
    -- 'invoice'): the human correction outranks classifier verdicts; among
    -- classifier rows the newest version wins; the verdict must be
    -- high-confidence (>=0.8, never low_confidence) or human, and must agree
    -- with the CURRENT document_kind.
    select d2.document_kind into v_kind_doc from clara.documents d2 where d2.id=e.document_id;
    select x.envelope into v_verdict from clara.document_extractions x
      where x.document_id=e.document_id and x.engine_kind='doc_classify'
        and x.status='done'
      order by case when x.envelope->>'source'='human' then 0 else 1 end,
        x.version_n desc limit 1;
    if v_kind_doc is distinct from 'invoice'
       or v_verdict is null
       or (v_verdict->>'verdict_kind') is distinct from 'invoice'
       or coalesce((v_verdict->>'low_confidence')::boolean,false)
       or not ((v_verdict->>'source')='human'
               or coalesce((v_verdict->>'confidence')::numeric,0)>=0.8) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'polarity_unverified');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','polarity_unverified','rule_suspended',v_suspended);
    end if;
    -- (b) hard direction evidence — every field reads the ONE BOUND extraction
    -- (v_fx, resolved once above; ADV-R2 R1#1).
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_sup_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.vendor_name';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_reg from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_taxid from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_taxid';
    select lower(regexp_replace(nullif(btrim(min(dr.text_content)),''),'[^a-zA-Z0-9]','','g'))
      into v_cust_name from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')) into v_client_name
      from clara.clients where id=e.client_id;
    v_hard_ok:=v_sup_reg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
        and ci.value_normalized=v_sup_reg);
    v_name_ok:=v_sup_name is not null and (v_sup_name=v_client_name
      or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
          and al.retired_at is null and al.alias_normalized=v_sup_name));
    v_buyer_hit:=
      (v_cust_reg is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_reg))
      or (v_cust_taxid is not null and exists(select 1 from clara.client_identifiers ci
        where ci.client_id=e.client_id and ci.kind in ('tin','ssm')
          and ci.value_normalized=v_cust_taxid))
      or (v_cust_name is not null and (v_cust_name=v_client_name
        or exists(select 1 from clara.client_aliases al where al.client_id=e.client_id
            and al.retired_at is null and al.alias_normalized=v_cust_name)));
    if not (v_hard_ok and v_name_ok) or v_buyer_hit then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'direction_unproven');
      select count(*)::int into v_skips from clara.rule_post_skips
        where rule_id=r.id and reason in ('polarity_unverified','direction_unproven')
          and created_at>=now()-interval '30 days';
      if v_skips>=3 then
        update clara.coding_rules set status='suspended_pending_resignature' where id=r.id;
        v_suspended:=true;
        begin
          perform clara._record_notification_core(r.signed_by,e.firm_id,null,null,
            r.client_id,'autopost_rule_suspended',
            jsonb_build_object('rule_id',r.id,'counterparty_id',r.counterparty_id,
              'message','An OCR-sales auto-post rule was suspended after repeated polarity/direction skips. Review the drafts and sign a successor to re-enable.'),
            'autopost-suspend:'||r.id::text);
        exception when others then null;
        end;
      end if;
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','direction_unproven','rule_suspended',v_suspended);
    end if;
    -- (b2) ADV-4: stated-buyer <-> signed-counterparty CONGRUENCE. Control (b)
    -- proves only that the buyer is NOT the client; the invoice's stated buyer
    -- must ALSO resolve (kind-scoped, no birth ever) to the SAME canonical
    -- customer the signed rule names — an invoice billing Buyer B can never be
    -- posted through Customer A's authority. Absence, ambiguity, birth, or a
    -- registration contradiction is a named visible skip.
    select nullif(btrim(min(dr.text_content)),'') into v_cust_name_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_name';
    select nullif(btrim(min(dr.text_content)),'') into v_cust_reg_raw
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.customer_registration';
    v_buyer_id:=null;
    if v_cust_name_raw is not null then
      begin
        v_buyer_fp:=clara._resolve_counterparty(e.client_id,jsonb_strip_nulls(
          jsonb_build_object('kind','customer','new',jsonb_build_object(
            'name',v_cust_name_raw,'registration_no',v_cust_reg_raw))));
        if v_buyer_fp is not null and v_buyer_fp->>'decision'<>'birth'
           and (v_buyer_fp->>'counterparty_id') is not null then
          v_buyer_id:=clara._canonical_counterparty(e.client_id,
            (v_buyer_fp->>'counterparty_id')::uuid);
        end if;
      exception when sqlstate 'CLR23' or sqlstate 'CLR21' then
        v_buyer_id:=null; -- ambiguity/contradiction => mismatch below
      end;
    end if;
    if v_buyer_id is null
       or v_buyer_id is distinct from clara._canonical_counterparty(e.client_id,r.counterparty_id) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'buyer_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped',
        'reason','buyer_mismatch');
    end if;
    -- (c) full multi-anchor corroboration.
    v_net:=nullif(v_state->>'total_excl_tax_cents','')::bigint;
    v_round:=nullif(v_state->>'rounding_cents','')::bigint;
    v_inv_id:=nullif(v_state->>'invoice_id','');
    v_inv_date:=nullif(v_state->>'invoice_date','');
    select count(*)::int,min(dr.monetary_cents) into v_due_c,v_due_amt
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.amount_due';
    -- 0022 (X3): the stated components of the corrected identity, read off the SAME bound
    -- extraction as every other anchor field.
    select count(*)::int,min(dr.monetary_cents) into v_sc_c,v_sc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.service_charge';
    select count(*)::int,min(dr.monetary_cents) into v_disc_c,v_disc
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.discount';
    select count(*)::int,min(dr.monetary_cents) into v_dlv_c,v_dlv
      from clara.document_regions dr
      where dr.extraction_id=v_fx and dr.field_path='invoice.delivery';
    if true  -- X4 DARK GUARD (0022): the OCR-sales anchor lane stays structurally shut;
             -- ONLY the X5 corroboration micro-migration may remove this disjunct.
             -- Rationale in the §D header: emitting net/tax (X2) would otherwise switch a
             -- LIVE posting barrier off as a side effect, which is the refusal that killed
             -- the naive Gate-P build. Removing it is a deliberate, reviewed, measured act.
       or v_gross is null or v_inv_id is null or v_inv_date is null
       or v_net is null or v_tax is null
       or (v_sc_c>0 and v_sc is null) or (v_disc_c>0 and v_disc is null)
       or (v_dlv_c>0 and v_dlv is null)
       -- The sign belt, mirroring the shape floor (adversarial round 1 — FATAL): a
       -- NEGATIVE discount turns the identity's subtraction into an addition and forges
       -- a larger gross that ties. The write boundary refuses one; this makes the anchor
       -- lane refuse one too, so removing the dark guard at X5 cannot open on a forged
       -- identity even if a component arrived by some other path.
       or coalesce(v_sc,0)<0 or coalesce(v_disc,0)<0 or coalesce(v_dlv,0)<0
       or (v_net+coalesce(v_sc,0)+coalesce(v_dlv,0)+v_tax+coalesce(v_round,0)
           -coalesce(v_disc,0))<>v_gross
       or v_due_c<>1 or v_due_amt is null or v_due_amt<>v_gross then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'anchor_missing');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','anchor_missing');
    end if;
    -- (d) an EXISTING resolved customer, re-derived live (no birth ever).
    if not exists(select 1 from clara.counterparties cp where cp.id=r.counterparty_id
        and cp.client_id=e.client_id and cp.kind='customer'
        and cp.merged_into is null and cp.retired_at is null) then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'customer_unresolved');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','customer_unresolved');
    end if;
    -- (e2) ADV-5: the sighting FLOOR re-derived atomically at post time, under
    -- the client serialization lock (the same advisory lock the approve core
    -- takes — reentrant in this transaction, so a concurrent reversal cannot
    -- slip between the floor check and the post). Evidence reversed since
    -- signing strips the live authority: a named visible skip.
    perform pg_advisory_xact_lock(203005004,hashtext(e.client_id::text));
    select f.qualifying,f.distinct_invoices,f.span_days into v_fseen,v_fdocs,v_fspan
      from clara._ocr_sales_floor(e.client_id,
        clara._canonical_counterparty(e.client_id,r.counterparty_id),r.account_code) f;
    if coalesce(v_fseen,0)<6 or coalesce(v_fdocs,0)<6 or v_fspan is null or v_fspan<60 then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'floor_lost');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','floor_lost');
    end if;
  end if;

  -- Drive the SAME approve core with the rule identity. ONLY the benign races become
  -- skips (review M2): CLR06 (stale revision) and the CLR10 that is specifically the
  -- not-a-draft status race (a human approved/withdrew concurrently — detail reason
  -- 'not_a_draft'). FIX-6 (adversarial #12): any OTHER CLR10 — e.g. a shape-floor
  -- CLR10 like sst_account_missing — PROPAGATES honestly, never masked as not_a_draft.
  begin
    v_result:=clara._approve_entry_core(
      jsonb_build_object('actor',r.signed_by,'firm',e.firm_id,'checked_via_rule_id',r.id,
        'bound_extraction',v_fx),
      p_entry,e.revision_token,null,p_op_key);
  exception
    when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%not_a_draft%' then
        raise;   -- propagate every non-race CLR10 (e.g. sst_account_missing)
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'not_a_draft');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','not_a_draft');
    when sqlstate 'CLR21' then
      -- RESIDUAL-2: the supplier-bill shape floor refuses a non-01 supplier document
      -- (type_polarity_mismatch) inside the approve core. The executor degrades that to a
      -- QUIET skip (=> NEEDS YOU), never an error loop; any OTHER CLR21 propagates honestly.
      get stacked diagnostics v_detail = pg_exception_detail;
      if coalesce(v_detail,'') not like '%type_polarity_mismatch%' then
        raise;
      end if;
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'type_polarity_mismatch');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','type_polarity_mismatch');
    when sqlstate 'CLR06' then
      insert into clara.rule_post_skips(firm_id,client_id,entry_id,rule_id,reason)
        values(e.firm_id,e.client_id,p_entry,r.id,'stale_revision');
      return jsonb_build_object('entry_id',p_entry,'status','skipped','reason','stale_revision');
  end;

  -- Receipt (rule snapshot at post time, for the audit join) + the typed event.
  insert into clara.rule_post_runs(firm_id,client_id,rule_id,entry_id,posted_at,snapshot)
    values(e.firm_id,e.client_id,r.id,p_entry,now(),
      jsonb_build_object('rule_id',r.id,'account_code',r.account_code,'direction',r.direction,
        'amount_cap_cents',r.amount_cap_cents,'frequency_window',r.frequency_window,
        'window_max_posts',r.window_max_posts,'signed_by',r.signed_by,
        'content_hash',r.content_hash,'posted_total_cents',v_total,
        'evidence_class',r.evidence_class))
    returning id into v_run;
  perform clara._append_event(e.firm_id,'entry.rule_posted',e.client_id,r.signed_by,null,null,
    p_entry,e.document_id,null,jsonb_build_object('rule_id',r.id,'run_id',v_run,
      'counterparty_id',v_counterparty,'account_code',r.account_code));
  return jsonb_build_object('entry_id',p_entry,'status','posted','rule_id',r.id,'run_id',v_run);
end $$;

alter function clara.execute_rule_post(uuid,text) owner to clara_fn_owner;

-- ---------------------------------------------------------------------------
-- §TAIL — in-transaction assertions. The apply proves them or rolls back whole.
-- ---------------------------------------------------------------------------
do $tail$
declare
  v_acl text; v_cfg text; v_sig text; v_src text; v_role text; v_norm text;
  v_new_fns text[] := array[
    'clara.request_reextraction(uuid,text,text)',
    'clara.set_firm_high_stakes_threshold(bigint,text)'];
begin
  -- (1) Both new verbs exist at their EXACT signatures and carry the whole definer
  -- posture: pinned search_path, SECURITY DEFINER, owned by clara_fn_owner, no PUBLIC
  -- EXECUTE, no machine-role EXECUTE, absent from every wake allowlist. (The 0021 tail
  -- learned the ownership assertion the hard way: it checked everything BUT the owner and
  -- would have certified a verb that lends the wrong authority.)
  foreach v_sig in array v_new_fns loop
    if to_regprocedure(v_sig) is null then
      raise exception '0022 tail: % is absent at its exact signature', v_sig;
    end if;

    select coalesce(array_to_string(p.proconfig, ','), '') into v_cfg
      from pg_proc p where p.oid = v_sig::regprocedure;
    if replace(v_cfg, ' ', '') not like '%search_path=clara,pg_temp%' then
      raise exception '0022 tail: % has no pinned search_path (%)', v_sig, v_cfg;
    end if;

    if not (select prosecdef from pg_proc where oid = v_sig::regprocedure) then
      raise exception '0022 tail: % is not SECURITY DEFINER', v_sig;
    end if;

    if (select pg_get_userbyid(proowner) from pg_proc where oid = v_sig::regprocedure)
       <> 'clara_fn_owner' then
      raise exception '0022 tail: % is not owned by clara_fn_owner', v_sig;
    end if;

    -- HUMAN-INVOKED ONLY, structurally, asserted as a WHITELIST (adversarial round 2 —
    -- MAJOR). The earlier version blacklisted PUBLIC plus four group roles, which certifies
    -- nothing: a direct grant to `clara_runtime_login`, `clara_agent_read_login`,
    -- `clara_wake_write_login` or any role invented later passes a blacklist while the
    -- notice below still says "clara_authenticated only". A closed set has to be closed.
    -- Only the owner (which holds EXECUTE implicitly as the definer's owner) and
    -- clara_authenticated may appear; anything else is NAMED in the failure.
    select coalesce(string_agg(g, ', ' order by g), '') into v_acl
      from (select case when a.grantee = 0 then 'PUBLIC'
                        else pg_get_userbyid(a.grantee) end as g
              from pg_proc p, lateral aclexplode(p.proacl) a
             where p.oid = v_sig::regprocedure
               and a.privilege_type = 'EXECUTE'
               and (a.grantee = 0
                    or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_authenticated'))
           ) s;
    if v_acl <> '' then
      raise exception '0022 tail: % has unexpected EXECUTE grantee(s): % (only clara_fn_owner + clara_authenticated may hold it)',
        v_sig, v_acl;
    end if;

    -- …and the EFFECTIVE privilege, which is the question that actually matters: a role can
    -- reach a function through group membership without ever appearing in its ACL. This is
    -- the whole cost bound on request_reextraction (ADR-047 Q4 declined a numeric cap): if
    -- no machine lane can execute it, no sweep, workflow or wake can spend Azure pages in a
    -- loop. Roles are resolved through to_regrole and ABSENT ones are SKIPPED (the probe-9
    -- idiom) — the login shells do not exist on every database — but a role that IS present
    -- and holds the privilege fails. Never fail open on a missing role.
    foreach v_role in array array['clara_runtime', 'clara_agent_ro',
        'clara_wake_interactive', 'clara_wake_proactive',
        'clara_runtime_login', 'clara_agent_read_login', 'clara_wake_write_login'] loop
      if to_regrole(v_role) is null then continue; end if;
      if has_function_privilege(v_role, v_sig, 'execute') then
        raise exception '0022 tail: % holds EFFECTIVE EXECUTE on % — this verb is human-invoked only',
          v_role, v_sig;
      end if;
    end loop;
  end loop;

  if exists (select 1 from clara.wake_fn_allowlist
              where function_name in ('request_reextraction','set_firm_high_stakes_threshold')) then
    raise exception '0022 tail: a new verb leaked into the wake allowlist';
  end if;

  -- (2) X4 — the dark guard is PRESENT and the anchor skip is still named. A future edit
  -- that drops the guard without also being the X5 micro-migration fails here at apply.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.execute_rule_post(uuid,text)'::regprocedure;
  -- Assert the FUNCTIONAL SHAPE, not the comment (adversarial round 1 — NOTE). Checking
  -- only for the words 'X4 DARK GUARD' would pass an edit that flipped `if true` to
  -- `if false` and left the comment sitting above it — i.e. it would certify a lane that
  -- had been silently opened. The literal below is the executable disjunct plus its marker,
  -- two spaces exactly as written, so the comment cannot vouch for the code.
  if position('if true  -- X4 DARK GUARD' in v_src) = 0 then
    raise exception '0022 tail: execute_rule_post has lost the X4 dark guard (the `if true` disjunct, not merely its comment)';
  end if;
  -- THE EXECUTOR'S CALLER SET, PINNED. The §0 quiesce guard and the §D staging argument both
  -- rest on one unstated premise: that stopping `clara-runtime` actually stops every caller
  -- of execute_rule_post. That is true today — the OBSERVED grantees are exactly
  -- clara_fn_owner (the definer's owner) and clara_runtime_login (the login-direct grant;
  -- note it is NOT the clara_runtime GROUP) — but nothing has been asserting it, so a future
  -- migration could grant the executor to another lane and silently invalidate the ceremony
  -- while every probe here still passed. Whitelist it, and name any offender.
  select coalesce(string_agg(g, ', ' order by g), '') into v_acl
    from (select case when a.grantee = 0 then 'PUBLIC'
                      else pg_get_userbyid(a.grantee) end as g
            from pg_proc p, lateral aclexplode(p.proacl) a
           where p.oid = 'clara.execute_rule_post(uuid,text)'::regprocedure
             and a.privilege_type = 'EXECUTE'
             and (a.grantee = 0
                  or pg_get_userbyid(a.grantee) not in ('clara_fn_owner', 'clara_runtime_login'))
         ) s;
  if v_acl <> '' then
    raise exception '0022 tail: execute_rule_post has unexpected EXECUTE grantee(s): % — the quiesce ceremony assumes clara-runtime is its ONLY caller; widening this set silently invalidates that argument',
      v_acl;
  end if;

  -- The D-P6 sentinel vocabulary 0016 pins (grep-asserted there, re-asserted here because
  -- this migration rewrites the whole body).
  if position('anchor_missing' in v_src)=0 or position('not_corroborated' in v_src)=0
     or position('cn_not_autopostable' in v_src)=0
     or position('purchase_sst_not_autopostable' in v_src)=0
     or position('polarity_unverified' in v_src)=0 or position('direction_unproven' in v_src)=0
     or position('customer_unresolved' in v_src)=0 or position('buyer_mismatch' in v_src)=0
     or position('evidence_class_mismatch' in v_src)=0 or position('floor_lost' in v_src)=0
     or position('suspended_pending_resignature' in v_src)=0
     or position('v_outside_legs' in v_src)=0
     or position('pg_exception_detail' in lower(v_src))=0 then
    raise exception '0022 tail: execute_rule_post lost a named skip / retained 0016 gate';
  end if;

  -- (3) X3 — the three component paths reached BOTH monetary guards and the allowlist in
  -- persist_invoice_facts, and the sales floor reads all three. A component admitted to the
  -- allowlist but missing from a guard is the silent-zero defect this asserts against.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.persist_invoice_facts(uuid,jsonb,text,text,int,jsonb)'::regprocedure;
  -- The floor is the EXACT live count, not a comfortable margin (adversarial round 1 —
  -- NOTE). Each of the three paths appears in SIX code positions: the allowlist, the
  -- normalize-to-cents set, the monetary_raw set, the conflicting-duplicate forfeit, the
  -- present-but-unparseable refusal, and the non-negative guard. A floor of four passed
  -- while two of those six could go missing — including the one that stops a negative
  -- discount forging the identity. Six means removing ANY single enumeration fails the
  -- apply. If a future change adds a seventh mention, raise this number with it.
  if (length(v_src) - length(replace(v_src, 'invoice.service_charge', ''))) / length('invoice.service_charge') < 6
     or (length(v_src) - length(replace(v_src, 'invoice.discount', ''))) / length('invoice.discount') < 6
     or (length(v_src) - length(replace(v_src, 'invoice.delivery', ''))) / length('invoice.delivery') < 6 then
    raise exception '0022 tail: a component field_path is missing from one of persist_invoice_facts SIX guarded enumerations';
  end if;
  -- …and the negative-component guard specifically, by its own refusal text, so it cannot
  -- be the enumeration that silently disappears while the count is satisfied elsewhere.
  if position('must not be negative' in v_src) = 0 then
    raise exception '0022 tail: persist_invoice_facts lost the non-negative component guard';
  end if;
  -- STRONGER (adversarial round 2 — NOTE): the guard's LOAD-BEARING EXPRESSION, as one
  -- whitespace-normalised literal. Counting occurrences and grepping a refusal string can
  -- both be satisfied by text sitting in a COMMENT while the executable enumeration is
  -- gone; this cannot. The normalisation is the 0017 tail's own idiom, so the assertion
  -- survives reformatting but not deletion.
  v_norm := regexp_replace(v_src, '\s+', '', 'g');
  if position('r.field_pathin(''invoice.service_charge'',''invoice.discount'',''invoice.delivery'')andr.monetary_cents<0'
       in v_norm) = 0 then
    raise exception '0022 tail: the non-negative guard EXPRESSION is gone from persist_invoice_facts (a comment is not a control)';
  end if;
  if position('chr(1)' in v_src)=0 or position('monetary value is malformed' in v_src)=0
     or position('must state invoice.type_code' in v_src)=0
     or position('document_kind=coalesce(document_kind' in v_src)=0 then
    raise exception '0022 tail: persist_invoice_facts lost a retained 0015/0016 refusal';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_sales_invoice_shape_at(uuid,uuid)'::regprocedure;
  if position('invoice.service_charge' in v_src)=0 or position('invoice.discount' in v_src)=0
     or position('invoice.delivery' in v_src)=0
     or position('type_polarity_mismatch' in v_src)=0
     or position('sst_account_missing' in v_src)=0
     -- The sign BELT at the floor's read site: without it a negative component that
     -- arrived by any path other than persist_invoice_facts forges the identity.
     or position('coalesce(v_sc,0) < 0' in v_src)=0 then
    raise exception '0022 tail: _assert_sales_invoice_shape_at is missing a component read / sign belt / retained floor';
  end if;

  -- (4) THE SUPPLIER FLOOR AND THE STRUCTURED TIER ARE UNTOUCHED. Asserted positively so
  -- a future edit to this migration cannot quietly widen its blast radius: the supplier
  -- bill's exact sst tie and the XML corroboration identity must still be exactly where
  -- 0016 left them.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._assert_supplier_bill_shape_at(uuid,uuid)'::regprocedure;
  if position('admits no sst_output leg' in v_src)=0
     or position('sst_purchase_cost' in v_src)=0
     or position('no material amount in a rounding leg' in v_src)=0 then
    raise exception '0022 tail: the supplier-bill floor was disturbed';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure;
  if position('v_net + v_tax + coalesce(v_rounding, 0)' in v_src)=0
     or position('coalesce(v_conf, 0) >= 0.95' in v_src)=0 then
    raise exception '0022 tail: _invoice_fact_state_at was disturbed (corroboration is X5s, alone)';
  end if;

  raise notice '0022: request_reextraction + set_firm_high_stakes_threshold installed (clara_authenticated only); X3 sales tie corrected; X4 anchor dark guard armed';
end
$tail$;
