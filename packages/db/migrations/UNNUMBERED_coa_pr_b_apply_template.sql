-- UNNUMBERED_coa_pr_b_apply_template.sql -- 裁-21 PR-b: THE APPLY HALF of the firm-level standard
-- chart of accounts. apply_coa_template · add_coa_template_family · the deterministic family plan ·
-- the chart-state read that finally CONSUMES coa_seed_decision · coa_template_drift ·
-- firm_coa_drift · get_coa_template_adoption, plus the entity-variant override rows 0150 handed
-- forward in writing.
--
-- MIGRATION NUMBER: NOT CLAIMED. Authored UNNUMBERED per .claude/rules/db-migrations.md and
-- AGENTS.md constraint 10 -- the conductor claims the number at MERGE. Rig-validated against a
-- repo frontier of 150 files / 0155.
--
-- DESIGN OF RECORD: docs/plan/active/coa-template-design.md (D-3, D-4, D-8, D-10, D-11, D-12) ·
-- docs/plan/active/coa-template-annexes.md Annex C (the battery), Annex D (the frontend homes),
-- Annex E (the non-goals), Annex G (PR-b's scope) ·
-- docs/plan/active/coa-template-gate-record.md (CLOSED, all twelve RULED 裁-23) ·
-- docs/plan/active/fa7b-gate-record.md (the five materials playbooks).
-- THE RULINGS OVERRIDE THE DESIGN WHERE THEY DIFFER, and 0150's shipped shape overrides both
-- where it measured something the design only sketched.
--
-- WHICH RULINGS THIS FILE DISCHARGES
--   Q3  BOOKKEEPER floor on apply_coa_template and add_coa_template_family (admin keeps
--       fork/edit/publish/retire, which 0150 already shipped). The ruled chain is
--       "Clara proposes the trim -> a bookkeeper may EDIT it (toggling families) and applies it
--       -> an admin publishes the template", and the EDIT lands on this door's p_families
--       argument -- no new permissive door, and no agent path to the bulk act (Annex E).
--   Q4  BELCORT's chart wins: rung 5 REFUSES a client whose books already carry accounts
--       (chart_not_empty). The escape hatch stays -- answer "manual" at onboarding, build it
--       their way, and coa_chart_state reports the client `off_standard` rather than hiding it.
--   Q5  NOT AUTOMATIC. commit_client_onboarding is NOT touched by this file. The apply is a
--       separate human act, so §D1 below stays EMPTY and no write-quiesce window is owed.
--   Q6  the fail-closed trim: when an axis is ABSENT the plan proposes the `core` families only
--       and NAMES the absent axis. Never an inference from the client's NAME (review law 3).
--   Q10 the equity section swaps by entity type -- discharged by the plan's key match, which
--       treats an entity_types-keyed family as SELECTED BY AXIS whatever its `inclusion`
--       (departures register (3)); without that, 0150's `opt_in` equity families could never be
--       proposed and Q10 would be ruled but not built.
--
-- FRONTEND HOMES (.claude/rules/db-migrations.md -- every clara_authenticated door names one).
--   apply_coa_template · add_coa_template_family   -> T11's onboarding checklist card (the
--       in-thread "apply the firm's standard chart" row, R7's shape,
--       port-wave-plan-2026-08-28.md:385-389) AND PR-d's /admin COA template editor panel.
--       BOTH are named because both act on the same door: the checklist is where a new client's
--       chart is applied, the /admin panel is where a firm applies its standard to a client that
--       was onboarded before the template existed.
--   coa_template_family_plan · coa_chart_state · get_coa_template_adoption
--                                                  -> T11's onboarding checklist card (the
--       keep/drop fieldset's default checkbox state and the deferred-activation banner) and
--       apps/web/components/registers/chart-of-accounts-register.tsx.
--   coa_template_drift  -> apps/web/components/registers/chart-of-accounts-register.tsx, a
--       StateBanner -- never a count the UI computes (Annex D).
--   firm_coa_drift      -> PR-d's /admin COA template editor panel, the firm drift list.
-- Annex D's scope note stands and is NOT absorbed silently: if PR-d finds no /admin shell in
-- apps/web, that panel is its first tenant.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: EMPTY
-- =====================================================================================
-- No live PL/pgSQL body is replaced. Every function this file installs is NEW; the four bodies of
-- the upsert_account chain are CALLED, never recut. S0 snapshots EVERY function in schema clara
-- (oid, prosrc sha256, proacl, proowner) and the tail requires that every pre-existing function
-- is byte-identical on all three and that the only additions are exactly this file's own names,
-- pinned as a MAP of signatures rather than a count. A whole-catalog differential, not a roster
-- probe.
--
-- THE FOUR CHAIN SHAS, RE-DERIVED ON THIS LANE'S PRISTINE REPLAY at frontier 0155 (Annex G's
-- PR-0 obligation 1) and asserted LIVE in S0 rather than trusted from any document:
--   clara._upsert_account_core(jsonb,uuid,text,text,text,text,text,text)
--        5e0819f3b1e726b2cd5a6e05c3189992e9ac699910254324b6ba87022f1514e0
--   clara.upsert_account(uuid,text,text,text,text,text,text)
--        45dc1f860cd404acfe8e90cc2a45ee3b8dec083a09230f6cc70d64d4e3e191db
--   clara._agent_upsert_account_core(uuid,text,text,text,text,text,text,jsonb,text,text)
--        10a7e6ed63d5137514f608fe6716e50f65468ec92186f85b3b902b45ce4ea798
--   clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)
--        6a2809f94e6351221595b0f5df1b645611a9772e2efadc0b24a5a03cfa59ae85
--
-- ANNEX G PR-0 OBLIGATION 2, DISCHARGED: **CLR37 IS THE FIXED-ASSET ENROLMENT RUNG.** Survey F2b
-- recorded that the live _upsert_account_core carries a CLR37 rung appearing in no migration file
-- the lane read, and forbade any lane from claiming to know the core's ladder until it was
-- located. Read from the live catalog on this lane's replay: the rung is 0041 (D-a SS5.6)'s
-- "account % backs an active fixed-asset enrolment; retire that enrolment before changing or
-- deactivating the account", raised when clara.fa_account_profiles holds an ACTIVE profile naming
-- the code. It cannot fire on this door's path -- rung 5 proves the client's chart is EMPTY, so no
-- profile can name any code being planted -- and that is a consequence of the ladder, not luck.
-- The full live ladder the apply loop inherits, in body order: core-ctx present -> op_key
-- required -> _reserve_op dedupe -> client-in-firm (CLR11) -> type/class change on an account
-- with journal lines (CLR10) -> the CLR37 fixed-asset enrolment rung -> the upsert -> _audit ->
-- account.upserted -> _finish_op.
--
-- =====================================================================================
-- DEPARTURES REGISTER -- every place this file's built shape diverges from the design's sketch,
-- in one place, so a reviewer finds every delta here rather than diffing prose.
-- =====================================================================================
-- (1) p_families NULL MEANS "THE DATABASE'S OWN PLAN". D-3 sketches p_families as always
--     supplied. A NULL is not a silent default for a missing argument: it is the EXPLICIT
--     request for the deterministic, DB-owned trim that coa_template_family_plan computes from
--     the client's own recorded facts, and the door records which of the two happened in its
--     audit row and its return value (`families_source`: 'caller' | 'plan'). It exists because
--     the interview lane and the checklist card both need a plan they did not author, and
--     because a model-supplied family list must never be the ONLY way to reach this door.
--     An EMPTY array is not the same thing and is refused at rung 8 (every core family missing).
-- (2) RUNG 6 REFUSES ON AN 'adopted' ROW ONLY. D-3 says "no live coa_template_adoptions row";
--     taken literally that would refuse the very case the design's own apply loop describes
--     ("the client's 'proposed' row moved there"). A 'proposed' row is the thing being applied:
--     it is MOVED to 'adopted' when it names this same template version, and SUPERSEDED (law 6 --
--     a state, never a delete) when the human applies a different template than Clara proposed.
-- (3) AN AXIS-KEYED FAMILY IS SELECTED BY AXIS WHATEVER ITS `inclusion`. The design reads
--     `by_industry` as the trim's unit and `opt_in` as human-only. 0150 SHIPPED the three
--     entity-type equity families, private_and_proprietor_expenses and
--     director_and_related_party_balances as `opt_in` WITH entity_types keys -- so an
--     inclusion-only rule would make Q10's ruled equity swap unreachable by any plan, and a Sdn
--     Bhd would be proposed no Share Capital at all. The rule this file builds is therefore about
--     KEYS, not about the inclusion label: `core` is always kept; a family declaring at least one
--     trim key is kept when the client's facts POSITIVELY match every axis it declares; a family
--     declaring NO key and not `core` is human opt-in only and no plan ever proposes it.
--     Measured on 0150's own seed, that rule keeps 20 core + the matching keyed families and
--     leaves the 9 unkeyed opt_in families (motor_vehicles, foreign_currency, leave_passage,
--     motor_running_costs, club_subscriptions_and_entrance_fees, land_and_buildings,
--     intangible_assets, provisions, and any successor) to the human.
-- (4) MSIC MATCHES ON THE DIVISION, NEVER THE SECTION. Every MSIC-keyed family 0150 seeds carries
--     BOTH a section letter and its divisions. A client's `msic` fact is a bare five-digit code,
--     and mapping a code to a SECTION would need exactly the MSIC->industry registry Annex E
--     refuses to build ("a mapping table implies a validation the product cannot perform"). The
--     plan therefore keys on left(msic,2) against msic_divisions and treats msic_sections as
--     authored policy METADATA that the editor panel displays. Q12's own note says the trim keys
--     on the broad level so an edition change cannot silently break it; the division is that
--     level, and it is the half this product can actually evaluate.
-- (5) THE AXES ARE READ AS coalesce(LIVE FACT, LATEST COMMITTED INTERVIEW ANSWER) -- the estate's
--     own live idiom, spliced into clara.get_context_pack by 0055 S6 for exactly these two keys
--     ("the captured fact wins, the interview answer is the fallback -- a door onto a wall is what
--     this avoids"). Design D-8 reasons from `client_facts` alone and observes it is empty across
--     the estate; reading only facts would make the plan core-only for every real client and the
--     trim would look correct while doing nothing. `trade_nature` takes the same two-source read
--     even though no interview segment writes it today -- one idiom, one spelling, and it starts
--     working the day 裁-21's own D-7 segment lands, with no body change.
-- (6) THE READS' FLOOR IS clara_authenticated + RLS, not Annex D's "bookkeeper (read)" /
--     "admin (read)" labels -- 0150's departures register (6), same grounds, restated because
--     firm_coa_drift is the one Annex D calls admin: a rank floor inside an INVOKER-rights body
--     would be defeated by a direct SELECT on coa_accounts, which p_coa_accounts_human already
--     grants to every authenticated firm member. Claiming an admin floor here would be dishonest.
-- (7) clara.coa_template_entity_overrides -- a FIFTH relation the design does not sketch, and the
--     one scope judgement this lane made. 0150's header hands PR-b a written obligation: the core
--     equity_common family plants 3900 Retained Earnings unconditionally, the addendum ships 3040
--     Accumulated Fund in the society-keyed family, "so a society applying this template gets
--     BOTH, one mislabelled for its entity type. PR-a seeds both exactly as the research ships
--     them; THE RELABEL IS PR-b's APPLY-TIME JOB." Discharging the relabel ALONE would leave a
--     society holding two accounts named "Accumulated Fund" -- worse than the one mislabelled
--     account it was meant to fix -- so the override carries two operations and the society case
--     takes one row of each: 3900 is RELABELLED (keeping the retained_earnings marker the estate
--     requires) and 3040 is SUPPRESSED. It is migration-seeded, reviewed DATA with a `basis` on
--     every row, no door writes it, and it is keyed on the RESOLVED entity_type -- so a client
--     whose entity type is unknown gets the template's own names, fail-closed.
-- (8) add_coa_template_family REFUSES A CODE CONFLICT BY TYPE OR CLASS (D-4's `code_conflict`,
--     naming the code) BEFORE the loop starts, rather than letting the core's has-lines guard
--     surface mid-loop. It also refuses a code the client already carries at the SAME type and
--     class, as `code_already_present` -- an upsert that renames a live account under the human's
--     feet is not what "add a family" means, and D-4's own promise is additive.
-- (9) ONE NEW EVENT TYPE, account.chart_applied, registered as the COUPLED PAIR the estate
--     requires (clara.event_types + clara.trigger_taxonomy at the ACTIVE version) -- registering
--     in one alone is the half-registration the coverage census refuses (0154's own words). The
--     per-account clara._append_event('account.upserted') the core already emits is unchanged and
--     unsuppressed; this is one additional chart-level event per apply, carrying the family list.

set local statement_timeout = '5min'; -- PRECAUTIONARY, not load-bearing: one small table, two
  -- seed rows, two catalog rows and eleven functions. Nothing here backfills.

-- =====================================================================================
-- S0 -- PRESTATE. Every claim this file makes about the frontier it lands on, MEASURED, with an
-- abort on a false premise. Nothing below proceeds on a doc's say-so.
-- =====================================================================================
create temp table _coa_prb_fn_snapshot on commit drop as
  select p.oid,
         p.oid::regprocedure::text as sig,
         encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as prosrc_sha256,
         coalesce(array_to_string(p.proacl::text[], '|'), '<null>') as acl,
         pg_get_userbyid(p.proowner) as owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara';

create temp table _coa_prb_frozen_snapshot on commit drop as
  select n.nspname, count(*)::int as relations
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('workflow', 'graphile_worker', 'spike')
   group by n.nspname;

do $s0$
declare
  r record; v_n int; v_txt text; v_tmpl uuid;
begin
  -- (a) Nothing this file births may already exist.
  if to_regclass('clara.coa_template_entity_overrides') is not null then
    raise exception 'S0: clara.coa_template_entity_overrides already exists -- refusing to re-birth'
      using errcode = 'CLR10';
  end if;
  for r in select x from unnest(array[
      'clara._coa_client_axis(uuid,text)',
      'clara._coa_client_axes(uuid)',
      'clara._coa_effective_account_name(uuid,text,text,text)',
      'clara._coa_family_plan(uuid,uuid)',
      'clara._coa_plant_family(jsonb,uuid,uuid,text,text)',
      'clara.coa_template_family_plan(uuid,uuid)',
      'clara.apply_coa_template(uuid,uuid,text[],text)',
      'clara.add_coa_template_family(uuid,uuid,text,text)',
      'clara.get_coa_template_adoption(uuid)',
      'clara.coa_chart_state(uuid)',
      'clara.coa_template_drift(uuid)',
      'clara.firm_coa_drift()']) x loop
    if to_regprocedure(r.x) is not null then
      raise exception 'S0: % already exists -- refusing to re-birth', r.x using errcode = 'CLR10';
    end if;
  end loop;

  -- (b) 0150's four relations are present -- this file is PR-b and has no meaning without PR-a.
  for r in select x from unnest(array[
      'clara.coa_templates','clara.coa_template_families',
      'clara.coa_template_accounts','clara.coa_template_adoptions',
      'clara.coa_accounts','clara.clients','clara.client_facts','clara.client_fact_keys',
      'clara.onboarding_plans','clara.onboarding_plan_items',
      'clara.event_types','clara.trigger_taxonomy','clara.taxonomy_active']) x loop
    if to_regclass(r.x) is null then
      raise exception 'S0: required relation % is missing', r.x using errcode = 'CLR10';
    end if;
  end loop;

  -- (c) THE FOUR CHAIN BODIES, at their EXACT signatures and their EXACT prosrc shas. Law 3:
  --     prove the identifier IS its import. A sha mismatch means the body moved under this lane's
  --     replay and the apply loop's inherited ladder is no longer the one SS0 documents.
  for r in select * from (values
      ('clara._upsert_account_core(jsonb,uuid,text,text,text,text,text,text)',
       '5e0819f3b1e726b2cd5a6e05c3189992e9ac699910254324b6ba87022f1514e0'),
      ('clara.upsert_account(uuid,text,text,text,text,text,text)',
       '45dc1f860cd404acfe8e90cc2a45ee3b8dec083a09230f6cc70d64d4e3e191db'),
      ('clara._agent_upsert_account_core(uuid,text,text,text,text,text,text,jsonb,text,text)',
       '10a7e6ed63d5137514f608fe6716e50f65468ec92186f85b3b902b45ce4ea798'),
      ('clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)',
       '6a2809f94e6351221595b0f5df1b645611a9772e2efadc0b24a5a03cfa59ae85')
    ) as t(sig, sha) loop
    if to_regprocedure(r.sig) is null then
      raise exception 'S0: % does not resolve at its pinned signature', r.sig using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_txt
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_txt <> r.sha then
      raise exception 'S0: % has prosrc sha % -- this file was built against %', r.sig, v_txt, r.sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (d) THE CLR37 RUNG IS WHERE SS0 SAYS IT IS. Not a claim about the file it came from -- a
  --     POSITIVE read of the live body, so the apply loop's documented inherited ladder is
  --     measured rather than asserted (review law 2).
  select p.prosrc into v_txt from pg_proc p
    where p.oid = 'clara._upsert_account_core(jsonb,uuid,text,text,text,text,text,text)'::regprocedure;
  if position('CLR37' in v_txt) = 0
     or position('fa_account_profiles' in v_txt) = 0
     or position('fa_enrolled_account_deactivation' in v_txt) = 0 then
    raise exception 'S0: the live _upsert_account_core does not carry the CLR37 fixed-asset enrolment rung SS0 documents -- the ladder is not the one this file inherits'
      using errcode = 'CLR10';
  end if;

  -- (e) Every helper the doors call, at its EXACT signature.
  for r in select x from unnest(array[
      'clara._human_ctx(integer)','clara.role_rank(text)','clara.jwt_firm()',
      'clara._reserve_op(uuid,text,text,bytea)','clara._finish_op(uuid,text,text,jsonb)',
      'clara._hash(jsonb)','clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
      'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
      'clara._tf_no_truncate()']) x loop
    if to_regprocedure(r.x) is null then
      raise exception 'S0: required helper % does not resolve at its pinned signature', r.x using errcode = 'CLR10';
    end if;
  end loop;

  -- (f) THE PLATFORM STARTER IS PRESENT AND PUBLISHED, and the seed rows below reference rows
  --     that exist. Measured, never assumed -- the override FK would raise anyway, but a named
  --     prestate failure beats a bare 23503.
  select t.id into v_tmpl from clara.coa_templates t
   where t.scope = 'platform' and t.template_key = 'my_sme_starter' and t.version = 1;
  if v_tmpl is null then
    raise exception 'S0: the platform starter my_sme_starter v1 is missing -- 0150 has not landed on this database'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.coa_templates t
   where t.id = v_tmpl and t.state = 'published';
  if v_n <> 1 then
    raise exception 'S0: the platform starter is not published' using errcode = 'CLR10';
  end if;
  for r in select * from (values ('3900'), ('3040')) as t(code) loop
    if not exists (select 1 from clara.coa_template_accounts a
                    where a.template_id = v_tmpl and a.account_code = r.code) then
      raise exception 'S0: the platform starter carries no account %, so the entity override this file seeds would reference nothing', r.code
        using errcode = 'CLR10';
    end if;
  end loop;
  -- The relabel is only correct if 3900 is the marker account and 3040 is the society variant.
  if not exists (select 1 from clara.coa_template_accounts a
                  where a.template_id = v_tmpl and a.account_code = '3900'
                    and a.special_acc_type = 'retained_earnings' and a.family_key = 'equity_common') then
    raise exception 'S0: 3900 is not the retained_earnings marker in equity_common -- the society relabel this file seeds is aimed at the wrong row'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.coa_template_accounts a
                  join clara.coa_template_families f
                    on f.template_id = a.template_id and f.family_key = a.family_key
                  where a.template_id = v_tmpl and a.account_code = '3040'
                    and f.entity_types = array['society']::text[]) then
    raise exception 'S0: 3040 is not in a society-keyed family -- the suppression this file seeds is aimed at the wrong row'
      using errcode = 'CLR10';
  end if;

  -- (g) 'society' IS A LIVE entity_type. The override's entity_type is resolved against the same
  --     LIVE catalog 0150's family doors resolve against (its departures register (4)), never a
  --     DDL CHECK duplicating it.
  if not exists (select 1 from clara.client_fact_keys k
                  where k.fact_key = 'entity_type' and k.allowed_values @> to_jsonb('society'::text)) then
    raise exception 'S0: society is not a live entity_type in clara.client_fact_keys' using errcode = 'CLR10';
  end if;

  -- (h) THE EVENT-TYPE COUPLED PAIR. account.chart_applied must be free in BOTH catalogs, and the
  --     active taxonomy version must exist -- a registration into a version nothing points at is
  --     an uncovered event_type, which the coverage census fails on.
  if exists (select 1 from clara.event_types where name = 'account.chart_applied') then
    raise exception 'S0: event type account.chart_applied is already registered' using errcode = 'CLR10';
  end if;
  select version into v_n from clara.taxonomy_active;
  if v_n is null then
    raise exception 'S0: clara.taxonomy_active names no version' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.trigger_taxonomy where version = v_n and event_type = 'account.chart_applied') then
    raise exception 'S0: account.chart_applied is already routed at the active taxonomy version' using errcode = 'CLR10';
  end if;
  -- The routing decision below must be a value the live taxonomy already uses -- an unknown
  -- decision string would be a private vocabulary nothing downstream reads.
  if not exists (select 1 from clara.trigger_taxonomy where decision = 'notification') then
    raise exception 'S0: the live trigger_taxonomy carries no `notification` decision -- the routing this file registers is not in the estate vocabulary'
      using errcode = 'CLR10';
  end if;

  -- (i) The roles this file grants to.
  for r in select x from unnest(array['clara_fn_owner','clara_authenticated']) x loop
    if not exists (select 1 from pg_roles where rolname = r.x) then
      raise exception 'S0: role % is missing', r.x using errcode = 'CLR10';
    end if;
  end loop;

  select count(*) into v_n from _coa_prb_fn_snapshot;
  raise notice 'coa-template PR-b prestate: OK -- 1 relation name and 12 function names all clear; 0150''s four relations + the 9 helper signatures resolve; ALL FOUR upsert_account chain bodies pinned by prosrc sha256 at their exact signatures; the CLR37 fixed-asset enrolment rung READ POSITIVELY out of the live _upsert_account_core (Annex G PR-0 obligation 2 discharged); the platform starter my_sme_starter v1 is PUBLISHED and carries 3900 as the equity_common retained_earnings marker and 3040 inside a society-keyed family; society is a live entity_type in the client_fact_keys catalog; account.chart_applied is free in BOTH event_types and the active taxonomy version %, whose `notification` decision is an existing estate value; % clara function(s) snapshotted for the tail''s whole-catalog D1-EMPTY differential.', (select version from clara.taxonomy_active), v_n;
end $s0$;

-- =====================================================================================
-- S1 -- THE ENTITY-VARIANT OVERRIDE (departures register (7)). Migration-seeded, reviewed DATA
-- discharging the written obligation 0150's header hands forward. No door writes it.
-- =====================================================================================
set role clara_fn_owner;

create table clara.coa_template_entity_overrides (
  template_id   uuid not null,
  -- Resolved against clara.client_fact_keys.allowed_values by the seed block and by any future
  -- widening migration -- never a DDL CHECK duplicating a live catalog (0150 departures (4)).
  entity_type   text not null,
  account_code  text not null,
  -- Exactly one operation per row: RELABEL (override_name set) or SUPPRESS.
  override_name text,
  suppress      boolean not null default false,
  -- D-13 item 1 reaching an override: a row that cannot say where it came from has established
  -- nothing.
  basis         text not null,

  constraint coa_template_entity_overrides_pkey primary key (template_id, entity_type, account_code),
  -- The composite FK is the whole tenancy story: the row can only name an account of a template
  -- that exists, and the read policy derives scope+firm from that template (0150 departures (1)).
  constraint fk_coa_override_account foreign key (template_id, account_code)
    references clara.coa_template_accounts(template_id, account_code),
  constraint ck_coa_override_entity check (entity_type ~ '^[a-z][a-z0-9_]*$'),
  constraint ck_coa_override_name   check (override_name is null or btrim(override_name) <> ''),
  constraint ck_coa_override_basis  check (btrim(basis) <> ''),
  -- EXACTLY ONE operation. A row doing neither is a no-op nobody would notice; a row doing both
  -- is two answers to one question.
  constraint ck_coa_override_one_op check ((override_name is not null) <> suppress)
);

comment on table clara.coa_template_entity_overrides is
  'APPLY-TIME entity-type variants for a template account: relabel it, or do not plant it. Migration-seeded reviewed DATA only -- no door writes this table. Read by clara._coa_effective_account_name / clara.apply_coa_template / clara.coa_template_drift, all through ONE spelling, so an override can never make the drift read call its own applied chart `renamed`.';

alter table clara.coa_template_entity_overrides enable row level security;
alter table clara.coa_template_entity_overrides force  row level security;

create policy p_coa_template_entity_overrides_owner on clara.coa_template_entity_overrides
  for all to clara_fn_owner using (true) with check (true);
-- The parent-derived read, 0150's own shape for the two child tiers: platform rows are visible to
-- every authenticated firm member, a firm's own rows only to that firm.
create policy p_coa_template_entity_overrides_human on clara.coa_template_entity_overrides
  for select to clara_authenticated
  using (exists (select 1 from clara.coa_templates t
                  where t.id = coa_template_entity_overrides.template_id
                    and (t.scope = 'platform' or t.firm_id = clara.jwt_firm())));

create trigger t_coa_template_entity_overrides_no_truncate before truncate
  on clara.coa_template_entity_overrides
  for each statement execute function clara._tf_no_truncate();

grant select on clara.coa_template_entity_overrides to clara_authenticated;

reset role;

-- =====================================================================================
-- S2 -- THE SEED ROWS. The society label collision, discharged (departures register (7)).
-- =====================================================================================
do $seed$
declare v_tmpl uuid; v_n int;
begin
  select t.id into v_tmpl from clara.coa_templates t
   where t.scope = 'platform' and t.template_key = 'my_sme_starter' and t.version = 1;

  insert into clara.coa_template_entity_overrides(template_id, entity_type, account_code,
      override_name, suppress, basis)
  values
    -- A society has no shareholders and no distributable profit: its accumulated surplus is the
    -- Accumulated Fund. 3900 is the account the ESTATE requires to exist (it carries the
    -- retained_earnings marker every close and every report keys on), so the marker account is
    -- the one that takes the society's name.
    (v_tmpl, 'society', '3900', 'Accumulated Fund', false,
     'MPERS para 4.2(q) equity, read for a body with no share capital; 0150 header, the society label collision handed forward to PR-b'),
    -- ...and the society-keyed family's own 3040 is then NOT planted, because the concept it
    -- carries is now on 3900. Planting both is the defect 0150 recorded, and relabelling alone
    -- would make it worse -- two accounts, one name.
    (v_tmpl, 'society', '3040', null, true,
     'suppressed as the duplicate of the relabelled 3900: one concept, one account (0150 header, the society label collision)');

  select count(*) into v_n from clara.coa_template_entity_overrides;
  -- Every seeded entity_type is a LIVE vocabulary member -- the same resolution 0150's family
  -- doors perform, applied to reviewed data rather than to a caller's argument.
  if exists (select 1 from clara.coa_template_entity_overrides o
              where not exists (select 1 from clara.client_fact_keys k
                                 where k.fact_key = 'entity_type'
                                   and k.allowed_values @> to_jsonb(o.entity_type))) then
    raise exception 'S2: a seeded override names an entity_type outside the live client_fact_keys vocabulary'
      using errcode = 'CLR10';
  end if;
  raise notice 'coa-template PR-b seed: % entity override row(s) on the platform starter -- society/3900 RELABELLED to Accumulated Fund (the retained_earnings marker keeps its marker) and society/3040 SUPPRESSED, every row carrying its basis and a live entity_type.', v_n;
end $seed$;

-- =====================================================================================
-- S3 -- THE EVENT TYPE, registered as the COUPLED PAIR (departures register (9)).
-- =====================================================================================
insert into clara.event_types(name, client_scoped, description)
  values ('account.chart_applied', true,
          'A client''s chart of accounts was created from a firm or platform COA template');
insert into clara.trigger_taxonomy(version, event_type, decision, note)
  select ta.version, 'account.chart_applied', 'notification',
         '裁-21 PR-b: a whole chart arriving is a firm-visible act, not a context update -- it is the moment the client becomes postable'
    from clara.taxonomy_active ta;

-- =====================================================================================
-- S4 -- THE INTERNALS. The doors and the reads share ONE spelling of each rule so a wall and the
-- read that reports on it can never disagree.
--
-- FOUR OF THE FIVE ARE **SECURITY INVOKER**, AND THAT IS THE SECURITY DECISION IN THIS FILE.
-- MEASURED, not reasoned about: the first rig run of clara.coa_template_family_plan raised
-- `42501 permission denied for function _coa_family_plan` -- an INVOKER-rights read cannot reach
-- an ungranted DEFINER helper. The two ways out are not equal:
--   * GRANT the helpers while they stay DEFINER. REFUSED. A granted DEFINER
--     _coa_client_axis(p_client, ...) would answer for ANY client uuid a caller cared to type,
--     with the owner's RLS bypass behind it -- a cross-tenant read oracle reachable by every
--     authenticated user, minted to save a keyword. That is the security mechanism being
--     weakened for convenience, which the lane brief forbids in as many words.
--   * Make them INVOKER and grant them. TAKEN. As INVOKER they carry NO authority of their own:
--     every relation they touch (client_facts, onboarding_plans/_items, coa_template_families,
--     coa_template_entity_overrides) is RLS-filtered to the caller's firm, so a caller learns
--     exactly what a direct SELECT would already have told them and nothing more. Called from
--     inside the DEFINER doors, current_user is clara_fn_owner and the owner policy applies --
--     which is the behaviour the plant loop needs, and it is reached without any second body.
-- THEIR FRONTEND HOME IS THEIR CALLER'S (.claude/rules/db-migrations.md): they are helpers of
-- the five named reads, never surfaces a screen calls directly.
-- clara._coa_plant_family stays SECURITY DEFINER and reaches NOBODY -- it writes.
-- =====================================================================================
set role clara_fn_owner;

-- S4.1 -- ONE axis, read as coalesce(live fact, latest committed interview answer). Departures
-- register (5): the estate's own idiom, spliced into get_context_pack by 0055 S6 for exactly
-- entity_type and msic.
create function clara._coa_client_axis(p_client uuid, p_key text) returns text
  language sql stable security invoker set search_path = clara, pg_temp as $$
  select coalesce(
    (select cf.fact_value #>> '{}' from clara.client_facts cf
      where cf.client_id = p_client and cf.fact_key = p_key and cf.superseded_at is null
      order by cf.recorded_at desc limit 1),
    (select i.answer #>> '{}'
       from clara.onboarding_plans p2
       join clara.onboarding_plan_items i on i.plan_id = p2.id
      where p2.client_id = p_client and p2.scope_kind = 'client' and p2.state = 'committed'
        and i.item_key = p_key and i.state in ('answered','resolved')
      order by p2.committed_at desc, i.answered_at desc limit 1));
$$;
revoke all on function clara._coa_client_axis(uuid,text) from public;

create function clara._coa_client_axes(p_client uuid) returns jsonb
  language sql stable security invoker set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'entity_type',  clara._coa_client_axis(p_client, 'entity_type'),
    'trade_nature', clara._coa_client_axis(p_client, 'trade_nature'),
    'msic',         clara._coa_client_axis(p_client, 'msic'));
$$;
revoke all on function clara._coa_client_axes(uuid) from public;

-- S4.2 -- THE ONE SPELLING of "what is this template account called for THIS entity type".
-- The apply plants it and the drift read compares against it, so a relabelled society chart can
-- never report itself `renamed`. A null return means SUPPRESSED -- not planted, and not missing.
create function clara._coa_effective_account_name(p_template uuid, p_code text,
    p_template_name text, p_entity_type text) returns text
  language sql stable security invoker set search_path = clara, pg_temp as $$
  select case
           when o.template_id is null then p_template_name
           when o.suppress then null
           else o.override_name
         end
    from (select 1) _
    left join clara.coa_template_entity_overrides o
      on o.template_id = p_template and o.account_code = p_code
     and p_entity_type is not null and o.entity_type = p_entity_type;
$$;
revoke all on function clara._coa_effective_account_name(uuid,text,text,text) from public;

-- S4.3 -- THE DETERMINISTIC TRIM (裁-23 Q6/Q10; design D-8). It reads NOTHING a model wrote: only
-- the client's own recorded facts, the committed interview answers, and the template's authored
-- keys. Its output is a proposal a human edits, never an authority.
--
-- THE RULE, in three lines and no fourth (departures register (3) and (4)):
--   `core`                                   -> ALWAYS kept, never trimmable.
--   a family declaring >= 1 trim key         -> kept iff the client POSITIVELY matches EVERY axis
--                                               the family declares (AND, never OR).
--   a family declaring no key, not `core`    -> human opt-in only; no plan proposes it.
-- The AND is the fail-closed half: an absent axis cannot satisfy the family that declares it, so
-- a client with no facts at all is proposed exactly the core set and every declared axis is
-- reported ABSENT by name. Absence is not evidence (review law 2).
create function clara._coa_family_plan(p_client uuid, p_template uuid) returns jsonb
  language plpgsql stable security invoker set search_path = clara, pg_temp as $$
declare
  v_axes jsonb; v_entity text; v_nature text; v_msic text; v_div text;
  v_keep text[]; v_drop text[]; v_absent text[]; v_axis text;
begin
  v_axes   := clara._coa_client_axes(p_client);
  v_entity := v_axes->>'entity_type';
  v_nature := v_axes->>'trade_nature';
  v_msic   := v_axes->>'msic';
  -- The DIVISION is the operable key; the section needs a mapping table Annex E refuses to build.
  v_div := case when v_msic ~ '^[0-9]{2}' then left(v_msic, 2) else null end;

  select coalesce(array_agg(f.family_key order by f.sort_ordinal, f.family_key)
                    filter (where f.keep), '{}'::text[]),
         coalesce(array_agg(f.family_key order by f.sort_ordinal, f.family_key)
                    filter (where not f.keep), '{}'::text[])
    into v_keep, v_drop
    from (
      select ff.family_key, ff.sort_ordinal,
             (ff.inclusion = 'core'
              or (
                   (ff.entity_types <> '{}' or ff.trade_natures <> '{}'
                    or ff.msic_sections <> '{}' or ff.msic_divisions <> '{}')
                   and (ff.entity_types  = '{}' or (v_entity is not null and v_entity = any (ff.entity_types)))
                   and (ff.trade_natures = '{}' or (v_nature is not null and v_nature = any (ff.trade_natures)))
                   and (ff.msic_divisions = '{}' or (v_div is not null and v_div = any (ff.msic_divisions)))
                 )) as keep
        from clara.coa_template_families ff
       where ff.template_id = p_template
    ) f;

  -- Name every axis the template's own families ASK ABOUT and the client cannot answer. Q6: she
  -- names the absent axis rather than proposing on the strength of a guess.
  v_absent := '{}'::text[];
  foreach v_axis in array array['entity_type','trade_nature','msic'] loop
    if (case v_axis when 'entity_type' then v_entity
                    when 'trade_nature' then v_nature
                    else v_msic end) is null
       and exists (select 1 from clara.coa_template_families ff
                    where ff.template_id = p_template
                      and case v_axis
                            when 'entity_type'  then ff.entity_types  <> '{}'
                            when 'trade_nature' then ff.trade_natures <> '{}'
                            else ff.msic_divisions <> '{}' end) then
      v_absent := v_absent || v_axis;
    end if;
  end loop;

  return jsonb_build_object(
    'template_id', p_template,
    'client_id', p_client,
    'axes', v_axes,
    'msic_division', v_div,
    'absent_axes', to_jsonb(v_absent),
    -- 'core_only' is the honest label for a plan no axis contributed to: it is what Q6 rules the
    -- interim state is, and PR-c's receipt verdict reads it by name.
    'axis', case when v_absent = array['entity_type','trade_nature','msic']::text[] then 'core_only'
                 when cardinality(v_absent) > 0 then 'partial'
                 else 'full' end,
    'keep', to_jsonb(v_keep),
    'drop', to_jsonb(v_drop));
end $$;
revoke all on function clara._coa_family_plan(uuid,uuid) from public;

-- S4.4 -- THE PLANT LOOP, factored out so apply_coa_template and add_coa_template_family share
-- ONE spelling of "put this family's accounts on this client". Returns the codes planted.
--
-- THE OP-KEY MECHANIC (design D-3). The core _reserve_op()s on its OWN p_op_key under the verb
-- `upsert_account`, so the loop derives a deterministic CHILD key per account,
-- `<batch key>:<account_code>` -- the 0002_core_seed.sql:129 idiom, generalised. A replay of the
-- batch short-circuits at the caller's own rung 2 and never reaches here; a replay that DID reach
-- here would find every child key already reserved and take each stored result. The child keys
-- live under a different `fn` than the batch key, so the two namespaces cannot collide.
create function clara._coa_plant_family(p_ctx jsonb, p_client uuid, p_template uuid,
    p_family text, p_op_key text) returns text[]
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare r record; v_name text; v_entity text; v_planted text[] := '{}'::text[];
begin
  v_entity := clara._coa_client_axis(p_client, 'entity_type');
  for r in select a.account_code, a.name, a.account_type, a.account_class, a.special_acc_type
             from clara.coa_template_accounts a
            where a.template_id = p_template and a.family_key = p_family
            order by a.sort_ordinal, a.account_code loop
    v_name := clara._coa_effective_account_name(p_template, r.account_code, r.name, v_entity);
    -- NULL means SUPPRESSED for this entity type (departures register (7)) -- not planted, and
    -- deliberately not an error.
    continue when v_name is null;
    -- NAMED notation, not positional: the core's argument order is
    -- (p_ctx, p_client, p_code, p_name, p_type, p_special_acc_type, p_op_key, p_account_class)
    -- -- class AFTER op_key -- and a positional call here would silently pass the class as the
    -- op key. Never a hand-written coa_accounts row: invariant 10.
    perform clara._upsert_account_core(
      p_ctx              => p_ctx,
      p_client           => p_client,
      p_code             => r.account_code,
      p_name             => v_name,
      p_type             => r.account_type,
      p_special_acc_type => r.special_acc_type,
      p_op_key           => p_op_key || ':' || r.account_code,
      p_account_class    => r.account_class);
    v_planted := v_planted || r.account_code;
  end loop;
  return v_planted;
end $$;
revoke all on function clara._coa_plant_family(jsonb,uuid,uuid,text,text) from public;

-- =====================================================================================
-- S5 -- THE DOORS. BOOKKEEPER floor (裁-23 Q3). Guard-first order throughout: authz -> op_key ->
-- reserve/dedupe -> target-in-firm -> shape guards -> work + audit + event + finish.
-- =====================================================================================

-- S5.1 -- apply_coa_template. D-3's ladder, every rung a NAMED refusal, all evaluated, never a
-- silent no-op.
--   1 op_key non-empty                          CLR10 op_key_required
--   2 _reserve_op -- a replay returns the stored result                    (dedupe, not a refusal)
--   3 the client is in the caller's firm        CLR11 client_not_in_firm
--   4 the template is published and visible     CLR11 template_not_found / CLR10 template_not_published
--   5 THE CLIENT'S CHART IS EMPTY               CLR10 chart_not_empty          <- 裁-23 Q4's wall
--   6 no 'adopted' adoption row for the client  CLR10 already_adopted
--  6b the resolved family set is non-empty      CLR10 families_required
--   7 every named family exists on the template CLR10 unknown_family (names the offender)
--   8 every `core` family is present            CLR10 core_family_dropped (names it)
--   9 apply
--
-- RUNG 5 IS THE DESIGN'S SHARPEST CHOICE and it is Q4's ruling made mechanical: an additive apply
-- onto a chart already holding a predecessor's accounts sprinkles the firm's standard codes
-- alongside the client's real ones -- two accounts for one meaning, and an error nowhere. The
-- refusal forces a human to decide which chart the client is on. The escape hatch Q4 preserves is
-- not a weakening of this rung: it is answering "manual" at onboarding and never calling this
-- door, which coa_chart_state then reports as `off_standard`.
create function clara.apply_coa_template(p_client uuid, p_template uuid, p_families text[],
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; t clara.coa_templates; v_prop clara.coa_template_adoptions;
  v_plan jsonb; v_families text[]; v_source text; v_bad text;
  v_adoption uuid; v_planted text[] := '{}'::text[]; v_fam text; v_had_prop boolean := false;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  -- The request hash covers the SORTED family list, so the same set in a different order is the
  -- same request and a genuinely different set under a reused key raises rather than silently
  -- returning the first call's result (_reserve_op's own CLR10).
  v_dedupe := clara._reserve_op(c.firm, 'apply_coa_template', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 't', p_template,
      'f', case when p_families is null then null
                else (select jsonb_agg(x order by x) from unnest(p_families) x) end)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- Rung 3.
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"client_not_in_firm"}';
  end if;

  -- Rung 4. The visibility predicate is the READ POLICY's, not a NULL inference: a platform
  -- template, or one of the caller's own firm. An invisible template and an absent one look
  -- identical to the caller -- no cross-firm existence oracle.
  select * into t from clara.coa_templates
   where id = p_template and (scope = 'platform' or firm_id = c.firm);
  if not found then
    raise exception 'template not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"template_not_found"}';
  end if;
  if t.state <> 'published' then
    raise exception 'template % version % is %, not published', t.template_key, t.version, t.state
      using errcode = 'CLR10', detail = '{"reason":"template_not_published"}';
  end if;

  -- Rung 5 -- 裁-23 Q4.
  if exists (select 1 from clara.coa_accounts a where a.client_id = p_client) then
    raise exception 'this client already has accounts; the firm''s standard chart is applied to an empty chart only'
      using errcode = 'CLR10', detail = '{"reason":"chart_not_empty"}';
  end if;

  -- Rung 6 (departures register (2)): an 'adopted' row is the wall; a 'proposed' row is the thing
  -- being applied.
  if exists (select 1 from clara.coa_template_adoptions ad
              where ad.client_id = p_client and ad.state = 'adopted') then
    raise exception 'this client has already adopted a template' using errcode = 'CLR10',
      detail = '{"reason":"already_adopted"}';
  end if;
  select * into v_prop from clara.coa_template_adoptions
   where client_id = p_client and state = 'proposed';
  v_had_prop := found;

  -- THE FAMILY SET. A caller-supplied list is the ruled EDIT path (Q3); NULL asks the database
  -- for its own deterministic plan (departures register (1)).
  v_plan := clara._coa_family_plan(p_client, t.id);
  if p_families is null then
    v_source := 'plan';
    select coalesce(array_agg(x), '{}'::text[]) into v_families
      from jsonb_array_elements_text(v_plan->'keep') x;
  else
    v_source := 'caller';
    -- Duplicates in the caller's array are collapsed: the same family twice is one family, and
    -- the adoption row's families[] must not carry it twice.
    select coalesce(array_agg(distinct x), '{}'::text[]) into v_families from unnest(p_families) x;
  end if;

  -- Rung 6b -- THE RESOLVED SET IS NON-EMPTY. Rung 8 catches an empty list on any template that
  -- HAS core families, which the platform starter does; but a firm's own fork may lawfully carry
  -- none (remove_coa_template_family does not defend `core`), and then an empty apply would sail
  -- past rung 8, plant nothing, and die on ck_coa_adoption_families as a bare 23514 naming
  -- nothing. Every refusal in this door is a NAMED one.
  if v_families = '{}'::text[] then
    raise exception 'an apply must name at least one family' using errcode = 'CLR10',
      detail = '{"reason":"families_required"}';
  end if;

  -- Rung 7 -- names the offender.
  select string_agg(x, ', ' order by x) into v_bad from unnest(v_families) x
   where not exists (select 1 from clara.coa_template_families f
                      where f.template_id = t.id and f.family_key = x);
  if v_bad is not null then
    raise exception 'template % carries no family named %', t.template_key, v_bad
      using errcode = 'CLR10', detail = '{"reason":"unknown_family"}';
  end if;

  -- Rung 8 -- `core` is NEVER trimmable, and the refusal names what was dropped.
  select string_agg(f.family_key, ', ' order by f.family_key) into v_bad
    from clara.coa_template_families f
   where f.template_id = t.id and f.inclusion = 'core' and not (f.family_key = any (v_families));
  if v_bad is not null then
    raise exception 'these families apply to every client and cannot be dropped: %', v_bad
      using errcode = 'CLR10', detail = '{"reason":"core_family_dropped"}';
  end if;

  -- Rung 9 -- the apply. Family order is the template's own, so the planted chart reads in the
  -- authored sequence rather than in array order.
  for v_fam in select f.family_key from clara.coa_template_families f
                where f.template_id = t.id and f.family_key = any (v_families)
                order by f.sort_ordinal, f.family_key loop
    v_planted := v_planted || clara._coa_plant_family(
      jsonb_build_object('actor', c.actor, 'firm', c.firm), p_client, t.id, v_fam, p_op_key);
  end loop;

  if v_had_prop and v_prop.template_id = t.id and v_prop.template_version = t.version then
    -- Clara proposed this template version and the human applied it (possibly having edited the
    -- family list) -- ONE row, moved, so the proposal's receipt and basis stay attached to the
    -- adoption they became.
    update clara.coa_template_adoptions
       set state = 'adopted', adopted_by = c.actor, adopted_at = now(), families = v_families
     where id = v_prop.id
     returning id into v_adoption;
  else
    insert into clara.coa_template_adoptions(firm_id, client_id, template_id, template_version,
        state, families, adopted_by, adopted_at)
      values (c.firm, p_client, t.id, t.version, 'adopted', v_families, c.actor, now())
      returning id into v_adoption;
    if v_had_prop then
      -- The human applied a DIFFERENT template than Clara proposed. Law 6: a state, never a
      -- delete -- and uq_coa_adoption_open would refuse a second open proposal anyway.
      update clara.coa_template_adoptions
         set state = 'superseded', superseded_by = v_adoption
       where id = v_prop.id;
    end if;
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'apply_coa_template', null,
    jsonb_build_object('client', p_client, 'template_id', t.id, 'template_version', t.version,
      'families', to_jsonb(v_families), 'families_source', v_source,
      'accounts', cardinality(v_planted), 'adoption_id', v_adoption, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'account.chart_applied', p_client, c.actor, null, null,
    null, null, null,
    jsonb_build_object('template_id', t.id, 'template_key', t.template_key,
      'template_version', t.version, 'families', to_jsonb(v_families),
      'accounts', cardinality(v_planted), 'adoption_id', v_adoption));

  return clara._finish_op(c.firm, 'apply_coa_template', p_op_key,
    jsonb_build_object('client_id', p_client, 'template_id', t.id, 'template_version', t.version,
      'adoption_id', v_adoption, 'families', to_jsonb(v_families), 'families_source', v_source,
      'accounts', cardinality(v_planted), 'account_codes', to_jsonb(v_planted),
      'plan', v_plan));
end $$;

-- S5.2 -- add_coa_template_family (design D-4). "I trimmed too hard" is the most likely real-world
-- failure of the trim, and without a named verb the recovery path is "call upsert_account eleven
-- times by hand" -- which loses the family attribution and makes the drift read show a phantom
-- off-template block. The strict bulk door plus a narrow additive door beats one permissive door.
create function clara.add_coa_template_family(p_client uuid, p_template uuid, p_family text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; t clara.coa_templates; ad clara.coa_template_adoptions;
  v_bad text; v_planted text[];
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'add_coa_template_family', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 't', p_template, 'f', p_family)));
  if v_dedupe is not null then return v_dedupe; end if;

  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"client_not_in_firm"}';
  end if;
  select * into t from clara.coa_templates
   where id = p_template and (scope = 'platform' or firm_id = c.firm);
  if not found then
    raise exception 'template not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"template_not_found"}';
  end if;

  -- THE ADDITIVE DOOR IS ANCHORED ON THE ADOPTION, not on the chart: it appends to a chart this
  -- client is already ON, at the SAME template version. Without the version equality a v2 family
  -- could be appended to a v1 chart and the adoption row would then name a family set the version
  -- it records does not carry.
  select * into ad from clara.coa_template_adoptions
   where client_id = p_client and state = 'adopted';
  if not found then
    raise exception 'this client has not adopted a template; apply one first' using errcode = 'CLR10',
      detail = '{"reason":"not_adopted"}';
  end if;
  if ad.template_id <> t.id or ad.template_version <> t.version then
    raise exception 'this client is on a different template version' using errcode = 'CLR10',
      detail = '{"reason":"adoption_template_mismatch"}';
  end if;
  if not exists (select 1 from clara.coa_template_families f
                  where f.template_id = t.id and f.family_key = p_family) then
    raise exception 'template % carries no family named %', t.template_key, p_family
      using errcode = 'CLR10', detail = '{"reason":"unknown_family"}';
  end if;
  if p_family = any (ad.families) then
    raise exception 'family % is already applied to this client', p_family using errcode = 'CLR10',
      detail = '{"reason":"family_already_applied"}';
  end if;

  -- D-4's code_conflict, named and raised BEFORE the loop starts rather than letting the core's
  -- has-lines guard surface as a confusing mid-loop failure. Both directions are refusals:
  --   a code the client holds at a DIFFERENT type/class  -> code_conflict
  --   a code the client already holds at the SAME shape  -> code_already_present
  -- The second is not pedantry: this door's promise is ADDITIVE, and an upsert that renames a
  -- live account under the human's feet is not what "add a family" means. `upsert_account` is
  -- still there for a deliberate rename.
  select string_agg(x.account_code, ', ' order by x.account_code) into v_bad
    from clara.coa_template_accounts x
    join clara.coa_accounts ca on ca.client_id = p_client and ca.account_code = x.account_code
   where x.template_id = t.id and x.family_key = p_family
     and (ca.account_type <> x.account_type or ca.account_class is distinct from x.account_class);
  if v_bad is not null then
    raise exception 'this client already carries % with a different type or class', v_bad
      using errcode = 'CLR10', detail = '{"reason":"code_conflict"}';
  end if;
  select string_agg(x.account_code, ', ' order by x.account_code) into v_bad
    from clara.coa_template_accounts x
    join clara.coa_accounts ca on ca.client_id = p_client and ca.account_code = x.account_code
   where x.template_id = t.id and x.family_key = p_family;
  if v_bad is not null then
    raise exception 'this client already carries %', v_bad using errcode = 'CLR10',
      detail = '{"reason":"code_already_present"}';
  end if;

  v_planted := clara._coa_plant_family(
    jsonb_build_object('actor', c.actor, 'firm', c.firm), p_client, t.id, p_family, p_op_key);

  update clara.coa_template_adoptions
     set families = (select array_agg(distinct x order by x)
                       from unnest(ad.families || p_family) x)
   where id = ad.id;

  perform clara._audit(c.firm, c.actor, null, null, 'add_coa_template_family', null,
    jsonb_build_object('client', p_client, 'template_id', t.id, 'family_key', p_family,
      'accounts', cardinality(v_planted), 'adoption_id', ad.id, 'op_key', p_op_key));
  perform clara._append_event(c.firm, 'account.chart_applied', p_client, c.actor, null, null,
    null, null, null,
    jsonb_build_object('template_id', t.id, 'template_key', t.template_key,
      'template_version', t.version, 'families', to_jsonb(array[p_family]),
      'accounts', cardinality(v_planted), 'adoption_id', ad.id, 'additive', true));

  return clara._finish_op(c.firm, 'add_coa_template_family', p_op_key,
    jsonb_build_object('client_id', p_client, 'template_id', t.id, 'family_key', p_family,
      'adoption_id', ad.id, 'accounts', cardinality(v_planted),
      'account_codes', to_jsonb(v_planted)));
end $$;

reset role;

-- =====================================================================================
-- S6 -- THE READS. INVOKER-rights and STABLE, no definer wrapper -- the estate's own
-- trial_balance idiom (0004:730-739) that 0150's two reads already follow, so RLS decides who
-- sees what and no new read surface is invented. search_path IS pinned for the reason 0150 gives:
-- invoker rights decide WHOSE rows are visible, the pin decides WHICH relation the body means.
-- Departures register (6) states the floor honestly.
-- =====================================================================================
set role clara_fn_owner;

-- S6.1 -- the deterministic plan, as a read. The checklist card's default checkbox state.
-- INVOKER-rights, so a caller who cannot see the client or the template gets nothing -- but the
-- internals it calls are DEFINER, which is deliberate and narrow: the axes are a projection of
-- the client's own facts and the caller has already been RLS-filtered on the template.
create function clara.coa_template_family_plan(p_client uuid, p_template uuid) returns jsonb
  language sql stable set search_path = clara, pg_temp as $$
  select clara._coa_family_plan(p_client, t.id)
    from clara.coa_templates t
    join clara.clients cl on cl.id = p_client
   where t.id = p_template;
$$;

-- S6.2 -- the adoption record (Annex D). One row per client, or NULL.
create function clara.get_coa_template_adoption(p_client uuid) returns jsonb
  language sql stable set search_path = clara, pg_temp as $$
  select jsonb_build_object(
    'adoption_id', ad.id, 'client_id', ad.client_id, 'template_id', ad.template_id,
    'template_version', ad.template_version, 'template_key', t.template_key,
    'template_title', t.title, 'state', ad.state, 'families', to_jsonb(ad.families),
    'family_rationales', ad.family_rationales, 'basis', ad.basis,
    'proposed_by', ad.proposed_by, 'proposed_at', ad.proposed_at, 'receipt_id', ad.receipt_id,
    'adopted_by', ad.adopted_by, 'adopted_at', ad.adopted_at, 'created_at', ad.created_at)
    from clara.coa_template_adoptions ad
    left join clara.coa_templates t on t.id = ad.template_id
   where ad.client_id = p_client and ad.state in ('adopted','proposed')
   order by case ad.state when 'adopted' then 0 else 1 end
   limit 1;
$$;

-- S6.3 -- THE CHART STATE, and the reason this function exists: `coa_seed_decision` has been
-- asked with required_for_commit since the v2 interview shipped and CONSUMED BY NOTHING -- zero
-- hits across every migration. This read is its first consumer. It reads the item BY NAME out of
-- the client's latest COMMITTED plan, which is the same DB contract commit_client_onboarding
-- reads (interview.v2.questions.ts:59-60: "these item_keys are read BY NAME inside
-- commit_client_onboarding, so they are a DB contract").
--
-- The answer vocabulary it accepts, and why all three:
--   'firm_template'         -- design D-13's new value (裁-23 Q9's re-worded question)
--   'lhdn_mpers_standard'   -- the LEGACY value the shipped v2/v3 interview writes today, kept as
--                              an accepted value ON READ exactly as D-13 item 4 says. Dropping it
--                              would make every client onboarded before PR-c read `undecided`.
--   'manual'                -- Q4's escape hatch, and the deferred-activation half PR-c records.
--
-- The six states, and none of them is derived from an absence alone:
--   adopted      an 'adopted' adoption row exists                        (positive)
--   pending      the decision says the firm template AND the chart is still empty AND no adoption
--   declined     the decision says `manual` AND no adoption row          (Q4's escape hatch)
--   off_standard no adoption row AND the chart is NOT empty              (the honest "off-standard"
--                                                                        listing Q4 promises)
--   undecided    no committed decision, no adoption, empty chart
--   no_client    the caller cannot see this client at all                (RLS, not a state claim)
create function clara.coa_chart_state(p_client uuid) returns jsonb
  language sql stable set search_path = clara, pg_temp as $$
  with cl as (select c.id, c.name from clara.clients c where c.id = p_client),
  dec as (
    select i.answer->>'seed' as seed, p2.committed_at
      from clara.onboarding_plans p2
      join clara.onboarding_plan_items i on i.plan_id = p2.id
     where p2.client_id = p_client and p2.scope_kind = 'client' and p2.state = 'committed'
       and i.item_key = 'coa_seed_decision' and i.state in ('answered','resolved')
     order by p2.committed_at desc, i.answered_at desc
     limit 1),
  ad as (
    select a.id, a.state, a.template_id, a.template_version, a.families, a.adopted_at
      from clara.coa_template_adoptions a
     where a.client_id = p_client and a.state in ('adopted','proposed')
     order by case a.state when 'adopted' then 0 else 1 end
     limit 1),
  ch as (select count(*)::int as accounts from clara.coa_accounts a where a.client_id = p_client)
  select jsonb_build_object(
    'client_id', cl.id,
    'seed_decision', dec.seed,
    'seed_decision_at', dec.committed_at,
    'seed_wants_template', dec.seed in ('firm_template','lhdn_mpers_standard'),
    'accounts', ch.accounts,
    'adoption_id', ad.id, 'adoption_state', ad.state,
    'template_id', ad.template_id, 'template_version', ad.template_version,
    'families', to_jsonb(ad.families), 'adopted_at', ad.adopted_at,
    'state', case
      when ad.state = 'adopted' then 'adopted'
      when dec.seed = 'manual' then 'declined'
      when ch.accounts > 0 then 'off_standard'
      when dec.seed in ('firm_template','lhdn_mpers_standard') then 'pending'
      else 'undecided' end)
    from cl cross join ch left join dec on true left join ad on true;
$$;

-- S6.4 -- THE DRIFT READ (design D-11). A READ, never a wall: a client genuinely needs accounts
-- the standard lacks, and a worked-around control is worse than a visible report. The dangerous
-- direction is a MISSING account, and invariant 10 already refuses that posting.
--
-- FIVE CLASSES:
--   never_adopted  no 'adopted' row -- the client is off-standard entirely (one row, no code)
--   off_template   a code in coa_accounts the adopted template VERSION does not carry AT ALL
--                  (not "not in an adopted family" -- the design's words, and the wider reading
--                  would flag every deliberately-dropped family as drift)
--   missing        a template code in an ADOPTED family, absent from the client
--   renamed        same code, different name
--   retyped        same code, different account_type or account_class -- THE SERIOUS ONE: one
--                  code meaning two different things in two clients' books
-- renamed and retyped are INDEPENDENT rows, so an account that is both says both.
--
-- THE NAME IT COMPARES AGAINST IS THE EFFECTIVE ONE (S4.2), not the template's raw name -- a
-- relabelled society chart would otherwise report every relabelled account `renamed` on the day
-- it was applied, which is the classic instrument-disagrees-with-the-writer defect.
create function clara.coa_template_drift(p_client uuid)
  returns table (client_id uuid, drift_class text, account_code text, family_key text,
                 template_name text, client_name text,
                 template_account_type text, client_account_type text,
                 template_account_class text, client_account_class text)
  language sql stable set search_path = clara, pg_temp as $$
  with cl as (select c.id from clara.clients c where c.id = p_client),
  ad as (
    select a.template_id, a.template_version, a.families
      from clara.coa_template_adoptions a
     where a.client_id = p_client and a.state = 'adopted'),
  ent as (select clara._coa_client_axis(p_client, 'entity_type') as entity_type),
  tmpl as (
    select x.account_code, x.family_key, x.account_type, x.account_class,
           clara._coa_effective_account_name(x.template_id, x.account_code, x.name, ent.entity_type) as eff_name,
           (x.family_key = any (ad.families)) as in_adopted_family
      from clara.coa_template_accounts x
      join ad on ad.template_id = x.template_id
      cross join ent),
  acct as (select a.account_code, a.name, a.account_type, a.account_class
             from clara.coa_accounts a where a.client_id = p_client)
  -- never_adopted: ONE row, and only when the client is visible at all. `cl` is what makes this a
  -- statement about a client the caller can see rather than about a uuid.
  select cl.id, 'never_adopted'::text, null::text, null::text, null::text, null::text,
         null::text, null::text, null::text, null::text
    from cl where not exists (select 1 from ad)
  union all
  select p_client, 'off_template', a.account_code, null, null, a.name,
         null, a.account_type, null, a.account_class
    from acct a where exists (select 1 from ad)
     and not exists (select 1 from tmpl x where x.account_code = a.account_code)
  union all
  select p_client, 'missing', x.account_code, x.family_key, x.eff_name, null,
         x.account_type, null, x.account_class, null
    from tmpl x where x.in_adopted_family
     -- an account SUPPRESSED for this entity type was never meant to be planted, so its absence
     -- is the design working, not drift
     and x.eff_name is not null
     and not exists (select 1 from acct a where a.account_code = x.account_code)
  union all
  select p_client, 'renamed', x.account_code, x.family_key, x.eff_name, a.name,
         x.account_type, a.account_type, x.account_class, a.account_class
    from tmpl x join acct a on a.account_code = x.account_code
   where x.eff_name is not null and a.name is distinct from x.eff_name
  union all
  select p_client, 'retyped', x.account_code, x.family_key, x.eff_name, a.name,
         x.account_type, a.account_type, x.account_class, a.account_class
    from tmpl x join acct a on a.account_code = x.account_code
   where x.eff_name is not null
     and (a.account_type is distinct from x.account_type
          or a.account_class is distinct from x.account_class)
  order by 3 nulls first, 2;
$$;

-- S6.5 -- the firm roll-up. One row per client the caller can see, with the per-class counts the
-- /admin drift list renders. It calls coa_template_drift per client rather than re-spelling the
-- classification -- one spelling, so the panel and the banner can never disagree.
create function clara.firm_coa_drift()
  returns table (client_id uuid, client_name text, adoption_state text,
                 template_key text, template_version int,
                 never_adopted int, off_template int, missing int, renamed int, retyped int)
  language sql stable set search_path = clara, pg_temp as $$
  select c.id, c.name,
         ad.state, t.template_key, t.template_version,
         count(*) filter (where d.drift_class = 'never_adopted')::int,
         count(*) filter (where d.drift_class = 'off_template')::int,
         count(*) filter (where d.drift_class = 'missing')::int,
         count(*) filter (where d.drift_class = 'renamed')::int,
         count(*) filter (where d.drift_class = 'retyped')::int
    from clara.clients c
    left join lateral (select a.state, a.template_id, a.template_version
                         from clara.coa_template_adoptions a
                        where a.client_id = c.id and a.state = 'adopted') ad on true
    left join lateral (select tt.template_key, ad.template_version
                         from clara.coa_templates tt where tt.id = ad.template_id) t on true
    left join lateral clara.coa_template_drift(c.id) d on true
   group by c.id, c.name, ad.state, t.template_key, t.template_version
   order by c.name;
$$;

reset role;

-- =====================================================================================
-- S7 -- THE EXECUTE MATRIX. The two writers, the five reads and the four INVOKER helpers reach
-- clara_authenticated ONLY; the one WRITING internal (_coa_plant_family) reaches NOBODY but its
-- owner. NO WAKE GRANT, ON PURPOSE: Annex E's first
-- non-goal is "any agent path to the BULK apply" -- one rationale covering forty accounts is not
-- forty rationales -- so no wake role, no allowlist row, and the battery proves the raise rather
-- than the absence of a grant.
-- =====================================================================================
revoke all on function clara.apply_coa_template(uuid,uuid,text[],text) from public;
revoke all on function clara.add_coa_template_family(uuid,uuid,text,text) from public;
revoke all on function clara.coa_template_family_plan(uuid,uuid) from public;
revoke all on function clara.get_coa_template_adoption(uuid) from public;
revoke all on function clara.coa_chart_state(uuid) from public;
revoke all on function clara.coa_template_drift(uuid) from public;
revoke all on function clara.firm_coa_drift() from public;

grant execute on function clara.apply_coa_template(uuid,uuid,text[],text) to clara_authenticated;
grant execute on function clara.add_coa_template_family(uuid,uuid,text,text) to clara_authenticated;
grant execute on function clara.coa_template_family_plan(uuid,uuid) to clara_authenticated;
grant execute on function clara.get_coa_template_adoption(uuid) to clara_authenticated;
grant execute on function clara.coa_chart_state(uuid) to clara_authenticated;
grant execute on function clara.coa_template_drift(uuid) to clara_authenticated;
grant execute on function clara.firm_coa_drift() to clara_authenticated;

-- The four INVOKER helpers the five reads call (S4's header states the security decision and why
-- the DEFINER alternative was refused). They carry no authority: RLS filters every relation they
-- touch to the caller's own firm, so each answers exactly what a direct SELECT already would.
revoke all on function clara._coa_client_axis(uuid,text) from public;
revoke all on function clara._coa_client_axes(uuid) from public;
revoke all on function clara._coa_effective_account_name(uuid,text,text,text) from public;
revoke all on function clara._coa_family_plan(uuid,uuid) from public;
grant execute on function clara._coa_client_axis(uuid,text) to clara_authenticated;
grant execute on function clara._coa_client_axes(uuid) to clara_authenticated;
grant execute on function clara._coa_effective_account_name(uuid,text,text,text) to clara_authenticated;
grant execute on function clara._coa_family_plan(uuid,uuid) to clara_authenticated;

-- =====================================================================================
-- S8 -- TAIL CENSUS. What a reviewer reads. Everything below is measured out of the live catalog
-- in this transaction; nothing is restated from the header.
-- =====================================================================================
do $tail$
declare
  r record; v_n int; v_m int; v_txt text; v_b boolean; v_added text[]; v_want text[];
begin
  -- (1) D1 EMPTY, PROVEN BY WHOLE-CATALOG DIFFERENTIAL. Every pre-existing clara function is
  --     byte-identical on prosrc, ACL and owner; none was dropped; the added set is exactly this
  --     file's own names, pinned as a MAP of signatures rather than a count.
  select count(*) into v_n
    from _coa_prb_fn_snapshot s
    join pg_proc p on p.oid = s.oid
   where encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') <> s.prosrc_sha256
      or coalesce(array_to_string(p.proacl::text[], '|'), '<null>') <> s.acl
      or pg_get_userbyid(p.proowner) <> s.owner;
  if v_n <> 0 then
    raise exception 'S8: % pre-existing clara function(s) changed on prosrc/ACL/owner -- D1 is NOT empty', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from _coa_prb_fn_snapshot s
   where not exists (select 1 from pg_proc p where p.oid = s.oid);
  if v_n <> 0 then
    raise exception 'S8: % pre-existing clara function(s) were DROPPED', v_n using errcode = 'CLR10';
  end if;
  select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}'::text[])
    into v_added
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and not exists (select 1 from _coa_prb_fn_snapshot s where s.oid = p.oid);
  v_want := array[
    'clara._coa_client_axes(uuid)',
    'clara._coa_client_axis(uuid,text)',
    'clara._coa_effective_account_name(uuid,text,text,text)',
    'clara._coa_family_plan(uuid,uuid)',
    'clara._coa_plant_family(jsonb,uuid,uuid,text,text)',
    'clara.add_coa_template_family(uuid,uuid,text,text)',
    'clara.apply_coa_template(uuid,uuid,text[],text)',
    'clara.coa_chart_state(uuid)',
    'clara.coa_template_drift(uuid)',
    'clara.coa_template_family_plan(uuid,uuid)',
    'clara.firm_coa_drift()',
    'clara.get_coa_template_adoption(uuid)']::text[];
  -- Sorted through the SAME collation the census query used. A hand-written literal order is an
  -- instrument that measures the author's guess about collation, not the catalog.
  v_want := array(select x from unnest(v_want) x order by x);
  if v_added is distinct from v_want then
    raise exception 'S8: the ADDED function set is % -- expected exactly %', v_added, v_want
      using errcode = 'CLR10';
  end if;

  -- (2) THE FOUR CHAIN BODIES, RE-PINNED AFTER the work. S0 proved them before; a differential
  --     that only measures the start proves nothing about the end.
  for r in select * from (values
      ('clara._upsert_account_core(jsonb,uuid,text,text,text,text,text,text)',
       '5e0819f3b1e726b2cd5a6e05c3189992e9ac699910254324b6ba87022f1514e0'),
      ('clara.upsert_account(uuid,text,text,text,text,text,text)',
       '45dc1f860cd404acfe8e90cc2a45ee3b8dec083a09230f6cc70d64d4e3e191db'),
      ('clara._agent_upsert_account_core(uuid,text,text,text,text,text,text,jsonb,text,text)',
       '10a7e6ed63d5137514f608fe6716e50f65468ec92186f85b3b902b45ce4ea798'),
      ('clara.wake_upsert_account(uuid,text,text,text,text,text,text,jsonb,text,text)',
       '6a2809f94e6351221595b0f5df1b645611a9772e2efadc0b24a5a03cfa59ae85')
    ) as t(sig, sha) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_txt
      from pg_proc p where p.oid = r.sig::regprocedure;
    if v_txt is distinct from r.sha then
      raise exception 'S8: % moved to % during this migration', r.sig, v_txt using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) THE NEW RELATION'S POSTURE, by property.
  select c.relrowsecurity, c.relforcerowsecurity into v_b, v_b
    from pg_class c where c.oid = 'clara.coa_template_entity_overrides'::regclass;
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           where c.oid = 'clara.coa_template_entity_overrides'::regclass) then
    raise exception 'S8: coa_template_entity_overrides does not carry ENABLE + FORCE row level security'
      using errcode = 'CLR10';
  end if;
  if (select pg_get_userbyid(c.relowner) from pg_class c
       where c.oid = 'clara.coa_template_entity_overrides'::regclass) <> 'clara_fn_owner' then
    raise exception 'S8: coa_template_entity_overrides is not owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_policies
   where schemaname = 'clara' and tablename = 'coa_template_entity_overrides';
  if v_n <> 2 then
    raise exception 'S8: coa_template_entity_overrides carries % policies, expected exactly 2 (owner ALL + the parent-derived human SELECT)', v_n
      using errcode = 'CLR10';
  end if;
  -- NO WRITE REACH for any application role. A migration-only table that any door could write is
  -- not migration-only.
  for r in select rolname from pg_roles where rolname like 'clara\_%' and rolname <> 'clara_fn_owner' loop
    for v_txt in select x from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) x loop
      if has_table_privilege(r.rolname, 'clara.coa_template_entity_overrides', v_txt) then
        raise exception 'S8: role % can % clara.coa_template_entity_overrides -- it is migration-seeded DATA', r.rolname, v_txt
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  select count(*) into v_n from clara.coa_template_entity_overrides;
  select count(*) into v_m from clara.coa_template_entity_overrides where suppress;
  if v_n <> 2 or v_m <> 1 then
    raise exception 'S8: expected 2 override rows, exactly 1 of them a suppression; found % / %', v_n, v_m
      using errcode = 'CLR10';
  end if;

  -- (4) THE EVENT-TYPE COUPLED PAIR, both halves, and the coverage law still WHOLE. Registering
  --     one half is the half-registration the estate's census refuses; proving only the two rows
  --     exist would not prove coverage survived.
  if not exists (select 1 from clara.event_types where name = 'account.chart_applied' and client_scoped) then
    raise exception 'S8: account.chart_applied is not registered client-scoped in clara.event_types'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.trigger_taxonomy tt
                  where tt.version = (select version from clara.taxonomy_active)
                    and tt.event_type = 'account.chart_applied' and tt.decision = 'notification') then
    raise exception 'S8: account.chart_applied is not routed at the active taxonomy version'
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.event_types et
   where et.name not like 'rig.%'
     and not exists (select 1 from clara.trigger_taxonomy tt
                      where tt.version = (select version from clara.taxonomy_active)
                        and tt.event_type = et.name);
  if v_n <> 0 then
    raise exception 'S8: % event_type(s) are UNCOVERED by the active taxonomy version', v_n
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.taxonomy_versions;
  raise notice 'coa-template PR-b: taxonomy versions unmoved at % (additive registration, never a flip)', v_n;

  -- (5) THE ACL MATRIX, by property. Seven doors AND the four INVOKER helpers reach
  --     clara_authenticated and clara_fn_owner ONLY; the one WRITING internal reaches NOBODY but
  --     the owner; PUBLIC reaches none of the twelve. The helpers are in the same loop as the
  --     doors on purpose: they carry the same reach, so they take the same census.
  for r in select x from unnest(array[
      'clara.apply_coa_template(uuid,uuid,text[],text)',
      'clara.add_coa_template_family(uuid,uuid,text,text)',
      'clara.coa_template_family_plan(uuid,uuid)',
      'clara.get_coa_template_adoption(uuid)',
      'clara.coa_chart_state(uuid)',
      'clara.coa_template_drift(uuid)',
      'clara.firm_coa_drift()',
      'clara._coa_client_axis(uuid,text)',
      'clara._coa_client_axes(uuid)',
      'clara._coa_effective_account_name(uuid,text,text,text)',
      'clara._coa_family_plan(uuid,uuid)']) x loop
    if not has_function_privilege('clara_authenticated', r.x::regprocedure, 'EXECUTE') then
      raise exception 'S8: clara_authenticated cannot EXECUTE %', r.x using errcode = 'CLR10';
    end if;
    for v_txt in select rolname from pg_roles
                  where rolname like 'clara\_%' and rolname not in ('clara_fn_owner','clara_authenticated') loop
      if has_function_privilege(v_txt, r.x::regprocedure, 'EXECUTE') then
        raise exception 'S8: role % can EXECUTE % -- the human doors are clara_authenticated only', v_txt, r.x
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;
  -- The one WRITING internal is owner-only. It is the whole reason the DEFINER/INVOKER split
  -- exists: a granted writer would be a door with no ladder.
  for v_txt in select rolname from pg_roles where rolname like 'clara\_%' and rolname <> 'clara_fn_owner' loop
    if has_function_privilege(v_txt, 'clara._coa_plant_family(jsonb,uuid,uuid,text,text)'::regprocedure, 'EXECUTE') then
      raise exception 'S8: role % can EXECUTE clara._coa_plant_family -- the writing internal is owner-only', v_txt
        using errcode = 'CLR10';
    end if;
  end loop;
  for r in select x from unnest(array[
      'clara.apply_coa_template(uuid,uuid,text[],text)',
      'clara.add_coa_template_family(uuid,uuid,text,text)',
      'clara.coa_template_family_plan(uuid,uuid)',
      'clara.get_coa_template_adoption(uuid)',
      'clara.coa_chart_state(uuid)',
      'clara.coa_template_drift(uuid)',
      'clara.firm_coa_drift()',
      'clara._coa_client_axis(uuid,text)',
      'clara._coa_client_axes(uuid)',
      'clara._coa_effective_account_name(uuid,text,text,text)',
      'clara._coa_family_plan(uuid,uuid)',
      'clara._coa_plant_family(jsonb,uuid,uuid,text,text)']) x loop
    if has_function_privilege('public', r.x::regprocedure, 'EXECUTE') then
      raise exception 'S8: PUBLIC can EXECUTE % -- the revoke did not take', r.x using errcode = 'CLR10';
    end if;
  end loop;

  -- (6) THE SECURITY POSTURE, by property rather than by reading the file back. THE THREE
  --     WRITERS are DEFINER with a pinned search_path (they reach the ungranted account core);
  --     the five READS **and the four granted helpers** are INVOKER so RLS decides. A DEFINER
  --     helper reachable by clara_authenticated would be a cross-tenant read oracle, which is
  --     the defect S4's header records this file measured and refused -- so this census is the
  --     drift guard on that decision, and it fails if a later hand flips one back.
  for r in select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'clara'
              and p.oid::regprocedure::text = any (array[
                'clara.apply_coa_template(uuid,uuid,text[],text)',
                'clara.add_coa_template_family(uuid,uuid,text,text)',
                'clara._coa_plant_family(jsonb,uuid,uuid,text,text)']) loop
    if not r.prosecdef then
      raise exception 'S8: % is not SECURITY DEFINER', r.sig using errcode = 'CLR10';
    end if;
    if r.proconfig is null or not (r.proconfig @> array['search_path=clara, pg_temp']) then
      raise exception 'S8: % does not pin search_path to clara, pg_temp (found %)', r.sig, r.proconfig
        using errcode = 'CLR10';
    end if;
  end loop;
  for r in select p.oid::regprocedure::text as sig, p.prosecdef, p.proconfig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'clara'
              and p.oid::regprocedure::text = any (array[
                'clara.coa_template_family_plan(uuid,uuid)',
                'clara.get_coa_template_adoption(uuid)',
                'clara.coa_chart_state(uuid)',
                'clara.coa_template_drift(uuid)',
                'clara.firm_coa_drift()',
                'clara._coa_client_axis(uuid,text)',
                'clara._coa_client_axes(uuid)',
                'clara._coa_effective_account_name(uuid,text,text,text)',
                'clara._coa_family_plan(uuid,uuid)']) loop
    if r.prosecdef then
      raise exception 'S8: the read % is SECURITY DEFINER -- every clara_authenticated-reachable read in this file is INVOKER so RLS decides', r.sig
        using errcode = 'CLR10';
    end if;
    if r.proconfig is null or not (r.proconfig @> array['search_path=clara, pg_temp']) then
      raise exception 'S8: the read % does not pin search_path (found %)', r.sig, r.proconfig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (7) THE APPLY WRITES NO coa_accounts ROW DIRECTLY. A prosrc read of the two writers and the
  --     plant loop: no INSERT/UPDATE/DELETE against coa_accounts appears in any of the three, so
  --     every planted row went through the audited core (invariant 10). Text, and named as text:
  --     it is a mistake-net over this file's own bodies, not a closed-world proof -- the ACL is
  --     what binds a stranger, and coa_accounts carries no INSERT grant for clara_authenticated
  --     that would let one try.
  for r in select p.oid::regprocedure::text as sig, p.prosrc
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'clara'
              and p.oid::regprocedure::text = any (array[
                'clara.apply_coa_template(uuid,uuid,text[],text)',
                'clara.add_coa_template_family(uuid,uuid,text,text)',
                'clara._coa_plant_family(jsonb,uuid,uuid,text,text)']) loop
    if r.prosrc ~* '(insert\s+into|update|delete\s+from)\s+clara\.coa_accounts' then
      raise exception 'S8: % writes clara.coa_accounts directly -- every account must go through the audited core', r.sig
        using errcode = 'CLR10';
    end if;
  end loop;
  if (select p.prosrc from pg_proc p
       where p.oid = 'clara._coa_plant_family(jsonb,uuid,uuid,text,text)'::regprocedure)
      !~ '_upsert_account_core' then
    raise exception 'S8: the plant loop does not call _upsert_account_core' using errcode = 'CLR10';
  end if;

  -- (8) CONSTRAINT 15: the frozen schemas are unmoved and hold none of this file's names.
  for r in select f.nspname, f.relations,
                  (select count(*)::int from pg_class c2 join pg_namespace n2 on n2.oid = c2.relnamespace
                    where n2.nspname = f.nspname) as now
             from _coa_prb_frozen_snapshot f loop
    if r.relations <> r.now then
      raise exception 'S8: schema % moved from % to % relations', r.nspname, r.relations, r.now
        using errcode = 'CLR10';
    end if;
  end loop;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname in ('workflow','graphile_worker','spike')
                and c.relname like 'coa\_%') then
    raise exception 'S8: a coa_ relation appeared inside a frozen schema' using errcode = 'CLR10';
  end if;

  select count(*) into v_n from clara.coa_template_adoptions;
  raise notice 'coa-template PR-b tail: OK -- D1 INVENTORY EMPTY, PROVEN BY WHOLE-CATALOG DIFFERENTIAL: every pre-existing clara function byte-identical on prosrc + ACL + owner, none dropped, and the ADDED set an exact signature MAP of this file''s twelve (7 doors + 5 internals); the FOUR upsert_account chain bodies re-pinned by prosrc sha256 AFTER the work as well as before. ONE new relation, clara.coa_template_entity_overrides: clara_fn_owner-owned, ENABLE+FORCE RLS, EXACTLY 2 policies (owner ALL + the parent-derived human SELECT), ZERO INSERT/UPDATE/DELETE/TRUNCATE reach for any non-owner clara role (migration-seeded DATA, no door writes it), carrying exactly 2 reviewed rows -- society/3900 RELABELLED "Accumulated Fund" and society/3040 SUPPRESSED, discharging in full the written obligation 0150''s header handed to this PR. ONE new event type, account.chart_applied, registered as the COUPLED PAIR (clara.event_types client_scoped + clara.trigger_taxonomy `notification` at the ACTIVE version) with the whole-catalog coverage anti-join re-proved EMPTY and the taxonomy version count unmoved. ACL: the 7 doors AND the 4 INVOKER helpers reach clara_authenticated + clara_fn_owner and NO other clara role -- NO WAKE GRANT and NO allowlist row, Annex E''s first non-goal (no agent path to the BULK apply) held structurally; the one WRITING internal _coa_plant_family reaches NOBODY but its owner; PUBLIC reaches none of the twelve. POSTURE by property, and it is this file''s security decision: the 3 WRITERS (2 doors + the plant loop) are SECURITY DEFINER with search_path pinned to clara,pg_temp, while the 5 READS and the 4 granted helpers are INVOKER (0004:730-739''s trial_balance idiom, 0150''s own posture) so RLS decides who sees what -- a granted DEFINER helper answering for any client uuid would be a cross-tenant read oracle, which the first rig run surfaced as a 42501 and this census now drift-guards in both directions. Neither writer nor the plant loop contains any DML against clara.coa_accounts -- every planted account goes through clara._upsert_account_core and inherits its live ladder, its _audit row and its account.upserted event unchanged. % coa_template_adoptions row(s) live: this file plants no client chart. Constraint 15: workflow/graphile_worker/spike relation counts unmoved and none of this file''s names inside them.', v_n;
end $tail$;
