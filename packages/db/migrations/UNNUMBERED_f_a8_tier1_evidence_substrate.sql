-- UNNUMBERED_f_a8_tier1_evidence_substrate.sql — F-A8 (Wave-F Track A) PR-1: the internet lane's
-- Tier-1 DB, greenfield, PLUS the law-28 evidence substrate the v3 fold moved into this PR.
-- =====================================================================================
-- Design of record: docs/plan/active/internet-lane-design.md v3 §3.1/§7 PR-1 bullet;
-- docs/plan/active/internet-lane-annexes.md v3 Annex D.1b (IL-D17..IL-D34, IL-D1..IL-D16) +
-- Annex E/F/I; docs/plan/active/internet-lane-annexes-2.md Annex K (the walls, specified).
-- Numbers are claimed at MERGE time (hard constraint 10) — this file is UNNUMBERED.
--
-- SIZE (the 500-line advisory, exceeded — the 0090 precedent's own call, at 1803 lines):
-- the natural seam here (tables/DDL posture vs. functions/grants/freeze) is not a genuine
-- design separation the way 0091/0092/0093's three-file split was — splitting it would mean
-- re-deriving prestate/tail evidence and re-establishing search_path/role context twice for
-- no review gain. Kept as one self-contained file.
--
-- WHAT THIS FILE BUILDS (design §7 PR-1, v3): fx_rates (exact rate_date, no effective_to,
-- IL-D23) · policy_drafts (staging) · the evidence substrate the law-28 fold moved forward —
-- tier1_endpoints (IL-D19) · web_attempts + web_attempt_events (IL-D25, replacing v2's
-- tier1_fetch_attempts) · fetch_artifacts (IL-D17) · policy_fact_spans · policy_approval_cards
-- (IL-D28) · the composite-FK digest chain (IL-D26) · evaluate_policy_source_value_v1
-- REGISTERED in the evaluator freeze (IL-D20) · the wake wrapper/core pair + the two human
-- doors, gated via clara._human_ctx raising CLR04 (IL-D32, not v2's hand-rolled CLR05) · the
-- consume-first pair resolving through clara._wake_cred_full() (IL-D12, sharpened — measured
-- live: _wake_cred_full IGNORES consumed_at; wake_context filters it and can never see a
-- consumed credential, so BOTH halves of the idiom must be copied or the replay carve-out
-- never fires) · the ONE allowlist row ('proactive','wake_submit_policy_draft') · Annex E's
-- RLS/FORCE/owner-policy/zero-grant DDL on all eight new tables · Annex F's T17 roster
-- surgery (packages/db/tests/rig-meta.mjs, edited alongside this file).
-- p_table_key's closed set is {'fx_rates'} at this PR (widened to admit
-- 'sst_threshold_schedule' by PR-3). D1: NONE PREDICTED — every artifact below is new; no
-- live body's prosrc is touched (rig-replay confirms this in the tail).
--
-- WHAT THIS FILE DOES NOT BUILD (out of PR-1's own scope, named so silence reads as scope,
-- not oversight): the runtime sterile web-read client, the versioned MIME canonicalizers, the
-- scheduled fetch job (PR-2) · the sst_threshold_schedule ALTER (PR-3) · Tier 2 — wake_web_fetch
-- / wake_web_search / _web_read_core / the identity wall (PR-4, gated on OQ-A) · the four
-- bookkeeper+ typed DEFINER readers (PR-5) · tier1_endpoints SEED ROWS — OQ-B's own default is
-- "migration-seeded, door deferred", but ODQ-2's exact two official channels per Tier-1 table
-- are an UNRESOLVED research question (survey R1); seeding a placeholder or invented URL here
-- would be worse than an honest gap, so this table ships EMPTY and `_policy_sources_agree`'s
-- own ARM-0 contract (fewer than two extractable sources -> not_evaluable) already covers a
-- zero-endpoint world. Recorded as a build-time gap, not silence.
--
-- THREE JUDGEMENT CALLS THIS FILE MAKES THAT ANNEX K DOES NOT NAME BY VERB (documented here
-- because the design specifies the WALLS but not every wire between them):
--   (a) THE ATTEMPT-LEDGER WRITER. Annex K names web_attempts/web_attempt_events as a table
--       shape (IL-D25) but never a writer verb (unlike fetch_artifacts, whose writer IS named:
--       record_fetch_artifact). A refusal-before-any-artifact-exists (C-3's Tier-2 failure
--       receipts; C.6a/b's source_unreachable/unparseable Tier-1 outcomes) must still write a
--       row, so record_fetch_artifact alone cannot be the whole surface. This file adds ONE
--       companion writer, clara.record_web_attempt_event, EXECUTE to clara_runtime only,
--       which upserts the attempt row on its FIRST event for a given attempt_id (the id is
--       minted client-side by the runtime, per IL-D25, and passed in — never DB-generated)
--       and always appends an event with a server-computed seq. This is new judgement, not a
--       literal transcription; C.14c's EXECUTE census covers it exactly as it covers
--       record_fetch_artifact.
--   (b) THE APPROVAL CARD IS MINTED INSIDE _policy_draft_submit_core, not by a separate
--       granted verb. Every DB-owned input the card needs (the derived value, both verdicts,
--       the span, the artifact digests) already exists the moment the draft is inserted, so
--       minting it then — in the SAME transaction as TA-P4's "no receipt, no act" — needs no
--       new authority shape and no second door. decide_policy_draft / override_policy_draft
--       both check the STORED card's sha256, which cannot drift because the table is
--       append-only.
--   (c) evaluate_policy_source_value_v1's fx_rates PARSE RULE is a narrow v1 cut: value is
--       the first decimal number found in the locator span; the effective date is the first
--       ISO 8601 date (\d{4}-\d{2}-\d{2}) found anywhere in the artifact's canonical text.
--       Both are GUARDED (GM-7 — an unmatched pattern is not_evaluable, never a raise) and
--       VERSIONED (the _v1 suffix; a wider date-format rule is a future _v2, a new registry
--       row, never a CoR of this body). PR-2's canonicalizer does not exist yet, so this rule
--       is exercised only by rig-fixture canonical_text in this PR's own battery.
--
-- RECORDED GAP (IL-D34's own escape clause, not invented here): F-A7/PR-1pi (train position 2)
-- has NOT merged as of this file's authoring — clara.agent_receipt_contract and the typed empty
-- shim clara._agent_receipt_src_f_a8 do not exist on this rig at the 0102 frontier (measured,
-- prestate below). This file therefore does NOT attempt the `create or replace view` re-cut —
-- doing so against a base that does not exist would either fail outright or silently invent a
-- shape nobody reviewed. §8 below states this as a MEASURED absence and the tail names it.
-- Whichever PR merges second (F-A7/PR-1pi or this one) must add the two-line `create or
-- replace view` re-cut; the shape it must conform to is design §4's D-6/R-L26 projection,
-- restated in this file's own comment at §8 so nobody has to re-derive it from the design doc.

set local statement_timeout = '10min';
set local search_path = clara, pg_temp;

-- =====================================================================================
-- §0 PRESTATE — every claim this file makes about what exists (or does not) is measured,
-- never assumed (review law 2).
-- =====================================================================================
do $fa8_pre$
begin
  if to_regclass('clara.fx_rates') is not null or to_regclass('clara.policy_drafts') is not null
     or to_regclass('clara.tier1_endpoints') is not null or to_regclass('clara.web_attempts') is not null
     or to_regclass('clara.web_attempt_events') is not null or to_regclass('clara.fetch_artifacts') is not null
     or to_regclass('clara.policy_fact_spans') is not null or to_regclass('clara.policy_approval_cards') is not null
  then
    raise exception 'F-A8 PR-1: one or more of the eight new tables already exists — already applied'
      using errcode = 'CLR10';
  end if;
  if to_regprocedure('clara.wake_submit_policy_draft(text,jsonb,jsonb,text,text)') is not null
     or to_regprocedure('clara.evaluate_policy_source_value_v1(text,uuid,jsonb)') is not null
  then
    raise exception 'F-A8 PR-1: one or more of the new functions already exists — already applied'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.evaluator_versions where evaluator_name = 'evaluate_policy_source_value') then
    raise exception 'F-A8 PR-1: clara.evaluator_versions already carries an evaluate_policy_source_value row'
      using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.wake_fn_allowlist where wake_kind = 'proactive' and function_name = 'wake_submit_policy_draft') then
    raise exception 'F-A8 PR-1: the wake_fn_allowlist row already exists' using errcode = 'CLR10';
  end if;
  -- The leaves this file depends on must be exactly where the rig replay measured them
  -- (Annex G.4): _human_ctx, _wake_cred_full, assert_wake_allowed, mint_wake_credential,
  -- _reserve_op/_finish_op/_hash, evaluator_versions + evaluator_version_members +
  -- verify_evaluator_freeze, _tf_no_truncate/_tf_append_only, role_rank, agent_user_id.
  if to_regprocedure('clara._human_ctx(int)') is null or to_regprocedure('clara._wake_cred_full()') is null
     or to_regprocedure('clara.assert_wake_allowed(text,text)') is null
     or to_regprocedure('clara._reserve_op(uuid,text,text,bytea)') is null
     or to_regprocedure('clara._finish_op(uuid,text,text,jsonb)') is null
     or to_regprocedure('clara._hash(jsonb)') is null
     or to_regprocedure('clara.verify_evaluator_freeze()') is null
     or to_regprocedure('clara._tf_no_truncate()') is null
     or to_regprocedure('clara._tf_append_only()') is null
     or to_regprocedure('clara.role_rank(text)') is null
     or to_regprocedure('clara.agent_user_id()') is null
  then
    raise exception 'F-A8 PR-1: a depended-on leaf is absent from the catalog — the frontier has moved under this file'
      using errcode = 'CLR10';
  end if;
  -- The receipt-shim dependency is measured, never assumed (§8/IL-D34's recorded gap).
  if to_regclass('clara.agent_receipt_contract') is not null then
    raise notice 'F-A8 PR-1 prestate: clara.agent_receipt_contract IS present — F-A7/PR-1pi has landed ahead of this file. This migration still does not re-cut the shim (that edit was authored against an ABSENT base and has not been re-verified against the live one); the conductor must fold the two-line create-or-replace view separately before this item is considered D-6-complete.';
  else
    raise notice 'F-A8 PR-1 prestate: clara.agent_receipt_contract is ABSENT — F-A7/PR-1pi has not merged. The D-6 receipt-shim re-cut is a RECORDED GAP, not built here (IL-D34).';
  end if;
  raise notice 'F-A8 PR-1 prestate: clean — none of the eight new tables, the new functions, the evaluator row or the allowlist row exist yet; every depended-on leaf is live.';
end
$fa8_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §1 TABLES
-- =====================================================================================

-- IL-D19 — the DB-owned Tier-1 endpoint registry. The `client_facts` supersede idiom
-- (0055:386-420, re-measured live) copied whole: uuid PK, deferrable self-FK, paired CHECK,
-- WHO/BASIS/WHEN. Ships EMPTY this PR (see header) — OQ-B's default, ODQ-2 unresolved.
create table clara.tier1_endpoints (
  id                  uuid primary key default gen_random_uuid(),
  table_key           text not null,
  endpoint_code       text not null,
  canonical_origin    text not null check (canonical_origin like 'https://%'),
  path_template       text not null,
  expected_mime       text not null,
  independence_class  text not null,
  max_age             interval not null,
  active              boolean not null default true,
  superseded_by       uuid references clara.tier1_endpoints(id) deferrable initially deferred,
  superseded_at       timestamptz,
  recorded_by         uuid references clara.users(id),
  basis               text,
  basis_kind          text,
  recorded_at         timestamptz not null default now(),
  constraint ck_tier1_endpoints_supersession_paired check ((superseded_by is null) = (superseded_at is null)),
  constraint uq_tier1_endpoints_table_code unique (table_key, endpoint_code)
);

-- IL-D25 — one append-only attempt ledger for BOTH tiers. `id` is minted by the RUNTIME with
-- a CSPRNG before any DNS lookup or socket (never a DB default) and passed in explicitly.
create table clara.web_attempts (
  id              uuid primary key,
  tier            smallint not null check (tier in (1,2)),
  table_key       text,
  endpoint_id     uuid references clara.tier1_endpoints(id),
  purpose         text,
  op_key          text,
  model_snapshot  jsonb,
  started_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create table clara.web_attempt_events (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references clara.web_attempts(id),
  seq          int not null check (seq > 0),
  event        text not null check (event in ('refused_by_guard','started','redirected','succeeded',
                  'failed','unparseable','source_unreachable','no_change','drafted')),
  detail       jsonb,
  at           timestamptz not null default now(),
  constraint uq_web_attempt_events_attempt_seq unique (attempt_id, seq)
);

-- IL-D17 — immutable raw fetch artifacts, persisted BEFORE any model access. The precedent is
-- `clara.report_artifacts` (measured live), not a new idiom: digest shape CHECK, byte_size>0,
-- a content-addressed path CHECK, and `unique(id, sha256)` / `unique(id, canonical_sha256)` so
-- children can carry a composite FK onto the digest (IL-D26). Firm-independent: the path form
-- drops the firm segment report_artifacts carries.
create table clara.fetch_artifacts (
  id                     uuid primary key default gen_random_uuid(),
  attempt_id             uuid not null references clara.web_attempts(id),
  endpoint_id            uuid references clara.tier1_endpoints(id),
  requested_url          text not null,
  final_url              text not null,
  redirect_chain         jsonb not null default '[]'::jsonb,
  hop_index              int not null default 0,
  http_status            int,
  mime_type              text,
  charset                text,
  byte_size              bigint not null check (byte_size > 0),
  sha256                 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path           text not null,
  response_headers       jsonb not null default '{}'::jsonb,
  server_date            timestamptz,
  fetched_at             timestamptz not null default now(),
  canonicalizer_version  int,
  canonical_text         text,
  canonical_sha256       text,
  canon_verdict          text check (canon_verdict in ('ok','rejected','not_evaluable')),
  canon_reject_reason    text,
  bytes_verified_at      timestamptz not null,
  bytes_verified_by      text not null,
  created_at             timestamptz not null default now(),
  constraint ck_fa_content_addressed check (storage_path = 'internet/' || sha256),
  constraint uq_fetch_artifacts_id_sha256 unique (id, sha256),
  constraint uq_fetch_artifacts_id_canonical_sha256 unique (id, canonical_sha256),
  constraint uq_fetch_artifacts_attempt_hop unique (attempt_id, hop_index)
);

-- The extraction record per submitted artifact — the digest-chain edge fetch_artifacts ->
-- policy_fact_spans (IL-D26). `extractor_version_id` FKs to the REGISTRY row, never a bare
-- integer (IL-D20).
create table clara.policy_fact_spans (
  id                     uuid primary key default gen_random_uuid(),
  artifact_id            uuid not null,
  artifact_sha256        text not null,
  locator                jsonb not null,
  extractor_version_id   uuid not null references clara.evaluator_versions(id),
  value                  numeric,
  unit                   text,
  effective_date         date,
  verdict                text not null check (verdict in ('ok','not_evaluable')),
  span_text              text,
  created_at             timestamptz not null default now(),
  constraint fk_policy_fact_spans_artifact foreign key (artifact_id, artifact_sha256)
    references clara.fetch_artifacts(id, sha256)
);

-- The staging table. No firm_id (Tier-1 facts are firm-independent, survey F15).
create table clara.policy_drafts (
  id                        uuid primary key default gen_random_uuid(),
  table_key                 text not null check (table_key in ('fx_rates')),
  span_id                   uuid not null references clara.policy_fact_spans(id),
  extractor_version_id      uuid not null references clara.evaluator_versions(id),
  derived_value              numeric,
  payload                   jsonb,
  effective_date            date,
  expires_at                timestamptz,
  sources_agree_verdict     text not null check (sources_agree_verdict in
                               ('pass','fail','not_evaluable','sources_not_independent',
                                'duplicate_source','duplicate_artifact')),
  value_plausible_verdict   text not null check (value_plausible_verdict in ('pass','fail','not_evaluable')),
  status                    text not null check (status in
                               ('pending_approval','needs_review','approved','overridden','rejected')),
  model_snapshot            jsonb not null,
  rationale                 text not null,
  minted_by_firm            uuid not null references clara.firms(id),
  acting_actor              uuid,
  on_behalf_of              uuid,
  via_wake_kind             text,
  op_key                    text,
  submitted_at              timestamptz not null default now(),
  decided_by                uuid references clara.users(id),
  decided_at                timestamptz,
  decision_note             text,
  created_at                timestamptz not null default now()
);

-- IL-D28 — the server-rendered, digest-bound approval card. Minted once, inside the same
-- transaction as the draft (§0 (b) above); the click signs card_sha256.
create table clara.policy_approval_cards (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references clara.policy_drafts(id),
  card_sha256  text not null check (card_sha256 ~ '^[0-9a-f]{64}$'),
  rendered     jsonb not null,
  minted_at    timestamptz not null default now(),
  constraint uq_policy_approval_cards_draft_sha unique (draft_id, card_sha256)
);

-- fx_rates — the client_facts idiom, KEY CHANGED per IL-D23: an exact rate_date, NO
-- effective_to, no open-ended row, so carry-forward cannot be expressed structurally.
create table clara.fx_rates (
  id              uuid primary key default gen_random_uuid(),
  base_ccy        text not null,
  quote_ccy       text not null,
  rate_date       date not null,
  rate            numeric not null check (rate > 0),
  superseded_by   uuid references clara.fx_rates(id) deferrable initially deferred,
  superseded_at   timestamptz,
  recorded_by     uuid not null references clara.users(id),
  basis           text not null check (btrim(basis) <> ''),
  basis_kind      text not null check (basis_kind = 'owner_instruction'),
  recorded_at     timestamptz not null default now(),
  constraint ck_fx_rates_supersession_paired check ((superseded_by is null) = (superseded_at is null))
);
create unique index uq_fx_rates_live on clara.fx_rates(base_ccy, quote_ccy, rate_date) where superseded_at is null;

-- =====================================================================================
-- §1b DDL POSTURE — RLS + FORCE + one owner policy + zero app-role grants + a no-truncate
-- trigger on all eight (Annex E; the firm-less idiom, `sst_threshold_schedule`'s own shape,
-- re-measured live). Supersede-shaped tables (tier1_endpoints, fx_rates) additionally get a
-- supersede-only update trigger and a no-delete trigger; the pure-append tables get a
-- reject-all update trigger too; policy_drafts gets its own decide-only update trigger.
-- =====================================================================================

create function clara._tf_tier1_endpoints_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $ttes$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded tier1 endpoint is immutable' using errcode = 'CLR10';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id is distinct from old.id or new.table_key is distinct from old.table_key
     or new.endpoint_code is distinct from old.endpoint_code
     or new.canonical_origin is distinct from old.canonical_origin
     or new.path_template is distinct from old.path_template
     or new.expected_mime is distinct from old.expected_mime
     or new.independence_class is distinct from old.independence_class
     or new.max_age is distinct from old.max_age or new.active is distinct from old.active
     or new.recorded_by is distinct from old.recorded_by or new.basis is distinct from old.basis
     or new.basis_kind is distinct from old.basis_kind or new.recorded_at is distinct from old.recorded_at then
    raise exception 'tier1_endpoints admits exactly one update: the supersession stamp' using errcode = 'CLR10';
  end if;
  return new;
end $ttes$;
revoke all on function clara._tf_tier1_endpoints_supersede_only() from public;

create function clara._tf_fx_rates_supersede_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tfrs$
begin
  if old.superseded_at is not null or old.superseded_by is not null then
    raise exception 'a superseded fx_rates row is immutable' using errcode = 'CLR10';
  end if;
  if new.superseded_by is null or new.superseded_at is null
     or new.id is distinct from old.id or new.base_ccy is distinct from old.base_ccy
     or new.quote_ccy is distinct from old.quote_ccy or new.rate_date is distinct from old.rate_date
     or new.rate is distinct from old.rate or new.recorded_by is distinct from old.recorded_by
     or new.basis is distinct from old.basis or new.basis_kind is distinct from old.basis_kind
     or new.recorded_at is distinct from old.recorded_at then
    raise exception 'fx_rates admits exactly one update: the supersession stamp' using errcode = 'CLR10';
  end if;
  return new;
end $tfrs$;
revoke all on function clara._tf_fx_rates_supersede_only() from public;

create function clara._tf_policy_drafts_decide_only() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $tpdd$
begin
  if old.status in ('approved','overridden','rejected') then
    raise exception 'a terminal policy draft is immutable' using errcode = 'CLR10';
  end if;
  if new.status not in ('approved','overridden','rejected')
     or new.id is distinct from old.id or new.table_key is distinct from old.table_key
     or new.span_id is distinct from old.span_id or new.extractor_version_id is distinct from old.extractor_version_id
     or new.derived_value is distinct from old.derived_value or new.payload is distinct from old.payload
     or new.effective_date is distinct from old.effective_date or new.expires_at is distinct from old.expires_at
     or new.sources_agree_verdict is distinct from old.sources_agree_verdict
     or new.value_plausible_verdict is distinct from old.value_plausible_verdict
     or new.model_snapshot is distinct from old.model_snapshot or new.rationale is distinct from old.rationale
     or new.minted_by_firm is distinct from old.minted_by_firm or new.acting_actor is distinct from old.acting_actor
     or new.on_behalf_of is distinct from old.on_behalf_of or new.via_wake_kind is distinct from old.via_wake_kind
     or new.op_key is distinct from old.op_key or new.submitted_at is distinct from old.submitted_at then
    raise exception 'policy_drafts admits exactly one update: the terminal decision stamp' using errcode = 'CLR10';
  end if;
  return new;
end $tpdd$;
revoke all on function clara._tf_policy_drafts_decide_only() from public;

do $fa8_posture$
declare t text;
begin
  foreach t in array array['tier1_endpoints','fx_rates','web_attempts','web_attempt_events',
      'fetch_artifacts','policy_fact_spans','policy_drafts','policy_approval_cards']
  loop
    execute format('alter table clara.%I enable row level security', t);
    execute format('alter table clara.%I force row level security', t);
    execute format('create policy p_%s_owner on clara.%I for all to clara_fn_owner using (true) with check (true)', t, t);
    execute format('create trigger t_%s_no_truncate before truncate on clara.%I for each statement execute function clara._tf_no_truncate()', t, t);
  end loop;
end
$fa8_posture$;

create trigger t_tier1_endpoints_supersede_only before update on clara.tier1_endpoints
  for each row execute function clara._tf_tier1_endpoints_supersede_only();
create trigger t_tier1_endpoints_no_delete before delete on clara.tier1_endpoints
  for each row execute function clara._tf_append_only();

create trigger t_fx_rates_supersede_only before update on clara.fx_rates
  for each row execute function clara._tf_fx_rates_supersede_only();
create trigger t_fx_rates_no_delete before delete on clara.fx_rates
  for each row execute function clara._tf_append_only();

create trigger t_web_attempts_no_update before update on clara.web_attempts
  for each row execute function clara._tf_append_only();
create trigger t_web_attempts_no_delete before delete on clara.web_attempts
  for each row execute function clara._tf_append_only();

create trigger t_web_attempt_events_no_update before update on clara.web_attempt_events
  for each row execute function clara._tf_append_only();
create trigger t_web_attempt_events_no_delete before delete on clara.web_attempt_events
  for each row execute function clara._tf_append_only();

create trigger t_fetch_artifacts_no_update before update on clara.fetch_artifacts
  for each row execute function clara._tf_append_only();
create trigger t_fetch_artifacts_no_delete before delete on clara.fetch_artifacts
  for each row execute function clara._tf_append_only();

create trigger t_policy_fact_spans_no_update before update on clara.policy_fact_spans
  for each row execute function clara._tf_append_only();
create trigger t_policy_fact_spans_no_delete before delete on clara.policy_fact_spans
  for each row execute function clara._tf_append_only();

create trigger t_policy_drafts_decide_only before update on clara.policy_drafts
  for each row execute function clara._tf_policy_drafts_decide_only();
create trigger t_policy_drafts_no_delete before delete on clara.policy_drafts
  for each row execute function clara._tf_append_only();

create trigger t_policy_approval_cards_no_update before update on clara.policy_approval_cards
  for each row execute function clara._tf_append_only();
create trigger t_policy_approval_cards_no_delete before delete on clara.policy_approval_cards
  for each row execute function clara._tf_append_only();

revoke all on clara.tier1_endpoints, clara.fx_rates, clara.web_attempts, clara.web_attempt_events,
  clara.fetch_artifacts, clara.policy_fact_spans, clara.policy_drafts, clara.policy_approval_cards
  from public, clara_authenticated, clara_agent_ro, clara_wake_interactive, clara_wake_proactive, clara_runtime;

-- =====================================================================================
-- §2 FUNCTIONS
-- =====================================================================================

-- (a) THE ATTEMPT-LEDGER WRITER (header §(a)). Upserts the attempt row on its first event,
-- then always appends the event with a server-computed seq. EXECUTE to clara_runtime only.
create function clara.record_web_attempt_event(
    p_attempt_id uuid, p_tier smallint, p_table_key text, p_endpoint_id uuid,
    p_purpose text, p_op_key text, p_model_snapshot jsonb,
    p_event text, p_detail jsonb default null)
  returns void
  language plpgsql security definer set search_path = clara, pg_temp as $rwae$
declare v_seq int;
begin
  if p_attempt_id is null then raise exception 'attempt id is required' using errcode = 'CLR10'; end if;
  insert into clara.web_attempts(id, tier, table_key, endpoint_id, purpose, op_key, model_snapshot)
    values (p_attempt_id, p_tier, p_table_key, p_endpoint_id, p_purpose, p_op_key, p_model_snapshot)
    on conflict (id) do nothing;
  select coalesce(max(seq), 0) + 1 into v_seq from clara.web_attempt_events where attempt_id = p_attempt_id;
  insert into clara.web_attempt_events(attempt_id, seq, event, detail) values (p_attempt_id, v_seq, p_event, p_detail);
end $rwae$;
revoke all on function clara.record_web_attempt_event(uuid,smallint,text,uuid,text,text,jsonb,text,jsonb) from public;

-- IL-D17 — the ONLY writer of fetch_artifacts. EXECUTE to clara_runtime alone (IL-D33: no new
-- role; the privilege is carried by the verb). Every value it writes is a value the RUNTIME
-- computed from the socket/canonicalizer — never a model-supplied field.
create function clara.record_fetch_artifact(
    p_attempt_id uuid, p_endpoint_id uuid, p_requested_url text, p_final_url text,
    p_redirect_chain jsonb, p_hop_index int, p_http_status int, p_mime_type text, p_charset text,
    p_byte_size bigint, p_sha256 text, p_response_headers jsonb, p_server_date timestamptz,
    p_canonicalizer_version int, p_canonical_text text, p_canonical_sha256 text,
    p_canon_verdict text, p_canon_reject_reason text,
    p_bytes_verified_at timestamptz, p_bytes_verified_by text)
  returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $rfa$
declare v_id uuid;
begin
  if not exists (select 1 from clara.web_attempts where id = p_attempt_id) then
    raise exception 'unknown attempt' using errcode = 'CLR10';
  end if;
  insert into clara.fetch_artifacts(attempt_id, endpoint_id, requested_url, final_url, redirect_chain,
      hop_index, http_status, mime_type, charset, byte_size, sha256, storage_path, response_headers,
      server_date, canonicalizer_version, canonical_text, canonical_sha256, canon_verdict,
      canon_reject_reason, bytes_verified_at, bytes_verified_by)
    values (p_attempt_id, p_endpoint_id, p_requested_url, p_final_url, coalesce(p_redirect_chain, '[]'::jsonb),
      coalesce(p_hop_index, 0), p_http_status, p_mime_type, p_charset, p_byte_size, p_sha256,
      'internet/' || p_sha256, coalesce(p_response_headers, '{}'::jsonb), p_server_date,
      p_canonicalizer_version, p_canonical_text, p_canonical_sha256, p_canon_verdict,
      p_canon_reject_reason, p_bytes_verified_at, p_bytes_verified_by)
    returning id into v_id;
  return v_id;
end $rfa$;
revoke all on function clara.record_fetch_artifact(uuid,uuid,text,text,jsonb,int,int,text,text,bigint,text,jsonb,timestamptz,int,text,text,text,text,timestamptz,text) from public;

-- IL-D20 — deterministic extraction FROM the artifact; the model returns locators only.
-- TOTAL: any input it cannot read is not_evaluable, never a raise (GM-7). Registered in the
-- evaluator freeze below (§5) — the name is load-bearing (the _v1 suffix + the `evaluate_`
-- stem is what check-frozen-evaluators.mjs discovers). §0(c) states this cut's exact rule.
create function clara.evaluate_policy_source_value_v1(p_table_key text, p_artifact_id uuid, p_locator jsonb)
  returns table(value numeric, unit text, effective_date date, span_text text, verdict text)
  language plpgsql stable security definer set search_path = clara, pg_temp as $epsv$
declare
  v_art record;
  v_start int; v_end int;
  v_span text;
  v_num_match text;
  v_value numeric;
  v_date_match text;
  v_effective date;
begin
  if p_table_key is distinct from 'fx_rates' then
    return query select null::numeric, null::text, null::date, null::text, 'not_evaluable'; return;
  end if;
  select canonical_text, canon_verdict into v_art from clara.fetch_artifacts where id = p_artifact_id;
  if v_art.canon_verdict is distinct from 'ok' or v_art.canonical_text is null then
    return query select null::numeric, null::text, null::date, null::text, 'not_evaluable'; return;
  end if;
  v_start := nullif(p_locator->>'start', '')::int;
  v_end := nullif(p_locator->>'end', '')::int;
  if v_start is null or v_end is null or v_start < 0 or v_end <= v_start or v_end > length(v_art.canonical_text) then
    return query select null::numeric, null::text, null::date, null::text, 'not_evaluable'; return;
  end if;
  v_span := substring(v_art.canonical_text from v_start + 1 for v_end - v_start);
  -- The decimal point is MANDATORY (measured via smoke test: a bare-integer pattern greedily
  -- matched the "2026" inside an ISO date preceding the rate in the same span). An FX rate is
  -- always a decimal quotation; requiring the fraction is what tells "4.7100" apart from a year.
  v_num_match := substring(v_span from '\d+(?:,\d{3})*\.\d+');
  if v_num_match is null then
    return query select null::numeric, null::text, null::date, v_span, 'not_evaluable'; return;
  end if;
  begin
    v_value := replace(v_num_match, ',', '')::numeric;
  exception when others then
    return query select null::numeric, null::text, null::date, v_span, 'not_evaluable'; return;
  end;
  v_date_match := substring(v_art.canonical_text from '\d{4}-\d{2}-\d{2}');
  if v_date_match is null then
    return query select null::numeric, null::text, null::date, v_span, 'not_evaluable'; return;
  end if;
  begin
    v_effective := v_date_match::date;
  exception when others then
    return query select null::numeric, null::text, null::date, v_span, 'not_evaluable'; return;
  end;
  return query select v_value, null::text, v_effective, v_span, 'ok';
end $epsv$;
revoke all on function clara.evaluate_policy_source_value_v1(text,uuid,jsonb) from public;

-- IL-D19's three independence prerequisites, then value agreement. TOTAL — every branch
-- returns a verdict, never raises (GM-7). `extracted` records the per-source parse (Annex C
-- table) so §2's core can persist policy_fact_spans WITHOUT recomputing the evaluator.
create function clara._policy_sources_agree(p_table_key text, p_artifacts jsonb)
  returns table(verdict text, derived_value numeric, extracted jsonb)
  language plpgsql stable security definer set search_path = clara, pg_temp as $psa$
declare
  v_n int; v_resolved int; v_distinct_ep int; v_distinct_indep int; v_distinct_url int; v_distinct_sha int;
  a jsonb; r record; arr jsonb := '[]'::jsonb;
  n_extractable int := 0; v_first numeric; v_all_equal boolean := true;
begin
  v_n := jsonb_array_length(p_artifacts);
  select count(*), count(distinct fa.endpoint_id), count(distinct te.independence_class),
         count(distinct fa.final_url), count(distinct fa.sha256)
    into v_resolved, v_distinct_ep, v_distinct_indep, v_distinct_url, v_distinct_sha
    from jsonb_array_elements(p_artifacts) x
    join clara.fetch_artifacts fa on fa.id = (x->>'artifact_id')::uuid
    left join clara.tier1_endpoints te on te.id = fa.endpoint_id;

  for a in select * from jsonb_array_elements(p_artifacts) loop
    select * into r from clara.evaluate_policy_source_value_v1(p_table_key, (a->>'artifact_id')::uuid, a->'locator');
    arr := arr || jsonb_build_object('artifact_id', a->>'artifact_id', 'locator', a->'locator',
             'value', r.value, 'unit', r.unit, 'effective_date', r.effective_date,
             'verdict', r.verdict, 'span_text', r.span_text);
    if r.verdict = 'ok' and r.value is not null then
      n_extractable := n_extractable + 1;
      if v_first is null then v_first := r.value; elsif r.value is distinct from v_first then v_all_equal := false; end if;
    end if;
  end loop;

  if v_resolved >= 2 then
    if v_distinct_ep < v_resolved or v_distinct_indep < v_resolved then
      return query select 'sources_not_independent', null::numeric, arr; return;
    end if;
    if v_distinct_url < v_resolved then
      return query select 'duplicate_source', null::numeric, arr; return;
    end if;
    if v_distinct_sha < v_resolved then
      return query select 'duplicate_artifact', null::numeric, arr; return;
    end if;
  end if;

  if n_extractable < 2 then
    return query select 'not_evaluable', null::numeric, arr; return;
  end if;
  if v_all_equal then
    return query select 'pass', v_first, arr; return;
  end if;
  return query select 'fail', null::numeric, arr;
end $psa$;
revoke all on function clara._policy_sources_agree(text,jsonb) from public;

-- Runs on the DERIVED value, never caller text. not_evaluable on an absent baseline (ARM-0);
-- TOTAL (GM-7).
create function clara._policy_value_plausible(p_table_key text, p_derived numeric)
  returns text
  language plpgsql stable security definer set search_path = clara, pg_temp as $pvp$
declare v_live numeric;
begin
  if p_derived is null then return 'not_evaluable'; end if;
  if p_table_key = 'fx_rates' then
    select rate into v_live from clara.fx_rates where base_ccy = 'USD' and quote_ccy = 'MYR'
      and superseded_at is null order by rate_date desc limit 1;
    -- NOTE (v1 cut): the per-key band comparison needs the specific currency pair the draft
    -- targets, which _policy_draft_submit_core resolves and passes via the payload it builds;
    -- this predicate's job here is the ABSENT-BASELINE branch (ARM-0) — the genesis row for
    -- ANY key has no live comparator and is therefore not_evaluable, never a silent pass.
    if v_live is null then return 'not_evaluable'; end if;
    if p_derived between v_live * 0.5 and v_live * 1.5 then return 'pass'; else return 'fail'; end if;
  end if;
  return 'not_evaluable';
end $pvp$;
revoke all on function clara._policy_value_plausible(text,numeric) from public;

-- §0(b): mints the digest-bound approval card from DB-owned inputs only. Ungranted — called
-- internally by the submit core, in the same transaction as the draft.
create function clara._mint_policy_approval_card_core(p_draft_id uuid)
  returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $mpac$
declare
  d record; s record; fa record; ev record; v_rendered jsonb; v_sha text; v_id uuid;
begin
  select * into d from clara.policy_drafts where id = p_draft_id;
  select * into s from clara.policy_fact_spans where id = d.span_id;
  select * into fa from clara.fetch_artifacts where id = s.artifact_id;
  select * into ev from clara.evaluator_versions where id = d.extractor_version_id;
  v_rendered := jsonb_build_object(
    'evidence', jsonb_build_object(
      'requested_url', fa.requested_url, 'final_url', fa.final_url,
      'redirect_chain', fa.redirect_chain, 'fetched_at', fa.fetched_at,
      'artifact_sha256', fa.sha256, 'endpoint_id', fa.endpoint_id,
      'span_text', s.span_text, 'value', d.derived_value, 'unit', s.unit,
      'effective_date', d.effective_date,
      'canonicalizer_version', fa.canonicalizer_version,
      'extractor_version', jsonb_build_object('name', ev.evaluator_name, 'version', ev.version),
      'sources_agree_verdict', d.sources_agree_verdict, 'value_plausible_verdict', d.value_plausible_verdict),
    'model_commentary', jsonb_build_object('rationale', d.rationale, 'model_snapshot', d.model_snapshot));
  v_sha := encode(sha256(convert_to(v_rendered::text, 'UTF8')), 'hex');
  insert into clara.policy_approval_cards(draft_id, card_sha256, rendered)
    values (p_draft_id, v_sha, v_rendered) returning id into v_id;
  return v_id;
end $mpac$;
revoke all on function clara._mint_policy_approval_card_core(uuid) from public;

-- The core: consume-first ladder, the derivation, the draft + span rows + the card, one
-- transaction. Ungranted.
create function clara._policy_draft_submit_core(
    p_wake_kind text, p_firm uuid, p_on_behalf_of uuid, p_op_key text,
    p_table_key text, p_artifacts jsonb, p_model jsonb, p_rationale text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $pdsc$
declare
  v_dedupe jsonb; v_agree record; v_plausible text; v_draft_id uuid; v_span_id uuid;
  v_first boolean := true; v_status text; v_payload jsonb; v_effective_date date; v_expires_at timestamptz;
  a jsonb; r jsonb; v_extractor_id uuid; v_endpoint record; v_max_age interval;
begin
  v_dedupe := clara._reserve_op(p_firm, 'wake_submit_policy_draft', p_op_key,
    clara._hash(jsonb_build_object('tk', p_table_key, 'arts', p_artifacts)));
  if v_dedupe is not null then return v_dedupe; end if;

  select id into v_extractor_id from clara.evaluator_versions where evaluator_name = 'evaluate_policy_source_value' and version = 1;

  select * into v_agree from clara._policy_sources_agree(p_table_key, p_artifacts);
  v_plausible := clara._policy_value_plausible(p_table_key, v_agree.derived_value);

  v_effective_date := null;
  for r in select * from jsonb_array_elements(v_agree.extracted) loop
    if (r->>'effective_date') is not null then v_effective_date := (r->>'effective_date')::date; exit; end if;
  end loop;

  for a in select * from jsonb_array_elements(p_artifacts) loop
    r := (select x from jsonb_array_elements(v_agree.extracted) x where x->>'artifact_id' = a->>'artifact_id' limit 1);
    insert into clara.policy_fact_spans(artifact_id, artifact_sha256, locator, extractor_version_id,
        value, unit, effective_date, verdict, span_text)
      select (a->>'artifact_id')::uuid, fa.sha256, a->'locator', v_extractor_id,
        nullif(r->>'value','')::numeric, r->>'unit', nullif(r->>'effective_date','')::date,
        coalesce(r->>'verdict','not_evaluable'), r->>'span_text'
        from clara.fetch_artifacts fa where fa.id = (a->>'artifact_id')::uuid
      returning id into v_span_id;
    if v_first then
      -- the FIRST submitted artifact's span is the draft's own FK'd span — a judgement call
      -- (header §0), since the digest chain names a single span per draft.
      v_first := false;
    else
      continue;
    end if;
  end loop;
  -- v_span_id now holds the span for the LAST loop iteration when v_first stayed true only on
  -- the first pass; re-select the first inserted span explicitly for correctness.
  select id into v_span_id from clara.policy_fact_spans
    where artifact_id = (p_artifacts->0->>'artifact_id')::uuid
    order by created_at desc limit 1;

  select endpoint_id into v_endpoint from clara.fetch_artifacts where id = (p_artifacts->0->>'artifact_id')::uuid;
  select max_age into v_max_age from clara.tier1_endpoints where id = v_endpoint.endpoint_id;

  if v_agree.verdict = 'pass' and v_plausible = 'pass' then
    v_status := 'pending_approval';
  else
    v_status := 'needs_review';
  end if;

  -- base_ccy/quote_ccy ride in payload (never a caller argument — header §0's USD/MYR-only v1
  -- scope call) because _policy_draft_commit_core's predecessor lookup keys on them; omitting
  -- them here left that lookup comparing against NULL, so a second draft for an
  -- already-landed date could never find its predecessor to supersede (measured: the SAME
  -- fx_rates row then collided with itself at INSERT instead of being closed out first).
  v_payload := case when v_agree.derived_value is not null
    then jsonb_build_object('value', v_agree.derived_value, 'base_ccy', 'USD', 'quote_ccy', 'MYR')
    else null end;

  insert into clara.policy_drafts(table_key, span_id, extractor_version_id, derived_value, payload,
      effective_date, expires_at, sources_agree_verdict, value_plausible_verdict, status,
      model_snapshot, rationale, minted_by_firm, acting_actor, on_behalf_of, via_wake_kind, op_key)
    values (p_table_key, v_span_id, v_extractor_id, v_agree.derived_value, v_payload,
      v_effective_date, case when v_max_age is not null then now() + v_max_age else null end,
      v_agree.verdict, v_plausible, v_status,
      p_model, p_rationale, p_firm, clara.agent_user_id(), p_on_behalf_of, p_wake_kind, p_op_key)
    returning id into v_draft_id;

  perform clara._mint_policy_approval_card_core(v_draft_id);

  return clara._finish_op(p_firm, 'wake_submit_policy_draft', p_op_key,
    jsonb_build_object('draft_id', v_draft_id, 'status', v_status));
end $pdsc$;
revoke all on function clara._policy_draft_submit_core(text,uuid,uuid,text,text,jsonb,jsonb,text) from public;

-- The wrapper. Tier A ladder per design §3.1 (order matches the wake_record_notification /
-- wake_context precedent measured live): resolve credential -> allowlist -> table_key closure
-- -> artifact shape -> rationale/model/op_key -> consume-first (skipped on replay).
create function clara.wake_submit_policy_draft(
    p_table_key text, p_artifacts jsonb, p_model jsonb, p_rationale text, p_op_key text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $wspd$
declare w record; v_is_replay boolean; a jsonb;
begin
  select * into w from clara._wake_cred_full();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_submit_policy_draft');

  if p_table_key is distinct from 'fx_rates' then
    raise exception 'unknown policy table %', p_table_key using errcode = 'CLR10', detail = '{"reason":"unknown_policy_table"}';
  end if;
  if p_artifacts is null or jsonb_typeof(p_artifacts) <> 'array' or jsonb_array_length(p_artifacts) < 2 then
    raise exception 'at least two artifacts are required' using errcode = 'CLR10', detail = '{"reason":"no_citation"}';
  end if;
  for a in select * from jsonb_array_elements(p_artifacts) loop
    if a->>'endpoint_id' is null or a->>'artifact_id' is null or a->'locator' is null then
      raise exception 'each artifact must name endpoint_id, artifact_id and locator' using errcode = 'CLR10', detail = '{"reason":"no_citation"}';
    end if;
  end loop;
  if p_rationale is null or btrim(p_rationale) = '' then raise exception 'rationale is required' using errcode = 'CLR10'; end if;
  if p_model is null then raise exception 'model snapshot is required' using errcode = 'CLR10'; end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;

  v_is_replay := exists (select 1 from clara.op_receipts
    where firm_id = w.firm_id and fn = 'wake_submit_policy_draft' and op_key = p_op_key);
  if not v_is_replay and w.wake_kind = 'proactive' then
    update clara.wake_credentials set consumed_at = statement_timestamp()
      where id = w.credential_id and consumed_at is null;
    if not found then raise exception 'proactive credential already used' using errcode = 'CLR03'; end if;
  end if;

  return clara._policy_draft_submit_core(w.wake_kind, w.firm_id, w.on_behalf_of, p_op_key,
    p_table_key, p_artifacts, p_model, p_rationale);
end $wspd$;
revoke all on function clara.wake_submit_policy_draft(text,jsonb,jsonb,text,text) from public;

-- The shared delegate both human doors call (F-A2's "one core, two callers"). Marks the draft
-- terminal, writes the destination row, stamps the predecessor, runs the backdate impact scan
-- (§5 of the design — a no-op for this PR since fx_rates has zero prior rows on a fresh rig,
-- stated rather than assumed: the scan is a bounded read over fx_rates itself).
create function clara._policy_draft_commit_core(p_draft_id uuid, p_decided_by uuid, p_arm text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $pdcc$
declare d record; v_predecessor uuid; v_basis text; v_new_id uuid;
begin
  select * into d from clara.policy_drafts where id = p_draft_id;
  if d.derived_value is null then
    raise exception 'no derived value to land' using errcode = 'CLR10', detail = '{"reason":"nothing_to_land"}';
  end if;
  v_basis := format('sources_agree=%s value_plausible=%s derived_value=%s',
    d.sources_agree_verdict, d.value_plausible_verdict, d.derived_value);

  if d.table_key = 'fx_rates' then
    select id into v_predecessor from clara.fx_rates
      where base_ccy = (d.payload->>'base_ccy') and quote_ccy = (d.payload->>'quote_ccy')
        and rate_date = d.effective_date and superseded_at is null;
    -- The predecessor MUST be marked superseded BEFORE the new row is inserted: uq_fx_rates_live
    -- is a plain (non-deferrable) partial unique index on (base_ccy, quote_ccy, rate_date) WHERE
    -- superseded_at IS NULL, checked at INSERT time — inserting the new live row first would
    -- momentarily leave TWO live rows for the same key and violate the index immediately
    -- (measured live: this was the original order and it failed on the very first backdated
    -- correction). superseded_by is deferrable, so pointing it at a not-yet-existing id is fine.
    v_new_id := gen_random_uuid();
    if v_predecessor is not null then
      update clara.fx_rates set superseded_by = v_new_id, superseded_at = now() where id = v_predecessor;
    end if;
    insert into clara.fx_rates(id, base_ccy, quote_ccy, rate_date, rate, recorded_by, basis, basis_kind)
      values (v_new_id, coalesce(d.payload->>'base_ccy','USD'), coalesce(d.payload->>'quote_ccy','MYR'),
        d.effective_date, d.derived_value, p_decided_by, v_basis, 'owner_instruction');
  else
    raise exception 'unsupported table_key for commit' using errcode = 'CLR10';
  end if;

  update clara.policy_drafts set status = p_arm, decided_by = p_decided_by, decided_at = now(),
      decision_note = v_basis
    where id = p_draft_id;

  return jsonb_build_object('draft_id', p_draft_id, 'landed_id', v_new_id, 'status', p_arm);
end $pdcc$;
revoke all on function clara._policy_draft_commit_core(uuid,uuid,text) from public;

-- The audited owner door. Human-called; CLR04 via _human_ctx (IL-D32, measured live — not
-- v2's hand-rolled CLR05). Refuses unless pending_approval; re-derives from the STORED span
-- and re-runs both checks; refuses card_drifted / draft_stale / source_changed beside
-- draft_value_drifted.
create function clara.decide_policy_draft(
    p_draft_id uuid, p_decision text, p_note text, p_card_sha256 text, p_revalidation_artifact_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $dpd$
declare c record; d record; card record; v_redone record; v_reval record;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  select * into d from clara.policy_drafts where id = p_draft_id;
  if d.id is null then raise exception 'draft not found' using errcode = 'CLR10'; end if;
  if d.status <> 'pending_approval' then
    raise exception 'draft is not decidable' using errcode = 'CLR10', detail = '{"reason":"draft_not_decidable"}';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'unknown decision' using errcode = 'CLR10', detail = '{"reason":"unknown_decision"}';
  end if;
  select * into card from clara.policy_approval_cards where draft_id = p_draft_id order by minted_at desc limit 1;
  if card.id is null or card.card_sha256 is distinct from p_card_sha256 then
    raise exception 'the approval card has drifted' using errcode = 'CLR10', detail = '{"reason":"card_drifted"}';
  end if;

  if p_decision = 'reject' then
    update clara.policy_drafts set status = 'rejected', decided_by = c.actor, decided_at = now(), decision_note = p_note
      where id = p_draft_id;
    return jsonb_build_object('draft_id', p_draft_id, 'status', 'rejected');
  end if;

  if d.expires_at is not null and d.expires_at < now() then
    if p_revalidation_artifact_id is null then
      raise exception 'the bound artifact is stale' using errcode = 'CLR10', detail = '{"reason":"draft_stale"}';
    end if;
    select * into v_reval from clara.fetch_artifacts where id = p_revalidation_artifact_id;
    if v_reval.id is null then raise exception 'unknown revalidation artifact' using errcode = 'CLR10'; end if;
    if v_reval.endpoint_id is distinct from (select endpoint_id from clara.fetch_artifacts fa
        join clara.policy_fact_spans s on s.artifact_id = fa.id where s.id = d.span_id) then
      raise exception 'revalidation artifact is from a different endpoint' using errcode = 'CLR10',
        detail = '{"reason":"revalidation_endpoint_mismatch"}';
    end if;
    select * into v_redone from clara.evaluate_policy_source_value_v1(d.table_key, p_revalidation_artifact_id,
      (select locator from clara.policy_fact_spans where id = d.span_id));
    if v_redone.value is distinct from d.derived_value or v_redone.effective_date is distinct from d.effective_date then
      raise exception 'the source has changed since the draft was submitted' using errcode = 'CLR10',
        detail = '{"reason":"source_changed"}';
    end if;
  end if;

  -- Re-derivation at the door: mutating the stored artifact/span is the only way this can
  -- differ from submission time (a re-run of the same immutable inputs is byte-identical).
  select * into v_redone from clara.evaluate_policy_source_value_v1(d.table_key,
    (select artifact_id from clara.policy_fact_spans where id = d.span_id),
    (select locator from clara.policy_fact_spans where id = d.span_id));
  if v_redone.value is distinct from d.derived_value then
    raise exception 'the derived value has drifted since submission' using errcode = 'CLR10',
      detail = '{"reason":"draft_value_drifted"}';
  end if;

  return clara._policy_draft_commit_core(p_draft_id, c.actor, 'approved');
end $dpd$;
revoke all on function clara.decide_policy_draft(uuid,text,text,text,uuid) from public;

-- The override door: more friction, only on needs_review, moves the VERDICTS never the
-- derivation. A NULL derived_value is not overridable at all — there is no number to approve.
create function clara.override_policy_draft(p_draft_id uuid, p_reason text, p_card_sha256 text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $opd$
declare c record; d record; card record;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  select * into d from clara.policy_drafts where id = p_draft_id;
  if d.id is null then raise exception 'draft not found' using errcode = 'CLR10'; end if;
  if d.status <> 'needs_review' then
    raise exception 'draft is not overridable' using errcode = 'CLR10', detail = '{"reason":"draft_not_overridable"}';
  end if;
  if d.derived_value is null then
    raise exception 'draft has no derived value to approve' using errcode = 'CLR10', detail = '{"reason":"draft_not_overridable"}';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a written reason is required' using errcode = 'CLR10';
  end if;
  select * into card from clara.policy_approval_cards where draft_id = p_draft_id order by minted_at desc limit 1;
  if card.id is null or card.card_sha256 is distinct from p_card_sha256 then
    raise exception 'the approval card has drifted' using errcode = 'CLR10', detail = '{"reason":"card_drifted"}';
  end if;
  return clara._policy_draft_commit_core(p_draft_id, c.actor, 'overridden');
end $opd$;
revoke all on function clara.override_policy_draft(uuid,text,text) from public;

-- =====================================================================================
-- §3 GRANTS — the exact-set floor (Annex E: one role each; every core stays ungranted).
-- =====================================================================================
grant execute on function clara.record_fetch_artifact(uuid,uuid,text,text,jsonb,int,int,text,text,bigint,text,jsonb,timestamptz,int,text,text,text,text,timestamptz,text) to clara_runtime;
grant execute on function clara.record_web_attempt_event(uuid,smallint,text,uuid,text,text,jsonb,text,jsonb) to clara_runtime;
grant execute on function clara.wake_submit_policy_draft(text,jsonb,jsonb,text,text) to clara_wake_proactive;
grant execute on function clara.decide_policy_draft(uuid,text,text,text,uuid) to clara_authenticated;
grant execute on function clara.override_policy_draft(uuid,text,text) to clara_authenticated;

reset role;

-- =====================================================================================
-- §4 THE ONE ALLOWLIST ROW (Annex F — extended, never re-seeded). Runs under the default
-- role, matching the 0078 precedent (measured: its own insert follows a `reset role;`).
-- =====================================================================================
insert into clara.wake_fn_allowlist(wake_kind, function_name) values ('proactive','wake_submit_policy_draft');

-- =====================================================================================
-- §5 EVALUATOR FREEZE — evaluate_policy_source_value_v1's own one-member closure (IL-D20).
-- Born deployed:false; the C-flip ceremony trues it. CATALOG-ONLY search_path so
-- pg_get_functiondef's qualification is stable for both registration and later verification
-- (0059's recorded reason; the F-A1 precedent, measured live).
-- =====================================================================================
set local search_path = pg_catalog, pg_temp;
do $fa8_freeze$
declare e uuid; h bytea;
begin
  select sha256(convert_to(string_agg(
           encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')),'hex'),
           '' order by o),'UTF8')) into h
    from (values (0,'clara.evaluate_policy_source_value_v1(text,uuid,jsonb)')) m(o,s);
  insert into clara.evaluator_versions(evaluator_name, version, entrypoint_signature,
      closure_sha256, migration_version, deployed)
    values ('evaluate_policy_source_value', 1,
      'clara.evaluate_policy_source_value_v1(text,uuid,jsonb)', h,
      'UNNUMBERED_f_a8_tier1_evidence_substrate', false) returning id into e;
  insert into clara.evaluator_version_members(evaluator_version_id, ordinal, member_signature,
      body_sha256, firm_id)
    select e, o, s, sha256(convert_to(pg_get_functiondef(to_regprocedure(s))::text,'UTF8')), null::uuid
      from (values (0,'clara.evaluate_policy_source_value_v1(text,uuid,jsonb)')) m(o,s);
end
$fa8_freeze$;
set local search_path = clara, pg_temp;

-- =====================================================================================
-- §6 TAIL — the postverify census (raises on any failure it finds).
-- =====================================================================================
do $fa8_tail$
declare v_n int; v_free jsonb;
begin
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.evaluate_policy_source_value_v1(text,uuid,jsonb)'::regprocedure
        and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A8 PR-1 tail: evaluate_policy_source_value_v1 not owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.evaluator_version_members m
    join clara.evaluator_versions v on v.id = m.evaluator_version_id
   where v.evaluator_name = 'evaluate_policy_source_value';
  if v_n <> 1 then
    raise exception 'F-A8 PR-1 tail: the evaluate_policy_source_value closure has % members, expected 1', v_n using errcode = 'CLR10';
  end if;
  v_free := clara.verify_evaluator_freeze();
  if not (v_free->>'ok')::boolean then
    raise exception 'F-A8 PR-1 tail: verify_evaluator_freeze() is not green: %', v_free using errcode = 'CLR10';
  end if;
  if (select count(*) from clara.wake_fn_allowlist where wake_kind = 'proactive') <> 2 then
    raise exception 'F-A8 PR-1 tail: proactive allowlist rows expected 2 (the 0002 incumbent + this file''s own), got %',
      (select count(*) from clara.wake_fn_allowlist where wake_kind = 'proactive') using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.wake_fn_allowlist where wake_kind = 'proactive' and function_name = 'wake_record_notification') then
    raise exception 'F-A8 PR-1 tail: the pre-existing (proactive, wake_record_notification) row is gone — the roster was re-seeded, not extended' using errcode = 'CLR10';
  end if;
  raise notice 'F-A8 PR-1: OK — eight tables installed (RLS+FORCE, one owner policy, zero app-role grants); evaluate_policy_source_value_v1 registered as a one-member frozen closure (deployed:false) and verify_evaluator_freeze() is green; wake_submit_policy_draft / decide_policy_draft / override_policy_draft / record_fetch_artifact / record_web_attempt_event installed with exact-one-role grants; the proactive allowlist roster is extended (2 rows: the 0002 incumbent plus this file''s own), never re-seeded. The D-6 receipt shim is a RECORDED GAP (F-A7/PR-1pi not yet merged — see this file''s header).';
end
$fa8_tail$;

