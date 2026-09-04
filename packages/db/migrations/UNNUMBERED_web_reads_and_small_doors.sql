-- WEB READS AND SMALL DOORS — the seven backend gaps the repair-session web lanes are blocked on.
-- Refs #541 · CB-AE2E-007 (own DPA signature) · H-18 (client egress READ only) · CB-AE2E-018
-- (firm timeline) · C-1 (chat archive) · H-09 (counterparty identifiers) · CB-AE2E-035
-- (build frontier) · H-49 (DR canary registry) · 裁-117 · 裁-190.
--
-- UNNUMBERED at authoring; the number is claimed at merge prep under 裁-108. Until then the
-- runner SILENTLY SKIPS this file (`MIGRATION_LIKE`, scripts/migrate.mjs:59) — a green
-- `pnpm db:migrate` proves nothing about it, which is why every cell in
-- packages/db/tests/web-reads-and-doors.test.mjs gates on the LIVE CATALOG and never on a number.
--
-- WHY SEVEN SUBJECTS IN ONE FILE. They are mutually independent and every one of them is the
-- SAME shape: a fact `apps/web` must render and cannot reach, because the relation that owns it
-- is `force row level security` with a single `clara_fn_owner` policy and no application-role
-- grant. Splitting them would claim seven migration numbers and seven ceremony windows for what
-- is one additive cohort. The one change that is NOT additive — the statement lane's witness
-- totals rule — is deliberately in its own file (UNNUMBERED_stmt_witness_totals_and_institution
-- _code.sql) because it replaces a live audited body and carries its own D1 window.
--
-- FRONTEND HOMES (.claude/rules/db-migrations.md — every new clara_authenticated door names one):
--   clara.get_own_dpa_signature()          -> apps/web/components/entry/signup-dpa-form.tsx
--                                             (via a lib/registration/dpa-signature-reads.ts +
--                                              server wrapper mirroring dpa-reads.ts)
--   clara.client_egress_state(uuid)        -> the firm-admin compliance register panel
--                                             (apps/web/components/firm-admin/compliance-register-
--                                              panel.tsx gains a second, clearly-separated
--                                              section; see the PR body for why that panel's own
--                                              "pure READ" contract is preserved)
--   clara.list_firm_timeline(bigint,int)   -> /activity (apps/web/lib/firm/timeline.ts, beside
--                                             the existing agent-receipts feed, never merged
--                                             into it)
--   clara.archive_chat_session(uuid,text)  -> the Clara rail thread menu
--                                             (apps/web/components/clara/ClaraRail.tsx)
--   clara.set_counterparty_identifiers(...) -> the registers counterparty panel, a dialog beside
--                                             RenameCounterpartyDialog
--                                             (apps/web/components/registers/counterparty-
--                                              hygiene-panel.tsx)
--   clara.build_frontier()                 -> clara_runtime ONLY. Its home is the runtime
--                                             /build-info route (lane L9), not a browser: no
--                                             clara_authenticated grant is made here.
--   clara.dr_canary_subjects               -> NO UI, by ruling. Operator metadata read by the DR
--                                             drill as the connecting superuser; the explicit
--                                             non-UI ruling the rule asks for is in the PR body.
--
-- D1 INVENTORY (packages/db/README.md "Deploy contract"). This file replaces TWO trigger bodies
-- with `create or replace`, so an in-flight call that started before the commit runs the OLD
-- body and skips the new behaviour:
--   clara._tf_chat_session_update()          — widened to admit archived_at
--   clara._tf_counterparty_update_0011()     — non-merge whitelist widened by three columns
-- Neither is a money writer and neither LOSES a control under the old body (an old-body call
-- simply refuses the new column move), so the quiesce is precautionary rather than corrective —
-- but it is named because a reader must not have to derive it. No other body here is a recut;
-- everything else is a new object.

set local statement_timeout = '5min';
-- PRECAUTIONARY, not load-bearing: the two `create or replace function` calls below take an
-- ACCESS EXCLUSIVE lock on nothing but the pg_proc row, and the one ALTER TABLE adds a nullable
-- column with no default (a catalog-only rewrite in PG11+). The bound exists so a live deploy
-- that meets an unexpected long reader fails fast instead of blocking the writers behind it.
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE. Every claim this file makes about what it is editing, measured before anything
--    is written, so a false premise aborts rather than proceeding.
-- ==============================================================================================
do $pre$
declare
  v_n integer;
  v_def text;
begin
  -- 0.1 the relations each section reads must exist at the frontier this file sorts after.
  foreach v_def in array array[
    'clara.dpa_documents','clara.dpa_signatures',
    'clara.client_egress_consents','clara.client_egress_purpose_consents',
    'clara.client_egress_purpose_activations','clara.documents',
    'clara.domain_events','clara.event_types','clara.agent_act_receipts',
    'clara.chat_sessions','clara.counterparties','clara.schema_migrations'
  ] loop
    if to_regclass(v_def) is null then
      raise exception 'web-reads prestate: % is absent', v_def using errcode='CLR10';
    end if;
  end loop;
  if to_regclass('clara._agent_receipt_src_f_a4') is null then
    raise exception 'web-reads prestate: the F-A7 pi f_a4 receipt shim is absent' using errcode='CLR10';
  end if;

  -- 0.2 no door here may already exist under any signature spelling. A second definition would
  --     mean a sibling lane authored the same subject and this file would be overwriting it.
  foreach v_def in array array[
    'clara.get_own_dpa_signature()',
    'clara.client_egress_state(uuid)',
    'clara.list_firm_timeline(bigint,integer)',
    'clara.archive_chat_session(uuid,text)',
    'clara.set_counterparty_identifiers(uuid,uuid,text,text,text)',
    'clara.build_frontier()'
  ] loop
    if to_regprocedure(v_def) is not null then
      raise exception 'web-reads prestate: % already exists', v_def using errcode='CLR10';
    end if;
  end loop;
  if to_regclass('clara.firm_timeline_visible') is not null
     or to_regclass('clara.dr_canary_subjects') is not null then
    raise exception 'web-reads prestate: a relation this file creates already exists'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from information_schema.columns
   where table_schema='clara' and table_name='chat_sessions' and column_name='archived_at';
  if v_n<>0 then
    raise exception 'web-reads prestate: chat_sessions.archived_at already exists' using errcode='CLR10';
  end if;

  -- 0.3 THE TWO SPLICE PRE-IMAGES, probed by EXACT COUNT on the LIVE body (the 0040 S4.10 shape).
  --     A body that has drifted from the one these anchors were written against aborts here,
  --     before anything is applied, rather than silently splicing the wrong text.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid='clara._tf_chat_session_update()'::regprocedure;
  if v_def is null then
    raise exception 'web-reads prestate: clara._tf_chat_session_update() is GONE' using errcode='CLR10';
  end if;
  if position('archived_at' in v_def)<>0 then
    raise exception 'web-reads prestate: the chat-session update trigger already names archived_at -- this file has already been applied'
      using errcode='CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def,
    $a$array['visibility']) is distinct from (to_jsonb(old) - array['visibility'])$a$, '')))
    / length($a$array['visibility']) is distinct from (to_jsonb(old) - array['visibility'])$a$);
  if v_n<>1 then
    raise exception 'web-reads prestate: the chat-session allowed-column anchor appears % time(s) (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def,
    $a$if new.visibility <> old.visibility and not (old.visibility = $a$, '')))
    / length($a$if new.visibility <> old.visibility and not (old.visibility = $a$);
  if v_n<>1 then
    raise exception 'web-reads prestate: the chat-session one-way visibility anchor appears % time(s) (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p where p.oid='clara._tf_counterparty_update_0011()'::regprocedure;
  if v_def is null then
    raise exception 'web-reads prestate: clara._tf_counterparty_update_0011() is GONE' using errcode='CLR10';
  end if;
  if position('registration_normalized''' in v_def)<>0 then
    raise exception 'web-reads prestate: the counterparty whitelist already names registration_normalized -- this file has already been applied'
      using errcode='CLR10';
  end if;
  -- The POST-0040 four-column literal, whole. 0040's own tail asserts exactly this shape, so
  -- probing for it is also the proof that no later migration reverted the S4.10 splice.
  v_n := (length(v_def) - length(replace(v_def,
    $a$v_allowed:=array['name','name_normalized','payment_terms_days','updated_at'];$a$, '')))
    / length($a$v_allowed:=array['name','name_normalized','payment_terms_days','updated_at'];$a$);
  if v_n<>1 then
    raise exception 'web-reads prestate: the counterparty non-merge whitelist literal appears % time(s) (expected exactly 1) -- the body drifted', v_n
      using errcode='CLR10';
  end if;
  -- The MERGE branch is NOT touched by this file and must be present to prove this is the
  -- 0011+0040 body and not something else wearing the name.
  if position($m$v_allowed:=array['merged_into','retired_at','updated_at'];$m$ in v_def)=0 then
    raise exception 'web-reads prestate: the counterparty merge-branch whitelist is missing -- this is not the expected body'
      using errcode='CLR10';
  end if;

  -- 0.4 the f_a4 receipt shim must still be pi's typed-empty stub. Repointing a shim somebody
  --     else already wired would silently replace their projection with this one.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='_agent_receipt_src_f_a4'
     and position('agent_act_receipts' in pg_get_viewdef(c.oid))<>0;
  if v_n<>0 then
    raise exception 'web-reads prestate: _agent_receipt_src_f_a4 is already wired to a real table'
      using errcode='CLR10';
  end if;
  raise notice 'web-reads prestate: OK -- 12 relations + the f_a4 stub present, six door signatures free, both splice pre-images at exact count 1';
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. THE CALLER'S OWN DPA SIGNATURE (CB-AE2E-007).
-- ==============================================================================================
-- THE DEFECT THIS CLOSES. `SignupDpaForm` seeds its render from a local `useState(null)`, so a
-- registrant who signed yesterday, logged out and came back is shown the unsigned face and must
-- re-consent to be told they had already signed (`sign_dpa`'s `replay:true` arm, `0163:381-384`).
-- Nothing is corrupted; the person is simply made to press a consent button that records
-- nothing. There is no frontend-only fix: `clara.dpa_signatures` is `force row level security`
-- with a single `clara_fn_owner` policy and ZERO application-role grants (`0158:180-183`), and
-- `get_current_dpa_document()` (`0163:328`) returns the DOCUMENT with no caller predicate.
--
-- SELF-SCOPED BY `jwt_sub()`, NEVER BY A PARAMETER. A `p_user` argument on this door would be a
-- consent oracle: "has this person signed?" is exactly the question a pre-firm surface must not
-- answer about anybody but its own caller. There is no jwt_firm() here to catch a mistake — the
-- caller has no firm yet — so the scope is the actor id itself and nothing else.
--
-- THE JOIN IS THE COMPOSITE `(version, body_sha256)`, exactly as `open_checkout_intent` does at
-- `0163:432-434`. Joining on `version` alone would report a signature against SUPERSEDED bytes as
-- a signature against the current agreement. The FK `fk_dpa_signatures_document` (`0158:176-177`)
-- guarantees the join finds exactly one document row, so `is_current` is total, never null.
--
-- `is_current` MEANS "these bytes are the live agreement", NOT "you may proceed". A registrant
-- holding only a superseded signature must be shown the UNSIGNED face for the new text:
-- `sign_dpa` raises CLR09 on a stale version (`0163:366-368`) and `open_checkout_intent` requires
-- a CURRENT signature. The caller reads `is_current`, never merely "a row came back".
--
-- EVERY signature is returned, newest first, rather than only the current one. A caller that
-- asked only "am I current?" could not tell "never signed" from "signed an older text", and those
-- two states want different copy. The list is the caller's own consent history and nobody else's.
create function clara.get_own_dpa_signature()
returns table(dpa_version text, signed_at timestamptz, is_current boolean)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_actor uuid;
begin
  v_actor:=clara.jwt_sub();
  if v_actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  return query
  select s.dpa_version, s.signed_at, (d.effective_to is null) as is_current
    from clara.dpa_signatures s
    join clara.dpa_documents d
      on d.version=s.dpa_version and d.body_sha256=s.body_sha256
   where s.user_id=v_actor
   order by s.signed_at desc, s.dpa_version desc;
end $$;
revoke all on function clara.get_own_dpa_signature() from public;
grant execute on function clara.get_own_dpa_signature() to clara_authenticated;
comment on function clara.get_own_dpa_signature() is
  'CB-AE2E-007: the caller''s OWN DPA signatures, newest first, jwt_sub()-scoped and never '
  'parameterised. is_current joins the COMPOSITE (version, body_sha256) as open_checkout_intent '
  'does, so a signature against superseded bytes reads is_current=false rather than as signed.';

-- ==============================================================================================
-- 2. A CLIENT'S EGRESS CONSENT STATE (H-18 — the READ half only).
-- ==============================================================================================
-- SCOPE, STATED FIRST. This is the READ that every option in 裁-186's consent design needs and
-- none of them has. The consent DESIGN — firm-level versus per-client, what the interview
-- collects, which purposes a grant activates — is a separate lane's and is NOT decided here. No
-- write verb is added, no existing door's floor is moved.
--
-- THE MEASURED GAP. `client_egress_purpose_consents` and `..._activations` are `force row level
-- security` with a SINGLE `clara_fn_owner` all-policy and no table grant to any application role
-- (`0020:376-386`), and `0020:2145` actively asserts the legacy `client_egress_consents` never
-- gains one. So a panel can WRITE consent through the four granted doors and cannot READ what is
-- live — it could only infer state from a refusal, which is the "absence is not evidence" shape
-- the house forbids.
--
-- BOOKKEEPER+, NOT OWNER. The four WRITE doors are owner-floored (`0014:80`, `0123:332/397`) and
-- stay so. This read is floored at bookkeeper to match `audit_log`'s own human floor
-- (`0002:518-520`) and `agent_receipts_visible`'s (`0103:408-410`): a bookkeeper who is about to
-- code a client's documents needs to know whether the AI processing lane is authorised for that
-- client, and being unable to see it is how a lane gets run blind. It exposes no evidence bytes
-- and no personal data — a document id, a scope note the firm itself wrote, and timestamps.
--
-- ONE ROW PER RATIFIED PURPOSE, ALWAYS, PLUS ONE FOR THE LEGACY BLANKET CONSENT. Emitting only
-- the purposes that HAVE a consent would make "no consent for this purpose" and "the read
-- returned nothing" the same observation. The five purposes are written out to match the four
-- doors' own in-body allowlist (`0123:344-347`, `:400-403`) rather than derived from the CHECK
-- constraint: the doors' allowlist is what actually admits a grant, and deriving from the
-- constraint would let this read offer a purpose no door will accept.
--
-- `purpose IS NULL` IS THE LEGACY UNTYPED CONSENT (`clara.client_egress_consents`, `0011:910`),
-- which has no purpose column and no activation relation. NULL is its honest spelling; inventing
-- a token like 'legacy' would put a value into a namespace the CHECK constraints own. Its
-- `state` can therefore never be 'active' — there is nothing to activate — and the comment on
-- the function says so.
--
-- `evidence_kind` IS READ LIVE FROM THE DOCUMENT, never assumed. The typed doors require
-- `document_kind='consent_evidence'` at grant time (`0123:357-364`), but this read reports what
-- the document carries NOW; a divergence is a fact a compliance panel must be able to see.
-- 'owner_declaration' is the 0012(A) path, available on the legacy relation only
-- (`0012:30-31` dropped its NOT NULL), and it is derived from the NULL document, not guessed.
create function clara.client_egress_state(p_client uuid)
returns table(
  purpose              text,
  consent_id           uuid,
  consent_granted_at   timestamptz,
  consent_revoked_at   timestamptz,
  scope_note           text,
  evidence_document_id uuid,
  evidence_kind        text,
  activation_id        uuid,
  activated_at         timestamptz,
  deactivated_at       timestamptz,
  state                text)
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  c record;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_client is null then
    raise exception 'a client is required' using errcode='CLR10';
  end if;
  -- Firm scope is checked EXPLICITLY and refuses by name, never left to an empty result: a
  -- cross-firm client id and a client with no consent are different facts (create_counterparty's
  -- own reasoning, 0021:73-77).
  if not exists (select 1 from clara.clients cl where cl.id=p_client and cl.firm_id=c.firm) then
    raise exception 'client is not in your firm' using errcode='CLR11';
  end if;

  return query
  with purposes(purpose) as (
    values ('wiki_synthesis'),('statement_extraction'),('witness_extraction'),
           ('bank_matching'),('document_processing')
  ),
  -- The LIVE consent if there is one, else the most recently revoked — so a revoked consent
  -- reads as REVOKED rather than as absent, which is the distinction the panel exists to show.
  typed as (
    select distinct on (k.purpose)
           k.purpose, x.id, x.granted_at, x.revoked_at, x.scope_note, x.evidence_document_id
      from purposes k
      left join clara.client_egress_purpose_consents x
        on x.client_id=p_client and x.firm_id=c.firm and x.purpose=k.purpose
     order by k.purpose, (x.revoked_at is null) desc nulls last, x.granted_at desc nulls last
  ),
  -- The activation is looked up FROM THE CHOSEN CONSENT, never independently: an activation that
  -- belongs to a superseded consent must not be reported beside a different one.
  acts as (
    select distinct on (t.purpose)
           t.purpose, a.id, a.activated_at, a.deactivated_at
      from typed t
      left join clara.client_egress_purpose_activations a
        on a.consent_id=t.id and a.firm_id=c.firm and a.client_id=p_client and a.purpose=t.purpose
     order by t.purpose, (a.deactivated_at is null) desc nulls last, a.activated_at desc nulls last
  ),
  -- The legacy row is anchored on a one-row VALUES exactly as the typed rows are anchored on
  -- `purposes`, so it is present whether or not a legacy consent exists. A LEFT JOIN rather than
  -- a bare SELECT: without the anchor the row simply vanished when nothing had been granted, and
  -- "the blanket consent is absent" would then have been indistinguishable from "the read does
  -- not report blanket consent at all".
  legacy as (
    select distinct on (1)
           null::text as purpose, l.id, l.granted_at, l.revoked_at, l.scope_note,
           l.evidence_document_id
      from (values (1)) anchor(one)
      left join clara.client_egress_consents l
        on l.client_id=p_client and l.firm_id=c.firm
     order by 1, (l.revoked_at is null) desc nulls last, l.granted_at desc nulls last
  ),
  rows_out as (
    select t.purpose, t.id as consent_id, t.granted_at, t.revoked_at, t.scope_note,
           t.evidence_document_id, a.id as activation_id, a.activated_at, a.deactivated_at
      from typed t join acts a on a.purpose=t.purpose
    union all
    select g.purpose, g.id, g.granted_at, g.revoked_at, g.scope_note, g.evidence_document_id,
           null::uuid, null::timestamptz, null::timestamptz
      from legacy g
  )
  select r.purpose, r.consent_id, r.granted_at, r.revoked_at, r.scope_note, r.evidence_document_id,
         case when r.consent_id is null then null
              when r.evidence_document_id is null then 'owner_declaration'
              else coalesce(d.document_kind,'(unclassified)') end as evidence_kind,
         r.activation_id, r.activated_at, r.deactivated_at,
         case
           when r.consent_id is null then 'none'
           when r.revoked_at is not null then 'revoked'
           when r.activation_id is not null and r.deactivated_at is null then 'active'
           else 'granted'
         end as state
    from rows_out r
    left join clara.documents d on d.id=r.evidence_document_id and d.firm_id=c.firm
   -- The blanket (legacy) row LEADS: it is the broader grant and a panel reads it first. The
   -- typed rows then follow in name order. Ordering is part of the contract because apps/web
   -- renders the rows in the order it receives them.
   order by (r.purpose is not null), r.purpose;
end $$;
revoke all on function clara.client_egress_state(uuid) from public;
grant execute on function clara.client_egress_state(uuid) to clara_authenticated;
comment on function clara.client_egress_state(uuid) is
  'H-18 (READ half): one row per ratified typed egress purpose plus one for the legacy untyped '
  'blanket consent (purpose IS NULL, which has no activation relation and can therefore never '
  'read state=''active''). state is one of none|revoked|granted|active. Bookkeeper+ floor; the '
  'four WRITE doors stay owner-floored. Adds no table grant to the consent relations.';

-- ==============================================================================================
-- 3. THE FIRM TIMELINE (CB-AE2E-018) — a masked view, its keyset door, and the f_a4 shim repoint.
-- ==============================================================================================
-- WHAT EXISTS AND WHY NONE OF IT IS THIS. `clara.audit_log` is member-readable at bookkeeper+
-- (`0002:518-520`, real grant at `:534-536`) but has NO client_id and its `args` is the raw call
-- payload of every governed verb, unredacted. `clara.domain_events` is ordered, client-scoped and
-- typed, and is granted to clara_authenticated with a firm-only RLS predicate and NO role floor
-- (`0005:380-381`, `:408`) — so a rank-0 viewer reads every raw payload in the firm, which
-- audit_log walls them out of. `clara.agent_receipts_visible` is an AGENT receipt surface by
-- construction: a human's approve_entry appears nowhere in it.
--
-- THE PAYLOAD IS DROPPED ENTIRELY, NOT MASKED KEY BY KEY. A per-key allowlist over a jsonb
-- written by dozens of verbs is a leak waiting for its first new verb; the timeline answers
-- who / when / what kind / which client, and none of that needs the payload.
--
-- THE FLOOR IS BOOKKEEPER+, STATED AS A DECISION. audit_log says bookkeeper+, raw domain_events
-- says any member, and the new view has to pick one. It picks audit_log's, because an event
-- stream naming every client and every act is the same class of firm-internal history the
-- audit log is floored for. THE RAW `domain_events` GRANT IS DELIBERATELY LEFT ALONE: tightening
-- it is a wall change on a relation the runtime and the agent lanes also read, and it belongs
-- to whoever owns that wall, not to a read-model PR. The residual is named in the PR body.
--
-- THE VIEW FOLLOWS `agent_receipts_visible` (`0103:406-413`) for its SHAPE — the floor and the
-- tenant predicate both inside the view's own WHERE, a flat SELECT grant to clara_authenticated —
-- but it carries `security_barrier`, which that 2026-08 precedent does not.
--
-- WHY THE PRECEDENT IS NOT FOLLOWED ON THAT ONE POINT. 裁-15 (2026-08-28) is a LATER standing law
-- than `0103`, and it binds the catalog-derived same-shape family: every view owned by
-- clara_fn_owner, SELECT-granted to clara_authenticated, doing its OWN tenant scoping in the body
-- via jwt_firm()/actor_role_rank()/jwt_sub(). This view matches that predicate exactly, so it is a
-- member by construction and not by choice. `packages/db/tests/debt-human-read-surfaces.test.mjs`
-- derives the family FROM THE CATALOG rather than from a list, which is why it caught this on the
-- first estate run rather than at some later sweep — the census is doing precisely the job it was
-- built for, and its expected roster is trued from thirteen to fourteen in this same PR.
--
-- WHAT THE RELOPTION BUYS, stated so nobody reads more into it: qual-PUSHDOWN ORDER, never column
-- projection. The payload is absent from this view because it is never selected, not because of
-- the barrier.
create view clara.firm_timeline_visible with (security_barrier) as
  select
    e.firm_id                                                        as firm_id,
    e.seq                                                            as seq,
    e.id                                                             as event_id,
    e.event_type                                                     as event_type,
    t.description                                                    as event_description,
    e.client_id                                                      as client_id,
    e.actor                                                          as actor,
    e.on_behalf_of                                                   as on_behalf_of,
    e.via_wake_kind                                                  as via_wake_kind,
    coalesce(e.entry_id, e.document_id, e.resolution_id)             as object_id,
    case when e.entry_id is not null      then 'entry'
         when e.document_id is not null   then 'document'
         when e.resolution_id is not null then 'resolution'
         else null end                                               as object_kind,
    e.created_at                                                     as created_at
  from clara.domain_events e
  join clara.event_types t on t.name=e.event_type
  where e.firm_id=clara.jwt_firm()
    and coalesce(clara.actor_role_rank(),-1) >= clara.role_rank('bookkeeper');
grant select on clara.firm_timeline_visible to clara_authenticated;
comment on view clara.firm_timeline_visible is
  'CB-AE2E-018: the bookkeeper+ firm activity timeline over clara.domain_events. The PAYLOAD IS '
  'DROPPED, not key-masked. event_description is joined from clara.event_types. Order and page '
  'through clara.list_firm_timeline(bigint,int), which is the contract apps/web builds against.';

-- THE DOOR IS THE CONTRACT; THE VIEW IS THE SURFACE. `apps/web` reads through this function
-- rather than through `getRows` on the view, because the page order and the cursor are part of
-- the contract and a caller that composed its own `order by`/`limit` could page incorrectly
-- without ever being wrong about a row.
--
-- THE CURSOR IS `seq`, WHICH IS PER-FIRM MONOTONIC (`0005:81`) — a strictly better cursor than
-- created_at, which is not unique. READING ORDER IS NEWEST FIRST, so `p_after_seq` means "the
-- last seq I have already read": the next page is the rows STRICTLY OLDER than it. NULL starts
-- at the newest. This is spelled out because "after" in a descending feed is the one thing two
-- readers of this signature could reasonably read two ways.
--
-- IT REFUSES BELOW BOOKKEEPER RATHER THAN RETURNING ZERO ROWS. The view's own floor would make a
-- viewer's read look like an empty firm; the inline floor below makes it an honest CLR04 the UI
-- renders. (The floor is written out rather than delegated to `clara._human_ctx` — see the note
-- on the function's own header for why an invoker body cannot reach that helper.)
create function clara.list_firm_timeline(p_after_seq bigint, p_limit int)
returns table(
  seq               bigint,
  event_type        text,
  event_description text,
  client_id         uuid,
  actor             uuid,
  on_behalf_of      uuid,
  via_wake_kind     text,
  created_at        timestamptz)
  -- SECURITY INVOKER, and it is the ONLY door in this file that is. Every other one reads a
  -- relation with no application-role grant, so it must borrow the owner's rights to see anything
  -- at all. This one does not: `firm_timeline_visible` is SELECT-granted to clara_authenticated
  -- and does its own scoping, so running as the caller lets the VIEW's own predicate bind rather
  -- than being bypassed and re-implemented, and the function borrows no privilege it does not need.
  --
  -- AND THAT IS WHY THE FLOOR IS INLINE RATHER THAN `_human_ctx`. Measured on the rig: an INVOKER
  -- body cannot call `clara._human_ctx(int)` — it is an internal helper with no application-role
  -- EXECUTE grant, so the call raises `permission denied for function _human_ctx` for exactly the
  -- caller this door serves. The three checks below are `_human_ctx`'s own, written against the
  -- helpers that ARE granted to the app roles (`0004:760` grants jwt_sub / jwt_firm /
  -- actor_role_rank / role_rank), with the same CLR04 refusals in the same order. This is the one
  -- place in the file where a predicate is restated rather than delegated, and the reason is
  -- structural: delegation is not reachable from an invoker body.
  language plpgsql stable security invoker set search_path=clara,pg_temp as $$
declare
  c record;
  v_limit int;
begin
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode='CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode='CLR04';
  end if;
  if coalesce(clara.actor_role_rank(),-1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode='CLR04';
  end if;
  -- CLAMPED, NOT REFUSED. A page size is a transport preference, not a judgement, and a caller
  -- that asks for a million rows should get a page rather than an error. The ceiling is the DB's
  -- and the caller cannot raise it.
  v_limit := least(greatest(coalesce(p_limit,50),1),200);
  -- IT READS THE VIEW, NOT THE BASE TABLE, and that is the one design decision in this door worth
  -- stating. Re-deriving the predicate here would leave two objects that MUST agree free to drift:
  -- a later change to the view's floor or tenant predicate would silently not reach the door, and
  -- the page a caller gets would stop matching the surface it is a page OF. Under INVOKER the
  -- view's own `jwt_firm()` / `actor_role_rank()` run as the caller and bind directly — which is
  -- the point of the security mode, not a caveat to it — so the floor ends up enforced twice,
  -- deliberately. `c.firm` is resolved above only so a below-floor caller gets an honest CLR04
  -- instead of an empty firm; it is not used as a predicate here.
  return query
  select v.seq, v.event_type, v.event_description, v.client_id, v.actor, v.on_behalf_of,
         v.via_wake_kind, v.created_at
    from clara.firm_timeline_visible v
   where (p_after_seq is null or v.seq < p_after_seq)
   order by v.seq desc
   limit v_limit;
end $$;
revoke all on function clara.list_firm_timeline(bigint,integer) from public;
grant execute on function clara.list_firm_timeline(bigint,integer) to clara_authenticated;
comment on function clara.list_firm_timeline(bigint,integer) is
  'CB-AE2E-018: the keyset page of clara.firm_timeline_visible. p_after_seq is the LAST seq '
  'already read and the page returned is strictly OLDER than it (reading order is seq desc); '
  'NULL starts at the newest. p_limit is clamped to 1..200, default 50. Refuses CLR04 below '
  'bookkeeper rather than returning an empty firm.';

-- 3.b THE DORMANT f_a4 SHIM, REPOINTED. `clara.agent_act_receipts` (`0138:338-397`) is a real
-- table carrying every close-lane agent act, and it was reachable only through
-- `clara.list_agent_act_receipts`. Its receipt shim was never repointed, so close acts are
-- absent from the firm activity feed apps/web already reads. This is the one statement pi
-- designed for the purpose (`0103:36-44`).
--
-- THE COLUMN MAPPING, and the two places the names collide with the contract's:
--   verdict        <- r.rung_vector, NOT r.verdict. The contract's `verdict` is jsonb ("what the
--                     DB saw"); this table's `verdict` is the text discriminator 'acted'/'refused'
--                     (`0138:363`). Feeding the text through would fail the type wall, and the
--                     honest jsonb is the rung vector. This is the same footgun `_f_a6` names for
--                     its own `scope` column (`0131:1502-1508`).
--   failing_rungs  <- the vector's `token` values. `ck_aar_vector` (`0138:397`) makes the vector
--                     EMPTY exactly when the verdict is 'acted', so "empty means every rung
--                     passed" holds by construction and acted/refused stays recoverable.
--   trigger_kind   <- the 'wake_task' literal: every F-A4 act binds a wake task id mechanically
--                     (`0138:359-360`), and there is no chat-turn-triggered arm.
--   scope          <- the 'firm' literal. Every close act is firm-tenant; F-A4 has no platform act.
create or replace view clara._agent_receipt_src_f_a4 as
  select
    'agent_act'::text                   as receipt_kind,
    r.id::text                          as receipt_id,
    r.firm_id                           as firm_id,
    r.client_id                         as client_id,
    r.subject_id::text                  as subject_id,
    r.acting_actor                      as acting_actor,
    r.on_behalf_of                      as on_behalf_of,
    r.created_at                        as occurred_at,
    r.model_name                        as model,
    r.model_version                     as model_version,
    r.rationale                         as rationale,
    r.rung_vector                       as verdict,
    array(select x.el->>'token'
            from jsonb_array_elements(coalesce(r.rung_vector,'[]'::jsonb)) x(el))
                                        as failing_rungs,
    r.via_wake_kind                     as via_wake_kind,
    'wake_task'::text                   as trigger_kind,
    r.wake_task_id::text                as trigger_id,
    null::uuid                          as authorization_id,
    null::boolean                       as adopted_verbatim,
    'firm'::text                        as scope
  from clara.agent_act_receipts r;

select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a4');

-- ==============================================================================================
-- 4. CHAT SESSION ARCHIVE (C-1's backend half).
-- ==============================================================================================
-- NEVER A DELETE. `_tf_chat_session_update` already encodes reverse-not-delete for this table
-- (`0006:378`), the transcript is the audit record, and `chat_messages` is append-only. Archive
-- hides a thread from the default list; it destroys nothing and it is one-way, exactly like
-- private->firm sharing.
--
-- THE TRIGGER IS A POSITIVE COLUMN WHITELIST, so the column had to join it or the door would be
-- refused by the substrate rather than by any rule anybody wrote — the same shape 0040 S4.10 met
-- with payment_terms_days. The whitelist is the IMMUTABILITY wall, not the authorization wall:
-- clara_authenticated holds only SELECT on chat_sessions and clara_runtime only SELECT+INSERT
-- (`0006:774-775`), so no application role can reach a raw UPDATE at all.
alter table clara.chat_sessions add column archived_at timestamptz;
comment on column clara.chat_sessions.archived_at is
  'C-1: one-way archive stamp. NULL = live. Set only by clara.archive_chat_session (author-only, '
  'audited); the update trigger admits NULL->value and refuses value->NULL and value->value.';

do $chat_splice$
declare
  v_sig text := 'clara._tf_chat_session_update()';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid=v_sig::regprocedure;

  -- (a) the allowed-column set widens by exactly one name.
  v_frm := $a$array['visibility']) is distinct from (to_jsonb(old) - array['visibility'])$a$;
  v_cnt := (length(v_def) - length(replace(v_def,v_frm,''))) / length(v_frm);
  if v_cnt<>1 then
    raise exception 'chat splice (a): the anchor appears % time(s) at splice time', v_cnt using errcode='CLR10';
  end if;
  v_to := $t$array['visibility','archived_at']) is distinct from (to_jsonb(old) - array['visibility','archived_at'])$t$;
  v_def := replace(v_def,v_frm,v_to);

  -- (b) the ONE-WAY rule for the new column, inserted immediately before the one-way visibility
  --     rule it is modelled on. Un-archive is not offered: it is a product decision, and adding
  --     the arm later is additive while removing it would not be.
  v_frm := $a$if new.visibility <> old.visibility and not (old.visibility = $a$;
  v_cnt := (length(v_def) - length(replace(v_def,v_frm,''))) / length(v_frm);
  if v_cnt<>1 then
    raise exception 'chat splice (b): the anchor appears % time(s) at splice time', v_cnt using errcode='CLR10';
  end if;
  v_to := $t$if new.archived_at is distinct from old.archived_at
     and not (old.archived_at is null and new.archived_at is not null) then
    raise exception 'a chat session is archived once and never un-archived' using errcode = 'CLR08';
  end if;
  if new.visibility <> old.visibility and not (old.visibility = $t$;
  v_def := replace(v_def,v_frm,v_to);
  execute v_def;

  -- POSTCHECK on the installed body, re-read from the catalog.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid=v_sig::regprocedure;
  if position($p$array['visibility','archived_at']$p$ in v_def)=0 then
    raise exception 'chat splice postcheck: the widened allowed-column set did not land' using errcode='CLR10';
  end if;
  if position('never un-archived' in v_def)=0 then
    raise exception 'chat splice postcheck: the one-way archive rule did not land' using errcode='CLR10';
  end if;
  -- The two pre-existing walls must be untouched by this file.
  if position('chat sessions are not deleted' in v_def)=0
     or position('a chat session may only go private->firm' in v_def)=0 then
    raise exception 'chat splice postcheck: a pre-existing chat-session wall was disturbed' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid=v_sig::regprocedure)<>'clara_fn_owner' then
    raise exception 'chat splice postcheck: _tf_chat_session_update changed owner' using errcode='CLR10';
  end if;
end $chat_splice$;

-- ARCHIVE IS LIST-LEVEL ONLY, AND THAT IS THE DECISION RATHER THAN AN OVERSIGHT (裁-190 NIT 8).
-- `archived_at` is read by the session LIST and by nothing else: `authz.mjs:180-192` does not
-- consult it, a running SSE stream is unaffected, and `chatRoutes.ts:214` still accepts a new turn
-- on an archived thread. Kept deliberately for beta — an archived thread that quietly resumes when
-- a late answer arrives is safer than one that refuses a person mid-conversation, and a refusal
-- would have to be designed (which thread does the answer land in?) rather than merely added.
--
-- AUTHOR-ONLY AND ONE-WAY STANDS FOR BETA (裁-117's shape). A departed colleague's firm-shared
-- thread therefore cannot be archived by anyone, and un-archive does not exist. Both are recorded
-- as owner questions in the PR body rather than built: adding an un-archive arm later is additive,
-- while removing one would not be.
--
-- Modelled on `clara.share_chat_session` (`0006:894`) in every respect: the same viewer floor
-- (any active member may author a session, so any active member may archive their OWN), the same
-- author-only wall, the same `_reserve_op`/`_audit`/`_finish_op` triad, the same idempotent
-- return for a session that is already in the target state. It emits no domain event, for the
-- same reason share_chat_session does not: nothing downstream consumes a chat-visibility change.
create function clara.archive_chat_session(p_session uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; v_dedupe jsonb; s record;
begin
  c:=clara._human_ctx(clara.role_rank('viewer'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_session is null then
    raise exception 'a session is required' using errcode='CLR10';
  end if;
  v_dedupe:=clara._reserve_op(c.firm,'archive_chat_session',p_op_key,
    clara._hash(jsonb_build_object('s',p_session)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into s from clara.chat_sessions where id=p_session for update;
  if not found or s.firm_id<>c.firm then
    raise exception 'session not in your firm' using errcode='CLR11';
  end if;
  if s.created_by<>c.actor then
    raise exception 'only the author may archive a session' using errcode='CLR04';
  end if;
  if s.archived_at is not null then
    return clara._finish_op(c.firm,'archive_chat_session',p_op_key,
      jsonb_build_object('session_id',p_session,'archived_at',s.archived_at,'replay',true));
  end if;
  update clara.chat_sessions set archived_at=now() where id=p_session;
  select archived_at into s.archived_at from clara.chat_sessions where id=p_session;
  perform clara._audit(c.firm,c.actor,null,null,'archive_chat_session',null,
    jsonb_build_object('session',p_session,'op_key',p_op_key));
  return clara._finish_op(c.firm,'archive_chat_session',p_op_key,
    jsonb_build_object('session_id',p_session,'archived_at',s.archived_at));
end $$;
revoke all on function clara.archive_chat_session(uuid,text) from public;
grant execute on function clara.archive_chat_session(uuid,text) to clara_authenticated;
comment on function clara.archive_chat_session(uuid,text) is
  'C-1: author-only, one-way, audited archive of the caller''s own chat session. Never a delete '
  '(0006:378 is the reverse-not-delete law for this table). Idempotent: a second call replays.';

-- ==============================================================================================
-- 5. IDENTIFIERS ON AN EXISTING COUNTERPARTY (H-09).
-- ==============================================================================================
-- THE DEFECT. The settle gate's M4 rung reads `registration_normalized` and `tin` off the
-- selected counterparty (`0121:6120-6141`) and emits `payer_identifier_contradiction` =
-- 'not_evaluable' when neither identifier appears in the bank line. The ONLY writer of those
-- three columns anywhere in the estate is `create_counterparty`'s INSERT (`0021:104-106`) — so a
-- party born from the coding lane, or created without them, can never acquire them and its
-- settles are permanently not-evaluable. `0062`'s guard even contemplates the UPDATE case
-- (`0062:210-216`): a wall standing in front of a door that did not exist.
--
-- THE SHIPPED SIGNATURE IS FIVE ARGUMENTS, `p_client` FIRST — a deliberate deviation from the
-- order's four-argument sketch (`set_counterparty_identifiers(p_counterparty, p_registration_no,
-- p_tin, p_op_key)`), recorded here so the web lane builds against the real shape rather than the
-- sketch. `p_client` earns its place: with it the cross-firm refusal is an honest CLR11 read off
-- `clara.counterparties.client_id`, matching `rename_counterparty` (`0011:1750`) and
-- `merge_counterparties`; without it the door would have to INFER the client from the counterparty
-- and could not tell "not your client" from "no such counterparty" — an existence oracle on a
-- registers surface. Every sibling verb on this table takes the client first for the same reason.
--
-- ADMIN FLOOR, AND THE REASON. `create_counterparty` is bookkeeper because BIRTH of reference
-- data authorizes nothing. Introducing an identity onto a LIVE party is different in kind: it
-- changes how every future settle binds, and it is the act 0062's name-only wall exists to
-- govern. Admin is the orchestrator's call under 裁-190; the owner may lower it to bookkeeper,
-- which would be a one-line change and is put to them in the PR body.
--
-- THE 0062 GUARD IS LEFT TO RAISE ON ITS OWN. This door does not read `customer_identity_policy`
-- and does not re-implement the policy: the trigger is the wall, it sorts before the 0011 wall so
-- its specific reason is the one a caller sees, and a door that pre-checked it would be a second
-- copy of a security predicate — the exact drift 0062's own header refuses.
--
-- CLEARING TO NULL IS ACCEPTED. `0062:208-209` explicitly allows clearing, and a door that cannot
-- clear leaves a mistyped TIN permanent. Clearing a registration moves the row from one partial
-- unique index to the other, so the collision catch below covers both.
--
-- THE op_key HASH COVERS EVERY ARGUMENT THAT REACHES A STORED COLUMN, normalised first so '' and
-- NULL hash identically — `create_counterparty`'s own reasoning (`0021:81-92`), which exists so a
-- bookkeeper who fixes a mistyped registration and presses the button again gets an honest CLR10
-- rather than a stale receipt for the row they were trying to correct.
--
-- THE PARTIAL UNIQUES REFUSE BY NAME, never as a raw 23505:
--   uq_counterparties_client_registration      (client_id,kind,registration_normalized) WHERE reg NOT NULL
--   uq_counterparties_client_unregistered_name (client_id,kind,name_normalized)         WHERE reg NULL
--
-- AND THE CONSEQUENCE OF THAT PAIR, NAMED (裁-190 NIT 13). This door is the FIRST writer that can
-- move a LIVE counterparty between those two indexes: setting a registration takes the row out of
-- the unregistered-name index and into the registration one, and clearing it moves it back. That
-- changes how `create_counterparty`'s create-or-get resolves for the same client afterwards — a
-- later birth with the same NAME no longer collides once the row carries a registration, and a
-- later birth with the same REGISTRATION starts colliding. Before this door the assignment was
-- fixed at birth, so nothing could move; that is a real behavioural widening and it is stated here
-- rather than discovered. The 0062 name-only guard is unaffected and still refuses the whole
-- NAME-ONLY class (law 59) — the movement this door permits is between indexes, never around a wall.
do $cp_splice$
declare
  v_sig text := 'clara._tf_counterparty_update_0011()';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid=v_sig::regprocedure;
  v_frm := $f$v_allowed:=array['name','name_normalized','payment_terms_days','updated_at'];$f$;
  v_cnt := (length(v_def) - length(replace(v_def,v_frm,''))) / length(v_frm);
  if v_cnt<>1 then
    raise exception 'counterparty splice: the non-merge whitelist literal appears % time(s) at splice time', v_cnt
      using errcode='CLR10';
  end if;
  v_to := $t$-- H-09 (裁-190): the three identifier columns join the NON-MERGE whitelist so
    -- clara.set_counterparty_identifiers can write them. The whitelist is an IMMUTABILITY wall,
    -- not an authorization wall -- no application role holds UPDATE on clara.counterparties
    -- (0009:2879 grants SELECT and nothing else), so the only reachable writer is a
    -- SECURITY DEFINER door. The 0062 name-only guard sorts BEFORE this trigger and still
    -- refuses a flagged client's customer enrichment on its own. The MERGE branch stays frozen:
    -- a merged counterparty is immutable and an identity is not part of a merge.
    v_allowed:=array['name','name_normalized','payment_terms_days','registration_no','registration_normalized','tin','updated_at'];$t$;
  v_def := replace(v_def,v_frm,v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid=v_sig::regprocedure;
  if position($p$'registration_no','registration_normalized','tin'$p$ in v_def)=0 then
    raise exception 'counterparty splice postcheck: the widening did not land' using errcode='CLR10';
  end if;
  if position($m$v_allowed:=array['merged_into','retired_at','updated_at'];$m$ in v_def)=0 then
    raise exception 'counterparty splice postcheck: the merge branch was disturbed -- it must stay frozen'
      using errcode='CLR10';
  end if;
  if position('illegal counterparty mutation' in v_def)=0 then
    raise exception 'counterparty splice postcheck: the whitelist refusal itself is gone' using errcode='CLR10';
  end if;
  if position($p$v_allowed:=array['name','name_normalized','payment_terms_days','updated_at'];$p$ in v_def)<>0 then
    raise exception 'counterparty splice postcheck: the pre-splice four-column literal survives -- the replace did not land'
      using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid=v_sig::regprocedure)<>'clara_fn_owner' then
    raise exception 'counterparty splice postcheck: _tf_counterparty_update_0011 changed owner' using errcode='CLR10';
  end if;
end $cp_splice$;

create function clara.set_counterparty_identifiers(
    p_client uuid, p_counterparty uuid,
    p_registration_no text, p_tin text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare
  c record; v_dedupe jsonb; cp record;
  v_reg text; v_reg_n text; v_tin text; v_constraint text;
begin
  c:=clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key)='' then
    raise exception 'op_key is required' using errcode='CLR10';
  end if;
  if p_client is null or p_counterparty is null then
    raise exception 'counterparty identifiers are malformed' using errcode='CLR10';
  end if;

  -- Normalisation is BYTE-IDENTICAL to create_counterparty's (`0021:99-101`), which is itself
  -- byte-identical to the approve_entry birth path (`0011:3035-3037`). A door that normalised
  -- differently would let a human-set registration and a document-born one live side by side
  -- instead of colliding on the same partial unique.
  v_reg   := nullif(btrim(coalesce(p_registration_no,'')),'');
  v_tin   := nullif(btrim(coalesce(p_tin,'')),'');
  v_reg_n := case when v_reg is null then null
                  else lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
  -- A registration that normalises away entirely is not a registration; admitting it would store
  -- a display value under a NULL key and silently move the row into the unregistered-name index.
  if v_reg is not null and (v_reg_n is null or v_reg_n='') then
    raise exception 'the registration number contains no alphanumeric characters'
      using errcode='CLR10',detail='{"reason":"registration_unusable"}';
  end if;

  v_dedupe:=clara._reserve_op(c.firm,'set_counterparty_identifiers',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'r',v_reg,'t',v_tin)));
  if v_dedupe is not null then return v_dedupe; end if;

  select * into cp from clara.counterparties where id=p_counterparty for update;
  if not found or cp.firm_id<>c.firm or cp.client_id<>p_client then
    raise exception 'counterparty not found' using errcode='CLR11';
  end if;
  if cp.merged_into is not null or cp.retired_at is not null then
    raise exception 'counterparty target is retired'
      using errcode='CLR23',detail='{"reason":"target_retired"}';
  end if;

  begin
    update clara.counterparties
       set registration_no=v_reg, registration_normalized=v_reg_n, tin=v_tin, updated_at=now()
     where id=p_counterparty;
  exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint='uq_counterparties_client_registration' then
      raise exception 'another live counterparty of this client and kind already carries that registration number'
        using errcode='CLR23',detail='{"reason":"registration_collision"}';
    elsif v_constraint='uq_counterparties_client_unregistered_name' then
      raise exception 'clearing the registration would collide with an existing unregistered party of the same name and kind'
        using errcode='CLR23',detail='{"reason":"unregistered_name_collision"}';
    end if;
    raise;
  end;

  perform clara._audit(c.firm,c.actor,null,null,'set_counterparty_identifiers',null,
    jsonb_build_object('client',p_client,'counterparty',p_counterparty,
      'former_registration_no',cp.registration_no,'former_tin',cp.tin,
      'registration_no',v_reg,'tin',v_tin,'op_key',p_op_key));
  return clara._finish_op(c.firm,'set_counterparty_identifiers',p_op_key,
    jsonb_build_object('counterparty_id',p_counterparty,
      'registration_no',v_reg,'registration_normalized',v_reg_n,'tin',v_tin));
end $$;
revoke all on function clara.set_counterparty_identifiers(uuid,uuid,text,text,text) from public;
grant execute on function clara.set_counterparty_identifiers(uuid,uuid,text,text,text) to clara_authenticated;
comment on function clara.set_counterparty_identifiers(uuid,uuid,text,text,text) is
  'H-09: record or clear the registration number and TIN on an EXISTING counterparty. Admin '
  'floor; op_key hash covers every stored argument; normalisation byte-identical to '
  'create_counterparty; both partial uniques refuse by name; the 0062 name-only guard is left to '
  'raise on its own and is never re-implemented here.';

-- ==============================================================================================
-- 6. THE MIGRATION FRONTIER, FOR THE RUNTIME ONLY (CB-AE2E-035).
-- ==============================================================================================
-- A DEFINER RATHER THAN A TABLE GRANT. `clara.schema_migrations` is the runner's own ledger and
-- its only grant is `select ... to clara_fn_owner` (`0028:45`). A broad SELECT on it would hand
-- clara_runtime a schema-history oracle nobody asked for; two aggregates is the whole answer a
-- /build-info route needs.
--
-- IT RETURNS jsonb, NOT `returns table(count bigint, ...)`, AND THAT IS NOT A STYLE CHOICE. A
-- plpgsql OUT parameter named `count` shadows the aggregate inside the body, so `select count(*)`
-- in the same function stops meaning what it reads as. The two keys are exactly the ones the item
-- asks for; the shape is the map's own.
--
-- FRONTEND HOME: none in the browser. EXECUTE goes to clara_runtime and to nothing else — no
-- clara_authenticated grant, no agent grant, no wake grant. Its consumer is the runtime
-- /build-info route (lane L9), and the ACL is asserted exactly in the tail.
create function clara.build_frontier() returns jsonb
  language sql stable security definer set search_path=clara,pg_temp as $$
  select jsonb_build_object(
    'count', (select count(*) from clara.schema_migrations),
    'max_version', (select max(version) from clara.schema_migrations));
$$;
revoke all on function clara.build_frontier() from public;
grant execute on function clara.build_frontier() to clara_runtime;
comment on function clara.build_frontier() is
  'CB-AE2E-035: {count, max_version} over clara.schema_migrations. EXECUTE to clara_runtime ONLY '
  '(the runtime /build-info route); the table itself gains no new grant. Returns jsonb because a '
  'plpgsql OUT parameter named `count` shadows the aggregate.';

-- ==============================================================================================
-- 7. THE DR CANARY SUBJECT REGISTRY (H-49).
-- ==============================================================================================
-- THE DEFECT. `checkCanary` (`packages/db/scripts/dr-verify-checks.mjs:394-435`) builds both of
-- its §4.9 subjects from string literals embedded in SQL — `id::text like 'daba7f2e%'` and
-- `like '032767e6%'`. Nothing derives them: no seed plants them, no table registers them. So the
-- instrument measures a SPELLING, not the property it exists to prove (review law 3), and it
-- fails BOTH ways — a reset turns STRICT red for a reason unrelated to disaster recovery, and a
-- NEW parked subject doing exactly the same job is invisible.
--
-- THIS FILE SHIPS THE REGISTRY ONLY. Rewriting `checkCanary` to iterate it is lane L9/ops and is
-- named as owed in the PR body; nothing in this migration changes any drill's behaviour today.
--
-- THE REGISTRY IS BORN EMPTY, AND THAT IS A MEASUREMENT, NOT AN OMISSION. 裁-160 (owner,
-- 2026-09-03) ruled that `clara.agent_interruptions` `daba7f2e%` and `clara.agent_tasks`
-- `032767e6%` go with `DROP SCHEMA clara CASCADE` at the FS-11 reset, and 裁-172 (OD-22) ruled
-- that the replacement §4.9 subject is named from the POST-RESET estate at the final truing. Both
-- old subjects are therefore dead, and the estate holds only 8-hex PREFIXES for them in any case
-- — this table's key is an exact uuid. Seeding a fabricated uuid, or re-recording a prefix, would
-- reproduce the very defect H-49 reports. The rows are planted by the ceremony that reads the
-- live ids; the migration provides the shelf, not the contents.
--
-- WHO MAY INSERT: MIGRATION AND CEREMONY ONLY. Forced RLS with a single clara_fn_owner all-policy
-- and NO application-role grant of any kind — the same shape `0158`'s dpa_documents carries. A
-- firm owner is not the estate operator, so an owner-floored door would make the drill's own
-- subject forgeable by a tenant, which is the property H-49 exists to protect. The scoped-human-
-- read half of the .claude/rules/db-migrations.md policy pair is deliberately ABSENT and this is
-- why: the relation carries no firm_id to scope on. It is operator metadata about the estate, not
-- tenant data, and there is no tenant predicate that could be written for it.
--
-- THE POLARITY THE L9 CONSUMER MUST IMPLEMENT, recorded here beside the shelf so it cannot drift:
--   * registry EMPTY under STRICT            -> FAIL ("a live drill with no registered subject
--                                               proves nothing"), never a skip;
--   * registered subject absent from TARGET  -> FAIL ("the restore lost it");
--   * registered subject absent from BOTH    -> FAIL (registry drift), a DIFFERENT message;
--   * an UNREGISTERED parked row             -> NOT reported (the positive control that proves
--                                               the instrument reads the registry, not a wildcard).
create table clara.dr_canary_subjects (
  relation      text        not null check (relation in ('agent_interruptions','agent_tasks')),
  subject_id    uuid        not null,
  note          text        not null check (btrim(note) <> ''),
  registered_at timestamptz not null default now(),
  primary key (relation, subject_id)
);
comment on table clara.dr_canary_subjects is
  'H-49: the DR drill''s §4.9 parked-subject registry. Planting a replacement canary is an INSERT '
  'here, not an edit to dr-verify-checks.mjs. Migration/ceremony writes only: forced RLS, one '
  'clara_fn_owner policy, no application-role grant. Born EMPTY by 裁-160/裁-172 — both former '
  'subjects die with the FS-11 reset and the replacement is named post-reset.';

alter table clara.dr_canary_subjects enable row level security;
alter table clara.dr_canary_subjects force row level security;
create policy p_dr_canary_subjects_owner on clara.dr_canary_subjects
  for all to clara_fn_owner using (true) with check (true);

-- The append-only family, so a planted subject cannot be quietly re-pointed at a different row:
-- retiring a subject is a DELETE by the ceremony principal, which the owner policy admits and no
-- application role can reach; MUTATING one in place is refused outright.
create trigger t_dr_canary_subjects_no_update before update on clara.dr_canary_subjects
  for each row execute function clara._tf_append_only();
create trigger t_dr_canary_subjects_no_truncate before truncate on clara.dr_canary_subjects
  for each statement execute function clara._tf_no_truncate();

reset role;

-- ==============================================================================================
-- 8. FAIL-CLOSED TAIL. Every claim above is positively RE-READ from the live catalog after
--    privileges are final. A tail that only says OK has proven nothing.
-- ==============================================================================================
do $tail$
declare
  v_n integer;
  v_sig regprocedure;
  v_acl text[];
  v_cols text;
begin
  -- 8.1 THE SIX DOORS: exact signature, owner, SECURITY DEFINER, volatility, and an EXACT
  --     EXECUTE set. `has_function_privilege('public',...)` is checked separately because a
  --     PUBLIC grant does not appear as a grantee row the way a role grant does.
  for v_sig, v_cols in
    select * from (values
      ('clara.get_own_dpa_signature()'::regprocedure,                          'clara_authenticated'),
      ('clara.client_egress_state(uuid)'::regprocedure,                        'clara_authenticated'),
      ('clara.list_firm_timeline(bigint,integer)'::regprocedure,               'clara_authenticated'),
      ('clara.archive_chat_session(uuid,text)'::regprocedure,                  'clara_authenticated'),
      ('clara.set_counterparty_identifiers(uuid,uuid,text,text,text)'::regprocedure,'clara_authenticated'),
      ('clara.build_frontier()'::regprocedure,                                 'clara_runtime')
    ) t(s,g)
  loop
    -- OWNERSHIP is asserted for all six; SECURITY DEFINER for five. list_firm_timeline is
    -- deliberately INVOKER (see its own header), and asserting that EXACTLY here is what stops a
    -- later recut from silently promoting it to definer.
    select count(*) into v_n from pg_proc p
     where p.oid=v_sig and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and p.prosecdef = (v_sig <> 'clara.list_firm_timeline(bigint,integer)'::regprocedure);
    if v_n<>1 then
      raise exception 'web-reads tail: %. is not owned by clara_fn_owner at its expected security mode', v_sig
        using errcode='CLR10';
    end if;
    select array_agg(distinct grantee order by grantee) into v_acl
      from (select (aclexplode(p.proacl)).grantee::regrole::text as grantee
              from pg_proc p where p.oid=v_sig) g
     where grantee<>'clara_fn_owner';
    if v_acl is distinct from array[v_cols] then
      raise exception 'web-reads tail: %. EXECUTE set is %, not exactly {%}',
        v_sig, coalesce(v_acl::text,'(none)'), v_cols using errcode='CLR10';
    end if;
    if has_function_privilege('public',v_sig,'execute') then
      raise exception 'web-reads tail: %. is still executable by PUBLIC', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- 8.2 THE FOUR READ DOORS ARE STABLE (they write nothing) and the two WRITE doors are VOLATILE.
  select count(*) into v_n from pg_proc p
   where p.oid in ('clara.get_own_dpa_signature()'::regprocedure,
                   'clara.client_egress_state(uuid)'::regprocedure,
                   'clara.list_firm_timeline(bigint,integer)'::regprocedure,
                   'clara.build_frontier()'::regprocedure)
     and p.provolatile='s';
  if v_n<>4 then
    raise exception 'web-reads tail: % of 4 read doors are STABLE', v_n using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_proc p
   where p.oid in ('clara.archive_chat_session(uuid,text)'::regprocedure,
                   'clara.set_counterparty_identifiers(uuid,uuid,text,text,text)'::regprocedure)
     and p.provolatile='v';
  if v_n<>2 then
    raise exception 'web-reads tail: % of 2 write doors are VOLATILE', v_n using errcode='CLR10';
  end if;

  -- 8.3 NO NEW TABLE GRANT ANYWHERE THIS COHORT TOUCHES. The doors are the ONLY new read paths;
  --     if a grant appeared, the wall each door exists to preserve would already be gone.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='clara'
     and table_name in ('dpa_documents','dpa_signatures','client_egress_consents',
                        'client_egress_purpose_consents','client_egress_purpose_activations',
                        'schema_migrations','dr_canary_subjects')
     and grantee not in ('clara_fn_owner','postgres');
  if v_n<>0 then
    raise exception 'web-reads tail: % application-role table grant(s) appeared on a walled relation', v_n
      using errcode='CLR10';
  end if;

  -- 8.4 THE TIMELINE VIEW: it EXISTS, it is granted to clara_authenticated, and its column list
  --     carries NO payload column. The column list is asserted whole rather than by absence of
  --     one name, so a later trailing append cannot silently shift the ordinals apps/web reads.
  select string_agg(column_name,',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema='clara' and table_name='firm_timeline_visible';
  if v_cols is distinct from
     'firm_id,seq,event_id,event_type,event_description,client_id,actor,on_behalf_of,via_wake_kind,object_id,object_kind,created_at' then
    raise exception 'web-reads tail: firm_timeline_visible column list is [%]', coalesce(v_cols,'(absent)')
      using errcode='CLR10';
  end if;
  if not has_table_privilege('clara_authenticated','clara.firm_timeline_visible','select') then
    raise exception 'web-reads tail: firm_timeline_visible is not readable by clara_authenticated'
      using errcode='CLR10';
  end if;
  -- 裁-15: this view is a member of the catalog-derived same-shape family by construction, so it
  -- carries security_barrier. Asserted HERE as well as in the estate census, because a migration
  -- that quietly dropped the reloption on a recut would otherwise only surface at the next run of
  -- a battery in a different file.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='firm_timeline_visible'
     and c.reloptions @> array['security_barrier=true'];
  if v_n<>1 then
    raise exception 'web-reads tail: firm_timeline_visible does not carry security_barrier=true (裁-15)'
      using errcode='CLR10';
  end if;
  -- Its own two floors must both be IN the view definition, not merely intended.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='firm_timeline_visible'
     and position('jwt_firm()' in pg_get_viewdef(c.oid))<>0
     and position('actor_role_rank()' in pg_get_viewdef(c.oid))<>0
     and position('payload' in pg_get_viewdef(c.oid))=0;
  if v_n<>1 then
    raise exception 'web-reads tail: firm_timeline_visible is missing a floor, or names payload'
      using errcode='CLR10';
  end if;

  -- 8.5 THE f_a4 SHIM REACHES ITS REAL MEMBER TABLE and still conforms to the contract.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='_agent_receipt_src_f_a4'
     and position('agent_act_receipts' in pg_get_viewdef(c.oid))<>0;
  if v_n<>1 then
    raise exception 'web-reads tail: the f_a4 shim does not reach clara.agent_act_receipts'
      using errcode='CLR10';
  end if;
  perform clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a4');

  -- 8.6 THE CHAT COLUMN + ITS TRIGGER, and the counterparty whitelist, both re-read.
  select count(*) into v_n from information_schema.columns
   where table_schema='clara' and table_name='chat_sessions'
     and column_name='archived_at' and is_nullable='YES' and data_type='timestamp with time zone';
  if v_n<>1 then
    raise exception 'web-reads tail: chat_sessions.archived_at is not a nullable timestamptz'
      using errcode='CLR10';
  end if;
  -- BOTH trigger facts, re-read from the LIVE body rather than trusted from the splice's own
  -- postcheck: the widened allowed-column set AND the one-way archive rule. The splice asserted
  -- them at splice time; this asserts them after privileges are final, which is what the tail is
  -- for. The two pre-existing walls are re-read with them, so a widening that quietly opened more
  -- than one column fails here.
  select count(*) into v_n from pg_proc p
   where p.oid='clara._tf_chat_session_update()'::regprocedure
     and position($p$array['visibility','archived_at']$p$ in p.prosrc)<>0
     and position('never un-archived' in p.prosrc)<>0
     and position('chat sessions are not deleted' in p.prosrc)<>0
     and position('a chat session may only go private->firm' in p.prosrc)<>0;
  if v_n<>1 then
    raise exception 'web-reads tail: the chat-session trigger is missing the widened column set, the one-way archive rule, or a pre-existing wall'
      using errcode='CLR10';
  end if;
  -- And the counterparty whitelist, the same way and for the same reason.
  select count(*) into v_n from pg_proc p
   where p.oid='clara._tf_counterparty_update_0011()'::regprocedure
     and position($p$'registration_no','registration_normalized','tin'$p$ in p.prosrc)<>0
     and position($p$v_allowed:=array['merged_into','retired_at','updated_at'];$p$ in p.prosrc)<>0
     and position('illegal counterparty mutation' in p.prosrc)<>0;
  if v_n<>1 then
    raise exception 'web-reads tail: the counterparty whitelist is missing the identifier columns, the frozen merge branch, or its refusal'
      using errcode='CLR10';
  end if;

  -- 8.7 THE DR REGISTRY: forced RLS, exactly one policy, zero rows, and its two triggers.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='clara' and c.relname='dr_canary_subjects' and c.relrowsecurity and c.relforcerowsecurity;
  if v_n<>1 then
    raise exception 'web-reads tail: dr_canary_subjects does not carry FORCED row level security'
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_policies
   where schemaname='clara' and tablename='dr_canary_subjects';
  if v_n<>1 then
    raise exception 'web-reads tail: dr_canary_subjects carries % policies, expected exactly 1', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from clara.dr_canary_subjects;
  if v_n<>0 then
    raise exception 'web-reads tail: dr_canary_subjects is not empty at birth (% row(s)) -- 裁-160/172 say both former subjects are dead and the replacement is named post-reset', v_n
      using errcode='CLR10';
  end if;
  select count(*) into v_n from pg_trigger
   where tgrelid='clara.dr_canary_subjects'::regclass and not tgisinternal;
  if v_n<>2 then
    raise exception 'web-reads tail: dr_canary_subjects carries % user trigger(s), expected 2', v_n
      using errcode='CLR10';
  end if;

  raise notice 'web-reads tail: OK -- six doors at exact signatures (five clara_authenticated, build_frontier clara_runtime-only, PUBLIC refused on all six, four stable + two volatile); firm_timeline_visible granted with a 12-column payload-free projection carrying BOTH floors; the f_a4 receipt shim reaches clara.agent_act_receipts and conforms; chat_sessions.archived_at is a nullable timestamptz behind a widened one-way trigger; the counterparty non-merge whitelist admits the three identifier columns with the merge branch frozen; clara.dr_canary_subjects is forced-RLS, one policy, two triggers, ZERO rows by 裁-160/172; and ZERO application-role table grants appeared on any of the seven walled relations.';
end $tail$;
