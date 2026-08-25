-- =====================================================================================
-- F-A5b PR-1 fast-follow -- clara._sandbox_client_set's `freeform_read` BASIS ARM is trued
-- to F-A6 PR-1's LIVE column shape. A CoR recut: 0132 created this body; this file replaces
-- that result in place, changing NOTHING else about it.
--
-- WHY A NEW FILE RATHER THAN AN EDIT TO 0132. 0132 is applied history (merged to main as
-- ebdc693, #345). `.claude/rules/db-migrations.md`: "Applied files are immutable. The runner
-- records each file's sha256, so editing an applied migration trips a checksum-drift error.
-- Fix forward with a new file." So: fix forward.
--
-- ------------------------------------------------------------------------------------------
-- WHAT IS WRONG, AND HOW IT GOT THERE
-- ------------------------------------------------------------------------------------------
-- 0132 authored its `freeform_read` basis arm against `origin/main` BEFORE 0131 merged -- its
-- own header says so: "clara.freeform_read_log on origin/main at authoring time (fresh fetch)
-- is still the bare 0002" (0132:56). On the MERGED chain 0131 lands first, and the arm is cut
-- against a shape that never existed. Three defects came out of that one root cause; the
-- first was fixed pre-merge (the tail count, at f7c357b), and these two are what this file
-- fixes forward:
--
--   (a) THE BASIS KIND IS UNREACHABLE. `clara.freeform_read_log.id` is `bigint generated
--       always as identity` (0002:309) -- 0131 hardens firm_id/credential_id/query_text/
--       purpose and ADDS thirteen columns, but it never touches `id`. 0132's per-element id
--       gate forces EVERY basis element's id through a uuid regex and then casts `::uuid`
--       (0132:604-607, 621). A real freeform receipt id is a decimal integer, which the uuid
--       regex rejects, so every `kind='freeform_read'` basis refuses CLR10 'a basis element
--       carries a malformed id' before it can ever resolve. Fail-CLOSED -- no wrong number
--       reached a durable artifact -- but the entire product arm is dead.
--
--   (b) A TYPE ERROR HIDING BEHIND (a). The arm declares `v_fr_client_scope uuid` (0132:572)
--       while the live column is `client_scope uuid[]` (0131:519 -- deliberately an array, so
--       F-A6 v2's cross-client receipt can NAME its own scope). `select ... into` a scalar
--       from a uuid[] column raises 42804 at RUNTIME. It is dead code behind (a) today and
--       would have RAISED the day (a) alone was fixed.
--
-- THE CLASS. 0132's own header claims the body "re-verifies the live column set in ITS OWN
-- body". It does -- but the in-body probe (0132:589-591) measures column PRESENCE only:
-- `exists(... where table_name='freeform_read_log' and column_name='scope')`. Presence is a
-- projection of the shape, not the shape. This is the estate's spelling-is-not-identity law
-- (AGENTS.md, review law 3) landing on a COLUMN rather than an identifier. The remedy is
-- structural and lives in this file's own PRESTATE: every type this body depends on is
-- MEASURED from pg_attribute at deploy, and a mismatch ABORTS.
--
-- ------------------------------------------------------------------------------------------
-- THE FIX -- FOUR SUBSTITUTIONS, AND ONLY FOUR
-- ------------------------------------------------------------------------------------------
--   A. `v_fr_client_scope uuid` -> `uuid[]`, plus a new `v_id_wellformed boolean` local.
--   B. The per-element id gate becomes PER-KIND: `freeform_read` validates a bigint literal
--      (digits, no sign, no leading zero, inside int8's range, proved WITHOUT casting an
--      unvalidated string); every other kind keeps the uuid rule as the DEFAULT branch, so an
--      unrecognised kind still refuses at the same point, in the same order, with the same
--      token. THE WALL IS NOT WEAKENED: a genuinely malformed freeform id ('abc', '', a uuid
--      string, a 20-digit overflow) still refuses CLR10 sandbox_view_basis_unknown -- what
--      changes is only WHICH literal grammar counts as well-formed for which relation's key.
--   C. + D. The two `freeform_read_log` lookups cast `::bigint`, not `::uuid`.
--   D. The client-pinned derivation appends the WHOLE array. Per the design's own rule table
--      (docs/plan/active/sandbox-export-design.md:172-173) a client-pinned read contributes
--      `client_scope` -- exact -- and v2's cross-client read contributes "the receipt's named
--      client set" -- exact. Both are the same operation on a uuid[]: UNION every element.
--      Coverage widens with cardinality and never narrows to the first element, which is
--      0132's own Tier-A interim principle ("coverage can only widen ... never narrow it below
--      what the exact derivation already proved", 0132:552-554). On THIS chain the union is
--      always a single client: F-A6 v1's ck_freeform_scope_client (0131:550-553) forces
--      cardinality exactly 1 and forbids a NULL element on a scope='client' row, and any other
--      scope value is caught by the 'firm' arm or refused by the cross-client arm. The set
--      form is what makes the arm still CORRECT when v2 widens the cardinality.
--      F7's NULL guard is EXTENDED to the array shape (null, empty, or carrying a NULL element
--      all refuse), never relaxed.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT CHANGE.
--   * The Annex-K availability probe (0132:589-591) keeps its exact semantics and its exact
--     refusal. It answers "has F-A6 PR-1 landed", which is a PRESENCE question, and presence is
--     the right instrument for it. The TYPE question it was mistaken for is answered by this
--     file's prestate, at deploy, where a mismatch can abort instead of mis-refusing at runtime.
--   * No `settled_at` conjunct is added to the basis lookup, and this is a positive finding
--     rather than an omission. An ARMED-but-unsettled receipt can never COMMIT: 0131's
--     `t_freeform_must_settle` (0131:628-641) is a DEFERRABLE INITIALLY DEFERRED constraint
--     trigger that re-reads the row at commit and raises CLR10 if `settled_at is null`. Every
--     row this body can see from any other transaction is therefore settled by construction,
--     and the design's own requirement is that the set be "a pure function of durable rows"
--     (design §3.2, P-3) -- which is exactly what that trigger already guarantees. The battery
--     PROVES this rather than asserting it (cell fix.fr.unsettled-cannot-commit): it inserts an
--     unsettled row and shows the COMMIT is refused.
--   * The `cross_client` refusal, the firm_closure arm, the preview_cell arm, the label
--     uniqueness/blankness walls, A1(iii)'s free-text widening and the NT-1 exact-set return
--     are all untouched, byte for byte. The tail's byte-diff is what proves that claim.
--
-- ------------------------------------------------------------------------------------------
-- D1 WRITE-QUIESCE OBLIGATION -- NOT OWED, and stated precisely rather than waved through.
-- This file replaces one function body. That body is `clara._sandbox_client_set`, created by
-- 0132, which has NOT shipped to the live project: the live ceremony's frontier predates it,
-- so no in-flight call can span this migration and there are no in-flight callers to strand.
-- The general rule still stands for the ceremony that first ships 0132 and this file together
-- (packages/db/README.md, "Deploy contract"); it is simply vacuous here because the writer has
-- never run in production. If that premise is ever false at ceremony time -- if 0132 shipped
-- ahead of this file -- then D1 IS owed, because PostgreSQL runs an in-flight PL/pgSQL call to
-- completion on the body it STARTED with and a mint spanning the migration would silently keep
-- the broken arm. Nothing else in this file writes, drops, grants or alters anything.
--
-- NUMBERING. Numbers are claimed at MERGE time. This file authors as 0136 because the train
-- slots it behind G1's 0133 and F-A3 PR-3's 0134, both unmerged at authoring; a branch cut
-- from main sees 0132 -> 0136. The runner applies in numeric order and forbids duplicates, not
-- gaps, so the 0135 gap is validation-safe. If the train reorders, RENUMBER AT MERGE -- nothing
-- in this file, and nothing in its battery (which gates on the CATALOG, never on a filename or
-- a schema_migrations row), depends on its own number.
--
-- No statement_timeout pin: this replaces one function body and reads pg_proc and pg_attribute
-- a handful of times. There is no scan and no lock beyond the body's own, so a timeout here
-- would be decorative.
-- =====================================================================================

do $fa5b_frtypes$
declare
  -- ---------------------------------------------------------------------------------------
  -- THE FOUR SEARCH TARGETS, transcribed from 0132's body. Each is matched against the LIVE
  -- prosrc read from the catalog below -- never against a whole-body literal, so this file
  -- cannot silently erase a LATER migration's own patch on some other part of the same body
  -- (the F-A3/PR-1b superseded-body lesson, extended to the author at F-A3/PR-1b's close:
  -- a CoR built from a migration's FILE TEXT rather than the live catalog erased a later
  -- dynamic patch on that body).
  -- ---------------------------------------------------------------------------------------
  v_old_a text := $a0$  v_fr_scope text; v_fr_client_scope uuid;$a0$;
  v_new_a text := $a1$  v_fr_scope text; v_fr_client_scope uuid[];
  v_id_wellformed boolean;$a1$;

  v_old_b text := $b0$    v_label_id := v_basis_elem ->> 'id';
    if v_label_id is null or v_label_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'a basis element carries a malformed id' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
    end if;

    v_basis_kind := v_basis_elem ->> 'kind';$b0$;
  v_new_b text := $b1$    v_label_id := v_basis_elem ->> 'id';
    v_basis_kind := v_basis_elem ->> 'kind';
    -- ID WELL-FORMEDNESS IS PER-KIND, because the two cited relations do not share a key type:
    -- clara.metric_cells.id is uuid, clara.freeform_read_log.id is a bigint identity sequence
    -- (0002:309 -- F-A6 PR-1 hardens the other columns and adds thirteen, but never touches id).
    -- The uuid rule stays the DEFAULT branch, so an element whose kind is unrecognised still
    -- refuses HERE, in the same order and with the same token as before this recut.
    if v_basis_kind = 'freeform_read' then
      -- Digits only, no sign, no leading zero. int8's ceiling 9223372036854775807 is 19 digits,
      -- so only a 19-digit candidate can overflow, and for two digit strings of EQUAL length the
      -- lexicographic and the numeric orders agree -- an exact range test that never casts an
      -- unvalidated string (a cast inside the test could raise the raw 22P02/22003 this wall
      -- exists to pre-empt). Two statements, not one conjunction: SQL does not promise
      -- left-to-right short-circuit inside a boolean expression, and coalesce() keeps the
      -- fail-closed reading local rather than derived from three-valued reasoning.
      v_id_wellformed := coalesce(v_label_id is not null
                                  and v_label_id ~ '^(0|[1-9][0-9]{0,18})$', false);
      if v_id_wellformed and length(v_label_id) = 19 and v_label_id > '9223372036854775807' then
        v_id_wellformed := false;
      end if;
    else
      v_id_wellformed := coalesce(v_label_id is not null
        and v_label_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', false);
    end if;
    if not v_id_wellformed then
      raise exception 'a basis element carries a malformed id' using errcode = 'CLR10',
        detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_label)::text;
    end if;$b1$;

  v_old_c text := $c0$      if not exists(select 1 from clara.freeform_read_log where id = v_label_id::uuid and firm_id = p_firm) then$c0$;
  v_new_c text := $c1$      if not exists(select 1 from clara.freeform_read_log where id = v_label_id::bigint and firm_id = p_firm) then$c1$;

  v_old_d text := $d0$      select scope, client_scope into v_fr_scope, v_fr_client_scope
        from clara.freeform_read_log where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
      if v_fr_scope = 'client' then
        if v_fr_client_scope is null then
          raise exception 'a client-scoped freeform read carries no client' using errcode = 'CLR11',
            detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref)::text;
        end if;
        v_client_set := v_client_set || v_fr_client_scope;$d0$;
  v_new_d text := $d1$      select scope, client_scope into v_fr_scope, v_fr_client_scope
        from clara.freeform_read_log where id = (v_basis_elem ->> 'id')::bigint and firm_id = p_firm;
      if v_fr_scope = 'client' then
        -- client_scope is uuid[] (0131:519), NOT a scalar: the receipt NAMES the set it read
        -- across, so the derivation is the UNION of every element -- coverage widens with
        -- cardinality and never narrows to the first. The design's rule table says
        -- "client_scope -- exact" for the client-pinned row and "the receipt's named client set
        -- -- exact" for v2's cross-client row (sandbox-export-design.md:172-173); on a uuid[]
        -- those are one operation. On THIS chain the union is always exactly one client --
        -- ck_freeform_scope_client (0131:550-553) forces cardinality 1 and forbids a NULL
        -- element on a scope='client' row -- and the set form is what keeps the arm correct
        -- when F-A6 v2 widens that cardinality without re-cutting either rule.
        -- F7's NULL guard, EXTENDED to the array shape and never relaxed: null, empty, or
        -- carrying a NULL element are each an UNNAMEABLE set, i.e. the unknown, and take the
        -- same no-oracle token every other unresolved basis gets.
        if v_fr_client_scope is null
           or coalesce(array_length(v_fr_client_scope, 1), 0) = 0
           or array_position(v_fr_client_scope, null) is not null then
          raise exception 'a client-scoped freeform read carries no client' using errcode = 'CLR11',
            detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref)::text;
        end if;
        v_client_set := v_client_set || v_fr_client_scope;$d1$;

  v_sig text := 'clara._sandbox_client_set(uuid,jsonb,jsonb)';
  v_oid oid; v_def text; v_head text;
  v_pre text; v_post text; v_expected text; v_occ int;
  v_type text;
begin
  -- =======================================================================================
  -- PRESTATE (0) -- THE TYPES, MEASURED. This is the check whose ABSENCE is the whole defect:
  -- 0132 measured a column's PRESENCE and called it the shape. Every type this body's arms
  -- depend on is read from pg_attribute and asserted by NAME AND TYPE. A mismatch aborts --
  -- the migration refuses to install a body cut against a shape the database does not have.
  -- =======================================================================================
  if to_regclass('clara.freeform_read_log') is null then
    raise exception '0136: clara.freeform_read_log does not exist -- F-A6 PR-1 (0131) is not on this chain'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.metric_cells') is null then
    raise exception '0136: clara.metric_cells does not exist -- the preview_cell arm has no relation to read'
      using errcode='CLR10';
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
   where a.attrelid = 'clara.freeform_read_log'::regclass and a.attname = 'id' and not a.attisdropped;
  if v_type is distinct from 'bigint' then
    raise exception '0136: clara.freeform_read_log.id is % , not bigint -- the recut''s numeric id gate is cut against the wrong shape; re-derive before patching', coalesce(v_type,'ABSENT')
      using errcode='CLR10';
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
   where a.attrelid = 'clara.freeform_read_log'::regclass and a.attname = 'client_scope' and not a.attisdropped;
  if v_type is distinct from 'uuid[]' then
    raise exception '0136: clara.freeform_read_log.client_scope is % , not uuid[] -- the recut''s union derivation is cut against the wrong shape; re-derive before patching', coalesce(v_type,'ABSENT')
      using errcode='CLR10';
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
   where a.attrelid = 'clara.freeform_read_log'::regclass and a.attname = 'scope' and not a.attisdropped;
  if v_type is distinct from 'text' then
    raise exception '0136: clara.freeform_read_log.scope is % , not text -- 0132''s Annex-K availability probe and both scope arms read it', coalesce(v_type,'ABSENT')
      using errcode='CLR10';
  end if;

  -- The DEFAULT branch's premise, measured with the same instrument: the uuid rule this recut
  -- KEEPS is only right because the relation it guards is still uuid-keyed.
  select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
   where a.attrelid = 'clara.metric_cells'::regclass and a.attname = 'id' and not a.attisdropped;
  if v_type is distinct from 'uuid' then
    raise exception '0136: clara.metric_cells.id is % , not uuid -- the recut keeps the uuid rule as the DEFAULT id gate, which that premise is what makes correct', coalesce(v_type,'ABSENT')
      using errcode='CLR10';
  end if;
  raise notice '0136 prestate (types): freeform_read_log.id=bigint, .client_scope=uuid[], .scope=text, metric_cells.id=uuid -- all four MEASURED from pg_attribute, none assumed.';

  -- =======================================================================================
  -- PRESTATE (1) -- the body resolves at its exact signature and splits uniquely.
  -- =======================================================================================
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception '0136: clara._sandbox_client_set does not resolve at its exact pinned signature -- F-A5b PR-1 (0132) is not on this chain'
      using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_pre from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_pre || '$function$' || E'\n' then
    raise exception '0136: clara._sandbox_client_set does not split at the AS $function$ boundary into a uniquely-locatable header + prosrc'
      using errcode='CLR10';
  end if;

  -- PRESTATE (2): the pre-image fingerprint, for the ceremony record and the tail's byte-diff.
  -- RECORDED, not hard-pinned to a literal: a literal sha would also break on an unrelated recut
  -- of some other part of this body by a migration merging between authoring and ceremony, which
  -- is a train-ordering accident rather than a real premise failure (0134's own rationale). The
  -- load-bearing premises are (3) and (4), and those fail closed.
  raise notice '0136 prestate: pre-image prosrc sha256 = %', encode(sha256(convert_to(v_pre,'UTF8')),'hex');

  -- PRESTATE (3), LOAD-BEARING: each of the four blocks 0132 installed is present EXACTLY ONCE.
  -- Zero means 0132 never ran or something already recut that block; more than one means the
  -- body is not what this file believes. Either way, patching on a wrong premise is the failure
  -- mode -- abort instead of proceeding.
  v_occ := (length(v_pre) - length(replace(v_pre, v_old_a, ''))) / length(v_old_a);
  if v_occ <> 1 then
    raise exception '0136: the v_fr_client_scope DECLARATION block occurs % time(s) in clara._sandbox_client_set, expected exactly 1 -- re-derive before patching', v_occ
      using errcode='CLR10';
  end if;
  v_occ := (length(v_pre) - length(replace(v_pre, v_old_b, ''))) / length(v_old_b);
  if v_occ <> 1 then
    raise exception '0136: the per-element ID GATE block occurs % time(s) in clara._sandbox_client_set, expected exactly 1 -- re-derive before patching', v_occ
      using errcode='CLR10';
  end if;
  v_occ := (length(v_pre) - length(replace(v_pre, v_old_c, ''))) / length(v_old_c);
  if v_occ <> 1 then
    raise exception '0136: the freeform_read_log EXISTENCE lookup occurs % time(s) in clara._sandbox_client_set, expected exactly 1 -- re-derive before patching', v_occ
      using errcode='CLR10';
  end if;
  v_occ := (length(v_pre) - length(replace(v_pre, v_old_d, ''))) / length(v_old_d);
  if v_occ <> 1 then
    raise exception '0136: the client-pinned DERIVATION block occurs % time(s) in clara._sandbox_client_set, expected exactly 1 -- re-derive before patching', v_occ
      using errcode='CLR10';
  end if;

  -- PRESTATE (4): none of the four replacements is already present -- a POSITIVE read that this
  -- file has something to do, rather than inferring it from (3) alone.
  if position(v_new_a in v_pre) > 0 or position(v_new_b in v_pre) > 0
     or position(v_new_c in v_pre) > 0 or position(v_new_d in v_pre) > 0 then
    raise exception '0136: clara._sandbox_client_set already carries at least one of the four trued blocks -- already recut; refusing to patch twice'
      using errcode='CLR10';
  end if;

  v_expected := replace(v_pre,      v_old_a, v_new_a);
  v_expected := replace(v_expected, v_old_b, v_new_b);
  v_expected := replace(v_expected, v_old_c, v_new_c);
  v_expected := replace(v_expected, v_old_d, v_new_d);
  execute v_head || 'AS $fa5b_frtypes_body$' || v_expected || '$fa5b_frtypes_body$';

  -- TAIL (byte-diff): re-read the LIVE body and prove it is the pre-image with the FOUR intended
  -- substitutions applied and nothing else. A read-back against an independently-derived
  -- expectation, not a restatement of what was sent -- it catches a write that landed on a
  -- different overload, or a body that came back altered.
  select p.prosrc into v_post from pg_proc p where p.oid = to_regprocedure(v_sig);
  if v_post is distinct from v_expected then
    raise exception '0136: the live body after the recut is NOT the pre-image with only the four intended substitutions applied -- something else moved; investigate before trusting this deploy'
      using errcode='CLR10';
  end if;
  raise notice '0136: recut applied -- post-image prosrc sha256 = %, byte-diff vs pre-image proves the SOLE changes are the four freeform-arm substitutions (% char(s) added, no other byte moved)',
    encode(sha256(convert_to(v_post,'UTF8')),'hex'), length(v_post) - length(v_pre);
end
$fa5b_frtypes$;

-- =====================================================================================
-- Tail census -- an INDEPENDENT re-read of the live catalog, measuring the properties this
-- file is actually about, not a restatement of the block above. A migration whose tail only
-- says "OK" has proven nothing.
-- =====================================================================================
do $fa5b_frtypes_census$
declare
  v_src text;
  v_occ int;
  v_uuid_rx text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_bigint_rx text := '^(0|[1-9][0-9]{0,18})$';
  v_type text;
begin
  select p.prosrc into v_src from pg_proc p
   where p.oid = to_regprocedure('clara._sandbox_client_set(uuid,jsonb,jsonb)');

  -- POSITIVE CONTROL FIRST, so every "is absent" measurement below is not a meaningless YES from
  -- an unreadable body: a string that MUST be there whatever this file did.
  if position('sandbox_view_client_set_empty' in v_src) = 0 then
    raise exception '0136 census: cannot read clara._sandbox_client_set''s body at all -- every check below would be vacuous'
      using errcode='CLR10';
  end if;

  -- 1. BOTH freeform_read_log lookups are keyed on a bigint cast, and NEITHER uuid-cast survives.
  if position('clara.freeform_read_log where id = v_label_id::bigint and firm_id = p_firm' in v_src) = 0
     or position($q$clara.freeform_read_log where id = (v_basis_elem ->> 'id')::bigint and firm_id = p_firm$q$ in v_src) = 0 then
    raise exception '0136 census: a freeform_read_log lookup is NOT keyed on ::bigint -- the recut did not take'
      using errcode='CLR10';
  end if;
  if position('clara.freeform_read_log where id = v_label_id::uuid' in v_src) > 0
     or position($q$clara.freeform_read_log where id = (v_basis_elem ->> 'id')::uuid$q$ in v_src) > 0 then
    raise exception '0136 census: a superseded ::uuid cast on clara.freeform_read_log survived the recut'
      using errcode='CLR10';
  end if;

  -- 2. The declaration is the ARRAY type, and the scalar declaration is gone. Measured as two
  --    separate reads: "the array form is present" alone would still pass if BOTH were somehow
  --    present, which is the shape a partial patch leaves behind.
  if position('v_fr_client_scope uuid[];' in v_src) = 0 then
    raise exception '0136 census: v_fr_client_scope is not declared uuid[] -- the select INTO would raise 42804 at runtime'
      using errcode='CLR10';
  end if;
  if position('v_fr_client_scope uuid;' in v_src) > 0 then
    raise exception '0136 census: the superseded scalar `v_fr_client_scope uuid;` declaration is still present'
      using errcode='CLR10';
  end if;

  -- 3. THE WALL IS NOT WEAKENED -- the uuid rule survives EXACTLY ONCE, as the default branch.
  --    This is the negative-space check that matters most: a "fix" that simply deleted the id
  --    gate would satisfy every other measurement in this census.
  v_occ := (length(v_src) - length(replace(v_src, v_uuid_rx, ''))) / length(v_uuid_rx);
  if v_occ <> 1 then
    raise exception '0136 census: the uuid id-format rule occurs % time(s), expected exactly 1 (the DEFAULT branch) -- the malformed-id wall must survive this recut intact', v_occ
      using errcode='CLR10';
  end if;
  v_occ := (length(v_src) - length(replace(v_src, v_bigint_rx, ''))) / length(v_bigint_rx);
  if v_occ <> 1 then
    raise exception '0136 census: the bigint id-format rule occurs % time(s), expected exactly 1 (the freeform_read branch)', v_occ
      using errcode='CLR10';
  end if;
  -- ...and the refusal it raises is still the SAME token, raised from a single place.
  v_occ := (length(v_src) - length(replace(v_src, 'a basis element carries a malformed id', ''))) / length('a basis element carries a malformed id');
  if v_occ <> 1 then
    raise exception '0136 census: the malformed-id refusal occurs % time(s), expected exactly 1 -- both id grammars must funnel into ONE refusal, so a caller learns nothing from which one it tripped', v_occ
      using errcode='CLR10';
  end if;
  if position('9223372036854775807' in v_src) = 0 then
    raise exception '0136 census: the int8 range guard is absent from the freeform id gate -- a 19+-digit id could reach the ::bigint cast and raise a raw 22003'
      using errcode='CLR10';
  end if;

  -- 4. The array-shaped NULL/empty guard is present in all three of its arms, and the derivation
  --    appends the WHOLE array.
  if position('v_fr_client_scope is null' in v_src) = 0
     or position('coalesce(array_length(v_fr_client_scope, 1), 0) = 0' in v_src) = 0
     or position('array_position(v_fr_client_scope, null) is not null' in v_src) = 0 then
    raise exception '0136 census: the client_scope unnameable-set guard is missing an arm (null / empty / NULL-element) -- a NULL would pollute the client set'
      using errcode='CLR10';
  end if;
  if position('v_client_set := v_client_set || v_fr_client_scope;' in v_src) = 0 then
    raise exception '0136 census: the client-pinned derivation does not append client_scope -- the union rule (design 3.2) is not implemented'
      using errcode='CLR10';
  end if;

  -- 5. NEGATIVE CONTROLS on everything this file promised NOT to touch. Absences measured
  --    deliberately, one by one, never inferred from the positives above.
  if position('a cross-client named basis cannot be resolved until F-A6 v2 lands' in v_src) = 0
     or position('a freeform-read basis cannot be resolved on this chain yet' in v_src) = 0
     or position('sandbox_view_basis_malformed' in v_src) = 0
     or position('a cited preview cell does not resolve in your firm' in v_src) = 0
     or position('a basis element has an unrecognised kind' in v_src) = 0
     or position('client_set_exact' in v_src) = 0 then
    raise exception '0136 census: a wall or arm this file promised NOT to touch is missing from the recut body'
      using errcode='CLR10';
  end if;
  -- The Annex-K availability probe keeps its PRESENCE semantics, deliberately (see the header).
  if position($q$where table_schema = 'clara' and table_name = 'freeform_read_log' and column_name = 'scope'$q$ in v_src) = 0 then
    raise exception '0136 census: 0132''s Annex-K availability probe is gone -- this file must not change it'
      using errcode='CLR10';
  end if;

  -- 6. The live TYPES, re-read independently of the prestate block's own reads.
  select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
   where a.attrelid = 'clara.freeform_read_log'::regclass and a.attname = 'client_scope' and not a.attisdropped;
  if v_type is distinct from 'uuid[]' then
    raise exception '0136 census: clara.freeform_read_log.client_scope reads back as % , not uuid[]', coalesce(v_type,'ABSENT')
      using errcode='CLR10';
  end if;
  select format_type(a.atttypid, a.atttypmod) into v_type from pg_attribute a
   where a.attrelid = 'clara.freeform_read_log'::regclass and a.attname = 'id' and not a.attisdropped;
  if v_type is distinct from 'bigint' then
    raise exception '0136 census: clara.freeform_read_log.id reads back as % , not bigint', coalesce(v_type,'ABSENT')
      using errcode='CLR10';
  end if;

  raise notice '0136 tail: OK -- clara._sandbox_client_set''s freeform_read arm is trued to the live shape. Both freeform_read_log lookups key on ::bigint and no ::uuid cast on that relation survives; v_fr_client_scope is uuid[] and the scalar declaration is gone; the client-pinned derivation UNIONS the whole array behind a three-arm unnameable-set guard (null / empty / NULL-element). The malformed-id WALL IS INTACT AND NOT WEAKENED: the uuid rule survives exactly once as the default branch, the bigint rule exactly once for freeform_read, both funnel into ONE refusal, and the int8 range guard is present. Untouched and re-measured: the Annex-K availability probe, the cross_client refusal, the firm_closure arm, the preview_cell arm, sandbox_view_basis_malformed and NT-1''s client_set_exact. One function body replaced; no relation, grant, policy or row altered, and nothing in workflow/graphile_worker/spike touched.';
end
$fa5b_frtypes_census$;
