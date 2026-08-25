-- 0132_f_a5b_pr1_sandbox_export.sql -- Wave F Track-A item F-A5b, PR-1: the sandbox export
-- lane's DB layer. Three new relations, five ungranted cores, nine verbs (six wake, three
-- clara_runtime worker verbs, three human), one CoR (clara.watermark_policy_for, 0111 -- delegates
-- to the new shared resolver core rather than losing its own body), the wake_fn_allowlist rows,
-- the owner-ratified `sandbox_watermark` trio (en/ms/zh), and the closed-world censuses this lane owns.
--
-- Number is claimed at MERGE by the conductor (standing law); this file names none.
--
-- DESIGN OF RECORD: docs/plan/active/sandbox-export-design.md (v2, gate-folded 2026-08-23) SS3.1-
-- SS3.4, SS3.6-SS3.6b · sandbox-export-design-part2.md SS3.7-SS7 · sandbox-export-annexes.md
-- (Annex A surface, B battery, C decisions, H/J/K). Gate record: sandbox-export-gate-record.md
-- (both owner cards RULED 2026-08-23 -- the substitution seam, SS3.6b; the firm-level disclosure
-- register, SS7 card 2). Estate survey: sandbox-export-survey.md (X1-X12, U1-U6).
--
-- ============================ FIX-ROUND NOTE (post-push, both review legs) =========================
-- This revision folds TIER A of the conductor's consolidated mandate from the independent
-- implementation review (opus, fresh context) and the law-28 cross-model adversarial pass (Codex),
-- both run against tip 70ad2fa. TIER B (the substitution seam's numeral path; the disclosure-
-- authorization register's own design, its retirement lever, and the delivery-vs-generation threat
-- model) are OWNER CARDS, not built here -- A9 below is the enforcing wall for the second one, not
-- a resolution of it. Every fix below is annotated at its site with the finding it answers.
--
-- ============================ D1 -- NONE FOR EVERY NEW OBJECT; ONE NAMED CoR ========================
-- This file mints no relation, function or grant that replaces a live BEHAVIOURAL surface except
-- one: clara.watermark_policy_for(text,text,date) (0111, F-A5 PR-1) is CoR'd so its body delegates
-- to the new shared resolver core (_watermark_policy_version_for) instead of duplicating the
-- predicate a second time (opus F2). Its EXTERNAL signature, return shape and refusal are
-- byte-identical in behaviour; SECTION 5b's prestate pins the pre-image prosrc sha256 and the tail
-- re-proves the delegation, the estate's own superseded-body law. No live CALLER of
-- watermark_policy_for exists yet (F-A5 PR-4 has not landed), so this CoR needs no D1
-- write-quiesce window -- named here so a reader does not have to derive that from the D1 header's
-- usual absence.
--
-- ============================ SCOPE OF THIS FILE, AND WHAT IT DOES NOT BUILD =======================
-- PR-1 per the design's own train (SS6): three relations, the coverage check, the derivation, the
-- verbs (wrappers minted here; EXECUTE + allowlist rows land in the SAME file per this lane's own
-- Annex A.2 -- unlike F-A5's five-file PR-2 split, this lane has no D1 obligation forcing a
-- part-2/grants separation, so wrapper + grant + allowlist ship together, same commit, same
-- discipline as F-A5's own PR-1 DDL-plus-resolver shipping). The renderer's second entrance
-- (`layoutSandbox`, the byte-burn, G-1/G-2) is F-A5b's OWN PR-3, which lands AFTER F-A5 PR-4 (not
-- yet landed at authoring time) -- out of scope here.
--
-- ============================ THE SUBSTITUTION SEAM (SS3.6b) -- WHAT PR-1 BUILDS OF IT =============
-- Card 1 was RULED 2026-08-23: the model writes PLACEHOLDERS, never a typed numeral; a durable
-- result row's basis_ref pin is what a later render step (F-A5b PR-3) resolves into bytes. What
-- THIS file builds is the PROVENANCE HALF that ruling requires now -- never a numeral-substitution
-- engine, which needs a result-carrying column on freeform_read_log that does not exist yet (survey
-- X6/X11). TIER A's fail-safe interim (SECTION 5c below) is the conservative arm this residual
-- earns while the seam is unbuilt: coverage widens, never narrows, whenever model-authored free
-- text is present -- which in THIS build is every mint, since every block kind admitted here is
-- free text (kind='text'; a non-free-text block kind is second-render-entrance territory, PR-3's
-- own). This is TIER A, not TIER B: it does not resolve owner card 1, it bounds the estate's
-- exposure while card 1 stays open.
--
-- ============================ F-A6 PR-1 -- CHECKED AT AUTHORING, RE-CHECKED BEFORE SS3.2 BELOW =====
-- `clara.freeform_read_log` on `origin/main` at authoring time (fresh fetch) is still the bare 0002
-- shape: id, firm_id (nullable), credential_id, query_text, purpose, at -- no `scope`, no
-- `client_scope`. Annex K's own dependency row prices this: "the free-read basis kinds are
-- unavailable; preview-cell bases still work." `_sandbox_client_set` re-verifies the live column
-- set in ITS OWN body before choosing which branches to build -- see SECTION 5c below.
--
-- ============================ SECTION 0 -- PRESTATE =================================================
do $s0$
declare
  v_missing text[] := '{}';
  v_present text[] := '{}';
  v_sig text;
  v_wpv_check text;
  v_wpf_sha text;
begin
  -- (a) The three relations and the ungranted cores/verbs this file mints must not already exist.
  foreach v_sig in array array['clara.sandbox_views','clara.sandbox_exports','clara.export_recipients']
  loop
    if to_regclass(v_sig) is not null then v_present := v_present || v_sig; end if;
  end loop;
  foreach v_sig in array array[
      'clara._sandbox_client_set(uuid,jsonb,jsonb)',
      'clara._recipient_covers(uuid,uuid[],uuid)',
      'clara._watermark_policy_version_for(text,text,date)',
      'clara._sandbox_view_mint_core(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text)',
      'clara._sandbox_export_request_core(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,text,text)',
      'clara.wake_mint_sandbox_view(jsonb,jsonb,text,jsonb,text)',
      'clara.wake_request_sandbox_export(uuid,uuid,text,text,jsonb,text)',
      'clara.wake_sandbox_export_state(uuid)',
      'clara.sandbox_export_payload(uuid,text)',
      'clara.complete_sandbox_export(uuid,text,text,bigint,text)',
      'clara.fail_sandbox_export(uuid,text,jsonb)',
      'clara.register_export_recipient(text,uuid,text,text,uuid[],text)',
      'clara.supersede_export_recipient(uuid,text,uuid[],text)',
      'clara.list_sandbox_exports(uuid,int)'
    ] loop
    if to_regprocedure(v_sig) is not null then v_present := v_present || v_sig; end if;
  end loop;
  if coalesce(array_length(v_present,1),0) > 0 then
    raise exception 'f_a5b pr1 prestate: object(s) this file mints already exist: %', array_to_string(v_present,' | ') using errcode = 'CLR10';
  end if;

  -- (b) Prerequisite objects this file calls must already exist (F-A5 PR-1's DDL, the wake spine,
  -- the human-ctx/op-key/audit helpers, the triggers, the estate's core tables). metric_cells added
  -- to this roster (nit, A10): _sandbox_client_set reads it for the preview-cell basis kind and the
  -- absence of this check was a real gap in what the prestate actually verified.
  foreach v_sig in array array[
      'clara.watermark_policy_versions','clara.firms','clara.users','clara.firm_memberships',
      'clara.clients','clara.metric_cells'
    ] loop
    if to_regclass(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  foreach v_sig in array array[
      'clara.wake_context()', 'clara.assert_wake_allowed(text,text)',
      'clara._human_ctx(int)', 'clara._reserve_op(uuid,text,text,bytea)',
      'clara._finish_op(uuid,text,text,jsonb)', 'clara._hash(jsonb)',
      'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)', 'clara.agent_user_id()',
      'clara.role_rank(text)', 'clara.jwt_firm()', 'clara.jwt_sub()', 'clara.actor_role_rank()',
      'clara._tf_append_only()', 'clara._tf_no_truncate()',
      'clara.watermark_policy_for(text,text,date)', 'clara._book_today()'
    ] loop
    if to_regprocedure(v_sig) is null then v_missing := v_missing || v_sig; end if;
  end loop;
  if coalesce(array_length(v_missing,1),0) > 0 then
    raise exception 'f_a5b pr1 prestate: prerequisite object(s) absent: %', array_to_string(v_missing,' | ') using errcode = 'CLR10';
  end if;

  -- (c) X7/U1's hazard, MEASURED not assumed: watermark_policy_versions must admit the
  -- 'sandbox_watermark' policy_key (F-A5 PR-1 minted this closed-world CHECK already carrying it --
  -- confirmed at the bytes, `0111:381`). If it does not, this file must not proceed silently: the
  -- fix is a CHECK EXTENSION on a shared surface, routed to the conductor, never assumed here.
  select pg_get_constraintdef(oid) into v_wpv_check
    from pg_constraint where conrelid = 'clara.watermark_policy_versions'::regclass
      and conname = 'ck_wpv_policy_key';
  if v_wpv_check is null then
    raise exception 'f_a5b pr1 prestate: ck_wpv_policy_key not found on clara.watermark_policy_versions -- has F-A5 PR-1 applied on this chain?' using errcode = 'CLR10';
  end if;
  if v_wpv_check !~ 'sandbox_watermark' then
    raise exception 'f_a5b pr1 prestate: clara.watermark_policy_versions.ck_wpv_policy_key does not admit sandbox_watermark -- this is a shared-surface CHECK extension (R-2/U1), not assumed here. Live: %', v_wpv_check using errcode = 'CLR10';
  end if;
  -- No sandbox_watermark row may already exist (a re-apply is a defect, not an upsert).
  if exists (select 1 from clara.watermark_policy_versions where policy_key = 'sandbox_watermark') then
    raise exception 'f_a5b pr1 prestate: a sandbox_watermark row already exists' using errcode = 'CLR10';
  end if;

  -- (d) opus F2 / the superseded-body law: pin watermark_policy_for's pre-image body before this
  -- file CoRs it (SECTION 5b). A drift here means the estate moved that body under us -- abort
  -- rather than CoR a body we did not read.
  select encode(sha256(convert_to(prosrc,'UTF8')),'hex') into v_wpf_sha
    from pg_proc where oid = 'clara.watermark_policy_for(text,text,date)'::regprocedure;
  if v_wpf_sha is distinct from '277246b01b2ad9390c98b5e4f40b4d7b709e8abd23b247ef4f3d6c725171c881' then
    raise exception 'f_a5b pr1 prestate: clara.watermark_policy_for pre-image prosrc sha mismatch -- expected 277246b0..., found %. The estate moved this body; re-read before CoR-ing.', v_wpf_sha using errcode = 'CLR10';
  end if;

  raise notice 'f_a5b pr1 prestate: clean -- 3 relations + 14 functions absent, prerequisites present (incl. metric_cells), ck_wpv_policy_key admits sandbox_watermark, no sandbox_watermark rows yet, watermark_policy_for pre-image sha pinned';
end
$s0$;

-- Pin interactive_client's allowlist SET at entry (train fix, 2026-08-25). The tail used to
-- assert a count-of-1 literal here -- true only at this file's authoring frontier, and broken
-- the moment 0129's SS4 chat-parity mirror (thirteen rows) and 0131's freeform row lawfully
-- widened the kind while this PR rode the merge train. What this file actually OWES is
-- UNCHANGEDNESS -- it must not touch a kind it does not own -- so the prestate measures the set
-- and the tail asserts set-equality against this pin (measure-before/measure-after, the
-- db-migrations rule this file's original literal violated). ON COMMIT DROP: the runner applies
-- each migration in its own transaction, so the pin cannot leak past this file.
create temp table _fa5b_pin_ic_allowlist on commit drop as
  select function_name from clara.wake_fn_allowlist where wake_kind = 'interactive_client';

set role clara_fn_owner;

-- =====================================================================================
-- SECTION 1 -- clara.export_recipients (OQ-3's mint; minted first since sandbox_exports FKs to it).
-- Firm-scoped, FORCE RLS, immutable + supersede (the claim_policy_versions habit, 0066:66-85, minus
-- the curated firm_id-is-null wall -- this IS firm data, design SS3.3).
-- =====================================================================================
create table clara.export_recipients (
  id              uuid primary key default gen_random_uuid(),
  firm_id         uuid not null references clara.firms(id),
  kind            text not null check (kind in ('firm_member','external')),
  -- user_id: NOT NULL iff kind='firm_member'. A plain FK to users, not a composite FK into
  -- firm_memberships -- that table carries no unique(user_id, firm_id) target (a user may hold
  -- historical removed rows, only the ACTIVE one is partial-unique, 0002:221-222), so "this user is
  -- a member of this firm" is a VALUE-LEVEL check in the register core at write time, the same
  -- treatment covered_clients gets below.
  user_id         uuid references clara.users(id),
  display_name    text not null check (btrim(display_name) <> ''),
  basis           text not null check (btrim(basis) <> ''),
  -- covered_clients: NOT NULL iff kind='external'; cardinality >= 1; every element validated at
  -- write against clara.clients of THIS firm, AT ANY STATUS (design SS3.3 -- the same reason
  -- SS3.2's firm_closure carries no status filter: an active-only validation would make the wall
  -- UNSATISFIABLE for a client the recipient legitimately covers but who is onboarding/archived).
  -- An array element cannot be a declarative FK; the register/supersede cores validate it.
  covered_clients uuid[],
  registered_by   uuid not null references clara.users(id),
  registered_at   timestamptz not null default now(),
  superseded_by   uuid references clara.export_recipients(id),
  superseded_at   timestamptz,
  constraint ck_export_recipients_kind_shape check (
    (kind = 'firm_member' and user_id is not null and covered_clients is null)
    or (kind = 'external' and user_id is null and covered_clients is not null
        and cardinality(covered_clients) >= 1)),
  constraint ck_export_recipients_superseded_paired check ((superseded_by is null) = (superseded_at is null)),
  -- A row may not supersede itself.
  constraint ck_export_recipients_supersede_not_self check (superseded_by is distinct from id),
  constraint uq_export_recipients_id_firm unique (id, firm_id)
);
alter table clara.export_recipients enable row level security;
alter table clara.export_recipients force row level security;
create policy p_exportrecipients_owner on clara.export_recipients
  for all to clara_fn_owner using (true) with check (true);
create policy p_exportrecipients_human on clara.export_recipients
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.export_recipients to clara_authenticated;
revoke insert, update, delete, truncate on clara.export_recipients
  from clara_authenticated, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;

-- Immutable + supersede: no UPDATE/DELETE except the one lawful transition (marking superseded),
-- enforced as a trigger rather than left to the core's own discipline (belt, house style 0079:183-
-- 215's shape) -- every OTHER column is frozen once written; superseded_by/superseded_at may move
-- exactly once, from null to non-null, and never back.
create function clara._tf_export_recipients_lifecycle() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare mutable text[] := array['superseded_by', 'superseded_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'an export recipient is never deleted' using errcode = 'CLR08',
      detail = '{"reason":"export_recipient_never_deleted"}';
  end if;
  if (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
    raise exception 'an export recipient''s registration is immutable' using errcode = 'CLR08',
      detail = '{"reason":"export_recipient_registration_immutable","fix":"supersede this row and register a successor"}';
  end if;
  if old.superseded_by is not null then
    raise exception 'a superseded export recipient is immutable' using errcode = 'CLR08',
      detail = '{"reason":"export_recipient_already_superseded"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_export_recipients_lifecycle() from public;
create trigger t_exportrecipients_lifecycle before update or delete on clara.export_recipients
  for each row execute function clara._tf_export_recipients_lifecycle();
create trigger t_exportrecipients_no_truncate before truncate on clara.export_recipients
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- SECTION 2 -- clara.sandbox_views. Firm-scoped, FORCE RLS, append-only + no-truncate (the
-- 0005:280-298 idiom). The thing that is exported (design SS3.1, gate defect 1's answer).
-- =====================================================================================
create table clara.sandbox_views (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references clara.firms(id),
  -- Frozen. No definition_version_id, no cell_id -- there is no column for one (design SS3.7,
  -- gate B4.4): the narrative-authority wall at the export boundary is structural, not a check.
  authority         text not null default 'narrative' check (authority = 'narrative'),
  -- Typed blocks; every block carries a `basis_ref` label (gate B0/C-18) and every figure a
  -- `displayed_text` STRING (E-R8 floor 1, X6) -- no numeric literal slot exists in this shape.
  -- Validated structurally by _sandbox_view_mint_core (sandbox_view_body_malformed).
  body              jsonb not null check (jsonb_typeof(body) = 'object'),
  -- DB-computed from canonical json, never supplied by the caller.
  body_sha256       text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  client_set        uuid[] not null,
  client_set_basis  text not null check (client_set_basis in ('exact','firm_closure')),
  -- The labelled map: [{label, kind, id}, ...] -- the freeform_read_log ids and/or preview cell ids
  -- a body block's basis_ref names (design SS3.1).
  basis             jsonb not null check (jsonb_typeof(basis) = 'array'),
  acting_actor      uuid not null references clara.users(id),
  on_behalf_of      uuid references clara.users(id),
  -- opus F3 / A3: the 0106 idiom -- an object carrying non-blank provider/model/version, never a
  -- default (every mint threads its own p_model through; there is no "no model" mint of a wake
  -- act).
  model_snapshot    jsonb not null check (
    jsonb_typeof(model_snapshot) = 'object'
    and btrim(coalesce(model_snapshot->>'provider','')) <> ''
    and btrim(coalesce(model_snapshot->>'model','')) <> ''
    and btrim(coalesce(model_snapshot->>'version','')) <> ''),
  rationale         text not null check (btrim(rationale) <> ''),
  created_at        timestamptz not null default now(),
  constraint uq_sandbox_views_id_firm unique (id, firm_id),
  -- Belt: the mint core refuses an empty derived set before insert (sandbox_view_client_set_empty);
  -- this CHECK makes the row itself unable to carry one even if a future writer forgets the refusal.
  constraint ck_sandbox_views_client_set_nonempty check (cardinality(client_set) > 0)
);
alter table clara.sandbox_views enable row level security;
alter table clara.sandbox_views force row level security;
create policy p_sandboxviews_owner on clara.sandbox_views
  for all to clara_fn_owner using (true) with check (true);
create policy p_sandboxviews_human on clara.sandbox_views
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.sandbox_views to clara_authenticated;
revoke insert, update, delete, truncate on clara.sandbox_views
  from clara_authenticated, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;
create trigger t_sandboxviews_append_only before update or delete on clara.sandbox_views
  for each row execute function clara._tf_append_only();
create trigger t_sandboxviews_no_truncate before truncate on clara.sandbox_views
  for each statement execute function clara._tf_no_truncate();

-- =====================================================================================
-- SECTION 3 -- clara.sandbox_exports. Firm-scoped, FORCE RLS, LIFECYCLE WALL freezing the request
-- half (the render_jobs idiom, 0079:136-140, :183-215). REQUEST + LIFECYCLE + COMPLETION in one row
-- -- gate defect 2's answer is the split the estate already ships (immutable view / lifecycle
-- export), never a third artifact relation (law 74, C-3).
-- =====================================================================================
create table clara.sandbox_exports (
  id                          uuid primary key default gen_random_uuid(),
  -- FROZEN (the request half).
  firm_id                     uuid not null references clara.firms(id),
  sandbox_view_id             uuid not null,
  recipient_id                uuid not null,
  -- Recorded at request time: the coverage predicate's evidence, plus body_sha256 so the proof
  -- names the exact body it covered (C-19).
  coverage_proof              jsonb not null check (jsonb_typeof(coverage_proof) = 'object'),
  watermark_policy_version_id uuid not null references clara.watermark_policy_versions(id),
  locale                      text not null check (locale in ('en','ms','zh')),
  requested_by                uuid not null references clara.users(id),
  on_behalf_of                uuid references clara.users(id),
  op_key                      text not null,
  created_at                  timestamptz not null default now(),
  -- MOVING (the lifecycle half -- claim, dispatch, fail, complete).
  state                       text not null default 'claimable'
                                 check (state in ('claimable', 'running', 'done', 'failed')),
  attempts                    int not null default 0 check (attempts >= 0),
  claimed_by                  text,
  claimed_at                  timestamptz,
  lease_expires_at            timestamptz,
  last_error                  jsonb,
  finished_at                 timestamptz,
  -- SET ONCE at completion (X5: the hash comes IN; the DB never renders, never re-hashes).
  artifact_sha256             text check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size                   bigint check (byte_size > 0),
  storage_key                 text,
  foreign key (sandbox_view_id, firm_id) references clara.sandbox_views (id, firm_id),
  foreign key (recipient_id, firm_id) references clara.export_recipients (id, firm_id),
  unique (id, firm_id),
  unique (firm_id, op_key),
  -- Codex #9 + opus F11 / A7: 0079's OWN ck_rj_lease_paired shape, verbatim -- claimed_by,
  -- claimed_at and lease_expires_at are null TOGETHER (three-way, via two pairwise comparisons
  -- against claimed_by) PLUS the running=>held implication. Once set they persist through
  -- done/failed as historical fact (the same render_jobs precedent, ck_rj_lease_paired's own
  -- comment); an equality would have forbidden that, caught live by this lane's own B6.1/B6.3.
  constraint ck_sandboxexports_lease_paired check (
    (claimed_by is null) = (claimed_at is null) and (claimed_by is null) = (lease_expires_at is null)
    and (state <> 'running' or claimed_by is not null)),
  constraint ck_sandboxexports_completion_paired check (
    (state = 'done') = (artifact_sha256 is not null and byte_size is not null and storage_key is not null))
);
alter table clara.sandbox_exports enable row level security;
alter table clara.sandbox_exports force row level security;
create policy p_sandboxexports_owner on clara.sandbox_exports
  for all to clara_fn_owner using (true) with check (true);
create policy p_sandboxexports_human on clara.sandbox_exports
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.sandbox_exports to clara_authenticated;
revoke insert, update, delete, truncate on clara.sandbox_exports
  from clara_authenticated, clara_agent_ro, clara_runtime, clara_wake_interactive, clara_wake_proactive;

-- The narrow lifecycle trigger, not the generic append-only wall -- a queue row is legitimately
-- UPDATEd (claim, dispatch, fail, complete). Whole-row terminal freeze once done/failed (the
-- 0079:198-213 codex-M2 shape): a completed or failed row is immutable in full, not just its state
-- value, so a definer-path defect cannot rewrite which artifact a completed export produced.
create function clara._tf_sandbox_export_lifecycle() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare mutable text[] := array['state', 'attempts', 'claimed_by', 'claimed_at',
  'lease_expires_at', 'last_error', 'finished_at', 'artifact_sha256', 'byte_size', 'storage_key'];
begin
  if tg_op = 'DELETE' then
    raise exception 'a sandbox export is never deleted' using errcode = 'CLR08',
      detail = '{"reason":"sandbox_export_never_deleted"}';
  end if;
  if (to_jsonb(new) - mutable) is distinct from (to_jsonb(old) - mutable) then
    raise exception 'a sandbox export''s request is immutable' using errcode = 'CLR08',
      detail = '{"reason":"sandbox_export_request_immutable","fix":"request a new export; a changed request is a different export"}';
  end if;
  if old.state in ('done', 'failed') then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'a terminal sandbox export is immutable' using errcode = 'CLR08',
        detail = jsonb_build_object('reason', 'sandbox_export_terminal', 'state', old.state,
          'fix', 'a finished export records what happened; request a new one rather than editing a closed one')::text;
    end if;
    return new;
  end if;
  return new;
end $$;
revoke all on function clara._tf_sandbox_export_lifecycle() from public;
create trigger t_sandboxexports_no_truncate before truncate on clara.sandbox_exports
  for each statement execute function clara._tf_no_truncate();
create trigger t_sandboxexports_lifecycle before update or delete on clara.sandbox_exports
  for each row execute function clara._tf_sandbox_export_lifecycle();

reset role;

do $s3done$ begin
  raise notice 'f_a5b pr1 section 1-3: 3 relations created (export_recipients, sandbox_views, sandbox_exports), forced RLS + lifecycle walls attached';
end $s3done$;

-- =====================================================================================
-- SECTION 4 -- THE OWNER-RATIFIED sandbox_watermark TRIO. Rows only, no DDL (R-L15's scope). Verbatim,
-- owner-ratified 2026-08-23 (design SS3.6a; A11/Codex #13's naming half -- "ratified wording", not
-- a cryptographic signature). One key per locale -- Q2's "two keys" question is moot; this is a
-- single string, never a stamp/footer pair. The lane's DARK condition (survey X12) lifts for
-- en/ms/zh the instant this section commits; every other locale still refuses until its own row is
-- owner-ratified (watermark_policy_absent, via clara._watermark_policy_version_for -- SECTION 5b).
-- A8/S5.25: effective_from is clara._book_today() (0042), NEVER current_date -- a UTC session
-- between 00:00-07:59 MYT would otherwise seed YESTERDAY's date, the exact ships-dark scenario
-- TA-P10 C' (3) exists to prevent.
-- =====================================================================================
set role clara_fn_owner;
insert into clara.watermark_policy_versions
  (firm_id, policy_key, version, locale, watermark, effective_from, source_note)
values
  (null, 'sandbox_watermark', 1, 'en',
   jsonb_build_object('watermark', 'WORKING ANALYSIS — FOR DISCUSSION ONLY. Not an audited financial statement, not a statutory report.'),
   clara._book_today(), 'Owner-ratified 2026-08-23, sandbox-export-design.md SS3.6a, en row.'),
  (null, 'sandbox_watermark', 1, 'ms',
   jsonb_build_object('watermark', 'ANALISIS KERJA — UNTUK PERBINCANGAN SAHAJA. Bukan penyata kewangan beraudit, bukan laporan berkanun.'),
   clara._book_today(), 'Owner-ratified 2026-08-23, sandbox-export-design.md SS3.6a, ms row.'),
  (null, 'sandbox_watermark', 1, 'zh',
   jsonb_build_object('watermark', '工作分析稿 — 仅供讨论。非经审计财务报表,非法定报告。'),
   clara._book_today(), 'Owner-ratified 2026-08-23, sandbox-export-design.md SS3.6a, zh row.');
reset role;

do $s4done$
declare v_n int;
begin
  select count(*) into v_n from clara.watermark_policy_versions where policy_key = 'sandbox_watermark';
  if v_n <> 3 then
    raise exception 'f_a5b pr1 section 4: expected exactly 3 sandbox_watermark rows, found %', v_n using errcode = 'CLR10';
  end if;
  raise notice 'f_a5b pr1 section 4: sandbox_watermark trio seeded (en/ms/zh) -- the lane''s DARK condition lifts for these three locales';
end
$s4done$;

-- =====================================================================================
-- SECTION 5 -- THE UNGRANTED CORES. Granted to NOBODY, reached as internal calls under
-- clara_fn_owner (the 0004:749-750 containment, 0077:22-29's rule). Every table these cores read is
-- scoped by an EXPLICIT predicate against p_firm in the body -- clara_fn_owner's own policy is
-- `using (true)` (0002:485-491), and the estate has one recorded fail-open of exactly this class
-- (0083:102-108, gate B6).
-- =====================================================================================
set role clara_fn_owner;

-- --- 5a. _recipient_covers(p_firm, p_client_set, p_recipient) -- SS3.3, gate M10 -----------------
-- Returns jsonb: {covered: boolean, missing: uuid[]}. NEVER answers YES on an empty client_set --
-- the explicit named zero-cardinality branch AHEAD of the general comparison (the 0020:640-643
-- idiom), because containment over {} is vacuously TRUE and would pass every recipient alive.
create function clara._recipient_covers(p_firm uuid, p_client_set uuid[], p_recipient uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_missing uuid[]; v_active boolean;
begin
  if p_client_set is null or cardinality(p_client_set) = 0 then
    raise exception 'a client set with no clients cannot be covered by any recipient' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_client_set_empty"}';
  end if;
  select * into r from clara.export_recipients where id = p_recipient and firm_id = p_firm;
  if not found then
    raise exception 'no such export recipient in your firm' using errcode = 'CLR11',
      detail = '{"reason":"export_recipient_unknown"}';
  end if;
  if r.superseded_by is not null then
    raise exception 'this export recipient has a successor' using errcode = 'CLR10',
      detail = '{"reason":"export_recipient_superseded"}';
  end if;
  if r.kind = 'firm_member' then
    -- Computed, never stored (C-7): a firm member already reads every client of his firm under
    -- RLS, so coverage is total by construction -- gated only on ACTIVE membership NOW.
    select exists(select 1 from clara.firm_memberships m
      where m.user_id = r.user_id and m.firm_id = p_firm and m.status = 'active') into v_active;
    if not v_active then
      raise exception 'this recipient''s firm membership is not active' using errcode = 'CLR10',
        detail = '{"reason":"export_recipient_membership_inactive"}';
    end if;
    return jsonb_build_object('covered', true, 'missing', '[]'::jsonb, 'kind', 'firm_member',
      'checked_at', now());
  else
    select array_agg(c) into v_missing from unnest(p_client_set) c
      where c <> all(r.covered_clients);
    if coalesce(array_length(v_missing,1),0) > 0 then
      raise exception 'the recipient does not cover every client in this file' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','recipient_coverage_incomplete','missing_clients',to_jsonb(v_missing))::text;
    end if;
    return jsonb_build_object('covered', true, 'missing', '[]'::jsonb, 'kind', 'external',
      'covered_clients', to_jsonb(r.covered_clients), 'checked_at', now());
  end if;
end $$;
revoke all on function clara._recipient_covers(uuid,uuid[],uuid) from public;

-- --- 5b. _watermark_policy_version_for(p_policy_key, p_locale, p_as_of) -- opus F2 -----------------
-- THE SHARED RESOLVER CORE. Extracted so BOTH this lane's own request core and F-A5's own
-- clara.watermark_policy_for (CoR'd immediately below to delegate here) read ONE body -- a single
-- authority for "which policy row is effective", matching the 0111 resolver's own predicate
-- byte-for-byte (policy_key/locale/firm_id is null/effective window/order by version desc limit 1).
-- Returns the ROW's id (this lane pins watermark_policy_version_id) alongside the watermark text
-- (what the CoR'd public resolver still returns).
create function clara._watermark_policy_version_for(p_policy_key text, p_locale text, p_as_of date)
  returns table(id uuid, watermark jsonb)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_id uuid; v_watermark jsonb;
begin
  select w.id, w.watermark into v_id, v_watermark from clara.watermark_policy_versions w
   where w.policy_key = p_policy_key and w.locale = p_locale and w.firm_id is null
     and w.effective_from <= p_as_of and (w.effective_to is null or w.effective_to >= p_as_of)
   order by w.version desc limit 1;
  if v_id is null then
    -- opus F2 nuance (final round): 0111's ORIGINAL watermark_policy_for carried a fourth key,
    -- 'fix' -- 'the owner signs the wording once, in three languages, and a migration seeds it
    -- (OQ-1)'. Dropped here DELIBERATELY, not lost: that text is now factually WRONG on this very
    -- chain (OQ-1 is resolved, the trio is owner-ratified and seeded by SECTION 4 above) -- keeping
    -- a stale "the owner needs to sign" instruction in a live refusal would be actively misleading,
    -- strictly worse than dropping it. No consumer reads the key (grepped, none found). The tail
    -- census below positively compares this refusal's payload against the pre-CoR body's shape on
    -- every OTHER key, so "only the intended change moved" is proven, not assumed, for the one key
    -- that did move too.
    raise exception 'no watermark policy row is effective for this locale' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','watermark_policy_absent','policy_key',p_policy_key,
        'locale',p_locale,'as_of',p_as_of)::text;
  end if;
  return query select v_id, v_watermark;
end $$;
revoke all on function clara._watermark_policy_version_for(text,text,date) from public;

-- The CoR itself: clara.watermark_policy_for (0111) now DELEGATES rather than duplicating the
-- predicate. Byte-identical external contract (same signature, same return type, same refusal
-- reason/errcode) -- the tail re-proves this by calling it and comparing against a direct core
-- call, both raising watermark_policy_absent identically on an unresolved (locale, as_of) pair.
create or replace function clara.watermark_policy_for(p_policy_key text, p_locale text, p_as_of date)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_watermark jsonb;
begin
  select watermark into v_watermark from clara._watermark_policy_version_for(p_policy_key, p_locale, p_as_of);
  return v_watermark;
end
$$;
revoke all on function clara.watermark_policy_for(text,text,date) from public;

-- --- 5c. _sandbox_client_set(p_firm, p_basis, p_body) -- SS3.2, gate B0/B6/M2/M10 ----------------
-- BODY SHAPE THIS FILE DEFINES (no prior schema for it -- SS3.1 leaves the exact block grammar to
-- the builder beyond "typed blocks, every figure a displayed_text STRING, every block a
-- basis_ref"): p_body = {"blocks": [{"kind":"text","basis_ref":"<label>","displayed_text":"<str>"}]}
-- -- kind='text' ONLY in this PR-1 (a chart-referencing block kind is second-render-entrance
-- territory, PR-3's own; refused here as malformed rather than half-built against a census that
-- does not exist yet). p_basis = [{"label":"<str>","kind":"preview_cell"|"freeform_read","id":"<uuid>"}].
--
-- opus F1 + Codex #1 (A1) -- BASIS INTEGRITY, folded whole:
--   (i)   every basis element's label must be non-blank and UNIQUE (duplicate/blank labels refuse
--         sandbox_view_basis_malformed -- a new, named token: neither _absent (no rows at all) nor
--         _unknown (an id that does not resolve) fits a shape defect in the caller's own array);
--   (ii)  EVERY basis element is validated, not only ones a block's basis_ref names -- an
--         unreferenced element with a foreign/absent/malformed id still refuses, typed
--         (sandbox_view_basis_unknown), closing the raw-22P02 nit (a non-UUID id string used to
--         reach an unhandled cast exception; now caught explicitly before any cast);
--   (iii) the fail-safe interim: since every block kind this PR-1 admits is free text
--         (model-authored prose, kind='text'), and the numeral-substitution seam is not built
--         (this file's own header), the derived set ALWAYS widens to firm_closure -- the exact
--         per-basis-kind derivation below still runs (it is what the label/basis_ref wall proves),
--         but the RETURNED `client_set` is the full firm roster whenever the body carries free
--         text, which is every body this PR-1 can mint. Reversible the day a non-free-text block
--         kind exists (PR-3's chart_ref, or a future placeholder block once the substitution seam
--         lands) -- coverage can only widen while free text is present, never narrow it below what
--         the exact derivation already proved. NT-1 (opus, final round): the exact derivation is
--         ALSO returned separately as `client_set_exact` (never widened) precisely so B1.9's
--         narrowing differential and B1.1 can assert the real per-basis-kind claim on it -- the
--         widened `client_set` alone cannot distinguish a correct {A,B} derivation from a silently
--         narrowed {A}, since both satisfy `client_set.includes(A) && client_set.includes(B)` once
--         widened to the full roster.
create function clara._sandbox_client_set(p_firm uuid, p_basis jsonb, p_body jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_blocks jsonb; v_block jsonb; v_ref text; v_kind text;
  v_basis_elem jsonb; v_found boolean; v_label text; v_label_id text;
  v_labels text[] := '{}'; v_distinct_count int; v_has_free_text boolean := false;
  v_used_labels text[] := '{}';
  v_client_set uuid[] := '{}';
  v_basis_kind text;
  v_uses_firm_closure boolean := false;
  v_fa6_scope_present boolean;
  v_preview_client uuid;
  v_fr_scope text; v_fr_client_scope uuid;
  v_firm_roster uuid[];
  v_firm_all uuid[];
  v_client_set_exact uuid[];
begin
  if p_basis is null or jsonb_typeof(p_basis) <> 'array' or jsonb_array_length(p_basis) = 0 then
    raise exception 'a sandbox view needs at least one cited basis row' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_basis_absent"}';
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' or (p_body -> 'blocks') is null
     or jsonb_typeof(p_body -> 'blocks') <> 'array' or jsonb_array_length(p_body -> 'blocks') = 0 then
    raise exception 'a sandbox view body must carry at least one typed block' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_body_malformed","class":"blocks"}';
  end if;

  -- F-A6 PR-1's hardened freeform_read_log shape is MEASURED, never assumed (Annex K: "the
  -- free-read basis kinds are unavailable; preview-cell bases still work" until it lands).
  select exists(select 1 from information_schema.columns
    where table_schema = 'clara' and table_name = 'freeform_read_log' and column_name = 'scope')
    into v_fa6_scope_present;

  -- (i)+(ii) A1: validate EVERY basis element up front -- label shape, uniqueness, and (for every
  -- element, referenced or not) that its id is a well-formed uuid resolving in this firm.
  for v_basis_elem in select * from jsonb_array_elements(p_basis) loop
    v_label := v_basis_elem ->> 'label';
    if nullif(btrim(coalesce(v_label,'')),'') is null then
      raise exception 'a basis element carries no label' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_basis_malformed","class":"label_absent"}';
    end if;
    v_labels := v_labels || v_label;

    v_label_id := v_basis_elem ->> 'id';
    if v_label_id is null or v_label_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'a basis element carries a malformed id' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
    end if;

    v_basis_kind := v_basis_elem ->> 'kind';
    if v_basis_kind = 'preview_cell' then
      if not exists(select 1 from clara.metric_cells where id = v_label_id::uuid and firm_id = p_firm) then
        raise exception 'a cited preview cell does not resolve in your firm' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
      end if;
    elsif v_basis_kind = 'freeform_read' then
      if not v_fa6_scope_present then
        raise exception 'a freeform-read basis cannot be resolved on this chain yet' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label,
            'note','free-read basis kinds are unavailable until F-A6 PR-1 lands (Annex K)')::text;
      end if;
      if not exists(select 1 from clara.freeform_read_log where id = v_label_id::uuid and firm_id = p_firm) then
        raise exception 'a cited freeform read does not resolve in your firm' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
      end if;
    else
      raise exception 'a basis element has an unrecognised kind' using errcode = 'CLR11',
        detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
    end if;
  end loop;
  select count(distinct l) into v_distinct_count from unnest(v_labels) l;
  if v_distinct_count <> cardinality(v_labels) then
    raise exception 'the basis carries a duplicate label' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_basis_malformed","class":"label_duplicate"}';
  end if;

  v_blocks := p_body -> 'blocks';
  for v_block in select * from jsonb_array_elements(v_blocks) loop
    if jsonb_typeof(v_block) <> 'object' then
      raise exception 'a sandbox view body block must be an object' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_body_malformed","class":"block_shape"}';
    end if;
    v_kind := v_block ->> 'kind';
    if v_kind is distinct from 'text' then
      raise exception 'this PR-1 build admits only text blocks' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_view_body_malformed','class','block_kind_unsupported','kind',v_kind)::text;
    end if;
    v_has_free_text := true;
    if nullif(btrim(coalesce(v_block ->> 'displayed_text', '')), '') is null then
      raise exception 'a text block must carry non-blank displayed_text' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_body_malformed","class":"displayed_text"}';
    end if;
    v_ref := v_block ->> 'basis_ref';
    if nullif(btrim(coalesce(v_ref, '')), '') is null then
      raise exception 'a sandbox view body block cites no basis' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_block_basis_absent"}';
    end if;

    v_found := (v_ref = any(v_labels));
    if not v_found then
      raise exception 'this block''s basis_ref names no label of this view''s own basis' using errcode = 'CLR11',
        detail = jsonb_build_object('reason','sandbox_view_block_basis_unknown','basis_ref',v_ref)::text;
    end if;
    if not (v_ref = any(v_used_labels)) then
      v_used_labels := v_used_labels || v_ref;
    end if;
  end loop;

  -- The EXACT per-basis-kind derivation -- still computed and still what B1.9's narrowing
  -- differential proves, even though (iii) below widens the RETURNED set to firm_closure whenever
  -- free text is present.
  foreach v_ref in array v_used_labels loop
    v_basis_elem := null;
    for v_basis_elem in select * from jsonb_array_elements(p_basis) loop
      exit when v_basis_elem ->> 'label' = v_ref;
    end loop;
    v_basis_kind := v_basis_elem ->> 'kind';

    if v_basis_kind = 'preview_cell' then
      -- Already proven to resolve above; re-read the client_id (equality on firm_id, gate B6/C-20).
      select client_id into v_preview_client from clara.metric_cells
        where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
      v_client_set := v_client_set || v_preview_client;

    elsif v_basis_kind = 'freeform_read' then
      -- opus F7: NULL client_scope guard. F-A6's own hardened shape does not (yet) forbid a NULL
      -- client_scope on a scope='client' row; appending NULL to client_set would silently pollute
      -- it (unnest/array_agg both admit NULL elements). A NULL-scoped "client" read is therefore
      -- treated as unresolvable, the same no-oracle token every other unresolved basis gets.
      select scope, client_scope into v_fr_scope, v_fr_client_scope
        from clara.freeform_read_log where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
      if v_fr_scope = 'client' then
        if v_fr_client_scope is null then
          raise exception 'a client-scoped freeform read carries no client' using errcode = 'CLR11',
            detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref)::text;
        end if;
        v_client_set := v_client_set || v_fr_client_scope;
      elsif v_fr_scope = 'firm' then
        -- firm_closure: EVERY row of clara.clients for the firm, AT ANY STATUS (gate M2/C-21 --
        -- deliberately the estate's house form's opposite; no status conjunct).
        v_uses_firm_closure := true;
        select array_agg(id) into v_firm_roster from clara.clients where firm_id = p_firm;
        v_client_set := v_client_set || coalesce(v_firm_roster, '{}'::uuid[]);
      else
        -- cross_client: F-A6 v2's own named-set verb is what makes this row's set exist (Annex K);
        -- not landed by F-A6 PR-1 alone. Same no-oracle token.
        raise exception 'a cross-client named basis cannot be resolved until F-A6 v2 lands' using errcode = 'CLR11',
          detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref,
            'note','cross-client named reads are F-A6 v2''s own verb, a separate dependency (Annex K)')::text;
      end if;
    end if;
  end loop;

  -- opus F7 (strip before the empty-set check): drop any NULL that slipped into the accumulator
  -- before deduping and before the emptiness test, so a stray NULL never masquerades as a client.
  select array_agg(distinct c) into v_client_set from unnest(v_client_set) c where c is not null;
  if coalesce(array_length(v_client_set, 1), 0) = 0 then
    raise exception 'the derived client set is empty' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_view_client_set_empty"}';
  end if;
  -- NT-1 (opus, final round): captured HERE, before (iii)'s widening can touch v_client_set --
  -- this is the true per-basis-kind EXACT derivation the "exact derivation is still computed"
  -- header claim below refers to. A1's own fail-safe widens the RETURNED client_set to
  -- firm_closure whenever free text is present, which made B1.9's positive assertion (and B1.1's)
  -- vacuous: `client_set.includes(A) && client_set.includes(B)` passes on the full firm roster
  -- whether the exact derivation produced {A,B} or narrowed to {A} alone. Returning this exact set
  -- SEPARATELY from the widened one lets a caller assert the real claim on the real value.
  v_client_set_exact := v_client_set;

  -- (iii) THE FAIL-SAFE INTERIM: every admitted block kind is free text, so the exact derivation
  -- above is superseded by the full firm roster for coverage purposes -- widen, never narrow.
  if v_has_free_text then
    v_uses_firm_closure := true;
    select array_agg(id) into v_firm_all from clara.clients where firm_id = p_firm;
    v_client_set := coalesce(v_firm_all, '{}'::uuid[]);
    if coalesce(array_length(v_client_set, 1), 0) = 0 then
      raise exception 'the derived client set is empty' using errcode = 'CLR10',
        detail = '{"reason":"sandbox_view_client_set_empty"}';
    end if;
  end if;

  return jsonb_build_object('client_set', to_jsonb(v_client_set),
    'client_set_basis', case when v_uses_firm_closure then 'firm_closure' else 'exact' end,
    'client_set_exact', to_jsonb(v_client_set_exact));
end $$;
revoke all on function clara._sandbox_client_set(uuid,jsonb,jsonb) from public;

-- --- 5d. _sandbox_view_mint_core(p_firm, p_actor, p_obo, p_wake_kind, p_body, p_basis, p_model,
--         p_rationale, p_op_key) -- opus F3 = Codex #7 (A3): p_model/p_rationale now THREAD through
--         (the wrapper validated them but never passed them on -- a real gap), fold into the
--         reserve_op request hash so a replayed op_key under CHANGED provenance conflicts rather
--         than silently replaying the FIRST call's result, and build model_snapshot (0106 idiom).
create function clara._sandbox_view_mint_core(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_body jsonb, p_basis jsonb, p_model jsonb, p_rationale text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_req_hash bytea; v_reserved jsonb; v_derived jsonb; v_client_set uuid[];
        v_client_set_exact uuid[];
        v_basis_kind text; v_sha text; v_id uuid; v_result jsonb; v_model jsonb;
begin
  v_req_hash := clara._hash(jsonb_build_object('body', p_body, 'basis', p_basis,
    'model', p_model, 'rationale', p_rationale));
  v_reserved := clara._reserve_op(p_firm, 'wake_mint_sandbox_view', p_op_key, v_req_hash);
  if v_reserved is not null then return v_reserved; end if;

  v_derived := clara._sandbox_client_set(p_firm, p_basis, p_body);
  select array(select jsonb_array_elements_text(v_derived -> 'client_set'))::uuid[] into v_client_set;
  -- NT-1: the pre-widening exact derivation, threaded through unchanged so a caller can assert
  -- the real per-basis-kind claim (B1.1/B1.9) rather than the widened client_set alone.
  select array(select jsonb_array_elements_text(v_derived -> 'client_set_exact'))::uuid[] into v_client_set_exact;
  v_basis_kind := v_derived ->> 'client_set_basis';
  v_sha := encode(sha256(convert_to(p_body::text, 'UTF8')), 'hex');
  v_model := jsonb_build_object('provider', p_model->>'provider', 'model', p_model->>'model',
    'version', p_model->>'version');

  insert into clara.sandbox_views
    (firm_id, body, body_sha256, client_set, client_set_basis, basis, acting_actor, on_behalf_of,
     model_snapshot, rationale)
  values (p_firm, p_body, v_sha, v_client_set, v_basis_kind, p_basis, p_actor, p_obo, v_model, p_rationale)
  returning id into v_id;

  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'wake_mint_sandbox_view', v_id,
    jsonb_build_object('client_set_basis', v_basis_kind, 'client_count', cardinality(v_client_set),
      'op_key', p_op_key, 'model', v_model, 'rationale', p_rationale));

  v_result := jsonb_build_object('sandbox_view_id', v_id, 'body_sha256', v_sha,
    'client_set', to_jsonb(v_client_set), 'client_set_basis', v_basis_kind,
    'client_set_exact', to_jsonb(v_client_set_exact));
  return clara._finish_op(p_firm, 'wake_mint_sandbox_view', p_op_key, v_result);
end $$;
revoke all on function clara._sandbox_view_mint_core(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text) from public;

-- --- 5e. _sandbox_export_request_core(p_firm, p_actor, p_obo, p_wake_kind, p_view, p_recipient,
--         p_locale, p_model, p_rationale, p_op_key) -- SS3.3/SS3.6, the coverage check AND the
--         watermark presence check, BOTH before a job exists (design SS3.4). A9 (Codex #4): the
--         request door refuses an EXTERNAL recipient outright -- this ENFORCES the already-ruled
--         disposition (design-part2:132: "the external export path unblocks on the firm-level
--         register landing") for a register this PR-1 does NOT build (TIER B, an owner card). A
--         firm_member recipient is unaffected.
create function clara._sandbox_export_request_core(p_firm uuid, p_actor uuid, p_obo uuid,
    p_wake_kind text, p_view uuid, p_recipient uuid, p_locale text, p_model jsonb, p_rationale text,
    p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_req_hash bytea; v_reserved jsonb; v_view record; v_cover jsonb; v_recipient_kind text;
        v_wpv_id uuid; v_id uuid; v_result jsonb; v_today date; v_wpv jsonb;
begin
  v_req_hash := clara._hash(jsonb_build_object('view', p_view, 'recipient', p_recipient,
    'locale', p_locale, 'model', p_model, 'rationale', p_rationale));
  v_reserved := clara._reserve_op(p_firm, 'wake_request_sandbox_export', p_op_key, v_req_hash);
  if v_reserved is not null then return v_reserved; end if;

  select * into v_view from clara.sandbox_views where id = p_view and firm_id = p_firm;
  if not found then
    raise exception 'no such sandbox view in your firm' using errcode = 'CLR11',
      detail = '{"reason":"sandbox_view_not_found"}';
  end if;

  -- A9: the recipient's KIND is resolved and gated BEFORE coverage is even checked -- an external
  -- recipient is dark regardless of whether it would otherwise cover the file.
  select kind into v_recipient_kind from clara.export_recipients where id = p_recipient and firm_id = p_firm;
  if v_recipient_kind is null then
    raise exception 'no such export recipient in your firm' using errcode = 'CLR11',
      detail = '{"reason":"export_recipient_unknown"}';
  end if;
  if v_recipient_kind = 'external' then
    raise exception 'external export recipients are unavailable until the disclosure-authorization register lands' using errcode = 'CLR10',
      detail = '{"reason":"sandbox_export_external_unavailable","fix":"firm-member recipients only, until the firm-level disclosure-authorization register PR lands (owner card, design-part2.md SS7 card 2)"}';
  end if;

  -- SS3.3's coverage predicate (raises its own typed refusal on failure -- propagates as-is).
  v_cover := clara._recipient_covers(p_firm, v_view.client_set, p_recipient);

  -- SS3.6's presence check at REQUEST time (never render time), pinned into the frozen half. opus
  -- F2: now reads through the shared resolver core (SECTION 5b), the same body
  -- clara.watermark_policy_for delegates to -- ONE authority, not two independent predicates.
  v_today := clara._book_today();
  select id, watermark into v_wpv_id, v_wpv
    from clara._watermark_policy_version_for('sandbox_watermark', p_locale, v_today);

  insert into clara.sandbox_exports
    (firm_id, sandbox_view_id, recipient_id, coverage_proof, watermark_policy_version_id, locale,
     requested_by, on_behalf_of, op_key)
  values (p_firm, p_view, p_recipient,
    v_cover || jsonb_build_object('body_sha256', v_view.body_sha256, 'checked_client_set', to_jsonb(v_view.client_set)),
    v_wpv_id, p_locale, p_actor, p_obo, p_op_key)
  returning id into v_id;

  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'wake_request_sandbox_export', v_id,
    jsonb_build_object('sandbox_view_id', p_view, 'recipient_id', p_recipient, 'locale', p_locale,
      'op_key', p_op_key, 'model', p_model, 'rationale', p_rationale));

  v_result := jsonb_build_object('sandbox_export_id', v_id, 'state', 'claimable',
    'watermark_policy_version_id', v_wpv_id);
  return clara._finish_op(p_firm, 'wake_request_sandbox_export', p_op_key, v_result);
end $$;
revoke all on function clara._sandbox_export_request_core(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,text,text) from public;

reset role;

-- =====================================================================================
-- SECTION 6 -- THE WAKE WRAPPERS. SECURITY DEFINER, search_path=clara,pg_temp, resolves
-- clara.wake_context() then clara.assert_wake_allowed(w.wake_kind, '<name>'), refuses a blank
-- op_key before any work, delegates to an ungranted core. No wrapper body carries DML text
-- (F-A5's C1-at-four-by-construction rule, 0077:23-29, inherited). p_model now validated against
-- the 0106 idiom (provider/model/version, A3) and threaded to the core, never dropped.
-- =====================================================================================
set role clara_fn_owner;

create function clara.wake_mint_sandbox_view(p_body jsonb, p_basis jsonb, p_rationale text,
    p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_mint_sandbox_view');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake sandbox act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake sandbox act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'provider','')),'') is null
     or nullif(btrim(coalesce(p_model->>'model','')),'') is null
     or nullif(btrim(coalesce(p_model->>'version','')),'') is null then
    raise exception 'a wake sandbox act names its model (provider, model, version)' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  return clara._sandbox_view_mint_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_body, p_basis, p_model, p_rationale, p_op_key);
end
$$;

create function clara.wake_request_sandbox_export(p_view uuid, p_recipient uuid, p_locale text,
    p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_request_sandbox_export');
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise exception 'a wake sandbox act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key","constraint":"nonempty"}'; end if;
  if nullif(btrim(coalesce(p_rationale,'')),'') is null then raise exception 'a wake sandbox act states its rationale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"rationale"}'; end if;
  if p_model is null or nullif(btrim(coalesce(p_model->>'provider','')),'') is null
     or nullif(btrim(coalesce(p_model->>'model','')),'') is null
     or nullif(btrim(coalesce(p_model->>'version','')),'') is null then
    raise exception 'a wake sandbox act names its model (provider, model, version)' using errcode='CLR10', detail='{"reason":"invalid_request","class":"model"}';
  end if;
  if p_locale is null or p_locale not in ('en','ms','zh') then
    raise exception 'unrecognised locale' using errcode='CLR10', detail='{"reason":"invalid_request","class":"locale"}';
  end if;
  return clara._sandbox_export_request_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    p_view, p_recipient, p_locale, p_model, p_rationale, p_op_key);
end
$$;

-- A6 (opus F9 = Codex #8): DROPPED `stable` -- a receipted reader (it writes an audit row every
-- call) is VOLATILE in this estate; there is no precedent for stable+audit, and STABLE's
-- once-per-statement caching contract has no defined interaction with a body that also performs a
-- write. One argument only per Annex A.2; no op_key/rationale/model, since a status read is not
-- itself a durable act needing idempotency.
create function clara.wake_sandbox_export_state(p_export uuid)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; e record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_sandbox_export_state');
  select * into e from clara.sandbox_exports where id = p_export and firm_id = w.firm_id;
  if not found then
    raise exception 'no such sandbox export in your firm' using errcode = 'CLR11',
      detail = '{"reason":"sandbox_view_not_found"}';
  end if;
  perform clara._audit(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    'wake_sandbox_export_state', e.id, '{}'::jsonb);
  return jsonb_build_object('id', e.id, 'state', e.state, 'attempts', e.attempts,
    'artifact_sha256', e.artifact_sha256, 'byte_size', e.byte_size, 'storage_key', e.storage_key,
    'locale', e.locale, 'created_at', e.created_at, 'finished_at', e.finished_at,
    'last_error', e.last_error);
end
$$;

reset role;

-- =====================================================================================
-- SECTION 7 -- THE clara_runtime WORKER VERBS. Lease-scoped exactly as 0081:152-168; the hash
-- comes IN at completion (X5); terminal failure through the audited door (0080:280-292 shape).
-- No CLAIM verb ships in this PR-1: Annex A.2 enumerates exactly these three worker verbs and none
-- of them transitions claimable -> running. That is presumed to be PR-3's own dispatch-wiring (P-5,
-- "the leader/dispatch path ... measured at PR-3") reusing or extending zeta's existing claim loop
-- for the sandbox job family, not a PR-1 mint. A10: `attempts` therefore stays 0 through this PR-1
-- -- render_jobs' own precedent increments it AT CLAIM (claim_render_job, 0081), never at fail, so
-- fail_sandbox_export does NOT invent an increment here; this is a NAMED, registered gap closed by
-- whichever PR mints the claim verb, not a silent omission.
-- =====================================================================================
set role clara_fn_owner;

-- Codex #14: the worker payload previously handed back only the pinned watermark_policy_version_id
-- UUID -- PR-3's renderer has no other door to the pinned TEXT (clara_runtime holds no table grant
-- on watermark_policy_versions; humans-only per 0111). One join, resolved by the row's OWN frozen
-- id (never re-derived from "today's effective policy"), so a policy bump AFTER the request was
-- made cannot leak into an already-requested export's payload -- the pin is what request time
-- proved effective, and the payload must reproduce exactly that, not whatever is effective now.
create function clara.sandbox_export_payload(p_export uuid, p_worker text)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare e record; v record; v_watermark jsonb;
begin
  select * into e from clara.sandbox_exports
    where id = p_export and state = 'running' and claimed_by = p_worker and lease_expires_at >= now();
  if not found then
    raise exception 'this worker does not hold the lease on this sandbox export' using errcode = 'CLR43',
      detail = '{"reason":"sandbox_export_lease_not_held"}';
  end if;
  select * into v from clara.sandbox_views where id = e.sandbox_view_id;
  select watermark into v_watermark from clara.watermark_policy_versions
    where id = e.watermark_policy_version_id;
  return jsonb_build_object('sandbox_export_id', e.id, 'firm_id', e.firm_id,
    'sandbox_view_id', e.sandbox_view_id, 'body', v.body, 'body_sha256', v.body_sha256,
    'locale', e.locale, 'watermark_policy_version_id', e.watermark_policy_version_id,
    'watermark', v_watermark);
end
$$;

-- A10: complete_sandbox_export's lease lookup no longer filters on state='running' up front -- a
-- worker's claimed_by/lease persist as history through 'done' (the ck_sandboxexports_lease_paired
-- shape), so a SECOND call from the SAME worker after a first success is now genuinely reachable
-- and answers already_completed rather than the wrong lease_not_held (the dead-branch finding,
-- both legs). A5 (Codex #5): the design's own promised storage_key shape is now ENFORCED, not
-- merely assumed by callers -- firms/<this row's firm_id>/sandbox/<the supplied sha256>.pdf,
-- refused otherwise, typed, both polarities battery-forced.
create function clara.complete_sandbox_export(p_export uuid, p_worker text, p_sha256 text,
    p_byte_size bigint, p_storage_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare e record; v_expected_key text;
begin
  select * into e from clara.sandbox_exports where id = p_export and claimed_by = p_worker;
  if not found then
    raise exception 'this worker does not hold the lease on this sandbox export' using errcode = 'CLR43',
      detail = '{"reason":"sandbox_export_lease_not_held"}';
  end if;
  if e.artifact_sha256 is not null then
    raise exception 'this sandbox export is already completed' using errcode = 'CLR08',
      detail = '{"reason":"sandbox_export_already_completed"}';
  end if;
  if e.state <> 'running' or e.lease_expires_at < now() then
    raise exception 'this worker does not hold the lease on this sandbox export' using errcode = 'CLR43',
      detail = '{"reason":"sandbox_export_lease_not_held"}';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_byte_size is null or p_byte_size <= 0
     or nullif(btrim(coalesce(p_storage_key,'')),'') is null then
    raise exception 'invalid completion arguments' using errcode = 'CLR10',
      detail = '{"reason":"invalid_request","class":"completion"}';
  end if;
  v_expected_key := 'firms/' || e.firm_id::text || '/sandbox/' || p_sha256 || '.pdf';
  if p_storage_key <> v_expected_key then
    raise exception 'storage_key does not match the content-addressed shape this firm''s row requires' using errcode = 'CLR10',
      detail = jsonb_build_object('reason','storage_key_mismatch','expected',v_expected_key,'got',p_storage_key)::text;
  end if;
  update clara.sandbox_exports
     set state = 'done', artifact_sha256 = p_sha256, byte_size = p_byte_size,
         storage_key = p_storage_key, finished_at = now()
   where id = p_export;
  perform clara._audit(e.firm_id, clara.agent_user_id(), e.on_behalf_of, null,
    'complete_sandbox_export', e.id, jsonb_build_object('worker', p_worker, 'sha256', p_sha256));
  return jsonb_build_object('sandbox_export_id', e.id, 'state', 'done');
end
$$;

create function clara.fail_sandbox_export(p_export uuid, p_worker text, p_error jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare e record;
begin
  select * into e from clara.sandbox_exports
    where id = p_export and state = 'running' and claimed_by = p_worker and lease_expires_at >= now();
  if not found then
    raise exception 'this worker does not hold the lease on this sandbox export' using errcode = 'CLR43',
      detail = '{"reason":"sandbox_export_lease_not_held"}';
  end if;
  update clara.sandbox_exports
     set state = 'failed', last_error = coalesce(p_error, '{}'::jsonb), finished_at = now()
   where id = p_export;
  perform clara._audit(e.firm_id, clara.agent_user_id(), e.on_behalf_of, null,
    'fail_sandbox_export', e.id, jsonb_build_object('worker', p_worker, 'error', p_error));
  return jsonb_build_object('sandbox_export_id', e.id, 'state', 'failed');
end
$$;

reset role;

-- =====================================================================================
-- SECTION 8 -- THE HUMAN VERBS. register/supersede_export_recipient are admin+ (design SS3.3 --
-- covered_clients IS the wall; this design's fail-closed DEFAULT pending Annex E Q2, not a ruled
-- reservation -- SS1's fold note). list_sandbox_exports is bookkeeper+ (the 0002:518-520 idiom,
-- TA-P14's minimal door).
-- =====================================================================================
set role clara_fn_owner;

create function clara.register_export_recipient(p_kind text, p_user uuid, p_display_name text,
    p_basis text, p_covered_clients uuid[], p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_bad uuid[]; v_id uuid; v_req_hash bytea; v_reserved jsonb;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'a recipient registration needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key"}';
  end if;
  v_req_hash := clara._hash(jsonb_build_object('kind',p_kind,'user',p_user,'display_name',p_display_name,'basis',p_basis,'covered_clients',p_covered_clients));
  v_reserved := clara._reserve_op(c.firm, 'register_export_recipient', p_op_key, v_req_hash);
  if v_reserved is not null then return v_reserved; end if;

  if p_kind is null or p_kind not in ('firm_member','external') then
    raise exception 'unrecognised recipient kind' using errcode='CLR10', detail='{"reason":"invalid_request","class":"kind"}';
  end if;
  if nullif(btrim(coalesce(p_display_name,'')),'') is null then
    raise exception 'a recipient needs a display name' using errcode='CLR10', detail='{"reason":"invalid_request","class":"display_name"}';
  end if;
  if nullif(btrim(coalesce(p_basis,'')),'') is null then
    raise exception 'a recipient needs a stated basis' using errcode='CLR10', detail='{"reason":"invalid_request","class":"basis"}';
  end if;

  if p_kind = 'firm_member' then
    if p_user is null then
      raise exception 'a firm_member recipient needs a user' using errcode='CLR10', detail='{"reason":"invalid_request","class":"user_id"}';
    end if;
    if not exists(select 1 from clara.firm_memberships m where m.user_id = p_user and m.firm_id = c.firm and m.status = 'active') then
      raise exception 'this user is not an active member of your firm' using errcode='CLR11', detail='{"reason":"invalid_request","class":"user_id"}';
    end if;
    insert into clara.export_recipients (firm_id, kind, user_id, display_name, basis, covered_clients, registered_by)
      values (c.firm, 'firm_member', p_user, p_display_name, p_basis, null, c.actor)
      returning id into v_id;
  else
    if p_covered_clients is null or cardinality(p_covered_clients) = 0 then
      raise exception 'an external recipient needs at least one covered client' using errcode='CLR10', detail='{"reason":"invalid_request","class":"covered_clients"}';
    end if;
    -- Every element validated at write against clara.clients of THIS firm, AT ANY STATUS (SS3.3 --
    -- an active-only validation would make the wall unsatisfiable for an onboarding/archived client).
    select array_agg(x) into v_bad from unnest(p_covered_clients) x
      where not exists(select 1 from clara.clients cl where cl.id = x and cl.firm_id = c.firm);
    if coalesce(array_length(v_bad,1),0) > 0 then
      raise exception 'covered_clients names a client not in your firm' using errcode='CLR11',
        detail = jsonb_build_object('reason','invalid_request','class','covered_clients','unknown',to_jsonb(v_bad))::text;
    end if;
    insert into clara.export_recipients (firm_id, kind, user_id, display_name, basis, covered_clients, registered_by)
      values (c.firm, 'external', null, p_display_name, p_basis, p_covered_clients, c.actor)
      returning id into v_id;
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'register_export_recipient', v_id,
    jsonb_build_object('kind', p_kind, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'register_export_recipient', p_op_key,
    jsonb_build_object('recipient_id', v_id, 'kind', p_kind));
end
$$;

-- A4 (opus F4 = Codex #6): TWO fixes. (1) `basis` on the successor row is the PREDECESSOR'S OWN
-- basis, never overwritten with the supersede reason -- the reason lives ONLY in the audit row's
-- args, where an operational "why superseded" belongs; basis is "why this recipient covers these
-- clients", a different fact the act of superseding does not change. (2) covered_clients is now an
-- EXPLICIT, REQUIRED (for kind='external') argument -- never a silent clone of the predecessor's
-- row. A true RETIREMENT lever (super­sede-to-nothing, no successor) does not exist in this PR-1;
-- registered as an owner card (TIER B), not invented here.
create function clara.supersede_export_recipient(p_recipient uuid, p_reason text,
    p_covered_clients uuid[], p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; r record; v_new uuid; v_req_hash bytea; v_reserved jsonb; v_bad uuid[];
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'a supersede act needs its idempotency key' using errcode='CLR10', detail='{"reason":"invalid_request","class":"op_key"}';
  end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    raise exception 'a supersede act states its reason' using errcode='CLR10', detail='{"reason":"invalid_request","class":"reason"}';
  end if;
  v_req_hash := clara._hash(jsonb_build_object('recipient',p_recipient,'reason',p_reason,'covered_clients',p_covered_clients));
  v_reserved := clara._reserve_op(c.firm, 'supersede_export_recipient', p_op_key, v_req_hash);
  if v_reserved is not null then return v_reserved; end if;

  select * into r from clara.export_recipients where id = p_recipient and firm_id = c.firm;
  if not found then
    raise exception 'no such export recipient in your firm' using errcode='CLR11', detail='{"reason":"export_recipient_unknown"}';
  end if;
  if r.superseded_by is not null then
    raise exception 'this export recipient already has a successor' using errcode='CLR10', detail='{"reason":"export_recipient_superseded"}';
  end if;

  if r.kind = 'external' then
    if p_covered_clients is null or cardinality(p_covered_clients) = 0 then
      raise exception 'a successor external recipient needs at least one covered client' using errcode='CLR10', detail='{"reason":"invalid_request","class":"covered_clients"}';
    end if;
    select array_agg(x) into v_bad from unnest(p_covered_clients) x
      where not exists(select 1 from clara.clients cl where cl.id = x and cl.firm_id = c.firm);
    if coalesce(array_length(v_bad,1),0) > 0 then
      raise exception 'covered_clients names a client not in your firm' using errcode='CLR11',
        detail = jsonb_build_object('reason','invalid_request','class','covered_clients','unknown',to_jsonb(v_bad))::text;
    end if;
  elsif p_covered_clients is not null then
    raise exception 'a firm_member successor carries no covered_clients' using errcode='CLR10', detail='{"reason":"invalid_request","class":"covered_clients"}';
  end if;

  insert into clara.export_recipients (firm_id, kind, user_id, display_name, basis, covered_clients, registered_by)
    values (c.firm, r.kind, r.user_id, r.display_name, r.basis,
      case when r.kind = 'external' then p_covered_clients else null end, c.actor)
    returning id into v_new;
  update clara.export_recipients set superseded_by = v_new, superseded_at = now() where id = p_recipient;

  perform clara._audit(c.firm, c.actor, null, null, 'supersede_export_recipient', v_new,
    jsonb_build_object('supersedes', p_recipient, 'reason', p_reason, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'supersede_export_recipient', p_op_key,
    jsonb_build_object('recipient_id', v_new, 'supersedes', p_recipient));
end
$$;

-- bookkeeper+ human read, the 0002:518-520 idiom. p_view: an optional filter to one sandbox view's
-- exports (NULL = every export in the firm); p_limit: page size.
create function clara.list_sandbox_exports(p_view uuid, p_limit int)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_limit int; v_rows jsonb;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows from (
    select e.id, e.sandbox_view_id, e.recipient_id, r.display_name as recipient_display_name,
           v.client_set, e.watermark_policy_version_id, e.state, e.artifact_sha256, e.byte_size,
           e.locale, e.created_at, e.finished_at, e.requested_by
      from clara.sandbox_exports e
      join clara.sandbox_views v on v.id = e.sandbox_view_id
      join clara.export_recipients r on r.id = e.recipient_id
     where e.firm_id = c.firm and (p_view is null or e.sandbox_view_id = p_view)
     order by e.created_at desc, e.id desc
     limit v_limit
  ) t;
  return v_rows;
end
$$;

reset role;

-- =====================================================================================
-- SECTION 9 -- GRANTS + THE ALLOWLIST. clara_wake_interactive is the role-level grant (the
-- estate's role-vs-allowlist split, 0107:243-249: one grant, the fine-grained per-wake_kind gate
-- lives entirely in wake_fn_allowlist / assert_wake_allowed). 'interactive' rows ONLY -- NOT
-- 'interactive_client': though F-A2's D34 limb IS merged on this chain (verified at authoring:
-- 0106/0107/0117/0121/0126 all carry the wake_kind), the LIVE estate carries its own deliberate,
-- named GB-3/D34 closed-world wall (below) capping interactive_client at exactly one verb --
-- discovered by rig replay, not assumed from the design's own Annex A.2 text. Never a 'proactive'
-- row (law 71's proactive-says-nothing posture), never unattended.
-- (Authoring-frontier statement, trued at the train merge 2026-08-25: 0129's SS4 chat-parity
-- mirror + 0131's freeform row later lawfully widened interactive_client, and the GB-3/D34 cells
-- moved onto the shared roster fixture. This lane's own choice of 'interactive' rows stands
-- unchanged; the tail's check is now set-equality against a prestate pin, not a count.)
-- =====================================================================================
set role clara_fn_owner;

revoke all on function
  clara.wake_mint_sandbox_view(jsonb,jsonb,text,jsonb,text),
  clara.wake_request_sandbox_export(uuid,uuid,text,text,jsonb,text),
  clara.wake_sandbox_export_state(uuid)
  from public;
grant execute on function
  clara.wake_mint_sandbox_view(jsonb,jsonb,text,jsonb,text),
  clara.wake_request_sandbox_export(uuid,uuid,text,text,jsonb,text),
  clara.wake_sandbox_export_state(uuid)
  to clara_wake_interactive;

-- interactive ONLY -- NOT interactive_client. Measured, not assumed from the design's own
-- Annex A.2 text ("the interactive_client triple once F-A2's D34 limb merges"): the rig-replayed
-- estate carries a DELIBERATE, NAMED closed-world invariant this design did not know about --
-- GB-3 (f-a2-chat-limb.test.mjs) and D34 (f-a2-grants.test.mjs) both assert interactive_client is
-- allowlisted for EXACTLY ONE verb, wake_open_question, "so this kind would [not] quietly become
-- a posting kind". Widening it here would violate a live safety wall this lane does not own and
-- was never priced to touch. Annex K itself already prices exactly this outcome as an acceptable
-- fallback: "if it slips: ('interactive', …) rows only; HOME-scoped sandbox works." A client-
-- pinned chat session therefore cannot mint/request a sandbox export in this build; only a
-- HOME-scoped (firm-wide) interactive session can. Ratified by the conductor 2026-08-25; A11
-- routes the design doc's own truing note (Annex A's "six rows when complete" text is now
-- superseded -- this posture is permanent unless the D34 wall itself is re-ruled).
insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('interactive', 'wake_mint_sandbox_view'),
  ('interactive', 'wake_request_sandbox_export'),
  ('interactive', 'wake_sandbox_export_state')
on conflict do nothing;

revoke all on function
  clara.sandbox_export_payload(uuid,text),
  clara.complete_sandbox_export(uuid,text,text,bigint,text),
  clara.fail_sandbox_export(uuid,text,jsonb)
  from public;
grant execute on function
  clara.sandbox_export_payload(uuid,text),
  clara.complete_sandbox_export(uuid,text,text,bigint,text),
  clara.fail_sandbox_export(uuid,text,jsonb)
  to clara_runtime;

revoke all on function
  clara.register_export_recipient(text,uuid,text,text,uuid[],text),
  clara.supersede_export_recipient(uuid,text,uuid[],text),
  clara.list_sandbox_exports(uuid,int)
  from public;
grant execute on function
  clara.register_export_recipient(text,uuid,text,text,uuid[],text),
  clara.supersede_export_recipient(uuid,text,uuid[],text),
  clara.list_sandbox_exports(uuid,int)
  to clara_authenticated;

reset role;

-- =====================================================================================
-- SECTION 10 -- THE TAIL CENSUS. Read from the live catalog, never asserted from prose. A10: this
-- section now reads REAL pg_policy rows (not the relrowsecurity/relforcerowsecurity proxy alone --
-- epsilon-grants-phase.mjs:34-70 is the model), checks ALL NINE verbs' ACLs (not a 3-verb sample),
-- and reads proconfig for the search_path pin directly (opus F6 + Codex #15).
-- =====================================================================================
do $tail$
declare
  v_n int; v_grantees text[]; v_owner_check boolean; v_policy_names text[];
  v_verb text; v_expected_grantee text; v_sig text;
  v_search_path_ok boolean;
begin
  -- (a) The three relations: FORCE RLS, exactly the owner+human policy pair, correct triggers.
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname in ('sandbox_views','sandbox_exports','export_recipients')
      and c.relrowsecurity and c.relforcerowsecurity;
  if v_n <> 3 then
    raise exception 'f_a5b pr1 tail: expected 3 force-RLS relations, found %', v_n using errcode = 'CLR10';
  end if;

  -- (a2) A10: the REAL policy census, both directions, per relation -- exactly {owner, human},
  -- read from pg_policy directly (not the relrowsecurity/relforcerowsecurity count proxy above).
  select coalesce(array_agg(polname order by polname), '{}') into v_policy_names
    from pg_policy where polrelid = 'clara.sandbox_views'::regclass;
  if v_policy_names is distinct from array['p_sandboxviews_human','p_sandboxviews_owner'] then
    raise exception 'f_a5b pr1 tail: sandbox_views policy set is %, expected exactly {p_sandboxviews_human, p_sandboxviews_owner}', v_policy_names using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(polname order by polname), '{}') into v_policy_names
    from pg_policy where polrelid = 'clara.sandbox_exports'::regclass;
  if v_policy_names is distinct from array['p_sandboxexports_human','p_sandboxexports_owner'] then
    raise exception 'f_a5b pr1 tail: sandbox_exports policy set is %, expected exactly {p_sandboxexports_human, p_sandboxexports_owner}', v_policy_names using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(polname order by polname), '{}') into v_policy_names
    from pg_policy where polrelid = 'clara.export_recipients'::regclass;
  if v_policy_names is distinct from array['p_exportrecipients_human','p_exportrecipients_owner'] then
    raise exception 'f_a5b pr1 tail: export_recipients policy set is %, expected exactly {p_exportrecipients_human, p_exportrecipients_owner}', v_policy_names using errcode = 'CLR10';
  end if;

  -- (a3) Codex re-review followup: polname alone proves a LABEL, not a POLICY -- a rename-only
  -- drift (right name, wrong roles/command/predicate) would pass the census above silently. Read
  -- polroles, polcmd, polpermissive and polqual/polwithcheck for every one of the six policies
  -- too (epsilon-grants-phase.mjs:34-70's polroles-exact-match idiom, extended here to the full
  -- shape). Codex final confirm followup: the human qual was matched by a PATTERN
  -- (`firm_id.*jwt_firm\(\)`) that would have accepted `firm_id = jwt_firm() OR true` -- an exact
  -- match against the byte-for-byte deparsed text this file actually ships closes that. polroles
  -- for a PERMISSIVE policy still combine with OR across policies of the same command, so a stray
  -- RESTRICTIVE-flagged row on either policy would silently change the access shape without any
  -- other column here catching it -- polpermissive is now checked explicitly, both must be true.
  foreach v_sig in array array['sandbox_views','sandbox_exports','export_recipients']
  loop
    if not exists(select 1 from pg_policy p
        where p.polrelid = ('clara.' || v_sig)::regclass
          and p.polname = 'p_' || replace(v_sig, '_', '') || '_owner'
          and p.polroles = array['clara_fn_owner'::regrole]::oid[]
          and p.polcmd = '*'
          and p.polpermissive
          and pg_get_expr(p.polqual, p.polrelid) = 'true'
          and pg_get_expr(p.polwithcheck, p.polrelid) = 'true') then
      raise exception 'f_a5b pr1 tail: clara.%''s owner policy does not match the expected {clara_fn_owner, ALL, PERMISSIVE, using(true), with check(true)} shape', v_sig using errcode = 'CLR10';
    end if;
    if not exists(select 1 from pg_policy p
        where p.polrelid = ('clara.' || v_sig)::regclass
          and p.polname = 'p_' || replace(v_sig, '_', '') || '_human'
          and p.polroles = array['clara_authenticated'::regrole]::oid[]
          and p.polcmd = 'r'
          and p.polpermissive
          and pg_get_expr(p.polqual, p.polrelid) = '(firm_id = clara.jwt_firm())'
          and p.polwithcheck is null) then
      raise exception 'f_a5b pr1 tail: clara.%''s human policy does not match the expected {clara_authenticated, SELECT, PERMISSIVE, firm_id=clara.jwt_firm(), no with-check} shape', v_sig using errcode = 'CLR10';
    end if;
  end loop;

  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname = 'sandbox_views' and not t.tgisinternal;
  if v_n <> 2 then
    raise exception 'f_a5b pr1 tail: sandbox_views expected 2 triggers (append_only, no_truncate), found %', v_n using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname = 'sandbox_exports' and not t.tgisinternal;
  if v_n <> 2 then
    raise exception 'f_a5b pr1 tail: sandbox_exports expected 2 triggers (lifecycle, no_truncate), found %', v_n using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname = 'export_recipients' and not t.tgisinternal;
  if v_n <> 2 then
    raise exception 'f_a5b pr1 tail: export_recipients expected 2 triggers (lifecycle, no_truncate), found %', v_n using errcode = 'CLR10';
  end if;

  -- (b) No clara_agent_ro table grant anywhere on the three (F-A5's C4/C5 posture, inherited).
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara' and c.relname in ('sandbox_views','sandbox_exports','export_recipients')
      and has_table_privilege('clara_agent_ro', c.oid, 'SELECT');
  if v_n <> 0 then
    raise exception 'f_a5b pr1 tail: clara_agent_ro must hold zero table grants on the three relations, found %', v_n using errcode = 'CLR10';
  end if;

  -- (c) The five ungranted cores: zero EXECUTE to any role but the owner. Codex re-review
  -- followup, same class as (e) below -- a five-name candidate list can only find EXTRAS among
  -- names it thought to ask about; derive the grantee universe from each core's own ACL instead.
  select coalesce(array_agg(distinct rolname order by rolname), '{}') into v_grantees
    from (
      select case when a.grantee = 0 then 'public' else r.rolname end as rolname
        from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        left join pg_roles r on r.oid = a.grantee
       where p.oid in ('clara._sandbox_client_set(uuid,jsonb,jsonb)'::regprocedure,
           'clara._recipient_covers(uuid,uuid[],uuid)'::regprocedure,
           'clara._watermark_policy_version_for(text,text,date)'::regprocedure,
           'clara._sandbox_view_mint_core(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text)'::regprocedure,
           'clara._sandbox_export_request_core(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,text,text)'::regprocedure)
         and a.privilege_type = 'EXECUTE'
    ) g
   where g.rolname <> 'clara_fn_owner';
  if coalesce(array_length(v_grantees,1),0) <> 0 then
    raise exception 'f_a5b pr1 tail: an ungranted core is reachable by an unexpected role: %', v_grantees using errcode = 'CLR10';
  end if;

  -- (d) The wake grant roster, BOTH directions (F5-D30): exactly 3 allowlist rows, exactly these
  -- three function names, 'interactive' ONLY, never proactive. NOT 'interactive_client' -- measured
  -- at authoring: the estate's own GB-3/D34 closed-world cells assert interactive_client is
  -- allowlisted for EXACTLY ONE verb (wake_open_question), a deliberate anti-capability-creep wall
  -- this lane does not own. Annex K's own documented fallback ships instead. (Authoring-frontier
  -- statement -- see the SECTION 9 header's train-merge truing note; the check below is
  -- self-scoped to this lane's three names and needed no change.)
  select count(*) into v_n from clara.wake_fn_allowlist
    where function_name in ('wake_mint_sandbox_view','wake_request_sandbox_export','wake_sandbox_export_state');
  if v_n <> 3 then
    raise exception 'f_a5b pr1 tail: expected exactly 3 allowlist rows for this lane''s wrappers, found %', v_n using errcode = 'CLR10';
  end if;
  if exists(select 1 from clara.wake_fn_allowlist
      where function_name in ('wake_mint_sandbox_view','wake_request_sandbox_export','wake_sandbox_export_state')
        and wake_kind <> 'interactive') then
    raise exception 'f_a5b pr1 tail: an allowlist row for this lane''s wrappers admits an unexpected wake_kind' using errcode = 'CLR10';
  end if;
  -- Train fix 2026-08-25: was a count-of-1 literal (true only at the authoring frontier; 0129's
  -- SS4 mirror + 0131's freeform row lawfully widened this kind while the PR rode the train).
  -- The claim this file actually owes is UNCHANGEDNESS: the set equals the prestate pin, both
  -- directions, and the D34 anchor row is still present. Set-equality, never a count -- a count
  -- of N would go stale at the NEXT lawful widening exactly as the 1 did.
  if exists(select function_name from clara.wake_fn_allowlist where wake_kind = 'interactive_client'
            except select function_name from _fa5b_pin_ic_allowlist)
     or exists(select function_name from _fa5b_pin_ic_allowlist
               except select function_name from clara.wake_fn_allowlist where wake_kind = 'interactive_client')
     or not exists(select 1 from clara.wake_fn_allowlist
       where wake_kind = 'interactive_client' and function_name = 'wake_open_question') then
    raise exception 'f_a5b pr1 tail: interactive_client''s allowlist set changed under this file (or the wake_open_question anchor is gone) -- this file must not touch a kind it does not own' using errcode = 'CLR10';
  end if;

  -- F5-D30 followup (Codex re-review): wake_fn_allowlist's own PK is (wake_kind, function_name) --
  -- BARE NAME, no argument-type column (0002:247-251, an estate-wide foundational shape this file
  -- cannot alter). assert_wake_allowed() therefore checks by name alone, so an allowlist row is only
  -- as precise as its name is UNAMBIGUOUS: if Postgres ever held a SECOND overload of the same bare
  -- name, the allowlist row could not say which one it means, and the (e) ACL checks below pinning
  -- full signatures would prove nothing about which overload the allowlist actually authorizes. Pin
  -- exact-signature discipline here too: for each of this lane's three allowlisted names, prove
  -- exactly one regprocedure in schema clara answers to that bare name.
  foreach v_sig in array array['wake_mint_sandbox_view','wake_request_sandbox_export','wake_sandbox_export_state']
  loop
    select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = v_sig;
    if v_n <> 1 then
      raise exception 'f_a5b pr1 tail: wake_fn_allowlist row "%" is ambiguous -- % overload(s) share this bare name in schema clara, but the allowlist''s own PK cannot disambiguate which one it authorizes', v_sig, v_n using errcode = 'CLR10';
    end if;
  end loop;

  -- (e) EXECUTE grantees, exact sets, no PUBLIC, no extra grantee -- ALL NINE verbs (A10: no longer
  -- a 3-verb sample), plus the search_path pin read directly from proconfig for each.
  for v_verb, v_expected_grantee in
    select * from (values
      ('wake_mint_sandbox_view(jsonb,jsonb,text,jsonb,text)', 'clara_wake_interactive'),
      ('wake_request_sandbox_export(uuid,uuid,text,text,jsonb,text)', 'clara_wake_interactive'),
      ('wake_sandbox_export_state(uuid)', 'clara_wake_interactive'),
      ('sandbox_export_payload(uuid,text)', 'clara_runtime'),
      ('complete_sandbox_export(uuid,text,text,bigint,text)', 'clara_runtime'),
      ('fail_sandbox_export(uuid,text,jsonb)', 'clara_runtime'),
      ('register_export_recipient(text,uuid,text,text,uuid[],text)', 'clara_authenticated'),
      ('supersede_export_recipient(uuid,text,uuid[],text)', 'clara_authenticated'),
      ('list_sandbox_exports(uuid,int)', 'clara_authenticated')
    ) t(sig, grantee)
  loop
    -- Codex re-review followup: a fixed 7-role candidate list can only find EXTRAS among names it
    -- already thought to ask about -- a grant to an UNLISTED role (any lane's own wake_* /
    -- runtime_login role this census never named) would silently evade the "exact" claim. Derive
    -- the grantee universe from the function's OWN ACL instead (aclexplode over proacl), so every
    -- role that has ever actually been granted EXECUTE surfaces, not just the ones this file
    -- thought to probe.
    -- clara_fn_owner excluded (not just unlisted): the owner ALWAYS implicitly holds every
    -- privilege regardless of any ACL entry, and the moment ANY revoke/grant touches an object
    -- Postgres materialises that implicit privilege into an EXPLICIT `owner=X/owner` aclitem (the
    -- default-ACL materialisation) -- so aclexplode surfaces the owner for essentially every
    -- function this file touches, exactly like a hand-probed candidate list never would have (it
    -- never named clara_fn_owner as a candidate to begin with). The "exact grantee" claim is about
    -- APPLICATION roles; the owner was never part of that universe.
    select coalesce(array_agg(distinct rolname order by rolname), '{}') into v_grantees
      from (
        select case when a.grantee = 0 then 'public' else r.rolname end as rolname
          from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          left join pg_roles r on r.oid = a.grantee
         where p.oid = ('clara.' || v_verb)::regprocedure
           and a.privilege_type = 'EXECUTE'
      ) g
     where g.rolname <> 'clara_fn_owner';
    if v_grantees is distinct from array[v_expected_grantee] then
      raise exception 'f_a5b pr1 tail: clara.% grantees are %, expected exactly %', v_verb, v_grantees, v_expected_grantee using errcode = 'CLR10';
    end if;
    select ('search_path=clara, pg_temp' = any(p.proconfig)) into v_search_path_ok
      from pg_proc p where p.oid = ('clara.' || v_verb)::regprocedure;
    if not coalesce(v_search_path_ok, false) then
      raise exception 'f_a5b pr1 tail: clara.% does not pin search_path=clara, pg_temp', v_verb using errcode = 'CLR10';
    end if;
  end loop;

  -- (f) Every function this file minted is SECURITY DEFINER, owned by clara_fn_owner, search_path
  -- pinned (the cores + triggers too, not only the nine grantable verbs checked above).
  select bool_and(p.prosecdef and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
      and ('search_path=clara, pg_temp' = any(p.proconfig))) into v_owner_check
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname in (
      '_sandbox_client_set','_recipient_covers','_watermark_policy_version_for',
      '_sandbox_view_mint_core','_sandbox_export_request_core',
      'wake_mint_sandbox_view','wake_request_sandbox_export','wake_sandbox_export_state',
      'sandbox_export_payload','complete_sandbox_export','fail_sandbox_export',
      'register_export_recipient','supersede_export_recipient','list_sandbox_exports',
      '_tf_export_recipients_lifecycle','_tf_sandbox_export_lifecycle');
  if not coalesce(v_owner_check, false) then
    raise exception 'f_a5b pr1 tail: not every minted function is SECURITY DEFINER + search_path-pinned + owned by clara_fn_owner' using errcode = 'CLR10';
  end if;

  -- (f2) opus F2: the CoR delegation actually holds -- watermark_policy_for and the core it now
  -- calls resolve the SAME row for the SAME inputs (a behavioural proof, not a text-shape one).
  declare v_direct jsonb; v_via_public jsonb; v_id uuid;
  begin
    select id, watermark into v_id, v_direct from clara._watermark_policy_version_for('sandbox_watermark','en',clara._book_today());
    v_via_public := clara.watermark_policy_for('sandbox_watermark','en',clara._book_today());
    if v_direct is distinct from v_via_public then
      raise exception 'f_a5b pr1 tail: watermark_policy_for''s CoR does not delegate to the shared core -- direct % vs public %', v_direct, v_via_public using errcode = 'CLR10';
    end if;
  end;

  -- (f3) opus F2 nuance (final round): the REFUSAL path too, byte-compared -- proves the CoR
  -- moved ONLY the intended thing (dropping the stale 'fix' key), nothing else. Both bodies raise
  -- CLR10 on the same unresolvable (policy_key, locale, as_of); their detail payloads must match
  -- on every key the ORIGINAL 0111 body carried except 'fix', which must be deliberately, provably
  -- absent from BOTH the direct core and the public CoR (not merely absent from one and present on
  -- the other, which would mean the delegation itself dropped something the core still carries).
  declare
    v_refuse_direct jsonb; v_refuse_public jsonb; v_raised boolean;
    v_detail text; v_unresolvable date := '1900-01-01'::date; v_keys text[];
  begin
    v_raised := false;
    begin
      perform clara._watermark_policy_version_for('sandbox_watermark', 'en', v_unresolvable);
    exception when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_refuse_direct := v_detail::jsonb;
      v_raised := true;
    end;
    if not v_raised then
      raise exception 'f_a5b pr1 tail: the direct core unexpectedly resolved an unresolvable window' using errcode = 'CLR10';
    end if;

    v_raised := false;
    begin
      perform clara.watermark_policy_for('sandbox_watermark', 'en', v_unresolvable);
    exception when sqlstate 'CLR10' then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_refuse_public := v_detail::jsonb;
      v_raised := true;
    end;
    if not v_raised then
      raise exception 'f_a5b pr1 tail: the public CoR unexpectedly resolved an unresolvable window' using errcode = 'CLR10';
    end if;

    if (v_refuse_direct - 'fix') is distinct from (v_refuse_public - 'fix') then
      raise exception 'f_a5b pr1 tail: refusal payloads differ beyond the deliberately-dropped fix key -- direct % vs public %', v_refuse_direct, v_refuse_public using errcode = 'CLR10';
    end if;
    if (v_refuse_direct ? 'fix') or (v_refuse_public ? 'fix') then
      raise exception 'f_a5b pr1 tail: the fix key resurfaced -- direct % vs public %', v_refuse_direct, v_refuse_public using errcode = 'CLR10';
    end if;

    -- opus, one-liner nit (final confirm): the checks above prove fix-absence and delegation,
    -- but not the KEY SET -- a later edit that also dropped policy_key/as_of from both bodies
    -- would still pass them. Pin the set explicitly: 0111's original set minus 'fix', exactly.
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_refuse_direct) k;
    if v_keys is distinct from array['as_of','locale','policy_key','reason'] then
      raise exception 'f_a5b pr1 tail: refusal payload key set is %, expected exactly {as_of,locale,policy_key,reason}', v_keys using errcode = 'CLR10';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_refuse_public) k;
    if v_keys is distinct from array['as_of','locale','policy_key','reason'] then
      raise exception 'f_a5b pr1 tail: public CoR refusal payload key set is %, expected exactly {as_of,locale,policy_key,reason}', v_keys using errcode = 'CLR10';
    end if;
  end;

  -- (g) 3 sandbox_watermark rows, exactly en/ms/zh, no other locale seeded by this file.
  select count(*) into v_n from clara.watermark_policy_versions
    where policy_key = 'sandbox_watermark' and locale in ('en','ms','zh');
  if v_n <> 3 then
    raise exception 'f_a5b pr1 tail: expected 3 sandbox_watermark rows across en/ms/zh, found %', v_n using errcode = 'CLR10';
  end if;

  -- (h) Zero rows in the two new tables that carry data (relations born empty; watermark rows are
  -- on a pre-existing F-A5 PR-1 table, not counted here).
  select count(*) into v_n from clara.sandbox_views;
  if v_n <> 0 then raise exception 'f_a5b pr1 tail: sandbox_views expected 0 rows at migration end, found %', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.sandbox_exports;
  if v_n <> 0 then raise exception 'f_a5b pr1 tail: sandbox_exports expected 0 rows at migration end, found %', v_n using errcode = 'CLR10'; end if;
  select count(*) into v_n from clara.export_recipients;
  if v_n <> 0 then raise exception 'f_a5b pr1 tail: export_recipients expected 0 rows at migration end, found %', v_n using errcode = 'CLR10'; end if;

  -- (i) No table in workflow/graphile_worker/spike touched (constraint 15 -- printed, never assumed).
  select count(*) into v_n from information_schema.tables
    where table_schema in ('workflow','graphile_worker','spike')
      and table_name in ('sandbox_views','sandbox_exports','export_recipients');
  if v_n <> 0 then
    raise exception 'f_a5b pr1 tail: a frozen schema was touched' using errcode = 'CLR10';
  end if;

  raise notice 'f_a5b pr1 tail: OK -- 3 relations FORCE-RLS with EXACTLY the owner/human pg_policy pair (real census, not a proxy), correct triggers, zero clara_agent_ro table grant, 5 ungranted cores reachable by no application role, 3 allowlist rows (interactive ONLY, D34''s one-row wall measured intact), all NINE verb ACLs exact + search_path-pinned, every minted function SECURITY DEFINER + search_path-pinned owned by clara_fn_owner, the watermark_policy_for CoR proven to delegate behaviourally, 3 sandbox_watermark rows (en/ms/zh, book-today-dated), all three new relations born with 0 rows, no frozen schema touched. TIER A of the post-push fix round folded: basis integrity (dup/blank labels, every-element validation, the free-text firm_closure fail-safe), the watermark single authority, provenance threading + reserve_op hash coverage, supersede truth (basis untouched, covered_clients explicit), storage_key binding, wake_sandbox_export_state volatile, the 0079 lease-CHECK trio, book_today in the seed DML, external-export dark until the disclosure-authorization register lands. TIER B (the substitution seam''s numeral path; the disclosure-authorization register''s own design + retirement lever + threat model) are OWNER CARDS, not built here.';
end
$tail$;
