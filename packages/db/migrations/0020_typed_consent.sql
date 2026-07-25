-- 0020_typed_consent — TYPED EGRESS CONSENT + DISPATCH AUTHORIZATION (WB-R23 · WB-R24(iii)).
--
-- Authority: docs/plan/wave-b-migration-0020-design.md (v1.0, RATIFIED). Scope is fixed
-- by that contract and is neither widened nor narrowed here.
--
-- WHAT THIS DELIVERS, section by section against the contract:
--   §1  clara.client_egress_purpose_consents — a SEPARATE FORCE-RLS relation. The legacy
--       clara.client_egress_consents is load-bearing for a PURPOSE-BLIND gate (the 0015
--       invoice-facts predicate accepts ANY live row for the client, 0015:3361-3366), and
--       its revoker selects the live row with no purpose / no ordering / no STRICT
--       (0014:155-156). A typed row on that table would therefore (a) also authorize
--       invoice-facts egress and (b) make revocation nondeterministic. Typed consent gets
--       its own relation; purpose is NON-NULL and closed to 'wiki_synthesis'; evidence is
--       MANDATORY; at most one live consent per (client, purpose).
--   §2  clara.client_egress_purpose_activations — the POSITIVE, owner-only gate, bound by
--       a COMPOSITE FK to the exact typed consent (id, firm, client, purpose), so an
--       activation structurally cannot name another firm's / client's / purpose's consent.
--       A revoke-and-regrant mints a new consent id that no existing activation names, so
--       re-attestation ALONE never re-authorizes dispatch.
--   §3  clara.egress_dispatch_authorizations + the two-phase boundary:
--       clara.prepare_egress_dispatch (plan time; verdict granted|unknown + an OPAQUE
--       authorization id and nothing else) and clara.consume_egress_dispatch (the DISPATCH
--       LINEARIZATION POINT; atomically re-checks that the exact consent AND activation are
--       still live, then terminally consumes). TTL 120 seconds, time-derived, no sweep job.
--   §4  Four purpose-discriminated consent event types. The evidence document rides in the
--       event PAYLOAD, never the typed document_id column (the 0014 rule: a consent artifact
--       must not trip the filing-history provenance trigger).
--   §5  clara.resolve_document_client (unresolved | unique | ambiguous; a client id ONLY on
--       unique; a UNIFORM not-found across foreign-firm / nonexistent / bytes-unverified /
--       zero-filing) and clara.resolve_and_ingest_wiki_source — one SERIALIZED operation that
--       re-decides uniqueness at EFFECT time under a filing-topology lock pair and then goes
--       through the audited writer. Plus the re-drive gate (a prior document.classified).
--   §6  Legacy byte-identity: NOTHING in the legacy consent surface or the invoice-facts
--       claim body is touched. The tail pins their normalized sources by exact digest.
--   §7  The owner-floored typed RPCs (classify-evidence / grant / activate / deactivate /
--       revoke). classify_consent_evidence_document is the 2026-07-25 ratified amendment
--       (ratchet R1-F3): without it there was no owner path to stamp document_kind=
--       'consent_evidence' that did not ALSO grant purpose-blind legacy egress, so a client
--       who consented only to wiki synthesis could not be onboarded as designed.
--   §8  The in-transaction fail-closed tail battery. One transaction; any failure aborts.
--
-- RATIFIED CONTRACT AMENDMENTS carried by this file (2026-07-25, cross-model ratchet R1):
--   * §3.4 consume_egress_dispatch takes SIX arguments and re-verifies the dispatch it is
--     being used for (firm, client, purpose, event_seq, event_type). v1.0's two-argument form
--     made §3.2's "binds" audit-only — see the §3.4 block comment.
--   * §3.2/§3.4 time is WALL CLOCK (clock_timestamp), never transaction time.
--   * §7.1 gains classify_consent_evidence_document (above).
--   * §7.1 activate/deactivate/revoke verify firm membership FIRST (CLR11) and never lock a
--     foreign firm's state row.
--   * §6's byte-identity pins hash EXACT prosrc with SHA-256 and add legacy ACL + relation
--     structure pins.
--   * §8's "three partial unique indexes" is an erratum: two uniques + one non-unique
--     open-authorization index.
--
-- SHIPS DARK for MODEL SYNTHESIS, and only that (contract §10.1). With zero typed consents
-- and zero activations — asserted empirically at the end of this apply — every verdict is
-- 'unknown', so the model-egress path is externally byte-equivalent to today. What DOES
-- change deliberately: a uniquely filed document.classified now publishes deterministically,
-- ambiguity gets its own receipt token, legacy consent events stop touching wiki
-- authorization state, and two re-drive subscriptions appear. That is WB-R23(3), ruled.
--
-- ---------------------------------------------------------------------------------------
-- BUILD-TIME FINDING — 0019's §9 CLOSED-SET SCAN ALSO FOLLOWS CALL EDGES.
--
-- The contract's *Dependencies on 0019* row for §9 states that the pinned design keeps
-- 0019's clean-end-state scan passing "by calling the audited wiki writers ... rather than
-- touching the seven wiki relations by name", and that a whitelist addition is needed only
-- "if any 0020 function's normalized source does reference one of those relations".
--
-- RE-GROUNDED AT SOURCE (0019:1104-1105, 1494-1519): the scan fails a non-whitelisted
-- clara function whose prosrc matches EITHER the seven-relation regex OR a CALL-EDGE regex
-- naming publish_wiki_page_version | _publish_wiki_page_version_core |
-- record_wiki_source_ingest | retire_wiki_page | set_wiki_synthesis_hold |
-- clear_wiki_synthesis_hold | get_wiki_page | list_wiki_pages | get_context_pack |
-- run_client_lint | run_lint_all | mark_wiki_citations_stale. Calling an audited writer
-- therefore does NOT avoid the scan — it is exactly what the call-edge half looks for.
--
-- DISPOSITION (no mutation of 0019, whose file checksum locks on its own earlier deploy):
--   * 0019's tail runs ONCE, inside 0019's apply transaction. It does not re-run when 0020
--     applies, so nothing about this migration can retro-fail a deployed 0019.
--   * 0020 ships its OWN re-run of the identical scan (§8) over the LIVE catalog, with the
--     whitelist EXTENDED by exactly the four 0020 functions that legitimately call an
--     audited wiki writer. That assertion is strictly stronger than the contract's, because
--     it ALSO proves 0020 introduced no NEW relation-naming function: every 0020 function is
--     asserted to match the call-edge regex only, and the seven-relation regex NEVER.
--   * NO 0020 function names any of the seven wiki relations. The wiki data boundary
--     (WB-R21) is untouched: 0020 reaches wiki state only through record_wiki_source_ingest,
--     set_wiki_synthesis_hold and clear_wiki_synthesis_hold — the cardinal invariant
--     (never hand-write a row when an audited function exists).
-- ---------------------------------------------------------------------------------------
--
-- Structure mirrors 0017/0018/0019: every DDL + function body runs under
-- `set role clara_fn_owner` (the 0014:46 idiom — the definer must OWN the functions so
-- SECURITY DEFINER keeps its authority and so FORCE RLS resolves against the single
-- clara_fn_owner policy); the event taxonomy, grants and the tail run after `reset role`.
-- Every functional tail probe runs inside a forced-rollback subtransaction — a probe must
-- never commit a fixture consent, activation, authorization, audit or event row. One
-- transaction (the runner supplies it); any failure aborts the apply.
--
-- No workflow-body change; ZERO freeze-manifest implication (the wiki-projection consumer is
-- a startWorld runtime plugin, not a frozen WDK workflow). Validate on a throwaway Postgres
-- only. 0020 introduces NO new error codes: CLR03/CLR04 (owner floor, via _human_ctx),
-- CLR08 (immutability), CLR10 (bad request; also _reserve_op arg mismatch, 0004:57),
-- CLR11 (not-found-in-your-firm), CLR28 (egress refusal), CLR32 (wiki, propagated).

set role clara_fn_owner;

-- =====================================================================
-- §1.2 THE TYPED-CONSENT RELATION.
--
-- The 0011 consent-table shape (0011:910-934) plus a mandatory non-null purpose. Two
-- composite uniques: (id,firm_id,client_id) mirrors 0011:921, and
-- (id,firm_id,client_id,purpose) exists SOLELY so §2's activation can carry a composite FK
-- that structurally forces activation.purpose = consent.purpose.
--
-- evidence_document_id is NOT NULL here — the deliberate inverse of 0012(A). 0012 itself
-- described the owner-declaration path as a weakening of the PDPA/MIA evidence control taken
-- over the orchestrator's recommendation, with the evidence "PENDING, not waived"
-- (0012:5-19); ADR-024 then built 0014 so a full-provenance citation is SAFE. Typed consent
-- starts where ADR-024 ended. The 0012 null-document path remains available on the LEGACY
-- table, untouched.
--
-- No NULLS NOT DISTINCT is needed anywhere: purpose is non-null by CHECK.
-- =====================================================================
create table clara.client_egress_purpose_consents (
  id                   uuid primary key default gen_random_uuid(),
  firm_id              uuid not null,
  client_id            uuid not null,
  purpose              text not null check (purpose in ('wiki_synthesis')),
  scope_note           text not null check (btrim(scope_note)<>''),
  evidence_document_id uuid not null,
  granted_by           uuid not null references clara.users(id),
  granted_at           timestamptz not null default now(),
  revoked_by           uuid references clara.users(id),
  revoked_at           timestamptz,
  revoke_reason        text,
  unique(id,firm_id,client_id),
  unique(id,firm_id,client_id,purpose),
  constraint fk_client_egress_purpose_consents_client foreign key (client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_client_egress_purpose_consents_evidence foreign key
    (evidence_document_id,firm_id) references clara.documents(id,firm_id),
  constraint ck_client_egress_purpose_consents_revocation check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null
      and nullif(btrim(revoke_reason),'') is not null))
);
-- At most ONE live typed consent per (client, purpose). This index is 0020's own; the legacy
-- uq_client_egress_consents_one_live is untouched (§6).
create unique index uq_client_egress_purpose_consents_one_live
  on clara.client_egress_purpose_consents(client_id,purpose) where revoked_at is null;
create index ix_client_egress_purpose_consents_firm_live
  on clara.client_egress_purpose_consents(firm_id,client_id,purpose) where revoked_at is null;

-- =====================================================================
-- §2.2 THE ACTIVATION RELATION — the positive, owner-only gate.
--
-- Why a separate positive record at all (§2.1, verified in source): the wiki hold is NOT a
-- gate. clear_wiki_synthesis_hold is granted to clara_runtime, not an owner JWT
-- (0017:5126-5134; the clear at 0017:5129); the synthesis planner never reads the hold
-- before calling the model; the hold's only structural effect is at PUBLICATION
-- (0017:2040-2043) — i.e. after client content has already reached the model; and the
-- consumer's legacy lane clears the hold on a null-purpose egress.consent_granted, so an
-- invoice-facts consent silently released a wiki control. "Grant then clear the hold" is not
-- an authorization. This record is.
--
-- The COMPOSITE FK (consent_id, firm_id, client_id, purpose) -> the typed consent's
-- (id, firm_id, client_id, purpose) is the version-match law's structural half (§2.3).
-- =====================================================================
create table clara.client_egress_purpose_activations (
  id                  uuid primary key default gen_random_uuid(),
  firm_id             uuid not null,
  client_id           uuid not null,
  purpose             text not null check (purpose in ('wiki_synthesis')),
  consent_id          uuid not null,
  activated_by        uuid not null references clara.users(id),
  activated_at        timestamptz not null default now(),
  deactivated_by      uuid references clara.users(id),
  deactivated_at      timestamptz,
  deactivation_reason text,
  unique(id,firm_id,client_id,purpose),
  constraint fk_client_egress_purpose_activations_client foreign key (client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_client_egress_purpose_activations_consent foreign key
    (consent_id,firm_id,client_id,purpose)
    references clara.client_egress_purpose_consents(id,firm_id,client_id,purpose),
  constraint ck_client_egress_purpose_activations_deactivation check (
    (deactivated_at is null and deactivated_by is null and deactivation_reason is null)
    or (deactivated_at is not null and deactivated_by is not null
      and nullif(btrim(deactivation_reason),'') is not null))
);
create unique index uq_client_egress_purpose_activations_one_live
  on clara.client_egress_purpose_activations(client_id,purpose) where deactivated_at is null;
create index ix_client_egress_purpose_activations_consent
  on clara.client_egress_purpose_activations(consent_id) where deactivated_at is null;
-- RATCHET R1-F6: a FIRM-LEADING partial index on the live-activation lookup, mirroring the
-- typed consents' ix_..._firm_live. prepare_egress_dispatch probes
-- (firm_id, client_id, purpose) where deactivated_at is null; without this the planner drives
-- the (client_id, purpose) one-live unique and then filters firm_id, so a foreign probe of a
-- LIT client and a probe of a nonexistent client do measurably different work. This removes
-- the coarsest of those differences. It does NOT make the function constant-time — see the
-- honest timing note in §3.3 of the contract; SQL cannot substantiate an absolute claim here.
create index ix_client_egress_purpose_activations_firm_live
  on clara.client_egress_purpose_activations(firm_id,client_id,purpose)
  where deactivated_at is null;

-- =====================================================================
-- §3.2 THE DISPATCH-AUTHORIZATION RELATION.
--
-- One row per PREPARED dispatch. `id` is the ONLY value that ever leaves the database, and
-- it is opaque: it encodes nothing about the consent, the evidence, the grant time or the
-- withdrawal history.
--
-- document_sha256 is WB-R23's "+ document hash where applicable" slot. Counterparty
-- synthesis is not document-tied, so the CHECK forces it null for 'wiki_synthesis'; the
-- column exists so a future document-tied purpose binds STRUCTURALLY rather than by
-- convention.
--
-- Append-only apart from the two terminal transitions (consumed / invalidated), enforced by
-- trigger. There is no reuse path and no "peek" variant.
-- =====================================================================
create table clara.egress_dispatch_authorizations (
  id                 uuid primary key default gen_random_uuid(),
  firm_id            uuid not null,
  client_id          uuid not null,
  purpose            text not null check (purpose in ('wiki_synthesis')),
  consent_id         uuid not null,
  activation_id      uuid not null,
  event_seq          bigint not null,
  event_type         text not null check (btrim(event_type)<>''),
  document_sha256    text check (document_sha256 ~ '^[0-9a-f]{64}$'),
  issued_at          timestamptz not null default now(),
  expires_at         timestamptz not null,
  consumed_at        timestamptz,
  invalidated_at     timestamptz,
  invalidated_reason text,
  constraint ck_egress_dispatch_authorizations_doc_sha check (
    purpose <> 'wiki_synthesis' or document_sha256 is null),
  constraint ck_egress_dispatch_authorizations_one_terminal check (
    consumed_at is null or invalidated_at is null),
  constraint ck_egress_dispatch_authorizations_invalidation check (
    (invalidated_at is null and invalidated_reason is null)
    or (invalidated_at is not null
      and nullif(btrim(invalidated_reason),'') is not null)),
  constraint fk_egress_dispatch_authorizations_client foreign key (client_id,firm_id)
    references clara.clients(id,firm_id),
  constraint fk_egress_dispatch_authorizations_consent foreign key
    (consent_id,firm_id,client_id,purpose)
    references clara.client_egress_purpose_consents(id,firm_id,client_id,purpose),
  constraint fk_egress_dispatch_authorizations_activation foreign key
    (activation_id,firm_id,client_id,purpose)
    references clara.client_egress_purpose_activations(id,firm_id,client_id,purpose)
);
-- §3.5's withdrawal sweep drives on this: every OUTSTANDING authorization for a consent.
create index ix_egress_dispatch_authorizations_open
  on clara.egress_dispatch_authorizations(consent_id)
  where consumed_at is null and invalidated_at is null;

-- =====================================================================
-- §5.4 RE-DRIVE SUPPORT INDEX (additive, outside the §6 closed set).
--
-- resolve_and_ingest_wiki_source gates publication on a PRIOR document.classified event for
-- the document. clara.domain_events carries only (firm_id, seq) and (id) indexes, so that
-- existence probe would be a full relation scan on EVERY document.filed /
-- document.filing_retired re-drive. A partial index keyed on the classified type keeps the
-- probe an index lookup and costs one predicate evaluation per event append.
-- =====================================================================
create index ix_domain_events_classified_document
  on clara.domain_events(document_id)
  where event_type='document.classified' and document_id is not null;

-- =====================================================================
-- IMMUTABILITY / NO-TRUNCATE TRIGGERS — the 0011 _tf_egress_consent_update shape
-- (0011:1048-1060) applied to all three relations. A typed consent is INSERT-once /
-- REVOKE-once; an activation is INSERT-once / DEACTIVATE-once; an authorization is
-- INSERT-once and takes at most ONE terminal transition.
-- =====================================================================
create function clara._tf_egress_purpose_consent_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then
    raise exception 'typed egress consents are historical' using errcode='CLR08';
  end if;
  if old.revoked_at is not null or new.revoked_at is null
     or (to_jsonb(new)-array['revoked_by','revoked_at','revoke_reason']) is distinct from
        (to_jsonb(old)-array['revoked_by','revoked_at','revoke_reason']) then
    raise exception 'typed egress consent permits only one revocation' using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_client_egress_purpose_consents_update before update or delete
  on clara.client_egress_purpose_consents
  for each row execute function clara._tf_egress_purpose_consent_update();
create trigger t_client_egress_purpose_consents_no_truncate before truncate
  on clara.client_egress_purpose_consents
  for each statement execute function clara._tf_no_truncate();

create function clara._tf_egress_purpose_activation_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then
    raise exception 'typed egress activations are historical' using errcode='CLR08';
  end if;
  if old.deactivated_at is not null or new.deactivated_at is null
     or (to_jsonb(new)-array['deactivated_by','deactivated_at','deactivation_reason'])
        is distinct from
        (to_jsonb(old)-array['deactivated_by','deactivated_at','deactivation_reason']) then
    raise exception 'typed egress activation permits only one deactivation'
      using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_client_egress_purpose_activations_update before update or delete
  on clara.client_egress_purpose_activations
  for each row execute function clara._tf_egress_purpose_activation_update();
create trigger t_client_egress_purpose_activations_no_truncate before truncate
  on clara.client_egress_purpose_activations
  for each statement execute function clara._tf_no_truncate();

create function clara._tf_egress_dispatch_authorization_update() returns trigger
  language plpgsql security definer set search_path=clara,pg_temp as $$
begin
  if tg_op='DELETE' then
    raise exception 'dispatch authorizations are historical' using errcode='CLR08';
  end if;
  -- One terminal, once. An UPDATE that touches any other column, that re-terminates an
  -- already-terminal row, or that sets no terminal at all is refused.
  if old.consumed_at is not null or old.invalidated_at is not null
     or (new.consumed_at is null and new.invalidated_at is null)
     or (to_jsonb(new)-array['consumed_at','invalidated_at','invalidated_reason'])
        is distinct from
        (to_jsonb(old)-array['consumed_at','invalidated_at','invalidated_reason']) then
    raise exception 'a dispatch authorization permits exactly one terminal transition'
      using errcode='CLR08';
  end if;
  return new;
end $$;
create trigger t_egress_dispatch_authorizations_update before update or delete
  on clara.egress_dispatch_authorizations
  for each row execute function clara._tf_egress_dispatch_authorization_update();
create trigger t_egress_dispatch_authorizations_no_truncate before truncate
  on clara.egress_dispatch_authorizations
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================
-- FORCE ROW LEVEL SECURITY + a SINGLE clara_fn_owner all-policy on each relation (the
-- 0011:1091-1106 loop, written out). No role but clara_fn_owner reads or writes these
-- relations — not clara_runtime, not clara_authenticated, not clara_agent_ro, not the wake
-- roles. Every access is through a named DEFINER function; the tail asserts the absence of
-- any table grant.
-- =====================================================================
alter table clara.client_egress_purpose_consents enable row level security;
alter table clara.client_egress_purpose_consents force row level security;
create policy p_client_egress_purpose_consents_owner on clara.client_egress_purpose_consents
  for all to clara_fn_owner using (true) with check (true);

alter table clara.client_egress_purpose_activations enable row level security;
alter table clara.client_egress_purpose_activations force row level security;
create policy p_client_egress_purpose_activations_owner
  on clara.client_egress_purpose_activations
  for all to clara_fn_owner using (true) with check (true);

alter table clara.egress_dispatch_authorizations enable row level security;
alter table clara.egress_dispatch_authorizations force row level security;
create policy p_egress_dispatch_authorizations_owner on clara.egress_dispatch_authorizations
  for all to clara_fn_owner using (true) with check (true);

-- =====================================================================
-- §3.3 THE VERDICT FUNCTION — plan-time, runtime-only, LEAK-FREE.
--
-- Returns EXACTLY two keys. `granted` iff a live typed consent C for (p_client, p_purpose)
-- in p_firm exists AND a live activation A exists with A.consent_id = C.id. EVERY other
-- case — never attested, attested then withdrawn, live but never activated, live but
-- deactivated, foreign firm, nonexistent client, unknown purpose, a malformed dispatch
-- intent — returns the byte-identical unknown payload, WITHOUT distinction. The third
-- verdict token of the v0.1 draft is deleted from the vocabulary: both non-granted states
-- lead to the identical safety action, so distinguishing them is pure existence leakage — a
-- runtime-readable oracle for "did this client ever consent, and did they withdraw?".
-- Withdrawal history lives in the typed relation and the audit/event trail, owner-only.
--
-- No row content, no timestamp, no identifier of the consent or the activation, no evidence,
-- no scope, no history and no cardinality ever appears in the return.
-- =====================================================================
create function clara.prepare_egress_dispatch(p_firm uuid,p_client uuid,p_purpose text,
    p_event_seq bigint,p_event_type text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  -- §3.2 TTL: one named constant. The plan->consume gap is a single wiki-context read, so
  -- 120 seconds is generous by orders of magnitude and short enough that a stranded
  -- authorization cannot be replayed later. Expiry is time-derived: no sweep, no write.
  c_dispatch_ttl constant interval := interval '120 seconds';
  v_consent uuid; v_activation uuid; v_id uuid;
begin
  if p_firm is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null or btrim(p_event_type)='' then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  select a.id,a.consent_id into v_activation,v_consent
    from clara.client_egress_purpose_activations a
    join clara.client_egress_purpose_consents c
      on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id
        and c.purpose=a.purpose
   where a.firm_id=p_firm and a.client_id=p_client and a.purpose=p_purpose
     and a.deactivated_at is null and c.revoked_at is null;
  if v_activation is null then
    return jsonb_build_object('verdict','unknown','authorization_id',null);
  end if;
  -- RATCHET R1-F2: WALL CLOCK, not transaction time. now() is transaction-stable, so a caller
  -- inside a long-open transaction would mint an authorization whose stated TTL bears no
  -- relation to the 120 seconds the contract promises. clock_timestamp() makes the window an
  -- honest wall-clock 120s for every caller, and consume compares against clock_timestamp() too.
  insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,
      activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
    values(p_firm,p_client,p_purpose,v_consent,v_activation,p_event_seq,p_event_type,
      null,clock_timestamp(),clock_timestamp()+c_dispatch_ttl)
    returning id into v_id;
  return jsonb_build_object('verdict','granted','authorization_id',v_id);
end $$;

-- =====================================================================
-- §3.4 THE DISPATCH LINEARIZATION POINT (RATIFIED AMENDMENT 2026-07-25, ratchet R1-F1/F2).
--
-- One key. The last DB interaction before the model call is a STATE TRANSITION the revoker
-- can observe and invalidate, not a query — that is what a third read could never buy.
--
-- WHY THE SIGNATURE IS SIX ARGUMENTS AND NOT TWO. Contract v1.0 pinned
-- consume_egress_dispatch(p_firm, p_authorization) and listed checks that never touched the
-- client, the purpose or the dispatch intent the authorization was minted for. §3.2 says the
-- row "binds" those — but a binding the effect-time verb never re-verifies is AUDIT DATA, not
-- an enforced use constraint. Two independent cross-model reviews found it. Concretely: same
-- firm, client A lit and client B dark; an authorization prepared for A, presented during a B
-- dispatch, was consumed and returned `granted`, and B's context reached the model with no B
-- consent and no B activation. The DB could not detect the substitution. Clara's cardinal
-- invariant is that authorization is STRUCTURAL, enforced in the DB, never by model
-- discipline — an authorization whose scope holds only because the caller kept it in a local
-- variable is exactly model discipline. So consumption now re-verifies the dispatch it is
-- being used for: firm, client, purpose, event_seq and event_type must all equal the row's.
-- A mismatch returns the SAME uniform unknown — never a distinguishing error, never a
-- "wrong client" oracle.
--
-- RATCHET R1-F2 (time): expiry is compared against clock_timestamp(), not now(). now() is
-- transaction-stable, so a caller inside a long-open transaction saw an authorization that
-- had expired minutes earlier as still live. The lock predicate also carries firm_id, so a
-- foreign-firm consume never takes a row lock on another firm's authorization.
--
-- A PostgreSQL function CANNOT commit its surrounding transaction, so `granted` implies
-- committed only if the CALLER's transaction commits. The runtime's default consume helper
-- therefore runs this in its OWN explicit begin/commit before the model call; that discipline
-- is the other half of §3.6's linearization claim and is asserted in the runtime suite.
--
-- §3.6, stated honestly: an authorization CONSUMED BEFORE a revocation commits MAY dispatch
-- (the bytes were authorized; the revocation applies from its own commit forward). A
-- revocation COMMITTED BEFORE consumption MUST refuse, and does. Absolute cancellation after
-- consumption but before the bytes leave the process is NOT achievable by this design and is
-- not claimed: it would require holding a database lock across the external HTTP request
-- (an external stall would pin a connection and a row lock indefinitely) or a transactional
-- outbound proxy (a different architecture, not in Wave B). The residual window is the
-- interval between this function committing and the request reaching the socket.
-- =====================================================================
create function clara.consume_egress_dispatch(p_firm uuid,p_authorization uuid,
    p_client uuid,p_purpose text,p_event_seq bigint,p_event_type text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare a record;
begin
  if p_firm is null or p_authorization is null or p_client is null or p_purpose is null
     or p_event_seq is null or p_event_type is null then
    return jsonb_build_object('verdict','unknown');
  end if;
  -- firm_id is IN the lock predicate: a foreign-firm caller never reaches, and never locks,
  -- another firm's authorization row.
  select * into a from clara.egress_dispatch_authorizations
    where id=p_authorization and firm_id=p_firm for update;
  if not found then
    return jsonb_build_object('verdict','unknown');
  end if;
  -- THE DISPATCH RE-BINDING. Every field the row records about WHAT this authorization was
  -- minted for is compared before anything is consumed. A mismatch is not consumed and not
  -- distinguished: the presented authorization stays live for its legitimate dispatch.
  if a.client_id is distinct from p_client
     or a.purpose is distinct from p_purpose
     or a.event_seq is distinct from p_event_seq
     or a.event_type is distinct from p_event_type then
    return jsonb_build_object('verdict','unknown');
  end if;
  if a.consumed_at is not null or a.invalidated_at is not null
     or a.expires_at<=clock_timestamp() then
    return jsonb_build_object('verdict','unknown');
  end if;
  -- The exact consent AND the exact activation must still be live, and the activation must
  -- still name THAT consent (the composite FK binds firm/client/purpose, never consent_id).
  if not exists(select 1 from clara.client_egress_purpose_consents c
      where c.id=a.consent_id and c.revoked_at is null)
     or not exists(select 1 from clara.client_egress_purpose_activations x
      where x.id=a.activation_id and x.deactivated_at is null
        and x.consent_id=a.consent_id) then
    return jsonb_build_object('verdict','unknown');
  end if;
  update clara.egress_dispatch_authorizations set consumed_at=clock_timestamp() where id=a.id;
  return jsonb_build_object('verdict','granted');
end $$;

-- =====================================================================
-- §5.1 THE DISCRIMINATED DOC->CLIENT RESOLVER.
--
-- p_firm is REQUIRED. Global document-UUID uniqueness and same-firm composite FKs give
-- INTEGRITY, not CALLER AUTHORIZATION, and clara_runtime's RLS is expressly NOT the tenant
-- boundary — the runtime lane's using(true) policies are the 0006/0007 convention with firm
-- scoping carried in SQL (0008:26-28). A single-argument resolver would let a caller in firm
-- B learn firm A's client for any document id it can guess.
--
-- Resolution is over ACTIVE filings of a VERIFIED document: clara.documents in p_firm with
-- bytes_verified_at not null (matching record_wiki_source_ingest's own ingest floor,
-- 0017:2238-2242), joined to active filings, over the DISTINCT client set.
--
-- NO COUNT is returned. `status` already conveys zero / one / many; an exact candidate
-- cardinality is a gratuitous topology oracle. A client_id is released ONLY on unique.
--
-- UNIFORM NOT-FOUND: foreign-firm, nonexistent, bytes-unverified and genuinely
-- zero-active-filing inputs all return the IDENTICAL payload, byte for byte — same key set,
-- no error, no timing branch a caller can distinguish.
-- =====================================================================
-- The single shared predicate behind BOTH the plan-time resolve and the effect-time
-- re-read, so the two can never drift. Returns an EMPTY array (never null) for a foreign
-- firm, a nonexistent document, an unverified document and a genuinely unfiled document
-- alike — the uniform-not-found property is a property of THIS function. Ungranted:
-- definer-internal only.
--
-- RATCHET R1-F6: the distinct-client set is CAPPED AT TWO. `status` conveys zero / one / many
-- and a client id is released only on `unique`, so a third distinct client can never change any
-- caller-visible outcome — but aggregating EVERY filing of a large topology makes the response
-- time a coarse oracle for how many clients a document is filed to. Two rows decide
-- unresolved | unique | ambiguous, and the cap bounds the work a repeated prober can induce.
create function clara._active_filing_clients(p_firm uuid,p_document uuid) returns uuid[]
  language sql stable security definer set search_path=clara,pg_temp as $$
  select coalesce(array_agg(t.client_id),'{}'::uuid[]) from (
    select distinct f.client_id
    from clara.documents d
    join clara.document_filings f on f.document_id=d.id and f.firm_id=d.firm_id
      and f.retired_at is null
    where p_firm is not null and p_document is not null
      and d.id=p_document and d.firm_id=p_firm and d.bytes_verified_at is not null
    limit 2) t;
$$;

create function clara.resolve_document_client(p_firm uuid,p_document uuid) returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare v_clients uuid[];
begin
  v_clients:=clara._active_filing_clients(p_firm,p_document);
  if cardinality(v_clients)=1 then
    return jsonb_build_object('status','unique','client_id',v_clients[1]);
  elsif cardinality(v_clients)>1 then
    return jsonb_build_object('status','ambiguous');
  end if;
  return jsonb_build_object('status','unresolved');
end $$;

-- =====================================================================
-- §5.3 RESOLVE-AND-INGEST — ONE SERIALIZED OPERATION.
--
-- §5.2, the two races a read-then-mutate resolver cannot close:
--   * resolve unique(A), then a filing for B commits. record_wiki_source_ingest re-checks
--     only that A still has an ACTIVE FILING (0017:2238-2242) — never that A is still the
--     ONLY client. The page would publish as uniquely resolved when it no longer is.
--   * resolve ambiguous, then B retires. The document is now uniquely A's, but its
--     document.classified event is checkpointed permanently. 0019's retirement lane marks
--     citations stale; it does NOT re-resolve. That re-drive is 0020's (§5.4).
--
-- LOCK ACQUISITION ORDER (pinned by the contract — a blind lane must not invent its own):
--   1. clara.document_filings rows for p_document — FOR SHARE. This blocks a concurrent
--      retire_document_filing, which takes the filing row FOR UPDATE (0007:1445, re-grounded
--      post-0019: it locks only the filing row and never clara.documents) and
--      approve_wrong_client_correction, which takes the document's filings
--      `order by f.id for update` (0009:2452-2453, re-grounded post-0019). `order by f.id`
--      here matches that acquisition order exactly.
--   2. The clara.documents row for (p_document, p_firm) — FOR UPDATE. This is the PHANTOM
--      GUARD: an INSERT into clara.document_filings must take FOR KEY SHARE on the
--      referenced parent to enforce fk_document_filings_document (0007:79-80), and FOR KEY
--      SHARE conflicts with FOR UPDATE, so no NEW filing for this document can commit while
--      the lock is held. No writer change is required anywhere. (file_document itself takes
--      `clara.documents ... for update` FIRST (0009:2303), so it queues behind this lock
--      rather than racing it.)
--   3. Re-read the distinct active-filing client set under BOTH locks. THIS read, not the
--      plan-time one, is authoritative.
-- Both authority functions take filings BEFORE clients, and this function takes filings
-- before documents before (via the audited writer) clients — one consistent direction.
--
-- record_wiki_source_ingest is NOT modified. Making it require uniqueness would break the
-- entry.approved lane, which carries an authoritative client_id and must keep working for a
-- document legitimately filed to more than one client. The uniqueness requirement belongs to
-- the RESOLVER-DRIVEN path only, which is why it lives in this new entry point.
--
-- RESIDUAL R-1: a deadlock (40P01) against a concurrent authority function is possible in
-- principle. It aborts this transaction; the consumer's at-least-once delivery re-drives the
-- event and the derived op key makes it converge. Bounded and self-healing, not eliminated.
-- =====================================================================
create function clara.resolve_and_ingest_wiki_source(p_firm uuid,p_document uuid)
  returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare v_clients uuid[]; v_client uuid; v_result jsonb;
begin
  if p_firm is null or p_document is null then
    return jsonb_build_object('status','skipped_unresolved_client');
  end if;
  -- (1) filing topology, FOR SHARE, in the authority functions' own id order.
  perform 1 from clara.document_filings f
    where f.document_id=p_document and f.firm_id=p_firm order by f.id for share;
  -- (2) the phantom guard on the parent row.
  perform 1 from clara.documents d
    where d.id=p_document and d.firm_id=p_firm for update;
  -- (3) the AUTHORITATIVE re-read, under both locks, through the shared predicate.
  v_clients:=clara._active_filing_clients(p_firm,p_document);
  if cardinality(v_clients)=0 then
    return jsonb_build_object('status','skipped_unresolved_client');
  elsif cardinality(v_clients)>1 then
    return jsonb_build_object('status','skipped_ambiguous_client');
  end if;
  v_client:=v_clients[1];
  -- §5.4: the re-drive fires only for CLASSIFIED documents. A newly filed document that was
  -- never classified must not be ingested. This gate sits on the unique branch, because §5.3
  -- states the zero / many outcomes as direct outcomes of the authoritative re-read.
  if not exists(select 1 from clara.domain_events e
      where e.firm_id=p_firm and e.event_type='document.classified'
        and e.document_id=p_document) then
    return jsonb_build_object('status','skipped_unclassified');
  end if;
  -- The op key is derived INSIDE this function, in the BYTE-IDENTICAL shape the consumer
  -- already uses for entry.approved, so the two paths share ONE op receipt per
  -- (client, document) and can never double-publish. The audited writer owns the write.
  v_result:=clara.record_wiki_source_ingest(v_client,p_document,null,
    'wikiingest:'||v_client::text||':'||p_document::text);
  return v_result||jsonb_build_object('status','projected');
end $$;

-- =====================================================================
-- §7.1 THE OWNER RPCs (four in contract v1.0; FIVE after the 2026-07-25 amendment).
--
-- All: SECURITY DEFINER · search_path pinned · the OWNER floor in-function via
-- _human_ctx(role_rank('owner')) · op-keyed through _reserve_op/_finish_op · each emits its
-- §4.1 event and an _audit row. Granted to clara_authenticated ONLY (never clara_runtime,
-- never the agent or wake roles). There is NO consent-granting dashboard surface and 0020
-- does not build one: consent is owner-RPC-only through PostgREST under an owner JWT.
--
-- Refusal grammar: argument validation is CLR10 (missing/blank op key, blank reason, unknown
-- purpose); client/document-not-in-firm is CLR11; STATE refusals (no live typed consent, no
-- live activation, duplicate live, ineligible evidence) are CLR28; the owner floor raises
-- through _human_ctx (CLR03/CLR04). A same-key / different-args op reuse raises CLR10 —
-- _reserve_op's own code (0004:57, contract comment 0004:45), NOT CLR28.
-- =====================================================================

-- classify_consent_evidence_document (RATIFIED AMENDMENT 2026-07-25, ratchet R1-F3): the owner
-- path that STAMPS document_kind='consent_evidence' and grants NO egress of any kind.
--
-- WHY IT EXISTS. Contract v1.0 §7.2 step 1 says "ingest the signed re-attestation letter as a
-- consent_evidence document", but at v1.0 there was no verb that could do that without also
-- granting legacy egress: grant_client_egress_purpose only READS an already-stamped document;
-- set_document_kind REFUSES the kind outright ("consent-evidence classification is owned by the
-- egress consent path", 0016 CLR28); and the only live writer that stamps it is the LEGACY
-- grant_client_egress (0014), which in the same call mints a purpose-blind consent authorizing
-- invoice-facts egress. So a client who consented ONLY to wiki synthesis could not be onboarded
-- without being granted egress they never agreed to — the exact purpose bleed §1.1 exists to
-- abolish. The positive battery path worked only because a SUPERUSER fixture seeded the stamp;
-- a fixture is not an operational path.
--
-- WHAT IT IS NOT. It mints no consent, no activation and no authorization; it touches neither
-- consent relation; it emits NO domain event. Emitting document.classified here would be
-- actively wrong: §5.4's re-drive gate fires on that event, and record_wiki_source_ingest
-- refuses a consent_evidence source (CLR28), so the event would manufacture a guaranteed
-- refusal for a document that is not wiki material at all. The 0014 precedent is the same —
-- grant_client_egress stamps the kind and emits no classification event.
--
-- The floors are the 0014 ones, verbatim in substance: same firm, status='ingested',
-- bytes_verified_at not null, and the kind must be null or ALREADY consent_evidence (you
-- cannot re-label a coded bill as a consent letter). Idempotent through the op receipt AND
-- through the null-or-same-kind predicate.
create function clara.classify_consent_evidence_document(p_document uuid,p_reason text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; d record; v_prior text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_document is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'a document and a reason are required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'classify_consent_evidence_document',p_op_key,
    clara._hash(jsonb_build_object('document',p_document,'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- Locked, and firm-checked BEFORE anything else is read off the row.
  select * into d from clara.documents where id=p_document for update;
  if not found or d.firm_id<>c.firm then
    raise exception 'document not in your firm' using errcode='CLR11';
  end if;
  if d.status<>'ingested' or d.bytes_verified_at is null then
    raise exception 'consent evidence must be an ingested, bytes-verified document'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  if d.document_kind is not null and d.document_kind<>'consent_evidence' then
    raise exception 'consent evidence must be an unclassified or consent-evidence document'
      using errcode='CLR28',detail='{"reason":"evidence_kind_conflict"}';
  end if;
  v_prior:=d.document_kind;
  update clara.documents set document_kind='consent_evidence' where id=p_document;
  perform clara._audit(c.firm,c.actor,null,null,'classify_consent_evidence_document',null,
    jsonb_build_object('document',p_document,'prior_kind',v_prior,'reason',btrim(p_reason),
      'op_key',p_op_key));
  return clara._finish_op(c.firm,'classify_consent_evidence_document',p_op_key,
    jsonb_build_object('document_id',p_document,'document_kind','consent_evidence',
      'prior_kind',v_prior));
end $$;

-- grant: mints a typed consent. It DOES NOT ACTIVATE — a grant alone never authorizes.
--
-- §1.3, EVIDENCE IS MANDATORY AND REAL, and the check is exactly the three conditions the
-- contract states AT GRANT TIME: same firm, document_kind='consent_evidence', and
-- bytes_verified_at not null. This verb does NOT stamp document_kind (contrast legacy
-- grant_client_egress, 0014:106-114): a typed grant is a reader of the evidence artifact,
-- never a mutator of clara.documents. The honest boundary: the database can prove the
-- artifact exists, was ingested and had its bytes verified, and can bind the owner's
-- attestation to it; it CANNOT cryptographically verify a signature on that artifact. 0020
-- claims the former only.
create function clara.grant_client_egress_purpose(p_client uuid,p_purpose text,
    p_evidence_document uuid,p_scope_note text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_scope_note is null or nullif(btrim(p_scope_note),'') is null then
    raise exception 'typed egress consent is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'grant_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'scope_note',p_scope_note)));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm
      and status='active') then
    raise exception 'client is not active in your firm' using errcode='CLR11';
  end if;
  -- A null document, or any document that is not an already-classified, bytes-verified
  -- consent-evidence artifact in this firm, is refused. The owner-declaration path of
  -- 0012(A) is deliberately NOT available for typed consent.
  if p_evidence_document is null or not exists(select 1 from clara.documents
      where id=p_evidence_document and firm_id=c.firm
        and document_kind='consent_evidence' and bytes_verified_at is not null) then
    raise exception 'typed consent evidence must be a verified consent-evidence document in your firm'
      using errcode='CLR28',detail='{"reason":"evidence_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
        evidence_document_id,granted_by)
      values(c.firm,p_client,p_purpose,btrim(p_scope_note),p_evidence_document,c.actor)
      returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_consents_one_live' then
      raise exception 'client already has a live typed egress consent for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  perform clara._audit(c.firm,c.actor,null,null,'grant_client_egress_purpose',null,
    jsonb_build_object('consent',v_id,'client',p_client,'purpose',p_purpose,
      'evidence_document',p_evidence_document,'op_key',p_op_key));
  -- The evidence document rides in the PAYLOAD, never the typed document_id column — the
  -- 0014 rule (a consent artifact must not trip the filing-history provenance trigger)
  -- applies identically to typed consent.
  perform clara._append_event(c.firm,'egress.purpose_consent_granted',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',v_id,'purpose',p_purpose,
      'evidence_document_id',p_evidence_document));
  return clara._finish_op(c.firm,'grant_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',v_id,'purpose',p_purpose,'status','live'));
end $$;

-- activate: the positive owner act. p_consent must BE the live typed consent for
-- (client, purpose) — a blind activation is impossible, and a revoke-and-regrant therefore
-- forces the owner to activate the NEW consent explicitly (§2.3, the version-match law).
create function clara.activate_client_egress_purpose(p_client uuid,p_purpose text,
    p_consent uuid,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_id uuid; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_consent is null then
    raise exception 'typed egress activation is malformed' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'activate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'consent',p_consent)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST. §7.1 mandates CLR11 for a client not in your firm, and the
  -- v1.0 body reached that verdict only AFTER a global (client, purpose) lookup that took
  -- FOR UPDATE on a foreign firm's live row — cross-firm lock reach, and CLR28 instead of the
  -- mandated CLR11. Every state-row predicate below now carries firm_id=c.firm as well.
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  if x.id<>p_consent then
    raise exception 'the named consent is not the live typed consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"consent_mismatch"}';
  end if;
  begin
    insert into clara.client_egress_purpose_activations(firm_id,client_id,purpose,
        consent_id,activated_by)
      values(c.firm,p_client,p_purpose,x.id,c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_client_egress_purpose_activations_one_live' then
      raise exception 'client already has a live activation for this purpose'
        using errcode='CLR28',detail='{"reason":"duplicate_live"}';
    end if;
    raise;
  end;
  -- §4.3: the hold transition moves INSIDE the owner-floored RPC and goes through the
  -- audited writer (never a hand-written row). Only activation clears it. The purpose CHECK
  -- is single-valued today; widening it needs a follow-on ruling AND a per-purpose hold map.
  perform clara.clear_wiki_synthesis_hold(p_client,'wikirelease:purpose:'||v_id::text);
  perform clara._audit(c.firm,c.actor,null,null,'activate_client_egress_purpose',null,
    jsonb_build_object('activation',v_id,'consent',x.id,'client',p_client,
      'purpose',p_purpose,'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_activated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',v_id,'consent_id',x.id,
      'purpose',p_purpose,'evidence_document_id',x.evidence_document_id));
  return clara._finish_op(c.firm,'activate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',v_id,'consent_id',x.id,'purpose',p_purpose,
      'status','active'));
end $$;

-- deactivate: a PAUSE. The consent record survives; dispatch does not.
create function clara.deactivate_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress deactivation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_activations
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and deactivated_at is null for update;
  if not found then
    raise exception 'no live typed egress activation for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_activation"}';
  end if;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason=btrim(p_reason) where id=x.id;
  -- §3.5: every OUTSTANDING authorization for the consent behind this activation is
  -- invalidated in the SAME transaction as the withdrawal.
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='activation_deactivated'
    where consent_id=x.consent_id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  perform clara.set_wiki_synthesis_hold(p_client,
    'wiki synthesis purpose deactivated','wikihold:purpose:deact:'||x.id::text);
  perform clara._audit(c.firm,c.actor,null,null,'deactivate_client_egress_purpose',null,
    jsonb_build_object('activation',x.id,'consent',x.consent_id,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  perform clara._append_event(c.firm,'egress.purpose_deactivated',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('activation_id',x.id,
      'consent_id',x.consent_id,'purpose',p_purpose,'reason',btrim(p_reason),
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'deactivate_client_egress_purpose',p_op_key,
    jsonb_build_object('activation_id',x.id,'consent_id',x.consent_id,'purpose',p_purpose,
      'status','deactivated'));
end $$;

-- revoke: WITHDRAWAL. Revokes the live typed consent, deactivates its activation,
-- invalidates every unconsumed authorization for it, and sets the hold — all in ONE
-- transaction. §3.5's consequence: revoke-and-regrant invalidates the OLD consent's
-- outstanding authorizations even if the new consent is immediately activated, because the
-- new activation names a new consent id and the stranded authorizations name the old one.
create function clara.revoke_client_egress_purpose(p_client uuid,p_purpose text,
    p_reason text,p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; x record; v_activation uuid; v_invalidated int;
begin
  c:=clara._human_ctx(clara.role_rank('owner'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_reason is null or nullif(btrim(p_reason),'') is null then
    raise exception 'typed egress revocation reason is required' using errcode='CLR10';
  end if;
  if p_purpose is null or p_purpose not in ('wiki_synthesis') then
    raise exception 'unknown egress purpose'
      using errcode='CLR10',detail='{"reason":"unknown_purpose"}';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'purpose',p_purpose,
      'reason',p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  -- RATCHET R1-F5: FIRM FIRST (see activate).
  if not exists(select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;
  select * into x from clara.client_egress_purpose_consents
    where client_id=p_client and firm_id=c.firm and purpose=p_purpose
      and revoked_at is null for update;
  if not found then
    raise exception 'no live typed egress consent for this client and purpose'
      using errcode='CLR28',detail='{"reason":"no_consent"}';
  end if;
  update clara.client_egress_purpose_consents set revoked_by=c.actor,revoked_at=now(),
    revoke_reason=btrim(p_reason) where id=x.id;
  update clara.client_egress_purpose_activations set deactivated_by=c.actor,
    deactivated_at=now(),deactivation_reason='typed egress consent revoked'
    where consent_id=x.id and firm_id=c.firm and deactivated_at is null
    returning id into v_activation;
  update clara.egress_dispatch_authorizations set invalidated_at=now(),
    invalidated_reason='consent_revoked'
    where consent_id=x.id and firm_id=c.firm
      and consumed_at is null and invalidated_at is null;
  get diagnostics v_invalidated=row_count;
  perform clara.set_wiki_synthesis_hold(p_client,
    'wiki synthesis purpose consent revoked','wikihold:purpose:'||x.id::text);
  perform clara._audit(c.firm,c.actor,null,null,'revoke_client_egress_purpose',null,
    jsonb_build_object('consent',x.id,'activation',v_activation,'client',p_client,
      'purpose',p_purpose,'reason',p_reason,'authorizations_invalidated',v_invalidated,
      'op_key',p_op_key));
  -- One event for the withdrawal, carrying the activation id WHERE APPLICABLE (§4.1) and
  -- the evidence document in the payload (the 0014 rule).
  perform clara._append_event(c.firm,'egress.purpose_consent_revoked',p_client,c.actor,
    null,null,null,null,null,jsonb_build_object('consent_id',x.id,'purpose',p_purpose,
      'activation_id',v_activation,'reason',btrim(p_reason),
      'evidence_document_id',x.evidence_document_id,
      'authorizations_invalidated',v_invalidated));
  return clara._finish_op(c.firm,'revoke_client_egress_purpose',p_op_key,
    jsonb_build_object('consent_id',x.id,'activation_id',v_activation,'purpose',p_purpose,
      'status','revoked'));
end $$;

reset role;

-- =====================================================================
-- §4.1 EVENT TAXONOMY — one additive pair against the ACTIVE version (the 0011/0015/0017
-- idiom; no new version, no repoint). All four are client-scoped and 'ignore' at the
-- taxonomy: the consumer subscribes them for OBSERVABILITY and ORDERING, not for effect —
-- the DB owns the hold transitions for typed purposes (§4.3), so there is nothing for the
-- consumer to do but advance.
-- =====================================================================
with added(name,client_scoped,description,decision,note) as (values
  ('egress.purpose_consent_granted',true,
   'A typed, purpose-scoped client egress consent was granted','ignore',
   'grant alone does not authorize dispatch; activation does'::text),
  ('egress.purpose_consent_revoked',true,
   'A typed, purpose-scoped client egress consent was revoked','ignore',null::text),
  ('egress.purpose_activated',true,
   'An owner activated typed egress for a client and purpose','ignore',null::text),
  ('egress.purpose_deactivated',true,
   'An owner deactivated typed egress for a client and purpose','ignore',null::text)
), inserted_types as (
  insert into clara.event_types(name,client_scoped,description)
  select name,client_scoped,description from added returning name
)
insert into clara.trigger_taxonomy(version,event_type,decision,note)
select a.version,x.name,x.decision,x.note from added x
join inserted_types i on i.name=x.name cross join clara.taxonomy_active a;

-- =====================================================================
-- GRANTS (as the migration role). EXACTLY the contract's matrix and nothing beyond it.
--   * the four RUNTIME verbs -> clara_runtime ONLY;
--   * the four OWNER RPCs   -> clara_authenticated ONLY;
--   * NO table grant to any role on the three new relations — the DEFINER functions are the
--     entire surface, and clara_runtime still holds no SELECT on clara.document_filings
--     (0007:2740-2741) or on clara.client_egress_consents.
-- The internal helper clara._active_filing_clients stays UNGRANTED (definer-internal only).
-- =====================================================================
revoke execute on all functions in schema clara from public;

grant execute on function
  clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text),
  clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text),
  clara.resolve_document_client(uuid,uuid),
  clara.resolve_and_ingest_wiki_source(uuid,uuid)
to clara_runtime;

grant execute on function
  clara.classify_consent_evidence_document(uuid,text,text),
  clara.grant_client_egress_purpose(uuid,text,uuid,text,text),
  clara.activate_client_egress_purpose(uuid,text,uuid,text),
  clara.deactivate_client_egress_purpose(uuid,text,text,text),
  clara.revoke_client_egress_purpose(uuid,text,text,text)
to clara_authenticated;

-- =====================================================================
-- §8. THE 0020 IN-TRANSACTION FAIL-CLOSED TAIL BATTERY.
--
-- Static catalog / prosrc / ACL asserts + the legacy byte-identity pins + the extended
-- 0019-shape closed-set scan + functional probes, each inside a forced-rollback
-- subtransaction. One transaction; ANY failure aborts the apply.
--
-- EXPLICITLY NOT HERE: the tail is one transaction and CANNOT prove concurrency. No
-- revocation race, ambiguity race, deadlock or two-session cell belongs here — those live in
-- the rig battery (§9).
-- =====================================================================
do $tail$
declare
  v_sig text; v_src text; v_n int; v_owner oid; v_bad text; v_txt text;
  v_relrx text; v_callrx text; v_wl text[]; v_wl_oids oid[]; v_new_oids oid[];
  v_r jsonb; v_probe_ok boolean;
  v_f uuid; v_u uuid; v_c uuid; v_c2 uuid; v_d uuid; v_dev uuid; v_fil uuid;
  v_consent uuid; v_activation uuid; v_auth uuid;
  v_sha text; v_pin text;
  v_runtime_only text[]; v_owner_only text[]; v_new_fns text[];
begin
  v_owner := (select oid from pg_roles where rolname='clara_fn_owner');
  v_runtime_only := array[
    'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)',
    'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)',
    'clara.resolve_document_client(uuid,uuid)',
    'clara.resolve_and_ingest_wiki_source(uuid,uuid)'];
  v_owner_only := array[
    'clara.classify_consent_evidence_document(uuid,text,text)',
    'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)'];
  v_new_fns := v_runtime_only || v_owner_only;
  select coalesce(array_agg(s::regprocedure::oid),'{}') into v_new_oids
    from unnest(v_new_fns) s;

  -- ===================================================================
  -- STRUCTURAL / CATALOG
  -- ===================================================================
  foreach v_txt in array array['client_egress_purpose_consents',
      'client_egress_purpose_activations','egress_dispatch_authorizations'] loop
    if to_regclass('clara.'||v_txt) is null then
      raise exception '0020 relation clara.% is missing',v_txt using errcode='CLR10';
    end if;
    -- FORCE RLS with EXACTLY ONE policy, and that policy is clara_fn_owner's.
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_txt
          and c.relrowsecurity and c.relforcerowsecurity and c.relowner=v_owner) then
      raise exception '0020 % is not owner-owned FORCE-RLS',v_txt using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_policies
      where schemaname='clara' and tablename=v_txt;
    if v_n<>1 or not exists(select 1 from pg_policies where schemaname='clara'
        and tablename=v_txt and roles::text='{clara_fn_owner}' and cmd='ALL') then
      raise exception '0020 % must carry exactly one clara_fn_owner all-policy (got %)',
        v_txt,v_n using errcode='CLR10';
    end if;
    -- Immutability (row-level BEFORE UPDATE OR DELETE) + no-truncate (statement-level
    -- BEFORE TRUNCATE), by NAME so a drop is visible rather than merely re-shaped.
    if not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_txt and not t.tgisinternal
          and t.tgname='t_'||v_txt||'_update')
       or not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname=v_txt and not t.tgisinternal
          and t.tgname='t_'||v_txt||'_no_truncate') then
      raise exception '0020 % is missing its immutability / no-truncate trigger',v_txt
        using errcode='CLR10';
    end if;
    -- NO table grant to ANY application role.
    if exists(select 1 from information_schema.role_table_grants
        where table_schema='clara' and table_name=v_txt
          and grantee in ('clara_runtime','clara_authenticated','clara_agent_ro',
            'clara_wake_interactive','clara_wake_proactive','PUBLIC')) then
      raise exception '0020 % leaked a table grant to an application role',v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- The purpose CHECK is CLOSED to the single ratified value on all three relations. The
  -- definition is pinned exactly, so widening the enum (a follow-on ruling, contract §0)
  -- cannot happen by accident: a single-element IN normalizes to an equality check.
  select count(*)::int into v_n from pg_constraint con
    join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and con.contype='c'
     and c.relname in ('client_egress_purpose_consents',
       'client_egress_purpose_activations','egress_dispatch_authorizations')
     and pg_get_constraintdef(con.oid)='CHECK ((purpose = ''wiki_synthesis''::text))';
  if v_n<>3 then
    raise exception '0020 the closed purpose CHECK is not present on all three relations (got %)',
      v_n using errcode='CLR10';
  end if;

  -- The TWO partial unique indexes + the paired revocation / deactivation CHECKs + the
  -- document_sha256-null-for-wiki CHECK + the one-terminal CHECK.
  --
  -- CONTRACT ERRATUM (ratified 2026-07-25, ratchet R1). §8 of contract v1.0 says "the three
  -- partial unique indexes". There are TWO one-live UNIQUE indexes (consents, activations)
  -- plus one NON-unique partial index on open authorizations
  -- (ix_egress_dispatch_authorizations_open), which drives §3.5's withdrawal sweep. Making
  -- that third one unique would be WRONG: §3.3 mints a fresh authorization on every granted
  -- prepare, so many outstanding authorizations legitimately share one consent_id. The
  -- erratum is ratified in the contract; the tail asserts what is correct.
  foreach v_txt in array array[
    'uq_client_egress_purpose_consents_one_live',
    'uq_client_egress_purpose_activations_one_live'] loop
    if not exists(select 1 from pg_indexes where schemaname='clara' and indexname=v_txt) then
      raise exception '0020 partial unique index % is missing',v_txt using errcode='CLR10';
    end if;
  end loop;
  if (select indexdef from pg_indexes where schemaname='clara'
        and indexname='ix_egress_dispatch_authorizations_open') not like 'CREATE INDEX %' then
    raise exception '0020 the open-authorization index is missing or was made UNIQUE'
      using errcode='CLR10';
  end if;
  -- RATCHET R1-F6: the firm-leading live-activation index the verdict probe drives.
  if (select indexdef from pg_indexes where schemaname='clara'
        and indexname='ix_client_egress_purpose_activations_firm_live')
      not like '%(firm_id, client_id, purpose) WHERE (deactivated_at IS NULL)%' then
    raise exception '0020 the firm-leading live-activation index is missing or reshaped'
      using errcode='CLR10';
  end if;
  if (select indexdef from pg_indexes where schemaname='clara'
        and indexname='uq_client_egress_purpose_consents_one_live')
      not like '%(client_id, purpose) WHERE (revoked_at IS NULL)%'
     or (select indexdef from pg_indexes where schemaname='clara'
        and indexname='uq_client_egress_purpose_activations_one_live')
      not like '%(client_id, purpose) WHERE (deactivated_at IS NULL)%' then
    raise exception '0020 a typed one-live index does not have its pinned definition'
      using errcode='CLR10';
  end if;
  foreach v_txt in array array[
    'ck_client_egress_purpose_consents_revocation',
    'ck_client_egress_purpose_activations_deactivation',
    'ck_egress_dispatch_authorizations_doc_sha',
    'ck_egress_dispatch_authorizations_one_terminal',
    'ck_egress_dispatch_authorizations_invalidation'] loop
    if not exists(select 1 from pg_constraint where conname=v_txt
        and connamespace=(select oid from pg_namespace where nspname='clara')) then
      raise exception '0020 CHECK % is missing',v_txt using errcode='CLR10';
    end if;
  end loop;
  -- The composite FKs that make cross-firm / cross-purpose binding structurally impossible.
  foreach v_txt in array array[
    'fk_client_egress_purpose_activations_consent',
    'fk_egress_dispatch_authorizations_consent',
    'fk_egress_dispatch_authorizations_activation'] loop
    if not exists(select 1 from pg_constraint where conname=v_txt and contype='f'
        and connamespace=(select oid from pg_namespace where nspname='clara')
        and array_length(conkey,1)=4) then
      raise exception '0020 composite FK % is missing or not four-column',v_txt
        using errcode='CLR10';
    end if;
  end loop;

  -- The nine new functions exist, DEFINER, pinned search_path, owned by clara_fn_owner,
  -- and each is a SINGLE overload.
  foreach v_sig in array v_new_fns loop
    if not exists(select 1 from pg_proc p where p.oid=v_sig::regprocedure
        and p.prosecdef and p.proowner=v_owner
        and 'search_path=clara, pg_temp'=any(coalesce(p.proconfig,'{}'::text[]))) then
      raise exception '0020 % is not an owner-owned SECURITY DEFINER with a pinned search_path',
        v_sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=split_part(split_part(v_sig,'(',1),'.',2);
    if v_n<>1 then
      raise exception '0020 % must have exactly one overload (got %)',v_sig,v_n
        using errcode='CLR10';
    end if;
  end loop;
  -- Argument NAMES (and the absence of DEFAULTs) are part of the pinned surface: the
  -- runtime's exact-signature guards and every PostgREST named-argument call depend on them.
  -- Pair by pair, so the assertion is independent of the database's collation.
  foreach v_txt in array array[
    'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)'
      ||'=p_firm uuid, p_client uuid, p_purpose text, p_event_seq bigint, p_event_type text',
    'clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)'
      ||'=p_firm uuid, p_authorization uuid, p_client uuid, p_purpose text,'
      ||' p_event_seq bigint, p_event_type text',
    'clara.resolve_document_client(uuid,uuid)=p_firm uuid, p_document uuid',
    'clara.resolve_and_ingest_wiki_source(uuid,uuid)=p_firm uuid, p_document uuid',
    'clara.classify_consent_evidence_document(uuid,text,text)'
      ||'=p_document uuid, p_reason text, p_op_key text',
    'clara.grant_client_egress_purpose(uuid,text,uuid,text,text)'
      ||'=p_client uuid, p_purpose text, p_evidence_document uuid, p_scope_note text, p_op_key text',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)'
      ||'=p_client uuid, p_purpose text, p_consent uuid, p_op_key text',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)'
      ||'=p_client uuid, p_purpose text, p_reason text, p_op_key text',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)'
      ||'=p_client uuid, p_purpose text, p_reason text, p_op_key text'] loop
    if pg_get_function_arguments(split_part(v_txt,'=',1)::regprocedure)
       is distinct from split_part(v_txt,'=',2) then
      raise exception '0020 argument drift on %: got %',split_part(v_txt,'=',1),
        pg_get_function_arguments(split_part(v_txt,'=',1)::regprocedure)
        using errcode='CLR10';
    end if;
  end loop;

  -- The 120-second TTL constant is present in the verdict function's source.
  select prosrc into v_src from pg_proc
    where oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)'::regprocedure;
  if position('120 seconds' in v_src)=0 then
    raise exception '0020 prepare_egress_dispatch lost its named 120-second TTL constant'
      using errcode='CLR10';
  end if;

  -- The four new event types are registered, client-scoped, and in the ACTIVE taxonomy.
  select count(*)::int into v_n from clara.event_types
    where name in ('egress.purpose_consent_granted','egress.purpose_consent_revoked',
      'egress.purpose_activated','egress.purpose_deactivated') and client_scoped;
  if v_n<>4 then
    raise exception '0020 the four typed consent event types are not registered (got %)',v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from clara.trigger_taxonomy t
    join clara.taxonomy_active a on a.version=t.version
   where t.event_type in ('egress.purpose_consent_granted','egress.purpose_consent_revoked',
     'egress.purpose_activated','egress.purpose_deactivated');
  if v_n<>4 then
    raise exception '0020 the typed consent event types are not in the active taxonomy (got %)',
      v_n using errcode='CLR10';
  end if;

  -- ===================================================================
  -- RETURN-SHAPE / NON-LEAKAGE
  -- ===================================================================
  -- The verdict function names NO consent row content and computes NO cardinality.
  foreach v_txt in array array['granted_at','scope_note','evidence_document_id','granted_by',
      'revoke_reason','count('] loop
    if position(v_txt in v_src)>0 then
      raise exception '0020 prepare_egress_dispatch source references the leak token "%"',
        v_txt using errcode='CLR10';
    end if;
  end loop;
  -- The third verdict token of the withdrawn draft appears in NO 0020 function source.
  v_txt := chr(100)||chr(101)||chr(110)||chr(105)||chr(101)||chr(100);
  foreach v_sig in array v_new_fns loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    if position(v_txt in lower(v_src))>0 then
      raise exception '0020 % resurrects the collapsed verdict token',v_sig
        using errcode='CLR10';
    end if;
  end loop;
  -- The resolver computes no cardinality expression at all.
  select prosrc into v_src from pg_proc
    where oid='clara.resolve_document_client(uuid,uuid)'::regprocedure;
  if position('count(' in lower(v_src))>0 then
    raise exception '0020 resolve_document_client contains a count expression'
      using errcode='CLR10';
  end if;

  -- ===================================================================
  -- GRANTS / CAPABILITY CLOSED SET
  -- ===================================================================
  foreach v_sig in array v_runtime_only loop
    if not has_function_privilege('clara_runtime',v_sig,'execute')
       or has_function_privilege('clara_authenticated',v_sig,'execute')
       or has_function_privilege('clara_agent_ro',v_sig,'execute')
       or has_function_privilege('clara_wake_interactive',v_sig,'execute')
       or has_function_privilege('clara_wake_proactive',v_sig,'execute') then
      raise exception '0020 runtime-only ACL failed for %',v_sig using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array v_owner_only loop
    if not has_function_privilege('clara_authenticated',v_sig,'execute')
       or has_function_privilege('clara_runtime',v_sig,'execute')
       or has_function_privilege('clara_agent_ro',v_sig,'execute')
       or has_function_privilege('clara_wake_interactive',v_sig,'execute')
       or has_function_privilege('clara_wake_proactive',v_sig,'execute') then
      raise exception '0020 owner-only ACL failed for %',v_sig using errcode='CLR10';
    end if;
    -- Each owner RPC carries the in-function OWNER floor.
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    if position('_human_ctx(clara.role_rank(''owner''))' in v_src)=0 then
      raise exception '0020 % is missing its in-function owner floor',v_sig
        using errcode='CLR10';
    end if;
  end loop;
  -- The internal filing-clients helper reaches NO application role.
  foreach v_txt in array array['clara_runtime','clara_authenticated','clara_agent_ro',
      'clara_wake_interactive','clara_wake_proactive'] loop
    if has_function_privilege(v_txt,'clara._active_filing_clients(uuid,uuid)','execute') then
      raise exception '0020 _active_filing_clients leaked EXECUTE to %',v_txt
        using errcode='CLR10';
    end if;
  end loop;
  -- PUBLIC-execute sweep = 0 over every new function.
  select count(*)::int into v_n
    from unnest(v_new_fns||array['clara._active_filing_clients(uuid,uuid)']) s
   where has_function_privilege('public',s,'execute');
  if v_n<>0 then
    raise exception '0020 PUBLIC holds EXECUTE on % new function(s)',v_n using errcode='CLR10';
  end if;
  -- clara_runtime gains NO table read anywhere near the consent or filing surface. On
  -- clara.document_filings the assertion is RUNTIME-scoped by necessity: 0007:2740-2741
  -- deliberately grants SELECT to clara_authenticated and clara_agent_ro, and 0020 neither adds
  -- nor removes that. What must stay absent is a RUNTIME grant — the gap the DEFINER resolver
  -- closes without widening any read surface.
  if exists(select 1 from information_schema.role_table_grants
      where table_schema='clara' and grantee='clara_runtime'
        and table_name in ('client_egress_consents','document_filings',
          'client_egress_purpose_consents','client_egress_purpose_activations',
          'egress_dispatch_authorizations')) then
    raise exception '0020 clara_runtime gained a forbidden consent/filing table grant'
      using errcode='CLR10';
  end if;
  -- The LEGACY consent relation stays reachable by NO application role at all.
  if exists(select 1 from information_schema.role_table_grants
      where table_schema='clara' and table_name='client_egress_consents'
        and grantee in ('clara_runtime','clara_authenticated','clara_agent_ro',
          'clara_wake_interactive','clara_wake_proactive','PUBLIC')) then
    raise exception '0020 client_egress_consents gained an application-role table grant'
      using errcode='CLR10';
  end if;

  -- ===================================================================
  -- THE 0019-SHAPE WIKI CLOSED-SET SCAN, RE-RUN WITH 0020'S FUNCTIONS PRESENT.
  --
  -- BUILD-TIME FINDING (see the file header). 0019's scan (0019:1104-1105, 1494-1519) fails
  -- a non-whitelisted clara function whose prosrc matches the seven-relation regex OR the
  -- CALL-EDGE regex. 0020's four wiki-calling verbs necessarily match the call-edge half,
  -- so the contract's "calling the audited writers avoids the scan" is not accurate. 0019's
  -- tail runs only inside 0019's own apply, so nothing here can retro-fail a deployed 0019;
  -- 0020 re-runs the identical scan with a LOCALLY extended whitelist instead of mutating
  -- 0019's file (its checksum locks on deploy).
  --
  -- The assertion is strictly stronger than the contract's: (a) nothing outside the extended
  -- whitelist matches either regex, and (b) NO 0020 function names one of the seven wiki
  -- relations — 0020 reaches wiki state only through the audited writers.
  -- ===================================================================
  v_relrx := '\m(wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|wiki_budgets|wiki_synthesis_holds)\M';
  v_callrx := '\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale)\M';
  v_wl := array[
    -- 0019's twelve, by EXACT regprocedure identity (resolving each is an existence assert).
    'clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)',
    'clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)',
    'clara.record_wiki_source_ingest(uuid,uuid,text,text)',
    'clara.retire_wiki_page(uuid,text,text)',
    'clara.set_wiki_synthesis_hold(uuid,text,text)',
    'clara.clear_wiki_synthesis_hold(uuid,text)',
    'clara.get_wiki_page(uuid,text)',
    'clara.list_wiki_pages(uuid)',
    'clara.get_context_pack(uuid,text)',
    'clara.run_client_lint(uuid,text)',
    'clara.run_lint_all(text)',
    'clara.mark_wiki_citations_stale(uuid,uuid,text,text)',
    -- 0020's four CALL-EDGE-only additions.
    'clara.resolve_and_ingest_wiki_source(uuid,uuid)',
    'clara.activate_client_egress_purpose(uuid,text,uuid,text)',
    'clara.deactivate_client_egress_purpose(uuid,text,text,text)',
    'clara.revoke_client_egress_purpose(uuid,text,text,text)'
  ];
  select coalesce(array_agg(s::regprocedure::oid),'{}') into v_wl_oids from unnest(v_wl) s;
  select string_agg(p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='clara' and not (p.oid=any(v_wl_oids))
     and (p.prosrc ~* v_relrx or p.prosrc ~* v_callrx);
  if v_bad is not null then
    raise exception '0020 wiki authority/call-edge leaked into non-whitelisted function(s): %',
      v_bad using errcode='CLR10';
  end if;
  -- (b) NOT ONE 0020 function names a wiki RELATION. The data boundary is untouched.
  select string_agg(s,', ' order by s) into v_bad
    from unnest(v_new_fns||array['clara._active_filing_clients(uuid,uuid)']) s
   where (select prosrc from pg_proc where oid=s::regprocedure) ~* v_relrx;
  if v_bad is not null then
    raise exception '0020 function(s) name a wiki relation directly: %',v_bad
      using errcode='CLR10';
  end if;
  -- The 0017 granted-function inverse scan (0017:5991-6008), run over 0020's GRANTED
  -- functions: none of them may reference wiki DATA. (The catalog-wide form of this scan was
  -- superseded by 0019's §9 closed set, re-run above with the extended whitelist; re-running
  -- 0017's older proname allowlist verbatim would now fail on 0019's own
  -- mark_wiki_citations_stale, which post-dates that list.)
  if exists(select 1 from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
      join pg_roles r on r.oid=a.grantee
      where p.oid=any(v_new_oids)
        and a.privilege_type='EXECUTE'
        and r.rolname in ('clara_authenticated','clara_agent_ro','clara_runtime',
          'clara_wake_interactive','clara_wake_proactive')
        and p.prosrc ~* v_relrx) then
    raise exception '0020 a granted new function references wiki data'
      using errcode='CLR10';
  end if;
  -- The 0017 sightings / autopost leak scans, run over every new function.
  foreach v_sig in array v_new_fns loop
    select prosrc into v_src from pg_proc where oid=v_sig::regprocedure;
    if v_src ilike '%insert into clara.rule_sightings%' or v_src ilike '%autopost%' then
      raise exception '0020 sightings/autopost leak in %',v_sig using errcode='CLR10';
    end if;
  end loop;

  -- ===================================================================
  -- §6 LEGACY BYTE-IDENTITY — EXACT-SOURCE pins (RATCHET R1-F4).
  --
  -- v1.0's tail hashed md5(regexp_replace(lower(prosrc),'\s+','','g')) and called the result
  -- "byte identity". It is neither byte identity NOR semantic identity: lowercasing and
  -- whitespace-stripping reach INSIDE string literals, so changing the refusal discriminant
  -- '{"reason":"no_consent"}' to '{"reason":"NO_CONSENT"}' — a real, downstream-visible change
  -- to a case-sensitive token — passed the pin unchanged. The pins below hash the EXACT
  -- prosrc with SHA-256 and apply NO normalization of any kind.
  -- ===================================================================
  foreach v_txt in array array[
    'grant_client_egress|86c35e8d529f2dc3cb824d7f63ba7cf75fda97c287fadf8562dacdf955d03dcf',
    'revoke_client_egress|192339765ddaab2f53f09020e7443b8c5fd236c9518e22362d130569d5c07e07',
    'claim_document_processing_task|f9da98aa7c3a7a37ee79f5e67e523429c83f10bf4247489946f66457e80f312d',
    '_enqueue_invoice_facts_core|0165a1f471a6f29e01ff759f982d19175d0553ed4a811971b42d2dd197dd103e',
    'record_wiki_source_ingest|0c3adf2dc31ff2780df85b27ae3d5a09f76ae7f98cf7b816d557c74c8fdb484c'] loop
    v_sig := split_part(v_txt,'|',1);
    v_pin := split_part(v_txt,'|',2);
    select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_sig;
    if v_n<>1 then
      raise exception '0020 % must keep exactly one overload (got %)',v_sig,v_n
        using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=v_sig;
    if v_src is distinct from v_pin then
      raise exception '0020 % EXACT source drifted (expected %, got %)',v_sig,v_pin,v_src
        using errcode='CLR10';
    end if;
  end loop;
  -- The legacy functions' EXECUTE ACLs are a CLOSED SET. §6 promises the ACLs, not only the
  -- bodies, and v1.0's tail pinned none of them: a silent `grant execute ... to clara_runtime`
  -- on grant_client_egress would have passed every assertion in this migration.
  select string_agg(x.pin,' ;; ' order by x.pin) into v_txt from (
    select p.proname||'='||coalesce((select string_agg(a,',' order by a)
        from unnest(p.proacl::text[]) a),'(null)') as pin
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname in ('grant_client_egress','revoke_client_egress',
       'claim_document_processing_task','_enqueue_invoice_facts_core',
       'record_wiki_source_ingest')) x;
  if v_txt is distinct from
     '_enqueue_invoice_facts_core=clara_fn_owner=X/clara_fn_owner'
     ||' ;; claim_document_processing_task=clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner'
     ||' ;; grant_client_egress=clara_authenticated=X/clara_fn_owner,clara_fn_owner=X/clara_fn_owner'
     ||' ;; record_wiki_source_ingest=clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner'
     ||' ;; revoke_client_egress=clara_authenticated=X/clara_fn_owner,clara_fn_owner=X/clara_fn_owner' then
    raise exception '0020 a legacy egress/claim/ingest ACL drifted: %',v_txt
      using errcode='CLR10';
  end if;
  -- The legacy RELATION's full structure — CHECKs, FKs, every index, non-internal triggers,
  -- the RLS flags and owner, and every policy — pinned by EXACT definition. v1.0's tail pinned
  -- the column list and one index def, so a trigger drop, an FK relaxation or an RLS/policy
  -- alteration would have sailed through while the tail reported "byte identity".
  select encode(sha256(convert_to(
      coalesce((select string_agg(con.conname||'='||pg_get_constraintdef(con.oid),E'\n'
          order by con.conname) from pg_constraint con
         where con.conrelid='clara.client_egress_consents'::regclass),'')
    ||E'\n--idx--\n'||
      coalesce((select string_agg(pg_get_indexdef(i.indexrelid),E'\n'
          order by pg_get_indexdef(i.indexrelid)) from pg_index i
         where i.indrelid='clara.client_egress_consents'::regclass),'')
    ||E'\n--trg--\n'||
      coalesce((select string_agg(pg_get_triggerdef(t.oid),E'\n'
          order by pg_get_triggerdef(t.oid)) from pg_trigger t
         where t.tgrelid='clara.client_egress_consents'::regclass and not t.tgisinternal),'')
    ||E'\n--rls--\n'||
      (select c.relrowsecurity::text||','||c.relforcerowsecurity::text||','
              ||pg_get_userbyid(c.relowner) from pg_class c
        where c.oid='clara.client_egress_consents'::regclass)
    ||E'\n--pol--\n'||
      coalesce((select string_agg(pol.polname||'|'||pol.polcmd::text||'|'
          ||array_to_string(array(select pg_get_userbyid(r) from unnest(pol.polroles) r
              order by 1),',')||'|'
          ||coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')||'|'
          ||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),''),E'\n'
          order by pol.polname) from pg_policy pol
         where pol.polrelid='clara.client_egress_consents'::regclass),'')
    ,'UTF8')),'hex') into v_src;
  if v_src is distinct from
     '56362c965931283396b6aa13ab5b5429e625ac3331678c36e919af3665cedd11' then
    raise exception '0020 the legacy consent relation''s structure drifted (got %)',v_src
      using errcode='CLR10';
  end if;
  -- Signatures unchanged.
  if (select string_agg(pg_get_function_identity_arguments(p.oid),' | ' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname in ('grant_client_egress','revoke_client_egress',
         'claim_document_processing_task','_enqueue_invoice_facts_core'))
     is distinct from
     'p_document uuid | p_task uuid, p_workflow_run_id text, p_egress_approved boolean'
     ||' | p_client uuid, p_evidence_document uuid, p_scope_note text, p_op_key text'
     ||' | p_client uuid, p_reason text, p_op_key text' then
    raise exception '0020 a legacy egress signature drifted' using errcode='CLR10';
  end if;
  -- The legacy one-live index keeps its ORIGINAL definition (purpose-blind, client only).
  if (select indexdef from pg_indexes where schemaname='clara'
        and indexname='uq_client_egress_consents_one_live')
     is distinct from
     'CREATE UNIQUE INDEX uq_client_egress_consents_one_live ON clara.client_egress_consents USING btree (client_id) WHERE (revoked_at IS NULL)' then
    raise exception '0020 the legacy one-live index definition changed' using errcode='CLR10';
  end if;
  -- The legacy consent relation gained NO column.
  if (select string_agg(column_name,',' order by ordinal_position)
        from information_schema.columns
       where table_schema='clara' and table_name='client_egress_consents')
     is distinct from
     'id,firm_id,client_id,scope_note,evidence_document_id,granted_by,granted_at,revoked_by,revoked_at,revoke_reason' then
    raise exception '0020 client_egress_consents gained or lost a column' using errcode='CLR10';
  end if;

  -- ===================================================================
  -- FUNCTIONAL PROBE A (§3, §7) — the typed ladder end to end, in a forced-rollback
  -- subtransaction. grant -> STILL unknown -> activate -> granted -> consume -> granted ->
  -- second consume -> unknown -> revoke -> a fresh prepare is unknown again.
  -- ===================================================================
  begin
    v_f:=gen_random_uuid(); v_u:=gen_random_uuid(); v_c:=gen_random_uuid();
    v_dev:=gen_random_uuid();
    insert into clara.firms(id,name) values(v_f,'0020 probe A firm');
    insert into clara.users(id,display_name) values(v_u,'0020 probe A owner');
    insert into clara.firm_memberships(firm_id,user_id,role) values(v_f,v_u,'owner');
    insert into clara.clients(id,firm_id,name,status)
      values(v_c,v_f,'0020 probe A client','active');
    -- The evidence document is minted UNCLASSIFIED — exactly what an ingested letter looks
    -- like before anyone says what it is. The owner path stamps it (R1-F3); no fixture
    -- shortcut, and no legacy egress grant anywhere in this probe.
    insert into clara.documents(id,firm_id,sha256,original_filename,
        bytes_verified_at,storage_path)
      values(v_dev,v_f,repeat('a',64),'consent-a.pdf',now(),
        'firms/'||v_f::text||'/docs/'||repeat('a',64)||'.pdf');
    -- clara.jwt_sub() reads the whole claims blob (0002), not an individual claim GUC.
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub',v_u::text)::text,true);

    -- RATCHET R1-F3: the owner classification verb stamps consent_evidence and grants NOTHING.
    v_r:=clara.classify_consent_evidence_document(v_dev,'probe A signed letter',
      'probe-a-classify');
    if v_r->>'document_kind'<>'consent_evidence' then
      raise exception '0020 probe A: the owner evidence-classification verb did not stamp the kind (got %)',
        v_r::text using errcode='CLR10';
    end if;
    if exists(select 1 from clara.client_egress_consents where firm_id=v_f) then
      raise exception '0020 probe A: classifying evidence granted LEGACY egress'
        using errcode='CLR10';
    end if;
    if (select count(*) from clara.client_egress_purpose_consents where firm_id=v_f)<>0 then
      raise exception '0020 probe A: classifying evidence minted a typed consent'
        using errcode='CLR10';
    end if;

    -- A grant alone must NOT authorize.
    v_r:=clara.grant_client_egress_purpose(v_c,'wiki_synthesis',v_dev,
      '0020 probe A scope','probe-a-grant');
    v_consent:=(v_r->>'consent_id')::uuid;
    if v_r->>'status'<>'live' or v_consent is null then
      raise exception '0020 probe A: the typed grant did not go live (got %)',v_r::text
        using errcode='CLR10';
    end if;
    v_r:=clara.prepare_egress_dispatch(v_f,v_c,'wiki_synthesis',1,'counterparty.created');
    if v_r is distinct from jsonb_build_object('verdict','unknown','authorization_id',null) then
      raise exception '0020 probe A: a GRANT alone authorized dispatch (got %)',v_r::text
        using errcode='CLR10';
    end if;

    -- Activation lights it, for that client only.
    v_r:=clara.activate_client_egress_purpose(v_c,'wiki_synthesis',v_consent,
      'probe-a-activate');
    v_activation:=(v_r->>'activation_id')::uuid;
    if v_activation is null then
      raise exception '0020 probe A: activation returned no id (got %)',v_r::text
        using errcode='CLR10';
    end if;
    v_r:=clara.prepare_egress_dispatch(v_f,v_c,'wiki_synthesis',2,'counterparty.created');
    v_auth:=(v_r->>'authorization_id')::uuid;
    if v_r->>'verdict'<>'granted' or v_auth is null then
      raise exception '0020 probe A: an activated client was not granted (got %)',v_r::text
        using errcode='CLR10';
    end if;
    -- EXACTLY two keys, and nothing beyond the verdict + the opaque id.
    if (select count(*)::int from jsonb_object_keys(v_r))<>2 then
      raise exception '0020 probe A: the verdict leaked extra keys (got %)',v_r::text
        using errcode='CLR10';
    end if;

    -- RATCHET R1-F1 — THE DISPATCH RE-BINDING, proved before the happy path so a regression
    -- cannot hide behind it. A live, unexpired, same-firm authorization minted for THIS client
    -- is refused when presented for ANOTHER client, for another purpose, or for another
    -- (seq, type) — and is NOT consumed by the refusal, so its legitimate dispatch still works.
    v_c2:=gen_random_uuid();
    insert into clara.clients(id,firm_id,name,status)
      values(v_c2,v_f,'0020 probe A second client','active');
    if clara.consume_egress_dispatch(v_f,v_auth,v_c2,'wiki_synthesis',2,'counterparty.created')
       is distinct from jsonb_build_object('verdict','unknown') then
      raise exception '0020 probe A: an authorization minted for client A was consumable during a client B dispatch'
        using errcode='CLR10';
    end if;
    if clara.consume_egress_dispatch(v_f,v_auth,v_c,'not_a_purpose',2,'counterparty.created')
       is distinct from jsonb_build_object('verdict','unknown')
     or clara.consume_egress_dispatch(v_f,v_auth,v_c,'wiki_synthesis',99,'counterparty.created')
       is distinct from jsonb_build_object('verdict','unknown')
     or clara.consume_egress_dispatch(v_f,v_auth,v_c,'wiki_synthesis',2,'entry.approved')
       is distinct from jsonb_build_object('verdict','unknown') then
      raise exception '0020 probe A: a mismatched purpose / event_seq / event_type still consumed'
        using errcode='CLR10';
    end if;
    if exists(select 1 from clara.egress_dispatch_authorizations
        where id=v_auth and (consumed_at is not null or invalidated_at is not null)) then
      raise exception '0020 probe A: a re-binding refusal BURNED the authorization'
        using errcode='CLR10';
    end if;

    -- Consume once -> granted; consume twice -> unknown (single use, terminal).
    if clara.consume_egress_dispatch(v_f,v_auth,v_c,'wiki_synthesis',2,'counterparty.created')
       is distinct from jsonb_build_object('verdict','granted') then
      raise exception '0020 probe A: the first consume did not grant' using errcode='CLR10';
    end if;
    if clara.consume_egress_dispatch(v_f,v_auth,v_c,'wiki_synthesis',2,'counterparty.created')
       is distinct from jsonb_build_object('verdict','unknown') then
      raise exception '0020 probe A: a consumed authorization was reusable'
        using errcode='CLR10';
    end if;
    -- A foreign-firm consume of a real authorization is unknown.
    v_r:=clara.prepare_egress_dispatch(v_f,v_c,'wiki_synthesis',3,'counterparty.merged');
    v_auth:=(v_r->>'authorization_id')::uuid;
    if clara.consume_egress_dispatch(gen_random_uuid(),v_auth,v_c,'wiki_synthesis',3,
         'counterparty.merged')
       is distinct from jsonb_build_object('verdict','unknown') then
      raise exception '0020 probe A: a cross-firm consume was granted' using errcode='CLR10';
    end if;

    -- Withdrawal: the outstanding authorization is invalidated IN THE SAME TRANSACTION, the
    -- activation is deactivated, and a fresh prepare is unknown again.
    perform clara.revoke_client_egress_purpose(v_c,'wiki_synthesis','probe A withdrawal',
      'probe-a-revoke');
    if clara.consume_egress_dispatch(v_f,v_auth,v_c,'wiki_synthesis',3,'counterparty.merged')
       is distinct from jsonb_build_object('verdict','unknown') then
      raise exception '0020 probe A: an authorization survived its consent revocation'
        using errcode='CLR10';
    end if;
    if not exists(select 1 from clara.egress_dispatch_authorizations
        where id=v_auth and invalidated_at is not null
          and invalidated_reason='consent_revoked') then
      raise exception '0020 probe A: revocation did not invalidate the outstanding authorization'
        using errcode='CLR10';
    end if;
    if not exists(select 1 from clara.client_egress_purpose_activations
        where id=v_activation and deactivated_at is not null) then
      raise exception '0020 probe A: revocation did not deactivate the activation'
        using errcode='CLR10';
    end if;
    if clara.prepare_egress_dispatch(v_f,v_c,'wiki_synthesis',4,'counterparty.created')
       is distinct from jsonb_build_object('verdict','unknown','authorization_id',null) then
      raise exception '0020 probe A: a revoked client still authorizes' using errcode='CLR10';
    end if;

    -- CROSS-PURPOSE ISOLATION: the typed grant never touched the legacy relation, so the
    -- purpose-blind invoice-facts predicate still sees nothing for this client.
    if exists(select 1 from clara.client_egress_consents where client_id=v_c) then
      raise exception '0020 probe A: a typed grant wrote to the LEGACY consent relation'
        using errcode='CLR10';
    end if;

    -- Non-granted verdicts are BYTE-IDENTICAL across every distinguishable cause.
    v_c2:=gen_random_uuid();
    insert into clara.clients(id,firm_id,name,status)
      values(v_c2,v_f,'0020 probe A never-attested','active');
    if clara.prepare_egress_dispatch(v_f,v_c2,'wiki_synthesis',5,'counterparty.created')
       is distinct from
       clara.prepare_egress_dispatch(v_f,v_c,'wiki_synthesis',5,'counterparty.created')
     or clara.prepare_egress_dispatch(v_f,v_c,'not_a_purpose',5,'counterparty.created')
       is distinct from
       clara.prepare_egress_dispatch(gen_random_uuid(),gen_random_uuid(),'wiki_synthesis',5,
         'counterparty.created') then
      raise exception '0020 probe A: the non-granted payloads are distinguishable'
        using errcode='CLR10';
    end if;

    raise exception 'clara_0020_probe_rollback' using errcode='CLR99';
  exception
    when sqlstate 'CLR99' then null;   -- expected: fixtures discarded
  end;

  -- ===================================================================
  -- FUNCTIONAL PROBE B (§5) — the resolver's three discriminated shapes, the uniform
  -- not-found, and the classified gate. No wiki publication is attempted here: the probe
  -- asserts the RESOLUTION contract, which is what §5.1 pins.
  -- ===================================================================
  begin
    v_f:=gen_random_uuid(); v_u:=gen_random_uuid(); v_c:=gen_random_uuid();
    v_c2:=gen_random_uuid(); v_d:=gen_random_uuid(); v_dev:=gen_random_uuid();
    insert into clara.firms(id,name) values(v_f,'0020 probe B firm');
    insert into clara.users(id,display_name) values(v_u,'0020 probe B user');
    insert into clara.clients(id,firm_id,name,status) values(v_c,v_f,'0020 probe B A','active');
    insert into clara.clients(id,firm_id,name,status) values(v_c2,v_f,'0020 probe B B','active');
    -- v_dev is the UNVERIFIED document (the ingest floor); v_d is the verified one.
    insert into clara.documents(id,firm_id,sha256,original_filename)
      values(v_dev,v_f,repeat('e',64),'probe-b-unverified.pdf');
    insert into clara.documents(id,firm_id,sha256,original_filename,bytes_verified_at,
        storage_path)
      values(v_d,v_f,repeat('d',64),'probe-b.pdf',now(),
        'firms/'||v_f::text||'/docs/'||repeat('d',64)||'.pdf');
    insert into clara.document_filings(id,firm_id,document_id,client_id,basis)
      values(gen_random_uuid(),v_f,v_dev,v_c,'legacy-0007');

    -- UNIFORM NOT-FOUND: a filed-but-bytes-unverified document, a nonexistent document, a
    -- foreign-firm probe and a verified-but-unfiled document all return the SAME payload.
    if clara.resolve_document_client(v_f,v_dev)
       is distinct from jsonb_build_object('status','unresolved')
     or clara.resolve_document_client(v_f,gen_random_uuid())
       is distinct from jsonb_build_object('status','unresolved')
     or clara.resolve_document_client(gen_random_uuid(),v_d)
       is distinct from jsonb_build_object('status','unresolved')
     or clara.resolve_document_client(v_f,v_d)
       is distinct from jsonb_build_object('status','unresolved') then
      raise exception '0020 probe B: the uniform not-found shape is not uniform'
        using errcode='CLR10';
    end if;

    insert into clara.document_filings(id,firm_id,document_id,client_id,basis)
      values(gen_random_uuid(),v_f,v_d,v_c,'legacy-0007');
    if clara.resolve_document_client(v_f,v_d)
       is distinct from jsonb_build_object('status','unique','client_id',v_c) then
      raise exception '0020 probe B: a uniquely filed document did not resolve unique'
        using errcode='CLR10';
    end if;

    insert into clara.document_filings(id,firm_id,document_id,client_id,basis)
      values(gen_random_uuid(),v_f,v_d,v_c2,'legacy-0007') returning id into v_fil;
    v_r:=clara.resolve_document_client(v_f,v_d);
    if v_r is distinct from jsonb_build_object('status','ambiguous') then
      raise exception '0020 probe B: two clients did not resolve ambiguous (got %)',v_r::text
        using errcode='CLR10';
    end if;
    if v_r ? 'client_id' then
      raise exception '0020 probe B: an ambiguous resolution released a client id'
        using errcode='CLR10';
    end if;

    -- resolve_and_ingest agrees with the resolver, and writes nothing on ambiguity.
    if clara.resolve_and_ingest_wiki_source(v_f,v_d)
       is distinct from jsonb_build_object('status','skipped_ambiguous_client') then
      raise exception '0020 probe B: ambiguous ingest did not skip' using errcode='CLR10';
    end if;

    -- Retire B: the topology collapses to one, and the CLASSIFIED gate refuses publication
    -- because this document was never classified.
    update clara.document_filings set retired_at=now(),retired_by=v_u,
      retirement_reason='probe B' where id=v_fil;
    if clara.resolve_document_client(v_f,v_d)
       is distinct from jsonb_build_object('status','unique','client_id',v_c) then
      raise exception '0020 probe B: the collapsed topology did not re-resolve unique'
        using errcode='CLR10';
    end if;
    if clara.resolve_and_ingest_wiki_source(v_f,v_d)
       is distinct from jsonb_build_object('status','skipped_unclassified') then
      raise exception '0020 probe B: a never-classified document was not gated'
        using errcode='CLR10';
    end if;
    if exists(select 1 from clara.op_receipts where firm_id=v_f
        and fn='record_wiki_source_ingest') then
      raise exception '0020 probe B: the gated re-drive still reserved an ingest op'
        using errcode='CLR10';
    end if;

    raise exception 'clara_0020_probe_rollback' using errcode='CLR99';
  exception
    when sqlstate 'CLR99' then null;   -- expected: fixtures discarded
  end;

  -- ===================================================================
  -- FUNCTIONAL PROBE C (§1, §2) — immutability. A typed consent is INSERT-once /
  -- REVOKE-once; an authorization takes exactly one terminal.
  -- ===================================================================
  begin
    v_f:=gen_random_uuid(); v_u:=gen_random_uuid(); v_c:=gen_random_uuid();
    v_dev:=gen_random_uuid();
    insert into clara.firms(id,name) values(v_f,'0020 probe C firm');
    insert into clara.users(id,display_name) values(v_u,'0020 probe C user');
    insert into clara.clients(id,firm_id,name,status)
      values(v_c,v_f,'0020 probe C client','active');
    insert into clara.documents(id,firm_id,sha256,original_filename,document_kind,
        bytes_verified_at,storage_path)
      values(v_dev,v_f,repeat('c',64),'consent-c.pdf','consent_evidence',now(),
        'firms/'||v_f::text||'/docs/'||repeat('c',64)||'.pdf');
    insert into clara.client_egress_purpose_consents(id,firm_id,client_id,purpose,scope_note,
        evidence_document_id,granted_by)
      values(gen_random_uuid(),v_f,v_c,'wiki_synthesis','probe C',v_dev,v_u)
      returning id into v_consent;

    v_probe_ok:=false;
    begin
      delete from clara.client_egress_purpose_consents where id=v_consent;
    exception when sqlstate 'CLR08' then v_probe_ok:=true;
    end;
    if not v_probe_ok then
      raise exception '0020 probe C: a typed consent was deletable' using errcode='CLR10';
    end if;
    v_probe_ok:=false;
    begin
      update clara.client_egress_purpose_consents set scope_note='mutated'
        where id=v_consent;
    exception when sqlstate 'CLR08' then v_probe_ok:=true;
    end;
    if not v_probe_ok then
      raise exception '0020 probe C: a typed consent was mutable' using errcode='CLR10';
    end if;
    -- A second live consent for the same (client, purpose) is refused by the one-live index.
    v_probe_ok:=false;
    begin
      insert into clara.client_egress_purpose_consents(firm_id,client_id,purpose,scope_note,
          evidence_document_id,granted_by)
        values(v_f,v_c,'wiki_synthesis','probe C duplicate',v_dev,v_u);
    exception when unique_violation then v_probe_ok:=true;
    end;
    if not v_probe_ok then
      raise exception '0020 probe C: a second live typed consent was accepted'
        using errcode='CLR10';
    end if;
    -- An activation cannot name a consent of another purpose/client/firm (composite FK).
    insert into clara.client_egress_purpose_activations(id,firm_id,client_id,purpose,
        consent_id,activated_by)
      values(gen_random_uuid(),v_f,v_c,'wiki_synthesis',v_consent,v_u)
      returning id into v_activation;
    insert into clara.egress_dispatch_authorizations(id,firm_id,client_id,purpose,consent_id,
        activation_id,event_seq,event_type,expires_at)
      values(gen_random_uuid(),v_f,v_c,'wiki_synthesis',v_consent,v_activation,1,
        'counterparty.created',now()+interval '120 seconds')
      returning id into v_auth;
    update clara.egress_dispatch_authorizations set consumed_at=now() where id=v_auth;
    v_probe_ok:=false;
    begin
      update clara.egress_dispatch_authorizations set invalidated_at=now(),
        invalidated_reason='late' where id=v_auth;
    exception when sqlstate 'CLR08' then v_probe_ok:=true;
    end;
    if not v_probe_ok then
      raise exception '0020 probe C: a consumed authorization took a second terminal'
        using errcode='CLR10';
    end if;

    raise exception 'clara_0020_probe_rollback' using errcode='CLR99';
  exception
    when sqlstate 'CLR99' then null;   -- expected: fixtures discarded
  end;

  -- ===================================================================
  -- APPLY-TIME PRECONDITION (empirical, never assumed) — the structural basis of the §10
  -- DARK claim: ZERO typed consents, ZERO activations, ZERO authorizations at end of apply.
  -- Every functional probe above rolled back; if any fixture row survived, this fails.
  -- ===================================================================
  select (select count(*) from clara.client_egress_purpose_consents)
       + (select count(*) from clara.client_egress_purpose_activations)
       + (select count(*) from clara.egress_dispatch_authorizations) into v_n;
  if v_n<>0 then
    raise exception '0020 ships DARK only if the three typed relations are EMPTY (got % row(s))',
      v_n using errcode='CLR10';
  end if;
end
$tail$;
