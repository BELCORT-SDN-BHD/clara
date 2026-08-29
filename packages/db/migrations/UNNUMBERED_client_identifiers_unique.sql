-- UNNUMBERED_client_identifiers_unique.sql -- OWNER RULING 裁-41 (2026-08-30,
-- docs/plan/active/mohe-grill-rulings-2026-08-29.md): clara.client_identifiers gains a UNIQUE
-- over (client_id, kind, value_normalized) before beta. NUMBER IS CLAIMED AT MERGE, not here
-- (standing law, AGENTS.md constraint 10 + .claude/rules/db-migrations.md) -- 0149..0154 were
-- held by sibling lanes at authoring time, so this file was rig-replayed as 0155 against a
-- chain whose frontier is 0148_promotion_dup_open_wall. The conductor renumbers at merge; the
-- number is comment-only and the body is number-independent.
--
-- =====================================================================================
-- THE GAP THIS FILE CLOSES -- MEASURED AT THE LIVE BODIES, NOT ASSUMED
-- =====================================================================================
-- 0007:235 made this table deliberately non-unique -- "sibling-client conflicts must be
-- representable" -- and that intent is PRESERVED here, not overturned. Read the key: it starts
-- at `client_id`. Two DIFFERENT clients of one firm may still carry the SAME (kind, value)
-- forever; that collision is exactly what the attribution lane must be able to SEE, and what
-- clara._confirm_bank_identifier_promotion_core's own MUST-2d ambiguity refusal is built on.
-- What 裁-41 makes impossible is narrower and different: the SAME client carrying the SAME
-- (kind, value) TWICE. That is not a representable conflict -- it is one fact recorded twice,
-- and every reader that counts, joins or attributes on this table double-counts it.
--
-- The residual race, stated precisely. `0148_promotion_dup_open_wall` (PR #425) closed the
-- open-PROPOSAL race: at most one OPEN promotion card per (firm, client, kind, value). It is a
-- PARTIAL unique index `where status = 'proposed'`, so SETTLING a card frees the slot -- by
-- design, so an honest re-proposal after a decline is admitted. That leaves the confirm side
-- wide open, and this is the hole 裁-41 names:
--   * clara.confirm_identifier_promotion (0103:866-...) DERIVES its inner op_key from the outer
--     (`p_op_key || ':add_client_identifier'`), so two cards settled under two DIFFERENT outer
--     op_keys mint two DIFFERENT inner reservations and BOTH write. The op-receipt wall is
--     per-op_key; it was never a per-identifier wall.
--   * clara.add_client_identifier (0007:1508-1529) has NO existence check of any kind. It
--     reserves, checks the client is in the firm, and INSERTs.
--   * Nothing downstream catches it, because the table carried no unique key.
-- Net, before this file: card A confirmed, card B opened afterwards (legal -- A is settled),
-- card B confirmed, and the client now holds two byte-identical identity rows.
--
-- =====================================================================================
-- WHAT THIS FILE SHIPS
-- =====================================================================================
--   1. `uq_client_identifiers_client_kind_value` -- a plain (NON-partial) UNIQUE index on
--      clara.client_identifiers (client_id, kind, value_normalized).
--
--      WHY NOT `NULLS NOT DISTINCT`, and why no NOT NULL tightening is owed: all three key
--      columns are ALREADY `not null` in the live catalog, and §0.3 below MEASURES that from
--      pg_attribute.attnotnull rather than trusting 0007's DDL text. A `NULLS NOT DISTINCT`
--      clause would therefore be inert, and worse than inert -- it would tell a future reader
--      that a NULL pair is reachable here when it is not. The writers agree with the catalog:
--      `kind` is additionally CHECK-closed to ('tin','ssm','bank_account') and
--      `value_normalized` CHECK-closed to `btrim(...) <> ''`, and BOTH direct writers compute
--      the value with `lower(regexp_replace(...))` over a non-null argument. There is no
--      writer, and no reachable state, in which a key column is NULL.
--
--      WHY `firm_id` IS NOT IN THE KEY: the ruling's key is (client_id, kind, value_normalized)
--      and it is complete. `fk_client_identifiers_client` is a COMPOSITE foreign key
--      (client_id, firm_id) -> clara.clients(id, firm_id) over a PK'd clients.id, so a
--      client_id determines its firm_id -- adding firm_id would widen the key's spelling
--      without narrowing the set of rows it admits. The pre-existing NON-unique
--      `ix_client_identifiers_match` on (firm_id, kind, value_normalized) is a DIFFERENT access
--      pattern (the attribution lane's firm-wide value lookup, which must keep finding sibling
--      clients) and is KEPT untouched -- the tail re-censuses it and refuses if it ever became
--      unique.
--
--   2. The `unique_violation` -> TYPED REFUSAL map on BOTH direct writers, the same shape
--      clara.propose_vendor_identity_binding has carried since 0028:758-772 and 0148 carried
--      onto the proposal doors: wrap the write, read `constraint_name` out of the stacked
--      diagnostics, and `raise` UNCHANGED unless it is exactly this file's own index. An
--      unrelated unique_violation -- client_identifiers_pkey, client_identifiers_id_firm_id_key,
--      or anything a later migration adds -- is never swallowed and never relabelled.
--
--      The two maps are deliberately NOT symmetric, because the two writers want different
--      things from the same collision:
--        * clara.add_client_identifier REFUSES, typed. It is the audited door whose whole job
--          is to MINT an identity row and hand back its id; a caller asking for a second
--          identical row is asking for something that must not exist, and 裁-41's remedy is
--          that the second confirm cannot land. Both confirm doors route through here and
--          inherit the refusal without a body change of their own (see the inventory below).
--        * clara._add_bank_account_core CONTINUES, having RE-PROVEN the postcondition. Its two
--          client_identifiers writes are already `if not exists ... then insert`, i.e. "ensure
--          this row is present", never "mint a new one"; the pre-check is the ordinary path and
--          the handler is only the CONCURRENT-RACE backstop -- exactly the division this same
--          function already documents at its bank_accounts insert ("named refusals for the
--          ordinary case; the insert's own unique_violation catch below is the concurrent-race
--          backstop"). Crucially the handler does NOT infer presence from the 23505 (law 2:
--          a derived state is not evidence): it RE-READS the row and re-`raise`s if the read
--          comes back empty. Without this map the loser of that race escapes
--          clara.add_bank_account -- a live `clara_authenticated` door -- as a raw, untyped
--          23505.
--
--   3. The one comment inside _add_bank_account_core that this file makes FALSE is trued in the
--      same breath ("there is no unique index to ON CONFLICT against, deliberately"). A live
--      body is not allowed to keep describing a world this migration just ended.
--
-- WHAT THIS FILE DOES NOT DO. It NEVER dedupes. If duplicate (client, kind, value) rows already
-- exist when this migration is applied, §0.6 REFUSES with a named reason and prints every
-- offending group -- because which of two identical identity rows survives is not a migration's
-- call: the rows carry different ids, different added_by and different added_at, and downstream
-- artifacts (attribution attempts, promotion cards' identifier_id) may already point at a
-- specific one. The table is also append-only by trigger (t_client_identifiers_append_only,
-- 0007:679), so there is no in-migration delete path that would not first have to defeat the
-- estate's own wall. The operator's recipe is in the refusal's HINT, and it names two routes
-- because there is NO retire verb for an identifier (the append-only trigger blocks UPDATE and
-- DELETE, and no `retire_client_identifier` counterpart to `retire_client_alias` exists).
--
-- READINESS, SCOPED HONESTLY -- read this before scheduling the D1 window. What was measured at
-- authoring is RIGS: migrate-only and migrate+seed both read ZERO duplicate groups, so CI and
-- every throwaway pass cleanly. That is NOT a statement about the live estate, and it must not be
-- read as one. **The live estate is documented IN THIS REPO to carry duplicates**:
-- packages/db/deploy/client-identifiers-0049-seed.sql:29-30 records, as a measured statement
-- about the live BELCORT database, that ROME SECRETARY holds "four rows for two values" -- i.e.
-- TWO duplicate groups, the residue of re-running that seed without a stable op_key. Nothing in
-- the migration chain clears them. So §0.6 is EXPECTED to refuse the first live attempt, and the
-- ceremony must resolve those groups first. ROME SECRETARY is a resettable fixture under
-- constraint 13, so route (a) -- the Wave-G reset -- is the likely answer; the PR body carries
-- the live count and the owner's ruling on which route applies. The census count is printed at
-- the tail on every run either way.
--
-- =====================================================================================
-- D1 WRITE-QUIESCE INVENTORY -- TWO LIVE AUDITED WRITER BODIES REPLACED
-- =====================================================================================
-- The inventory is a CLOSED-WORLD census, not a reading list. §0.8 enumerates every function in
-- schema `clara` whose prosrc executes DML against clara.client_identifiers and REFUSES unless
-- the set is exactly these two -- so a third writer merged between authoring and deploy stops
-- this file rather than slipping past its map. Both are CREATE OR REPLACE at an UNCHANGED
-- signature: no overload is shadowed, no ACL moves, no allowlist row is touched.
--
--   1. clara.add_client_identifier(uuid,text,text,text)
--      -- pre-image prosrc sha256 18591f42bd0013518f500fe6b351ebf51ad001777a8f00e74f76b7c04c4d7f57
--      -- born 0007:1508; reachable by clara_authenticated (a live toolface door).
--   2. clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)
--      -- pre-image prosrc sha256 60141dbee118af6e5fda556d3d6b45c02af9a3a2be716ff6ba50179226dcd4b6
--      -- UNGRANTED (0119's extraction revoked it at birth); reachable only through
--      clara.add_bank_account / clara._agent_add_bank_account_core / clara.wake_add_bank_account.
--      NOTE, and it is why the tail proves a byte-for-byte re-substitution rather than quoting a
--      file: this body exists in NO migration file. 0119_f_a3_pr1a_core_extractions MINTED it by
--      splicing clara.add_bank_account's then-live prosrc at a measured anchor. The text below
--      is the LIVE pre-image plus a named delta, and §4 proves that by reversing the delta and
--      re-deriving the pinned pre-image sha.
--
-- CENSUSED AND DELIBERATELY *NOT* CHANGED -- each pinned by prosrc sha in §0.7 and re-proven
-- BYTE-IDENTICAL at the tail, so "we did not touch it" is a measurement, not a promise:
--   * clara.confirm_identifier_promotion(uuid,text) -- 裁-41's own headline door. It calls
--     add_client_identifier and lets the refusal propagate; giving it a second, hand-rolled
--     check would put the same judgement in two places and let them drift. PROVEN by rig cells
--     ci-6 (the two-card arc; the losing card stays `proposed`) and ci-7 (it can still be
--     declined afterwards, so the refusal is not a dead end).
--   * clara._confirm_bank_identifier_promotion_core(jsonb,uuid,text) -- the bank confirm door,
--     same reason. (It ALSO cannot reach the new index with a statutory kind at all: its own
--     MUST-2c wall refuses anything but identifier_kind = 'bank_account'.)
--     STATED AS THE GAP IT IS, rather than left to read as covered: this door has NO cell of its
--     own in the 裁-41 battery. Its inheritance is argued structurally (it calls the same
--     add_client_identifier and does not wrap the call), not measured. It is also shaped
--     DIFFERENTLY from the door above -- it settles its proposal AFTER the write
--     (`update clara.bank_agent_proposals set status='accepted'`), so the refusal must roll the
--     whole call back and leave the proposal `open`, and its own `promotion_not_confirmed`
--     branch becomes dead for this path because the inner door now raises instead of returning
--     without an id. Owed follow-up: one cell mirroring ci-6 through
--     clara.confirm_bank_identifier_promotion, asserting the CLR10/already_recorded propagates
--     AND the bank_agent_proposals row is still 'open'. Named in the PR body.
--   * clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)
--     -- 0143's standing byte-identity commitment, re-honoured by 0148 and by this file.
--   * clara._claim_identity_core(uuid,text,text) -- named in this lane's brief and censused for
--     completeness: it writes clara.USERS, not clara.client_identifiers, and its own
--     unique_violation handler is scoped to that users insert. Out of scope, and pinned so that
--     statement stays true.
--
-- SEVERITY, so a ceremony can size the window honestly. A call that spans this migration runs to
-- completion on the body it STARTED with (PostgreSQL semantics; packages/db/README.md "Deploy
-- contract"), which has no handler. In the one narrow case where such an in-flight call also
-- loses a duplicate race against the brand-new index, its caller sees a raw 23505 instead of the
-- typed CLR10 -- and, for _add_bank_account_core only, that raw error aborts a bank-account
-- registration that the new body would have carried through. No row is written wrong, no wall is
-- skipped, nothing is corrupted. A D1 window is taken regardless: the obligation is mechanical,
-- not severity-tiered.
--
-- NO NEW `clara_authenticated` DOOR, so .claude/rules/db-migrations.md's frontend-home rule does
-- not engage: this file creates no function, grants no role anything, and adds no verb. The
-- change is visible to the toolface only as a refusal on doors that already have a home --
-- the identifier-promotion confirm card (apps/web/components/firm/identifier-promotion-row.tsx,
-- which already carries the DECLINE affordance the refusal leaves a user needing) and the bank
-- identifier-promotion confirm card (apps/web/lib/bank/agency-doors.ts;
-- apps/dashboard/app/shared/bankApi.ts -> BankWorkbench.tsx), plus the existing add-bank-account
-- journey, whose toolface behaviour is UNCHANGED. The PR body names them.

-- Precautionary, not load-bearing. The table is small on every environment measured (the tail
-- prints its real cardinality) and a CREATE UNIQUE INDEX over it is a sub-second pass. The cap
-- exists so that a surprise lock wait fails this migration loudly instead of holding a deploy
-- window open.
set local statement_timeout = '5min';

-- =====================================================================================
-- SECTION 0 -- PRESTATE. Every claim this file makes about what it is editing, measured.
-- =====================================================================================
do $pre$
declare
  v_src text; v_sha text; v_n int; v_dups int; v_list text; v_cols text; v_sigs text;
begin
  -- 0.1 Dependencies. NOT a frontier equality (sibling lanes claim numbers concurrently): this
  -- names only the migrations whose OBJECTS this file edits.
  if not exists (select 1 from clara.schema_migrations where version = '0007_document_pipeline') then
    raise exception 'client_identifiers_unique prestate: 0007_document_pipeline is not applied -- it owns the table and clara.add_client_identifier, both edit targets'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from clara.schema_migrations where version = '0119_f_a3_pr1a_core_extractions') then
    raise exception 'client_identifiers_unique prestate: 0119_f_a3_pr1a_core_extractions is not applied -- it MINTS clara._add_bank_account_core, this file''s second edit target'
      using errcode = 'CLR10';
  end if;

  -- 0.2 Already applied? Fail loudly rather than half-apply.
  if to_regclass('clara.uq_client_identifiers_client_kind_value') is not null then
    raise exception 'client_identifiers_unique prestate: uq_client_identifiers_client_kind_value already exists -- already applied'
      using errcode = 'CLR10';
  end if;

  -- 0.3 THE NULLABILITY DECISION, MEASURED. A UNIQUE over a nullable column does not wall NULL
  -- pairs, so this file must not merely assert the columns are NOT NULL -- it reads
  -- pg_attribute.attnotnull and refuses if any of the three is nullable. If this ever fires, the
  -- correct answer is a NOT NULL tightening (or NULLS NOT DISTINCT) decided against the writers
  -- of that day, NOT a silently weaker index.
  select count(*) into v_n from pg_attribute
   where attrelid = 'clara.client_identifiers'::regclass and attnum > 0 and not attisdropped
     and attname in ('client_id','kind','value_normalized') and attnotnull;
  if v_n <> 3 then
    raise exception 'client_identifiers_unique prestate: only % of the three key columns (client_id, kind, value_normalized) are NOT NULL -- a plain UNIQUE would not wall NULL pairs; decide NULLS NOT DISTINCT or a NOT NULL tightening against the writers before proceeding', v_n
      using errcode = 'CLR10';
  end if;
  -- ...and the two CHECKs that keep the key's domain closed are still live. Not decorative:
  -- they are half of why no key column can be NULL or blank in any reachable state.
  if not exists (select 1 from pg_constraint
      where conrelid = 'clara.client_identifiers'::regclass
        and conname = 'client_identifiers_kind_check') then
    raise exception 'client_identifiers_unique prestate: client_identifiers_kind_check is gone -- kind''s closed vocabulary is a premise of this key'
      using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_constraint
      where conrelid = 'clara.client_identifiers'::regclass
        and conname = 'client_identifiers_value_normalized_check') then
    raise exception 'client_identifiers_unique prestate: client_identifiers_value_normalized_check is gone -- the non-blank value predicate is a premise of this key'
      using errcode = 'CLR10';
  end if;

  -- 0.4 No unique index over this key exists yet, under ANY name. `unique (id, firm_id)` and the
  -- primary key are DIFFERENT keys and are expected to be found; they are excluded by key list,
  -- not by name (law 3).
  select count(*) into v_n from pg_index i
   where i.indrelid = 'clara.client_identifiers'::regclass and i.indisunique
     and (select string_agg(a.attname, ',' order by k.ord)
            from unnest(i.indkey::smallint[]) with ordinality k(att, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att)
         = 'client_id,kind,value_normalized';
  if v_n <> 0 then
    raise exception 'client_identifiers_unique prestate: a unique index over (client_id,kind,value_normalized) already exists -- refusing to layer a second'
      using errcode = 'CLR10';
  end if;
  -- The full unique-index census, so the tail can prove exactly ONE was added.
  select count(*) into v_n from pg_index i
   where i.indrelid = 'clara.client_identifiers'::regclass and i.indisunique;
  if v_n <> 2 then
    raise exception 'client_identifiers_unique prestate: client_identifiers carries % unique index(es), expected exactly 2 (pkey + the (id,firm_id) pair) -- the premise this file was authored against has moved', v_n
      using errcode = 'CLR10';
  end if;

  -- 0.5 The pre-existing NON-unique attribution index is present and NOT unique. Read from
  -- pg_index, never from the file that created it -- and stashed so the tail can prove it was
  -- not silently promoted into "the" unique wall.
  if to_regclass('clara.ix_client_identifiers_match') is null then
    raise exception 'client_identifiers_unique prestate: ix_client_identifiers_match is absent -- the sibling-conflict read path this file promises to leave alone does not exist'
      using errcode = 'CLR10';
  end if;
  if (select i.indisunique from pg_index i
       where i.indexrelid = 'clara.ix_client_identifiers_match'::regclass) then
    raise exception 'client_identifiers_unique prestate: ix_client_identifiers_match is ALREADY unique -- it would be walling sibling clients out of the same value, which 0007:235 forbids'
      using errcode = 'CLR10';
  end if;

  -- ON COMMIT DROP: the tail reads this in the SAME transaction, so it survives exactly as long
  -- as it is needed and does not outlive the migration into the runner's session.
  create temp table _cid_uniq_pre(k text primary key, v text) on commit drop;
  insert into _cid_uniq_pre(k,v)
    values ('match_ix_def', pg_get_indexdef('clara.ix_client_identifiers_match'::regclass));

  -- 0.6 THE PRE-FLIGHT. Existing duplicate groups are a REFUSAL with a named reason and every
  -- offending group printed -- NEVER a dedupe. See the header for why the choice is not a
  -- migration's to make.
  select count(*), coalesce(string_agg(format('(client=%s kind=%s value=%s n=%s)', client_id, kind, value_normalized, n), ', '), '')
    into v_dups, v_list
    from (select client_id, kind, value_normalized, count(*) as n
            from clara.client_identifiers
           group by client_id, kind, value_normalized
          having count(*) > 1) g;
  if v_dups > 0 then
    raise exception 'client_identifiers_unique prestate: % duplicate identifier group(s) already exist and must be resolved by a human before this wall can be raised: %', v_dups, v_list
      using errcode = 'CLR10',
        hint = 'This migration NEVER dedupes. There is also NO retire verb for a client identifier -- t_client_identifiers_append_only (0007:679) blocks UPDATE and DELETE, and unlike clara.retire_client_alias no counterpart exists -- so do not go looking for one. TWO followable routes, and which applies is the OWNER''s call, not this file''s. (a) FIXTURE FIRM (constraint 13 -- ROME PROPERTIES / ROME SECRETARY / BEE CREATIVE SOLUTION / ROME PUBLIC ADVISORY / Alara / Borneo): the duplicates ride the Wave-G factory reset; re-run this migration on the reset estate and it passes with nothing hand-edited. (b) OPERATOR FIRM (BELCORT) or a group the owner rules must be preserved: an owner-authorised ceremony that, as clara_fn_owner inside one transaction, disables t_client_identifiers_append_only, deletes the losing rows named above, re-enables the trigger, and receipts what it did -- after re-pointing any client_identifier_promotions.identifier_id that names a loser. Route (b) touches the append-only wall and is therefore an owner decision, never an agent one.';
  end if;

  -- 0.7 The two bodies being REPLACED, pinned by exact prosrc sha256 (the 0090/0143/0148 idiom),
  -- with their full prosrc and ACL stashed for the tail's re-substitution proof -- plus the four
  -- bodies that must come out BYTE-IDENTICAL.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.add_client_identifier(uuid,text,text,text)'::regprocedure;
  if v_src is null then
    raise exception 'client_identifiers_unique prestate: the live clara.add_client_identifier(uuid,text,text,text) is GONE' using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '18591f42bd0013518f500fe6b351ebf51ad001777a8f00e74f76b7c04c4d7f57' then
    raise exception 'client_identifiers_unique prestate: clara.add_client_identifier prosrc sha is % , expected 18591f42bd0013518f500fe6b351ebf51ad001777a8f00e74f76b7c04c4d7f57 -- the body this file re-substitutes has moved; re-derive the delta before deploying', v_sha
      using errcode = 'CLR10';
  end if;
  insert into _cid_uniq_pre(k,v) values ('aci_src', v_src), ('aci_sha', v_sha);
  insert into _cid_uniq_pre(k,v)
    select 'aci_acl', coalesce(array_to_string(array(
      select a.grantee::regrole::text || '=' || a.privilege_type
        from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                          where p.oid = 'clara.add_client_identifier(uuid,text,text,text)'::regprocedure)) a
       order by 1), ','), '(none)');

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)'::regprocedure;
  if v_src is null then
    raise exception 'client_identifiers_unique prestate: the live clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text) is GONE' using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha <> '60141dbee118af6e5fda556d3d6b45c02af9a3a2be716ff6ba50179226dcd4b6' then
    raise exception 'client_identifiers_unique prestate: clara._add_bank_account_core prosrc sha is % , expected 60141dbee118af6e5fda556d3d6b45c02af9a3a2be716ff6ba50179226dcd4b6 -- 0119 spliced this body from clara.add_bank_account and it exists in no file; re-derive the delta from the LIVE pre-image before deploying', v_sha
      using errcode = 'CLR10';
  end if;
  insert into _cid_uniq_pre(k,v) values ('abac_src', v_src), ('abac_sha', v_sha);
  insert into _cid_uniq_pre(k,v)
    select 'abac_acl', coalesce(array_to_string(array(
      select a.grantee::regrole::text || '=' || a.privilege_type
        from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                          where p.oid = 'clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)'::regprocedure)) a
       order by 1), ','), '(none)');

  -- The DO-NOT-TOUCH set, by EXACT SIGNATURE (never a bare name -- law 3).
  insert into _cid_uniq_pre(k,v)
    select 'untouched:' || s, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')
      from unnest(array[
        'clara.confirm_identifier_promotion(uuid,text)',
        'clara._confirm_bank_identifier_promotion_core(jsonb,uuid,text)',
        'clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)',
        'clara._claim_identity_core(uuid,text,text)']) s
      join pg_proc p on p.oid = s::regprocedure;
  select count(*) into v_n from _cid_uniq_pre where k like 'untouched:%';
  if v_n <> 4 then
    raise exception 'client_identifiers_unique prestate: only % of the 4 DO-NOT-TOUCH bodies resolved at their exact signatures', v_n
      using errcode = 'CLR10';
  end if;

  -- 0.8 THE PROSRC-TEXT WRITER CENSUS. It makes the D1 inventory a measurement rather than a
  -- reading list: enumerate every function in `clara` whose PROSRC TEXT names a DML against this
  -- table -- schema-qualified or bare, since every one of them pins search_path to clara -- and
  -- refuse unless the set is EXACTLY the two this file maps. A third PL/pgSQL writer merged
  -- between authoring and deploy stops the migration instead of shipping past its map.
  --
  -- WHAT IT IS NOT, named so the next author trusts its actual reach and not the word "census"
  -- (an earlier draft of this file called it CLOSED-WORLD; it is not, and the difference matters
  -- because every gap below fails OPEN -- a writer it cannot see ships with no map and hands its
  -- callers a raw 23505). It does NOT see: a table name assembled at run time
  -- (`execute format('insert into %I.client_identifiers', ...)`); a quoted identifier
  -- (`clara."client_identifiers"`); a SQL-standard-body (BEGIN ATOMIC) function, whose prosrc is
  -- a serialized parse tree naming the table by OID rather than by text; a writer reached through
  -- a view or rule; and -- the one that actually exists today -- EVERY NON-FUNCTION writer, i.e.
  -- any client-side INSERT. The rig battery's own fixtures and
  -- packages/db/deploy/client-identifiers-0049-seed.sql are exactly that shape. Those are walled
  -- by the INDEX, which binds every writer including ones nothing can enumerate; this census
  -- exists only to keep the TYPED-REFUSAL map complete across the function surface.
  -- The false-POSITIVE direction (a comment naming a DML) fails closed and is fine.
  select coalesce(string_agg(sig, E'\n  ' order by sig), '(none)'), count(*)
    into v_sigs, v_n
    from (select p.oid::regprocedure::text as sig
            from pg_proc p
           where p.pronamespace = 'clara'::regnamespace
             and p.prosrc ~* '(insert[[:space:]]+into|merge[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(clara[[:space:]]*\.[[:space:]]*)?client_identifiers([^A-Za-z0-9_]|$)') w;
  if v_n <> 2
     or position('clara.add_client_identifier(uuid,text,text,text)' in v_sigs) = 0
     or position('clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)' in v_sigs) = 0 then
    raise exception 'client_identifiers_unique prestate: the clara.client_identifiers writer census reads % function(s), expected exactly the 2 this file maps. Found:%s%', v_n, E'\n  ', v_sigs
      using errcode = 'CLR10',
        hint = 'Every writer of this table needs the unique_violation -> typed-refusal map, or its callers see a raw 23505. Extend this migration''s inventory (and its rig battery) to cover the new writer before deploying.';
  end if;

  raise notice 'client_identifiers_unique prestate: OK -- clara.client_identifiers carries % row(s) and ZERO duplicate (client_id,kind,value_normalized) groups; all three key columns measured NOT NULL from pg_attribute (so a plain UNIQUE walls every pair and NULLS NOT DISTINCT would be inert); both kind/value CHECKs live; 2 pre-existing unique indexes (pkey + (id,firm_id)) and NONE over this key; ix_client_identifiers_match present and NON-unique with its definition stashed; the CLOSED-WORLD writer census reads exactly 2 functions and both are in this file''s D1 inventory; both replaced bodies pinned by prosrc sha256 with prosrc+ACL stashed; 4 DO-NOT-TOUCH bodies pinned at their exact signatures.',
    (select count(*) from clara.client_identifiers);
end $pre$;

-- =====================================================================================
-- SECTION 1 -- THE STRUCTURAL WALL.
-- =====================================================================================
set role clara_fn_owner;

create unique index uq_client_identifiers_client_kind_value
  on clara.client_identifiers (client_id, kind, value_normalized);
comment on index clara.uq_client_identifiers_client_kind_value is
  '裁-41 (2026-08-30): ONE identity row per (client, kind, normalised value). The key starts at '
  'client_id ON PURPOSE -- two DIFFERENT clients of one firm may still carry the same (kind, '
  'value), which is the sibling conflict 0007:235 kept representable and which the attribution '
  'lane and _confirm_bank_identifier_promotion_core''s ambiguity refusal both depend on seeing. '
  'What this walls is one client holding the SAME fact twice, which every reader that counts or '
  'joins on this table double-counts. 0148''s partial unique closed the open-PROPOSAL race only; '
  'two separately-settled confirms could still mint two identical rows, because '
  'confirm_identifier_promotion derives its inner op_key from the outer and add_client_identifier '
  'had no existence check. The NON-unique ix_client_identifiers_match (firm_id, kind, '
  'value_normalized) is a different access path and is deliberately untouched.';

reset role;

-- =====================================================================================
-- SECTION 2 -- clara.add_client_identifier's TYPED REFUSAL. CREATE OR REPLACE at the UNCHANGED
-- 4-arg signature, so the ACL is preserved by construction. Every rung of the 0007 body below is
-- byte-preserved; the ONLY changes are the `v_con text` declaration and the begin/exception block
-- around the INSERT. §4 proves that by reversing both and re-deriving the pinned pre-image sha.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara.add_client_identifier(p_client uuid, p_kind text, p_value_normalized text,
    p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare c record; v_dedupe jsonb; v_id uuid; v_con text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  -- DC-1 (as-built review): normalization must MATCH the lane-1 predicate, which
  -- strips ALL whitespace — machine identifiers (TIN/SSM/bank account) carry no
  -- semantic internal whitespace; a btrim-only store could never match a spaced form.
  v_dedupe := clara._reserve_op(c.firm,'add_client_identifier',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'kind',p_kind,'value',lower(regexp_replace(p_value_normalized,'\s+','','g')))));
  if v_dedupe is not null then return v_dedupe; end if;
  if not exists (select 1 from clara.clients where id=p_client and firm_id=c.firm) then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  -- 裁-41: uq_client_identifiers_client_kind_value's 23505 becomes the estate's typed refusal
  -- here, in the ONE audited door that mints an identity row, so both confirm doors inherit it
  -- without a body change of their own. NARROW: anything that is not this index's violation is
  -- re-raised untouched, so an unrelated collision is never swallowed or relabelled.
  begin
    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values(c.firm,p_client,p_kind,lower(regexp_replace(p_value_normalized,'\s+','','g')),c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con is distinct from 'uq_client_identifiers_client_kind_value' then raise; end if;
    raise exception 'this identifier is already recorded for this client'
      using errcode = 'CLR10',
        detail = '{"reason":"already_recorded","class":"identifier"}';
  end;
  perform clara._audit(c.firm,c.actor,null,null,'add_client_identifier',null,
    jsonb_build_object('client',p_client,'identifier',v_id,'kind',p_kind,'op_key',p_op_key));
  return clara._finish_op(c.firm,'add_client_identifier',p_op_key,jsonb_build_object('identifier_id',v_id));
end $fn$;

reset role;

-- =====================================================================================
-- SECTION 3 -- clara._add_bank_account_core's RACE BACKSTOP. CREATE OR REPLACE at the UNCHANGED
-- 8-arg signature. This body lives in no migration file (0119 spliced it from
-- clara.add_bank_account's then-live prosrc), so what follows is the LIVE pre-image, pinned in
-- §0.7, plus three named fragments: the `v_con` declaration, the two guarded inserts' handlers,
-- and the stale comment 裁-41 makes false. §4 reverses all three and re-derives the pinned sha.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._add_bank_account_core(p_ctx jsonb, p_client uuid,
    p_coa_account_code text, p_bank_code text default null::text,
    p_account_number text default null::text, p_bank_name_display text default null::text,
    p_proposal_id uuid default null::uuid, p_op_key text default null::text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare
  c record; v_dedupe jsonb;
  -- SCALAR, not record: v_prop's SELECT INTO below runs only inside the
  -- `p_proposal_id is not null` branch. A bare RECORD variable whose SELECT INTO
  -- never executes stays genuinely unassigned in PL/pgSQL, and any field access
  -- on it -- even `.foo is null` -- raises "record is not assigned yet" at
  -- runtime; it is NOT the same state a zero-row SELECT INTO leaves behind. Plain
  -- scalars default to NULL when untouched, which is the fallback semantics this
  -- function actually wants for the no-proposal call.
  v_prop_status text; v_prop_bank_code text; v_prop_account_number text;
  v_prop_bank_name_display text;
  v_bank_code text; v_number text; v_house text; v_digits text; v_display text;
  v_id uuid; v_facts jsonb; v_refired jsonb := '[]'::jsonb; v_prop_doc uuid;
  r record; v_con text;
begin
  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the add_bank_account core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_coa_account_code is null or btrim(p_coa_account_code) = '' then
    raise exception 'a target chart account is required' using errcode = 'CLR10';
  end if;
  v_dedupe := clara._reserve_op(c.firm,'add_bank_account',p_op_key,
    clara._hash(jsonb_build_object('client',p_client,'coa_account_code',p_coa_account_code,
      'bank_code',p_bank_code,'account_number',p_account_number,
      'bank_name_display',p_bank_name_display,'proposal_id',p_proposal_id)));
  if v_dedupe is not null then return v_dedupe; end if;

  if not exists (select 1 from clara.clients
      where id = p_client and firm_id = c.firm and status = 'active') then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;

  -- p_proposal_id, when named, is BOTH the identity source for any field left
  -- blank AND the record that closes the loop back to the failed ingest that
  -- raised it. Locked here so a concurrent double-confirm of the same card
  -- serializes rather than double-fires the re-enqueue below.
  if p_proposal_id is not null then
    select status, bank_code, account_number, bank_name_display
      into v_prop_status, v_prop_bank_code, v_prop_account_number, v_prop_bank_name_display
      from clara.bank_account_proposals
      where id = p_proposal_id and firm_id = c.firm and client_id = p_client
      for update;
    if not found then
      raise exception 'bank account proposal % not found for this client', p_proposal_id
        using errcode = 'CLR11';
    end if;
    if v_prop_status <> 'open' then
      raise exception 'bank account proposal % is no longer open', p_proposal_id
        using errcode = 'CLR16', detail = '{"reason":"proposal_already_resolved"}';
    end if;
  end if;

  v_bank_code := coalesce(nullif(btrim(p_bank_code),''), v_prop_bank_code);
  if v_bank_code is null then
    raise exception 'a bank institution code is required' using errcode = 'CLR10',
      detail = '{"reason":"bank_code_required"}';
  end if;
  if not exists (select 1 from clara.bank_institutions where code = v_bank_code and active) then
    raise exception 'bank institution % is not a known active institution', v_bank_code
      using errcode = 'CLR10', detail = '{"reason":"bank_institution_unknown"}';
  end if;

  v_number := coalesce(nullif(btrim(p_account_number),''), v_prop_account_number);
  if v_number is null then
    raise exception 'an account number is required' using errcode = 'CLR10',
      detail = '{"reason":"account_number_required"}';
  end if;
  -- THE ONE NORMALIZATION LAW (design section 4.1). House form: lowercase,
  -- whitespace-stripped, hyphens SURVIVE (0007:1518-1519 verbatim) -- this is
  -- client_identifiers' own predicate and must not drift from it. Digits-only
  -- form is what bank_accounts.account_number_normalized stores and what ingest
  -- binds against.
  v_house := lower(regexp_replace(v_number,'\s+','','g'));
  v_digits := regexp_replace(v_number,'\D','','g');
  if btrim(v_digits) = '' then
    raise exception 'account number % has no digits', v_number using errcode = 'CLR10',
      detail = '{"reason":"account_number_invalid"}';
  end if;

  v_display := coalesce(nullif(btrim(p_bank_name_display),''), v_prop_bank_name_display);
  if v_display is null then
    select name into v_display from clara.bank_institutions where code = v_bank_code;
  end if;
  if v_display is null or btrim(v_display) = '' then
    raise exception 'a display name for this bank account is required' using errcode = 'CLR10',
      detail = '{"reason":"bank_name_display_required"}';
  end if;

  -- COA VALIDATION: "asset-typed/active/non-control" (design section 4.1).
  perform clara._assert_bank_coa_candidate(p_client, p_coa_account_code);

  -- PARTIAL-UNIQUE SEMANTICS, "where active" (design section 4.1): named refusals
  -- for the ordinary case; the insert's own unique_violation catch below is the
  -- concurrent-race backstop, re-deriving which of the two arenas collided.
  if exists (select 1 from clara.bank_accounts
      where client_id = p_client and bank_code = v_bank_code
        and account_number_normalized = v_digits and active) then
    raise exception 'an active bank account with this identity already exists for this client'
      using errcode = 'CLR10', detail = '{"reason":"bank_account_duplicate"}';
  end if;
  if exists (select 1 from clara.bank_accounts
      where client_id = p_client and coa_account_code = p_coa_account_code and active) then
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end if;

  begin
    insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display,
        account_number, account_number_normalized, coa_account_code, active, created_by)
      values (c.firm, p_client, v_bank_code, v_display, v_number, v_digits,
        p_coa_account_code, true, c.actor)
      returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from clara.bank_accounts
        where client_id = p_client and bank_code = v_bank_code
          and account_number_normalized = v_digits and active) then
      raise exception 'an active bank account with this identity already exists for this client'
        using errcode = 'CLR10', detail = '{"reason":"bank_account_duplicate"}';
    end if;
    raise exception 'this chart account is already bound to another active bank account'
      using errcode = 'CLR10', detail = '{"reason":"coa_account_already_bank"}';
  end;

  -- "sets is_bank_account in-txn" (design section 4.1) -- same transaction, same
  -- commit or none.
  update clara.coa_accounts set is_bank_account = true
    where client_id = p_client and account_code = p_coa_account_code;

  -- THE TWO GUARDED client_identifiers INSERTS. Append-only
  -- (t_client_identifiers_append_only, 0007:679-680): if-not-exists, NEVER
  -- upsert. 裁-41 gave the table uq_client_identifiers_client_kind_value, so the
  -- existence check is now the ORDINARY path and each insert also carries the
  -- concurrent-race backstop below -- the same division this function already
  -- uses at its bank_accounts insert. The handler is NARROW (re-raises anything
  -- that is not this index) and it RE-READS the row rather than inferring
  -- presence from the 23505. Both rows carry kind='bank_account', already
  -- CHECK-admitted (0007:227).
  if not exists (select 1 from clara.client_identifiers
      where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
        and value_normalized = v_house) then
    begin
      insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
        values (c.firm,p_client,'bank_account',v_house,c.actor);
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'uq_client_identifiers_client_kind_value' then raise; end if;
      if not exists (select 1 from clara.client_identifiers
          where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
            and value_normalized = v_house) then raise; end if;
    end;
  end if;
  if not exists (select 1 from clara.client_identifiers
      where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
        and value_normalized = v_digits) then
    begin
      insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
        values (c.firm,p_client,'bank_account',v_digits,c.actor);
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'uq_client_identifiers_client_kind_value' then raise; end if;
      if not exists (select 1 from clara.client_identifiers
          where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
            and value_normalized = v_digits) then raise; end if;
    end;
  end if;

  -- THE DEFINER-INTERNAL RE-FIRE (design section 4.3 "account binding order" +
  -- section 1's one-confirmation promise). p_proposal_id's OWN document is
  -- re-fired unconditionally -- confirming THIS card must always close THIS loop,
  -- even if the caller edited an identity field on the way through. Any OTHER
  -- open proposal that now shares the SAME (bank_code, account_number_normalized,
  -- client) -- e.g. three uploads of the same real account that each failed and
  -- each wrote their own card -- rides the general sweep below.
  -- _enqueue_invoice_facts_core is ungranted and owned by clara_fn_owner exactly
  -- like this function, so the call needs no grant of its own (the 0009/0026 CoR
  -- discipline: the core stays reachable only through its callers).
  if p_proposal_id is not null then
    update clara.bank_account_proposals
      set status = 'resolved', resolved_by = c.actor, resolved_at = now(),
          resolved_bank_account_id = v_id
      where id = p_proposal_id and status = 'open'
      returning document_id into v_prop_doc;
    if v_prop_doc is not null then
      v_facts := clara._enqueue_invoice_facts_core(v_prop_doc);
      v_refired := v_refired || jsonb_build_object('document_id',v_prop_doc,
        'task_id',v_facts->>'task_id','status',v_facts->>'status');
    end if;
  end if;

  for r in
    select * from clara.bank_account_proposals
      where firm_id = c.firm and client_id = p_client and bank_code = v_bank_code
        and account_number_normalized = v_digits and status = 'open'
      order by id
      for update
  loop
    update clara.bank_account_proposals
      set status = 'resolved', resolved_by = c.actor, resolved_at = now(),
          resolved_bank_account_id = v_id
      where id = r.id;
    v_facts := clara._enqueue_invoice_facts_core(r.document_id);
    v_refired := v_refired || jsonb_build_object('document_id',r.document_id,
      'task_id',v_facts->>'task_id','status',v_facts->>'status');
  end loop;

  perform clara._audit(c.firm,c.actor,null,null,'add_bank_account',null,
    jsonb_build_object('client',p_client,'bank_account',v_id,
      'coa_account_code',p_coa_account_code,'proposal_id',p_proposal_id,
      'refired_count',jsonb_array_length(v_refired),'op_key',p_op_key));

  -- Payload carries IDs ONLY (design section 4.8: domain_events is
  -- agent-readable firm-wide; the account number never enters an event payload).
  perform clara._append_event(c.firm,'bank.account_created',p_client,c.actor,null,null,
    null,null,null,jsonb_build_object('bank_account_id',v_id));

  return clara._finish_op(c.firm,'add_bank_account',p_op_key,
    jsonb_build_object('bank_account_id',v_id,'client_id',p_client,
      'coa_account_code',p_coa_account_code,'active',true,'refired',v_refired));
end $fn$;

reset role;

-- =====================================================================================
-- SECTION 4 -- TAIL. Every claim re-read from the live catalog, BY PROPERTY (indisunique /
-- indisvalid / key column list), never by name alone -- an index named `uq_*` that is not
-- actually unique is exactly the failure this census exists to catch -- and every "we did not
-- touch it" re-proven as a sha compare.
-- =====================================================================================
do $tail$
declare
  v_src text; v_sha text; v_pre text; v_n int; v_cols text; v_pred text; v_acl text;
  v_uniq boolean; v_props text; v_resub text; v_rows int; v_dups int; v_sigs text;
  v_con text; v_probe text; v_reach_check text;
begin
  -- (1) The new index, BY PROPERTY.
  if to_regclass('clara.uq_client_identifiers_client_kind_value') is null then
    raise exception 'client_identifiers_unique tail: uq_client_identifiers_client_kind_value does not resolve' using errcode = 'CLR10';
  end if;
  select i.indisunique::text || '|' || i.indisvalid::text || '|' || i.indisready::text || '|' || i.indislive::text,
         pg_get_expr(i.indpred, i.indrelid),
         i.indnullsnotdistinct::text,
         (select string_agg(a.attname, ',' order by k.ord)
            from unnest(i.indkey::smallint[]) with ordinality k(att, ord)
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att)
    into v_props, v_pred, v_src, v_cols
    from pg_index i where i.indexrelid = 'clara.uq_client_identifiers_client_kind_value'::regclass;
  if v_props <> 'true|true|true|true' then
    raise exception 'client_identifiers_unique tail: uq_client_identifiers_client_kind_value is not unique+valid+ready+live (got %)', v_props using errcode = 'CLR10';
  end if;
  if v_cols is distinct from 'client_id,kind,value_normalized' then
    raise exception 'client_identifiers_unique tail: key columns are % , expected client_id,kind,value_normalized', coalesce(v_cols,'(none)') using errcode = 'CLR10';
  end if;
  if v_pred is not null then
    raise exception 'client_identifiers_unique tail: the index carries predicate % -- 裁-41''s wall is TOTAL, not partial; a predicate would leave a silent hole', v_pred using errcode = 'CLR10';
  end if;
  if v_src <> 'false' then
    raise exception 'client_identifiers_unique tail: indnullsnotdistinct is % -- expected false, since all three key columns are NOT NULL and the clause would be inert', v_src using errcode = 'CLR10';
  end if;
  -- Exactly ONE unique index was added: 2 before (§0.4), 3 now.
  select count(*) into v_n from pg_index i
   where i.indrelid = 'clara.client_identifiers'::regclass and i.indisunique;
  if v_n <> 3 then
    raise exception 'client_identifiers_unique tail: client_identifiers now carries % unique index(es), expected exactly 3 (pkey + (id,firm_id) + this file''s one)', v_n using errcode = 'CLR10';
  end if;

  -- (2) The pre-existing NON-unique attribution index is UNTOUCHED. A file that "added a unique
  -- wall" by silently promoting the existing index would pass (1) and fail here.
  if to_regclass('clara.ix_client_identifiers_match') is null then
    raise exception 'client_identifiers_unique tail: ix_client_identifiers_match disappeared' using errcode = 'CLR10';
  end if;
  select i.indisunique into v_uniq from pg_index i
   where i.indexrelid = 'clara.ix_client_identifiers_match'::regclass;
  if v_uniq then
    raise exception 'client_identifiers_unique tail: ix_client_identifiers_match became UNIQUE -- sibling clients would be walled out of the same value, which 0007:235 forbids and this file promised not to do' using errcode = 'CLR10';
  end if;
  select v from _cid_uniq_pre where k = 'match_ix_def' into v_pre;
  if pg_get_indexdef('clara.ix_client_identifiers_match'::regclass) is distinct from v_pre then
    raise exception 'client_identifiers_unique tail: ix_client_identifiers_match definition moved (pre %, post %)', v_pre, pg_get_indexdef('clara.ix_client_identifiers_match'::regclass) using errcode = 'CLR10';
  end if;

  -- (3) The table's other posture is unmoved: forced RLS, append-only trigger, the two CHECKs,
  -- and the three key columns still NOT NULL. A wall raised on a table that quietly lost its
  -- append-only trigger in the same file would be worth much less than it looks.
  if not exists (select 1 from pg_class c
      where c.oid = 'clara.client_identifiers'::regclass and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception 'client_identifiers_unique tail: clara.client_identifiers lost forced RLS' using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_trigger t
      where t.tgrelid = 'clara.client_identifiers'::regclass and not t.tgisinternal
        and t.tgname = 't_client_identifiers_append_only' and t.tgenabled <> 'D') then
    raise exception 'client_identifiers_unique tail: t_client_identifiers_append_only is missing or disabled' using errcode = 'CLR10';
  end if;
  select count(*) into v_n from pg_attribute
   where attrelid = 'clara.client_identifiers'::regclass and attnum > 0 and not attisdropped
     and attname in ('client_id','kind','value_normalized') and attnotnull;
  if v_n <> 3 then
    raise exception 'client_identifiers_unique tail: only % of the three key columns are still NOT NULL', v_n using errcode = 'CLR10';
  end if;

  -- (4) clara.add_client_identifier: exactly one overload, unchanged posture, ACL byte-unchanged,
  -- body genuinely CHANGED, and THE SURGICAL-DELTA RE-SUBSTITUTION -- reverse the two named
  -- fragments and the post-image must reproduce the pinned pre-image BYTE-FOR-BYTE. This is the
  -- proof that nothing else in the body moved; a wall-string spot check could not say that.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = 'add_client_identifier';
  if v_n <> 1 then
    raise exception 'client_identifiers_unique tail: expected exactly ONE add_client_identifier overload, found %', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara.add_client_identifier(uuid,text,text,text)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'client_identifiers_unique tail: add_client_identifier is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara.add_client_identifier(uuid,text,text,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  select v from _cid_uniq_pre where k = 'aci_acl' into v_pre;
  if v_acl is distinct from v_pre then
    raise exception 'client_identifiers_unique tail: add_client_identifier ACL moved (pre %, post %)', v_pre, v_acl using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.add_client_identifier(uuid,text,text,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  select v from _cid_uniq_pre where k = 'aci_sha' into v_pre;
  if v_sha = v_pre then
    raise exception 'client_identifiers_unique tail: add_client_identifier body did NOT change -- the CREATE OR REPLACE was a no-op' using errcode = 'CLR10';
  end if;
  if position('uq_client_identifiers_client_kind_value' in v_src) = 0
     or position('get stacked diagnostics v_con = constraint_name' in v_src) = 0
     or position('if v_con is distinct from ''uq_client_identifiers_client_kind_value'' then raise; end if' in v_src) = 0
     or position('this identifier is already recorded for this client' in v_src) = 0
     or position('"reason":"already_recorded","class":"identifier"' in v_src) = 0 then
    raise exception 'client_identifiers_unique tail: add_client_identifier is missing its narrow handler, its re-raise, or its typed refusal' using errcode = 'CLR10';
  end if;
  -- ...and every prior rung survives, measured POSITIONALLY where order is the invariant: the
  -- op-key reservation still happens BEFORE the client check, which is what makes an op-key
  -- replay return the cached receipt without ever reaching the new index.
  if position('clara._human_ctx(clara.role_rank(''bookkeeper''))' in v_src) = 0
     or position('op_key is required' in v_src) = 0
     or position('client not in your firm' in v_src) = 0
     or position('clara._reserve_op(c.firm,''add_client_identifier'',p_op_key' in v_src) = 0
     or position('clara._reserve_op(c.firm,''add_client_identifier'',p_op_key' in v_src)
        > position('client not in your firm' in v_src) then
    raise exception 'client_identifiers_unique tail: add_client_identifier lost a prior wall, or its op reservation no longer precedes the client check' using errcode = 'CLR10';
  end if;
  select v from _cid_uniq_pre where k = 'aci_src' into v_pre;
  v_resub := replace(v_src,
    'declare c record; v_dedupe jsonb; v_id uuid; v_con text;',
    'declare c record; v_dedupe jsonb; v_id uuid;');
  v_resub := replace(v_resub, $f1$  -- 裁-41: uq_client_identifiers_client_kind_value's 23505 becomes the estate's typed refusal
  -- here, in the ONE audited door that mints an identity row, so both confirm doors inherit it
  -- without a body change of their own. NARROW: anything that is not this index's violation is
  -- re-raised untouched, so an unrelated collision is never swallowed or relabelled.
  begin
    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values(c.firm,p_client,p_kind,lower(regexp_replace(p_value_normalized,'\s+','','g')),c.actor) returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con is distinct from 'uq_client_identifiers_client_kind_value' then raise; end if;
    raise exception 'this identifier is already recorded for this client'
      using errcode = 'CLR10',
        detail = '{"reason":"already_recorded","class":"identifier"}';
  end;$f1$, $f2$  insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
    values(c.firm,p_client,p_kind,lower(regexp_replace(p_value_normalized,'\s+','','g')),c.actor) returning id into v_id;$f2$);
  -- Compared BYTE-FOR-BYTE against the stashed pre-image text, not sha-to-sha: identical bytes
  -- imply an identical sha, and the reverse implication is the one worth not relying on.
  if v_resub is distinct from v_pre then
    raise exception 'client_identifiers_unique tail: the add_client_identifier surgical-delta re-substitution did NOT reproduce the pinned pre-image (re-substituted sha % vs pinned %) -- something OTHER than the declared delta changed in this body',
      encode(sha256(convert_to(v_resub,'UTF8')),'hex'), (select v from _cid_uniq_pre where k = 'aci_sha')
      using errcode = 'CLR10';
  end if;

  -- (5) clara._add_bank_account_core: the same treatment. Three fragments reversed, and the
  -- pre-image -- which exists in no file, only in 0119's splice -- must come back byte-for-byte.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace and p.proname = '_add_bank_account_core';
  if v_n <> 1 then
    raise exception 'client_identifiers_unique tail: expected exactly ONE _add_bank_account_core overload, found %', v_n using errcode = 'CLR10';
  end if;
  if not exists (select 1 from pg_proc p
      where p.oid = 'clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)'::regprocedure
        and p.prosecdef and coalesce(array_to_string(p.proconfig,'|'),'') like '%search_path=%'
        and p.proowner = 'clara_fn_owner'::regrole) then
    raise exception 'client_identifiers_unique tail: _add_bank_account_core is not SECURITY DEFINER + pinned search_path + owned by clara_fn_owner' using errcode = 'CLR10';
  end if;
  select coalesce(array_to_string(array(
    select a.grantee::regrole::text || '=' || a.privilege_type
      from aclexplode((select coalesce(p.proacl, acldefault('f', p.proowner)) from pg_proc p
                        where p.oid = 'clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)'::regprocedure)) a
     order by 1), ','), '(none)') into v_acl;
  select v from _cid_uniq_pre where k = 'abac_acl' into v_pre;
  if v_acl is distinct from v_pre then
    raise exception 'client_identifiers_unique tail: _add_bank_account_core ACL moved (pre %, post %) -- it must stay UNGRANTED', v_pre, v_acl using errcode = 'CLR10';
  end if;
  -- Reachable by NO application role, measured through has_function_privilege rather than read
  -- off an ACL string (0148's own instrument).
  select coalesce(string_agg(r.rolname, ',' order by r.rolname), '(none)') into v_reach_check
    from pg_roles r
   where r.rolname in ('clara_authenticated','clara_runtime','clara_wake_bank','clara_wake_filing','clara_wake_interactive')
     and has_function_privilege(r.rolname, 'clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)'::regprocedure, 'EXECUTE');
  if v_reach_check <> '(none)' then
    raise exception 'client_identifiers_unique tail: _add_bank_account_core became reachable by % -- it is an UNGRANTED core', v_reach_check using errcode = 'CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  select v from _cid_uniq_pre where k = 'abac_sha' into v_pre;
  if v_sha = v_pre then
    raise exception 'client_identifiers_unique tail: _add_bank_account_core body did NOT change -- the CREATE OR REPLACE was a no-op' using errcode = 'CLR10';
  end if;
  -- Its prior walls all survive, including the OTHER unique_violation handler this file did not
  -- touch, and the two normalization forms the guarded inserts key on.
  if position('the add_bank_account core requires an actor and a firm in its context' in v_src) = 0
     or position('bank institution % is not a known active institution' in v_src) = 0
     or position('account number % has no digits' in v_src) = 0
     or position('an active bank account with this identity already exists for this client' in v_src) = 0
     or position('this chart account is already bound to another active bank account' in v_src) = 0
     or position('perform clara._assert_bank_coa_candidate(p_client, p_coa_account_code)' in v_src) = 0
     or position('v_house := lower(regexp_replace(v_number,''\s+'','''',''g''))' in v_src) = 0
     or position('v_digits := regexp_replace(v_number,''\D'','''',''g'')' in v_src) = 0
     or position('clara._enqueue_invoice_facts_core' in v_src) = 0 then
    raise exception 'client_identifiers_unique tail: _add_bank_account_core lost one of its prior walls' using errcode = 'CLR10';
  end if;
  -- ...and BOTH guarded inserts carry the narrow handler AND its re-read (2 of each).
  select (length(v_src) - length(replace(v_src, 'if v_con is distinct from ''uq_client_identifiers_client_kind_value'' then raise; end if', '')))
         / length('if v_con is distinct from ''uq_client_identifiers_client_kind_value'' then raise; end if')
    into v_n;
  if v_n <> 2 then
    raise exception 'client_identifiers_unique tail: _add_bank_account_core carries % narrow re-raise guard(s), expected 2 (one per guarded client_identifiers insert)', v_n using errcode = 'CLR10';
  end if;
  select v from _cid_uniq_pre where k = 'abac_src' into v_pre;
  v_resub := replace(v_src, '  r record; v_con text;', '  r record;');
  v_resub := replace(v_resub, $g1$  -- THE TWO GUARDED client_identifiers INSERTS. Append-only
  -- (t_client_identifiers_append_only, 0007:679-680): if-not-exists, NEVER
  -- upsert. 裁-41 gave the table uq_client_identifiers_client_kind_value, so the
  -- existence check is now the ORDINARY path and each insert also carries the
  -- concurrent-race backstop below -- the same division this function already
  -- uses at its bank_accounts insert. The handler is NARROW (re-raises anything
  -- that is not this index) and it RE-READS the row rather than inferring
  -- presence from the 23505. Both rows carry kind='bank_account', already
  -- CHECK-admitted (0007:227).$g1$, $g2$  -- THE TWO GUARDED client_identifiers INSERTS. Append-only
  -- (t_client_identifiers_append_only, 0007:679-680): if-not-exists, NEVER
  -- upsert -- there is no unique index to ON CONFLICT against, deliberately
  -- (0007:235-237, sibling-client conflicts must stay representable), so the
  -- guard is an explicit existence check. Both rows carry kind='bank_account',
  -- already CHECK-admitted (0007:227).$g2$);
  v_resub := replace(v_resub, $g3$    begin
      insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
        values (c.firm,p_client,'bank_account',v_house,c.actor);
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'uq_client_identifiers_client_kind_value' then raise; end if;
      if not exists (select 1 from clara.client_identifiers
          where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
            and value_normalized = v_house) then raise; end if;
    end;$g3$, $g4$    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values (c.firm,p_client,'bank_account',v_house,c.actor);$g4$);
  v_resub := replace(v_resub, $g5$    begin
      insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
        values (c.firm,p_client,'bank_account',v_digits,c.actor);
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'uq_client_identifiers_client_kind_value' then raise; end if;
      if not exists (select 1 from clara.client_identifiers
          where firm_id = c.firm and client_id = p_client and kind = 'bank_account'
            and value_normalized = v_digits) then raise; end if;
    end;$g5$, $g6$    insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
      values (c.firm,p_client,'bank_account',v_digits,c.actor);$g6$);
  if v_resub is distinct from v_pre then
    raise exception 'client_identifiers_unique tail: the _add_bank_account_core surgical-delta re-substitution did NOT reproduce the pinned pre-image (re-substituted sha % vs pinned %) -- something OTHER than the declared delta changed in this body',
      encode(sha256(convert_to(v_resub,'UTF8')),'hex'), (select v from _cid_uniq_pre where k = 'abac_sha')
      using errcode = 'CLR10';
  end if;

  -- (6) The four DO-NOT-TOUCH bodies are BYTE-IDENTICAL to their prestate pins. "We did not
  -- change the confirm doors" is a measurement here, not a promise in a comment.
  for v_pre, v_sha in
    select substring(k from 11), v from _cid_uniq_pre where k like 'untouched:%' order by k
  loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_src
      from pg_proc p where p.oid = v_pre::regprocedure;
    if v_src is distinct from v_sha then
      raise exception 'client_identifiers_unique tail: % CHANGED -- pre %, post % (this file must not have touched it)', v_pre, v_sha, coalesce(v_src,'(gone)') using errcode = 'CLR10';
    end if;
  end loop;

  -- (7) THE PROSRC-TEXT WRITER CENSUS, RE-RUN. Same instrument as §0.8 (and the same stated
  -- limits): the set of clara functions naming a DML against this table is still exactly the two
  -- this file mapped, and both now carry the narrow handler.
  select coalesce(string_agg(sig, ', ' order by sig), '(none)'), count(*)
    into v_sigs, v_n
    from (select p.oid::regprocedure::text as sig
            from pg_proc p
           where p.pronamespace = 'clara'::regnamespace
             and p.prosrc ~* '(insert[[:space:]]+into|merge[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(clara[[:space:]]*\.[[:space:]]*)?client_identifiers([^A-Za-z0-9_]|$)') w;
  if v_n <> 2 then
    raise exception 'client_identifiers_unique tail: the writer census reads % function(s), expected 2. Found: %', v_n, v_sigs using errcode = 'CLR10';
  end if;
  -- MATCHED ON THE GUARD LINE, NOT THE BARE NAME. Both bodies also mention the index in a COMMENT,
  -- so a body that had lost its handler entirely would still satisfy a bare-name probe -- which
  -- would then let this very notice claim "both carry a narrow handler" over a body that does not.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'clara'::regnamespace
     and p.prosrc ~* '(insert[[:space:]]+into|merge[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(clara[[:space:]]*\.[[:space:]]*)?client_identifiers([^A-Za-z0-9_]|$)'
     and p.prosrc like '%if v_con is distinct from ''uq_client_identifiers_client_kind_value'' then raise; end if%'
     and p.prosrc like '%get stacked diagnostics v_con = constraint_name%';
  if v_n <> 2 then
    raise exception 'client_identifiers_unique tail: only % of the 2 writers carry the NARROW re-raise guard line (a comment naming the index does not count)', v_n using errcode = 'CLR10';
  end if;

  -- (8a) THE INSTRUMENT PROBE -- MANDATORY, and it fails this migration if it fails. Both narrow
  -- handlers rest on one premise that no catalog read can establish: that a violation of a plain
  -- UNIQUE INDEX (as opposed to a table CONSTRAINT, which owns a pg_constraint row) populates
  -- `constraint_name` in GET STACKED DIAGNOSTICS with the INDEX's name. If it did not, both
  -- handlers' `is distinct from` test would be true, both would re-`raise`, and the wall would
  -- ship untyped while every structural check above still passed. Proven here, live, in this
  -- transaction, on a temp table with the identical index shape -- never taken on faith.
  declare
    v_probe_con text;
  begin
    create temp table _cid_uniq_instrument(a uuid, b text, c text) on commit drop;
    create unique index uq_cid_uniq_instrument_probe on _cid_uniq_instrument(a,b,c);
    insert into _cid_uniq_instrument values ('00000000-0000-0000-0000-000000000001','k','v');
    v_probe_con := '<no violation raised>';
    begin
      insert into _cid_uniq_instrument values ('00000000-0000-0000-0000-000000000001','k','v');
    exception when unique_violation then
      get stacked diagnostics v_probe_con = constraint_name;
    end;
    if v_probe_con is distinct from 'uq_cid_uniq_instrument_probe' then
      raise exception 'client_identifiers_unique tail: a plain UNIQUE INDEX violation reported constraint_name = % , not the index name -- both narrow handlers would re-raise instead of refusing and the wall would ship UNTYPED on this server', coalesce(v_probe_con,'<null>')
        using errcode = 'CLR10';
    end if;
  end;

  -- (8b) THE LIVE BEHAVIOURAL PROBE against the REAL index, built and DISCARDED in a
  -- forced-rollback subtransaction. It asserts what pg_index cannot: that a second identical
  -- (client, kind, value) really is refused with 23505 naming THIS index, that a different value
  -- is still admitted, and that the SAME value on a DIFFERENT client -- 0007:235's sibling
  -- conflict -- is still admitted. BEST EFFORT by design: it needs a real (client, user) pair to
  -- hang rows on, and a fresh chain has none (CI migrates BEFORE it seeds); a ceremony login that
  -- is neither superuser nor clara_fn_owner is refused by this table's forced RLS. Either way the
  -- notice SAYS which branch ran and why -- silence is never allowed to read as success, and the
  -- door-level behaviour is proven for real by tests/client-identifiers-unique.test.mjs.
  v_probe := 'not exercised (no clara.clients + clara.users pair on this database yet)';
  begin
    declare
      v_c uuid; v_f uuid; v_u uuid; v_c2 uuid;
      v_val text := 'zzprobe' || replace(gen_random_uuid()::text,'-','');
      v_hit boolean; v_admitted boolean; v_state text;
    begin
      select c.id, c.firm_id into v_c, v_f from clara.clients c order by c.id limit 1;
      select u.id into v_u from clara.users u order by u.id limit 1;
      select c.id into v_c2 from clara.clients c where c.firm_id = v_f and c.id <> v_c order by c.id limit 1;
      if v_c is not null and v_u is not null then
        insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
          values (v_f, v_c, 'tin', v_val, v_u);
        v_hit := false;
        begin
          insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
            values (v_f, v_c, 'tin', v_val, v_u);
        exception when unique_violation then
          get stacked diagnostics v_con = constraint_name;
          v_hit := (v_con is not distinct from 'uq_client_identifiers_client_kind_value');
        end;
        if not v_hit then
          raise exception 'client_identifiers_unique tail: the live probe did NOT refuse a duplicate (client,kind,value) naming uq_client_identifiers_client_kind_value (constraint_name was %) -- the wall is not doing what this file claims', coalesce(v_con,'<no violation raised>')
            using errcode = 'CLR10';
        end if;
        insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
          values (v_f, v_c, 'tin', v_val || 'x', v_u);
        v_admitted := false;
        if v_c2 is not null then
          insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
            values (v_f, v_c2, 'tin', v_val, v_u);
          v_admitted := true;
        end if;
        v_probe := 'PASSED (duplicate refused as 23505 naming uq_client_identifiers_client_kind_value; a different value on the same client ADMITTED; the same value on a sibling client ' ||
          (case when v_admitted then 'ADMITTED' else 'not exercised -- only one client on this database' end) || '); all probe rows discarded';
        raise exception 'client_identifiers_unique probe rollback' using errcode = 'CLR99';
      end if;
    end;
  exception
    when sqlstate 'CLR99' then null; -- the probe's own forced rollback; every row it wrote is discarded
    when sqlstate 'CLR10' then raise; -- a genuine wall failure above is NOT swallowed here
    -- A 23505 REACHING HERE IS A WALL-TOO-BROAD FINDING, NOT A SKIP. Two of the probe's
    -- statements are ADMITTING controls (a different value on the same client; the same value on
    -- a SIBLING client). Their whole purpose is to fail if the index refuses more than 裁-41 says
    -- it should -- and the `when others` arm below would have reported exactly that as a benign
    -- "not exercised", passing the migration. The FIRST insert cannot collide (v_val is
    -- gen_random_uuid()-derived and the duplicate attempt is caught by its own inner handler), so
    -- a unique_violation escaping to here can only mean an admitting control was walled.
    when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      raise exception 'client_identifiers_unique tail: an ADMITTING control in the live probe was REFUSED by % -- the wall is BROADER than 裁-41 (a different value on one client, or the same value on a sibling client, must both still be admitted)', coalesce(v_con,'<unnamed>')
        using errcode = 'CLR10';
    when others then
      get stacked diagnostics v_con = returned_sqlstate;
      v_probe := 'not exercised (the probe''s own scaffolding raised ' || coalesce(v_con,'?') ||
                 ' -- e.g. forced RLS under a non-owner ceremony login; the structural census above still stands and the door-level proof is in the rig battery)';
  end;

  select count(*) into v_rows from clara.client_identifiers;
  select count(*) into v_dups from (select 1 from clara.client_identifiers
    group by client_id, kind, value_normalized having count(*) > 1) d;

  raise notice 'client_identifiers_unique tail: OK -- uq_client_identifiers_client_kind_value (client_id,kind,value_normalized) is unique+valid+ready+live with NO predicate and indnullsnotdistinct=false, censused BY PROPERTY (indisunique/indisvalid/indisready/indislive + key column list + predicate), never by name; client_identifiers now carries exactly 3 unique indexes (was 2). The NON-unique ix_client_identifiers_match is byte-identical to its prestate definition and still NOT unique, so sibling-client conflicts stay representable. Forced RLS, the append-only trigger and the three NOT NULL key columns are unmoved. BOTH recut bodies changed genuinely, keep their exact prior ACLs and their SECURITY DEFINER/search_path/clara_fn_owner posture, keep every prior wall string (add_client_identifier''s op reservation re-measured POSITIONALLY as still preceding its client check), and each SURGICAL-DELTA RE-SUBSTITUTION reproduces its pinned pre-image BYTE-FOR-BYTE -- including _add_bank_account_core, whose pre-image exists in no file because 0119 spliced it. _add_bank_account_core is still reachable by NO application role (measured through has_function_privilege). The 4 DO-NOT-TOUCH bodies (confirm_identifier_promotion, _confirm_bank_identifier_promotion_core, _identifier_promotion_core, _claim_identity_core) are byte-identical to their pins. The CLOSED-WORLD writer census still reads exactly 2 functions and BOTH name the index in a narrow handler. Behavioural probe: %. LIVE CENSUS (report-only): % client_identifiers row(s), % duplicate group(s). D1 OWED: clara.add_client_identifier(uuid,text,text,text), clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text). No table in workflow/graphile_worker/spike touched.',
    v_probe, v_rows, v_dups;
end $tail$;
