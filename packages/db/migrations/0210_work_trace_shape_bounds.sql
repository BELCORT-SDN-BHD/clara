-- 0210_work_trace_shape_bounds — #811 (successor to 0195 / #631):
-- THE EXECUTION TRACE'S TWO REMAINING LENGTH-ONLY BOUNDS BECOME SHAPE BOUNDS, AT THE DOOR.
-- =====================================================================================
-- Spec of record: issue #811 and its Agent Brief. Domain words: CONTEXT.md — "Execution trace".
-- This file edits NOTHING but the BODIES of two ungranted predicates 0195 created:
-- `clara._work_trace_revisions_ok(jsonb)` and `clara._work_trace_text_ok(text, text)`.
-- 0195's bytes are applied and immutable; this file is the correction, append-only.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. A numeric `observed_revisions` value gains a
-- MAGNITUDE-AND-SCALE ceiling, and the `run` kind of the field grammar gains a LONG-DIGIT clause
-- — so both fields are now bounded in SHAPE and not merely in LENGTH.
--
-- =====================================================================================
-- WHICH HALF OF 0195's LAYER-2 CLAIM THIS MAKES TRUE, AND WHICH HALF STAYS OPEN.
--
-- 0195's header (:213-222) states layer 2 as: every remaining column is bounded and
-- format-checked BY THE RELATION itself — "`model_id` and `run_id` to their own bounded
-- grammars … `observed_revisions` to the CLOSED key set with token-shaped values".
-- The review that produced #811 measured that both halves were true in LENGTH and not in SHAPE:
--
--   * `_work_trace_revisions_ok` admitted `jsonb_typeof = 'number'` with NO digit or magnitude
--     test, so `{"books_version": 5141882293107742}` — a 16-digit account run — was stored
--     verbatim and read back through the human door;
--   * the `run` kind required only a bounded character class, a leading alphanumeric and at
--     least one letter. It carried no long-digit exclusion, unlike the `id`, `model`, `token`
--     and `rev` kinds, so `run-<16 digits>` passed both the verb's diagnosis and
--     `ck_work_execution_traces_run_id`.
--
-- AFTER THIS FILE, AT THE DOOR: both halves are true in shape. An `observed_revisions` number is
-- a bounded revision counter, and a run id cannot carry a long digit run unless it is exactly
-- the shape the deployed Workflow DevKit mints.
--
-- AT THE WRITER, ONE HALF REMAINS OPEN, DELIBERATELY. `packages/runtime/lib/work-trace.mjs` is
-- inside `claraWork_v3`'s FROZEN closure and hash-locked in `frozen-workflows.json`; a comment
-- edit breaks that lock exactly as a code edit does. `traceRevisionOf` still returns ANY finite
-- JS number, and `traceRunOf` is still never applied to the value `recordTrace` sends. The
-- owner's standing ruling (docs/ARCHITECTURE.md §5.E, #815) is that hardening that module ships
-- with the NEXT frozen version. The matching writer-side bound is therefore RECORDED as a
-- `claraWork_v4` requirement in `packages/runtime/README.md` and is NOT implemented here.
-- Until `claraWork_v4` ships, the honest sentence is: the DOOR bounds these two fields in shape;
-- the WRITER does not, and the door is the wall.
--
-- NOTHING IS BACKFILLED. Rows already stored are not re-validated and are not rewritten;
-- `create or replace function` does not re-check existing rows against a CHECK constraint that
-- calls the replaced predicate. That is stated rather than hidden: an oversized value written
-- before this file stays readable through `clara.get_work_execution_trace`.
--
-- =====================================================================================
-- THE NUMERIC CEILING, AND WHY IT IS MAGNITUDE **AND** SCALE.
--
-- `abs(v) < 1e12  and  scale(v) <= 6`.
--
--   * A digit-count test on the RENDERED value is not enough: jsonb normalises a number to
--     `numeric`, so `1e30` is a perfectly ordinary numeric whose magnitude is the payload and
--     whose rendered form a naive `[0-9]{13,}` probe would or would not catch depending on the
--     renderer. The magnitude test catches it directly.
--   * The scale test closes the mirror image: `1.5e-20` has a small magnitude and 21 fractional
--     places, which is a payload slot of exactly the same kind.
--   * `1e12` is far above anything this vocabulary carries. The six admitted keys are
--     `knowledge_version`, `books_version`, `chart_revision`, `basis_digest`, `source_sha256`
--     and `question_version`; the two digest keys are STRINGS (the `rev` grammar), and the four
--     version keys are monotonic counters the estate increments one at a time. The review's
--     16-digit account run (5.14e15) is refused; a small integer revision is admitted.
--
-- =====================================================================================
-- THE RUN-ID LONG-DIGIT CLAUSE, AND THE ARGUMENT THAT IT CANNOT FIRE ON A REAL RUN ID.
--
-- `p ~ '^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$'  or  p !~ '[0-9]{13,}'`
--
-- The brief's instruction was to establish the WDK's run-id shape FROM EVIDENCE before choosing
-- the clause, because the writer sends the run id UNCONFORMED and `traceSafely` swallows a door
-- refusal: a clause sized for the wrong alphabet loses trace rows silently rather than raising.
-- Three shapes exist, and they are not the same:
--
--   1. THE DEPLOYED WDK's. `workflow` 4.8.4 / `@workflow/core` 4.8.4 mints
--        `const runId = `wrun_${ulid()}``
--      (node_modules/.pnpm/@workflow+core@4.8.4_ws@8.21.0/node_modules/@workflow/core/dist/
--       runtime/start.js:121; `ulid` is `monotonicFactory()` from the `ulid` package, :3,:27).
--      A ULID is 26 characters of Crockford base32 — `0123456789ABCDEFGHJKMNPQRSTVWXYZ`,
--      uppercase, I/L/O/U excluded. The estate's own captured evidence carries exactly that
--      shape: `wrun_01M20WGD9ETKK6RWCBA8CWG1GE`
--      (docs/plan/active/prototypes/agent-harness/runtime-boundary-pass.json:11).
--   2. 0195's OWN COMMENT says "`run_<uuid>` is the live shape" (0195:1163). That is the shape
--      `packages/runtime/tests/work-trace-redaction.test.mjs:166` mints (`run_${randomUUID()}`)
--      and the shape 0195's tail census admits by value (0195:2407). It is a v4 UUID, so its
--      longest possible digit run is the 12-character final group — 12, never 13.
--   3. THE DATABASE BATTERY's fixtures mint a third shape,
--      `w631-run_<base36 ms>_<base36 counter>_<8 hex>` (packages/db/tests/rig-helpers.mjs:329).
--      Its longest possible digit run is the 8-character hex tail — 8, never 13.
--      (It is the shape stored by every trace row this repository's own tests write.)
--
-- NO STORED ROWS WERE AVAILABLE TO COUNT. On the cluster this file was developed against,
-- `select count(*) from clara.work_execution_traces` is 0 — a migrated, seeded database carries
-- no workflow runs — so the shape census above is taken from the MINTING EXPRESSIONS and from
-- the estate's captured run ids, not from a `left(run_id, 5)` over stored rows. Stated rather
-- than implied.
--
-- WHY 13 AND NOT 8. Shapes 2 and 3 reach 12 and 8 digits respectively BY CONSTRUCTION, so the
-- 8-digit clause the other kinds carry would refuse a real run id roughly once in 44 (shape 3's
-- hex tail) and once in 300 (shape 2's uuid groups). 13 is the first threshold that shapes 2 and
-- 3 provably cannot reach: a UUID group is at most 12 characters and a hex tail is 8, and a
-- hyphen or underscore breaks every run between groups.
--
-- WHY THE `wrun_` ARM IS NEEDED ANYWAY. Shape 1 is 26 free base32 characters, 10 of which are
-- digits, so a 13-digit run is IMPROBABLE (≈4e-6 per id) but not IMPOSSIBLE — and "improbable"
-- is not the standard the brief set, because the failure is silent. The first arm therefore
-- admits EXACTLY the shape the WDK mints — `wrun_` plus 26 Crockford base32 characters, the
-- alphabet's excluded letters spelled out — before the digit clause is ever consulted. The
-- clause PROVABLY cannot fire on an id `@workflow/core` 4.8.4 mints, because such an id always
-- takes the first arm.
--
-- WHAT THE CLAUSE STILL REFUSES: `run-5141882293107742` (the review's literal), and any other
-- run id carrying 13 or more consecutive digits that is not a WDK ULID.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT TOUCH.
--   * The other five grammar kinds (`id`, `model`, `token`, `rev`, `free`) — byte-identical.
--   * The closed key vocabulary, the string/`rev` branch and the null branch of
--     `_work_trace_revisions_ok` — byte-identical.
--   * Both signatures, both volatilities (IMMUTABLE), both owners (`clara_fn_owner`) and both
--     ACLs: PUBLIC revoked, and NO application role holds EXECUTE. `create or replace` preserves
--     owner and ACL; §T re-reads the catalog and proves it.
--   * `clara.record_work_execution_trace` — signature and every raise unchanged. It calls both
--     predicates, so the DIAGNOSIS (CLR10 `invalid_trace` naming `p_observed_revisions` /
--     `p_run`) tightens in step with the WALL.
--   * `ck_work_execution_traces_revisions_shape` and `ck_work_execution_traces_run_id` — the
--     constraint definitions are untouched; they tighten because the predicates they call do.
--   * Every frozen body, the frozen manifest, and every runtime module. NO CUTOVER: the door is
--     strictly narrower than the writer, and the writer's ordinary payload is admitted (§T).
--
-- ROLLBACK is a NEW append-only migration (packages/db/README.md).
--
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: NONE of its own.
-- `clara.record_work_execution_trace` keeps CLR10 / `invalid_trace`, with
-- `detail.field = 'p_observed_revisions'`, `constraint = 'grammar_revision'` and
-- `detail.field = 'p_run'`, `constraint = 'grammar_run'` — the same pairs, now reached by two
-- more inputs.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits,
--     including a SHA256 PIN of each live body: this file replaces two bodies wholesale, so
--     "the body I am replacing is the one I read" is the claim that matters most.
-- =====================================================================================
do $w811_pre$
declare n text; v_src text; v_sha text; v_n int;
begin
  foreach n in array array[
    'clara._work_trace_text_ok(text,text)',
    'clara._work_trace_revisions_ok(jsonb)',
    'clara._work_trace_secret_shaped(text)',
    'clara.record_work_execution_trace(uuid,text,integer,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#811 prestate: prerequisite absent: % (migration 0195 has not been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.1 · EXACTLY ONE body of each name. A replace that created an overload instead would leave
  -- the CHECK constraints and the writer resolving to whichever one wins.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_work_trace_text_ok';
  if v_n <> 1 then
    raise exception '#811 prestate: clara._work_trace_text_ok has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='_work_trace_revisions_ok';
  if v_n <> 1 then
    raise exception '#811 prestate: clara._work_trace_revisions_ok has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- 0.2 · THE SHA PINS. 0195's bodies, byte for byte, as they are installed.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._work_trace_text_ok(text,text)'::regprocedure;
  if v_sha <> 'cca9a1ef0664fdbe1f4e7f370f49e6f334306fcc3d46904339e6047e8cf9a9a9' then
    raise exception '#811 prestate: clara._work_trace_text_ok is not 0195''s body (prosrc sha256 %) -- this file would overwrite somebody else''s recut', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid='clara._work_trace_revisions_ok(jsonb)'::regprocedure;
  if v_sha <> '8ec5451e051e9af6cf4c69a13c65519f342b981b2dfd07aefcf07d32f85b85fc' then
    raise exception '#811 prestate: clara._work_trace_revisions_ok is not 0195''s body (prosrc sha256 %) -- this file would overwrite somebody else''s recut', v_sha
      using errcode='CLR10';
  end if;

  -- 0.3 · THE GAPS ARE STILL OPEN. If they are not, this file has nothing to do and the pins
  -- above would already have said so; this is the readable half of the same statement.
  select p.prosrc into v_src from pg_proc p
   where p.oid='clara._work_trace_revisions_ok(jsonb)'::regprocedure;
  if position('numeric' in v_src) <> 0 then
    raise exception '#811 prestate: clara._work_trace_revisions_ok already bounds a numeric value'
      using errcode='CLR10';
  end if;
  if clara._work_trace_revisions_ok('{"books_version":5141882293107742}'::jsonb) is not true then
    raise exception '#811 prestate: the account-run-shaped number is ALREADY refused -- measured before the edit, it was admitted'
      using errcode='CLR10';
  end if;
  if clara._work_trace_text_ok('run-5141882293107742','run') is not true then
    raise exception '#811 prestate: the long-digit run id is ALREADY refused -- measured before the edit, it was admitted'
      using errcode='CLR10';
  end if;

  -- 0.4 · THE TWO CHECK CONSTRAINTS THAT CALL THEM still exist, so replacing the bodies moves the
  -- wall and the diagnosis together.
  foreach n in array array['ck_work_execution_traces_run_id',
                           'ck_work_execution_traces_revisions_shape'] loop
    if not exists (select 1 from pg_constraint
                    where conrelid='clara.work_execution_traces'::regclass and conname=n) then
      raise exception '#811 prestate: the field grammar constraint % is absent', n using errcode='CLR10';
    end if;
  end loop;

  raise notice '#811 prestate: clean -- both predicates exist exactly once, carry 0195''s pinned bodies, still ADMIT the account-run-shaped number and the run-<16 digits> id, and both CHECK constraints that call them are in place.';
end
$w811_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A THE REVISIONS PREDICATE. 0195's body with ONE disjunct added.
--
-- Every other arm is carried over verbatim: the object test, the CLOSED six-key vocabulary, the
-- string/number/null type gate and the `rev` grammar on the string branch.
-- =====================================================================================
create or replace function clara._work_trace_revisions_ok(p jsonb) returns boolean
  language sql immutable set search_path=clara,pg_temp as $$
  select p is not null and jsonb_typeof(p) = 'object'
     and not exists (
       select 1 from jsonb_each(p) kv
        where kv.key not in ('knowledge_version','books_version','chart_revision',
                             'basis_digest','source_sha256','question_version')
           or jsonb_typeof(kv.value) not in ('string','number','null')
           or (jsonb_typeof(kv.value) = 'string'
               and not clara._work_trace_text_ok(kv.value #>> '{}', 'rev'))
           -- #811: a NUMBER value is a bounded REVISION COUNTER, not a free numeric slot. The
           -- bound is on MAGNITUDE **and** SCALE: a digit-count test on the rendered value would
           -- miss `1e30`, and a magnitude test alone would miss `1.5e-20`. 1e12 is far above any
           -- counter this closed vocabulary carries; the review's 16-digit account run is 5.14e15.
           or (jsonb_typeof(kv.value) = 'number'
               and not (abs((kv.value #>> '{}')::numeric) < 1e12
                        and scale((kv.value #>> '{}')::numeric) <= 6)))
$$;
comment on function clara._work_trace_revisions_ok(jsonb) is
  '#631, bounded by #811: the CLOSED observed-revision vocabulary, enforced on the KEY and on the '
  'VALUE -- a digest, a SHORT token, or a number below 1e12 with at most 6 decimal places. 0195 '
  'checked the string branch only, so a numeric value was a payload slot (a 16-digit account run '
  'was stored verbatim). The WRITER side (traceRevisionOf in packages/runtime/lib/work-trace.mjs) '
  'is frozen and still unbounded; its matching bound is a claraWork_v4 requirement.';

-- =====================================================================================
-- §B THE FIELD GRAMMAR. 0195's body with ONE conjunct added to the `run` kind.
--
-- The `id`, `model`, `token`, `rev` and `free` kinds are carried over verbatim, character for
-- character, including the `free` kind's grouped-account and Malaysian-phone probes.
-- =====================================================================================
create or replace function clara._work_trace_text_ok(p text, p_kind text) returns boolean
  language sql immutable set search_path=clara,pg_temp as $$
  select case
    when p is null then true
    when p_kind = 'id' then
      p ~ '^[a-z0-9][a-z0-9_./-]{0,127}$' and p ~ '[a-z]' and p !~ '[0-9]{8,}'
        and not clara._work_trace_secret_shaped(p)
    when p_kind = 'model' then
      p ~ '^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,127}$' and p ~ '[A-Za-z]' and p !~ '[0-9]{8,}'
        and not clara._work_trace_secret_shaped(p)
    when p_kind = 'run' then
      p ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,200}$' and p ~ '[A-Za-z]'
        and not clara._work_trace_secret_shaped(p)
        -- #811: the long-digit clause the other kinds all carry, sized to the run ids that
        -- actually exist. FIRST ARM: exactly what @workflow/core 4.8.4 mints -- `wrun_` plus a
        -- 26-character Crockford base32 ULID (I, L, O and U are not in that alphabet). A WDK id
        -- always takes this arm, so the digit clause PROVABLY cannot fire on one. SECOND ARM:
        -- 13 consecutive digits, the first threshold the other two observed shapes cannot reach
        -- -- a v4 UUID group is at most 12 characters (`run_<uuid>`, 0195:1163) and the db
        -- battery's fixture tail is 8 hex characters. `run-<16 digits>` is refused.
        and (p ~ '^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$' or p !~ '[0-9]{13,}')
    when p_kind = 'token' then
      p ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$' and p !~ '[0-9]{8,}'
        and not clara._work_trace_secret_shaped(p)
    when p_kind = 'rev' then
      p ~ '^[0-9a-f]{64}$'
        or (p ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$' and p !~ '[0-9]{8,}'
            and not clara._work_trace_secret_shaped(p))
    when p_kind = 'free' then
      length(p) <= 500 and p !~ '[[:cntrl:]]' and p !~ '[0-9]{10,}'
        -- A GROUPED bank/card run carries separators, so the bare digit-run test above misses it
        -- (measured: '5141 8822 9310 7742' was admitted into a refusal message by the first cut of
        -- this grammar). This is `redactString`'s own account pattern, read into SQL.
        and p !~ '[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}'
        and p !~ '\+?60[ -]?[0-9]{1,2}[ -]?[0-9]{3,4}[ -]?[0-9]{4}'
        and p !~ '\m0[0-9]{1,2}[ -]?[0-9]{3,4}[ -]?[0-9]{4}\M'
        and not clara._work_trace_secret_shaped(p)
    else false end $$;
comment on function clara._work_trace_text_ok(text,text) is
  '#631, bounded by #811: the six field grammars clara.work_execution_traces enforces (id | model '
  '| run | token | rev | free). An unknown kind is FALSE, so a careless caller narrows rather than '
  'widens. The `run` kind now carries a long-digit clause: 13+ consecutive digits are refused '
  'unless the id is exactly the shape @workflow/core mints (wrun_ + a 26-character Crockford '
  'base32 ULID), which is why the clause cannot fire on a real workflow run id.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found.
-- =====================================================================================
do $w811_tail$
declare v_n int; v_src text; v_posture text; v_missing text;
begin
  -- 1 · still exactly ONE body of each, at the same signatures.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.proname in ('_work_trace_text_ok','_work_trace_revisions_ok');
  if v_n <> 2 then
    raise exception '#811 tail: expected exactly 2 predicate bodies, found % -- the replace created an overload', v_n
      using errcode='CLR10';
  end if;

  -- 2 · POSTURE, read from the catalog: IMMUTABLE, pinned search_path, owned by clara_fn_owner,
  -- and UNGRANTED -- PUBLIC revoked and no application role holds EXECUTE.
  foreach v_src in array array['clara._work_trace_text_ok(text,text)',
                               'clara._work_trace_revisions_ok(jsonb)'] loop
    select pg_get_userbyid(p.proowner) || ' | ' || p.provolatile::text || ' | '
           || coalesce(array_to_string(p.proconfig,','),'<none>') || ' | '
           || coalesce(array_to_string(p.proacl,','),'<null>')
      into v_posture from pg_proc p where p.oid = v_src::regprocedure;
    if v_posture is distinct from
       'clara_fn_owner | i | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner' then
      raise exception '#811 tail: % has the wrong posture -- expected owner clara_fn_owner, IMMUTABLE, search_path=clara, pg_temp and EXECUTE to NOBODY but the owner; got {%}', v_src, v_posture
        using errcode='CLR10';
    end if;
  end loop;

  -- 3 · THE TWO NEW BOUNDS HOLD, asserted BY VALUE against the committed bodies.
  if clara._work_trace_revisions_ok('{"books_version":5141882293107742}'::jsonb)
     or clara._work_trace_revisions_ok('{"books_version":1e30}'::jsonb)
     or clara._work_trace_revisions_ok('{"books_version":-1e30}'::jsonb)
     or clara._work_trace_revisions_ok('{"books_version":1.5e-20}'::jsonb)
     or clara._work_trace_revisions_ok('{"chart_revision":999999999999999}'::jsonb) then
    raise exception '#811 tail: an oversized numeric observed revision is still ADMITTED'
      using errcode='CLR10';
  end if;
  if clara._work_trace_text_ok('run-5141882293107742','run')
     or clara._work_trace_text_ok('run_0000000000000','run')
     or clara._work_trace_text_ok('wrun_5141882293107742','run') then
    raise exception '#811 tail: a long-digit run id is still ADMITTED' using errcode='CLR10';
  end if;

  -- 4 · AND EVERY VALUE THE RUNTIME ACTUALLY SENDS IS STILL ADMITTED. A grammar that refuses the
  -- real payload drops diagnostics silently -- the failure mode #811 exists to avoid, because
  -- the writer sends the run id UNCONFORMED and the frozen closure swallows the refusal.
  v_missing := '';
  if not clara._work_trace_revisions_ok('{"books_version":5}'::jsonb) then v_missing := v_missing || ' small-integer'; end if;
  if not clara._work_trace_revisions_ok('{"knowledge_version":0,"chart_revision":41}'::jsonb) then v_missing := v_missing || ' counters'; end if;
  if not clara._work_trace_revisions_ok('{"books_version":"2026-09-01"}'::jsonb) then v_missing := v_missing || ' token-revision'; end if;
  if not clara._work_trace_revisions_ok(jsonb_build_object('basis_digest', repeat('b',64))) then v_missing := v_missing || ' digest-revision'; end if;
  if not clara._work_trace_revisions_ok('{"books_version":null}'::jsonb) then v_missing := v_missing || ' null-revision'; end if;
  -- the three run-id shapes that exist: the WDK's ULID, 0195's documented run_<uuid>, and the
  -- database battery's own fixture id.
  if not clara._work_trace_text_ok('wrun_01M20WGD9ETKK6RWCBA8CWG1GE','run') then v_missing := v_missing || ' wdk-ulid'; end if;
  if not clara._work_trace_text_ok('run_9dcf64de-8ec6-47d7-85fb-e51f193fc557','run') then v_missing := v_missing || ' run-uuid'; end if;
  if not clara._work_trace_text_ok('w631-run_mfq9t2k8_1a_9dcf64de','run') then v_missing := v_missing || ' rig-fixture'; end if;
  -- a ULID whose random tail happens to be 12 digits: admitted by the first arm, and admitted by
  -- the second arm too -- the two arms agree below the threshold.
  if not clara._work_trace_text_ok('wrun_01M20WGD9E0000000000000GEX','run') then v_missing := v_missing || ' wdk-digit-run'; end if;
  if v_missing <> '' then
    raise exception '#811 tail: the bounded grammar REFUSES value(s) the runtime sends:%', v_missing
      using errcode='CLR10';
  end if;

  -- 5 · THE OTHER FIVE KINDS AND THE REST OF THE REVISIONS PREDICATE ARE UNCHANGED IN BEHAVIOUR,
  -- re-asserted by value against 0195's own tail literals.
  if clara._work_trace_text_ok('siti.rahmah@example.com.my','id')
     or clara._work_trace_text_ok('880214-08-5531','id')
     or clara._work_trace_text_ok('5141882293107742','id')
     or clara._work_trace_text_ok('Bearer abcdefghijklmnopqrstuvwxyz123456','id')
     or clara._work_trace_text_ok('postgres' || '://' || 'clara' || ':' || 'hunter2'
                                  || '@db.internal:5432/books','id')
     or clara._work_trace_text_ok('sk-proj-ZH4kQ9maRuntimeSecretValue1234','model')
     or clara._work_trace_text_ok('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9','model')
     or clara._work_trace_text_ok('+60 12-345 6789','free')
     or clara._work_trace_text_ok('IC 880214-08-5531 on file','free')
     or clara._work_trace_text_ok('acct 5141882293107742','free')
     or clara._work_trace_text_ok('acct 5141 8822 9310 7742','free')
     or clara._work_trace_text_ok('anything','no_such_kind')
     or clara._work_trace_revisions_ok('{"books_version":"siti.rahmah@example.com.my"}'::jsonb)
     or clara._work_trace_revisions_ok('{"transcript":"the whole conversation"}'::jsonb)
     or clara._work_trace_revisions_ok('{"books_version":true}'::jsonb) then
    raise exception '#811 tail: an unrelated grammar arm CHANGED -- only the run kind''s digit clause and the revisions predicate''s number branch may move'
      using errcode='CLR10';
  end if;
  if not (clara._work_trace_text_ok('accounting_work.model_segment','id')
          and clara._work_trace_text_ok('clara-capability-registry/v1','id')
          and clara._work_trace_text_ok('clara-work/v3','id')
          and clara._work_trace_text_ok('gpt-5.6-terra','model')
          and clara._work_trace_text_ok('egress_not_authorized','token')
          and clara._work_trace_text_ok('CLR13','token')
          and clara._work_trace_text_ok(repeat('b',64),'rev')
          and clara._work_trace_text_ok('2026-09-01','rev')
          and clara._work_trace_text_ok(null,'run')
          and clara._work_trace_text_ok('Clara is not currently authorised to use a model on this client''s books.','free')) then
    raise exception '#811 tail: an unrelated grammar arm now REFUSES a value 0195 admitted'
      using errcode='CLR10';
  end if;

  -- 6 · the CHECK constraints still call the predicates, so the wall moved with the diagnosis.
  select count(*)::int into v_n from pg_constraint
   where conrelid='clara.work_execution_traces'::regclass
     and conname in ('ck_work_execution_traces_run_id','ck_work_execution_traces_revisions_shape');
  if v_n <> 2 then
    raise exception '#811 tail: a field grammar constraint went missing' using errcode='CLR10';
  end if;

  raise notice '#811 tail: OK -- clara._work_trace_revisions_ok(jsonb) and clara._work_trace_text_ok(text,text) each exist exactly once, IMMUTABLE, search_path-pinned, owned by clara_fn_owner and granted to NOBODY; a numeric observed revision is now bounded at abs < 1e12 with scale <= 6 (the 16-digit account run, 1e30, -1e30 and 1.5e-20 are all refused) while a small integer counter, a token, a digest and a null still land; the run grammar refuses 13+ consecutive digits unless the id is exactly @workflow/core 4.8.4''s wrun_ + 26-character Crockford base32 ULID, so the clause cannot fire on a minted run id, and all three observed run-id shapes are admitted; the other five kinds and the rest of the revisions predicate are byte-for-byte 0195''s and re-measured by value. The WRITER side (work-trace.mjs traceRevisionOf / traceRunOf) is FROZEN and still unbounded -- that bound is a claraWork_v4 requirement, recorded in packages/runtime/README.md, not implemented here.';
end
$w811_tail$;
