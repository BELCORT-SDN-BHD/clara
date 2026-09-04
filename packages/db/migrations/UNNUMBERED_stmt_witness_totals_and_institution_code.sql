-- THE STATEMENT LANE'S TWO DB HALVES — lane L4's read (PR #545), ordered under 裁-190.
-- Refs #541 · the statement witness lane · 0038 (Wave C-b bank) · 0098 (F-A1 PR-4 witness pair).
--
-- UNNUMBERED at authoring; the number is claimed at merge prep under 裁-108, and it MUST sort
-- AFTER 0098 — the body this file re-cuts is 0098's own spliced successor core.
--
-- IT IS A SEPARATE FILE FROM THE WEB-READS COHORT ON PURPOSE. Everything in
-- UNNUMBERED_web_reads_and_small_doors.sql is additive; this file REPLACES a live audited body on
-- the statement ingest path, so it owns its own D1 write-quiesce window and its own ceremony step.
--
-- D1 INVENTORY (packages/db/README.md "Deploy contract"):
--   clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)
-- PostgreSQL runs an in-flight PL/pgSQL call to completion on the body it STARTED with, so a
-- statement ingest that begins before this commits and finishes after it runs the OLD body and
-- still refuses `totals_unreadable` on a witness payload with no printed totals. The failure mode
-- is a refusal the operator can simply re-run, not a wrong number — but the window is named
-- because a reader must not have to derive it. QUIESCE THE `statement_facts` LANE (stop admitting
-- new statement tasks, let in-flight ones drain), apply, resume.
-- The legacy `clara._persist_statement_core` is NOT touched; the tail proves it by sha256.
--
-- NO clara_authenticated DOOR IS ADDED HERE, so the "name your frontend home" rule has no
-- subject to name: the one new function is granted to clara_runtime alone, and its consumer is
-- the statement-facts workflow, not a browser surface.

set local statement_timeout = '5min';
-- PRECAUTIONARY. The single `create or replace function` takes no table lock; the bound exists so
-- a live deploy that meets an unexpected catalog lock fails fast rather than queueing behind it.
set local lock_timeout = '15s';

-- ==============================================================================================
-- 0. PRESTATE.
-- ==============================================================================================
do $pre$
declare
  v_n integer;
  v_def text;
begin
  if to_regclass('clara.bank_institutions') is null then
    raise exception 'stmt prestate: clara.bank_institutions is absent' using errcode='CLR10';
  end if;
  if to_regprocedure('clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)') is null then
    raise exception 'stmt prestate: 0098''s witness core is absent -- this file sorts AFTER 0098'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._stmt_institution_code(text)') is not null then
    raise exception 'stmt prestate: clara._stmt_institution_code(text) already exists' using errcode='CLR10';
  end if;

  -- 0.1 THE MEASUREMENT THIS FILE'S FIRST HALF RESTS ON: clara_runtime holds NO privilege on
  --     clara.bank_institutions and no policy names it. Measured, not assumed — if a grant had
  --     appeared since lane L4's read, the definer below would be solving a problem that no
  --     longer exists and the narrower answer would be to leave it alone.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='bank_institutions' and grantee='clara_runtime';
  if v_n<>0 then
    raise exception 'stmt prestate: clara_runtime already holds % grant(s) on clara.bank_institutions -- re-read the premise before adding a door', v_n
      using errcode='CLR10';
  end if;

  -- 0.2 THE SPLICE PRE-IMAGE, probed by exact count on the LIVE v2 body. The same comment and the
  --     same `if v_two and (...)` line also exist in the LEGACY core, which is exactly why the
  --     probe reads ONE oid rather than scanning pg_proc: this file must reach v2 and only v2.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
   where p.oid='clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)'::regprocedure;
  if position($w$v_two := (p_ingest_mode in ('ocr','witness'));$w$ in v_def)=0 then
    raise exception 'stmt prestate: the v2 body does not carry 0098''s two-read flag -- this is not the expected body'
      using errcode='CLR10';
  end if;
  if position($w$if p_ingest_mode = 'ocr' and ((v_h1->'total_debit_cents')$w$ in v_def)<>0 then
    raise exception 'stmt prestate: the v2 totals mandate is already OCR-keyed -- this file has already been applied'
      using errcode='CLR10';
  end if;
  v_n := (length(v_def) - length(replace(v_def, $a$  -- THE MANDATORY PRINTED TOTALS. MANDATORY on the OCR lane (`totals_unreadable`), checked
  -- when present elsewhere. This is the ONE control that catches an adjacent omission the
  -- running balance cannot see, and it is mandatory exactly where the reader can silently
  -- drop a row.
  if v_two and ((v_h1->'total_debit_cents') is null$a$, ''))) / length($a$  -- THE MANDATORY PRINTED TOTALS. MANDATORY on the OCR lane (`totals_unreadable`), checked
  -- when present elsewhere. This is the ONE control that catches an adjacent omission the
  -- running balance cannot see, and it is mandatory exactly where the reader can silently
  -- drop a row.
  if v_two and ((v_h1->'total_debit_cents') is null$a$);
  if v_n<>1 then
    raise exception 'stmt prestate: the mandatory-totals pre-image appears % time(s) in the v2 body (expected exactly 1) -- the body drifted', v_n
      using errcode='CLR10';
  end if;
  raise notice 'stmt prestate: OK -- clara_runtime holds zero grant on bank_institutions, the v2 witness core is present and carries the pre-image exactly once';
end $pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- 1. THE INSTITUTION RESOLVER (lane L4 half (i)).
-- ==============================================================================================
-- THE GAP. `clara.bank_institutions` is `force row level security` with a clara_fn_owner
-- all-policy and a `using (true)` human read (`0038:224-231`); clara_runtime holds NO grant and
-- no policy names it — measured in the prestate above, not inferred. The statement-facts
-- workflow's model returns "the bank's short code or name as printed (e.g. 'MBB', 'Maybank')"
-- (`packages/runtime/workflows/statementFacts.v2.prompts.mjs:105`), and the header normaliser
-- hands that value straight to `_persist_statement_core*`, which then requires it to BE a
-- registered code. So the lane has to map a printed name to a code, and it cannot read the roster.
--
-- A DEFINER, NOT A GRANT + POLICY, AND THE REASON IS NARROWNESS. A SELECT grant would hand
-- clara_runtime the whole roster to do arithmetic on in application code — which is precisely how
-- a mirror of this table ends up hard-coded in a workflow file, drifting from the catalog the
-- moment a bank is added. One value in, one value out, and the mapping stays in the database.
-- THE CONSUMER TO RETIRE is the in-workflow institution mirror lane L4 names in PR #545; this
-- file does not touch it, because that file is not on `main` and asserting anything about its
-- contents from here would be testimony about code I cannot read.
--
-- FAIL CLOSED, IN BOTH DIRECTIONS, AND NEVER A GUESS. Three tiers are tried in order and each is
-- ALL-OR-NOTHING: exactly one match returns, more than one raises `institution_ambiguous`, none
-- falls through to the next tier. No match at all raises `institution_unknown`. A resolver that
-- returned its best candidate would put a model's spelling in charge of which bank a statement
-- was bound to, and a wrong bank binding is a wrong account binding.
--   tier 1  the CODE itself, normalised. Codes are `^[A-Z0-9]{2,10}$` (`0038:183`) so this is a
--           primary-key probe and can never be ambiguous.
--   tier 2  the full NAME, normalised and equal.
--   tier 3  the normalised input CONTAINED in the normalised name — this is what resolves
--           'Maybank' to MBB via 'Malayan Banking Berhad (Maybank)'. It is also where a vague
--           input lands: 'Bank' is contained in almost every name, matches many, and refuses.
--           That is the tier working, not failing.
-- INACTIVE ROWS ARE NEVER RESOLVED. `active` exists so a retired institution stops being
-- selectable; a resolver that ignored it would re-introduce the row it was meant to retire.
create function clara._stmt_institution_code(p_printed text) returns text
  language plpgsql stable security definer set search_path=clara,pg_temp as $$
declare
  v_in    text;
  v_code  text;
  v_n     int;
begin
  v_in := upper(regexp_replace(coalesce(p_printed,''),'[^A-Za-z0-9]','','g'));
  if v_in='' then
    raise exception 'no institution was printed on the statement header'
      using errcode='CLR10',detail='{"reason":"institution_unknown"}';
  end if;

  -- tier 1 — the code itself.
  select bi.code into v_code from clara.bank_institutions bi
   where bi.active and bi.code=v_in;
  if v_code is not null then return v_code; end if;

  -- tier 2 — the full name, normalised.
  select count(*), min(bi.code) into v_n, v_code from clara.bank_institutions bi
   where bi.active and upper(regexp_replace(bi.name,'[^A-Za-z0-9]','','g'))=v_in;
  if v_n=1 then return v_code; end if;
  if v_n>1 then
    raise exception 'the printed institution "%" names % registered institutions', p_printed, v_n
      using errcode='CLR10',detail='{"reason":"institution_ambiguous"}';
  end if;

  -- tier 3 — contained in the normalised name.
  select count(*), min(bi.code) into v_n, v_code from clara.bank_institutions bi
   where bi.active
     and position(v_in in upper(regexp_replace(bi.name,'[^A-Za-z0-9]','','g')))<>0;
  if v_n=1 then return v_code; end if;
  if v_n>1 then
    raise exception 'the printed institution "%" matches % registered institutions and is not decidable', p_printed, v_n
      using errcode='CLR10',detail='{"reason":"institution_ambiguous"}';
  end if;

  raise exception 'the printed institution "%" is not a registered Malaysian bank', p_printed
    using errcode='CLR10',detail='{"reason":"institution_unknown"}';
end $$;
revoke all on function clara._stmt_institution_code(text) from public;
grant execute on function clara._stmt_institution_code(text) to clara_runtime;
comment on function clara._stmt_institution_code(text) is
  'Statement lane: resolve a PRINTED bank code or name to a clara.bank_institutions code. Three '
  'all-or-nothing tiers (code / exact normalised name / containment); ambiguity and no-match both '
  'RAISE (institution_ambiguous / institution_unknown) and nothing is ever guessed. Inactive rows '
  'never resolve. EXECUTE to clara_runtime only -- the roster itself gains no grant.';

-- ==============================================================================================
-- 2. THE WITNESS LANE'S TOTALS RULE (lane L4 half (ii)).
-- ==============================================================================================
-- THE ASYMMETRY, AS MEASURED. `clara._stmt_header_norm` admits a NULL printed total and refuses
-- only a total that is PRESENT but unreadable (`0038:1235-1257`). But 0098 folds the new
-- 'witness' mode into `v_two` (`v_two := (p_ingest_mode in ('ocr','witness'))`) because witness is
-- a two-READ lane exactly like OCR — and `v_two` is also the flag the MANDATORY printed totals
-- key on. So a Malaysian bank statement that prints no TOTAL DEBIT / TOTAL CREDIT block at all —
-- which many do — passes the structured lane and fails `totals_unreadable` on the witness lane,
-- for a property of the paper rather than a property of the read.
--
-- THE RE-CUT. The mandate keys on `p_ingest_mode = 'ocr'` instead of on `v_two`. Everything else
-- `v_two` gates is untouched, and that is the whole point of the fix's shape: the witness lane
-- keeps the second reader, the full load-bearing header agreement, the line-skeleton compare, and
-- — decisively — THE PER-ROW PRINTED RUNNING BALANCE (`0038:1697-1700`, still `v_two`-gated), so
-- the chain remains the second reader on this lane in the sense law 14 means it.
--
-- WHAT THE WITNESS LANE STILL REFUSES, so "admits NULL totals" is not read as "stops checking":
--   * one channel states a total and the other does not -> `readers_disagree` on
--     total_debit_cents / total_credit_cents (the header-agreement block, unchanged). The ONLY
--     newly-admitted shape is BOTH channels stating neither total.
--   * a stated total that is not a whole non-negative cents magnitude -> `totals_unreadable` from
--     `_stmt_header_norm`, unchanged, on every lane.
--   * a stated total that disagrees with the line sums -> `chain_broken` from the step-8
--     cross-check, unchanged: totals are still CHECKED WHEN PRESENT.
--   * a missing or mis-stated per-row running balance -> `chain_broken`, unchanged.
--
-- THE RESIDUAL, STATED RATHER THAN BURIED (hard constraint 1 — this is the accounting-correctness
-- half and it belongs in front of the owner, not inside a diff). 0038's own comment says the
-- printed totals are "the ONE control that catches an adjacent omission the running balance cannot
-- see". The case it means is real: two adjacent lines that NET TO ZERO, both dropped, leave every
-- printed running balance intact while both printed totals move. On the witness lane that case is
-- now caught only by the two readers having to agree on an identical line skeleton — strong, but
-- not the same control. The trade is deliberate and narrow: it buys the ability to ingest a
-- statement whose paper prints no totals block, which is the common Malaysian shape, and the OCR
-- lane keeps both controls. If the owner would rather keep both on the witness lane too, the
-- alternative is to make the mandate conditional on the DOCUMENT printing a totals block, which
-- needs a fact nothing in the estate records today.
do $stmt_splice$
declare
  v_sig  text := 'clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_legacy text := 'clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
  v_legacy_before text; v_legacy_after text;
begin
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_legacy_before
    from pg_proc p where p.oid=v_legacy::regprocedure;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid=v_sig::regprocedure;
  v_frm := $a$  -- THE MANDATORY PRINTED TOTALS. MANDATORY on the OCR lane (`totals_unreadable`), checked
  -- when present elsewhere. This is the ONE control that catches an adjacent omission the
  -- running balance cannot see, and it is mandatory exactly where the reader can silently
  -- drop a row.
  if v_two and ((v_h1->'total_debit_cents') is null$a$;
  v_cnt := (length(v_def) - length(replace(v_def,v_frm,''))) / length(v_frm);
  if v_cnt<>1 then
    raise exception 'stmt splice: the pre-image appears % time(s) at splice time', v_cnt using errcode='CLR10';
  end if;
  v_to := $t$  -- THE MANDATORY PRINTED TOTALS -- KEYED ON THE OCR LANE, NOT ON `v_two` (裁-190).
  -- `v_two` is the TWO-READ flag and 0098 folded 'witness' into it, which made a printed totals
  -- block mandatory on a lane whose refusal would then be about the PAPER rather than the read:
  -- many Malaysian statements print no TOTAL DEBIT / TOTAL CREDIT line at all, and such a
  -- statement passed the structured lane while failing the witness one. Keying on the mode makes
  -- the witness lane's totals rule equal the structured lane's -- checked when present, never
  -- mandatory -- while the OCR lane keeps the mandate unchanged.
  -- NOTHING ELSE `v_two` GATES MOVES. The witness lane keeps the second reader, the full header
  -- agreement (which still refuses `readers_disagree` when ONE channel states a total and the
  -- other does not -- the only newly-admitted shape is BOTH stating neither), the line-skeleton
  -- compare, and the per-row printed running balance below: the chain stays the second reader.
  if p_ingest_mode = 'ocr' and ((v_h1->'total_debit_cents') is null$t$;
  v_def := replace(v_def,v_frm,v_to);
  execute v_def;

  -- POSTCHECKS on the installed body, re-read from the catalog.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid=v_sig::regprocedure;
  if position($p$if p_ingest_mode = 'ocr' and ((v_h1->'total_debit_cents')$p$ in v_def)=0 then
    raise exception 'stmt splice postcheck: the OCR-keyed mandate did not land' using errcode='CLR10';
  end if;
  if position($p$if v_two and ((v_h1->'total_debit_cents')$p$ in v_def)<>0 then
    raise exception 'stmt splice postcheck: the v_two-keyed mandate survives -- the replace did not land'
      using errcode='CLR10';
  end if;
  -- EVERY OTHER v_two-GATED CONTROL MUST STILL BE THERE. These are the controls the fix is
  -- claiming it did not touch, so they are asserted rather than assumed.
  if position($p$v_two := (p_ingest_mode in ('ocr','witness'));$p$ in v_def)=0 then
    raise exception 'stmt splice postcheck: the witness two-read flag was disturbed' using errcode='CLR10';
  end if;
  if position('the two readers disagree about the statement header field' in v_def)=0
     or position('the two readers disagree about the statement line skeleton' in v_def)=0
     or position('the OCR statement lane requires two independent reads' in v_def)=0
     or position('the OCR statement lane requires one per row' in v_def)=0 then
    raise exception 'stmt splice postcheck: a two-read control other than the totals mandate moved'
      using errcode='CLR10';
  end if;
  -- The two totals CROSS-CHECKS (checked-when-present, step 8) are untouched on every lane.
  if position('the printed TOTAL CREDIT is % but the credit lines sum to %' in v_def)=0
     or position('the printed TOTAL DEBIT is % but the debit lines sum to %' in v_def)=0 then
    raise exception 'stmt splice postcheck: a printed-totals cross-check was lost' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid=v_sig::regprocedure)<>'clara_fn_owner' then
    raise exception 'stmt splice postcheck: the v2 core changed owner' using errcode='CLR10';
  end if;

  -- THE LEGACY CORE IS BYTE-UNTOUCHED. It carries the same pre-image text, so proving it did not
  -- move is the only way to show the splice reached one oid and not both.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_legacy_after
    from pg_proc p where p.oid=v_legacy::regprocedure;
  if v_legacy_after is distinct from v_legacy_before then
    raise exception 'stmt splice postcheck: the LEGACY _persist_statement_core body changed (% -> %)',
      v_legacy_before, v_legacy_after using errcode='CLR10';
  end if;
  raise notice 'stmt splice: OK -- v2 totals mandate re-keyed to the OCR lane; every other two-read control present; legacy core byte-untouched at sha %', v_legacy_before;
end $stmt_splice$;

-- ==============================================================================================
-- 3. `period_basis` — NOT ADDED, AND THE MEASURED REASON.
-- ==============================================================================================
-- The order asked this file to confirm whether a first-class `period_basis` column belongs on the
-- statement header, on the premise that "today the basis rides `corroboration_claimed`". THE
-- PREMISE DOES NOT HOLD AS READ, and the answer is therefore NO — not here, not yet.
--
-- WHAT I MEASURED, with the instrument named. `grep -rn "period_basis"` across `packages/`,
-- `apps/` and `docs/plan/active/` returns exactly two hits, both in a DIFFERENT subject: F-A4's
-- prepayment limb (`0140:848`, refusal token `service_period_basis_missing`, and its cell at
-- `packages/db/tests/f-a4-pr2a-carrier.test.mjs:154`). There is no `period_basis` anywhere on the
-- statement lane. `corroboration_claimed` in `0098:475,484,565,575,588,597` is not a basis at all:
-- it is `p_payload->'corroboration'` stored verbatim into the extraction envelope — an opaque
-- claim the reader made, not a typed period basis.
--
-- SO THERE IS NO ROSTER OF "RATIFIED BASIS TOKENS" TO WRITE A CHECK AGAINST. Adding a column with
-- a token list invented here would be a model minting product law — the exact shape hard
-- constraint 2 forbids. This is reported to the owner and to lane L4 in the PR body rather than
-- guessed at: if a period basis IS a fact the statement header should carry, the tokens are a
-- product ruling first and a nullable CHECK-bounded column second, in that order, and the column
-- is a five-line additive migration once the roster exists.

reset role;

-- ==============================================================================================
-- 4. FAIL-CLOSED TAIL.
-- ==============================================================================================
do $tail$
declare
  v_n integer;
  v_acl text[];
  v_code text;
  v_detail text;
begin
  -- 4.1 the resolver: exact signature, owner, definer, stable, EXECUTE to clara_runtime ALONE.
  select count(*) into v_n from pg_proc p
   where p.oid='clara._stmt_institution_code(text)'::regprocedure
     and p.prosecdef and p.provolatile='s' and pg_get_userbyid(p.proowner)='clara_fn_owner';
  if v_n<>1 then
    raise exception 'stmt tail: _stmt_institution_code is not a stable SECURITY DEFINER owned by clara_fn_owner'
      using errcode='CLR10';
  end if;
  select array_agg(distinct grantee order by grantee) into v_acl
    from (select (aclexplode(p.proacl)).grantee::regrole::text as grantee
            from pg_proc p where p.oid='clara._stmt_institution_code(text)'::regprocedure) g
   where grantee<>'clara_fn_owner';
  if v_acl is distinct from array['clara_runtime'] then
    raise exception 'stmt tail: _stmt_institution_code EXECUTE set is %, not exactly {clara_runtime}',
      coalesce(v_acl::text,'(none)') using errcode='CLR10';
  end if;
  if has_function_privilege('public','clara._stmt_institution_code(text)','execute') then
    raise exception 'stmt tail: _stmt_institution_code is still executable by PUBLIC' using errcode='CLR10';
  end if;

  -- 4.2 THE ROSTER GAINED NO GRANT. The door is the only new reach clara_runtime has.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='bank_institutions'
     and grantee not in ('clara_fn_owner','clara_authenticated','postgres');
  if v_n<>0 then
    raise exception 'stmt tail: % unexpected table grant(s) appeared on clara.bank_institutions', v_n
      using errcode='CLR10';
  end if;

  -- 4.3 THE RESOLVER ANSWERS, ON THE SEEDED ROSTER, at each tier — a door that cannot say YES has
  --     a meaningless NO. These are reads of the live catalog, not fixtures.
  v_code := clara._stmt_institution_code('MBB');
  if v_code<>'MBB' then
    raise exception 'stmt tail: tier 1 resolved MBB to %', v_code using errcode='CLR10';
  end if;
  v_code := clara._stmt_institution_code('Maybank');
  if v_code<>'MBB' then
    raise exception 'stmt tail: tier 3 resolved "Maybank" to % (expected MBB)', v_code using errcode='CLR10';
  end if;
  v_code := clara._stmt_institution_code('Public Bank Berhad');
  if v_code<>'PBB' then
    raise exception 'stmt tail: tier 2 resolved "Public Bank Berhad" to % (expected PBB)', v_code
      using errcode='CLR10';
  end if;
  -- AND IT REFUSES. Both refusal arms are exercised here so the tail proves a wall, not a lookup.
  begin
    v_code := clara._stmt_institution_code('Bank');
    raise exception 'stmt tail: the ambiguous input "Bank" resolved to % instead of refusing', v_code
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if position('institution_ambiguous' in coalesce(v_detail,''))=0 then
      raise;
    end if;
  end;
  begin
    v_code := clara._stmt_institution_code('Banco Fittizio');
    raise exception 'stmt tail: an unregistered institution resolved to % instead of refusing', v_code
      using errcode='CLR10';
  exception when sqlstate 'CLR10' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if position('institution_unknown' in coalesce(v_detail,''))=0 then
      raise;
    end if;
  end;

  raise notice 'stmt tail: OK -- _stmt_institution_code is a stable definer, clara_runtime-only, PUBLIC refused, the roster gained no grant; it resolves MBB/Maybank/Public Bank Berhad at all three tiers and REFUSES both an ambiguous and an unregistered input by named reason; the v2 witness core admits NULL printed totals while the OCR lane keeps its mandate and every other two-read control; the legacy core is byte-untouched; no period_basis column was invented.';
end $tail$;
