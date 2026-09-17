-- 0220_firm_knowledge_defaults — #654 (parent spec #612; wayfinder resolution #603 Q22; owner
-- ruling D8/D9, wave 2026-09-15; journeys C13 / B6 / D2): WHICH KNOWLEDGE MAY BECOME A FIRM-WIDE
-- DEFAULT, WHAT A FIRM DEFAULT MAY CITE, AND WHAT A CLIENT'S OWN EXCEPTION STILL MEANS AFTERWARDS.
-- =====================================================================================
-- Spec of record: #654 — "只有明确说应用于全 firm 且有权限的资料才成为通用默认；当前客户规则和隐私
-- 资料不会自动扩散". Domain words: CONTEXT.md — "Firm knowledge default", "Knowledge promotion",
-- "Client knowledge exception", "Knowledge pack". Builds on 0192 (the governed knowledge record),
-- 0007 (documents + document_filings) and 0178/0184 (the accounting-work lane this file only READS).
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. A fail-closed catalog of the keys a firm may default
-- (`clara.knowledge_key_firm_eligibility`), TWO BEFORE INSERT guards on `clara.knowledge_records`
-- that refuse an ineligible firm-scope key and a firm-scope record citing one client's evidence
-- (a filed document, or any accounting_work at all), a THIRD guard on `clara.document_filings`
-- that closes the same wall from the other side, and TWO viewer-floored reads — the firm register
-- and the per-client applicability answer — so a human can finally SEE a firm rule, the clients
-- that hold an exception to it, and which of the two governs the client in front of them.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO, each because something else already does it.
--
-- 1 · IT ADDS NO WRITE DOOR. `PRD:122` records #654's remainder verbatim: the server-side
--     promotion path and the client-exception rule are 「都已就绪」 and what is missing is
--     「界面或对话入口」. A promotion is therefore `clara.capture_knowledge(p_scope_kind => 'firm')`
--     — already admin+ by `clara._knowledge_floor` (0192:996-1008, citing #603 Q22) — and a
--     correction or withdrawal of a firm rule is the shipped `correct_knowledge` /
--     `withdraw_knowledge` at the same floor. A second door onto one act is a second floor to keep
--     in step.
--
-- 2 · IT RECUTS NOTHING. Not `_knowledge_capture_core`, not `_knowledge_floor`, not
--     `capture_knowledge`, not `list_client_knowledge`, not `get_knowledge_pack`. Three of those
--     sit in the FROZEN chat lane's call path (`packages/runtime/lib/knowledge.mjs` calls
--     `capture_knowledge_for`, which ends in `_knowledge_capture_core`; `chatTurn.v19.prompt.ts`
--     reads the pack field by field), and the file-hash lint cannot see that. So both walls are
--     TRIGGERS on the table rather than arms inside a body, and both reads are NEW functions —
--     the reason 0192 itself gives for minting `get_knowledge_pack` instead of splicing
--     `get_context_pack` (0192:1458-1462). Nothing here therefore owes a pre-image sha256 pin.
--
-- 3 · IT DOES NOT MAKE `knowledge_keys.scope_default` LOAD-BEARING, and the reason is measured:
--     `clara.knowledge_keys` is APPEND-ONLY on UPDATE (`t_knowledge_keys_append_only`,
--     0192:185-189), so the 13 rows already seeded can never be re-defaulted. A column that cannot
--     be changed cannot carry a decision taken after it was written. The eligibility catalog is a
--     SEPARATE relation for exactly that reason, and it is FAIL-CLOSED: a key is firm-defaultable
--     only if this table names it, or if the catalog types it a `preference` or a `policy`.
--
-- 4 · IT BUILDS NO RE-EVALUATION ENGINE. `docs/PRD.md:123` defers "re-evaluate only the affected
--     work" to #658/#663 with human review as the accepted interim, and `0192:106-112` says the
--     consumer cannot decide WHICH work is affected before #631's knowledge_version trace and
--     #658/#663's retrieval model exist. What ships instead is the human-review AFFORDANCE the
--     blueprint asks for: the firm register names the clients holding an exception and the LIVE
--     Work citing the key, so a person can review what changed rather than a job waking everything.
--
-- =====================================================================================
-- THE TWO WALLS, AND WHY EACH IS WRITTEN THE WAY IT IS.
--
-- A · ELIGIBILITY (owner ruling D8). Before this file an admin could capture ANY of the 13
--     catalogued keys at firm scope, `entity_type`, `msic`, `sst_regime` and
--     `financial_year_end_month` included — client-identity facts that are true of ONE business
--     and false of the rest. Made a firm default they would reach every client with no record of
--     its own, through `clara.list_client_knowledge` AND through the model's
--     `clara.get_knowledge_pack`. The seeded set is the three D8 named (`default_currency`,
--     `reporting_framework`, `accounting_basis`); the by-kind arm additionally admits every
--     `preference` and `policy` key, because a durable instruction and a decision about how the
--     books are prepared are the two kinds a FIRM can hold on its own behalf. On the 13-key
--     catalog as seeded that is four keys in total — the fourth being `coa_seed_decision`
--     (0192:258-261), a preference, admitted by the by-kind arm alone and INTENDED: "the firm
--     seeds the LHDN/MPERS chart unless a client asks otherwise" is exactly a firm default.
--
-- B · CROSS-CLIENT EVIDENCE. `clara._knowledge_source_pins` (0192:750-803) checks FIRM congruence
--     and nothing else — the document probe is `d.firm_id = p_firm` with no client conjunct
--     (0192:782-784). So a firm-wide rule could pin a document FILED AGAINST one client, and
--     `clara._knowledge_row_json` then emitted that pin, and the free-text `basis` beside it, into
--     every other client's register and model pack. Measured on a live rig before this file
--     applied: a firm-scope `sst_regime` record pinning a document with TWO live filings was
--     ACCEPTED, and a second client's runtime pack came back carrying that document id and the
--     first client's basis text verbatim.
--
--     THIS IS NOT AN RLS DISCLOSURE DEFECT and the wall does not pretend to be one:
--     `clara.documents`' human policy is already `firm_id = clara.jwt_firm()` (0003:514) and
--     `clara.document_filings`' the same, so nothing is revealed that RLS withheld. The harm is
--     CITATION CONTAMINATION — one client's evidence travelling as the stated basis of a rule
--     applied to every other client, first of all inside a model's context.
--
--     THE PREDICATE IS WRITTEN AGAINST N, NEVER ONE. `uq_document_filing_active` is over
--     `(document_id, client_id) where retired_at is null` (0007:92-94), so ONE document may hold
--     MANY live filings; the wall refuses on ANY live filing and the census below counts them all.
--     AN UNFILED FIRM DOCUMENT STAYS ADMISSIBLE, because 0192 reserves exactly that case in its
--     own voice at 0192:871-874 — "a knowledge source may legitimately be an unfiled firm
--     document". Retiring the last filing makes the document admissible again: the predicate is
--     the FILING's live state, not the document's history.
--
--     WHICH PINS THE WALL COVERS, AND WHY EXACTLY THESE TWO. `clara.knowledge_records` carries
--     five source pins (0192:415-419). Three of them — extraction, region, field path — cannot
--     exist without `source_document_id` (`ck_knowledge_records_extraction_pins` /
--     `_extraction_required` / `_region_needs_extraction` / `_field_needs_extraction`,
--     0192:461-470), so they are covered TRANSITIVELY by the document arm. That leaves exactly
--     ONE other client-bearing pin: `source_work_id`. `clara.accounting_work.client_id` is NOT
--     NULL (measured off information_schema on the rig), so EVERY Work belongs to exactly one
--     client and a firm-wide rule may cite NONE of them — a second arm, CLR10
--     `firm_scope_client_work`. Before it existed `clara._knowledge_source_pins` checked only
--     firm congruence for the Work (0192:799-802) and `clara._knowledge_row_json` emitted the
--     work id (0192:1022-1024) into every other client's pack.
--
--     AND THE WALL IS TWO-WAY, which the first cut of this file was not. Refusing the record at
--     INSERT is only half of the invariant: with the other half missing, FILING a document to a
--     client AFTER a firm rule cited it produced exactly the contamination this file exists to
--     prevent, and the INSERT wall then refused the retraction too (a withdrawal carries the
--     predecessor's pins verbatim, 0192:1294-1298), so the contaminated rule could never be
--     withdrawn. §B.3 closes the filing direction (CLR10 `document_cited_by_firm_default`, on
--     `clara.document_filings`) and §B.2 admits a correction or withdrawal that introduces NO
--     new pin, so a rule that reached this state on a database predating this file can always
--     be retracted. The INVARIANT, stated once: no LIVE firm-scope knowledge record may cite a
--     document carrying a live client filing, or any accounting_work at all.
--
--     AND IT HOLDS UNDER CONCURRENCY, which two BEFORE-row triggers reading each other's table
--     do NOT give for free. Each half reads the OTHER relation, and under READ COMMITTED neither
--     sees the other transaction's uncommitted row, so two transactions in flight — this capture
--     and `clara.file_document` naming the same document — could both commit and reach exactly
--     the state §0(8) refuses to apply against. Measured on the rig before the fix, in all four
--     arrival orders: THREE of the four left one live firm-scope record citing a live client
--     filing, and the fourth was safe only incidentally, because `_file_document_write` takes
--     `clara.documents ... for update` and the capture's own FK check takes FOR KEY SHARE on the
--     same row. Both halves therefore take ONE advisory transaction lock keyed on the document
--     (`clara.firm_knowledge_evidence:<document_id>`) before they read, and the knowledge half
--     takes the documents row lock FIRST so both lanes acquire in the same order. The wall is
--     now serialised by a lock this file owns, not by another body's row lock; the cell that
--     proves it in all four orders is `p654.evidence.race_capture_vs_filing`.
--
-- C · WHY TRIGGERS, AND WHY THESE NAMES. PostgreSQL fires same-event BEFORE triggers in NAME
--     order, so `t_knowledge_records_firm_eligibility` and `t_knowledge_records_firm_evidence`
--     both sort AFTER 0192's `t_knowledge_records_authority` — which is required, not incidental:
--     that trigger stamps `applies_when_digest` and refuses an unknown key or a mismatched kind,
--     and a wall that ran before it would be reasoning about a half-formed row. The tail asserts
--     the order off `pg_trigger` rather than trusting the alphabet.
--
--     THE THIRD TRIGGER SITS ON A DIFFERENT TABLE, `clara.document_filings`, for the same reason
--     and the reverse direction: a wall that only inspects the knowledge row at insert cannot see
--     a filing created afterwards. Its name sorts before 0007's own `t_document_filings_stamp`,
--     which is harmless — it reads `new.document_id` alone and stamps nothing.
--
--     A trigger also reaches every lane at once. `capture_knowledge` (human),
--     `capture_knowledge_for` (runtime, client-scope only today) and
--     `promote_plan_answers_to_knowledge` (both lanes) all end in `_knowledge_capture_core`, and a
--     guard on the TABLE cannot be bypassed by a fourth writer nobody has written yet. The source
--     pins are resolved by `_knowledge_source_pins` and passed into `_knowledge_insert_revision`
--     BEFORE the INSERT, so `new.source_document_id` is populated by the time these fire —
--     measured, not assumed (the battery's `p654.evidence.*` cells are the measurement).
--
-- D · THE TWO READS ARE `clara_authenticated`-ONLY. Nothing goes to `clara_agent_ro` or either
--     wake role: a `_human_ctx`-gated read granted to a role that carries no JWT is a DARK grant
--     (0057's ruling, restated 0192:1742-1745). Nothing goes to `clara_runtime` either — a run
--     already reads firm defaults through `clara.get_knowledge_pack`, which carries them, and a
--     second machine surface onto the same rows would be a second place to keep the shadow rule
--     in step. Neither read is a masked view; both are SECURITY DEFINER functions with
--     `search_path` and `plan_cache_mode` pinned, PUBLIC revoked.
--
-- E · CALENDAR DAYS. `effective_from`/`effective_to` are `date`, and "today" is resolved
--     SERVER-SIDE in `Asia/Kuala_Lumpur` (`(now() at time zone 'Asia/Kuala_Lumpur')::date`, the
--     0016:477 idiom) and returned as `as_of`, so the web form's default effective date is the
--     firm's legal date rather than whatever the browser's clock says.
--
-- F · LOCK ORDER. This file adds no door at all, and both reads are `stable` and lock nothing,
--     so the knowledge cohort stays OUTSIDE the
--     `accounting_plans -> accounting_work -> agent_tasks -> agent_interruptions` chain, exactly
--     as 0192 left it (its only `accounting_work` touch is an unlocked congruence probe,
--     0192:799-802; this file adds one more unlocked read, for the live-Work affordance).
--
--     THE EVIDENCE WALL DOES TAKE TWO LOCKS, both on the DOCUMENT and both only when a document
--     is actually in play, and they are stated here so the next reader inherits the order rather
--     than rediscovering it:
--       1. `clara.documents` FOR KEY SHARE on the pinned row — the same lock this statement's own
--          FK check (`fk_knowledge_records_source_document`) takes a moment later, so it is an
--          earlier acquisition of a lock the transaction already holds by the end, never a new
--          one. Taken ONLY by `_tf_knowledge_firm_evidence`; the filing lane already holds the
--          stronger FOR UPDATE on that row from `_file_document_write` before its own trigger
--          fires.
--       2. `pg_advisory_xact_lock(hashtextextended('clara.firm_knowledge_evidence:' || <document
--          id>, 0))` — taken by BOTH halves of the wall, released at commit or abort.
--     Every lane acquires (1) then (2), so the pair cannot deadlock against each other. Neither
--     lock is ever held across a wait on a third resource that the other lane holds. The advisory
--     key is per-document, so it serialises only transactions naming the SAME document; a
--     transaction filing N documents at once accumulates N transaction-scoped advisory entries,
--     which is the one cost worth knowing about (`max_locks_per_transaction`).
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Fail closed: this file reasons about a schema where 0192's whole cohort is
-- applied and UNMOVED, where no firm-default surface exists yet, and — this is the one that can
-- actually be false on a real database — where no EXISTING firm-scope record would be refused by
-- either wall. A migration that walled the future while grandfathering a live violator would be
-- a rule nobody could state.
-- =====================================================================================
do $w654_pre$
declare v_n int; v_def text;
begin
  -- (1) 0192's four relations, by name.
  foreach v_def in array array['knowledge_keys','knowledge_records','knowledge_plan_item_map','knowledge_versions'] loop
    if to_regclass('clara.' || v_def) is null then
      raise exception '#654 prestate: clara.% is absent -- 0192 must apply first', v_def
        using errcode='CLR10';
    end if;
  end loop;

  -- (2) NOTHING OF THIS FILE EXISTS YET. Append-only means not re-runnable.
  if to_regclass('clara.knowledge_key_firm_eligibility') is not null then
    raise exception '#654 prestate: clara.knowledge_key_firm_eligibility already exists -- 0220 is append-only and is not re-runnable'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_firm_knowledge()') is not null
     or to_regprocedure('clara.get_knowledge_applicability(uuid,text)') is not null then
    raise exception '#654 prestate: a firm-knowledge read already exists' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.knowledge_records'::regclass and not tgisinternal
     and tgname in ('t_knowledge_records_firm_eligibility','t_knowledge_records_firm_evidence');
  if v_n <> 0 then
    raise exception '#654 prestate: a firm-scope guard trigger already exists on clara.knowledge_records'
      using errcode='CLR10';
  end if;
  if exists (select 1 from pg_trigger
              where tgrelid = 'clara.document_filings'::regclass and not tgisinternal
                and tgname = 't_document_filings_firm_knowledge') then
    raise exception '#654 prestate: the filing-side half of the evidence wall already exists on clara.document_filings'
      using errcode='CLR10';
  end if;

  -- (3) THE CATALOG IS THE 13 SEEDED KEYS, and the three D8 named are among them. Measured rather
  -- than assumed: a catalog another lane had already widened would make §A's seed silently
  -- describe a different admitted set than this file's header states.
  select count(*)::int into v_n from clara.knowledge_keys;
  if v_n <> 13 then
    raise exception '#654 prestate: clara.knowledge_keys carries % keys, not the 13 that 0192 seeds -- re-measure the admitted set before applying', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.knowledge_keys
   where knowledge_key in ('default_currency','reporting_framework','accounting_basis');
  if v_n <> 3 then
    raise exception '#654 prestate: one of the three D8 seed keys is absent from clara.knowledge_keys'
      using errcode='CLR10';
  end if;

  -- (4) THE UNIQUE THAT MAKES A CLIENT EXCEPTION A FIRST-CLASS FACT is present AND partial on
  -- `state = 'live'`. Without the partial predicate a superseded revision would occupy the slot
  -- and the whole exception model would be a different thing.
  select pg_get_indexdef(i.indexrelid) into v_def
    from pg_index i join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'uq_knowledge_live';
  if v_def is null or position('WHERE (state = ''live''::text)' in v_def) = 0
     or position('applies_when_digest' in v_def) = 0 then
    raise exception '#654 prestate: uq_knowledge_live is absent, not partial on state=''live'', or no longer keyed by applicability (%)', coalesce(v_def,'(absent)')
      using errcode='CLR10';
  end if;

  -- (5) 0192'S OWN BEFORE INSERT TRIGGER IS PRESENT. The two guards below sort after it by name
  -- and DEPEND on it having stamped `applies_when_digest` and refused an unknown key first.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'clara.knowledge_records'::regclass and not tgisinternal
                    and tgname = 't_knowledge_records_authority') then
    raise exception '#654 prestate: 0192''s t_knowledge_records_authority is absent -- the guards below would run on a half-formed row'
      using errcode='CLR10';
  end if;

  -- (6) THE FOUR 0192 SIGNATURES THIS FILE READS AROUND, at their exact arities. This file recuts
  -- none of them; the probe exists so a drifted signature is a refusal here rather than a
  -- surprise inside a read.
  foreach v_def in array array[
      'clara.list_client_knowledge(uuid)',
      'clara.get_knowledge_pack(uuid,text,uuid)',
      'clara.capture_knowledge_for(uuid,uuid,text,jsonb,text,text,text,jsonb,date,date,jsonb,text)',
      'clara._knowledge_source_pins(uuid,text,jsonb)'] loop
    if to_regprocedure(v_def) is null then
      raise exception '#654 prestate: % does not resolve -- 0192 has DRIFTED from the body this file was written against', v_def
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_def in array array['clara._knowledge_row_json','clara._knowledge_floor','clara._knowledge_capture_core'] loop
    if to_regproc(v_def) is null then
      raise exception '#654 prestate: % does not resolve', v_def using errcode='CLR10';
    end if;
  end loop;

  -- (7) THE FILING RELATION AND ITS ACTIVE UNIQUE — the shape the evidence wall is written
  -- against. `(document_id, client_id) where retired_at is null` is why one document may hold N
  -- live filings and why the wall counts rather than probes for one.
  if to_regclass('clara.document_filings') is null then
    raise exception '#654 prestate: clara.document_filings is absent -- 0007 must apply first'
      using errcode='CLR10';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_def
    from pg_index i join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relname = 'uq_document_filing_active';
  if v_def is null or position('(document_id, client_id)' in v_def) = 0
     or position('WHERE (retired_at IS NULL)' in v_def) = 0 then
    raise exception '#654 prestate: uq_document_filing_active is not the (document_id, client_id) WHERE retired_at IS NULL index the evidence wall is written against (%)', coalesce(v_def,'(absent)')
      using errcode='CLR10';
  end if;

  -- (8) NO LIVE VIOLATOR, EITHER WALL. Counted across N filings, not probed for one. `0192:114-116`
  -- records that firm-scope promotion has no caller at all, so the honest expectation is zero;
  -- this is the assertion that says so out loud instead of assuming it.
  -- The eligibility catalog does not exist yet, so the admitted set is expressed HERE the way §A
  -- will seed it: the three D8 keys by name, plus the by-kind arm.
  select count(*)::int into v_n
    from clara.knowledge_records r
    join clara.knowledge_keys k on k.knowledge_key = r.knowledge_key
   where r.scope_kind = 'firm'
     and k.kind not in ('preference','policy')
     and r.knowledge_key not in ('default_currency','reporting_framework','accounting_basis');
  if v_n <> 0 then
    raise exception '#654 prestate: % existing firm-scope knowledge record(s) name a key the eligibility wall would refuse -- withdraw them before applying, or the rule is one nobody can state', v_n
      using errcode='CLR10';
  end if;
  -- THE CENSUS IS OVER *LIVE* ROWS, and that is the invariant itself rather than a relaxation of
  -- it: `clara.list_client_knowledge`, `clara.get_knowledge_pack` and `clara.list_firm_knowledge`
  -- reach a client only through a row that is still live, and §B's two guards enforce exactly
  -- that — a withdrawal or an unchanged-pin correction is admitted precisely so a rule that
  -- reached a walled state can be RETRACTED. History is therefore counted and REPORTED below, not
  -- refused: once a firm rule has been withdrawn, filing its document to a client is the remedy
  -- the refusal points at, and the superseded revisions that still name the document are the
  -- record of what happened, reaching nobody.
  select count(*)::int into v_n
    from clara.knowledge_records r
   where r.scope_kind = 'firm' and r.state = 'live' and r.source_document_id is not null
     and exists (select 1 from clara.document_filings f
                  where f.document_id = r.source_document_id and f.firm_id = r.firm_id
                    and f.retired_at is null);
  if v_n <> 0 then
    raise exception '#654 prestate: % LIVE firm-scope knowledge record(s) cite a document with at least one LIVE client filing -- the cross-client evidence wall cannot grandfather a violator', v_n
      using errcode='CLR10';
  end if;
  -- …and the SECOND client-bearing pin, on the same terms. `clara.accounting_work.client_id` is
  -- NOT NULL, so a firm-scope record naming ANY Work is naming one client's Work.
  select count(*)::int into v_n
    from clara.knowledge_records r
   where r.scope_kind = 'firm' and r.state = 'live' and r.source_work_id is not null;
  if v_n <> 0 then
    raise exception '#654 prestate: % LIVE firm-scope knowledge record(s) pin a client''s accounting_work -- the cross-client evidence wall cannot grandfather a violator', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from clara.knowledge_records r
   where r.scope_kind = 'firm' and r.state <> 'live'
     and (r.source_work_id is not null
          or (r.source_document_id is not null
              and exists (select 1 from clara.document_filings f
                           where f.document_id = r.source_document_id and f.firm_id = r.firm_id
                             and f.retired_at is null)));
  if v_n > 0 then
    raise notice '#654 prestate: % superseded/withdrawn firm-scope revision(s) still NAME a client-bearing source. Reported, not refused: they are history, they reach no client through any read, and refusing them would make a withdrawn rule''s document permanently unfileable.', v_n;
  end if;

  raise notice '#654 prestate: clean -- 0192''s four relations and its authority trigger are present, uq_knowledge_live is partial on state=''live'' and keyed by applicability, the catalog carries its 13 keys including the three D8 seeds, uq_document_filing_active is the (document_id, client_id) WHERE retired_at IS NULL index this file counts across, and NO LIVE firm-scope record cites a document with a live client filing or pins any client Work at all (superseded and withdrawn revisions are counted and reported, never refused -- they reach no client).';
end
$w654_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — THE ELIGIBILITY CATALOG. CODE-POPULATED, append-only, exactly like
-- `clara.knowledge_keys` (0192:186-189) and `clara.client_fact_keys` (0055:346-368): which keys a
-- firm may default is PRODUCT VOCABULARY, and vocabulary changes ride migrations with review. No
-- runtime writer exists or is granted, and no application role holds DML.
--
-- `eligible_reason` is NOT decoration. The firm register renders it beside the rule, so a person
-- reading "the firm presents in ringgit" can also read WHY this key is one a firm may hold at all.
-- =====================================================================================
create table clara.knowledge_key_firm_eligibility (
  knowledge_key   text        primary key references clara.knowledge_keys(knowledge_key),
  eligible_reason text        not null check (btrim(eligible_reason) <> ''),
  added_at        timestamptz not null default now()
);

create trigger t_knowledge_key_firm_eligibility_append_only before update or delete
  on clara.knowledge_key_firm_eligibility for each row execute function clara._tf_append_only();
create trigger t_knowledge_key_firm_eligibility_no_truncate before truncate
  on clara.knowledge_key_firm_eligibility for each statement execute function clara._tf_no_truncate();

alter table clara.knowledge_key_firm_eligibility enable row level security;
alter table clara.knowledge_key_firm_eligibility force row level security;
create policy p_knowledge_key_firm_eligibility_owner on clara.knowledge_key_firm_eligibility
  for all to clara_fn_owner using (true) with check (true);
-- A GLOBAL catalog (no firm dimension — product vocabulary, not tenant data), so the read policy
-- is unconditional. Unlike `clara.knowledge_keys` it is NOT offered to clara_agent_ro or
-- clara_runtime: neither renders the firm register, and a role that carries no JWT has nothing to
-- do with which keys a HUMAN may promote.
create policy p_knowledge_key_firm_eligibility_read on clara.knowledge_key_firm_eligibility
  for select to clara_authenticated using (true);
grant select on clara.knowledge_key_firm_eligibility to clara_authenticated;

comment on table clara.knowledge_key_firm_eligibility is
  '#654 (owner ruling D8): the knowledge keys a firm may hold as a FIRM-WIDE default. Fail-closed '
  'and append-only: a key is firm-defaultable only if it is named here, or if clara.knowledge_keys '
  'types it a preference or a policy. Enforced by clara._tf_knowledge_firm_eligibility, a BEFORE '
  'INSERT trigger on clara.knowledge_records. A client-identity fact (entity_type, msic, sst_regime, '
  'financial_year_end_month, the carried legacy assertion keys) is never a firm default.';

insert into clara.knowledge_key_firm_eligibility (knowledge_key, eligible_reason) values
  ('default_currency',
   'The presentation currency the firm uses unless a client says otherwise. A statement about the '
   'FIRM''S practice, not about any one business, so a client that invoices in another currency '
   'holds an exception rather than contradicting a fact about itself.'),
  ('reporting_framework',
   'The reporting framework the firm prepares accounts on unless a client''s own framework says '
   'otherwise. A POLICY key (authority-bearing): only an asserted source may fill it, at either '
   'scope.'),
  ('accounting_basis',
   'The basis the firm prepares accounts on unless a client''s own basis says otherwise. A POLICY '
   'key (authority-bearing), for the same reason as reporting_framework.');

-- =====================================================================================
-- §B — THE TWO GUARDS. Both fire ONLY for `new.scope_kind = 'firm'`; the client lane is
-- byte-unaffected, which is the point of putting them here rather than inside a shared body.
-- =====================================================================================

-- B.1 — ELIGIBILITY (D8). Fail-closed on every branch: an absent catalog row, a NULL kind and an
-- unknown key all fall through to the refusal rather than past it.
create function clara._tf_knowledge_firm_eligibility() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_kind text; v_listed boolean;
begin
  if new.scope_kind is distinct from 'firm' then return new; end if;
  -- The CATALOG's kind, not `new.kind`: 0192's t_knowledge_records_authority has already refused a
  -- row whose kind disagrees with the catalog (0192:583-586), and reading the catalog here means
  -- this wall cannot be talked out of its answer by the column beside it.
  select k.kind into v_kind from clara.knowledge_keys k where k.knowledge_key = new.knowledge_key;
  select exists (select 1 from clara.knowledge_key_firm_eligibility e
                  where e.knowledge_key = new.knowledge_key) into v_listed;
  if coalesce(v_listed, false) or coalesce(v_kind, '') in ('preference','policy') then
    return new;
  end if;
  raise exception 'knowledge key % is a client-level % and cannot become a firm-wide default; record it on the client instead',
    new.knowledge_key, coalesce(v_kind, 'fact')
    using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'knowledge_scope_not_firm_defaultable',
        'knowledge_key', new.knowledge_key, 'kind', v_kind)::text;
end $$;
revoke all on function clara._tf_knowledge_firm_eligibility() from public;

-- B.2 — CROSS-CLIENT EVIDENCE, on BOTH client-bearing pins. Counted across N live filings (the
-- `uq_document_filing_active` shape, 0007:92-94), refused on ANY of them, and silent about an
-- UNFILED firm document — the case 0192 reserves in its own voice at 0192:871-874.
create function clara._tf_knowledge_firm_evidence() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_n int; v_client uuid; p clara.knowledge_records;
begin
  if new.scope_kind is distinct from 'firm' then return new; end if;

  -- THE RETRACTION HATCH, FIRST, and it is narrow by construction. A withdrawal carries the
  -- predecessor's pins VERBATIM (0192:1294-1298) and a correction that names no new source does
  -- the same (0192:1252-1256), so without this arm a rule that reached a walled state could never
  -- be corrected or withdrawn — the wall would refuse the only act that removes the harm. The
  -- skip therefore applies ONLY to a revision that introduces NO new pin: a correction that
  -- re-aims a firm rule onto a client's document or Work is still refused below.
  if new.revision_kind in ('correction','withdrawal') and new.supersedes_id is not null then
    select * into p from clara.knowledge_records where id = new.supersedes_id;
    if found
       and p.source_document_id is not distinct from new.source_document_id
       and p.source_work_id     is not distinct from new.source_work_id then
      return new;
    end if;
  end if;

  -- ARM 2 — THE WORK PIN. `clara.accounting_work.client_id` is NOT NULL, so every Work is one
  -- client's Work and a firm-wide rule may cite none of them. Fail-closed: a pin naming a row
  -- this read cannot resolve is refused too (the FK would refuse it a moment later anyway).
  if new.source_work_id is not null then
    select w.client_id into v_client from clara.accounting_work w where w.id = new.source_work_id;
    raise exception 'that Work belongs to one client; a firm-wide default may not cite it -- record the rule on that client, or cite the firm''s own source'
      using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'firm_scope_client_work',
          'work_id', new.source_work_id, 'client_id', v_client)::text;
  end if;

  -- ARM 1 — THE DOCUMENT PIN (and, transitively, the extraction/region/field pins that cannot
  -- exist without it — 0192:461-470).
  if new.source_document_id is null then return new; end if;

  -- SERIALISE AGAINST THE FILING LANE BEFORE READING IT. Both halves of this wall are BEFORE-row
  -- triggers that read the OTHER table, and under READ COMMITTED neither sees the other's
  -- uncommitted row — so without these two lines two CONCURRENT transactions (this capture, and
  -- clara.file_document naming the same document) both commit and leave exactly the state §0(8)
  -- refuses to apply against. MEASURED, not reasoned: on the rig, three of the four arrival
  -- orders left one live firm-scope record citing a live client filing.
  --
  -- THE ORDER OF THE TWO LOCKS IS THE POINT. `clara._file_document_write` takes
  -- `select firm_id from clara.documents where id = p_document for update` BEFORE it inserts the
  -- filing (measured off pg_proc), so the filing lane's order is: documents row, then this
  -- advisory key. Taking them in the SAME order here makes the pair deadlock-free by
  -- construction rather than by luck; FOR KEY SHARE is both the weakest mode that conflicts with
  -- the filing lane's FOR UPDATE and EXACTLY the lock this statement's own FK check
  -- (fk_knowledge_records_source_document) takes microseconds later anyway, so the transaction
  -- acquires no lock it was not already going to hold.
  --
  -- AND THE ADVISORY KEY IS WHY THE ROW LOCK IS NOT ENOUGH. The row lock only serialises because
  -- ANOTHER migration's body happens to take FOR UPDATE; an invariant that rests on a body this
  -- file does not own is one nobody can state. The advisory key is taken by BOTH halves of THIS
  -- wall, so the serialisation survives a filing writer that never touches the document row at
  -- all (the raw-INSERT arms of p654.evidence.race_capture_vs_filing are that proof). It is
  -- transaction-scoped, so it is released at commit or abort with no cleanup path to get wrong,
  -- and it is keyed on the DOCUMENT, so two transactions naming different documents never meet.
  perform 1 from clara.documents d where d.id = new.source_document_id for key share;
  perform pg_advisory_xact_lock(
    hashtextextended('clara.firm_knowledge_evidence:' || new.source_document_id::text, 0));

  select count(*)::int into v_n
    from clara.document_filings f
   where f.document_id = new.source_document_id
     and f.firm_id = new.firm_id
     and f.retired_at is null;
  if coalesce(v_n, 0) = 0 then return new; end if;
  raise exception 'that document is filed against % client(s); a firm-wide default may not cite one client''s evidence -- cite an unfiled firm document, or record the rule on the client it belongs to',
    v_n
    using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'firm_scope_client_evidence',
        'document_id', new.source_document_id, 'live_filings', v_n)::text;
end $$;
revoke all on function clara._tf_knowledge_firm_evidence() from public;

-- THE NAMES ARE THE ORDER. Postgres fires same-event BEFORE triggers alphabetically, so
-- `authority` < `firm_eligibility` < `firm_evidence`: 0192's stamp runs first, then D8's wall,
-- then the evidence wall. §E asserts the order off pg_trigger rather than off the alphabet.
create trigger t_knowledge_records_firm_eligibility before insert on clara.knowledge_records
  for each row execute function clara._tf_knowledge_firm_eligibility();
create trigger t_knowledge_records_firm_evidence before insert on clara.knowledge_records
  for each row execute function clara._tf_knowledge_firm_evidence();

-- B.3 — THE SAME WALL, FROM THE OTHER SIDE. Refusing the RECORD at insert is half an invariant:
-- a document cited by a live firm rule could still be FILED to a client afterwards, and then one
-- client's document id and basis text travelled into every other client's register and model pack
-- exactly as if the wall had never existed — measured on a from-scratch chain before this arm was
-- added. This trigger closes the direction, and the refusal names the remedy (withdraw the firm
-- rule first) rather than leaving a human to guess at it.
--
-- WHY `state = 'live'` AND NOT EVERY REVISION. A superseded or withdrawn revision reaches no
-- client: both reads and the runtime pack emit live rows. Blocking a filing on a rule somebody
-- already withdrew would make a document permanently unfileable because of a rule that no longer
-- exists — a wall nobody could state.
--
-- THE UPDATE ARM IS A BELT, NOT THE BUCKLE, and that is measured: 0007's own
-- `clara._tf_document_filing_update` (0007:525-539) admits exactly one transition,
-- active -> retired with actor and reason, and raises CLR17 on anything else — so UN-retiring a
-- filing is already impossible. The arm below is scoped to precisely that (impossible) transition
-- so that a normal retirement, and every other update, reaches 0007's trigger with its own error
-- unchanged.
create function clara._tf_document_filing_firm_knowledge() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record;
begin
  if tg_op = 'INSERT' and new.retired_at is not null then return new; end if;
  if tg_op = 'UPDATE' and not (old.retired_at is not null and new.retired_at is null) then
    return new;
  end if;

  -- THE SAME ADVISORY KEY THE OTHER HALF TAKES, and taken here for the same reason: a firm-scope
  -- knowledge INSERT committing between this read and this transaction's commit would leave the
  -- contamination in place with both guards installed. `_file_document_write` has already taken
  -- `clara.documents ... for update` for this document by the time this trigger fires, so the
  -- acquisition order on this side is documents row -> advisory key, which is the order
  -- clara._tf_knowledge_firm_evidence deliberately copies.
  perform pg_advisory_xact_lock(
    hashtextextended('clara.firm_knowledge_evidence:' || new.document_id::text, 0));

  select k.record_id, k.knowledge_key into r
    from clara.knowledge_records k
   where k.scope_kind = 'firm' and k.state = 'live'
     and k.source_document_id = new.document_id
   order by k.recorded_at
   limit 1;
  if not found then return new; end if;
  raise exception 'this document is cited by the firm-wide rule for %; filing it to a client would carry that client''s evidence into every other client -- withdraw or re-source the firm rule first',
    r.knowledge_key
    using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'document_cited_by_firm_default',
        'document_id', new.document_id, 'record_id', r.record_id,
        'knowledge_key', r.knowledge_key)::text;
end $$;
revoke all on function clara._tf_document_filing_firm_knowledge() from public;

create trigger t_document_filings_firm_knowledge before insert or update on clara.document_filings
  for each row execute function clara._tf_document_filing_firm_knowledge();

-- =====================================================================================
-- §C — THE TWO READS. Both VIEWER-floored, the floor `clara.list_client_knowledge` already takes
-- (0192:1316): a firm default is the firm's own standing rule, and hiding it from a viewer would
-- grant and revoke nothing while removing a destination that genuinely is theirs. The WRITE floor
-- is `clara._knowledge_floor`'s, rechecked by the door on every act.
-- =====================================================================================

-- C.1 — clara.list_firm_knowledge — THE FIRM REGISTER (/settings/knowledge).
--
-- Three things per rule, and each answers a question the client register could not:
--   · WHOSE ACT IT WAS. `authority` names the promoter, the authored reason the act recorded, the
--     authority the door VERIFIED at the time (`clara._knowledge_floor(key,'firm')` — what the act
--     required, which is the durable half), and the promoter's CURRENT membership role and active
--     state, labelled as current. The promoter's role AT THE INSTANT is not reconstructible today:
--     `clara.firm_memberships` carries no history (id, firm_id, user_id, role, status, created_at,
--     removed_at — measured), so this read states what it can prove and never invents the rest.
--   · WHO OVERRIDES IT. `exception_count` / `exceptions` are the live CLIENT rows at the same key
--     AND the same applicability digest — the exact pair `list_client_knowledge`'s shadow uses
--     (0192:1355-1363), so the register cannot claim an override the register does not perform.
--   · WHAT IS STILL RUNNING ON IT. `live_work` is the non-terminal `clara.accounting_work` rows
--     cited by any LIVE record of this key in this firm. That is `PRD:123`'s accepted interim
--     ("目前需要人工复核受影响的经验") made usable, and it is DERIVED — nothing in the estate stamps
--     a Work with the knowledge it reasoned under yet, so the only honest link is the
--     `source_work_id` pin a record carries. The claraWork_v4 contract is what closes that.
create function clara.list_firm_knowledge() returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; v_rows jsonb; v_version bigint; v_today date;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  -- THE WATERMARK SPANS EVERY FIRM-SCOPE REVISION, not the rows this read emits — a withdrawal
  -- appends a revision and removes a live row, so a max over the emitted set would move the number
  -- BACKWARDS across the one event most likely to matter (`list_client_knowledge`'s own reason,
  -- 0192:1332-1338, applied to this register's scope).
  select coalesce(max(r.knowledge_version), 0) into v_version
    from clara.knowledge_records r
   where r.firm_id = c.firm and r.scope_kind = 'firm';
  select coalesce(jsonb_agg(j order by knowledge_key, recorded_at desc), '[]'::jsonb)
    into v_rows
    from (
      select clara._knowledge_row_json(r)
          || jsonb_build_object(
               'asserted_by_name', u.display_name,
               'key_description', kk.description,
               'value_shape', kk.value_shape,
               'validated_against', kk.validated_against,
               'authority_bearing', kk.authority_bearing,
               'firm_defaultable_reason', e.eligible_reason,
               'in_effect_today', (r.state = 'live'
                 and (r.effective_from is null or r.effective_from <= v_today)
                 and (r.effective_to is null or r.effective_to >= v_today)),
               'authority', jsonb_build_object(
                 'promoter', r.asserted_by,
                 'promoter_name', u.display_name,
                 'recorded_via', r.recorded_via,
                 'recorded_at', r.recorded_at,
                 'reason', r.basis,
                 'required_role', clara._knowledge_floor(r.knowledge_key, 'firm'),
                 'promoter_role_now', (select m.role from clara.firm_memberships m
                                        where m.firm_id = r.firm_id and m.user_id = r.asserted_by
                                        order by (m.status = 'active') desc, m.created_at desc
                                        limit 1),
                 'promoter_active', exists (select 1 from clara.firm_memberships m
                                             where m.firm_id = r.firm_id and m.user_id = r.asserted_by
                                               and m.status = 'active')),
               'exception_count', (
                 select count(*)::int from clara.knowledge_records o
                  where o.firm_id = c.firm and o.scope_kind = 'client' and o.state = 'live'
                    and o.knowledge_key = r.knowledge_key
                    and o.applies_when_digest = r.applies_when_digest),
               'exceptions', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'client_id', o.client_id, 'client_name', cl.name,
                          'record_id', o.record_id, 'value', o.value,
                          'recorded_at', o.recorded_at) order by cl.name, o.recorded_at desc), '[]'::jsonb)
                   from clara.knowledge_records o
                   join clara.clients cl on cl.id = o.client_id
                  where o.firm_id = c.firm and o.scope_kind = 'client' and o.state = 'live'
                    and o.knowledge_key = r.knowledge_key
                    and o.applies_when_digest = r.applies_when_digest),
               'live_work', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'work_id', w.id, 'client_id', w.client_id, 'purpose', w.purpose,
                          'status', w.status) order by w.created_at desc), '[]'::jsonb)
                   from clara.accounting_work w
                  where w.firm_id = c.firm
                    -- The TERMINAL set 0184 itself enumerates (0184:1284); anything else is a Work
                    -- somebody may still be waiting on.
                    and w.status not in ('completed','refused','failed','cancelled','expired')
                    and exists (select 1 from clara.knowledge_records o
                                 where o.firm_id = c.firm and o.state = 'live'
                                   and o.knowledge_key = r.knowledge_key
                                   and o.source_work_id = w.id))
             ) as j,
             r.knowledge_key as knowledge_key, r.recorded_at as recorded_at
        from clara.knowledge_records r
        left join clara.users u on u.id = r.asserted_by
        left join clara.knowledge_keys kk on kk.knowledge_key = r.knowledge_key
        left join clara.knowledge_key_firm_eligibility e on e.knowledge_key = r.knowledge_key
       where r.firm_id = c.firm and r.scope_kind = 'firm' and r.superseded_at is null
    ) k;
  return jsonb_build_object('firm_id', c.firm, 'as_of', v_today,
    'knowledge_version', coalesce(v_version, 0)::text, 'records', v_rows);
end $read$;
revoke all on function clara.list_firm_knowledge() from public;
comment on function clara.list_firm_knowledge() is
  '#654: this firm''s FIRM-SCOPE knowledge rules (live and withdrawn current revisions), each with '
  'the authority the promotion recorded, the live client exceptions at the same key and '
  'applicability, and the non-terminal Work citing the key. Viewer+, session-firm scoped, '
  'clara_authenticated only.';

-- C.2 — clara.get_knowledge_applicability — WHICH ROW GOVERNS THIS CLIENT, AND WHY.
--
-- The C13 register cannot show a firm-vs-exception pair on its own: `list_client_knowledge`
-- FILTERS the shadowed firm row out in SQL (0192:1355-1363), so the client sees its own value and
-- no statement that a firm default exists and is overridden. This read is the missing half, and it
-- is a NEW function precisely so neither shipped read moves.
--
-- IT ANSWERS PER APPLICABILITY, NEVER PER KEY, because `uq_knowledge_live` already treats two live
-- rows of one key as INDEPENDENT facts whenever their `applies_when_digest` differs (0192:512-514).
-- A client row scoped to one narrow condition overrides the firm row carrying THAT condition and
-- nothing else, so the answer is one entry per digest — with `in_force` and a machine-readable
-- `reason` the surface renders as words, never a winner picked by the UI.
create function clara.get_knowledge_applicability(p_client uuid, p_knowledge_key text) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $read$
declare c record; k record; v_today date; v_rows jsonb; v_version bigint; v_exc int; v_own int;
        v_work jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  -- ONE refusal for absent and foreign alike (the 0021 rule -- no existence oracle), the shape
  -- clara.list_client_knowledge uses at its own opening.
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client is not in your firm' using errcode = 'CLR11';
  end if;
  select * into k from clara.knowledge_keys kk where kk.knowledge_key = p_knowledge_key;
  if not found then
    raise exception 'unknown knowledge key %', p_knowledge_key using errcode = 'CLR10',
      detail = '{"reason":"knowledge_key_unknown"}';
  end if;
  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  select coalesce(max(r.knowledge_version), 0) into v_version
    from clara.knowledge_records r
   where r.firm_id = c.firm and (r.scope_kind = 'firm' or r.client_id = p_client);

  select coalesce(jsonb_agg(j order by digest), '[]'::jsonb) into v_rows
    from (
      select d.digest as digest,
             jsonb_build_object(
               'applies_when', coalesce(cr.applies_when, fr.applies_when),
               'applies_when_digest', d.digest,
               'firm_rule', case when fr.id is null then null
                 else clara._knowledge_row_json(fr)
                      || jsonb_build_object('asserted_by_name', fu.display_name) end,
               'client_exception', case when cr.id is null then null
                 else clara._knowledge_row_json(cr)
                      || jsonb_build_object('asserted_by_name', cu.display_name) end,
               'in_force', case when cr.id is not null then 'client_exception'
                                when fr.id is not null then 'firm_default'
                                else 'none' end,
               -- FOUR DISTINCT ANSWERS, because "the client overrides a firm rule" and "only the
               -- client has ever said anything" are different facts and the surface must not
               -- render them with one sentence.
               'reason', case
                 when cr.id is not null and fr.id is not null then 'client_exception_shadows_firm_default'
                 when cr.id is not null then 'client_record_only'
                 when fr.id is not null then 'firm_default_applies'
                 else 'no_live_record' end,
               'in_effect_today', case when coalesce(cr.id, fr.id) is null then null else (
                 coalesce(cr.effective_from, fr.effective_from) is null
                   or coalesce(cr.effective_from, fr.effective_from) <= v_today)
                 and (coalesce(cr.effective_to, fr.effective_to) is null
                   or coalesce(cr.effective_to, fr.effective_to) >= v_today) end) as j
        from (select distinct x.applies_when_digest as digest
                from clara.knowledge_records x
               where x.firm_id = c.firm and x.state = 'live' and x.knowledge_key = p_knowledge_key
                 and (x.scope_kind = 'firm' or x.client_id = p_client)) d
        -- uq_knowledge_live makes both joins at most 1:1 (one live firm row per key+digest, one
        -- live client row per client+key+digest), so no aggregate is needed to keep them apart.
        left join clara.knowledge_records fr
               on fr.firm_id = c.firm and fr.state = 'live' and fr.scope_kind = 'firm'
              and fr.knowledge_key = p_knowledge_key and fr.applies_when_digest = d.digest
        left join clara.knowledge_records cr
               on cr.firm_id = c.firm and cr.state = 'live' and cr.scope_kind = 'client'
              and cr.client_id = p_client and cr.knowledge_key = p_knowledge_key
              and cr.applies_when_digest = d.digest
        left join clara.users fu on fu.id = fr.asserted_by
        left join clara.users cu on cu.id = cr.asserted_by
    ) a;

  -- HOW MANY CLIENTS HOLD AN EXCEPTION TO THIS KEY, firm-wide — the number the promote dialog
  -- shows before a human commits, and the one the firm register repeats per rule. Counted only
  -- where a firm rule of the same applicability actually exists: a client row with nothing to
  -- override is not an exception, it is simply that client's own record.
  select count(distinct o.client_id)::int into v_exc
    from clara.knowledge_records o
   where o.firm_id = c.firm and o.scope_kind = 'client' and o.state = 'live'
     and o.knowledge_key = p_knowledge_key
     and exists (select 1 from clara.knowledge_records f
                  where f.firm_id = c.firm and f.scope_kind = 'firm' and f.state = 'live'
                    and f.knowledge_key = o.knowledge_key
                    and f.applies_when_digest = o.applies_when_digest);

  -- AND THE NUMBER A PROMOTE DIALOG ACTUALLY NEEDS, which is a DIFFERENT number and was
  -- worth two fields rather than one overloaded name: how many clients already hold their
  -- OWN live record of this key, whether or not a firm rule exists yet. At the moment a
  -- human is deciding whether to promote, `exception_count` above is 0 by construction --
  -- there is no firm rule for anything to be an exception TO -- so the honest answer to
  -- "who keeps their own value if I do this?" is this count, and those are precisely the
  -- clients that become exceptions the instant the rule lands.
  select count(distinct o.client_id)::int into v_own
    from clara.knowledge_records o
   where o.firm_id = c.firm and o.scope_kind = 'client' and o.state = 'live'
     and o.knowledge_key = p_knowledge_key;

  select coalesce(jsonb_agg(jsonb_build_object(
           'work_id', w.id, 'client_id', w.client_id, 'purpose', w.purpose,
           'status', w.status) order by w.created_at desc), '[]'::jsonb) into v_work
    from clara.accounting_work w
   where w.firm_id = c.firm
     and w.status not in ('completed','refused','failed','cancelled','expired')
     and exists (select 1 from clara.knowledge_records o
                  where o.firm_id = c.firm and o.state = 'live'
                    and o.knowledge_key = p_knowledge_key
                    and o.source_work_id = w.id
                    and (o.scope_kind = 'firm' or o.client_id = p_client));

  return jsonb_build_object(
    'client_id', p_client, 'knowledge_key', p_knowledge_key,
    -- SERVER-SIDE, IN Asia/Kuala_Lumpur. The web form's default effective date comes from here,
    -- never from the browser's clock (0016:477's idiom; WORK-ORDER rule 8's calendar-day rule).
    'as_of', v_today,
    'knowledge_version', coalesce(v_version, 0)::text,
    'key', jsonb_build_object('knowledge_key', k.knowledge_key, 'kind', k.kind,
      'value_shape', k.value_shape, 'validated_against', k.validated_against,
      'allowed_values', k.allowed_values, 'description', k.description,
      'authority_bearing', k.authority_bearing,
      'firm_defaultable', (exists (select 1 from clara.knowledge_key_firm_eligibility e
                                    where e.knowledge_key = k.knowledge_key)
                           or k.kind in ('preference','policy')),
      'firm_defaultable_reason', (select e.eligible_reason
                                    from clara.knowledge_key_firm_eligibility e
                                   where e.knowledge_key = k.knowledge_key)),
    'applicabilities', v_rows,
    'exception_count', coalesce(v_exc, 0),
    'client_record_count', coalesce(v_own, 0),
    'live_work', v_work);
end $read$;
revoke all on function clara.get_knowledge_applicability(uuid, text) from public;
comment on function clara.get_knowledge_applicability(uuid, text) is
  '#654: for ONE client and ONE knowledge key, the firm rule and the client exception at every '
  'applicability, which of the two is in force and why, whether it is in effect today in '
  'Asia/Kuala_Lumpur, how many clients hold an exception firm-wide (exception_count) and how many '
  'hold their own record of the key at all (client_record_count -- the number a promotion is '
  'decided against), and the non-terminal Work citing the key. Viewer+, clara_authenticated only. It picks no winner the reads do not already '
  'perform: the pairing is the same key+applies_when_digest match clara.list_client_knowledge '
  'shadows on.';

-- =====================================================================================
-- §D — GRANTS. The human lane reads; the runtime lane already has clara.get_knowledge_pack, which
-- carries firm defaults; the agent role and both wake roles hold EXECUTE on NOTHING here, for
-- 0057's dark-grant reason restated at 0192:1742-1745.
-- =====================================================================================
grant execute on function
  clara.list_firm_knowledge(),
  clara.get_knowledge_applicability(uuid, text)
to clara_authenticated;

reset role;

-- =====================================================================================
-- §E — THE FAIL-CLOSED TAIL. Every claim this file's header makes, re-READ from the committed
-- catalog rather than asserted from this file's own text.
-- =====================================================================================
do $w654_tail$
declare v_n int; v_s text; v_src text; v_names text[]; v_admitted text[]; v_refused text[];
begin
  -- (T.1) THE FIRING ORDER, off pg_trigger. The two guards depend on 0192's stamp having run, and
  -- "Postgres fires BEFORE triggers alphabetically" is a fact about the server, not about this
  -- file — so it is MEASURED. pg_trigger's own tgtype encoding: value 1 = ROW, value 2 = BEFORE,
  -- value 4 = INSERT (the first draft of this comment mislabelled 2 as ROW; the arithmetic below
  -- was right, the sentence was not).
  select array_agg(tgname order by tgname) into v_names
    from pg_trigger
   where tgrelid = 'clara.knowledge_records'::regclass and not tgisinternal
     and (tgtype & 1) <> 0 and (tgtype & 2) <> 0 and (tgtype & 4) <> 0;
  if v_names is distinct from array['t_knowledge_records_authority',
                                    't_knowledge_records_firm_eligibility',
                                    't_knowledge_records_firm_evidence'] then
    raise exception '#654 tail: the BEFORE INSERT ROW trigger order on clara.knowledge_records is %, not authority -> firm_eligibility -> firm_evidence', v_names
      using errcode='CLR10';
  end if;

  -- …AND THE OTHER SIDE OF THE SAME WALL IS ATTACHED, on the FILING table, for BOTH the INSERT
  -- and the (0007-impossible) un-retire UPDATE. A wall enforced in one direction only is the
  -- defect this arm exists to close, so its presence is asserted rather than assumed.
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.document_filings'::regclass and not tgisinternal
     and tgname = 't_document_filings_firm_knowledge'
     and (tgtype & 1) <> 0 and (tgtype & 2) <> 0 and (tgtype & 4) <> 0 and (tgtype & 16) <> 0;
  if v_n <> 1 then
    raise exception '#654 tail: t_document_filings_firm_knowledge is not attached to clara.document_filings as a BEFORE INSERT OR UPDATE ROW trigger'
      using errcode='CLR10';
  end if;

  -- …AND THE TWO HALVES SERIALISE ON ONE KEY. Attached in both directions is still not the
  -- invariant: each half reads the other's table, so under READ COMMITTED two overlapping
  -- transactions see neither other's row and BOTH commit. What closes that is the single advisory
  -- key both bodies take, and a typo in either would leave a wall that is attached, refuses every
  -- sequential act, and refuses nothing at all when two transactions overlap — which no census
  -- over ROWS can see. Pinned here as a shared literal because a migration tail cannot race
  -- itself; the behavioural proof, in all four arrival orders, is
  -- `p654.evidence.race_capture_vs_filing`.
  select count(*)::int into v_n from pg_proc p
   where p.oid in ('clara._tf_knowledge_firm_evidence()'::regprocedure,
                   'clara._tf_document_filing_firm_knowledge()'::regprocedure)
     and position('pg_advisory_xact_lock(' in p.prosrc) > 0
     and position('clara.firm_knowledge_evidence:' in p.prosrc) > 0;
  if v_n <> 2 then
    raise exception '#654 tail: % of the two evidence guards take the shared advisory lock clara.firm_knowledge_evidence:<document_id>, not both -- the wall would not survive two concurrent transactions', v_n
      using errcode='CLR10';
  end if;

  -- (T.2) THE ELIGIBILITY RELATION: forced RLS, both belts, ZERO DML to every application role,
  -- SELECT to clara_authenticated ALONE, and no PUBLIC entry anywhere in its ACL.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='clara' and c.relname='knowledge_key_firm_eligibility'
                    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#654 tail: clara.knowledge_key_firm_eligibility is not under FORCED row level security'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.knowledge_key_firm_eligibility'::regclass and not tgisinternal
     and tgname in ('t_knowledge_key_firm_eligibility_append_only',
                    't_knowledge_key_firm_eligibility_no_truncate');
  if v_n <> 2 then
    raise exception '#654 tail: the append-only/no-truncate belt pair on the eligibility catalog is incomplete (% of 2)', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from (
    select unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive']) as r) g
   where has_table_privilege(g.r, 'clara.knowledge_key_firm_eligibility', 'INSERT')
      or has_table_privilege(g.r, 'clara.knowledge_key_firm_eligibility', 'UPDATE')
      or has_table_privilege(g.r, 'clara.knowledge_key_firm_eligibility', 'DELETE');
  if v_n <> 0 then
    raise exception '#654 tail: % application role(s) hold DML on clara.knowledge_key_firm_eligibility', v_n
      using errcode='CLR10';
  end if;
  if not has_table_privilege('clara_authenticated','clara.knowledge_key_firm_eligibility','SELECT') then
    raise exception '#654 tail: clara_authenticated cannot read the eligibility catalog -- the firm register renders its reason'
      using errcode='CLR10';
  end if;
  foreach v_s in array array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
    if has_table_privilege(v_s, 'clara.knowledge_key_firm_eligibility', 'SELECT') then
      raise exception '#654 tail: % holds a read on the eligibility catalog -- only a human promotes', v_s
        using errcode='CLR10';
    end if;
  end loop;
  -- relacl is NON-NULL (a default ACL would mean the grant above never happened) and carries NO
  -- PUBLIC entry: `grantee = 0` is PUBLIC in aclexplode's own encoding.
  select count(*)::int into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace,
       lateral aclexplode(c.relacl) a
   where n.nspname='clara' and c.relname='knowledge_key_firm_eligibility' and a.grantee = 0;
  if v_n <> 0 then
    raise exception '#654 tail: PUBLIC holds a privilege on clara.knowledge_key_firm_eligibility'
      using errcode='CLR10';
  end if;
  if (select c.relacl from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname='clara' and c.relname='knowledge_key_firm_eligibility') is null then
    raise exception '#654 tail: clara.knowledge_key_firm_eligibility carries a NULL relacl -- the clara_authenticated SELECT grant did not land'
      using errcode='CLR10';
  end if;

  -- (T.3) THE ADMITTED CENSUS, DERIVED and PRINTED. This is the set the wall admits, computed the
  -- way the trigger computes it, so the notice below is a measurement rather than a restatement.
  select array_agg(k.knowledge_key order by k.knowledge_key) into v_admitted
    from clara.knowledge_keys k
   where exists (select 1 from clara.knowledge_key_firm_eligibility e
                  where e.knowledge_key = k.knowledge_key)
      or k.kind in ('preference','policy');
  select array_agg(k.knowledge_key order by k.knowledge_key) into v_refused
    from clara.knowledge_keys k
   where not exists (select 1 from clara.knowledge_key_firm_eligibility e
                      where e.knowledge_key = k.knowledge_key)
     and k.kind not in ('preference','policy');
  if v_admitted is distinct from array['accounting_basis','coa_seed_decision','default_currency','reporting_framework'] then
    raise exception '#654 tail: the firm-defaultable census is %, not the four this file declares (the three D8 seeds plus coa_seed_decision by kind)', v_admitted
      using errcode='CLR10';
  end if;
  if array_length(v_refused, 1) <> 9 then
    raise exception '#654 tail: % key(s) are refused at firm scope, not the 9 the 13-key catalog implies (%)',
      coalesce(array_length(v_refused,1), 0), v_refused using errcode='CLR10';
  end if;
  -- The four client-identity keys D8 names explicitly must be on the REFUSED side, by name.
  foreach v_s in array array['entity_type','msic','sst_regime','financial_year_end_month'] loop
    if not (v_s = any (v_refused)) then
      raise exception '#654 tail: % is firm-defaultable -- D8 says a client-identity fact never is', v_s
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.4) NO GRANDFATHERED VIOLATOR, EITHER WALL, re-counted after the triggers exist. Counted
  -- across N live filings, never probed for one.
  select count(*)::int into v_n
    from clara.knowledge_records r
    join clara.knowledge_keys k on k.knowledge_key = r.knowledge_key
   where r.scope_kind = 'firm'
     and not exists (select 1 from clara.knowledge_key_firm_eligibility e
                      where e.knowledge_key = r.knowledge_key)
     and k.kind not in ('preference','policy');
  if v_n <> 0 then
    raise exception '#654 tail: % live firm-scope record(s) name an ineligible key', v_n using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from clara.knowledge_records r
   where r.scope_kind = 'firm' and r.state = 'live' and r.source_document_id is not null
     and exists (select 1 from clara.document_filings f
                  where f.document_id = r.source_document_id and f.firm_id = r.firm_id
                    and f.retired_at is null);
  if v_n <> 0 then
    raise exception '#654 tail: % LIVE firm-scope record(s) cite a document with a live client filing', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n
    from clara.knowledge_records r
   where r.scope_kind = 'firm' and r.state = 'live' and r.source_work_id is not null;
  if v_n <> 0 then
    raise exception '#654 tail: % LIVE firm-scope record(s) pin a client''s accounting_work', v_n
      using errcode='CLR10';
  end if;

  -- (T.5) THE GRANT CENSUS ON THE FOUR NEW FUNCTIONS, grantee by grantee. The two reads are
  -- clara_authenticated ONLY; the two trigger bodies are callable by NOBODY (they run as the
  -- definer owner through the trigger, which needs no EXECUTE grant).
  foreach v_s in array array['clara.list_firm_knowledge()','clara.get_knowledge_applicability(uuid,text)'] loop
    if not has_function_privilege('clara_authenticated', v_s, 'EXECUTE') then
      raise exception '#654 tail: clara_authenticated cannot execute %', v_s using errcode='CLR10';
    end if;
  end loop;
  foreach v_s in array array['clara.list_firm_knowledge()','clara.get_knowledge_applicability(uuid,text)',
                             'clara._tf_knowledge_firm_eligibility()','clara._tf_knowledge_firm_evidence()',
                             'clara._tf_document_filing_firm_knowledge()'] loop
    -- A NULL proacl means the DEFAULT ACL, which for a function includes EXECUTE to PUBLIC: the
    -- `revoke all ... from public` above is what makes it non-null, so both halves are one probe.
    if (select p.proacl is null from pg_proc p where p.oid = v_s::regprocedure) then
      raise exception '#654 tail: % carries a DEFAULT (NULL) ACL -- PUBLIC still holds EXECUTE on it', v_s
        using errcode='CLR10';
    end if;
    if (select count(*)::int from pg_proc p, lateral aclexplode(p.proacl) a
         where p.oid = v_s::regprocedure and a.grantee = 0) <> 0 then
      raise exception '#654 tail: PUBLIC holds a privilege on %', v_s using errcode='CLR10';
    end if;
    select count(*)::int into v_n from (
      select unnest(array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive']) as r) g
     where has_function_privilege(g.r, v_s, 'EXECUTE');
    if v_n <> 0 then
      raise exception '#654 tail: % role(s) outside the human lane hold EXECUTE on % -- a _human_ctx-gated read granted to a role that carries no JWT is a DARK grant', v_n, v_s
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.6) BOTH READS ARE DEFINER, STABLE, search_path-pinned and force_custom_plan, and neither is
  -- a view. `provolatile='s'`, `prosecdef`, and the two settings read off proconfig.
  foreach v_s in array array['clara.list_firm_knowledge()','clara.get_knowledge_applicability(uuid,text)'] loop
    select count(*)::int into v_n from pg_proc p
     where p.oid = v_s::regprocedure and p.prosecdef and p.provolatile = 's'
       and p.proconfig @> array['search_path=clara, pg_temp']
       and p.proconfig @> array['plan_cache_mode=force_custom_plan'];
    if v_n <> 1 then
      raise exception '#654 tail: % is not a STABLE SECURITY DEFINER with search_path and plan_cache_mode pinned', v_s
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.7) THIS FILE RECUT NOTHING. The five 0192 bodies #654 was forbidden to touch still resolve
  -- at their exact signatures, and `clara.knowledge_records` still carries 0192's own four
  -- triggers beside the two added here (six in total, no replacement).
  foreach v_s in array array[
      'clara.capture_knowledge(text,jsonb,text,text,text,uuid,text,jsonb,date,date,jsonb)',
      'clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)',
      'clara._knowledge_floor(text,text)',
      'clara.list_client_knowledge(uuid)',
      'clara.get_knowledge_pack(uuid,text,uuid)'] loop
    if to_regprocedure(v_s) is null then
      raise exception '#654 tail: % no longer resolves -- 0220 must recut none of 0192''s bodies', v_s
        using errcode='CLR10';
    end if;
  end loop;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.knowledge_records'::regclass and not tgisinternal;
  if v_n <> 6 then
    raise exception '#654 tail: clara.knowledge_records carries % non-internal triggers, not 0192''s four plus this file''s two', v_n
      using errcode='CLR10';
  end if;
  -- …and the client lane's shadow is still PER-APPLICABILITY in BOTH shipped reads, which is the
  -- behaviour every client-exception claim in this file rests on. Probed literally off the live
  -- body, 0192's own tail idiom (0192:2151-2160) — a recut elsewhere that narrowed the shadow back
  -- to the key alone would silently erase a client's narrow exception.
  foreach v_s in array array['list_client_knowledge','get_knowledge_pack'] loop
    select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'clara' and p.proname = v_s;
    if position('o.applies_when_digest = r.applies_when_digest' in coalesce(v_src, '')) = 0 then
      raise exception '#654 tail: clara.% shadows the firm default by KEY alone, not by key AND applicability -- the client-exception model this file walls around is gone', v_s
        using errcode='CLR10';
    end if;
  end loop;

  raise notice '#654 tail: OK -- clara.knowledge_key_firm_eligibility exists under FORCED row level security owned by clara_fn_owner, append-only and no-truncate belted, readable by clara_authenticated ALONE (no runtime, agent or wake role) and writable by no application role at all, seeded with the three keys owner ruling D8 named; the two BEFORE INSERT guards fire AFTER 0192''s own authority stamp in the order pg_trigger reports (authority -> firm_eligibility -> firm_evidence), and the SAME wall is closed from the filing side by t_document_filings_firm_knowledge on clara.document_filings so that a document a live firm rule cites can no longer be filed to a client after the fact (CLR10 document_cited_by_firm_default) while a correction or withdrawal carrying the predecessor''s pins verbatim stays admissible, which is what keeps a contaminated rule retractable, and BOTH halves take one shared advisory transaction lock keyed on the document (clara.firm_knowledge_evidence:<document_id>, after the documents row lock the filing lane already holds) so the wall decides the case where the two acts are IN FLIGHT AT ONCE rather than one after the other; the FIRM-DEFAULTABLE census measured off the live catalog is EXACTLY {%}, and the NINE keys refused at firm scope are {%} -- entity_type, msic, sst_regime and financial_year_end_month among them by name; NO existing firm-scope record names an ineligible key, and no LIVE one cites a document carrying a live client filing (counted across N filings, not probed for one) or pins any client''s accounting_work -- live is the invariant the two guards enforce, because a superseded or withdrawn revision reaches no client through any read; clara.list_firm_knowledge and clara.get_knowledge_applicability are viewer-floored STABLE SECURITY DEFINER functions with search_path and plan_cache_mode pinned, PUBLIC revoked, granted to clara_authenticated and to nobody else; and every one of the five 0192 bodies this file was forbidden to recut still resolves at its exact signature with clara.knowledge_records carrying six non-internal triggers (0192''s four plus these two).',
    array_to_string(v_admitted, ', '), array_to_string(v_refused, ', ');
end
$w654_tail$;
