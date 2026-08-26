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
--   C. The per-element `freeform_read_log` existence probe casts `::bigint`, not `::uuid`.
--   D. The client-pinned derivation's own lookup casts `::bigint`, and the arm appends the WHOLE
--      array. Per the design's own rule table
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
-- THE FIX ROUND (independent double-leg review on this PR; the implementation and adversarial
-- legs converged INDEPENDENTLY on F1, which is why it is closed here rather than carried):
--   F1. THE TENANCY WALL on the client-pinned arm -- the important one. Proving the RECEIPT is
--       p_firm's does not prove the CLIENTS it names are. The adversarial leg MEASURED that
--       `clara._recipient_covers` answers covered:true for a foreign-firm client_set with no
--       downstream backstop, so the arm's correctness rested on a three-hop cross-file premise
--       (F-A6 compiles client_scope from the credential; the credential is firm-scoped; nothing
--       re-checks it). One conjunct makes it LOCAL, checked BEFORE the union so no foreign id
--       ever enters the set. Its blast radius ACTIVATES the day A1(iii)'s free-text widening
--       lifts -- i.e. when the substitution seam lands -- which is being built in parallel now.
--   F2. THE OUTCOME CONJUNCT -- settled is not succeeded. See v_new_c's own note below.
--   F3. THE DIMENSION GUARD -- see v_new_d's own note below.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT CHANGE.
--   * The Annex-K availability probe (0132:589-591) keeps its exact semantics and its exact
--     refusal. It answers "has F-A6 PR-1 landed", which is a PRESENCE question, and presence is
--     the right instrument for it. The TYPE question it was mistaken for is answered by this
--     file's prestate, at deploy, where a mismatch can abort instead of mis-refusing at runtime.
--     F4 -- THE TWO INSTRUMENTS CAN DISAGREE, and a reader should know which way. The in-body
--     probe reads `information_schema.columns`, which is PRIVILEGE-FILTERED: it shows only
--     columns on relations the current role has some privilege on. This prestate reads
--     `pg_attribute`, which is not filtered. So an ownership or grant change on
--     `clara.freeform_read_log` could make the in-body probe report "F-A6 absent" -- refusing
--     every free-read basis, fail-closed but for a false reason -- while this prestate still
--     reads the columns perfectly well and reports the shape as correct. That divergence is
--     benign in direction (the runtime side fails closed, never open) but it is a real
--     instrument difference, not an equivalence, and it is named here so nobody later reads one
--     as corroborating the other.
--   * No SEPARATE `settled_at` conjunct is added, because F2's `outcome = 'ok'` already implies
--     it: ck_freeform_settled (0131:555-561) makes `outcome` non-null exactly when `settled_at`
--     is. Worth recording that the weaker property was independently guaranteed anyway -- an
--     ARMED-but-unsettled receipt can never COMMIT, because 0131's `t_freeform_must_settle`
--     (0131:628-641) is a DEFERRABLE INITIALLY DEFERRED constraint trigger that re-reads the row
--     at commit and raises CLR10 if `settled_at is null`. The battery PROVES that rather than
--     asserting it (cell fix.fr.unsettled-cannot-commit): it inserts an unsettled row and shows
--     the COMMIT is refused. F2 is the strictly stronger wall on top of it.
--   * The preview_cell arm gets NO tenancy conjunct, and that is CORRECT rather than an omission
--     -- it already has one, structurally. `clara.metric_cells` carries
--     `foreign key (client_id, firm_id) references clara.clients (id, firm_id)` (0058:254), so a
--     row with `firm_id = p_firm` cannot name a `client_id` belonging to any other firm: the
--     composite FK rejects that pairing at metric_cells INSERT time. The arm reads
--     `where id = ... and firm_id = p_firm` (0132:680-681), and FK + filter TOGETHER are its local
--     tenancy wall. THIS IS THE EXACT ASYMMETRY F1 RESTS ON: `freeform_read_log.client_scope` is
--     `uuid[]`, and PostgreSQL cannot express a foreign key from array ELEMENTS, so the freeform
--     arm has no structural equivalent and needs the explicit conjunct. Adding a redundant one to
--     the preview_cell arm would assert what the FK already guarantees and would mislead the next
--     reader into thinking the FK is not trusted -- muddying the very distinction that makes F1
--     necessary.
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
-- NUMBERING. Numbers are claimed at MERGE time. G1's 0133 and F-A3 PR-3's 0134 have since
-- MERGED (re-measured against main at 05d4aec, not assumed), so the chain this file lands on is
-- 0132 -> 0133 -> 0134 -> 0136. 0135 is deliberately left as a gap rather than claimed: the
-- runner applies in numeric order and forbids duplicates, not gaps, so the gap is
-- validation-safe, and holding at 0136 cannot collide with a lane that claims 0135 while this
-- PR is in review. Re-confirmed on the merged tree: NEITHER 0133 NOR 0134 touches
-- clara._sandbox_client_set, so this file's exactly-once prestate premise survives them.
-- Nothing here, and nothing in the batteries (which gate on the CATALOG, never on a filename or
-- a schema_migrations row), depends on this file's own number.
--
-- No statement_timeout pin: this replaces one function body and reads pg_proc and pg_attribute
-- a handful of times. There is no scan and no lock beyond the body's own, so a timeout here
-- would be decorative.
--
-- =====================================================================================
-- MERGE ORDER IS FORCED, AND THIS FILE MUST NOT MERGE FIRST. Card-1's 0135 (unmerged at the
-- time of writing) does a LITERAL `create or replace function clara._sandbox_client_set` -- a
-- full-body rewrite. If 0136 merged first, that CREATE OR REPLACE would silently OVERWRITE this
-- recut and reinstate both defects with no error anywhere. 0135 merges FIRST; this file merges
-- SECOND, rebased onto card-1's actual post-0135 body.
--
-- WHAT THE REBASE MUST DO -- written out in full, because a rebase obligation that lives only in
-- a transcript is one nobody can execute:
--   (1) RE-DERIVE the four search targets against the LIVE post-0135 body read from the catalog,
--       never against 0132's file text. MEASURED against card-1's working file: the id gate,
--       the declaration and the existence probe are byte-identical to 0132's, and the derivation
--       target still matches -- but the freeform arm as a WHOLE is NOT byte-identical, because
--       card-1 DELETED 0132's four-line "opus F7: NULL client_scope guard" comment. The four
--       targets survive only because none of them spans that comment. Draw a whole-block target
--       (the more robust shape) from CARD-1's body, never from 0132's, or it will not match.
--   (2) ADD A POSITIVE POST-CHECK for card-1's own stage-(a) arm. The tail's byte-equality
--       already proves nothing outside the substituted text moved, but that is an INFERRED
--       property; name it instead. After the patch, assert the live body STILL contains
--       `sandbox_placeholder_basis_not_cell`, `placeholder_unknown_key` and
--       `sandbox_placeholder_cell_not_ok`. This is the F-A3/PR-1b lesson exactly -- a CoR built
--       from file text once silently erased a later migration's patch on the same body -- and it
--       is the difference between provably not clobbering a shipped feature and probably not.
--       These markers do NOT exist until 0135 is on the chain, which is why the check belongs to
--       the rebase build and not to this pre-0135 checkpoint.
--   (3) The fix LOGIC below (F1 tenancy, F2 outcome, F3 ndims, the bigint id gate) is unchanged
--       by the rebase and already reviewed. Only the search targets and the recorded pre-image
--       sha move -- and the sha is RECORDED rather than pinned precisely so that it can.
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
  v_id_wellformed boolean; v_scope_ok boolean;$a1$;

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
      -- `collate "C"` IS LOAD-BEARING ON THE REASONING, not on today's behaviour. "Lexicographic
      -- order equals numeric order for equal-length digit strings" is a property of C/byte
      -- ordering; a linguistic collation is free to define its own. C, glibc and ICU all happen to
      -- agree on pure ASCII digits today, so the unpinned form is not a live hole -- and its worst
      -- case is a 19-digit id wrongly called malformed, i.e. fail-closed, never a leak. Pinning it
      -- costs nothing and makes this wall's correctness independent of the database's default
      -- collation instead of contingent on it.
      v_id_wellformed := coalesce(v_label_id is not null
                                  and v_label_id ~ '^(0|[1-9][0-9]{0,18})$', false);
      if v_id_wellformed and length(v_label_id) = 19
         and v_label_id collate "C" > '9223372036854775807' collate "C" then
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
  -- F2: `and outcome = 'ok'`. SETTLED IS NOT SUCCEEDED. 0131's receipt records outcome in
  -- ('ok','refused','error') (0131:538); a refused or errored read returned NO ROWS, so grounding
  -- a durable export's narrative on it is a provenance defect against hard constraint 2 -- the
  -- basis would name a read that never produced the thing the block claims to cite. The conjunct
  -- rides INSIDE the existing existence probe on purpose: a non-ok read then refuses through the
  -- SAME 'does not resolve in your firm' arm as an absent or foreign one, so the three stay
  -- indistinguishable and the no-oracle discipline is preserved by construction rather than by a
  -- parallel branch that has to be kept in step. It also SUBSUMES a settled_at conjunct:
  -- ck_freeform_settled (0131:555-561) makes outcome non-null exactly when settled_at is, so
  -- `outcome = 'ok'` already implies the receipt is settled.
  v_new_c text := $c1$      if not exists(select 1 from clara.freeform_read_log where id = v_label_id::bigint and firm_id = p_firm and outcome = 'ok') then$c1$;

  v_old_d text := $d0$      select scope, client_scope into v_fr_scope, v_fr_client_scope
        from clara.freeform_read_log where id = (v_basis_elem ->> 'id')::uuid and firm_id = p_firm;
      if v_fr_scope = 'client' then
        if v_fr_client_scope is null then
          raise exception 'a client-scoped freeform read carries no client' using errcode = 'CLR11',
            detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref)::text;
        end if;
        v_client_set := v_client_set || v_fr_client_scope;$d0$;
  v_new_d text := $d1$      select scope, client_scope into v_fr_scope, v_fr_client_scope
        from clara.freeform_read_log where id = (v_basis_elem ->> 'id')::bigint and firm_id = p_firm and outcome = 'ok';
      if v_fr_scope = 'client' then
        -- client_scope is uuid[] (0131:519), NOT a scalar: the receipt NAMES the set it read
        -- across, so the derivation is the UNION of every element -- coverage widens with
        -- cardinality and never narrows to the first. The design's rule table says
        -- "client_scope -- exact" for the client-pinned row (sandbox-export-design.md:172).
        -- On THIS chain the union is always exactly one client, because
        -- ck_freeform_scope_client (0131:550-553) forces cardinality 1 and forbids a NULL element
        -- on a scope='client' row.
        -- WHAT THE UNION FORM DOES *NOT* BUY, stated because an earlier draft of this comment
        -- overclaimed it: it does NOT make this body ready for F-A6 v2. A v2 cross-client receipt
        -- carries scope='cross_client', which does not match EITHER branch here and falls to the
        -- `else` below, where it is REFUSED by name. So v2 needs that else arm re-cut too -- a
        -- cardinality widening alone would never reach this code. The union form buys exactly one
        -- narrower thing: if the 'client' arm's own cardinality is ever relaxed, this derivation
        -- is already correct for it and does not silently keep only the first element.
        -- F7's NULL guard, EXTENDED to the array shape and never relaxed: null, NON-1-DIMENSIONAL,
        -- empty, or carrying a NULL element are each an UNNAMEABLE set, i.e. the unknown, and take
        -- the same no-oracle token every other unresolved basis gets.
        -- N3 -- 0132's OWN JUSTIFICATION FOR F7 IS NOW FALSE, and is corrected rather than
        -- carried. It read: "F-A6's own hardened shape does not (yet) forbid a NULL client_scope
        -- on a scope='client' row." It does: ck_freeform_scope_client (0131:550-553) requires
        -- `client_scope is not null and cardinality(client_scope) = 1 and
        -- array_position(client_scope, null) is null` on exactly that row. The guard is KEPT
        -- anyway -- a definer body that derives a tenancy-bearing set does not delegate its own
        -- fail-closed reading to a CHECK on another table, and the battery proves the CHECK is
        -- what makes each shape unconstructible rather than assuming it -- but it is kept as
        -- defence-in-depth against a constraint that could be relaxed, NOT because the constraint
        -- is absent. A wall justified by a false premise is a wall nobody can maintain.
        -- F3 -- WHY THIS IS TWO STATEMENTS AND WHY array_ndims COMES FIRST: array_position RAISES a
        -- raw 0A000 ("searching for elements in multidimensional arrays is not supported") on a
        -- 2-D array, and SQL does not promise left-to-right short-circuit inside one boolean
        -- expression. So the dimension test is settled FIRST, in its own assignment, and
        -- array_position is only ever reached on an array already proven 1-D -- the same
        -- never-evaluate-an-unvalidated-operand discipline the id gate above uses. A 2-D
        -- client_scope is unconstructible today (ck_freeform_scope_client's own array_position
        -- raises 0A000 at INSERT), so this is defence-in-depth against a future writer, not a
        -- live path -- exactly the class the id gate exists to pre-empt.
        v_scope_ok := v_fr_client_scope is not null
                      and array_ndims(v_fr_client_scope) is not distinct from 1;
        if v_scope_ok then
          v_scope_ok := coalesce(array_length(v_fr_client_scope, 1), 0) > 0
                        and array_position(v_fr_client_scope, null) is null;
        end if;
        if not v_scope_ok then
          raise exception 'a client-scoped freeform read carries no client' using errcode = 'CLR11',
            detail = jsonb_build_object('reason','sandbox_view_basis_unknown','label',v_ref)::text;
        end if;
        -- F1 -- THE TENANCY WALL, and the reason this arm's correctness is now LOCAL.
        -- Proving the RECEIPT belongs to p_firm does not prove the CLIENTS it names do. Until
        -- here, "client_scope holds only clients of this firm" was a three-hop cross-file premise
        -- (F-A6 compiles client_scope from the credential; the credential is firm-scoped; nothing
        -- re-checks it downstream) -- and an independent adversarial pass MEASURED that
        -- clara._recipient_covers returns covered:true for a foreign-firm client_set with no
        -- backstop behind it. A cross-tenant seam may not rest on a premise held in another file.
        -- One conjunct makes it local, and it is checked BEFORE the union rather than after, so no
        -- foreign id ever enters v_client_set. NO ORACLE, BY CONSTRUCTION: a client of another firm
        -- and a uuid that is no client at all both fail this same test and take the same code, the
        -- same message and the same detail -- a caller cannot learn that a foreign client exists.
        if exists (select 1 from unnest(v_fr_client_scope) c
                    where not exists (select 1 from clara.clients k
                                       where k.id = c and k.firm_id = p_firm)) then
          raise exception 'a cited freeform read names a client that does not resolve in your firm'
            using errcode = 'CLR11',
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
  -- substitutions applied and nothing else -- a full byte-equality read-back of the live body
  -- against the exact expected text. It catches a write that landed on a different overload, or a
  -- body that came back altered. It is NOT an independent derivation: v_expected is the same value
  -- passed to EXECUTE, so this compares the catalog against what was sent. The genuinely
  -- independent re-read is the census block below, which re-resolves the function and measures the
  -- properties by name rather than replaying this expectation.
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
  -- N2: match the CODE EXPRESSION, not the bare number. The literal 9223372036854775807 also
  -- appears in this arm's own PROSE comment, so a bare-number probe would still find it in a body
  -- whose guard had been deleted but whose comment survived -- an absence measured with an
  -- instrument that cannot see it. The comparison expression appears only in the code.
  if position('length(v_label_id) = 19' in v_src) = 0
     or position('> ''9223372036854775807''' in v_src) = 0 then
    raise exception '0136 census: the int8 range guard EXPRESSION is absent from the freeform id gate -- a 19+-digit id could reach the ::bigint cast and raise a raw 22003 (note: the bare number still occurs in the arm''s comment, which is why this checks the expression)'
      using errcode='CLR10';
  end if;
  -- ...and the range guard's ordering is COLLATION-PINNED. "Lexicographic order = numeric order
  -- for equal-length digit strings" is a C/byte-ordering property; without the pin the wall's
  -- correctness would be contingent on the database's default collation rather than stated by the
  -- code. Measured on BOTH operands, because a pin on one side only is a silent half-measure.
  if position('v_label_id collate "C" > ''9223372036854775807'' collate "C"' in v_src) = 0 then
    raise exception '0136 census: the int8 boundary comparison is not pinned to collate "C" on both operands -- its lexicographic reasoning would depend on the default collation'
      using errcode='CLR10';
  end if;

  -- 4. The array-shaped unnameable-set guard is present in all FOUR of its arms, and the
  --    derivation appends the WHOLE array.
  if position('v_fr_client_scope is not null' in v_src) = 0
     or position('array_ndims(v_fr_client_scope) is not distinct from 1' in v_src) = 0
     or position('coalesce(array_length(v_fr_client_scope, 1), 0) > 0' in v_src) = 0
     or position('array_position(v_fr_client_scope, null) is null' in v_src) = 0 then
    raise exception '0136 census: the client_scope unnameable-set guard is missing an arm (null / non-1-D / empty / NULL-element) -- a NULL would pollute the client set'
      using errcode='CLR10';
  end if;
  -- F3 ORDERING, measured rather than trusted: the dimension test must be SETTLED BEFORE
  -- array_position is ever evaluated, because array_position raises a raw 0A000 on a 2-D array.
  -- A future edit that collapses the two statements into one boolean expression would reintroduce
  -- exactly that, so the census asserts the ORDER, not merely the presence.
  -- r2: COUNT BEFORE COMPARING. position() returns the FIRST occurrence, so an ordering check on
  -- its own would pass vacuously if a SECOND occurrence of either operand were introduced earlier
  -- in the body. Pinning each to exactly one occurrence is what makes the comparison below mean
  -- what it says.
  if (length(v_src) - length(replace(v_src, 'array_ndims(v_fr_client_scope)', ''))) / length('array_ndims(v_fr_client_scope)') <> 1
     or (length(v_src) - length(replace(v_src, 'array_position(v_fr_client_scope', ''))) / length('array_position(v_fr_client_scope') <> 1 then
    raise exception '0136 census: array_ndims/array_position on client_scope do not each occur EXACTLY once -- the ordering check below would be ambiguous'
      using errcode='CLR10';
  end if;
  if position('array_ndims(v_fr_client_scope)' in v_src) > position('array_position(v_fr_client_scope' in v_src) then
    raise exception '0136 census: array_position on client_scope is evaluated BEFORE the array_ndims dimension test -- a 2-D client_scope would raise a raw 0A000 through the wake wrapper'
      using errcode='CLR10';
  end if;

  -- 4b. F1 -- THE TENANCY WALL. The conjunct that makes the client-pinned arm's correctness LOCAL
  --     instead of a three-hop cross-file premise. Measured by its own text, and by the fact that
  --     it is applied BEFORE the union (a wall after the append would not prevent the leak).
  if position('from clara.clients k' in v_src) = 0
     or position('where k.id = c and k.firm_id = p_firm' in v_src) = 0
     or position('unnest(v_fr_client_scope) c' in v_src) = 0 then
    raise exception '0136 census: the F1 tenancy wall is absent from the client-pinned arm -- a foreign-firm client could enter client_set, and _recipient_covers has no backstop behind it'
      using errcode='CLR10';
  end if;
  -- r2 again: exactly one of each, so "the wall precedes the append" is unambiguous. A SECOND
  -- append introduced earlier in the body is precisely the shape that would make a bare
  -- position() comparison lie -- and it is also precisely the shape that would leak.
  if (length(v_src) - length(replace(v_src, 'unnest(v_fr_client_scope) c', ''))) / length('unnest(v_fr_client_scope) c') <> 1
     or (length(v_src) - length(replace(v_src, 'v_client_set := v_client_set || v_fr_client_scope;', ''))) / length('v_client_set := v_client_set || v_fr_client_scope;') <> 1 then
    raise exception '0136 census: the tenancy wall and the client_scope append do not each occur EXACTLY once -- a second append would make the ordering check below vacuous AND would itself be the leak'
      using errcode='CLR10';
  end if;
  if position('unnest(v_fr_client_scope) c' in v_src) > position('v_client_set := v_client_set || v_fr_client_scope;' in v_src) then
    raise exception '0136 census: the F1 tenancy wall is applied AFTER the union into client_set -- it must refuse before any foreign id enters the set'
      using errcode='CLR10';
  end if;

  -- 4c. F2 -- THE OUTCOME CONJUNCT. Settled is not succeeded: both freeform_read_log lookups must
  --     require outcome = 'ok', so a refused/errored read cannot ground a durable export's
  --     narrative (hard constraint 2's provenance rule).
  if position($q$and firm_id = p_firm and outcome = 'ok'$q$ in v_src) = 0 then
    raise exception '0136 census: the F2 outcome conjunct is absent -- a refused or errored freeform read could ground a basis'
      using errcode='CLR10';
  end if;
  v_occ := (length(v_src) - length(replace(v_src, $q$and outcome = 'ok'$q$, ''))) / length($q$and outcome = 'ok'$q$);
  if v_occ <> 2 then
    raise exception '0136 census: the outcome conjunct occurs % time(s), expected exactly 2 (the existence probe + the derivation read) -- the two lookups must stay in lockstep', v_occ
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

  raise notice '0136 tail: OK -- clara._sandbox_client_set''s freeform_read arm is trued to the live shape AND the fix round is folded. TYPES: both freeform_read_log lookups key on ::bigint and no ::uuid cast on that relation survives; v_fr_client_scope is uuid[] and the scalar declaration is gone; the client-pinned derivation UNIONS the whole array. F1 TENANCY: every client_scope element is proven a client of p_firm BEFORE the union (census asserts both the conjunct AND that it precedes the append), so a foreign-firm client can no longer reach client_set -- a foreign client and a non-client uuid refuse identically, no oracle. F2 OUTCOME: both lookups require outcome = ''ok'' (exactly two occurrences, lockstep), so a refused or errored read cannot ground a basis; this subsumes settled_at via ck_freeform_settled. F3 DIMENSION: the four-arm unnameable-set guard (null / non-1-D / empty / NULL-element) with array_ndims proven to be evaluated BEFORE array_position, so a 2-D client_scope cannot raise a raw 0A000 through the wrapper. The malformed-id WALL IS INTACT AND NOT WEAKENED: the uuid rule survives exactly once as the default branch, the bigint rule exactly once for freeform_read, both funnel into ONE refusal, and the int8 range guard is present. Untouched and re-measured: the Annex-K availability probe, the cross_client refusal, the firm_closure arm, the preview_cell arm, sandbox_view_basis_malformed and NT-1''s client_set_exact. One function body replaced; no relation, grant, policy or row altered, and nothing in workflow/graphile_worker/spike touched.';
end
$fa5b_frtypes_census$;
