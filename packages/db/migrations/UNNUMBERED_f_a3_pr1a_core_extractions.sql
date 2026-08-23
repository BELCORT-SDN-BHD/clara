-- UNNUMBERED_f_a3_pr1a_core_extractions.sql -- Wave-F Track A, F-A3 PR-1a:
-- THE NINE PURE CORE EXTRACTIONS. Authored UNNUMBERED; the number is claimed at MERGE
-- PREPARATION (standing law, AGENTS.md + .claude/rules/db-migrations.md). The battery gates on
-- the CATALOG (what the live bodies carry), never on this filename, so nothing moves with the
-- renumber.
--
-- DESIGN OF RECORD: docs/plan/active/bank-agency-design.md v2 (SS4) with
-- bank-agency-annexes-1-mechanics.md (Annex A.2 -- the extraction contract; Annex C -- the lock
-- order), bank-agency-annexes-2-record.md (Annex H.1 -- the battery) and
-- bank-agency-annexes-3-build.md (Annex O.2 row 1; Annex J.1 -- the nine bodies, the D1 list).
-- Gate record: bank-agency-gate-record.md. Above the design: docs/product/PRD.md SS6 (LAW).
--
-- =====================================================================================
-- WHAT THIS FILE DOES -- ONE claim, and it is mechanically checkable: NOTHING CHANGED
-- =====================================================================================
-- Nine live human verbs are FACTORED. Each keeps its name, arity, argument defaults, ACL,
-- owner, volatility, SECURITY DEFINER + search_path settings and role floor, and becomes a thin
-- delegator over a NEW, UNGRANTED core that carries the body:
--
--   public:  c := clara._human_ctx(clara.role_rank('<floor>'));
--            return clara._<verb>_core(jsonb_build_object('actor', c.actor, 'firm', c.firm), ...);
--   core:    select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
--            if c.actor is null or c.firm is null then raise ... 'core_ctx_missing'; end if;
--            <the live body, byte-for-byte>
--
-- This is the clara._settle_from_bank_line_core idiom (0044:2209-2224), which 0042 already
-- applied to the settle limb; F-A3 applies it to the nine remaining bank/COA verbs so PR-1b's
-- agent cores have a ctx-shaped delegate to call. ZERO BEHAVIOUR CHANGE, and the file PROVES it
-- rather than asserting it:
--
--   * the core body is NOT retyped. It is the LIVE prosrc, read by pg_get_functiondef at apply
--     time, with EXACTLY ONE textual substitution -- the `_human_ctx` line becomes the ctx
--     unpack. The tail INVERTS that substitution and re-derives the pinned prestate sha-256, so
--     a body that drifted by one byte fails the apply. That inversion is the whole argument.
--   * the public wrapper is NOT retyped either. Its whole header -- name, argument list with
--     defaults, RETURNS, LANGUAGE, SECURITY DEFINER, SET search_path, volatility -- is the LIVE
--     pg_get_functiondef header, spliced at the `AS $function$` boundary, so no property can be
--     lost by transcription. The reconstruction is asserted before it is used.
--   * NO literal is parameterised in this PR. The design names exactly two literals that become
--     ctx-derived later (`origin` in _match_bank_line_core and _settle_from_bank_line_core,
--     register A25) and BOTH are PR-1b's. Here the ctx carries `actor` and `firm` and nothing
--     else, so there is no key the body could read differently.
--
-- THE NINE (Annex J.1). The live tips were re-derived on a rig at frontier 0102 and sha-pinned
-- below: the bank rules machine's two spliced bodies -- match_bank_line/6 (0038:3817 as patched
-- in place by 0040 S4.4a at :5340-5385) and match_bank_line/7 (stub 0040:5401 + the S4.4b
-- re-body) -- are NOT readable from any migration file, which is why every pin here is a
-- MEASURED prosrc sha and never a file citation:
--   1 match_bank_line/6   2 unmatch_bank_match   3 complete_bank_reconciliation
--   4 void_bank_reconciliation   5 resolve_bank_line_exception   6 resolve_and_book_bank_line
--   7 void_bank_statement   8 add_bank_account   9 upsert_account
--
-- PREDICTION P-1, SETTLED AT THE RIG: the live match_bank_line/6 prosrc carries the S4.4a
-- `line_excepted` block exactly ONCE and holds ZERO references to p_via_rule. CONFIRMED (the /7
-- rule arity carries six such references; it is NOT extracted here -- PR-3 drops it, Annex I).
--
-- =====================================================================================
-- SS0 D1 WRITE-QUIESCE INVENTORY -- the bodies this file REPLACES IN PLACE (window W2)
-- =====================================================================================
-- Nine live, audited, human-lane writers. Each swap is DROP-free: `create or replace` keeps the
-- oid, the ACL and every dependency, so no grant is re-issued and no dependent object is
-- invalidated. It is still a live writer body swap, and an in-flight call finishes on the OLD
-- body -- D1 applies:
--
--   clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)
--   clara.unmatch_bank_match(uuid,uuid,text,text)
--   clara.complete_bank_reconciliation(uuid,uuid[],text)
--   clara.void_bank_reconciliation(uuid,text,text)
--   clara.resolve_bank_line_exception(uuid,text,text,uuid,text)
--   clara.resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)
--   clara.void_bank_statement(uuid,uuid,text,text)
--   clara.add_bank_account(uuid,text,text,text,text,uuid,text)
--   clara.upsert_account(uuid,text,text,text,text,text,text)
--
-- NINE new functions are CREATED (clara._<verb>_core), each UNGRANTED: revoked from PUBLIC at
-- birth, granted to nobody. NO DDL on any table, NO CHECK swap, NO new agent_tasks kind, NO
-- grant, NO drop, NO wake surface. The file takes ACCESS EXCLUSIVE on no relation.
--
-- Ceremony order inside the combined window (Annex O.3): PR-1a applies FIRST -- PR-1b re-cuts
-- three of the cores this file creates (_match_bank_line_core, _unmatch_bank_match_core,
-- _complete_bank_reconciliation_core; Annex A.2 footnotes 1-3), so they must exist before it.
--
-- =====================================================================================
-- ONE DELIBERATE NON-CHANGE, RECORDED BECAUSE A REVIEWER WILL SEE IT AND WONDER
-- =====================================================================================
-- clara.resolve_and_book_bank_line's body calls the PUBLIC clara.resolve_bank_line_exception
-- (twice) and the PUBLIC clara.match_bank_line (once). After this file those three calls land on
-- the new thin wrappers, which re-derive _human_ctx -- exactly what they do today, so the human
-- lane is unchanged and the composite's `owner` floor still dominates the inner `bookkeeper`
-- one. They are NOT repointed at the cores here: repointing would drop an inner floor re-check,
-- and PR-1a's whole claim is that nothing changed.
--
-- **PR-1b BUILD OBLIGATION (recorded 2026-08-23; mirrored in bank-agency-annexes-3-build.md).**
-- Those three call sites MUST be repointed to clara._resolve_bank_line_exception_core /
-- clara._match_bank_line_core, threading the caller's p_ctx, when PR-1b builds
-- _agent_resolve_and_book_core. Left as they are, an agent call reaching
-- _resolve_and_book_bank_line_core raises CLR04 'no authenticated actor' two levels down, from
-- _human_ctx inside a public wrapper -- the agent composite is unreachable, not merely
-- mis-attributed.
--
-- NOT IN THIS FILE: the agent limb (PR-1b), the egress purpose (PR-1c), the reads and the
-- drawer-2 gate repair (PR-1d), the clock (PR-2, gated on G1), the retirements (PR-3).

-- PRECAUTIONARY, not load-bearing: nine CREATE OR REPLACEs and no table DDL take seconds, but
-- the file runs inside a D1 write-quiesce window and a wedged apply there is expensive.
-- It leads the file because the runner's lexer requires the timeout to be statement 0
-- (packages/db/scripts/migration-lexer.mjs:199).
set local statement_timeout = '5min';
set local search_path = clara, pg_temp;

-- =====================================================================================
-- SS0.1 QUIESCE GUARD. FAIL CLOSED ON ABSENCE: 0006 creates the heartbeat table and always
-- precedes this file, so absence is catalog drift -- and drift is exactly when a runtime is
-- most likely alive and unobservable.
-- =====================================================================================
do $fa3_quiesce$
declare v_component text; v_beat timestamptz;
begin
  if to_regclass('clara.runtime_heartbeats') is null then
    raise exception 'F-A3 PR-1a QUIESCE GUARD: clara.runtime_heartbeats is ABSENT -- the catalog has drifted from the migration chain (0006 creates it); refuse rather than guess whether a runtime is live'
      using errcode='CLR10';
  end if;
  select h.component, h.beat_at into v_component, v_beat from clara.runtime_heartbeats h
   where h.beat_at > now() - interval '90 seconds' order by h.beat_at desc limit 1;
  if v_component is not null then
    raise exception 'F-A3 PR-1a QUIESCE GUARD: a runtime heartbeat is fresh (component %, beat_at %) -- this file replaces NINE live audited writer bodies in place (SS0 inventory) and an in-flight call finishes on the OLD body (D1); stop clara-runtime, wait for staleness (>90s), and re-apply',
      v_component, v_beat;
  end if;
end
$fa3_quiesce$;

-- =====================================================================================
-- SS0.2 THE ROSTER -- declared ONCE, in a session-local table the prestate, the cut and the
-- tail all read. Three hand-copied rosters is three chances for a pinned sha to disagree with
-- itself, and a roster that disagrees with itself proves nothing; ON COMMIT DROP keeps it from
-- outliving the migration's own transaction.
--
-- Each row carries the EXACT regprocedure signature (never a proname -- match_bank_line has two
-- live overloads and this file extracts ONE of them), the expected overload count for that
-- proname, the role floor, the exact `_human_ctx` anchor text, and the prosrc sha-256 measured
-- on the rig at frontier 0102.
-- =====================================================================================
create temp table fa3_pr1a_targets (
  name text primary key, sig text not null, overloads int not null, floor text not null,
  nargs int not null, anchor text not null, sha text not null
) on commit drop;
grant select on fa3_pr1a_targets to public;  -- session-local; SS1 reads it as clara_fn_owner

insert into fa3_pr1a_targets (name, sig, overloads, floor, nargs, anchor, sha) values
 ('match_bank_line',
  'clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)', 2, 'bookkeeper', 6,
  '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));',
  '493cdd27cf8dad42a48e210f2514660fa4c17a5d1c03aad91355feeadc771744'),
 ('unmatch_bank_match',
  'clara.unmatch_bank_match(uuid,uuid,text,text)', 1, 'bookkeeper', 4,
  '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));',
  'cd2333b64be822256f05a1c6eeaf199405c46119a588ffc1d71ffe9010577ec7'),
 ('complete_bank_reconciliation',
  'clara.complete_bank_reconciliation(uuid,uuid[],text)', 1, 'bookkeeper', 3,
  '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));',
  'd0110ffbb72db03d91c4eb2cadb3e898cd95a9057253c2225ecf6236fe5ec7e9'),
 ('void_bank_reconciliation',
  'clara.void_bank_reconciliation(uuid,text,text)', 1, 'bookkeeper', 3,
  '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));',
  '5ef59b980651212703bcce1ba8c776b49998a1e0ceaa08347c03a25945df657a'),
 ('resolve_bank_line_exception',
  'clara.resolve_bank_line_exception(uuid,text,text,uuid,text)', 1, 'owner', 5,
  '  c := clara._human_ctx(clara.role_rank(''owner''));',
  'e97c9c75430e7b808dcd0d96b6c74e80a6d4e9d32bc2fc89fcd2cb9909985810'),
 ('resolve_and_book_bank_line',
  'clara.resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)', 1, 'owner', 13,
  '  c := clara._human_ctx(clara.role_rank(''owner''));',
  'c1977e8667ac9ab7cc9059b788baf7d84b86e4cd92c2994e264f7da6252f3c16'),
 ('void_bank_statement',
  'clara.void_bank_statement(uuid,uuid,text,text)', 1, 'bookkeeper', 4,
  '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));',
  '5fa1db34c19884107872307d394f39f594bbf5a23b1f5a4ecd2de58d81b9ebd7'),
 ('add_bank_account',
  'clara.add_bank_account(uuid,text,text,text,text,uuid,text)', 1, 'bookkeeper', 7,
  '  c := clara._human_ctx(clara.role_rank(''bookkeeper''));',
  '7f7b89ccb5a65ba039157bb2708a333c51600386ec3ce19751559a340c66882c'),
 ('upsert_account',
  'clara.upsert_account(uuid,text,text,text,text,text,text)', 1, 'bookkeeper', 7,
  '  c:=clara._human_ctx(clara.role_rank(''bookkeeper''));',
  '94463acb4d936111c0eafba819555f41189a41e2a01fd9662cd119a17639b1c9');

-- =====================================================================================
-- SS0.3 PRESTATE -- every claim this file makes about what it is editing, MEASURED.
-- =====================================================================================
do $fa3_pre$
declare
  t record; v_oid oid; v_src text; v_def text; v_sha text; v_n int;
  v_core text; v_pinned int := 0;
begin
  select count(*)::int into v_n from fa3_pr1a_targets;
  if v_n <> 9 then
    raise exception 'F-A3 PR-1a prestate: the roster is % rows, not the NINE Annex J.1 names', v_n
      using errcode='CLR10';
  end if;

  for t in select * from fa3_pr1a_targets order by name loop
    v_core := '_' || t.name || '_core';

    -- (a) THE TARGET RESOLVES, at the exact signature. A regprocedure cast is the only read that
    -- cannot be satisfied by "some overload of that name".
    v_oid := to_regprocedure(t.sig);
    if v_oid is null then
      raise exception 'F-A3 PR-1a prestate: % does not resolve -- the ladder is not at the frontier this file was authored against', t.sig
        using errcode='CLR10';
    end if;

    -- (b) THE OVERLOAD COUNT IS EXACT. match_bank_line legitimately has two (the /6 human arity
    -- extracted here and the /7 rule arity PR-3 drops); every other name has one. A count that
    -- moved means an arity this file does not know about would keep an unfactored body reachable.
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname=t.name;
    if v_n <> t.overloads then
      raise exception 'F-A3 PR-1a prestate: clara.% has % live overload(s), expected %', t.name, v_n, t.overloads
        using errcode='CLR10';
    end if;

    -- (c) NOT ALREADY APPLIED. Checked BEFORE the sha pin, deliberately: a re-run would fail the
    -- pin too (the body has moved -- by this very file), and "sha mismatch" is the wrong
    -- diagnosis to hand an operator who simply ran the ceremony twice.
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname=v_core;
    if v_n <> 0 then
      raise exception 'F-A3 PR-1a prestate: clara.% already exists -- this file is ALREADY APPLIED (or a core of that name was minted elsewhere)', v_core
        using errcode='CLR10';
    end if;

    -- (d) THE BODY SHAPE THIS FILE EDITS: exactly one _human_ctx acquisition, and it is the
    -- pinned anchor at the pinned floor. A second derivation would be left stranded in the core.
    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
    v_n := (length(v_src) - length(replace(v_src, 'clara._human_ctx(', ''))) / length('clara._human_ctx(');
    if v_n <> 1 then
      raise exception 'F-A3 PR-1a prestate: % calls clara._human_ctx % time(s), expected exactly 1', t.sig, v_n
        using errcode='CLR10';
    end if;
    v_n := (length(v_src) - length(replace(v_src, t.anchor, ''))) / length(t.anchor);
    if v_n <> 1 then
      raise exception 'F-A3 PR-1a prestate: the pinned _human_ctx anchor for % occurs % time(s), expected exactly 1 -- the live body drifted from the shape this file was authored against', t.sig, v_n
        using errcode='CLR10';
    end if;

    -- (e) THE PROPERTIES THE EXTRACTION MUST PRESERVE, read now so the tail can prove they did.
    -- A body that is not plpgsql / definer / search-path-pinned / clara_fn_owner-owned is not
    -- the shape the header splice below is safe on.
    select count(*)::int into v_n from pg_proc p join pg_language l on l.oid=p.prolang
     where p.oid=v_oid and l.lanname='plpgsql' and p.prosecdef and p.prokind='f'
       and p.provolatile='v' and p.pronargs=t.nargs
       and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and coalesce(array_to_string(p.proconfig,','),'') = 'search_path=clara, pg_temp';
    if v_n <> 1 then
      raise exception 'F-A3 PR-1a prestate: % is not a volatile %-arg plpgsql SECURITY DEFINER function owned by clara_fn_owner with search_path=clara, pg_temp', t.sig, t.nargs
        using errcode='CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_oid, 'execute') then
      raise exception 'F-A3 PR-1a prestate: clara_authenticated cannot execute % -- this is not the human-lane entrance this file believes it is factoring', t.sig
        using errcode='CLR10';
    end if;

    -- (f) THE DEFINITION SPLITS EXACTLY at the AS $function$ boundary, and re-assembling the
    -- three pieces reproduces pg_get_functiondef byte-for-byte. A POSITIVE control on the splice
    -- instrument itself: a body that ever contained the tag fails HERE rather than producing a
    -- mis-cut wrapper header.
    v_def := pg_get_functiondef(v_oid);
    v_n := (length(v_def) - length(replace(v_def, E'\nAS $function$', ''))) / length(E'\nAS $function$');
    if v_n <> 1 then
      raise exception 'F-A3 PR-1a prestate: the AS $function$ boundary occurs % time(s) in % (expected exactly 1)', v_n, t.sig
        using errcode='CLR10';
    end if;
    if v_def <> left(v_def, position(E'\nAS $function$' in v_def)) || 'AS $function$' || v_src || '$function$' || E'\n' then
      raise exception 'F-A3 PR-1a prestate: pg_get_functiondef(%) does not reassemble from header + AS $function$ + prosrc + $function$ -- the splice instrument does not understand this definition; refuse', t.sig
        using errcode='CLR10';
    end if;
    if position('$fa3_core$' in v_src) <> 0 or position('$fa3_wrap$' in v_src) <> 0 then
      raise exception 'F-A3 PR-1a prestate: the body of % contains one of this file''s dollar-quote tags', t.sig
        using errcode='CLR10';
    end if;

    -- (g) THE PROSRC SHA-256 PIN (the F-A1 pre-quiesce tripwire). The bank rules machine's two
    -- bodies are spliced across generations and readable from no file, so this pin -- not a file
    -- citation -- is what says "the body I was authored against is the body that is live".
    v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
    if v_sha <> t.sha then
      raise exception 'F-A3 PR-1a prestate: % prosrc sha256 mismatch (got %, expected %) -- this is NOT the body PR-1a was authored and reviewed against. STOP the ceremony; re-derive the tip on a rig and re-pin before re-cutting',
        t.sig, v_sha, t.sha using errcode='CLR10';
    end if;
    v_pinned := v_pinned + 1;
  end loop;

  raise notice 'F-A3 PR-1a prestate: clean -- all % target bodies resolve at their exact signatures with the pinned arity and overload count, carry exactly one pinned _human_ctx anchor, split cleanly at the AS $function$ boundary, are volatile plpgsql SECURITY DEFINER owned by clara_fn_owner with search_path=clara+pg_temp and executable by clara_authenticated, hold no core of the extracted name yet, and match their pinned prosrc sha256', v_pinned;
end
$fa3_pre$;

-- =====================================================================================
-- SS1 -- THE EXTRACTION. Nine cores created from the LIVE bodies; nine public verbs replaced by
-- delegators built from their own LIVE headers. Every string that reaches a CREATE is derived
-- from the catalog at apply time; the only text this file authors is the ctx unpack and the
-- delegator body.
-- =====================================================================================
set role clara_fn_owner;

do $fa3_cut$
declare
  t record; v_oid oid; v_core_oid oid; v_src text; v_def text; v_head text;
  v_core text; v_ctx text; v_argnames text; v_n int; v_made int := 0;
begin
  for t in select * from fa3_pr1a_targets order by name loop
    v_core := '_' || t.name || '_core';
    v_oid := to_regprocedure(t.sig);

    select p.prosrc, pg_get_functiondef(p.oid),
           (select string_agg(a.n, ', ' order by a.o)
              from unnest(p.proargnames) with ordinality as a(n,o))
      into v_src, v_def, v_argnames
      from pg_proc p where p.oid = v_oid;
    if v_argnames is null or v_argnames = '' then
      raise exception 'F-A3 PR-1a S1: % has no named arguments -- the delegator cannot forward without inventing names', t.sig
        using errcode='CLR10';
    end if;
    v_head := left(v_def, position(E'\nAS $function$' in v_def));

    -- THE ONE SUBSTITUTION. The `_human_ctx` acquisition becomes the ctx unpack; the raise is the
    -- 0044:1722-1726 shape -- FAIL CLOSED on a missing or malformed context (an absent actor or
    -- firm is CLR10 'core_ctx_missing', never a silent NULL flowing into a firm predicate).
    v_ctx := format($fa3_ctx$  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the %s core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;$fa3_ctx$, t.name);

    -- THE CORE. Header = the live header with the name re-pointed and p_ctx prepended (every
    -- other property -- the argument list with its defaults, RETURNS, LANGUAGE, SECURITY
    -- DEFINER, SET search_path, volatility -- rides along verbatim). Body = the live prosrc with
    -- exactly the one substitution above.
    v_n := (length(v_head) - length(replace(v_head, 'CREATE OR REPLACE FUNCTION clara.' || t.name || '(', '')))
             / length('CREATE OR REPLACE FUNCTION clara.' || t.name || '(');
    if v_n <> 1 then
      raise exception 'F-A3 PR-1a S1: the CREATE header for % is not uniquely locatable (% occurrence(s))', t.sig, v_n
        using errcode='CLR10';
    end if;
    execute replace(v_head,
                    'CREATE OR REPLACE FUNCTION clara.' || t.name || '(',
                    'CREATE OR REPLACE FUNCTION clara.' || v_core || '(p_ctx jsonb, ')
            || 'AS $fa3_core$' || replace(v_src, t.anchor, v_ctx) || '$fa3_core$';

    select p.oid into v_core_oid from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname=v_core;
    if v_core_oid is null then
      raise exception 'F-A3 PR-1a S1: clara.% was not created', v_core using errcode='CLR10';
    end if;

    -- UNGRANTED AT BIRTH. A freshly created function has a NULL proacl, which MEANS PUBLIC
    -- EXECUTE -- rig-meta's grantMatrixFailures reads exactly that -- so this revoke is the
    -- difference between an internal delegate and a second public entrance (0040 tail-7(3)).
    execute format('revoke all on function %s from public', v_core_oid::regprocedure);

    -- THE WRAPPER. Header spliced from the LIVE definition -- nothing about the public face is
    -- retyped. Body: the floor, then the delegation, and NOTHING that acquires.
    execute v_head || 'AS $fa3_wrap$' || format($fa3_wrap$
declare c record;
begin
  -- F-A3 PR-1a (design SS4, Annex A.2): the public verb keeps its name, arity, ACL, owner,
  -- volatility and floor and becomes a thin delegator. It acquires NOTHING -- every rung of the
  -- estate's lock order (Annex C) moved into clara.%s with the body, and so did the prosrc pins
  -- that measure it.
  c := clara._human_ctx(clara.role_rank(%L));
  return clara.%I(jsonb_build_object('actor', c.actor, 'firm', c.firm),
    %s);
end
$fa3_wrap$, v_core, t.floor, v_core, v_argnames) || '$fa3_wrap$';

    v_made := v_made + 1;
  end loop;

  if v_made <> 9 then
    raise exception 'F-A3 PR-1a S1: % extractions executed, expected 9', v_made using errcode='CLR10';
  end if;
  raise notice 'F-A3 PR-1a S1: % core extractions executed -- nine cores created from the live bodies and revoked from PUBLIC, nine public verbs replaced by delegators built from their own live headers', v_made;
end
$fa3_cut$;

reset role;

-- =====================================================================================
-- SS2 -- TAIL SELF-PROOF. The claim of this PR is "nothing changed", and the tail proves it four
-- ways per verb: (1) the public face is unmoved on every property a caller can observe; (2) the
-- core body INVERTS back to the pinned prestate sha, so the extraction is byte-faithful and not
-- merely plausible; (3) the core is reachable by nobody; (4) the wrapper acquires and writes
-- nothing while the cores keep the rungs. It RAISES on failure -- a notice is not a gate.
-- =====================================================================================
do $fa3_tail$
declare
  t record; v_oid oid; v_core_oid oid; v_src text; v_core_src text; v_sha text;
  v_core text; v_ctx text; v_n int; v_role text; v_needle text; v_acl text;
  v_proved int := 0; v_rungs int := 0;
begin
  for t in select * from fa3_pr1a_targets order by name loop
    v_core := '_' || t.name || '_core';
    v_ctx := format($fa3_ctx$  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the %s core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;$fa3_ctx$, t.name);

    -- ---- (1) THE PUBLIC FACE IS UNMOVED. Re-resolved at the SAME exact signature (so arity and
    -- every argument type survived), then every observable property re-read.
    v_oid := to_regprocedure(t.sig);
    if v_oid is null then
      raise exception 'F-A3 PR-1a tail: % no longer resolves -- the wrapper moved the public arity', t.sig
        using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p join pg_language l on l.oid=p.prolang
     where p.oid=v_oid and l.lanname='plpgsql' and p.prosecdef and p.provolatile='v'
       and p.prokind='f' and p.pronargs=t.nargs
       and pg_get_userbyid(p.proowner)='clara_fn_owner'
       and coalesce(array_to_string(p.proconfig,','),'') = 'search_path=clara, pg_temp';
    if v_n <> 1 then
      raise exception 'F-A3 PR-1a tail: %''s arity/owner/volatility/definer/search_path did not survive the wrapper', t.sig
        using errcode='CLR10';
    end if;
    -- The ACL is the human lane's entrance, and `create or replace` must have preserved it. Read
    -- POSITIVELY (clara_authenticated CAN execute), never as "proacl is not null".
    if not has_function_privilege('clara_authenticated', v_oid, 'execute') then
      raise exception 'F-A3 PR-1a tail: clara_authenticated lost EXECUTE on % -- the human lane is closed', t.sig
        using errcode='CLR10';
    end if;
    select coalesce(array_to_string(p.proacl::text[], ' | '),'(null)') into v_acl from pg_proc p where p.oid=v_oid;
    if position('=X/' in v_acl) = 0 then
      raise exception 'F-A3 PR-1a tail: %''s ACL reads % -- expected explicit EXECUTE grants', t.sig, v_acl
        using errcode='CLR10';
    end if;

    -- ---- (2) THE BYTE-DIFFERENTIAL, and it is the whole safety argument. The extraction changed
    -- WHERE the body lives, never what it answers: invert the ONE substitution on the core's live
    -- prosrc and the pinned pre-extraction sha-256 must come back. One space, one reordered
    -- clause, one dropped comment anywhere in the body and this fails.
    select p.oid, p.prosrc into v_core_oid, v_core_src from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname=v_core;
    if v_core_oid is null then
      raise exception 'F-A3 PR-1a tail: clara.% is absent', v_core using errcode='CLR10';
    end if;
    v_n := (length(v_core_src) - length(replace(v_core_src, v_ctx, ''))) / length(v_ctx);
    if v_n <> 1 then
      raise exception 'F-A3 PR-1a tail: the ctx unpack occurs % time(s) in clara.% (expected exactly 1)', v_n, v_core
        using errcode='CLR10';
    end if;
    v_sha := encode(sha256(convert_to(replace(v_core_src, v_ctx, t.anchor),'UTF8')),'hex');
    if v_sha <> t.sha then
      raise exception 'F-A3 PR-1a tail: clara.% is NOT a pure extraction. Inverting the ctx substitution yields sha256 %, but the pinned pre-extraction body is % -- something other than the _human_ctx line moved',
        v_core, v_sha, t.sha using errcode='CLR10';
    end if;
    -- ...and the core no longer resolves a human context at all (the other half of the move).
    if position('clara._human_ctx(' in v_core_src) <> 0 then
      raise exception 'F-A3 PR-1a tail: clara.% still calls clara._human_ctx -- it would refuse every ctx-supplied caller PR-1b builds', v_core
        using errcode='CLR10';
    end if;

    -- ---- (3) THE CORE IS UNGRANTED. Closed-world over the LIVE catalog's clara roles, never a
    -- hand list, so a role minted after this file was written is still covered.
    if (select p.proacl from pg_proc p where p.oid=v_core_oid) is null then
      raise exception 'F-A3 PR-1a tail: clara.% has a NULL proacl, which grants PUBLIC EXECUTE -- the revoke did not land', v_core
        using errcode='CLR10';
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid=v_core_oid and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'F-A3 PR-1a tail: PUBLIC holds EXECUTE on clara.%', v_core using errcode='CLR10';
    end if;
    for v_role in select r.rolname from pg_roles r
                   where r.rolname like 'clara%' and r.rolname <> 'clara_fn_owner' order by 1 loop
      if has_function_privilege(v_role, v_core_oid, 'execute') then
        raise exception 'F-A3 PR-1a tail: % can EXECUTE clara.% -- an extracted core is an internal delegate and holds ZERO grants (Annex H.1)', v_role, v_core
          using errcode='CLR10';
      end if;
    end loop;
    if pg_get_userbyid((select p.proowner from pg_proc p where p.oid=v_core_oid)) <> 'clara_fn_owner' then
      raise exception 'F-A3 PR-1a tail: clara.% is not owned by clara_fn_owner -- a SECURITY DEFINER body owned by anyone else runs with the wrong authority', v_core
        using errcode='CLR10';
    end if;

    -- ---- (4) THE WRAPPER ACQUIRES NOTHING. Annex C's law, asserted in the migration itself: the
    -- order is the DELEGATE'S OWN order, so the public body must hold no rung, no reservation, no
    -- row lock and no write -- otherwise the moved prosrc pins would stop covering the live path
    -- and the ABBA deadlock the R-L2/D40 lesson cost becomes re-introducible in silence.
    select p.prosrc into v_src from pg_proc p where p.oid=v_oid;
    if position('clara.' || v_core || '(' in v_src) = 0 then
      raise exception 'F-A3 PR-1a tail: % does not delegate to clara.%', t.sig, v_core using errcode='CLR10';
    end if;
    if position('clara._human_ctx(clara.role_rank(''' || t.floor || '''))' in v_src) = 0 then
      raise exception 'F-A3 PR-1a tail: % lost its % floor', t.sig, t.floor using errcode='CLR10';
    end if;
    foreach v_needle in array array['pg_advisory_xact_lock', 'clara._reserve_op(', ' for update',
                                    ' for share', 'insert into ', 'update clara.', 'delete from '] loop
      if position(v_needle in v_src) <> 0 then
        raise exception 'F-A3 PR-1a tail: the public body of % contains "%" -- a delegator must acquire and write NOTHING', t.sig, v_needle
          using errcode='CLR10';
      end if;
    end loop;
    -- ...and the CORE kept the rungs. A negative assertion alone would pass on a body that lost
    -- them entirely, so the positive twin is counted and checked against a MEASURED population.
    if position('pg_advisory_xact_lock' in v_core_src) <> 0 then
      v_rungs := v_rungs + 1;
    end if;

    v_proved := v_proved + 1;
  end loop;

  -- SEVEN of the nine live bodies take an advisory rung; upsert_account and add_bank_account take
  -- none (they serialise on the op receipt and the client row). Measured on the rig, not guessed:
  -- a different number means the estate's lock topology moved and Annex C is stale.
  if v_rungs <> 7 then
    raise exception 'F-A3 PR-1a tail: % of the nine extracted cores carry an advisory rung, expected 7 -- the lock topology Annex C pins has moved', v_rungs
      using errcode='CLR10';
  end if;
  if v_proved <> 9 then
    raise exception 'F-A3 PR-1a tail: % verbs proved, expected 9', v_proved using errcode='CLR10';
  end if;

  raise notice 'F-A3 PR-1a tail: OK -- % verbs extracted and PROVEN pure. For each: the core prosrc, with the ctx unpack inverted back to the _human_ctx anchor, re-derives the pinned pre-extraction sha256 EXACTLY, so nothing but that one line moved; the public verb still resolves at its original signature with its arity, owner, volatility, SECURITY DEFINER, search_path and clara_authenticated EXECUTE unmoved; every core is owned by clara_fn_owner, revoked from PUBLIC and executable by ZERO clara roles; no public body holds an advisory rung, a reservation, a row lock or a write, and % of the cores carry the advisory rungs that moved with them. No table DDL, no CHECK swap, no grant, no drop, no agent_tasks kind, no new wake surface. No table in workflow/graphile_worker/spike touched. D1 write-quiesce taken (nine audited writer bodies, SS0 inventory).', v_proved, v_rungs;
end
$fa3_tail$;
