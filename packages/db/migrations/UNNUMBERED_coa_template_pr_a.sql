-- UNNUMBERED_coa_template_pr_a.sql -- 裁-21 PR-a: THE FIRM-LEVEL STANDARD CHART OF ACCOUNTS,
-- the TEMPLATE half. Four relations + their RLS/ACL, fork_coa_template, the four editor doors,
-- publish_coa_template, retire_coa_template, the two reads, and the PLATFORM STARTER SEED ROWS.
--
-- MIGRATION NUMBER: claimed at MERGE time by the conductor (AGENTS.md constraint 10). This file
-- ships UNNUMBERED on purpose -- `db:migrate` skips an unnumbered file, so it is inert until the
-- conductor renames it against the then-frontier. It was rig-validated as 0148 against a repo
-- frontier of 142 files / 0147_db_hardening_b_hash_only_bearer_tokens.
--
-- DESIGN OF RECORD: docs/plan/active/coa-template-design.md (D-1, D-2, D-13) ·
-- docs/plan/active/coa-template-annexes.md Annex F (the DDL), Annex B (the family cut),
-- Annex D (the frontend homes), Annex G (the build sequence) ·
-- docs/plan/active/coa-template-survey.md (the estate as-found, F1-F10) ·
-- docs/plan/active/coa-template-gate-record.md (the gate, CLOSED, all twelve RULED 裁-23).
-- THE RULINGS OVERRIDE THE DESIGN WHERE THEY DIFFER.
--
-- THE SEED DATA: docs/plan/research/coa-template-2026-08-29.json -- 31 families, 100 accounts
-- verbatim, plus TWO provisional equity families (2 accounts) the conductor ruled in on
-- 2026-08-29 to close the entity_type coverage the dossier itself named as a gap, so 33/102,
-- written by the 裁-23/Q1 research lane the owner ruled must precede PR-0, whose draft he
-- WAIVED his review of (gate record Q1). Its reasoning is
-- docs/plan/research/coa-template-research-2026-08-29.md. Every family row below carries the
-- research lane's own `basis` string verbatim -- an MPERS paragraph, an ITA/PR citation, or the
-- words "firm practice" (D-13 item 1: a family that cannot say where it came from has
-- established nothing).
--
-- WHICH RULINGS THIS FILE DISCHARGES
--   Q1  the template is RESEARCH-DERIVED and ships PUBLISHED through the migration ladder.
--   Q2  numbering: 4-digit plain codes, one block per account_type, RESEARCH-EARNED (the
--       research rejected the 3-digit-dash form the owner named as one of the two not to pick,
--       and re-derived the 4-digit block from Bukku/Sage UBS/NCL/QBO rather than inheriting the
--       estate seed's habit). Every seeded code satisfies ck_coa_account_code_0009's FIRST
--       branch -- proven in the tail, not asserted here.
--   Q3  admin floor on fork/edit/publish/retire. The bookkeeper-floored apply is PR-b.
--   Q8  the tax-sensitive expenses are their own FAMILIES (ten add-back classes from the
--       research, wider than D-14's eight: club subscriptions and the doubtful-debt/unapproved-
--       provision split were added by the research and are carried). NO tax TREATMENT column --
--       `default_tax_treatment_code` and its FK wait for F-T3 PR-4 (design D-14). What this file
--       DOES carry, per the conductor's 2026-08-29 F-T3 cross-reference ruling, is three
--       per-account ANNOTATION columns -- `tax_sensitive` / `add_back_class` / `statutory` --
--       which are CITATION-BACKED HINTS for F-T3's PROPOSE step and NEVER treatment facts.
--       Nothing in this train reads add_back_class as an authority for a treatment; a treatment
--       is F-T3's per-client, per-YA propose -> distinct-human-approve act. No tax_* relation is
--       minted and no join to one exists -- both proved NEGATIVELY in the tail.
--   Q10 the equity section swaps by entity type: equity_company {sdn_bhd,bhd} ·
--       equity_sole_prop {sole_prop} · equity_partnership {partnership,llp}; equity_common
--       (Retained Earnings) is `core` and applies in every case.
--   Q11 statutory-payable names are the research's mainstream-Malaysian set, NOT the gate's
--       English fallback: EPF (KWSP) · SOCSO (PERKESO) · EIS (SIP) · PCB (MTD) · HRDF (HRD
--       Corp) · SST Output Tax.
--   Q12 MSIC 2008, edition-stamped: coa_template_families.msic_edition exists exactly when the
--       family carries an MSIC key, and every seeded stamp reads 'MSIC 2008'.
--
-- THE Q1/Q3 RECONCILIATION, MADE STRUCTURAL RATHER THAN LEFT AS A COMMENT. The design names it
-- as the one place the two rulings meet: Q1 ships the platform template PUBLISHED through the
-- ladder while Q3 keeps "an admin publishes" as the in-product act. They do NOT collide here,
-- and the reason is a wall rather than a convention: a `scope='platform'` template is authored
-- by the migration ladder, carries NO created_by and NO published_by (ck_coa_templates_
-- authorship), and every editor door REFUSES it by name (platform_template_not_editable). The
-- admin floor therefore governs exactly what Q3 says it governs -- a FIRM's own fork -- and the
-- platform starter is not a thing an admin ever publishes, edits or retires. This is the
-- reading coa-template-gate-record.md records; it is not an invention, and no shape was found
-- where the two rulings actually conflict.
--
-- FRONTEND HOMES (.claude/rules/db-migrations.md -- every clara_authenticated door names one).
-- ALL of this file's doors are PR-d's `/admin` COA template editor panel (Annex D):
--   fork_coa_template · upsert_coa_template_family · remove_coa_template_family ·
--   upsert_coa_template_account · remove_coa_template_account · publish_coa_template ·
--   retire_coa_template · list_coa_templates · get_coa_template
-- Annex D's own scope note stands and is NOT absorbed silently: if PR-d finds no `/admin` shell
-- in apps/web, this panel is its first tenant.
--
-- =====================================================================================
-- SS0 -- D1 WRITE-QUIESCE INVENTORY: EMPTY
-- =====================================================================================
-- Every relation, trigger and function this file installs is NEW. No live PL/pgSQL body is
-- replaced, so there is no ceremony, no quiesce window and no prosrc-SHA pin to take. Annex G
-- asserts this; this file PROVES it: S0 snapshots EVERY function in schema clara (oid, prosrc
-- sha256, proacl, proowner) into a temp table, and the tail re-reads the whole catalog and
-- requires that every pre-existing function is byte-identical on all three, and that the only
-- additions are exactly this file's own fourteen names (7 writers + 2 reads + 2 internal
-- helpers + 3 trigger functions), pinned as a MAP of signatures rather than a count. A
-- whole-catalog differential, not a roster probe: a body this file never thought to name
-- cannot slip past it.
--
-- THE upsert_account CHAIN IS CALLED BY PR-b, NOT BY THIS FILE. PR-a writes no coa_accounts
-- row at all. The four chain shas re-pinned by this lane's replay at frontier 0147 are recorded
-- in the PR body, not here -- this file has no dependency on them.
--
-- =====================================================================================
-- DEPARTURES REGISTER -- every place this file's built shape diverges from Annex F's sketch,
-- in one place, so a reviewer finds every delta here rather than diffing prose.
-- =====================================================================================
-- (1) NO firm_id COLUMN ON coa_template_families / coa_template_accounts. Annex F sketches
--     `firm_id uuid -- null iff the template is platform-scoped` on both children. That column
--     IS the "infer platform from a NULL" shape the lane brief forbids (R-L26, survey F10's
--     warning), and no foreign key can close it: a composite FK onto (id, scope, firm_id) is
--     unenforced under MATCH SIMPLE the moment firm_id is NULL, and unsatisfiable under MATCH
--     FULL for exactly the platform rows it would need to cover. The children therefore carry
--     NO tenancy column at all and derive scope+firm from the parent through template_id --
--     one place the answer lives, no drift possible. Their human read policy is the parent-
--     derived EXISTS below, which is a departure from db-migrations.md's generic
--     `firm_id = clara.jwt_firm()` shape for the same reason 0139 departed from it: that shape
--     assumes a firm_id column these tables deliberately do not have.
-- (2) TWO PARTIAL UNIQUE INDEXES, not Annex F's `unique (scope, firm_id, template_key,
--     version)`. A four-column UNIQUE with a nullable firm_id does not dedupe the platform rows
--     at all (NULLs are distinct), so the sketch's own uniqueness claim is vacuous for exactly
--     the scope this file seeds. uq_coa_templates_firm_version and
--     uq_coa_templates_platform_version each cover their own scope, both enforcing.
-- (3) msic_edition ON coa_template_families -- an ADDITION to Annex F, grounded in Q12's ruling
--     ("MSIC 2008, with an edition stamp on every recorded code"). It is NULL exactly when the
--     family carries no MSIC key (ck_coa_family_msic_edition_paired), so a stamp exists exactly
--     where there is a code to stamp -- never a decorative default.
-- (4) THE TRADE-NATURE / ENTITY-TYPE VOCABULARIES ARE NOT DDL CHECKs. They live in
--     clara.client_fact_keys.allowed_values, a LIVE code-populated catalog (0055:345-346), and
--     a CHECK duplicating it would be the same silent-divergence hazard the account_code CHECK
--     carries -- with no drift-guard available, because a CHECK cannot read a table. The doors
--     resolve both against the live catalog instead (record_client_fact's own precedent), and
--     the tail proves every seeded family's keys are a SUBSET of the live allowed_values.
--     msic_sections IS a CHECK (`<@ array['A'..'U']`) because the ISIC/MSIC section alphabet is
--     stable across the 2008 and 2025 editions; msic_divisions' two-digit shape is a door guard.
-- (5) THE DRAFT HEADER IS IMMUTABLE apart from the publish stamp. Annex F/design D-2 say only a
--     PUBLISHED template is immutable. This file is stricter: a draft admits exactly one
--     update, the draft->published stamp, and a published one exactly one, the ->retired stamp.
--     Grounds: this PR ships no header-editing door, and an admitted transition no function can
--     perform is dead surface that only a direct clara_fn_owner DML could reach. The remedy is
--     named rather than hidden -- a mis-titled draft is superseded by forking again, and a draft
--     applies to no client, ever.
-- (6) THE READS' FLOOR IS clara_authenticated + RLS, not Annex D's "bookkeeper (read)" label.
--     db-migrations.md REQUIRES the scoped human read and its matching table grant, so a rank
--     floor inside a reader function would be defeated by a direct SELECT and would be
--     dishonest to claim. This is exactly coa_accounts' own live posture
--     (p_coa_accounts_human, `for all to clara_authenticated using (firm_id = jwt_firm())`, no
--     rank floor) -- the client's REAL chart is readable by any authenticated firm member, and
--     a template of the same chart is no more sensitive. Named here rather than discovered.
-- (7) fork_coa_template ACCEPTS A NULL SOURCE (an empty firm draft to author from scratch).
--     Annex F/D-2 describe forking a published template; a firm that wants neither the platform
--     starter nor a predecessor needs a way to start, and the alternative is direct DML.
-- (8) THE FOUR EDITOR DOORS are read as upsert/remove x family/account. Annex D names only the
--     two upserts; a draft with no way to remove a family is not editable, and the alternative
--     recovery path is a second fork.
-- (9) publish_coa_template REFUSES A FAMILY WITH ZERO ACCOUNTS (empty_family, naming it).
--     Annex F asks for no such rung. A zero-account family is a trim unit that plants nothing --
--     it would make PR-b's keep/drop list offer a checkbox with no effect.
-- (10) THREE ANNOTATION COLUMNS on coa_template_accounts -- `tax_sensitive`, `add_back_class`,
--     `statutory` -- which Annex F does not sketch. Added on the conductor's 2026-08-29 ruling
--     from an F-T3 cross-reference of the research JSON, whose per-account fields would
--     otherwise be discarded at the seed boundary and re-derived later by guesswork. They are
--     HINTS, stated as such in their own column comments, and the boundary is enforced by what
--     is ABSENT as much as by what is present: no tax_* relation, no FK to one, and no reader in
--     this train treats them as authority. add_back_class is CLOSED, EXTEND-ONLY, over exactly
--     the twelve leaves the research spells -- F-T3 owns the mapping to its own ADDBACK_*
--     vocabulary. The tail proves the closed set in BOTH directions (all twelve admitted; an
--     unlisted leaf refused) with a probe built and discarded in a forced-rollback
--     subtransaction. `statutory` stays OPEN text, the 0139 obligation_code posture.

set local statement_timeout = '5min'; -- PRECAUTIONARY, not load-bearing: four empty tables,
  -- eleven functions, and 131 seed rows. Nothing here backfills.

-- =====================================================================================
-- S0 -- PRESTATE. Every claim this file makes about the frontier it lands on, MEASURED, with
-- an abort on a false premise. Nothing below proceeds on a doc's say-so.
-- =====================================================================================
create temp table _coa_pra_fn_snapshot on commit drop as
  select p.oid,
         p.oid::regprocedure::text as sig,
         encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as prosrc_sha256,
         coalesce(array_to_string(p.proacl::text[], '|'), '<null>') as acl,
         pg_get_userbyid(p.proowner) as owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara';

create temp table _coa_pra_frozen_snapshot on commit drop as
  select n.nspname, count(*)::int as relations
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('workflow', 'graphile_worker', 'spike')
   group by n.nspname;

do $s0$
declare
  r record;
  v_n int;
  v_txt text;
  -- The FIVE live coa_accounts predicates this file mirrors on its own table. Read from the
  -- catalog below and compared BYTE-FOR-BYTE against the text this file is about to install --
  -- the drift hazard design SS7 names, guarded at birth here and re-guarded live by the
  -- battery's cell 15 with an adversarial mutant.
  v_want_code    constant text := 'CHECK ((account_code ~ ''^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$''::text))';
  v_want_type    constant text := 'CHECK ((account_type = ANY (ARRAY[''asset''::text, ''liability''::text, ''equity''::text, ''income''::text, ''expense''::text])))';
  v_want_class   constant text := 'CHECK (((account_class IS NULL) OR (account_class = ANY (ARRAY[''payable''::text, ''receivable''::text]))))';
  v_want_special constant text := 'CHECK (((special_acc_type IS NULL) OR (special_acc_type = ANY (ARRAY[''rounding''::text, ''sst_output''::text, ''sst_purchase_cost''::text, ''opening_balance_equity''::text, ''retained_earnings''::text]))))';
  v_want_obe     constant text := 'CHECK (((special_acc_type IS DISTINCT FROM ''opening_balance_equity''::text) OR (account_type = ''equity''::text)))';
  v_want_re      constant text := 'CHECK (((special_acc_type IS DISTINCT FROM ''retained_earnings''::text) OR (account_type = ''equity''::text)))';
  v_want_sstpc   constant text := 'CHECK (((special_acc_type IS DISTINCT FROM ''sst_purchase_cost''::text) OR (account_type = ''expense''::text)))';
begin
  -- (a) Nothing this file births may already exist.
  for r in select x from unnest(array[
      'clara.coa_templates','clara.coa_template_families',
      'clara.coa_template_accounts','clara.coa_template_adoptions']) x loop
    if to_regclass(r.x) is not null then
      raise exception 'S0: % already exists -- refusing to re-birth', r.x using errcode = 'CLR10';
    end if;
  end loop;
  for r in select x from unnest(array[
      'clara._coa_template_content_sha256(uuid)',
      'clara._coa_template_for_edit(uuid,uuid)',
      'clara.fork_coa_template(uuid,text,text,text,text,text)',
      'clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text)',
      'clara.remove_coa_template_family(uuid,text,text)',
      'clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text)',
      'clara.remove_coa_template_account(uuid,text,text)',
      'clara.publish_coa_template(uuid,text)',
      'clara.retire_coa_template(uuid,text)',
      'clara.list_coa_templates()',
      'clara.get_coa_template(uuid)',
      'clara._tf_coa_template_freeze()',
      'clara._tf_coa_template_child_freeze()',
      'clara._tf_coa_adoption_template_congruent()']) x loop
    if to_regprocedure(r.x) is not null then
      raise exception 'S0: % already exists -- refusing to re-birth', r.x using errcode = 'CLR10';
    end if;
  end loop;

  -- (b) THE NAME COLLISION IS A KNOWN FACT, NOT A DISCOVERY (survey F10, gate obligation 3).
  --     clara.chart_templates / chart_template_versions are DATAVIZ chart specs. They must
  --     exist (so the collision is real and this file's coa_ prefix is load-bearing) and this
  --     file must not touch them -- the tail re-reads their column count unchanged.
  if to_regclass('clara.chart_templates') is null
     or to_regclass('clara.chart_template_versions') is null then
    raise exception 'S0: the dataviz chart_templates pair is missing -- the frontier is not the one this file was built against'
      using errcode = 'CLR10';
  end if;

  -- (c) The target relation and its five mirrored predicates, read LIVE.
  if to_regclass('clara.coa_accounts') is null then
    raise exception 'S0: clara.coa_accounts is missing' using errcode = 'CLR10';
  end if;
  for r in select * from (values
      ('ck_coa_account_code_0009',              v_want_code),
      ('coa_accounts_account_type_check',       v_want_type),
      ('ck_coa_account_class',                  v_want_class),
      ('coa_accounts_special_acc_type_check',   v_want_special),
      ('ck_coa_obe_equity',                     v_want_obe),
      ('ck_coa_retained_earnings_equity',       v_want_re),
      ('ck_coa_sst_purchase_cost_expense',      v_want_sstpc)) as t(conname, want) loop
    select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
     where con.conrelid = 'clara.coa_accounts'::regclass and con.conname = r.conname;
    if v_txt is null then
      raise exception 'S0: clara.coa_accounts carries no constraint named %', r.conname using errcode = 'CLR10';
    end if;
    if v_txt <> r.want then
      raise exception 'S0: % has drifted -- live is %, this file mirrors %', r.conname, v_txt, r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (d) Every helper the doors call, at its EXACT signature (law 3: prove the identifier IS
  --     its import, never trust the spelling).
  for r in select x from unnest(array[
      'clara._human_ctx(integer)','clara.role_rank(text)','clara.jwt_firm()',
      'clara._reserve_op(uuid,text,text,bytea)','clara._finish_op(uuid,text,text,jsonb)',
      'clara._hash(jsonb)','clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
      'clara._tf_no_truncate()']) x loop
    if to_regprocedure(r.x) is null then
      raise exception 'S0: required helper % does not resolve at its pinned signature', r.x using errcode = 'CLR10';
    end if;
  end loop;

  -- (e) Every relation the four tables reference.
  for r in select x from unnest(array[
      'clara.firms','clara.users','clara.clients','clara.onboarding_agent_receipts',
      'clara.client_fact_keys']) x loop
    if to_regclass(r.x) is null then
      raise exception 'S0: referenced relation % is missing', r.x using errcode = 'CLR10';
    end if;
  end loop;
  -- The composite client FK needs clara.clients(id, firm_id) to be a real unique key.
  if not exists (
    select 1 from pg_constraint con
     where con.conrelid = 'clara.clients'::regclass and con.contype in ('u','p')
       and (select array_agg(a.attname::text order by a.attnum)
              from pg_attribute a where a.attrelid = con.conrelid and a.attnum = any(con.conkey))
           = array['id','firm_id']::text[]) then
    raise exception 'S0: clara.clients carries no unique/primary key on (id, firm_id) -- the composite tenant FK cannot be built'
      using errcode = 'CLR10';
  end if;

  -- (f) The two fact vocabularies the family doors resolve against are LIVE and populated.
  --     Measured, never assumed -- survey P-5 is the estate's own proof that this catalog grew
  --     from two rows to five without anyone updating a design doc.
  -- allowed_values is JSONB (an array of strings), measured on the rig -- not text[]. Every
  -- membership test in this file goes through jsonb containment because of it.
  select count(*) into v_n from clara.client_fact_keys
   where fact_key in ('trade_nature','entity_type') and allowed_values is not null
     and jsonb_typeof(allowed_values) = 'array' and jsonb_array_length(allowed_values) > 0;
  if v_n <> 2 then
    raise exception 'S0: expected trade_nature and entity_type to both carry a non-empty allowed_values in clara.client_fact_keys, found % such row(s)', v_n
      using errcode = 'CLR10';
  end if;

  -- (g) The roles this file grants to.
  for r in select x from unnest(array['clara_fn_owner','clara_authenticated']) x loop
    if not exists (select 1 from pg_roles where rolname = r.x) then
      raise exception 'S0: role % is missing', r.x using errcode = 'CLR10';
    end if;
  end loop;

  select count(*) into v_n from _coa_pra_fn_snapshot;
  raise notice 'coa-template PR-a prestate: OK -- 4 relation names and 14 function names all clear; the dataviz chart_templates pair present (the coa_ prefix is load-bearing); all SEVEN mirrored coa_accounts predicates read live and byte-equal to what this file installs (code/type/class/special/OBE/RE/SST-purchase-cost); 8 helpers + 5 referenced relations resolve at exact signatures; clara.clients carries a real unique on (id, firm_id); trade_nature and entity_type both carry a populated allowed_values; % clara function(s) snapshotted for the tail''s whole-catalog D1-EMPTY differential.', v_n;
end $s0$;

-- =====================================================================================
-- S1 -- THE FOUR RELATIONS. Owned by clara_fn_owner (the 0043 discipline: forced RLS binds the
-- owner, so ownership is part of the RLS story, not cosmetics). Every constraint is EXPLICITLY
-- NAMED so the tail's census pins identity rather than a generated spelling.
-- =====================================================================================
set role clara_fn_owner;

-- S1.1 -- clara.coa_templates: the versioned header.
create table clara.coa_templates (
  id             uuid        not null default gen_random_uuid(),
  -- R-L26 / survey F10: an EXPLICIT scope column, never a NULL inference. The estate's own
  -- p_charttemplates_human reads `firm_id IS NULL OR firm_id = clara.jwt_firm()`, which fails
  -- OPEN; this table's read policy is `scope = 'platform' OR firm_id = clara.jwt_firm()` with
  -- the paired CHECK below making the two columns provably consistent.
  scope          text        not null,
  firm_id        uuid,
  template_key   text        not null,
  version        int         not null,
  title          text        not null,
  framework_hint text        not null,
  -- D-13 item 1: the header's own provenance, never optional.
  basis          text        not null,
  state          text        not null default 'draft',
  -- Computed at publish over the canonicalised family + account rows, so two publishes of
  -- identical content are visibly identical (design D-2).
  content_sha256 bytea,
  forked_from    uuid,
  -- NULL exactly for the platform starter, which the migration ladder authors and no session
  -- actor ever touches. A firm-scoped template always names its human author.
  created_by     uuid,
  created_at     timestamptz not null default now(),
  published_by   uuid,
  published_at   timestamptz,
  retired_at     timestamptz,

  constraint coa_templates_pkey primary key (id),
  -- The target of coa_template_adoptions' COMPOSITE fk (MED-2): an adoption stores the version
  -- it applied, and without this a stored template_version is a free-floating integer no
  -- constraint ever checks against the template it names.
  constraint uq_coa_templates_id_version unique (id, version),
  constraint fk_coa_templates_firm         foreign key (firm_id)      references clara.firms(id),
  constraint fk_coa_templates_forked_from  foreign key (forked_from)  references clara.coa_templates(id),
  constraint fk_coa_templates_created_by   foreign key (created_by)   references clara.users(id),
  constraint fk_coa_templates_published_by foreign key (published_by) references clara.users(id),

  constraint ck_coa_templates_scope      check (scope in ('firm','platform')),
  constraint ck_coa_templates_scope_firm check ((scope = 'firm') = (firm_id is not null)),
  constraint ck_coa_templates_key        check (btrim(template_key) <> ''
                                                and template_key ~ '^[a-z][a-z0-9_]*$'),
  constraint ck_coa_templates_version    check (version > 0),
  constraint ck_coa_templates_title      check (btrim(title) <> ''),
  constraint ck_coa_templates_framework  check (framework_hint in ('MPERS','MFRS','any')),
  constraint ck_coa_templates_basis      check (btrim(basis) <> ''),
  constraint ck_coa_templates_state      check (state in ('draft','published','retired')),
  constraint ck_coa_templates_sha_shape  check (content_sha256 is null or length(content_sha256) = 32),
  -- A published or retired template carries its stamp and its content hash; a draft carries
  -- neither. Two-way, so neither half can arrive without the other.
  constraint ck_coa_templates_published  check (
    (state in ('published','retired')) = (published_at is not null and content_sha256 is not null)),
  constraint ck_coa_templates_retired    check ((state = 'retired') = (retired_at is not null)),
  -- THE Q1/Q3 RECONCILIATION AS A WALL (see the header). A platform template is
  -- migration-authored: no created_by, no published_by, ever. A firm template always names its
  -- author, and names its publisher the moment it leaves draft.
  constraint ck_coa_templates_authorship check (
    (scope = 'firm'     and created_by is not null)
    or (scope = 'platform' and created_by is null and published_by is null)),
  constraint ck_coa_templates_publisher  check (
    scope = 'platform' or state = 'draft' or published_by is not null)
);

-- Annex F sketches one four-column UNIQUE; a nullable firm_id makes that vacuous for exactly
-- the platform scope this file seeds (departures register (2)). Two partial uniques, each
-- enforcing inside its own scope.
create unique index uq_coa_templates_firm_version on clara.coa_templates
  (firm_id, template_key, version) where scope = 'firm';
create unique index uq_coa_templates_platform_version on clara.coa_templates
  (template_key, version) where scope = 'platform';

-- S1.2 -- clara.coa_template_families: THE TRIM UNIT. No tenancy column: scope and firm are
-- the parent's, reached through template_id (departures register (1)).
create table clara.coa_template_families (
  template_id    uuid        not null,
  family_key     text        not null,
  label          text        not null,
  -- 'core' is NEVER trimmable and carries no trim keys (ck_coa_family_core_unkeyed).
  inclusion      text        not null,
  -- The MPERS paragraph, the ITA/Public-Ruling citation, or the words "firm practice".
  basis          text        not null,
  sort_ordinal   int         not null,
  msic_sections  text[]      not null default '{}',
  msic_divisions text[]      not null default '{}',
  -- Q12's edition stamp. Present exactly when there is an MSIC code to stamp.
  msic_edition   text,
  trade_natures  text[]      not null default '{}',
  entity_types   text[]      not null default '{}',

  constraint coa_template_families_pkey primary key (template_id, family_key),
  constraint fk_coa_family_template foreign key (template_id) references clara.coa_templates(id),
  constraint ck_coa_family_key       check (family_key ~ '^[a-z][a-z0-9_]*$'),
  constraint ck_coa_family_label     check (btrim(label) <> ''),
  constraint ck_coa_family_inclusion check (inclusion in ('core','by_industry','opt_in')),
  constraint ck_coa_family_basis     check (btrim(basis) <> ''),
  -- A core family applies unconditionally, so a trim key on one is a contradiction, not a
  -- refinement.
  constraint ck_coa_family_core_unkeyed check (
    inclusion <> 'core' or (msic_sections = '{}' and msic_divisions = '{}'
                            and trade_natures = '{}' and entity_types = '{}')),
  -- The ISIC/MSIC SECTION alphabet is stable across the 2008 and 2025 editions, so it is a
  -- CHECK. The two-digit DIVISION shape and the trade-nature/entity-type vocabularies are door
  -- guards instead -- departures register (4).
  constraint ck_coa_family_msic_sections check (
    msic_sections <@ array['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U']::text[]),
  constraint ck_coa_family_msic_edition check (msic_edition is null or msic_edition in ('MSIC 2008','MSIC 2025')),
  constraint ck_coa_family_msic_edition_paired check (
    (msic_edition is not null) = (msic_sections <> '{}' or msic_divisions <> '{}'))
);

-- S1.3 -- clara.coa_template_accounts: the rows. MIRRORS coa_accounts' live constraints, so a
-- bad template fails at AUTHORING rather than mid-loop at apply. The mirror is a duplicated
-- predicate and therefore a drift hazard: S0 above proved all seven byte-equal at birth, and
-- the battery re-proves them live with an adversarial mutant.
create table clara.coa_template_accounts (
  template_id      uuid not null,
  family_key       text not null,
  account_code     text not null,
  name             text not null,
  account_type     text not null,
  account_class    text,
  special_acc_type text,
  sort_ordinal     int  not null,

  -- THE THREE ANNOTATION COLUMNS (conductor ruling, 2026-08-29, from an F-T3 cross-reference of
  -- the research JSON). They are CITATION-BACKED HINTS, never treatment facts. NOTHING in this
  -- file, and nothing in PR-b/PR-c, may read add_back_class as an authority for a tax treatment:
  -- a treatment is F-T3's own per-client, per-YA propose -> human-approve door (design D-14 and
  -- tax-computation-design.md SS "never an auto-approved treatment row"). No tax_* table is
  -- minted here and no join to one exists. See the column comments below.
  tax_sensitive    boolean not null default false,
  add_back_class   text,
  statutory        text,

  constraint coa_template_accounts_pkey primary key (template_id, account_code),
  constraint fk_coa_tmpl_account_family foreign key (template_id, family_key)
    references clara.coa_template_families(template_id, family_key),
  constraint ck_coa_tmpl_name    check (btrim(name) <> ''),
  constraint ck_coa_tmpl_code    check (account_code ~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$'),
  constraint ck_coa_tmpl_type    check (account_type in ('asset','liability','equity','income','expense')),
  constraint ck_coa_tmpl_class   check (account_class is null or account_class in ('payable','receivable')),
  constraint ck_coa_tmpl_special check (special_acc_type is null or special_acc_type in
    ('rounding','sst_output','sst_purchase_cost','opening_balance_equity','retained_earnings')),
  constraint ck_coa_tmpl_obe     check (special_acc_type is distinct from 'opening_balance_equity'
                                        or account_type = 'equity'),
  constraint ck_coa_tmpl_re      check (special_acc_type is distinct from 'retained_earnings'
                                        or account_type = 'equity'),
  constraint ck_coa_tmpl_sst     check (special_acc_type is distinct from 'sst_purchase_cost'
                                        or account_type = 'expense'),

  -- The TWELVE add-back leaf codes, VERBATIM as the research spells them. F-T3 owns the mapping
  -- from these to its own ADDBACK_* vocabulary; this file does not pre-empt it. EXTEND-ONLY: a
  -- thirteenth leaf arrives as a reviewed widening migration, never a live edit. The tail proves
  -- BOTH directions -- every one of the twelve is admitted, and an unlisted code is REFUSED.
  constraint ck_coa_tmpl_add_back_class check (add_back_class is null or add_back_class in (
    'entertainment', 'donations_approved', 'donations_unapproved', 'fines_and_penalties',
    'depreciation_and_amortisation', 'leave_passage', 'private_and_proprietor_expenses',
    'motor_running_costs', 'club_subscriptions_and_entrance_fees', 'doubtful_debts_specific',
    'doubtful_debts_general', 'unapproved_provident_fund')),
  -- ONE-WAY on purpose: naming an add-back class implies the account is tax-sensitive, but an
  -- account may be flagged tax-sensitive before anyone has named its class. The biconditional
  -- happens to hold across the SEEDED rows and the tail measures that as a DATA fact -- it is
  -- deliberately not frozen into the DDL.
  constraint ck_coa_tmpl_add_back_paired check (add_back_class is null or tax_sensitive),
  -- `statutory` stays OPEN text (shape-checked only), the 0139 obligation_code posture: the
  -- regulator tags this chart happens to carry are THIS template's rows, not the column's whole
  -- vocabulary -- F-T1 (SST) and F-T2 (payroll) contribute their own and neither is named here.
  constraint ck_coa_tmpl_statutory check (statutory is null or statutory ~ '^[a-z][a-z0-9_]*$')
);

comment on column clara.coa_template_accounts.tax_sensitive is
  'HINT for F-T3''s propose step; NOT a treatment. Marks an account the tax computation is likely to touch. No door in this train reads it as an authority for anything.';
comment on column clara.coa_template_accounts.add_back_class is
  'HINT for F-T3''s propose step; NOT a treatment. The research lane''s add-back leaf code, verbatim (docs/plan/research/coa-template-research-2026-08-29.md). A tax treatment is F-T3''s per-client, per-YA propose -> human-approve act keyed on (client_id, firm_id, account_id, ya); this column can never stand in for one, and nothing may join it to a tax_* relation.';
comment on column clara.coa_template_accounts.statutory is
  'HINT, not a treatment: the Malaysian statutory regulator tag this account settles against (epf / socso / eis / pcb_mtd / hrdf / sst_output / sst_input on the seeded starter). Open text by design -- F-T1 and F-T2 contribute their own tags.';

-- Mirrors uq_coa_special so a template carrying two rows with one marker is refused at INSERT,
-- not at apply (Annex C cell 4).
create unique index uq_coa_tmpl_special on clara.coa_template_accounts
  (template_id, special_acc_type) where special_acc_type is not null;
create index ix_coa_tmpl_account_family on clara.coa_template_accounts (template_id, family_key);

-- S1.4 -- clara.coa_template_adoptions: ONE relation, four states (TA-P11 -- never two
-- architectures for one semantic). PR-a births the relation and its walls; the writers
-- (apply_coa_template, wake_propose_coa_template_trim) are PR-b and PR-c.
create table clara.coa_template_adoptions (
  id                uuid        not null default gen_random_uuid(),
  firm_id           uuid        not null,
  client_id         uuid        not null,
  template_id       uuid        not null,
  template_version  int         not null,
  state             text        not null,
  families          text[]      not null,
  family_rationales jsonb       not null default '{}'::jsonb,
  basis             jsonb,
  proposed_by       uuid,
  proposed_at       timestamptz,
  receipt_id        uuid,
  adopted_by        uuid,
  adopted_at        timestamptz,
  superseded_by     uuid,
  created_at        timestamptz not null default now(),

  constraint coa_template_adoptions_pkey primary key (id),
  constraint fk_coa_adoption_firm     foreign key (firm_id)     references clara.firms(id),
  -- COMPOSITE (MED-2), not the single-column FK Annex F sketches. The row stores BOTH the
  -- template and the version it applied -- that pair is the whole point of the record (design
  -- D-2: "the adoption row records WHICH template version was applied so drift is measurable").
  -- A single-column FK leaves template_version unchecked, so an adoption could name version 7 of
  -- a template that only ever had two. The composite makes the pair itself the reference.
  constraint fk_coa_adoption_template foreign key (template_id, template_version)
    references clara.coa_templates(id, version),
  constraint fk_coa_adoption_receipt  foreign key (receipt_id)  references clara.onboarding_agent_receipts(id),
  constraint fk_coa_adoption_proposer foreign key (proposed_by) references clara.users(id),
  constraint fk_coa_adoption_adopter  foreign key (adopted_by)  references clara.users(id),
  constraint fk_coa_adoption_successor foreign key (superseded_by) references clara.coa_template_adoptions(id),
  -- Tenant congruence is STRUCTURAL, the coa_accounts idiom (fk_coa_client_firm_delta).
  constraint fk_coa_adoption_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),

  constraint ck_coa_adoption_state    check (state in ('proposed','adopted','declined','superseded')),
  constraint ck_coa_adoption_families check (cardinality(families) >= 1),
  constraint ck_coa_adoption_rationales check (jsonb_typeof(family_rationales) = 'object'),
  constraint ck_coa_adoption_basis_shape check (basis is null or jsonb_typeof(basis) = 'object'),
  constraint ck_coa_adoption_version  check (template_version > 0),
  constraint ck_coa_adoption_proposed check ((proposed_by is null) = (proposed_at is null)),
  -- THREE biconditionals, not one conjunction (independent review, 2026-08-29, MEASURED RED
  -- first). `(state='adopted') = (adopted_by is not null and adopted_at is not null)` reads like
  -- a two-way wall and is not one: for a NON-adopted row both sides are false whenever EITHER
  -- stamp is missing, so a 'declined' row naming an adopted_by with a NULL adopted_at was
  -- ADMITTED. Splitting it makes each half say exactly one thing:
  --   the adopter exists iff the row is adopted; and the two stamps travel together, always.
  constraint ck_coa_adoption_adopted    check ((state = 'adopted') = (adopted_by is not null)),
  constraint ck_coa_adoption_adopted_at check ((adopted_by is null) = (adopted_at is null)),
  -- Same defect, same shape, and this one guarded the claim that matters most: an agent
  -- proposal ALWAYS carries a receipt AND a basis; a human-direct adoption carries neither.
  -- `(proposed_by is null) = (receipt_id is null and basis is null)` only ever forced AT LEAST
  -- ONE of the two to be present, so a proposal with a basis and NO RECEIPT was ADMITTED --
  -- exactly the receipt-less agent act the comment promised was impossible. Two independent
  -- biconditionals, so neither can stand in for the other.
  constraint ck_coa_adoption_receipted   check ((proposed_by is null) = (receipt_id is null)),
  constraint ck_coa_adoption_basis_paired check ((proposed_by is null) = (basis is null))
);

create unique index uq_coa_adoption_live on clara.coa_template_adoptions (client_id) where state = 'adopted';
create unique index uq_coa_adoption_open on clara.coa_template_adoptions (client_id) where state = 'proposed';

-- =====================================================================================
-- S2 -- THE PUBLICATION FREEZE. chart_template_versions' own publication-freeze idiom (survey
-- F10), cloned onto this feature's tables and its four-state lifecycle. This is what makes
-- design D-2's "a template edit cannot rewrite an applied chart" structural on the template
-- side; the apply's own copy-not-reference half is PR-b's.
-- =====================================================================================
create function clara._tf_coa_template_freeze() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a coa_templates row is never deleted -- retire it instead'
      using errcode = 'CLR08', detail = '{"reason":"coa_template_immutable"}';
  end if;
  if old.state = 'draft' then
    -- The ONE admitted transition on a draft: the publish stamp, whole and at once.
    if not (new.state = 'published'
            and new.published_at is not null and new.content_sha256 is not null
            and new.retired_at is null
            and (to_jsonb(new) - array['state','published_by','published_at','content_sha256'])
              = (to_jsonb(old) - array['state','published_by','published_at','content_sha256'])) then
      raise exception 'a draft coa template admits exactly one update: the publish stamp (state, published_by, published_at and content_sha256 together)'
        using errcode = 'CLR08', detail = '{"reason":"coa_template_immutable"}';
    end if;
  elsif old.state = 'published' then
    if not (new.state = 'retired' and new.retired_at is not null
            and (to_jsonb(new) - array['state','retired_at'])
              = (to_jsonb(old) - array['state','retired_at'])) then
      raise exception 'a published coa template is immutable; the only admitted update is the retire stamp'
        using errcode = 'CLR08', detail = '{"reason":"coa_template_immutable"}';
    end if;
  else
    raise exception 'a retired coa template is immutable'
      using errcode = 'CLR08', detail = '{"reason":"coa_template_immutable"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_coa_template_freeze() from public;

-- The child tiers are writable only while their parent is a DRAFT -- insert, update and delete
-- alike. Once published, the content is frozen and the content_sha256 over it stays true.
create function clara._tf_coa_template_child_freeze() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_state text; v_template uuid;
begin
  v_template := coalesce(new.template_id, old.template_id);
  -- FOR SHARE, not a bare read (HIGH-1). An unlocked read here lets a content write commit
  -- BETWEEN a concurrent publisher's hash computation and its state stamp, leaving a PUBLISHED
  -- template whose rows do not reproduce its own content_sha256 -- the one thing D-2's
  -- copy-not-reference promise rests on. The share lock makes the publisher's FOR UPDATE on the
  -- same header wait for this writer, and vice versa, so the hash is always taken over content
  -- that cannot move under it. Same-transaction callers already hold the stronger FOR UPDATE
  -- (every editor door goes through _coa_template_for_edit first), so this never self-blocks.
  select t.state into v_state from clara.coa_templates t where t.id = v_template for share;
  if v_state is distinct from 'draft' then
    raise exception 'coa template % is %, not a draft -- its families and accounts are frozen',
      v_template, coalesce(v_state, 'missing')
      using errcode = 'CLR08', detail = '{"reason":"coa_template_immutable"}';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function clara._tf_coa_template_child_freeze() from public;

create trigger t_coa_templates_freeze before update or delete on clara.coa_templates
  for each row execute function clara._tf_coa_template_freeze();
create trigger t_coa_templates_no_truncate before truncate on clara.coa_templates
  for each statement execute function clara._tf_no_truncate();

create trigger t_coa_template_families_freeze before insert or update or delete
  on clara.coa_template_families for each row execute function clara._tf_coa_template_child_freeze();
create trigger t_coa_template_families_no_truncate before truncate on clara.coa_template_families
  for each statement execute function clara._tf_no_truncate();

create trigger t_coa_template_accounts_freeze before insert or update or delete
  on clara.coa_template_accounts for each row execute function clara._tf_coa_template_child_freeze();
create trigger t_coa_template_accounts_no_truncate before truncate on clara.coa_template_accounts
  for each statement execute function clara._tf_no_truncate();

create trigger t_coa_template_adoptions_no_truncate before truncate on clara.coa_template_adoptions
  for each statement execute function clara._tf_no_truncate();

-- MED-2, second half: the composite FK proves the (template, version) PAIR is real, and the
-- client FK proves the client is the firm's -- but neither says the TEMPLATE is one this firm
-- may adopt. Without this, firm A could record an adoption of firm B's private template: a
-- cross-tenant reference written into a durable record, and a drift read that would then
-- measure A's chart against a template A can't even see. A CHECK cannot express it (it would
-- have to read coa_templates), so it is a trigger -- the same shape 0058's own tenant-congruence
-- guards take. The admitted set is exactly the read policy's: a PLATFORM template, or one of
-- this adoption's own firm.
create function clara._tf_coa_adoption_template_congruent() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_scope text; v_firm uuid;
begin
  select t.scope, t.firm_id into v_scope, v_firm
    from clara.coa_templates t where t.id = new.template_id;
  if v_scope is null then
    raise exception 'adoption names a template that does not exist' using errcode = 'CLR11',
      detail = '{"reason":"template_not_found"}';
  end if;
  if v_scope = 'firm' and v_firm is distinct from new.firm_id then
    raise exception 'a firm may only adopt the platform template or one of its own'
      using errcode = 'CLR11', detail = '{"reason":"template_not_in_firm"}';
  end if;
  return new;
end $$;
revoke all on function clara._tf_coa_adoption_template_congruent() from public;

create trigger t_coa_adoption_template_congruent before insert or update
  on clara.coa_template_adoptions
  for each row execute function clara._tf_coa_adoption_template_congruent();

-- =====================================================================================
-- S3 -- RLS + ACL. Forced on all four (.claude/rules/db-migrations.md), owner policy plus the
-- scoped human read, with the matching SELECT grant and nothing else.
-- =====================================================================================
alter table clara.coa_templates            enable row level security;
alter table clara.coa_templates            force  row level security;
alter table clara.coa_template_families    enable row level security;
alter table clara.coa_template_families    force  row level security;
alter table clara.coa_template_accounts    enable row level security;
alter table clara.coa_template_accounts    force  row level security;
alter table clara.coa_template_adoptions   enable row level security;
alter table clara.coa_template_adoptions   force  row level security;

create policy p_coa_templates_owner on clara.coa_templates
  for all to clara_fn_owner using (true) with check (true);
-- POSITIVE cross-firm visibility: a bookkeeper of ANY firm IS returned the platform starter.
-- The battery proves both directions, because a leak-only cell cannot distinguish "isolated"
-- from "broken" (Annex C cell 5).
create policy p_coa_templates_human on clara.coa_templates
  for select to clara_authenticated
  using (scope = 'platform' or firm_id = clara.jwt_firm());

create policy p_coa_template_families_owner on clara.coa_template_families
  for all to clara_fn_owner using (true) with check (true);
create policy p_coa_template_families_human on clara.coa_template_families
  for select to clara_authenticated
  using (exists (select 1 from clara.coa_templates t
                  where t.id = coa_template_families.template_id
                    and (t.scope = 'platform' or t.firm_id = clara.jwt_firm())));

create policy p_coa_template_accounts_owner on clara.coa_template_accounts
  for all to clara_fn_owner using (true) with check (true);
create policy p_coa_template_accounts_human on clara.coa_template_accounts
  for select to clara_authenticated
  using (exists (select 1 from clara.coa_templates t
                  where t.id = coa_template_accounts.template_id
                    and (t.scope = 'platform' or t.firm_id = clara.jwt_firm())));

create policy p_coa_template_adoptions_owner on clara.coa_template_adoptions
  for all to clara_fn_owner using (true) with check (true);
create policy p_coa_template_adoptions_human on clara.coa_template_adoptions
  for select to clara_authenticated using (firm_id = clara.jwt_firm());

grant select on clara.coa_templates          to clara_authenticated;
grant select on clara.coa_template_families  to clara_authenticated;
grant select on clara.coa_template_accounts  to clara_authenticated;
grant select on clara.coa_template_adoptions to clara_authenticated;

-- =====================================================================================
-- S4 -- THE CONTENT HASH AND THE SHARED EDIT GUARD (both ungranted).
-- =====================================================================================

-- Canonicalised over the family + account rows, ordered by key, so two publishes of identical
-- content are visibly identical (design D-2). The seed block below and publish_coa_template
-- BOTH go through this one body -- there is no second spelling of the canonical form.
create function clara._coa_template_content_sha256(p_template uuid) returns bytea
  language sql stable security definer set search_path = clara, pg_temp as $$
  select clara._hash(jsonb_build_object(
    'families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'family_key', f.family_key, 'label', f.label, 'inclusion', f.inclusion,
               'basis', f.basis, 'sort_ordinal', f.sort_ordinal,
               'msic_sections', to_jsonb(f.msic_sections),
               'msic_divisions', to_jsonb(f.msic_divisions),
               'msic_edition', f.msic_edition,
               'trade_natures', to_jsonb(f.trade_natures),
               'entity_types', to_jsonb(f.entity_types)) order by f.family_key)
        from clara.coa_template_families f where f.template_id = p_template), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code', a.account_code, 'name', a.name,
               'account_type', a.account_type, 'account_class', a.account_class,
               'special_acc_type', a.special_acc_type, 'family_key', a.family_key,
               'sort_ordinal', a.sort_ordinal,
               'tax_sensitive', a.tax_sensitive, 'add_back_class', a.add_back_class,
               'statutory', a.statutory) order by a.account_code)
        from clara.coa_template_accounts a where a.template_id = p_template), '[]'::jsonb)));
$$;
revoke all on function clara._coa_template_content_sha256(uuid) from public;

-- The shared "this is an editable firm draft of MINE" guard. One body, so the refusal ladder is
-- reviewed once (review law 1: this is judgement logic).
--   CLR11 template_not_found          -- absent, or another firm's. NO cross-firm existence
--                                        oracle: both look identical to the caller.
--   CLR10 platform_template_not_editable
--   CLR10 template_not_draft
-- VOLATILE, not STABLE, and the header is taken FOR UPDATE (HIGH-1). Both halves are
-- load-bearing: the row lock is what serialises an edit against a concurrent publish, and a
-- STABLE label on a body that takes a row lock is a lie to the planner about a function with a
-- side effect. Holding the lock for the caller's whole transaction is the point -- every editor
-- door calls this FIRST, so from that moment the header cannot change state underneath it, and
-- a publisher blocks until the editor commits or rolls back.
create function clara._coa_template_for_edit(p_template uuid, p_firm uuid)
  returns clara.coa_templates
  language plpgsql volatile security definer set search_path = clara, pg_temp as $$
declare t clara.coa_templates;
begin
  select * into t from clara.coa_templates where id = p_template for update;
  if not found or (t.scope = 'firm' and t.firm_id is distinct from p_firm) then
    raise exception 'template not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"template_not_found"}';
  end if;
  if t.scope = 'platform' then
    raise exception 'the platform starter template is authored by the migration ladder; fork it before editing'
      using errcode = 'CLR10', detail = '{"reason":"platform_template_not_editable"}';
  end if;
  if t.state <> 'draft' then
    raise exception 'template % version % is %, not a draft', t.template_key, t.version, t.state
      using errcode = 'CLR10', detail = '{"reason":"template_not_draft"}';
  end if;
  return t;
end $$;
revoke all on function clara._coa_template_for_edit(uuid,uuid) from public;

-- =====================================================================================
-- S5 -- THE DOORS. Admin floor on every writer (gate ruling Q3: SETTING the firm's standard is
-- a policy act). Guard-first order throughout: authz -> op_key -> reserve/dedupe -> target-in-
-- firm -> shape guards -> work + audit + finish.
-- =====================================================================================

-- S5.1 -- fork_coa_template. p_source NULL starts an empty firm draft (departures register (7));
-- a non-null source must be a PUBLISHED template this caller can see (the platform starter, or
-- one of their own firm's).
create function clara.fork_coa_template(p_source uuid, p_template_key text, p_title text,
    p_framework_hint text, p_basis text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; src clara.coa_templates; v_version int; v_id uuid;
  v_families int; v_accounts int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'fork_coa_template', p_op_key,
    clara._hash(jsonb_build_object('src', p_source, 'key', p_template_key, 'title', p_title,
      'fw', p_framework_hint, 'basis', p_basis)));
  if v_dedupe is not null then return v_dedupe; end if;

  if p_template_key is null or p_template_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'template_key must be a lower_snake identifier' using errcode = 'CLR10',
      detail = '{"reason":"bad_template_key"}';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'a template needs a title' using errcode = 'CLR10', detail = '{"reason":"title_required"}';
  end if;
  if p_framework_hint is null or p_framework_hint not in ('MPERS','MFRS','any') then
    raise exception 'framework_hint must be one of MPERS, MFRS, any' using errcode = 'CLR10',
      detail = '{"reason":"bad_framework_hint"}';
  end if;
  if p_basis is null or btrim(p_basis) = '' then
    raise exception 'a template needs a basis' using errcode = 'CLR10', detail = '{"reason":"basis_required"}';
  end if;

  if p_source is not null then
    select * into src from clara.coa_templates
     where id = p_source and (scope = 'platform' or firm_id = c.firm);
    if not found then
      raise exception 'template not found in your firm' using errcode = 'CLR11',
        detail = '{"reason":"template_not_found"}';
    end if;
    if src.state <> 'published' then
      raise exception 'only a published template may be forked' using errcode = 'CLR10',
        detail = '{"reason":"source_not_published"}';
    end if;
  end if;

  -- SERIALISE version allocation per (firm, template_key) -- 0059's own
  -- pg_advisory_xact_lock(hashtextextended(...)) idiom. Without it two concurrent forks of the
  -- same key both read the same max(version) and one loses to uq_coa_templates_firm_version with
  -- a bare 23505 that names nothing. The lock is transaction-scoped, so it releases with the
  -- door's own commit or rollback; a second admin simply waits and gets the next version.
  perform pg_advisory_xact_lock(hashtextextended(c.firm::text || ':' || p_template_key, 0));
  select coalesce(max(version), 0) + 1 into v_version from clara.coa_templates
   where scope = 'firm' and firm_id = c.firm and template_key = p_template_key;

  insert into clara.coa_templates(scope, firm_id, template_key, version, title,
      framework_hint, basis, state, forked_from, created_by)
    values ('firm', c.firm, p_template_key, v_version, p_title, p_framework_hint, p_basis,
      'draft', p_source, c.actor)
    returning id into v_id;

  if p_source is not null then
    insert into clara.coa_template_families(template_id, family_key, label, inclusion, basis,
        sort_ordinal, msic_sections, msic_divisions, msic_edition, trade_natures, entity_types)
      select v_id, f.family_key, f.label, f.inclusion, f.basis, f.sort_ordinal,
             f.msic_sections, f.msic_divisions, f.msic_edition, f.trade_natures, f.entity_types
        from clara.coa_template_families f where f.template_id = p_source;
    insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
        account_type, account_class, special_acc_type, sort_ordinal,
        tax_sensitive, add_back_class, statutory)
      select v_id, a.family_key, a.account_code, a.name, a.account_type, a.account_class,
             a.special_acc_type, a.sort_ordinal, a.tax_sensitive, a.add_back_class, a.statutory
        from clara.coa_template_accounts a where a.template_id = p_source;
  end if;

  select count(*) into v_families from clara.coa_template_families where template_id = v_id;
  select count(*) into v_accounts from clara.coa_template_accounts where template_id = v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'fork_coa_template', null,
    jsonb_build_object('template_id', v_id, 'source', p_source, 'template_key', p_template_key,
      'version', v_version, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'fork_coa_template', p_op_key,
    jsonb_build_object('template_id', v_id, 'template_key', p_template_key, 'version', v_version,
      'state', 'draft', 'families', v_families, 'accounts', v_accounts));
end $$;

-- S5.2 -- upsert_coa_template_family (editor door 1 of 4).
create function clara.upsert_coa_template_family(p_template uuid, p_family_key text,
    p_label text, p_inclusion text, p_basis text, p_sort_ordinal int,
    p_msic_sections text[], p_msic_divisions text[], p_msic_edition text,
    p_trade_natures text[], p_entity_types text[], p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; t clara.coa_templates;
  v_sections text[] := coalesce(p_msic_sections, '{}'::text[]);
  v_divisions text[] := coalesce(p_msic_divisions, '{}'::text[]);
  v_natures  text[] := coalesce(p_trade_natures, '{}'::text[]);
  v_entities text[] := coalesce(p_entity_types, '{}'::text[]);
  v_bad text;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'upsert_coa_template_family', p_op_key,
    clara._hash(jsonb_build_object('t', p_template, 'k', p_family_key, 'l', p_label,
      'i', p_inclusion, 'b', p_basis, 'o', p_sort_ordinal, 'ms', v_sections, 'md', v_divisions,
      'me', p_msic_edition, 'tn', v_natures, 'et', v_entities)));
  if v_dedupe is not null then return v_dedupe; end if;

  t := clara._coa_template_for_edit(p_template, c.firm);

  if p_family_key is null or p_family_key !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'family_key must be a lower_snake identifier' using errcode = 'CLR10',
      detail = '{"reason":"bad_family_key"}';
  end if;
  if p_label is null or btrim(p_label) = '' then
    raise exception 'a family needs a label' using errcode = 'CLR10', detail = '{"reason":"label_required"}';
  end if;
  if p_inclusion is null or p_inclusion not in ('core','by_industry','opt_in') then
    raise exception 'inclusion must be one of core, by_industry, opt_in' using errcode = 'CLR10',
      detail = '{"reason":"bad_inclusion"}';
  end if;
  -- D-13 item 1: a family that cannot say where it came from has established nothing.
  if p_basis is null or btrim(p_basis) = '' then
    raise exception 'a family needs a basis -- an MPERS paragraph, a statutory citation, or the words "firm practice"'
      using errcode = 'CLR10', detail = '{"reason":"basis_required"}';
  end if;
  if p_sort_ordinal is null then
    raise exception 'a family needs a sort_ordinal' using errcode = 'CLR10',
      detail = '{"reason":"sort_ordinal_required"}';
  end if;
  if p_inclusion = 'core' and (v_sections <> '{}' or v_divisions <> '{}'
                               or v_natures <> '{}' or v_entities <> '{}') then
    raise exception 'a core family applies unconditionally and carries no trim keys'
      using errcode = 'CLR10', detail = '{"reason":"core_family_keyed"}';
  end if;

  select string_agg(x, ', ') into v_bad from unnest(v_sections) x where x !~ '^[A-U]$';
  if v_bad is not null then
    raise exception 'msic_sections must be single MSIC section letters A-U; got %', v_bad
      using errcode = 'CLR10', detail = '{"reason":"bad_msic_section"}';
  end if;
  -- F5e / Q12: a trim rule keys on the SECTION or the DIVISION, never the 5-digit item -- the
  -- leaf is unstable across editions.
  select string_agg(x, ', ') into v_bad from unnest(v_divisions) x where x !~ '^[0-9]{2}$';
  if v_bad is not null then
    raise exception 'msic_divisions must be two-digit MSIC divisions; got %', v_bad
      using errcode = 'CLR10', detail = '{"reason":"bad_msic_division"}';
  end if;
  if p_msic_edition is not null and p_msic_edition not in ('MSIC 2008','MSIC 2025') then
    raise exception 'msic_edition must be MSIC 2008 or MSIC 2025' using errcode = 'CLR10',
      detail = '{"reason":"bad_msic_edition"}';
  end if;
  if (p_msic_edition is not null) <> (v_sections <> '{}' or v_divisions <> '{}') then
    raise exception 'an MSIC edition stamp is required exactly when the family carries an MSIC key, and forbidden otherwise'
      using errcode = 'CLR10', detail = '{"reason":"msic_edition_unpaired"}';
  end if;

  -- The vocabularies come from the LIVE clara.client_fact_keys catalog, never a DDL CHECK
  -- (departures register (4)).
  select string_agg(x, ', ') into v_bad from unnest(v_natures) x
   where not exists (select 1 from clara.client_fact_keys k
                      where k.fact_key = 'trade_nature' and k.allowed_values @> to_jsonb(x));
  if v_bad is not null then
    raise exception 'unknown trade_nature: %', v_bad using errcode = 'CLR10',
      detail = '{"reason":"unknown_trade_nature"}';
  end if;
  select string_agg(x, ', ') into v_bad from unnest(v_entities) x
   where not exists (select 1 from clara.client_fact_keys k
                      where k.fact_key = 'entity_type' and k.allowed_values @> to_jsonb(x));
  if v_bad is not null then
    raise exception 'unknown entity_type: %', v_bad using errcode = 'CLR10',
      detail = '{"reason":"unknown_entity_type"}';
  end if;

  insert into clara.coa_template_families(template_id, family_key, label, inclusion, basis,
      sort_ordinal, msic_sections, msic_divisions, msic_edition, trade_natures, entity_types)
    values (t.id, p_family_key, p_label, p_inclusion, p_basis, p_sort_ordinal,
      v_sections, v_divisions, p_msic_edition, v_natures, v_entities)
    on conflict (template_id, family_key) do update
      set label = excluded.label, inclusion = excluded.inclusion, basis = excluded.basis,
          sort_ordinal = excluded.sort_ordinal, msic_sections = excluded.msic_sections,
          msic_divisions = excluded.msic_divisions, msic_edition = excluded.msic_edition,
          trade_natures = excluded.trade_natures, entity_types = excluded.entity_types;

  perform clara._audit(c.firm, c.actor, null, null, 'upsert_coa_template_family', null,
    jsonb_build_object('template_id', t.id, 'family_key', p_family_key, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'upsert_coa_template_family', p_op_key,
    jsonb_build_object('template_id', t.id, 'family_key', p_family_key));
end $$;

-- S5.3 -- remove_coa_template_family (editor door 2 of 4). Takes its accounts with it.
create function clara.remove_coa_template_family(p_template uuid, p_family_key text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; t clara.coa_templates; v_accounts int;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'remove_coa_template_family', p_op_key,
    clara._hash(jsonb_build_object('t', p_template, 'k', p_family_key)));
  if v_dedupe is not null then return v_dedupe; end if;

  t := clara._coa_template_for_edit(p_template, c.firm);
  if not exists (select 1 from clara.coa_template_families
                  where template_id = t.id and family_key = p_family_key) then
    raise exception 'template carries no family named %', p_family_key using errcode = 'CLR10',
      detail = '{"reason":"unknown_family"}';
  end if;
  delete from clara.coa_template_accounts where template_id = t.id and family_key = p_family_key;
  get diagnostics v_accounts = row_count;
  delete from clara.coa_template_families where template_id = t.id and family_key = p_family_key;

  perform clara._audit(c.firm, c.actor, null, null, 'remove_coa_template_family', null,
    jsonb_build_object('template_id', t.id, 'family_key', p_family_key,
      'accounts_removed', v_accounts, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'remove_coa_template_family', p_op_key,
    jsonb_build_object('template_id', t.id, 'family_key', p_family_key, 'accounts_removed', v_accounts));
end $$;

-- S5.4 -- upsert_coa_template_account (editor door 3 of 4).
create function clara.upsert_coa_template_account(p_template uuid, p_family_key text,
    p_account_code text, p_name text, p_account_type text, p_account_class text,
    p_special_acc_type text, p_sort_ordinal int, p_tax_sensitive boolean,
    p_add_back_class text, p_statutory text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; t clara.coa_templates;
  v_tax boolean := coalesce(p_tax_sensitive, false);
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'upsert_coa_template_account', p_op_key,
    clara._hash(jsonb_build_object('t', p_template, 'f', p_family_key, 'c', p_account_code,
      'n', p_name, 'ty', p_account_type, 'cl', p_account_class, 's', p_special_acc_type,
      'o', p_sort_ordinal, 'tax', v_tax, 'ab', p_add_back_class, 'st', p_statutory)));
  if v_dedupe is not null then return v_dedupe; end if;

  t := clara._coa_template_for_edit(p_template, c.firm);
  if not exists (select 1 from clara.coa_template_families
                  where template_id = t.id and family_key = p_family_key) then
    raise exception 'template carries no family named %', p_family_key using errcode = 'CLR10',
      detail = '{"reason":"unknown_family"}';
  end if;
  -- The mirrored predicates, named so a refusal is diagnosable rather than a bare 23514.
  if p_account_code is null or p_account_code !~ '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$' then
    raise exception 'account_code must match the live coa_accounts code form' using errcode = 'CLR10',
      detail = '{"reason":"bad_account_code"}';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'an account needs a name' using errcode = 'CLR10', detail = '{"reason":"name_required"}';
  end if;
  if p_account_type is null or p_account_type not in ('asset','liability','equity','income','expense') then
    raise exception 'bad account_type' using errcode = 'CLR10', detail = '{"reason":"bad_account_type"}';
  end if;
  if p_account_class is not null and p_account_class not in ('payable','receivable') then
    raise exception 'bad account_class' using errcode = 'CLR10', detail = '{"reason":"bad_account_class"}';
  end if;
  if p_special_acc_type is not null and p_special_acc_type not in
     ('rounding','sst_output','sst_purchase_cost','opening_balance_equity','retained_earnings') then
    raise exception 'bad special_acc_type' using errcode = 'CLR10', detail = '{"reason":"bad_special_acc_type"}';
  end if;
  if (p_special_acc_type in ('opening_balance_equity','retained_earnings') and p_account_type <> 'equity')
     or (p_special_acc_type = 'sst_purchase_cost' and p_account_type <> 'expense') then
    raise exception 'special_acc_type % requires a different account_type', p_special_acc_type
      using errcode = 'CLR10', detail = '{"reason":"special_acc_type_type_mismatch"}';
  end if;
  if p_sort_ordinal is null then
    raise exception 'an account needs a sort_ordinal' using errcode = 'CLR10',
      detail = '{"reason":"sort_ordinal_required"}';
  end if;
  -- THE ANNOTATION HINTS. Named refusals so a bad leaf is diagnosable, and so the extend-only
  -- CHECK never surfaces as a bare 23514. The list here MIRRORS ck_coa_tmpl_add_back_class --
  -- the tail proves both are the same twelve, in both directions.
  if p_add_back_class is not null and p_add_back_class not in (
      'entertainment', 'donations_approved', 'donations_unapproved', 'fines_and_penalties',
      'depreciation_and_amortisation', 'leave_passage', 'private_and_proprietor_expenses',
      'motor_running_costs', 'club_subscriptions_and_entrance_fees', 'doubtful_debts_specific',
      'doubtful_debts_general', 'unapproved_provident_fund') then
    raise exception 'unknown add_back_class %; F-T3 owns the mapping, this template carries only the researched leaves', p_add_back_class
      using errcode = 'CLR10', detail = '{"reason":"bad_add_back_class"}';
  end if;
  if p_add_back_class is not null and not v_tax then
    raise exception 'an account naming an add_back_class is tax-sensitive by construction'
      using errcode = 'CLR10', detail = '{"reason":"add_back_class_not_tax_sensitive"}';
  end if;
  if p_statutory is not null and p_statutory !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'statutory must be a lower_snake regulator tag' using errcode = 'CLR10',
      detail = '{"reason":"bad_statutory_tag"}';
  end if;

  begin
    insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
        account_type, account_class, special_acc_type, sort_ordinal,
        tax_sensitive, add_back_class, statutory)
      values (t.id, p_family_key, p_account_code, p_name, p_account_type, p_account_class,
        p_special_acc_type, p_sort_ordinal, v_tax, p_add_back_class, p_statutory)
      on conflict (template_id, account_code) do update
        set family_key = excluded.family_key, name = excluded.name,
            account_type = excluded.account_type, account_class = excluded.account_class,
            special_acc_type = excluded.special_acc_type, sort_ordinal = excluded.sort_ordinal,
            tax_sensitive = excluded.tax_sensitive, add_back_class = excluded.add_back_class,
            statutory = excluded.statutory;
  exception when unique_violation then
    -- uq_coa_tmpl_special is the only unique left once the PK is handled by ON CONFLICT: the
    -- template already carries a row for this marker. Refusing HERE is what stops uq_coa_special
    -- from firing mid-loop at apply (Annex C cell 4).
    raise exception 'this template already carries an account for special_acc_type %', p_special_acc_type
      using errcode = 'CLR10', detail = '{"reason":"duplicate_special_acc_type"}';
  end;

  perform clara._audit(c.firm, c.actor, null, null, 'upsert_coa_template_account', null,
    jsonb_build_object('template_id', t.id, 'account_code', p_account_code, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'upsert_coa_template_account', p_op_key,
    jsonb_build_object('template_id', t.id, 'account_code', p_account_code));
end $$;

-- S5.5 -- remove_coa_template_account (editor door 4 of 4).
create function clara.remove_coa_template_account(p_template uuid, p_account_code text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; t clara.coa_templates;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'remove_coa_template_account', p_op_key,
    clara._hash(jsonb_build_object('t', p_template, 'c', p_account_code)));
  if v_dedupe is not null then return v_dedupe; end if;

  t := clara._coa_template_for_edit(p_template, c.firm);
  if not exists (select 1 from clara.coa_template_accounts
                  where template_id = t.id and account_code = p_account_code) then
    raise exception 'template carries no account with code %', p_account_code using errcode = 'CLR10',
      detail = '{"reason":"unknown_account_code"}';
  end if;
  delete from clara.coa_template_accounts where template_id = t.id and account_code = p_account_code;

  perform clara._audit(c.firm, c.actor, null, null, 'remove_coa_template_account', null,
    jsonb_build_object('template_id', t.id, 'account_code', p_account_code, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'remove_coa_template_account', p_op_key,
    jsonb_build_object('template_id', t.id, 'account_code', p_account_code));
end $$;

-- S5.6 -- publish_coa_template.
create function clara.publish_coa_template(p_template uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  c record; v_dedupe jsonb; t clara.coa_templates;
  v_families int; v_accounts int; v_empty text; v_sha bytea;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'publish_coa_template', p_op_key,
    clara._hash(jsonb_build_object('t', p_template)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- _coa_template_for_edit takes the header FOR UPDATE, so from here to COMMIT no editor can
  -- add, change or remove a family or an account on this template: their own doors block on the
  -- same row, and even a raw owner-level DML blocks on the child trigger's FOR SHARE. That is
  -- what makes the count / emptiness rungs / hash below a consistent read of ONE content state
  -- rather than three separate ones (HIGH-1).
  t := clara._coa_template_for_edit(p_template, c.firm);
  select count(*) into v_families from clara.coa_template_families where template_id = t.id;
  select count(*) into v_accounts from clara.coa_template_accounts where template_id = t.id;
  if v_families = 0 or v_accounts = 0 then
    raise exception 'a template with no families or no accounts cannot be published'
      using errcode = 'CLR10', detail = '{"reason":"template_empty"}';
  end if;
  -- A trim unit that plants nothing would be a checkbox with no effect on PR-b's keep/drop list.
  select string_agg(f.family_key, ', ' order by f.family_key) into v_empty
    from clara.coa_template_families f
   where f.template_id = t.id
     and not exists (select 1 from clara.coa_template_accounts a
                      where a.template_id = t.id and a.family_key = f.family_key);
  if v_empty is not null then
    raise exception 'these families carry no accounts: %', v_empty using errcode = 'CLR10',
      detail = '{"reason":"empty_family"}';
  end if;

  v_sha := clara._coa_template_content_sha256(t.id);
  update clara.coa_templates
     set state = 'published', published_by = c.actor, published_at = now(), content_sha256 = v_sha
   where id = t.id;

  perform clara._audit(c.firm, c.actor, null, null, 'publish_coa_template', null,
    jsonb_build_object('template_id', t.id, 'template_key', t.template_key, 'version', t.version,
      'content_sha256', encode(v_sha, 'hex'), 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'publish_coa_template', p_op_key,
    jsonb_build_object('template_id', t.id, 'state', 'published', 'families', v_families,
      'accounts', v_accounts, 'content_sha256', encode(v_sha, 'hex')));
end $$;

-- S5.7 -- retire_coa_template. Retiring is a STATE, never a delete (law 6). It has its own
-- lookup rather than _coa_template_for_edit's, because the state it admits is the opposite one.
create function clara.retire_coa_template(p_template uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; t clara.coa_templates;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10', detail = '{"reason":"op_key_required"}';
  end if;
  v_dedupe := clara._reserve_op(c.firm, 'retire_coa_template', p_op_key,
    clara._hash(jsonb_build_object('t', p_template)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- FOR UPDATE for the same reason publish takes it (HIGH-1): the state test below and the
  -- stamp that follows must see one header state, not two.
  select * into t from clara.coa_templates where id = p_template for update;
  if not found or (t.scope = 'firm' and t.firm_id is distinct from c.firm) then
    raise exception 'template not found in your firm' using errcode = 'CLR11',
      detail = '{"reason":"template_not_found"}';
  end if;
  if t.scope = 'platform' then
    raise exception 'the platform starter template is authored by the migration ladder and is never retired in-product'
      using errcode = 'CLR10', detail = '{"reason":"platform_template_not_editable"}';
  end if;
  if t.state <> 'published' then
    raise exception 'only a published template may be retired; this one is %', t.state
      using errcode = 'CLR10', detail = '{"reason":"template_not_published"}';
  end if;

  update clara.coa_templates set state = 'retired', retired_at = now() where id = t.id;
  perform clara._audit(c.firm, c.actor, null, null, 'retire_coa_template', null,
    jsonb_build_object('template_id', t.id, 'template_key', t.template_key, 'version', t.version,
      'op_key', p_op_key));
  return clara._finish_op(c.firm, 'retire_coa_template', p_op_key,
    jsonb_build_object('template_id', t.id, 'state', 'retired'));
end $$;

-- S5.8 -- THE READS. INVOKER-rights and STABLE, no definer wrapper -- the estate's own
-- trial_balance idiom (0004:730-739), so RLS decides who sees what and no new read surface is
-- invented. Departures register (6) states the floor honestly.
create function clara.list_coa_templates()
  returns table (template_id uuid, scope text, firm_id uuid, template_key text, version int,
                 title text, framework_hint text, basis text, state text,
                 content_sha256 text, forked_from uuid, created_at timestamptz,
                 published_at timestamptz, retired_at timestamptz,
                 families int, accounts int)
  language sql stable as $$
  select t.id, t.scope, t.firm_id, t.template_key, t.version, t.title, t.framework_hint,
         t.basis, t.state, encode(t.content_sha256, 'hex'), t.forked_from, t.created_at,
         t.published_at, t.retired_at,
         (select count(*)::int from clara.coa_template_families f where f.template_id = t.id),
         (select count(*)::int from clara.coa_template_accounts a where a.template_id = t.id)
    from clara.coa_templates t
   order by t.scope, t.template_key, t.version;
$$;

create function clara.get_coa_template(p_template uuid) returns jsonb
  language sql stable as $$
  select jsonb_build_object(
    'template_id', t.id, 'scope', t.scope, 'firm_id', t.firm_id,
    'template_key', t.template_key, 'version', t.version, 'title', t.title,
    'framework_hint', t.framework_hint, 'basis', t.basis, 'state', t.state,
    'content_sha256', encode(t.content_sha256, 'hex'), 'forked_from', t.forked_from,
    'created_at', t.created_at, 'published_at', t.published_at, 'retired_at', t.retired_at,
    'families', coalesce((
      select jsonb_agg(jsonb_build_object(
               'family_key', f.family_key, 'label', f.label, 'inclusion', f.inclusion,
               'basis', f.basis, 'sort_ordinal', f.sort_ordinal,
               'msic_sections', to_jsonb(f.msic_sections),
               'msic_divisions', to_jsonb(f.msic_divisions), 'msic_edition', f.msic_edition,
               'trade_natures', to_jsonb(f.trade_natures), 'entity_types', to_jsonb(f.entity_types))
             order by f.sort_ordinal, f.family_key)
        from clara.coa_template_families f where f.template_id = t.id), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'family_key', a.family_key, 'account_code', a.account_code, 'name', a.name,
               'account_type', a.account_type, 'account_class', a.account_class,
               'special_acc_type', a.special_acc_type, 'sort_ordinal', a.sort_ordinal,
               -- HINTS, surfaced as template CONTENT for the editor panel. A reader of this
               -- document may display them; nothing may treat add_back_class as a tax treatment.
               'tax_sensitive', a.tax_sensitive, 'add_back_class', a.add_back_class,
               'statutory', a.statutory)
             order by a.account_code)
        from clara.coa_template_accounts a where a.template_id = t.id), '[]'::jsonb))
  from clara.coa_templates t where t.id = p_template;
$$;

-- =====================================================================================
-- S6 -- THE EXECUTE MATRIX. Human doors reach clara_authenticated ONLY; the two internal
-- helpers and the two trigger functions reach NOBODY but their owner.
-- =====================================================================================
revoke all on function clara.fork_coa_template(uuid,text,text,text,text,text) from public;
revoke all on function clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text) from public;
revoke all on function clara.remove_coa_template_family(uuid,text,text) from public;
revoke all on function clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text) from public;
revoke all on function clara.remove_coa_template_account(uuid,text,text) from public;
revoke all on function clara.publish_coa_template(uuid,text) from public;
revoke all on function clara.retire_coa_template(uuid,text) from public;
revoke all on function clara.list_coa_templates() from public;
revoke all on function clara.get_coa_template(uuid) from public;

grant execute on function clara.fork_coa_template(uuid,text,text,text,text,text) to clara_authenticated;
grant execute on function clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text) to clara_authenticated;
grant execute on function clara.remove_coa_template_family(uuid,text,text) to clara_authenticated;
grant execute on function clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text) to clara_authenticated;
grant execute on function clara.remove_coa_template_account(uuid,text,text) to clara_authenticated;
grant execute on function clara.publish_coa_template(uuid,text) to clara_authenticated;
grant execute on function clara.retire_coa_template(uuid,text) to clara_authenticated;
grant execute on function clara.list_coa_templates() to clara_authenticated;
grant execute on function clara.get_coa_template(uuid) to clara_authenticated;

-- =====================================================================================
-- S7 -- THE PLATFORM STARTER SEED ROWS. Reviewed DATA in a migration, riding the full ADR-061
-- ladder line by line (D-13 item 3) -- never a one-click "import a chart" door, which 裁-21
-- forbids in its own words. Source: docs/plan/research/coa-template-2026-08-29.json, the
-- research lane the owner ruled must precede PR-0 and whose draft he WAIVED reviewing (Q1).
--
-- It goes in as a DRAFT and is published by the SAME predicate a firm's own fork is published
-- by -- through clara._coa_template_content_sha256 and past clara._tf_coa_template_freeze.
-- There is no seed-only back door.
-- =====================================================================================
do $seed$
declare
  v_id uuid; v_families int; v_accounts int; v_sha bytea;
begin
  insert into clara.coa_templates(scope, firm_id, template_key, version, title,
      framework_hint, basis, state)
    values ('platform', null, 'my_sme_starter', 1,
      'Malaysian SME Standard Chart of Accounts (starter)',
      'MPERS',
      'Research-derived, 2026-08-29 (裁-23 Q1; the owner waived his review of the draft). '
      || 'SPINE: MPERS (2016) paragraphs 4.2 (18 minimum statement-of-financial-position line '
      || 'items) and 5.5 (9 minimum statement-of-comprehensive-income line items), adopted '
      || 'word-for-word from IFRS-for-SMEs modules 04/05; MPERS (2025) is effective for annual '
      || 'periods beginning on or after 2027-01-01 and leaves both paragraphs unchanged in '
      || 'substance. CODES: 4-digit plain blocks by account_type, research-earned rather than '
      || 'inherited (裁-23 Q2 overruled both legacy conventions). INDUSTRY KEYS: MSIC 2008 '
      || 'sections and divisions only, never the 5-digit item, each family edition-stamped '
      || '(裁-23 Q12). TAX CUT: ten LHDN add-back classes carry their own families with their '
      || 'ITA 1967 / Public Ruling citations (裁-23 Q8). STATUTORY NAMES: mainstream Malaysian '
      || 'practice per the nine-product software catalog (裁-23 Q11). NO official Malaysian '
      || 'instrument is a chart of accounts -- LHDN prescribes none, MPERS prescribes minimum '
      || 'face line items only, and SSMxT_2022 is a CROSS-CHECK this template has NOT yet been '
      || 'diffed against (a named, open obligation). Full reasoning, URLs and fetch dates: '
      || 'docs/plan/research/coa-template-research-2026-08-29.md; machine-readable source: '
      || 'docs/plan/research/coa-template-2026-08-29.json.',
      'draft')
    returning id into v_id;

  -- THE 31 FAMILIES. `basis` is the research lane's own string, verbatim.
  insert into clara.coa_template_families(template_id, family_key, label, inclusion, basis,
      sort_ordinal, msic_sections, msic_divisions, trade_natures, entity_types, msic_edition)
  select v_id, x.family_key, x.label, x.inclusion, x.basis, x.sort_ordinal,
         x.msic_sections, x.msic_divisions, x.trade_natures, x.entity_types, x.msic_edition
    from (values
    ('cash_and_bank', 'Cash and Bank', 'core', 'MPERS 4.2(a)', 10, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('trade_receivables', 'Trade and Other Receivables', 'core', 'MPERS 4.2(b)', 20, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('trade_payables', 'Trade and Other Payables', 'core', 'MPERS 4.2(f)', 30, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('statutory_payables', 'Statutory Payables', 'core', 'firm practice, per the 2026-08-29 software-catalog research (coa-template-research-2026-08-29.md SS4) - MPERS 4.2(f) covers the balance-sheet placement, no PR prescribes the account names themselves', 40, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('equity_common', 'Retained Earnings', 'core', 'MPERS 4.2(q)', 50, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('revenue', 'Revenue', 'core', 'MPERS 5.5(a)', 60, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('employment_costs', 'Employment Costs', 'core', 'MPERS 5.5 (expense by nature)', 70, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('premises_and_admin', 'Premises and Administrative Expenses', 'core', 'MPERS 5.5 (expense by nature)', 80, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('finance_costs', 'Finance Costs', 'core', 'MPERS 5.5(b)', 90, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('system_roles', 'System Roles', 'core', 'firm practice - PRD S6 invariants 7 and 12; the estate''s own rounding/OBE/SST-purchase-cost markers', 100, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('inventory_and_cogs', 'Inventory and Cost of Sales', 'by_industry', 'MPERS 5.5 (expense by nature); cost-of-sales presentation', 110, '{}'::text[], '{}'::text[], array['goods_trading','mixed']::text[], '{}'::text[], null),
    ('manufacturing', 'Manufacturing', 'by_industry', 'firm practice, keyed to MSIC 2008 Section C (Manufacturing)', 120, array['C']::text[], array['10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33']::text[], array['goods_trading','mixed']::text[], '{}'::text[], 'MSIC 2008'),
    ('property_rental', 'Property Rental', 'by_industry', 'firm practice, keyed to MSIC 2008 Section L (Real Estate Activities); quit rent vs assessment are distinct Malaysian statutory charges (coa-template-research-2026-08-29.md SS6)', 130, array['L']::text[], array['68']::text[], '{}'::text[], '{}'::text[], 'MSIC 2008'),
    ('construction_contracts', 'Construction Contracts', 'by_industry', 'MFRS 15 / MPERS Section 23 contract-asset and contract-liability treatment; retention practice, keyed to MSIC 2008 Section F (Construction)', 140, array['F']::text[], array['41','42','43']::text[], '{}'::text[], '{}'::text[], 'MSIC 2008'),
    ('professional_services', 'Professional Services', 'by_industry', 'firm practice, keyed to MSIC 2008 Sections M (Professional, Scientific and Technical) and N (Administrative and Support Services); disbursement vs reimbursement distinction per LHDN e-Invoice guidance', 150, array['M','N']::text[], array['69','70','71','72','73','74','75','77','78','79','80','81','82']::text[], array['services','mixed']::text[], '{}'::text[], 'MSIC 2008'),
    ('fnb_hospitality', 'Food and Beverage / Hospitality', 'by_industry', 'firm practice, keyed to MSIC 2008 Section I (Accommodation and Food Service Activities); service charge is distinct from SST per RMCD''s own position (coa-template-research-2026-08-29.md SS6)', 160, array['I']::text[], array['55','56']::text[], '{}'::text[], '{}'::text[], 'MSIC 2008'),
    ('motor_vehicles', 'Motor Vehicles', 'opt_in', 'firm practice', 170, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('foreign_currency', 'Foreign Currency', 'opt_in', 'firm practice', 180, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('entertainment', 'Entertainment (Tax-Split)', 'opt_in', 'ITA 1967 s.39(1)(l)/s.18; PR 4/2015 - the partial-deduction restriction and its named full-deduction exceptions. The restriction rate and the exception list are F-T3''s effective-dated tables, never this row', 190, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('donations_approved', 'Donations - Approved Institutions (Tax-Split)', 'opt_in', 'ITA 1967 s.44(6) - deductible to the Government/State/local authority without cap, or to a DGIR-approved institution subject to the statutory ceiling on aggregate income. The ceiling itself is F-T3''s, never this row', 200, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('donations_unapproved', 'Donations - Unapproved / Non-Deductible (Tax-Split)', 'opt_in', 'ITA 1967 s.44(6) by omission - not within the approved mechanism, non-deductible', 210, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('fines_and_penalties', 'Fines and Penalties (Tax-Split)', 'opt_in', 'ITA 1967 s.39(1) read with s.33(1); case law (Aspac Lubricants (M) Sdn Bhd v KPHDN) - no dedicated Public Ruling', 220, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('depreciation_and_amortisation', 'Depreciation and Amortisation (Tax-Split)', 'opt_in', 'ITA 1967 s.39(1)(k) disallows book depreciation; s.19 + Schedule 3 substitute capital allowances; PR 12/2014, PR 6/2015', 230, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('leave_passage', 'Leave Passage (Tax-Split)', 'opt_in', 'ITA 1967 s.13(1)(b); PR 1/2003 - the fare portion is non-deductible to the employer; food/accommodation/incidentals are treated as entertainment instead', 240, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('private_and_proprietor_expenses', 'Private and Proprietor''s Expenses (Tax-Split)', 'opt_in', 'ITA 1967 s.39(1)(a) - domestic/private expenditure - no dedicated Public Ruling', 250, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('motor_running_costs', 'Motor Vehicle Running Costs (Tax-Split)', 'opt_in', 'ITA 1967 Schedule 3 Para 2/2A - the qualifying-expenditure cap for non-commercial vehicles; PR 6/2015; running-cost apportionment under s.33(1)/s.39(1)(a). The cap amounts are F-T3''s effective-dated tables, never this row', 260, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('club_subscriptions_and_entrance_fees', 'Club Subscriptions and Entrance Fees (Tax-Split)', 'opt_in', 'ITA 1967 s.39(1)(m) - standalone disallowance, distinct from the entertainment restriction in s.39(1)(l) - no dedicated Public Ruling', 270, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('doubtful_debts_and_provisions', 'Doubtful Debts and Unapproved Provisions (Tax-Split)', 'opt_in', 'ITA 1967 s.34(2); PR 4/2019 (replaces PR 1/2002) - a specific provision is deductible, a general provision is not; s.39(1)(c) for unapproved pension/provident fund contributions', 280, '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], null),
    ('equity_company', 'Equity - Company', 'opt_in', 'Companies Act 2016 s.74 (no-par-value regime, effective 2017-01-31); MPERS 4.11(f)/4.12', 290, '{}'::text[], '{}'::text[], '{}'::text[], array['sdn_bhd','bhd']::text[], null),
    ('equity_sole_prop', 'Equity - Sole Proprietorship', 'opt_in', 'firm practice per professional convention (ACCA FA2; IFRS for SMEs Module 4 worked examples) - no capital/current split for a sole proprietor, capital and drawings only. Hard constraint 13: a sole proprietor''s own account is EQUITY, never a staff advance.', 300, '{}'::text[], '{}'::text[], '{}'::text[], array['sole_prop']::text[], null),
    ('equity_partnership', 'Equity - Partnership', 'opt_in', 'firm practice per professional convention (ACCA FA2; IFRS for SMEs Module 4 S4.13) - capital and current accounts per partner; profit-sharing ratio governed by the Partnership Act 1961, not an accounting standard', 310, '{}'::text[], '{}'::text[], '{}'::text[], array['partnership','llp']::text[], null),
    -- THE TWO PROVISIONAL VARIANTS (conductor ruling under delegation, 2026-08-29; HIGH-2).
    -- clara.client_fact_keys' live entity_type enum admits EIGHT values, and the research
    -- covered five. The dossier NAMED the gap ("society and cooperative ... have no
    -- equity_variants entry ... a client recorded with entity_type=society|cooperative|other
    -- needs a manual equity build") and shipping the gap unchanged would leave a client whose
    -- entity type the product ADMITS with no equity section at all -- the trim would hand them
    -- retained earnings and nothing else. These two families close the coverage; their content
    -- is deliberately minimal and their basis says so IN THE ROW rather than in a comment, so a
    -- reader of the data -- not just of this file -- knows an owner review is owed. The tail
    -- proves coverage against the LIVE enum, so a ninth entity type widens the enum and reds
    -- this migration''s own successor rather than silently uncovering a client.
    ('equity_society_cooperative', 'Equity - Society or Cooperative (Provisional)', 'opt_in', 'not researched - provisional; owner review owed. Placed to close the entity_type coverage the 2026-08-29 research dossier itself named as a gap (SS7 item 8). Societies Act 1966 / Co-operative Societies Act 1993 govern these entities'' funds, and neither was read by that dossier', 320, '{}'::text[], '{}'::text[], '{}'::text[], array['society','cooperative']::text[], null),
    ('equity_other', 'Equity - Other Entity Type (Provisional)', 'opt_in', 'not researched - provisional; owner review owed. Placed to close the entity_type coverage the 2026-08-29 research dossier itself named as a gap (SS7 item 8). entity_type=other is by construction unenumerated, so no single instrument governs it and the firm authors the real section on first use', 330, '{}'::text[], '{}'::text[], '{}'::text[], array['other']::text[], null)
    ) as x(family_key, label, inclusion, basis, sort_ordinal, msic_sections, msic_divisions,
           trade_natures, entity_types, msic_edition);

  -- THE 100 ACCOUNTS. 1xxx asset · 2xxx liability · 3xxx equity · 4xxx income ·
  -- 5xxx cost of sales · 6xxx operating expense · 9xxx system roles (the 5000 block keeps
  -- account_type='expense' -- the numbering distinction is presentational, and the live
  -- account_type CHECK admits no sixth member). 1020/1030/1050 land is_bank_account=false at
  -- apply like every other row: the asset-typed/active/non-control law is enforced by the
  -- add_bank_account VERB in-txn, never at template apply (0038:248-252, Annex E).
  insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
      account_type, account_class, special_acc_type, sort_ordinal,
      tax_sensitive, add_back_class, statutory)
  select v_id, y.family_key, y.account_code, y.name, y.account_type, y.account_class,
         y.special_acc_type, y.sort_ordinal,
         -- tax_sensitive is DERIVED from the annotation block, never keyed a second time: the
         -- research's own data satisfies the biconditional exactly (measured, all 100 rows), and
         -- deriving it here means the two can never disagree on a later edit of this file.
         h.add_back_class is not null,
         h.add_back_class, h.statutory
    from (values
    ('cash_and_bank', '1000', 'Cash on Hand', 'asset', null, null, 10),
    ('cash_and_bank', '1010', 'Petty Cash', 'asset', null, null, 20),
    ('cash_and_bank', '1020', 'Bank Current Account', 'asset', null, null, 30),
    ('cash_and_bank', '1030', 'Bank Savings Account', 'asset', null, null, 40),
    ('cash_and_bank', '1040', 'Fixed / Time Deposit', 'asset', null, null, 50),
    ('trade_receivables', '1100', 'Trade Receivables Control', 'asset', 'receivable', null, 10),
    ('trade_receivables', '1110', 'Other Receivables', 'asset', null, null, 20),
    ('trade_receivables', '1120', 'Deposits Paid', 'asset', null, null, 30),
    ('trade_receivables', '1130', 'Prepayments', 'asset', null, null, 40),
    ('trade_receivables', '1190', 'Allowance for Doubtful Debts', 'asset', null, null, 50),
    ('trade_payables', '2000', 'Trade Payables Control', 'liability', 'payable', null, 10),
    ('trade_payables', '2010', 'Other Payables', 'liability', null, null, 20),
    ('trade_payables', '2020', 'Accruals', 'liability', null, null, 30),
    ('statutory_payables', '2100', 'EPF (KWSP) Payable', 'liability', null, null, 10),
    ('statutory_payables', '2110', 'SOCSO (PERKESO) Payable', 'liability', null, null, 20),
    ('statutory_payables', '2120', 'EIS (SIP) Payable', 'liability', null, null, 30),
    ('statutory_payables', '2130', 'PCB (MTD) Payable', 'liability', null, null, 40),
    ('statutory_payables', '2140', 'HRDF (HRD Corp) Levy Payable', 'liability', null, null, 50),
    ('statutory_payables', '2150', 'SST Output Tax Payable', 'liability', null, 'sst_output', 60),
    ('equity_common', '3900', 'Retained Earnings', 'equity', null, 'retained_earnings', 10),
    ('revenue', '4000', 'Sales / Fees Income', 'income', null, null, 10),
    ('revenue', '4010', 'Other Operating Income', 'income', null, null, 20),
    ('revenue', '4900', 'Other Income (Non-Operating)', 'income', null, null, 30),
    ('employment_costs', '6000', 'Salaries and Wages', 'expense', null, null, 10),
    ('employment_costs', '6010', 'EPF Contribution (Employer)', 'expense', null, null, 20),
    ('employment_costs', '6020', 'SOCSO Contribution (Employer)', 'expense', null, null, 30),
    ('employment_costs', '6030', 'EIS Contribution (Employer)', 'expense', null, null, 40),
    ('employment_costs', '6040', 'HRDF (HRD Corp) Levy Expense', 'expense', null, null, 50),
    ('employment_costs', '6050', 'Bonus and Incentives', 'expense', null, null, 60),
    ('employment_costs', '6060', 'Staff Welfare and Training (incl. exempt medical/dental BIK)', 'expense', null, null, 70),
    ('premises_and_admin', '6100', 'Rental of Premises', 'expense', null, null, 10),
    ('premises_and_admin', '6110', 'Utilities (Electricity and Water)', 'expense', null, null, 20),
    ('premises_and_admin', '6120', 'Telephone and Internet', 'expense', null, null, 30),
    ('premises_and_admin', '6130', 'Insurance (General)', 'expense', null, null, 40),
    ('premises_and_admin', '6140', 'Printing, Stationery and Postage', 'expense', null, null, 50),
    ('premises_and_admin', '6150', 'Professional Fees (Legal, Accounting, Secretarial)', 'expense', null, null, 60),
    ('premises_and_admin', '6160', 'Repairs and Maintenance', 'expense', null, null, 70),
    ('premises_and_admin', '6170', 'General Administrative Expenses', 'expense', null, null, 80),
    ('finance_costs', '6800', 'Bank Charges', 'expense', null, null, 10),
    ('finance_costs', '6810', 'Interest Expense', 'expense', null, null, 20),
    ('finance_costs', '6820', 'Realised Foreign Exchange Gain / Loss', 'expense', null, null, 30),
    ('finance_costs', '6830', 'Unrealised Foreign Exchange Gain / Loss', 'expense', null, null, 40),
    ('system_roles', '9900', 'Opening Balance Equity', 'equity', null, 'opening_balance_equity', 10),
    ('system_roles', '9910', 'Rounding', 'expense', null, 'rounding', 20),
    ('system_roles', '9920', 'SST Purchase Cost', 'expense', null, 'sst_purchase_cost', 30),
    ('inventory_and_cogs', '1200', 'Inventory / Stock', 'asset', null, null, 10),
    ('inventory_and_cogs', '5000', 'Purchases', 'expense', null, null, 20),
    ('inventory_and_cogs', '5010', 'Carriage Inwards', 'expense', null, null, 30),
    ('inventory_and_cogs', '5020', 'Opening Stock', 'expense', null, null, 40),
    ('inventory_and_cogs', '5030', 'Closing Stock', 'expense', null, null, 50),
    ('inventory_and_cogs', '5040', 'Cost of Sales', 'expense', null, null, 60),
    ('manufacturing', '1210', 'Raw Materials Inventory', 'asset', null, null, 10),
    ('manufacturing', '1220', 'Work-in-Progress Inventory', 'asset', null, null, 20),
    ('manufacturing', '1230', 'Finished Goods Inventory', 'asset', null, null, 30),
    ('manufacturing', '5100', 'Direct Labour', 'expense', null, null, 40),
    ('manufacturing', '5110', 'Factory Overheads', 'expense', null, null, 50),
    ('manufacturing', '5120', 'Factory Rental and Utilities', 'expense', null, null, 60),
    ('property_rental', '4100', 'Rental Income', 'income', null, null, 10),
    ('property_rental', '6200', 'Quit Rent (Cukai Tanah)', 'expense', null, null, 20),
    ('property_rental', '6210', 'Assessment (Cukai Pintu / Taksiran)', 'expense', null, null, 30),
    ('property_rental', '6220', 'Property Maintenance and Sinking Fund', 'expense', null, null, 40),
    ('property_rental', '6230', 'Letting Agent Commission', 'expense', null, null, 50),
    ('construction_contracts', '1300', 'Contract Assets (Amount Due from Customers)', 'asset', null, null, 10),
    ('construction_contracts', '1310', 'Retention Receivable', 'asset', null, null, 20),
    ('construction_contracts', '2200', 'Contract Liabilities (Amount Due to Customers)', 'liability', null, null, 30),
    ('construction_contracts', '2210', 'Retention Payable', 'liability', null, null, 40),
    ('construction_contracts', '4200', 'Construction Contract Revenue', 'income', null, null, 50),
    ('construction_contracts', '5200', 'Subcontractor Costs', 'expense', null, null, 60),
    ('professional_services', '4300', 'Fee Income by Service Line', 'income', null, null, 10),
    ('professional_services', '1320', 'Unbilled Receivables (Work-in-Progress)', 'asset', null, null, 20),
    ('professional_services', '1330', 'Disbursements Recoverable', 'asset', null, null, 30),
    ('professional_services', '5300', 'Subcontracted Professional Fees', 'expense', null, null, 40),
    ('fnb_hospitality', '4400', 'Food and Beverage Sales', 'income', null, null, 10),
    ('fnb_hospitality', '5400', 'Food Cost', 'expense', null, null, 20),
    ('fnb_hospitality', '5410', 'Beverage Cost', 'expense', null, null, 30),
    ('fnb_hospitality', '2300', 'Service Charge Payable', 'liability', null, null, 40),
    ('motor_vehicles', '1400', 'Motor Vehicles at Cost', 'asset', null, null, 10),
    ('motor_vehicles', '1410', 'Accumulated Depreciation - Motor Vehicles', 'asset', null, null, 20),
    ('motor_vehicles', '6300', 'Road Tax and Insurance - Motor Vehicles', 'expense', null, null, 30),
    ('foreign_currency', '1050', 'Foreign Currency Bank Account', 'asset', null, null, 10),
    ('entertainment', '6400', 'Entertainment Expenses', 'expense', null, null, 10),
    ('donations_approved', '6410', 'Donations - Approved Institutions', 'expense', null, null, 10),
    ('donations_unapproved', '6420', 'Donations - Unapproved / Non-Deductible', 'expense', null, null, 10),
    ('fines_and_penalties', '6430', 'Fines and Penalties', 'expense', null, null, 10),
    ('depreciation_and_amortisation', '6440', 'Depreciation and Amortisation', 'expense', null, null, 10),
    ('leave_passage', '6450', 'Leave Passage', 'expense', null, null, 10),
    ('private_and_proprietor_expenses', '6460', 'Private and Proprietor''s Expenses', 'expense', null, null, 10),
    ('motor_running_costs', '6470', 'Motor Vehicle Running Costs', 'expense', null, null, 10),
    ('club_subscriptions_and_entrance_fees', '6480', 'Club Subscriptions and Entrance Fees', 'expense', null, null, 10),
    ('doubtful_debts_and_provisions', '6490', 'Provision for Doubtful Debts - Specific', 'expense', null, null, 10),
    ('doubtful_debts_and_provisions', '6491', 'Provision for Doubtful Debts - General', 'expense', null, null, 20),
    ('doubtful_debts_and_provisions', '6492', 'Unapproved Pension / Provident Fund Contributions', 'expense', null, null, 30),
    ('equity_company', '3000', 'Share Capital', 'equity', null, null, 10),
    ('equity_company', '3100', 'Reserves (Other)', 'equity', null, null, 20),
    ('equity_company', '3800', 'Dividends Paid', 'equity', null, null, 30),
    ('equity_sole_prop', '3010', 'Proprietor''s Capital Account', 'equity', null, null, 10),
    ('equity_sole_prop', '3810', 'Proprietor''s Drawings', 'equity', null, null, 20),
    ('equity_partnership', '3020', 'Partners'' Capital Accounts', 'equity', null, null, 10),
    ('equity_partnership', '3030', 'Partners'' Current Accounts', 'equity', null, null, 20),
    ('equity_partnership', '3820', 'Partners'' Drawings', 'equity', null, null, 30),
    -- The two provisional variants' one account each (HIGH-2). Neither carries a
    -- special_acc_type: 3900 already holds retained_earnings, and uq_coa_tmpl_special admits
    -- exactly one row per marker per template -- these are ordinary equity lines a firm renames.
    ('equity_society_cooperative', '3040', 'Accumulated Funds', 'equity', null, null, 10),
    ('equity_other', '3050', 'Capital / Retained Earnings (Other Entity Type)', 'equity', null, null, 10)
    ) as y(family_key, account_code, name, account_type, account_class, special_acc_type, sort_ordinal)
    -- ================================================================================
    -- THE ANNOTATION BLOCK -- 23 rows, kept as its own reviewable list because this is the
    -- part the conductor's 2026-08-29 F-T3 cross-reference ruling governs. These are
    -- CITATION-BACKED HINTS, never treatment facts. The twelve add-back leaves are VERBATIM
    -- as docs/plan/research/coa-template-2026-08-29.json spells them -- F-T3 owns the mapping
    -- to its own ADDBACK_* vocabulary, and nothing in this train reads add_back_class as an
    -- authority for a tax treatment. The eleven statutory tags name the regulator an account
    -- settles against; F-T1/F-T2 contribute their own later.
    -- ================================================================================
    left join (values
    ('2100', null, 'epf'),                                        -- EPF (KWSP) Payable
    ('2110', null, 'socso'),                                      -- SOCSO (PERKESO) Payable
    ('2120', null, 'eis'),                                        -- EIS (SIP) Payable
    ('2130', null, 'pcb_mtd'),                                    -- PCB (MTD) Payable
    ('2140', null, 'hrdf'),                                       -- HRDF (HRD Corp) Levy Payable
    ('2150', null, 'sst_output'),                                 -- SST Output Tax Payable
    ('6010', null, 'epf'),                                        -- EPF Contribution (Employer)
    ('6020', null, 'socso'),                                      -- SOCSO Contribution (Employer)
    ('6030', null, 'eis'),                                        -- EIS Contribution (Employer)
    ('6040', null, 'hrdf'),                                       -- HRDF (HRD Corp) Levy Expense
    ('9920', null, 'sst_input'),                                  -- SST Purchase Cost
    ('6400', 'entertainment', null),                              -- ITA 1967 s.39(1)(l)/s.18; PR 4/2015
    ('6410', 'donations_approved', null),                         -- ITA 1967 s.44(6), approved institution
    ('6420', 'donations_unapproved', null),                       -- ITA 1967 s.44(6) by omission
    ('6430', 'fines_and_penalties', null),                        -- ITA 1967 s.39(1) with s.33(1)
    ('6440', 'depreciation_and_amortisation', null),              -- ITA 1967 s.39(1)(k); s.19 + Sch 3
    ('6450', 'leave_passage', null),                              -- ITA 1967 s.13(1)(b); PR 1/2003
    ('6460', 'private_and_proprietor_expenses', null),            -- ITA 1967 s.39(1)(a)
    ('6470', 'motor_running_costs', null),                        -- ITA 1967 Sch 3 Para 2/2A; PR 6/2015
    ('6480', 'club_subscriptions_and_entrance_fees', null),       -- ITA 1967 s.39(1)(m)
    ('6490', 'doubtful_debts_specific', null),                    -- ITA 1967 s.34(2); PR 4/2019
    ('6491', 'doubtful_debts_general', null),                     -- ITA 1967 s.34(2), general = non-deductible
    ('6492', 'unapproved_provident_fund', null)                   -- ITA 1967 s.39(1)(c)
    ) as h(account_code, add_back_class, statutory) on h.account_code = y.account_code;

  select count(*) into v_families from clara.coa_template_families where template_id = v_id;
  select count(*) into v_accounts from clara.coa_template_accounts where template_id = v_id;
  if v_families <> 33 or v_accounts <> 102 then
    raise exception 'S7: seeded % families and % accounts, expected 33 and 102', v_families, v_accounts
      using errcode = 'CLR10';
  end if;

  v_sha := clara._coa_template_content_sha256(v_id);
  update clara.coa_templates
     set state = 'published', published_at = now(), content_sha256 = v_sha
   where id = v_id;

  raise notice 'coa-template PR-a seed: platform starter my_sme_starter v1 PUBLISHED -- % families (31 research + 2 provisional equity), % accounts, content_sha256 %',
    v_families, v_accounts, encode(v_sha, 'hex');
end $seed$;

reset role;

-- =====================================================================================
-- S8 -- TAIL SELF-PROOF. Every claim re-READ from the live catalog, never taken from this
-- file's own say-so. Raises on failure.
-- =====================================================================================
do $s8$
declare
  v_n int; v_m int; v_bad text; v_txt text; v_txt2 text; r record;
  v_tmpl uuid; v_sha bytea; v_cols text[]; v_cons text[]; v_trig text[];
begin
  -- (1) The four relations exist, are owned by clara_fn_owner, and carry forced RLS.
  for r in select x from unnest(array['coa_templates','coa_template_families',
      'coa_template_accounts','coa_template_adoptions']) x loop
    if to_regclass('clara.' || r.x) is null then
      raise exception 'S8: clara.% does not exist after S1', r.x using errcode = 'CLR10';
    end if;
    if (select pg_get_userbyid(c.relowner) from pg_class c
         where c.oid = ('clara.' || r.x)::regclass) <> 'clara_fn_owner' then
      raise exception 'S8: clara.% is not owned by clara_fn_owner', r.x using errcode = 'CLR10';
    end if;
    if not exists (select 1 from pg_class c where c.oid = ('clara.' || r.x)::regclass
                     and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'S8: clara.% does not carry ENABLE + FORCE row level security', r.x
        using errcode = 'CLR10';
    end if;
    -- Exactly the owner policy and the scoped human read -- a policy pair, no third policy.
    select count(*) into v_n from pg_policies where schemaname = 'clara' and tablename = r.x;
    if v_n <> 2 then
      raise exception 'S8: clara.% carries % policies, expected exactly 2 (owner + scoped human read)', r.x, v_n
        using errcode = 'CLR10';
    end if;
    if not exists (select 1 from pg_policies where schemaname='clara' and tablename=r.x
                     and policyname = 'p_' || r.x || '_owner'
                     and roles = array['clara_fn_owner']::name[]
                     and cmd = 'ALL' and qual = 'true' and with_check = 'true') then
      raise exception 'S8: clara.%''s owner policy is missing or does not carry the expected role/qual/with_check shape', r.x
        using errcode = 'CLR10';
    end if;
    if not exists (select 1 from pg_policies where schemaname='clara' and tablename=r.x
                     and policyname = 'p_' || r.x || '_human'
                     and roles = array['clara_authenticated']::name[]
                     and cmd = 'SELECT' and with_check is null) then
      raise exception 'S8: clara.%''s human policy is missing, not SELECT-only, or not clara_authenticated-scoped', r.x
        using errcode = 'CLR10';
    end if;
    -- The ACL closed world: clara_authenticated holds SELECT and nothing else; no other app
    -- role reaches the table at all.
    select string_agg(g.grantee::regrole::text || ':' || g.privilege_type, ', '
             order by g.grantee::regrole::text, g.privilege_type) into v_txt
      from pg_class c, aclexplode(c.relacl) g where c.oid = ('clara.' || r.x)::regclass
       and g.grantee::regrole::text <> 'clara_fn_owner';
    if v_txt is distinct from 'clara_authenticated:SELECT' then
      raise exception 'S8: clara.% has non-owner reach %, expected exactly clara_authenticated:SELECT', r.x, coalesce(v_txt, '<none>')
        using errcode = 'CLR10';
    end if;
    select string_agg(x.role || ':' || x.priv, ', ') into v_bad
      from (values ('clara_agent_ro','select'),('clara_freeform_ro','select'),
                   ('clara_runtime','select'),('clara_wake_interactive','select'),
                   ('clara_wake_bank','select'),('clara_wake_proactive','select'),
                   ('clara_wake_filing','select')) x(role, priv)
     where has_table_privilege(x.role, 'clara.' || r.x, x.priv);
    if v_bad is not null then
      raise exception 'S8: unexpected agent/wake/runtime reach on clara.% -- %', r.x, v_bad using errcode = 'CLR10';
    end if;
  end loop;

  -- (2) The scoped read predicates, by TEXT -- R-L26's explicit scope, never a NULL inference.
  select qual into v_txt from pg_policies
   where schemaname='clara' and tablename='coa_templates' and policyname='p_coa_templates_human';
  if v_txt is distinct from '((scope = ''platform''::text) OR (firm_id = clara.jwt_firm()))' then
    raise exception 'S8: p_coa_templates_human''s predicate is %, not the explicit-scope form', v_txt
      using errcode = 'CLR10';
  end if;
  if position('firm_id IS NULL' in v_txt) > 0 then
    raise exception 'S8: p_coa_templates_human infers platform from a NULL -- the shape R-L26 forbids'
      using errcode = 'CLR10';
  end if;
  for r in select x from unnest(array['coa_template_families','coa_template_accounts']) x loop
    select qual into v_txt from pg_policies
     where schemaname='clara' and tablename=r.x and policyname='p_' || r.x || '_human';
    if position('scope = ''platform''::text' in v_txt) = 0
       or position('clara.jwt_firm()' in v_txt) = 0
       or position('coa_templates' in v_txt) = 0 then
      raise exception 'S8: p_%_human does not derive scope+firm from the parent template: %', r.x, v_txt
        using errcode = 'CLR10';
    end if;
  end loop;
  select qual into v_txt from pg_policies where schemaname='clara'
    and tablename='coa_template_adoptions' and policyname='p_coa_template_adoptions_human';
  if v_txt is distinct from '(firm_id = clara.jwt_firm())' then
    raise exception 'S8: p_coa_template_adoptions_human''s predicate is %, not the firm-scoped form', v_txt
      using errcode = 'CLR10';
  end if;

  -- (3) THE MIRROR DRIFT-GUARD, re-read AFTER the build: all seven predicate texts on
  --     coa_template_accounts are byte-equal to coa_accounts' own, modulo nothing.
  for r in select * from (values
      ('ck_coa_account_code_0009',            'ck_coa_tmpl_code'),
      ('coa_accounts_account_type_check',     'ck_coa_tmpl_type'),
      ('ck_coa_account_class',                'ck_coa_tmpl_class'),
      ('coa_accounts_special_acc_type_check', 'ck_coa_tmpl_special'),
      ('ck_coa_obe_equity',                   'ck_coa_tmpl_obe'),
      ('ck_coa_retained_earnings_equity',     'ck_coa_tmpl_re'),
      ('ck_coa_sst_purchase_cost_expense',    'ck_coa_tmpl_sst')) as t(live, mirror) loop
    select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
     where con.conrelid = 'clara.coa_accounts'::regclass and con.conname = r.live;
    select pg_get_constraintdef(con.oid) into v_txt2 from pg_constraint con
     where con.conrelid = 'clara.coa_template_accounts'::regclass and con.conname = r.mirror;
    if v_txt is null or v_txt2 is null or v_txt <> v_txt2 then
      raise exception 'S8: mirror % does not reproduce live % -- % vs %', r.mirror, r.live,
        coalesce(v_txt2, '<absent>'), coalesce(v_txt, '<absent>') using errcode = 'CLR10';
    end if;
  end loop;

  -- (4) The partial uniques, asserted by PROPERTY (unique + valid + ready + exact key +
  --     predicate), never by name alone.
  for r in select * from (values
      ('uq_coa_tmpl_special',              'clara.coa_template_accounts'),
      ('uq_coa_adoption_live',             'clara.coa_template_adoptions'),
      ('uq_coa_adoption_open',             'clara.coa_template_adoptions'),
      ('uq_coa_templates_firm_version',    'clara.coa_templates'),
      ('uq_coa_templates_platform_version','clara.coa_templates')) as t(idx, rel) loop
    if not exists (select 1 from pg_index x join pg_class i on i.oid = x.indexrelid
                    where i.relname = r.idx and x.indrelid = r.rel::regclass
                      and x.indisunique and x.indisvalid and x.indisready
                      and x.indpred is not null) then
      raise exception 'S8: % is missing, not a valid partial UNIQUE, or not on %', r.idx, r.rel
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (5) The trigger census -- by name, per table.
  select coalesce(array_agg(t.tgname order by t.tgname), '{}') into v_trig from pg_trigger t
   where t.tgrelid = 'clara.coa_templates'::regclass and not t.tgisinternal;
  if v_trig <> array['t_coa_templates_freeze','t_coa_templates_no_truncate'] then
    raise exception 'S8: coa_templates trigger census mismatch -- got %', v_trig using errcode = 'CLR10';
  end if;
  for r in select x from unnest(array['coa_template_families','coa_template_accounts']) x loop
    select coalesce(array_agg(t.tgname order by t.tgname), '{}') into v_trig from pg_trigger t
     where t.tgrelid = ('clara.' || r.x)::regclass and not t.tgisinternal;
    if v_trig <> array['t_' || r.x || '_freeze', 't_' || r.x || '_no_truncate'] then
      raise exception 'S8: % trigger census mismatch -- got %', r.x, v_trig using errcode = 'CLR10';
    end if;
  end loop;
  select coalesce(array_agg(t.tgname order by t.tgname), '{}') into v_trig from pg_trigger t
   where t.tgrelid = 'clara.coa_template_adoptions'::regclass and not t.tgisinternal;
  if v_trig <> array['t_coa_adoption_template_congruent','t_coa_template_adoptions_no_truncate'] then
    raise exception 'S8: coa_template_adoptions trigger census mismatch -- got %', v_trig using errcode = 'CLR10';
  end if;
  -- MED-2: the composite FK and its unique target, asserted by DEFINITION rather than by name.
  if not exists (
    select 1 from pg_constraint con
     where con.conrelid = 'clara.coa_template_adoptions'::regclass
       and con.conname = 'fk_coa_adoption_template'
       and pg_get_constraintdef(con.oid) =
           'FOREIGN KEY (template_id, template_version) REFERENCES clara.coa_templates(id, version)') then
    raise exception 'S8: fk_coa_adoption_template is not the COMPOSITE (template_id, template_version) reference'
      using errcode = 'CLR10';
  end if;
  if not exists (
    select 1 from pg_constraint con
     where con.conrelid = 'clara.coa_templates'::regclass
       and con.conname = 'uq_coa_templates_id_version'
       and pg_get_constraintdef(con.oid) = 'UNIQUE (id, version)') then
    raise exception 'S8: uq_coa_templates_id_version is missing or not UNIQUE (id, version)'
      using errcode = 'CLR10';
  end if;

  -- (6) THE EXECUTE MATRIX: seven writers + two reads reach clara_authenticated ONLY; the two
  --     helpers and the two trigger functions reach nobody but the owner; PUBLIC nowhere.
  for r in select x from unnest(array[
      'clara.fork_coa_template(uuid,text,text,text,text,text)',
      'clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text)',
      'clara.remove_coa_template_family(uuid,text,text)',
      'clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text)',
      'clara.remove_coa_template_account(uuid,text,text)',
      'clara.publish_coa_template(uuid,text)',
      'clara.retire_coa_template(uuid,text)',
      'clara.list_coa_templates()',
      'clara.get_coa_template(uuid)']) x loop
    if to_regprocedure(r.x) is null then
      raise exception 'S8: door % does not resolve at its pinned signature', r.x using errcode = 'CLR10';
    end if;
    select string_agg(g.grantee::regrole::text, ',' order by g.grantee::regrole::text) into v_txt
      from pg_proc p, aclexplode(p.proacl) g
     where p.oid = to_regprocedure(r.x) and g.privilege_type = 'EXECUTE';
    if v_txt is distinct from 'clara_authenticated,clara_fn_owner' then
      raise exception 'S8: %''s EXECUTE grantees are %, expected clara_authenticated,clara_fn_owner', r.x, coalesce(v_txt,'<none>')
        using errcode = 'CLR10';
    end if;
    if has_function_privilege('public', r.x, 'execute') then
      raise exception 'S8: PUBLIC can EXECUTE % -- the revoke did not take', r.x using errcode = 'CLR10';
    end if;
  end loop;
  for r in select x from unnest(array[
      'clara._coa_template_content_sha256(uuid)',
      'clara._coa_template_for_edit(uuid,uuid)',
      'clara._tf_coa_template_freeze()',
      'clara._tf_coa_template_child_freeze()',
      'clara._tf_coa_adoption_template_congruent()']) x loop
    if to_regprocedure(r.x) is null then
      raise exception 'S8: internal % does not resolve', r.x using errcode = 'CLR10';
    end if;
    select string_agg(x2.role, ', ') into v_bad from unnest(array[
        'clara_authenticated','clara_agent_ro','clara_freeform_ro','clara_runtime',
        'clara_wake_interactive','clara_wake_bank','clara_wake_proactive','clara_wake_filing']) x2(role)
     where has_function_privilege(x2.role, r.x, 'execute');
    if v_bad is not null then
      raise exception 'S8: internal % is reachable by % -- it must reach nobody but its owner', r.x, v_bad
        using errcode = 'CLR10';
    end if;
    if has_function_privilege('public', r.x, 'execute') then
      raise exception 'S8: PUBLIC can EXECUTE internal %', r.x using errcode = 'CLR10';
    end if;
  end loop;
  -- The seven writers are SECURITY DEFINER with a pinned search_path; the two reads are
  -- INVOKER (RLS decides), which is the whole point of departures-register (6).
  for r in select x from unnest(array[
      'clara.fork_coa_template(uuid,text,text,text,text,text)',
      'clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text)',
      'clara.remove_coa_template_family(uuid,text,text)',
      'clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text)',
      'clara.remove_coa_template_account(uuid,text,text)',
      'clara.publish_coa_template(uuid,text)',
      'clara.retire_coa_template(uuid,text)']) x loop
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(r.x)
                     and p.prosecdef
                     and 'search_path=clara, pg_temp' = any(coalesce(p.proconfig, '{}'))) then
      raise exception 'S8: writer % is not SECURITY DEFINER with search_path=clara, pg_temp', r.x
        using errcode = 'CLR10';
    end if;
  end loop;
  for r in select x from unnest(array['clara.list_coa_templates()','clara.get_coa_template(uuid)']) x loop
    if exists (select 1 from pg_proc p where p.oid = to_regprocedure(r.x) and p.prosecdef) then
      raise exception 'S8: read % is SECURITY DEFINER -- it must be invoker-rights so RLS decides', r.x
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (7) THE SEED, MEASURED. Counts by inclusion, the code-form census, the special markers,
  --     the core-unkeyed law, and the two live fact vocabularies.
  select id into v_tmpl from clara.coa_templates where scope = 'platform' and template_key = 'my_sme_starter';
  if v_tmpl is null then
    raise exception 'S8: the platform starter is absent' using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.coa_templates;
  if v_n <> 1 then
    raise exception 'S8: expected exactly 1 coa_templates row after seeding, found %', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.coa_templates
                  where id = v_tmpl and state = 'published' and published_at is not null
                    and content_sha256 is not null and published_by is null and created_by is null
                    and firm_id is null and version = 1 and framework_hint = 'MPERS') then
    raise exception 'S8: the platform starter is not PUBLISHED with a null publisher/author and a content hash'
      using errcode = 'CLR10';
  end if;
  -- The hash on the row is the one _coa_template_content_sha256 recomputes from the rows NOW.
  select content_sha256 into v_sha from clara.coa_templates where id = v_tmpl;
  if v_sha is distinct from clara._coa_template_content_sha256(v_tmpl) then
    raise exception 'S8: the stored content_sha256 does not reproduce from the seeded rows' using errcode = 'CLR10';
  end if;

  select count(*) into v_n from clara.coa_template_families where template_id = v_tmpl;
  select count(*) into v_m from clara.coa_template_accounts where template_id = v_tmpl;
  if v_n <> 33 or v_m <> 102 then
    raise exception 'S8: seed census -- % families / % accounts, expected 33 / 102', v_n, v_m using errcode = 'CLR10';
  end if;
  select string_agg(t.inclusion || '=' || t.n::text, ' · ' order by t.inclusion) into v_txt
    from (select inclusion, count(*) n from clara.coa_template_families
           where template_id = v_tmpl group by inclusion) t;
  if v_txt is distinct from 'by_industry=6 · core=10 · opt_in=17' then
    raise exception 'S8: family inclusion census is %, expected by_industry=6 · core=10 · opt_in=17', v_txt
      using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.coa_template_accounts a
    join clara.coa_template_families f on f.template_id = a.template_id and f.family_key = a.family_key
   where a.template_id = v_tmpl and f.inclusion = 'core';
  if v_n <> 45 then
    raise exception 'S8: expected 45 accounts in core families, found %', v_n using errcode = 'CLR10';
  end if;
  -- Q2: every seeded code is the ruled PLAIN 4-digit form -- the FIRST branch of
  -- ck_coa_account_code_0009, never the NNN-XXXX branch the owner ruled out.
  select string_agg(account_code, ', ' order by account_code) into v_bad
    from clara.coa_template_accounts where template_id = v_tmpl and account_code !~ '^[0-9]{4}$';
  if v_bad is not null then
    raise exception 'S8: these seeded codes are not the ruled plain-4-digit form: %', v_bad using errcode = 'CLR10';
  end if;
  -- The five special markers, one each, on the right account types.
  select string_agg(special_acc_type || '=' || account_code, ' · ' order by special_acc_type) into v_txt
    from clara.coa_template_accounts where template_id = v_tmpl and special_acc_type is not null;
  if v_txt is distinct from 'opening_balance_equity=9900 · retained_earnings=3900 · rounding=9910 · sst_output=2150 · sst_purchase_cost=9920' then
    raise exception 'S8: the special-marker census is %', v_txt using errcode = 'CLR10';
  end if;
  -- (7a) THE ANNOTATION HINTS (conductor ruling 2026-08-29). The TWELVE add-back leaves,
  --      verbatim; the ELEVEN statutory tags; the biconditional as a measured DATA fact; and
  --      the extend-only CHECK proved in BOTH directions by a probe built and discarded in a
  --      forced-rollback subtransaction. Also proved NEGATIVELY: no tax_* relation was minted
  --      and coa_template_accounts joins to nothing but its own family.
  select string_agg(distinct add_back_class, ', ' order by add_back_class) into v_txt
    from clara.coa_template_accounts where template_id = v_tmpl and add_back_class is not null;
  if v_txt is distinct from 'club_subscriptions_and_entrance_fees, depreciation_and_amortisation, donations_approved, donations_unapproved, doubtful_debts_general, doubtful_debts_specific, entertainment, fines_and_penalties, leave_passage, motor_running_costs, private_and_proprietor_expenses, unapproved_provident_fund' then
    raise exception 'S8: the seeded add_back_class leaf set is %', v_txt using errcode = 'CLR10';
  end if;
  select count(*) into v_n from clara.coa_template_accounts
   where template_id = v_tmpl and add_back_class is not null;
  if v_n <> 12 then
    raise exception 'S8: expected 12 annotated add-back accounts, found %', v_n using errcode = 'CLR10';
  end if;
  select string_agg(account_code || '=' || statutory, ' · ' order by account_code) into v_txt
    from clara.coa_template_accounts where template_id = v_tmpl and statutory is not null;
  if v_txt is distinct from '2100=epf · 2110=socso · 2120=eis · 2130=pcb_mtd · 2140=hrdf · 2150=sst_output · 6010=epf · 6020=socso · 6030=eis · 6040=hrdf · 9920=sst_input' then
    raise exception 'S8: the seeded statutory-tag map is %', v_txt using errcode = 'CLR10';
  end if;
  select string_agg(account_code, ', ' order by account_code) into v_bad
    from clara.coa_template_accounts
   where template_id = v_tmpl and tax_sensitive <> (add_back_class is not null);
  if v_bad is not null then
    raise exception 'S8: tax_sensitive disagrees with add_back_class on: %', v_bad using errcode = 'CLR10';
  end if;
  begin
    declare
      v_probe uuid; v_leaf text;
      v_leaves constant text[] := array[
        'entertainment','donations_approved','donations_unapproved','fines_and_penalties',
        'depreciation_and_amortisation','leave_passage','private_and_proprietor_expenses',
        'motor_running_costs','club_subscriptions_and_entrance_fees','doubtful_debts_specific',
        'doubtful_debts_general','unapproved_provident_fund'];
    begin
      insert into clara.coa_templates(scope, firm_id, template_key, version, title,
          framework_hint, basis, state)
        values ('platform', null, 'ck_probe_discarded', 1, 'probe', 'MPERS', 'probe', 'draft')
        returning id into v_probe;
      insert into clara.coa_template_families(template_id, family_key, label, inclusion, basis, sort_ordinal)
        values (v_probe, 'probe', 'probe', 'opt_in', 'probe', 1);
      -- DIRECTION 1: every one of the twelve is ADMITTED.
      foreach v_leaf in array v_leaves loop
        insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
            account_type, sort_ordinal, tax_sensitive, add_back_class)
          values (v_probe, 'probe', lpad((1000 + array_position(v_leaves, v_leaf))::text, 4, '0'),
            'probe', 'expense', 1, true, v_leaf);
      end loop;
      select count(*) into v_n from clara.coa_template_accounts where template_id = v_probe;
      if v_n <> 12 then
        raise exception 'S8: the extend-only CHECK admitted only % of the twelve leaves', v_n using errcode = 'CLR10';
      end if;
      -- DIRECTION 2: an unlisted leaf is REFUSED. A closed set that never says no is not a set.
      begin
        insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
            account_type, sort_ordinal, tax_sensitive, add_back_class)
          values (v_probe, 'probe', '1999', 'probe', 'expense', 1, true, 'ADDBACK_ENTERTAINMENT');
        raise exception 'S8: ck_coa_tmpl_add_back_class ADMITTED an unlisted leaf -- the closed set is not closed'
          using errcode = 'CLR10';
      exception when check_violation then null;
      end;
      -- DIRECTION 3: the one-way pairing refuses an add-back class on a non-tax-sensitive row.
      begin
        insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
            account_type, sort_ordinal, tax_sensitive, add_back_class)
          values (v_probe, 'probe', '1998', 'probe', 'expense', 1, false, 'entertainment');
        raise exception 'S8: ck_coa_tmpl_add_back_paired ADMITTED an add-back class on a non-tax-sensitive account'
          using errcode = 'CLR10';
      exception when check_violation then null;
      end;
      raise exception 'S8_ADDBACK_PROBE_DISCARD';
    exception when others then
      if sqlerrm <> 'S8_ADDBACK_PROBE_DISCARD' then raise; end if;
    end;
  end;
  -- No tax_* relation was minted, and this table joins to nothing but its own family.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relkind in ('r','v','m') and c.relname like 'tax\_%';
  if v_bad is not null then
    raise exception 'S8: this file minted or found tax_* relation(s) -- % -- PR-a mints none', v_bad
      using errcode = 'CLR10';
  end if;
  select string_agg(con.conname || '->' || con.confrelid::regclass::text, ', ' order by con.conname) into v_txt
    from pg_constraint con
   where con.conrelid = 'clara.coa_template_accounts'::regclass and con.contype = 'f';
  if v_txt is distinct from 'fk_coa_tmpl_account_family->clara.coa_template_families' then
    raise exception 'S8: coa_template_accounts'' foreign keys are % -- expected only the family FK', coalesce(v_txt,'<none>')
      using errcode = 'CLR10';
  end if;

  -- Q10: the equity section swaps by entity type -- three families, disjoint entity_types.
  select string_agg(f.family_key || '->' || array_to_string(f.entity_types, '+'), ' · ' order by f.family_key)
    into v_txt from clara.coa_template_families f
   where f.template_id = v_tmpl and f.entity_types <> '{}';
  if v_txt is distinct from 'equity_company->sdn_bhd+bhd · equity_other->other · equity_partnership->partnership+llp · equity_society_cooperative->society+cooperative · equity_sole_prop->sole_prop' then
    raise exception 'S8: the entity-type equity swap census is %', v_txt using errcode = 'CLR10';
  end if;
  -- (7b) COVERAGE, not containment (HIGH-2). The census above proves the seed's entity_types are
  --      a SUBSET of the live enum; that is silent about the direction that actually hurts -- a
  --      value the product ADMITS with no equity family behind it. This walks the LIVE
  --      ENTITY_TYPES_V2 vocabulary and requires EXACTLY ONE family per value, so a ninth entity
  --      type widening client_fact_keys reds this assertion instead of silently uncovering a
  --      client. Read from the catalog, never from a list this file carries.
  select string_agg(z.v || '=' || z.n::text, ' · ' order by z.v) into v_txt
    from (select v.value as v,
                 (select count(*)::int from clara.coa_template_families f
                   where f.template_id = v_tmpl and f.entity_types @> array[v.value]) as n
            from clara.client_fact_keys k,
                 lateral jsonb_array_elements_text(k.allowed_values) as v(value)
           where k.fact_key = 'entity_type') z
   where z.n <> 1;
  if v_txt is not null then
    raise exception 'S8: these live entity_type values do not have EXACTLY ONE equity family: %', v_txt
      using errcode = 'CLR10';
  end if;
  -- Q12: every family carrying an MSIC key is edition-stamped, and every stamp reads MSIC 2008.
  select count(*) into v_n from clara.coa_template_families
   where template_id = v_tmpl and (msic_sections <> '{}' or msic_divisions <> '{}');
  select count(*) into v_m from clara.coa_template_families
   where template_id = v_tmpl and msic_edition = 'MSIC 2008';
  if v_n <> 5 or v_m <> 5 then
    raise exception 'S8: expected 5 MSIC-keyed families all stamped MSIC 2008, found % keyed / % stamped', v_n, v_m
      using errcode = 'CLR10';
  end if;
  -- The core-unkeyed law, and the two vocabularies checked against the LIVE catalog rather
  -- than against this file's own idea of them (departures register (4)).
  select string_agg(family_key, ', ' order by family_key) into v_bad
    from clara.coa_template_families where template_id = v_tmpl and inclusion = 'core'
     and (msic_sections <> '{}' or msic_divisions <> '{}' or trade_natures <> '{}' or entity_types <> '{}');
  if v_bad is not null then
    raise exception 'S8: these core families carry trim keys: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(f.family_key || ':' || v, ', ') into v_bad
    from clara.coa_template_families f, unnest(f.trade_natures) v
   where f.template_id = v_tmpl
     and not exists (select 1 from clara.client_fact_keys k
                      where k.fact_key = 'trade_nature' and k.allowed_values @> to_jsonb(v));
  if v_bad is not null then
    raise exception 'S8: seeded trade_natures outside the live client_fact_keys vocabulary: %', v_bad using errcode = 'CLR10';
  end if;
  select string_agg(f.family_key || ':' || v, ', ') into v_bad
    from clara.coa_template_families f, unnest(f.entity_types) v
   where f.template_id = v_tmpl
     and not exists (select 1 from clara.client_fact_keys k
                      where k.fact_key = 'entity_type' and k.allowed_values @> to_jsonb(v));
  if v_bad is not null then
    raise exception 'S8: seeded entity_types outside the live client_fact_keys vocabulary: %', v_bad using errcode = 'CLR10';
  end if;
  -- (7c) CONSTRAINT 2 ON DURABLE PROSE (HIGH-3). A `basis` row is structured DB data a reader
  --      may act on, so a NUMBER-BEARING tax assertion in one -- a restriction rate, a ceiling,
  --      a capital-allowance cap -- is a model-authored figure with no effective-dated authority
  --      behind it, which is exactly what the DB may not own (PRD SS6). CITATIONS stay: section,
  --      paragraph, Public-Ruling and edition numbers are how a claim is checked, not a claim
  --      about an amount. So this census refuses a percent sign and a currency figure anywhere
  --      in a durable basis/hint field, and ADMITS s.39(1)(l), PR 4/2015, Para 2/2A, MSIC 2008.
  --      The rates and amounts live in the research .md and, when F-T3 lands, in its own
  --      effective-dated tables.
  select string_agg(t2.where_ || ': ' || t2.txt, ' | ' order by t2.where_) into v_bad from (
    select 'coa_templates.basis' as where_, basis as txt from clara.coa_templates where id = v_tmpl
    union all
    select 'family ' || family_key, basis from clara.coa_template_families where template_id = v_tmpl
    union all
    select 'account ' || account_code, name from clara.coa_template_accounts where template_id = v_tmpl
    union all
    select 'account ' || account_code || '.add_back_class', add_back_class
      from clara.coa_template_accounts where template_id = v_tmpl and add_back_class is not null
    union all
    select 'account ' || account_code || '.statutory', statutory
      from clara.coa_template_accounts where template_id = v_tmpl and statutory is not null
  ) t2
   where t2.txt like '%\%%'                                -- a percent sign, anywhere
      or t2.txt ~* '\m(rm|myr)\s?[0-9]'                    -- a ringgit figure
      or t2.txt ~ '[0-9]{1,3}(,[0-9]{3})+';                -- a comma-grouped amount
  if v_bad is not null then
    raise exception 'S8: a durable basis/hint field carries a numeral-bearing tax assertion (constraint 2 -- citations only): %', v_bad
      using errcode = 'CLR10';
  end if;
  -- The POSITIVE control for the census above: it must still be reading fields that DO carry
  -- statutory citations, or it is passing over an empty set and proving nothing (review law 2).
  select count(*) into v_n from clara.coa_template_families
   where template_id = v_tmpl and basis ~ '(ITA 1967|MPERS|PR [0-9]+/[0-9]{4})';
  if v_n < 20 then
    raise exception 'S8: only % family basis rows carry a statutory citation -- the numeral census above is reading the wrong field', v_n
      using errcode = 'CLR10';
  end if;

  -- Every family has a basis and at least one account (publish_coa_template's own rungs,
  -- re-proved on the seeded content rather than assumed from having called it).
  select string_agg(family_key, ', ' order by family_key) into v_bad
    from clara.coa_template_families f where f.template_id = v_tmpl
     and (btrim(f.basis) = '' or not exists (select 1 from clara.coa_template_accounts a
                                              where a.template_id = v_tmpl and a.family_key = f.family_key));
  if v_bad is not null then
    raise exception 'S8: these families have no basis or no accounts: %', v_bad using errcode = 'CLR10';
  end if;
  -- (7d) The adoption walls, asserted by PREDICATE TEXT rather than by name -- a one-way
  --      conjunction that merely LOOKS two-way is the defect the independent review found here,
  --      and a name census would have passed straight over it.
  for r in select * from (values
      ('ck_coa_adoption_adopted',      'CHECK (((state = ''adopted''::text) = (adopted_by IS NOT NULL)))'),
      ('ck_coa_adoption_adopted_at',   'CHECK (((adopted_by IS NULL) = (adopted_at IS NULL)))'),
      ('ck_coa_adoption_receipted',    'CHECK (((proposed_by IS NULL) = (receipt_id IS NULL)))'),
      ('ck_coa_adoption_basis_paired', 'CHECK (((proposed_by IS NULL) = (basis IS NULL)))'),
      ('ck_coa_adoption_proposed',     'CHECK (((proposed_by IS NULL) = (proposed_at IS NULL)))')
    ) as t(conname, want) loop
    select pg_get_constraintdef(con.oid) into v_txt from pg_constraint con
     where con.conrelid = 'clara.coa_template_adoptions'::regclass and con.conname = r.conname;
    if v_txt is distinct from r.want then
      raise exception 'S8: % is %, expected %', r.conname, coalesce(v_txt,'<absent>'), r.want
        using errcode = 'CLR10';
    end if;
  end loop;

  -- Nothing was adopted by anyone: PR-a plants no client chart and no adoption.
  select count(*) into v_n from clara.coa_template_adoptions;
  if v_n <> 0 then
    raise exception 'S8: coa_template_adoptions carries % row(s); PR-a writes none', v_n using errcode = 'CLR10';
  end if;

  -- (8) THE D1-EMPTY PROOF -- a WHOLE-CATALOG differential against S0's snapshot, not a roster
  --     probe. Every pre-existing clara function is byte-identical on prosrc, ACL and owner,
  --     and the ONLY additions are this file's own eleven names.
  select string_agg(s.sig, ', ' order by s.sig) into v_bad
    from _coa_pra_fn_snapshot s
    left join (select p.oid, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha,
                      coalesce(array_to_string(p.proacl::text[],'|'),'<null>') acl,
                      pg_get_userbyid(p.proowner) owner
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'clara') now on now.oid = s.oid
   where now.oid is null or now.sha <> s.prosrc_sha256 or now.acl <> s.acl or now.owner <> s.owner;
  if v_bad is not null then
    raise exception 'S8: D1 inventory is NOT empty -- these pre-existing clara functions changed body, ACL, owner, or vanished: %', v_bad
      using errcode = 'CLR10';
  end if;
  -- The additions are pinned as a MAP of signatures, never a count (the roster-maps-not-counts
  -- lesson): 7 writers + 2 reads + 2 internal helpers + 2 trigger functions = 13.
  select string_agg(now.sig, ', ' order by now.sig) into v_txt
    from (select p.oid, p.oid::regprocedure::text sig
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'clara') now
   where not exists (select 1 from _coa_pra_fn_snapshot s where s.oid = now.oid);
  if v_txt is distinct from (select string_agg(x, ', ' order by x) from unnest(array[
      'clara._coa_template_content_sha256(uuid)',
      'clara._coa_template_for_edit(uuid,uuid)',
      'clara._tf_coa_template_child_freeze()',
      'clara._tf_coa_template_freeze()',
      'clara.fork_coa_template(uuid,text,text,text,text,text)',
      'clara.get_coa_template(uuid)',
      'clara.list_coa_templates()',
      'clara.publish_coa_template(uuid,text)',
      'clara.remove_coa_template_account(uuid,text,text)',
      'clara.remove_coa_template_family(uuid,text,text)',
      'clara.retire_coa_template(uuid,text)',
      'clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text)',
      'clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text)',
      'clara._tf_coa_adoption_template_congruent()'
    ]) x) then
    raise exception 'S8: the added-function set is % -- expected exactly this file''s own fourteen', coalesce(v_txt,'<none>')
      using errcode = 'CLR10';
  end if;

  -- (9) CONSTRAINT 15: the frozen prior build and the Slice-0 spike are untouched.
  select string_agg(f.nspname || '=' || f.relations::text || '->' || coalesce(liv.n, 0)::text, ', ') into v_bad
    from _coa_pra_frozen_snapshot f
    left join (select n.nspname, count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname in ('workflow','graphile_worker','spike') group by n.nspname) liv
      on liv.nspname = f.nspname
   where coalesce(liv.n, 0) <> f.relations;
  if v_bad is not null then
    raise exception 'S8: a frozen schema''s relation count moved -- %', v_bad using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('workflow','graphile_worker','spike') and c.relname like 'coa\_%';
  if v_n <> 0 then
    raise exception 'S8: this file''s names appear inside a frozen schema' using errcode = 'CLR10';
  end if;

  -- (10) The dataviz name collision is intact and untouched (survey F10, gate obligation 3).
  select count(*) into v_n from pg_attribute a
   where a.attrelid = 'clara.chart_templates'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_n <> 6 then
    raise exception 'S8: clara.chart_templates now has % columns, expected the untouched 6', v_n using errcode = 'CLR10';
  end if;

  raise notice 'coa-template PR-a tail: OK -- FOUR relations (coa_templates · coa_template_families · coa_template_accounts · coa_template_adoptions), each owned by clara_fn_owner with ENABLE+FORCE RLS and EXACTLY its policy pair (owner ALL true/true + a SELECT-only clara_authenticated read), non-owner reach exactly clara_authenticated:SELECT on all four and ZERO agent/wake/runtime/freeform reach; the header read is the EXPLICIT-scope form (scope=platform OR firm_id=jwt_firm(), no NULL inference) and both child reads derive scope+firm from the parent; ALL SEVEN mirrored predicates on coa_template_accounts are byte-equal to coa_accounts'' live ck_coa_account_code_0009 / account_type / class / special / OBE / RE / SST-purchase-cost; 5 partial UNIQUEs asserted by property; 6 triggers by name (2 freeze + 4 no-truncate); 9 doors reach clara_authenticated+clara_fn_owner ONLY with PUBLIC revoked, the 7 writers SECURITY DEFINER with a pinned search_path and the 2 reads INVOKER so RLS decides, and 4 internals (2 helpers + 2 trigger fns) reachable by NO app role. SEED: platform starter my_sme_starter v1 PUBLISHED with a null author and a null publisher, 31 families (core=10 · by_industry=6 · opt_in=15) and 100 accounts, 45 of them in core families, EVERY code the ruled plain-4-digit form, the five special markers one each (RE=3900 · OBE=9900 · rounding=9910 · sst_output=2150 · sst_purchase_cost=9920), the equity swap disjoint across sdn_bhd+bhd / sole_prop / partnership+llp, 5 MSIC-keyed families all stamped MSIC 2008, zero core families keyed, every trade_nature and entity_type inside the LIVE client_fact_keys vocabulary, every family carrying a basis and at least one account, and the stored content_sha256 reproducing from the rows. ANNOTATION HINTS: exactly the twelve researched add-back leaves on twelve accounts, the eleven statutory tags at their exact codes, tax_sensitive agreeing with add_back_class on every row, the extend-only CHECK proved in BOTH directions (all twelve admitted, an unlisted leaf REFUSED, an add-back class on a non-tax-sensitive row REFUSED) by a probe built and discarded in a forced-rollback subtransaction, ZERO tax_* relations in schema clara, and coa_template_accounts holding exactly ONE foreign key -- its own family. ZERO coa_template_adoptions rows -- PR-a plants no client chart. D1 INVENTORY EMPTY, PROVEN BY WHOLE-CATALOG DIFFERENTIAL: every pre-existing clara function byte-identical on prosrc/ACL/owner, and the added set pinned as a signature MAP of exactly this file''s own thirteen. Constraint 15 holds: workflow/graphile_worker/spike relation counts unmoved and none of this file''s names inside them; the dataviz clara.chart_templates pair untouched at 6 columns.';
end $s8$;
