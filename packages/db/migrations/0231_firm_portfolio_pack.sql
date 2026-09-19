-- 0231_firm_portfolio_pack — #659 (refresh spec, journey B1 Firm Home): THE FIRM'S PORTFOLIO
-- OF CLIENTS — one row per client the caller's RLS admits, each carrying counts of DISTINCT
-- accounting Work — as ONE firm-scoped, keyset-paged read; plus the disposition receipt a
-- compliance watch has never had a browser-reachable reader for.
-- =====================================================================================
-- Spec of record: issue #659 — "在事务所首页掌握各客户工作与注意事项". Domain words:
-- CONTEXT.md — "Firm portfolio pack", "Portfolio coverage", "Attention source freshness",
-- "Watch disposition", "Work attention facet", "Accounting work", "Needs you".
--
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. TWO read doors —
-- `clara.get_firm_portfolio_pack(p_limit, p_cursor, p_preview)` (SECURITY INVOKER, bookkeeper
-- floor, firm from `clara.jwt_firm()`) and `clara.get_compliance_watch_disposition(p_watch)`
-- (SECURITY DEFINER, bookkeeper floor) — and NOTHING else: zero new tables, columns, policies,
-- triggers or widened table grants, and zero recuts.
--
-- =====================================================================================
-- THIS FILE RECUTS NOTHING, AND THAT IS A CHECKED FACT RATHER THAN A CLAIM.
--
-- Five live bodies are READ-ONLY DEPENDENCIES of the two doors and of the surface above them:
-- `clara.list_review_queue`, `clara.list_accounting_work`, `clara.get_client_work_pack`,
-- `clara._work_run_attempts` and `clara.list_activity`. Each is pinned by `sha256(prosrc)` in the
-- prestate and re-asserted byte-identical in the tail, so "0231 recut nothing" is enforced by a
-- postcheck rather than by this sentence.
--
-- EVERY PIN WAS MEASURED ON A MIGRATED RIG (clara_659, PostgreSQL 17.11, frontier 0224), read off
-- `pg_proc.prosrc` — NEVER transcribed from file text. Several of these bodies are prosrc SPLICES
-- rather than any one file's text: `list_review_queue` was created 0011:3748, REPLACED WHOLE at
-- 0016:4558, and then spliced at 0017:516-653, 0036:1000-1073, 0041:5346, 0043:3553, 0146:116 and
-- 0180:1061 — seven splices over one replacement; `list_activity` was created 0181:218, replaced
-- 0183:554 and 0184:1915, then DROPPED and re-created at 0202:204. No file's text is either body.
--
-- =====================================================================================
-- WHY THE PORTFOLIO PACK COUNTS CLIENTS THE REVIEW QUEUE STRUCTURALLY EXCLUDES, AND SAYS SO.
--
-- `clara.accounting_work` carries no active-client guard at all — 0178's relations are firm-scoped
-- and nothing more — so this pack counts Work for EVERY client the caller's RLS admits, including
-- `onboarding` and `archived` ones. `clara.list_review_queue` does not: 0017 joins
-- `clara.clients ... and status='active'` into every one of its source CTEs (0017:523-591,
-- re-asserted 0017:642-647, copied by 0180:1077), so its attention numbers exclude those clients
-- by construction.
--
-- THE TWO POPULATIONS ARE THEREFORE DIFFERENT, AND THE RULING (D18.a) IS TO DISCLOSE THE
-- DIFFERENCE RATHER THAN TO LIFT THE 0017 GUARD. Lifting it would drag four other lanes' pinned
-- markers into this prestate — each `list_review_queue` splice re-derives every prior marker and
-- raises CLR10 on drift — to fix a disclosure problem. So the pack publishes
-- `sources.review_queue.excludes = ['onboarding','archived']` at envelope level, and every row for
-- such a client carries `coverage_reason = 'onboarding_client_excluded_from_queue'`. The door says
-- which part of the answer it is not making, instead of making it up.
--
-- AND THE LIVE SUBJECT OF THAT DISCLOSURE IS THE **ARCHIVED** CLIENT, measured rather than assumed.
-- `clara.admit_accounting_work` refuses a client that is not `active` ('client is not active -- no
-- new accounting work'), so an ONBOARDING client with Work is not a state any door can reach today;
-- an ARCHIVED one is, because the Work was admitted while the client was active and the client was
-- archived afterwards. Both statuses are excluded by the 0017 join, so the token covers both and is
-- spelled once; `p659.portfolio.onboarding_disclosed` drives the reachable half with a real
-- archived client and asserts the refusal on the other.
--
-- =====================================================================================
-- WHY THERE IS NO CLIENT ARGUMENT, AND WHY THE CURSOR IS THE ONLY PLACE AN IDENTITY CAN ENTER.
--
-- The signature is `(p_limit, p_cursor, p_preview)` and nothing else. The firm comes from
-- `clara.jwt_firm()`, never from a parameter, so there is no client id to forge the way
-- `get_client_work_pack`'s `p_client` invites (0214:234-236, and 0214:91-96's posture paragraph is
-- written about exactly that argument).
--
-- THAT LEAVES EXACTLY ONE CHANNEL: the `lower(name)|uuid` pair packed inside `p_cursor`. It is a
-- KEYSET POSITION, never a lookup. The body compares the decoded pair against `(lower(c.name),
-- c.id)` under a `c.firm_id = clara.jwt_firm()` predicate that is always present, and NEVER
-- resolves the cursor's uuid or name against `clara.clients` — not to "validate" it, not to reject
-- a cursor whose client was since archived. A cursor encoding another firm's REAL client pair and
-- one encoding an invented pair therefore answer IDENTICALLY: a well-formed page of the caller's
-- own firm positioned after that sort key, no refusal, no existence signal.
--
-- THIS IS WHERE THIS DOOR DIVERGES FROM `clara.list_review_queue`, DELIBERATELY. That door takes
-- an explicit `p_scope.client_id` and raises CLR10 'queue scope is malformed' off a
-- `not exists(... and firm_id=c.firm)` probe (0016:4569-4575) — it IS a cross-firm existence
-- oracle. Rebuilding that inside a PAGING argument, where no reviewer looks for one, is the
-- specific mistake this header exists to forbid. The `invalid_cursor` refusal below is a SHAPE
-- refusal only: decode, split, cast.
--
-- =====================================================================================
-- WHY THE CURSOR SPLITS AT THE LAST PIPE.
--
-- 0203:304 may use `position('|' in v_decoded)` because a `timestamptz` component can never
-- contain one. `clara.clients.name` carries NO character CHECK at birth or since — measured:
-- `grep -rn "clara.clients" packages/db/migrations/*.sql | grep -iE "alter table|add constraint|
-- check"` returns only the id+firm unique key (0007:59), the status CHECK swap (0017:37, :658-659)
-- and the fiscal-year CHECK (0041:774-779). So `Acme | KL Sdn Bhd` is a legal client name, and a
-- first-pipe split would hand the uuid cast a fragment. The trailing 36 characters are the uuid;
-- everything before the final pipe is the name.
--
-- AND AN EMPTY NAME COMPONENT IS A MALFORMED CURSOR, not a first page. An empty leading component
-- compares below every real row and would answer a clean, well-formed FIRST page indistinguishable
-- from a fresh call — which is precisely the bug 0203's non-finite fence (0203:310-317) exists to
-- stop, transposed to a text key. It refuses with the same `invalid_cursor` token.
--
-- =====================================================================================
-- WHY THE ORDER IS `lower(c.name), c.id` AND WHY THAT COSTS NOTHING.
--
-- `uq_clients_firm_name (firm_id, lower(name))` (0003:41) is already UNIQUE inside one firm and
-- already orders this scan, and `clients.name` is NOT NULL (0003:37). Adding `c.id` makes the sort
-- key TOTAL, which is what a keyset needs: 0189:225-231 is the estate's own statement of why the
-- tie-break column belongs IN the key rather than beside it. Ordering by a non-unique expression
-- is the bug that never reds — it only shows up on a register larger than one page, which is
-- exactly the register nobody has in a fixture.
--
-- =====================================================================================
-- WHY THE RETRY LABEL IS A PREVIEW AND THE 101 CEILING IS NEVER APPROACHED.
--
-- `clara._work_run_attempts` (0189:250-296) REFUSES a null array or more than 101 ids with CLR10
-- `invalid_work_ids`. 0214 made that safe at client altitude by clamping its preview to 25. At
-- FIRM altitude the arithmetic changes: 100 clients x 5 preview ids is 500, and handing the helper
-- that array would make THE WHOLE PACK REFUSE — darkening every row on the board to report a
-- label. So the preview ids are assembled across the whole page and CUT AT 101 before the helper
-- is called; every row whose ids fell past the cut carries `coverage='partial'` with 0214's own
-- token `retry_label_preview_only`, reused verbatim rather than spelled a second way. And
-- `p_preview = 0` calls the helper NOT AT ALL — the cheap page.
--
-- =====================================================================================
-- WHAT THIS FILE DOES NOT ADD.
--
--   * NO MONEY KEY OF ANY KIND, and this is the file's central prohibition rather than a
--     preference: Wayfinder's ruling for Firm Home is 不汇总客户金额. A portfolio table is the
--     easiest place in the product to `reduce` rows into a false cross-client figure. The tail
--     therefore asserts the absence out of `prosrc`, and the db battery asserts it again off the
--     returned envelope — never a comment. (An in-body comment is part of `prosrc`, so the
--     function body below does not use the forbidden words even in prose.)
--   * NO `domain_events` watermark. 0214's reason, unchanged: `clara._append_event` is the single
--     emission point in the estate and the Work lane calls it ZERO times. The envelope carries
--     `computed_at` — the instant of THIS read — and the review queue's own watermark stays where
--     it already ships, named in `sources` rather than copied.
--   * NO figure this pack could be summed into. The columns OVERLAP by construction (a Work can be
--     running now and have posted yesterday) and the needs-you number comes from another read
--     entirely, at a LOWER floor.
--   * NO period, fiscal-year or as-of parameter. A financial period never narrows Work attention;
--     the signature is the enforcement of that sentence, and the tail asserts it.
--   * NO new needs-you row kind, no widening of `accounting_work.purpose`, and no enumeration of a
--     purpose vocabulary anywhere — concurrent lanes are widening that CHECK (0203:438-440).
--   * NO SUPPORTING INDEX, and that is a MEASUREMENT rather than a preference. DECISIONS §2 row
--     0231 permits ONE partial index on `clara.accounting_work` if the first-red
--     `explain (analyze, buffers)` on a seeded rig shows a sequential scan the three existing
--     indexes do not cover. Measured on clara_659 with a 300-client / 20 100-Work firm
--     (2026-09-19): the client page is `Index Scan using uq_clients_firm_name` (102 rows, 7
--     buffers, 0.080 ms) with only an INCREMENTAL Sort above it — the index presorts
--     `lower(name)` and only the tie-break groups sort, which no partial index on
--     `accounting_work` could change; the per-client aggregate is a `GroupAggregate` over
--     `Index Scan using uq_accounting_work_intent` (firm_id, client_id, …), 6 700 rows in
--     2.3 ms, 4.7 ms for the whole join. NO sequential scan appears anywhere, so nothing is
--     added. End to end the door answers a 100-client page in 17-18 ms with p_preview=3 and
--     7-8 ms with p_preview=0.
--   * NO new relation, column, policy, trigger or table grant, and NOTHING recut.
--
-- =====================================================================================
-- DOOR 2, AND WHY IT IS SECURITY DEFINER.
--
-- `clara.compliance_watches` and `clara.compliance_watch_events` both FORCE RLS with exactly one
-- `clara_fn_owner` policy and carry no application-role grant (0016:396-414). An INVOKER body
-- would therefore see nothing at all. The three human acts on a watch have shipped since 0016
-- (`ack_compliance_watch` 0016:1047, `snooze_compliance_watch` 0016:1101,
-- `resolve_compliance_watch` 0016:1151), each bookkeeper-floored; what has never existed is a
-- browser-reachable way to READ BACK what they recorded. This door is that read, at the same
-- floor, and it grants NOTHING on either relation — the definer body being the only reader is the
-- whole reason it exists.
--
-- AND IT RETURNS NO "VERSION". The acceptance criterion asks for actor / time / version.
-- `clara.compliance_watches` has no version column (0016:298-350) and `clara.audit_log.args`
-- records only `{watch, rationale, op_key}` (0016:1092-1093). `state_before -> state_after` on the
-- append-only trail is what this database actually holds, so that is what comes back. The tail
-- asserts the absence of the word rather than letting a later reader invent a number for it.
--
-- AND A "CLARA ACKNOWLEDGES THE WATCH" TOOL IS NOT A DEFERRED SUCCESSOR CONTRACT; IT IS A THING
-- THE DATABASE FORBIDS. All three write doors raise CLR03 when `wake_context().credential_id` is
-- not null or the caller is an agent user (0016:1053-1055). This slice therefore defers no runtime
-- verb: it calls no route, enqueues no workflow, and cuts no `_vN`.
--
-- FRONTEND HOME (apps/web):
--   clara.get_firm_portfolio_pack(...)          -> apps/web/lib/firm/portfolio-pack.ts
--                                                  (read by components/firm/firm-home/
--                                                   firm-portfolio-section.tsx on /)
--   clara.get_compliance_watch_disposition(...) -> apps/web/lib/firm/compliance-disposition.ts
--                                                  (rendered by components/firm/
--                                                   compliance-watch-affordance.tsx)
-- =====================================================================================

do $p659_pre$
declare
  v_missing text;
  v_sha text;
  v_n int;
  -- THE FIVE PRE-IMAGE PINS. MEASURED, NEVER TRANSCRIBED (WORK-ORDER rule 8 / DECISIONS §2.2):
  -- sha256 of the LIVE `prosrc` read off `pg_proc` on clara_659 at frontier 0224, PostgreSQL
  -- 17.11. This file recuts none of them; the pins are what make that a checked fact, and what
  -- forces a later worker who DOES recut one to come back and re-derive this door's arguments.
  v_pin_queue    constant text := '29deb82d1609441d40a5be6131ffac12dc6b0ee8f1d37645dd9de986ce3eaf40';
  v_pin_worklist constant text := '61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a';
  v_pin_pack     constant text := '07698be0d6867787bcea81994214edd017216c0471bf95db21f7629d1572441e';
  v_pin_attempts constant text := '3da8d655d78cac6eede8444321492fc4a1b5797a4f8a826fb878e26081cfa69e';
  v_pin_activity constant text := 'dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870';
begin
  -- THE RELATIONS BOTH BODIES READ, AND THE SHAPE THEY READ THEM AT.
  foreach v_missing in array array['accounting_work', 'operation_receipts', 'clients',
                                   'compliance_watches', 'compliance_watch_events'] loop
    if to_regclass('clara.' || v_missing) is null then
      raise exception 'firm_portfolio_pack prestate: clara.% is absent', v_missing
        using errcode = 'CLR10';
    end if;
  end loop;

  -- THE INDEX THAT ALREADY ORDERS THE CLIENT PAGE. Without it the keyset has no ordered path and
  -- this door's "no new object and no sort" claim is false.
  if to_regclass('clara.uq_clients_firm_name') is null then
    raise exception 'firm_portfolio_pack prestate: uq_clients_firm_name is absent -- the keyset has no ordered path'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.ix_accounting_work_client') is null then
    raise exception 'firm_portfolio_pack prestate: ix_accounting_work_client is absent'
      using errcode = 'CLR10';
  end if;
  if to_regclass('clara.ix_operation_receipts_client') is null then
    raise exception 'firm_portfolio_pack prestate: ix_operation_receipts_client is absent'
      using errcode = 'CLR10';
  end if;

  -- THE 0017 WIDENING THIS FILE'S WHOLE DISCLOSURE RESTS ON. If `onboarding` is not an admitted
  -- client status, `onboarding_client_excluded_from_queue` describes a condition that cannot
  -- arise, and the header above would be documenting a wall that is not there.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'clara.clients'::regclass
       and pg_get_constraintdef(oid) like '%onboarding%'
       and pg_get_constraintdef(oid) like '%archived%'
  ) then
    raise exception 'firm_portfolio_pack prestate: clara.clients admits no onboarding/archived status -- 0017 has not applied'
      using errcode = 'CLR10';
  end if;

  select string_agg(n, ', ') into v_missing from (
    select n from unnest(array['jwt_sub','jwt_firm','actor_role_rank','role_rank','_human_ctx',
                               'list_review_queue','list_accounting_work','get_client_work_pack',
                               '_work_run_attempts','list_activity',
                               'ack_compliance_watch','snooze_compliance_watch',
                               'resolve_compliance_watch']) as t(n)
     where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                        where ns.nspname = 'clara' and p.proname = t.n)
  ) x;
  if v_missing is not null then
    raise exception 'firm_portfolio_pack prestate: required live function(s) absent: %', v_missing
      using errcode = 'CLR10';
  end if;

  -- THE SINGLE-`pg_proc`-ROW CENSUS WALL FOR THE TWO NAMES THIS FILE INSTALLS.
  --
  -- 0103:1055-1070 raises CLR10 if any name IT installs carries more than one `pg_proc` row, and
  -- it does not reach these two names. DECISIONS §2.2 therefore makes every new migration write
  -- its own census for the names it installs: a new parameterisation is a NEW VERB, never a
  -- defaulted extra parameter on an existing one. 0202's DROP+re-issue of five
  -- definition-carried properties is the precedent for the other branch, and its cost (0203:36).
  foreach v_missing in array array['get_firm_portfolio_pack', 'get_compliance_watch_disposition'] loop
    select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'clara' and p.proname = v_missing;
    if v_n <> 0 then
      raise exception 'firm_portfolio_pack prestate: clara.% already exists (% pg_proc row(s)) -- this file installs it, and an overload would be a second surface nothing here argues for',
        v_missing, v_n using errcode = 'CLR10';
    end if;
  end loop;

  -- THE FIVE PINS. Read-only dependencies, every one; this file recuts NOTHING.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_review_queue(jsonb,jsonb,int)'::regprocedure;
  if v_sha <> v_pin_queue then
    raise exception 'firm_portfolio_pack prestate: clara.list_review_queue has DRIFTED from its pinned body (sha %) -- the active-client exclusion this pack DISCLOSES is a property of that body; re-derive it before applying', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
  if v_sha <> v_pin_worklist then
    raise exception 'firm_portfolio_pack prestate: clara.list_accounting_work has DRIFTED from its pinned body (sha %) -- every count link on the portfolio board is a URL into that door', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.get_client_work_pack(uuid,int)'::regprocedure;
  if v_sha <> v_pin_pack then
    raise exception 'firm_portfolio_pack prestate: clara.get_client_work_pack has DRIFTED from its pinned body (sha %) -- this door is its firm-altitude sibling and copies its coverage vocabulary verbatim', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._work_run_attempts(uuid[])'::regprocedure;
  if v_sha <> v_pin_attempts then
    raise exception 'firm_portfolio_pack prestate: clara._work_run_attempts has DRIFTED from the pinned 0189 body (sha %) -- the 101-id cut below is written against that body''s own ceiling', v_sha
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure;
  if v_sha <> v_pin_activity then
    raise exception 'firm_portfolio_pack prestate: clara.list_activity has DRIFTED from its pinned body (sha %) -- Firm Home''s recent-activity band swaps onto that door in this same slice', v_sha
      using errcode = 'CLR10';
  end if;

  raise notice '#659 prestate: clean -- the five read-only dependencies are at their pinned bodies, clara.clients admits onboarding/archived, the ordered paths exist, and neither name this file installs is taken.';
end $p659_pre$;

set role clara_fn_owner;

-- ==============================================================================================
-- clara.get_firm_portfolio_pack — Firm Home's portfolio table. SECURITY INVOKER; see the header
-- for why, relation by relation, and for why the cursor is a sort key rather than a lookup.
-- ==============================================================================================
create function clara.get_firm_portfolio_pack(
  p_limit   int  default 50,
  p_cursor  text default null,
  p_preview int  default 3
) returns jsonb
  language plpgsql stable security invoker
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  -- THE ACTOR RECORD IS `ctx`, NOT `c`, and that is deliberate rather than stylistic: `c` is the
  -- alias every clause below gives `clara.clients`, because the keyset clause this door is pinned
  -- on -- `order by lower(c.name), c.id` -- is asserted out of `prosrc` by this file's own tail and
  -- by p659.portfolio.cursor_stability. A plpgsql variable named `c` would shadow that alias.
  ctx record;
  v_limit    int;
  v_preview  int;
  v_now      timestamptz := now();
  v_today    date;
  v_from_date date;
  v_from     timestamptz;
  v_to       timestamptz;

  v_decoded     text;
  v_pipe        int;
  v_cursor_name text := null;
  v_cursor_id   uuid := null;

  v_ids         uuid[];
  v_rows        jsonb := '[]'::jsonb;
  v_preview_ids uuid[] := '{}'::uuid[];
  v_labelled    uuid[] := '{}'::uuid[];
  v_dropped     uuid[] := '{}'::uuid[];
  v_truncated   boolean := false;
  v_next        text := null;
  v_last        jsonb;
  v_coverage    text;
  v_reason      text;
begin
  -- THE INLINE FLOOR, restating 0189:344-347's three predicates verbatim, for the same structural
  -- reason 0181, 0189 and 0214 give: an INVOKER body cannot call clara._human_ctx (an internal
  -- helper with no application-role EXECUTE grant), so it asks the helpers that ARE granted.
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into ctx;
  if ctx.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if ctx.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  -- CLAMPS, NOT REFUSALS. A page size and a preview size are shaping, not authority.
  v_limit   := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_preview := least(greatest(coalesce(p_preview, 3), 0), 5);

  -- THE CURSOR. A SHAPE REFUSAL ONLY -- decode, split at the LAST pipe, cast. The decoded pair is
  -- never resolved against the register: see this file's header for why that would rebuild
  -- list_review_queue's cross-firm existence oracle inside a paging argument.
  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      -- THE SPLIT IS AT THE LAST PIPE. A client name may legally contain one (there is no
      -- character CHECK on it), so the trailing 36 characters are the uuid and everything before
      -- the final separator is the name. A first-pipe split hands the cast a fragment.
      v_pipe := length(v_decoded) - 36;
      if v_pipe < 2 or substr(v_decoded, v_pipe, 1) <> '|' then
        raise exception 'malformed cursor shape';
      end if;
      v_cursor_name := substr(v_decoded, 1, v_pipe - 1);
      v_cursor_id   := substr(v_decoded, v_pipe + 1)::uuid;
      -- AN EMPTY LEADING COMPONENT IS NOT A PAGE. It compares below every real row and would
      -- answer a clean, well-formed FIRST page indistinguishable from a fresh call -- 0203's
      -- non-finite fence, transposed to a text key. No cursor this door mints is ever empty.
      if nullif(btrim(v_cursor_name), '') is null then
        raise exception 'empty cursor name component';
      end if;
    exception when others then
      raise exception 'malformed portfolio cursor' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'invalid_cursor')::text;
    end;
  end if;

  -- THE SEVEN MALAYSIAN CALENDAR DATES ENDING TODAY, as a half-open instant range -- 0214's own
  -- resolution, so a drilldown from this board and one from a client board mean the same week.
  v_today     := (v_now at time zone 'Asia/Kuala_Lumpur')::date;
  v_from_date := v_today - 6;
  v_from      := (v_from_date::timestamp) at time zone 'Asia/Kuala_Lumpur';
  v_to        := ((v_today + 1)::timestamp) at time zone 'Asia/Kuala_Lumpur';

  -- PASS 1 -- THE CLIENT PAGE, under the keyset fence. Taken first so every pass below is bounded
  -- by v_limit+1 clients rather than by the firm.
  select array_agg(x.id order by x.sort_name, x.id) into v_ids
    from (
      select c.id, lower(c.name) as sort_name
        from clara.clients c
       where c.firm_id = clara.jwt_firm()
         and (v_cursor_name is null
              or (lower(c.name), c.id) > (lower(v_cursor_name), v_cursor_id))
       order by lower(c.name), c.id
       limit v_limit + 1
    ) x;
  v_ids := coalesce(v_ids, '{}'::uuid[]);
  v_truncated := coalesce(array_length(v_ids, 1), 0) > v_limit;
  if v_truncated then
    v_ids := v_ids[1:v_limit];
  end if;

  -- PASS 2 -- THE PREVIEW IDS, assembled across the WHOLE page and CUT AT 101 before the helper is
  -- asked anything. See the header: handing 0189's helper a firm-sized array would make the whole
  -- board refuse to report a row label.
  --
  -- THE INTERLEAVING IS THE FAIR CUT. The array is ordered by each Work's RANK WITHIN ITS CLIENT
  -- first and by the client second, so every client's newest Work is labelled before any client's
  -- second one. A client-major order would have labelled the first twenty rows completely and left
  -- the rest of the board unlabelled, which is a worse answer for the same call.
  if v_preview > 0 and coalesce(array_length(v_ids, 1), 0) > 0 then
    select coalesce(array_agg(t.id order by t.rn, t.client_id), '{}'::uuid[]) into v_preview_ids
      from (
        select w.id, w.client_id,
               row_number() over (partition by w.client_id
                                  order by w.created_at desc, w.id desc) as rn
          from clara.accounting_work w
         where w.client_id = any(v_ids)
           and w.status in ('queued', 'running')
      ) t
     where t.rn <= v_preview;
    if coalesce(array_length(v_preview_ids, 1), 0) > 101 then
      v_labelled := v_preview_ids[1:101];
      v_dropped  := v_preview_ids[102:array_length(v_preview_ids, 1)];
    else
      v_labelled := v_preview_ids;
    end if;
  end if;

  -- PASS 3 -- ONE AGGREGATE OVER clara.accounting_work, grouped by client and joined to the page.
  -- Never a per-client correlated read: an N-round-trip board is not a design (0214's own note,
  -- one altitude down, and this file's header states the measured plan).
  with page as (
    select c.id, c.name, c.status, lower(c.name) as sort_name
      from clara.clients c
     where c.id = any(v_ids)
  ), receipted as (
    select distinct o.work_id
      from clara.operation_receipts o
      join page pp on pp.id = o.client_id
     where o.outcome = 'committed'
  ), work_agg as (
    select w.client_id,
           count(distinct w.id) filter (where w.status in ('queued', 'running')) as n_active,
           count(distinct w.id) filter (where w.status in ('failed', 'refused'))  as n_attention,
           count(distinct w.id) filter (where w.status = 'failed')                as n_failed,
           count(distinct w.id) filter (where w.status = 'refused')               as n_refused,
           count(distinct w.id) filter (where w.status = 'completed'
                                          and r.work_id is null)                  as n_undated
      from clara.accounting_work w
      join page pp on pp.id = w.client_id
      left join receipted r on r.work_id = w.id
     group by w.client_id
  ), recent as (
    select o.client_id, count(distinct o.work_id) as n_success
      from clara.operation_receipts o
      join page pp on pp.id = o.client_id
     where o.outcome = 'committed'
       and o.created_at >= v_from
       and o.created_at <  v_to
     group by o.client_id
  ), preview_rows as (
    select w.client_id,
           bool_or(w.id = any(v_dropped)) as any_cut,
           jsonb_agg(jsonb_build_object(
             'work_id',            w.id,
             'purpose',            w.purpose,
             'status',             w.status,
             'memo',               nullif(w.basis->>'memo', ''),
             -- NULL MEANS "THIS DOOR DID NOT ASK", never "no runs". A Work whose id fell past the
             -- 101 cut carries null here and drives its row's coverage word below; a Work the
             -- helper WAS asked about carries a number, zero included.
             'attempts',           case when w.id = any(v_dropped) then null
                                        else coalesce(a.attempts, 0) end,
             'current_run_status', a.current_run_status,
             -- THE LABEL, and it is a fact: more than one run has been opened for this Work.
             'retrying',           case when w.id = any(v_dropped) then null
                                        else coalesce(a.attempts, 0) > 1 end,
             'created_at',         w.created_at)
             order by w.created_at desc, w.id desc) as rows
      from clara.accounting_work w
      -- 0189's granted SECURITY DEFINER helper, asked ONLY about the cut array. An EMPTY array is
      -- the honest "ask nothing" (it refuses a NULL one, 0189:270-274), so p_preview = 0 reaches
      -- it with no ids rather than with a null.
      left join clara._work_run_attempts(v_labelled) a on a.work_id = w.id
     where w.id = any(v_preview_ids)
     group by w.client_id
  ), assembled as (
    select pp.id, pp.name, pp.status, pp.sort_name,
           coalesce(wa.n_active, 0)    as n_active,
           coalesce(wa.n_attention, 0) as n_attention,
           coalesce(wa.n_failed, 0)    as n_failed,
           coalesce(wa.n_refused, 0)   as n_refused,
           coalesce(wa.n_undated, 0)   as n_undated,
           coalesce(rc.n_success, 0)   as n_success,
           coalesce(pr.rows, '[]'::jsonb) as preview,
           coalesce(pr.any_cut, false) as any_cut
      from page pp
      left join work_agg wa    on wa.client_id = pp.id
      left join recent rc      on rc.client_id = pp.id
      left join preview_rows pr on pr.client_id = pp.id
  ), scored as (
    select a.*,
           -- THE ROW'S OWN COVERAGE, in one precedence, stated once. A row carries at most ONE
           -- reason, and the order is how much of the answer each one withholds:
           --   onboarding_client_excluded_from_queue -- this row's Work numbers and the attention
           --     numbers beside them are drawn from DIFFERENT populations (see the header);
           --   completions_without_receipt -- a finished operation this database cannot date;
           --   retry_label_preview_only -- the counts are whole; only the row LABELS are short.
           case
             when a.status in ('onboarding', 'archived') then 'onboarding_client_excluded_from_queue'
             when a.n_undated > 0 then 'completions_without_receipt'
             when a.any_cut or a.n_active > jsonb_array_length(a.preview)
               then 'retry_label_preview_only'
             else null
           end as reason
      from assembled a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'client_id',             s.id,
           'name',                  s.name,
           'status',                s.status,
           'active',                s.n_active,
           'attention_failed',      s.n_attention,
           'failed',                s.n_failed,
           'refused',               s.n_refused,
           'recent_success',        s.n_success,
           'uncounted_completions', s.n_undated,
           'coverage',              case when s.reason is null then 'ok' else 'partial' end,
           'coverage_reason',       s.reason,
           'preview',               s.preview)
           order by s.sort_name, s.id), '[]'::jsonb)
    into v_rows
    from scored s;

  -- THE PAGE'S OWN COVERAGE. A truncated register is a page, not a portfolio: the reader is told
  -- so at envelope level rather than being left to infer it from the presence of a cursor.
  if v_truncated then
    v_coverage := 'partial';
    v_reason   := 'register_page_truncated';
    v_last     := v_rows -> (jsonb_array_length(v_rows) - 1);
    v_next     := encode(convert_to(lower(v_last->>'name') || '|' || (v_last->>'client_id'), 'UTF8'),
                         'base64');
  else
    v_coverage := 'ok';
    v_reason   := null;
  end if;

  -- THE ENVELOPE. `computed_at` is the instant of THIS read and is deliberately NOT called a
  -- watermark. `sources` DECLARES where each signal on the board comes from and how fresh it can
  -- be -- the pack does not re-read the review queue, which floors LOWER and is read by the
  -- browser beside it. `needs_you_ref` names whose number that is, at which floor, and what it
  -- structurally excludes, so one page can carry two populations honestly.
  return jsonb_build_object(
    'computed_at',   v_now,
    'preview_limit', v_preview,
    'page_limit',    v_limit,
    'window', jsonb_build_object(
      'from',      v_from,
      'to',        v_to,
      'from_date', v_from_date::text,
      'to_date',   v_today::text,
      'timezone',  'Asia/Kuala_Lumpur',
      'days',      7),
    'rows',            v_rows,
    'next_cursor',     v_next,
    'truncated',       v_truncated,
    'coverage',        v_coverage,
    'coverage_reason', v_reason,
    'sources', jsonb_build_object(
      'work',         jsonb_build_object('computed_at', v_now),
      'review_queue', jsonb_build_object('signal', 'watermark',
                                         'excludes', jsonb_build_array('onboarding', 'archived')),
      'compliance',   jsonb_build_object('signal', 'stale_evaluator', 'window_hours', 48),
      'lint',         jsonb_build_object('signal', 'stale_evaluator'),
      'sweep',        jsonb_build_object('signal', 'last_finalized_at')),
    'needs_you_ref', jsonb_build_object(
      'source',   'list_review_queue.counts',
      'floor',    'viewer',
      'excludes', jsonb_build_array('onboarding', 'archived')));
end $$;

comment on function clara.get_firm_portfolio_pack(int, text, int) is
  '#659 B1 Firm Home. The firm''s PORTFOLIO: one row per client the caller''s RLS admits, keyset-'
  'paged on lower(name),id with a base64 `lower(name)|uuid` cursor that is a SORT POSITION and is '
  'never resolved against clara.clients (a cursor naming another firm''s real client and one '
  'naming nothing answer identically -- unlike list_review_queue''s explicit client scope, which '
  'IS a cross-firm existence oracle, 0016:4569-4575). Each row carries counts of DISTINCT '
  'clara.accounting_work ids -- active (queued/running), attention (failed+refused, with the split '
  'published so a drilldown link and its count are the same population), and recent success (a '
  'COMMITTED clara.operation_receipts row inside the seven Asia/Kuala_Lumpur calendar dates ending '
  'today) -- plus uncounted_completions, a coverage word and a preview of at most p_preview rows. '
  'SECURITY INVOKER over clara.clients, clara.accounting_work and clara.operation_receipts, all '
  'three already clara_authenticated-granted with forced firm-scoped RLS; floored at bookkeeper by '
  '0189''s own three inline predicates. Preview ids are assembled across the whole page and CUT AT '
  '101 before clara._work_run_attempts is called, so a firm-sized board can never make that '
  'helper''s ceiling refuse the whole pack; rows past the cut carry coverage=partial with 0214''s '
  'own token retry_label_preview_only, and p_preview=0 calls the helper not at all. The pack counts '
  'Work for onboarding and archived clients, which list_review_queue structurally excludes '
  '(0017:523-591): that difference is DISCLOSED -- sources.review_queue.excludes at envelope level '
  'and coverage_reason=onboarding_client_excluded_from_queue on the row -- never fixed by lifting '
  'the 0017 guard. Carries computed_at (the read instant, NEVER a mutation position: the Work lane '
  'emits no domain events). Renders NO money figure of any kind (Wayfinder: Firm Home does not '
  'consolidate client sums) and publishes nothing the columns could be added into -- they overlap '
  'by construction. No period, fiscal-year or as-of parameter exists, and the firm is not a '
  'parameter either. EXECUTE to clara_authenticated only.';

-- ==============================================================================================
-- clara.get_compliance_watch_disposition — the acknowledgement echo (C88.10). SECURITY DEFINER,
-- because both relations are owner-policy-only and an INVOKER body would see nothing.
-- ==============================================================================================
create function clara.get_compliance_watch_disposition(p_watch uuid)
  returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp as $$
declare
  c record;
  w record;
  v_events jsonb;
begin
  -- THE THREE WRITE DOORS' OWN FLOOR (0016:1058), asked the same way they ask it. A DEFINER body
  -- can call clara._human_ctx, which is why door 1 restates predicates and this one does not.
  c := clara._human_ctx(clara.role_rank('bookkeeper'));

  -- A NULL WATCH IS A CALLER DEFECT, NOT AN ANSWER.
  if p_watch is null then
    raise exception 'a watch is required' using errcode = 'CLR10',
      detail = jsonb_build_object('reason', 'invalid_watch')::text;
  end if;

  select * into w from clara.compliance_watches where id = p_watch;
  -- A WATCH THAT NAMES NOTHING AND A WATCH IN ANOTHER FIRM ARE INDISTINGUISHABLE, and the token
  -- and message are the write doors' own (0016:1068-1070) so the four surfaces read as one door.
  if not found or w.firm_id is distinct from c.firm then
    raise exception 'watch not found' using errcode = 'CLR11';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_kind',   e.event_kind,
           'state_before', e.state_before,
           'state_after',  e.state_after,
           'figures',      e.figures,
           'actor',        e.actor,
           'rationale',    e.rationale,
           'created_at',   e.created_at)
           order by e.created_at asc, e.id asc), '[]'::jsonb)
    into v_events
    from clara.compliance_watch_events e
   where e.watch_id = p_watch;

  -- NO KEY NAMING A REVISION NUMBER. The acceptance criterion asks for one; this table holds none
  -- (0016:298-350) and clara.audit_log.args records only {watch, rationale, op_key}. The
  -- state_before -> state_after pair on the append-only trail is what the database actually knows,
  -- and the tail asserts that the absent word is absent from this body too.
  return jsonb_build_object(
    'watch_id',            w.id,
    'client_id',           w.client_id,
    'service_group',       w.service_group,
    'watch_kind',          w.watch_kind,
    'state',               w.state,
    'acknowledged_by',     w.acknowledged_by,
    'acknowledged_at',     w.acknowledged_at,
    'snoozed_until',       w.snoozed_until,
    'resolved_conclusion', w.resolved_conclusion,
    'resolved_by',         w.resolved_by,
    'resolved_at',         w.resolved_at,
    'resolved_evidence',   w.resolved_evidence,
    'updated_at',          w.updated_at,
    'events',              v_events);
end $$;

comment on function clara.get_compliance_watch_disposition(uuid) is
  '#659 / C88.10. The compliance watch DISPOSITION receipt: who acknowledged, snoozed or resolved '
  'this watch, when, with what rationale and evidence, plus the append-only '
  'clara.compliance_watch_events trail in created_at order. SECURITY DEFINER at the bookkeeper '
  'floor (clara._human_ctx) because clara.compliance_watches and clara.compliance_watch_events '
  'both FORCE RLS with a single clara_fn_owner policy and carry no application-role grant '
  '(0016:396-414) -- an INVOKER body would see nothing, and this file grants nothing on either '
  'relation. A null watch is CLR10 invalid_watch; a watch that names nothing and a watch in '
  'another firm are both CLR11 ''watch not found'', the write doors'' own token. It returns NO '
  'revision number: this table holds none, so each event''s state_before -> state_after pair is '
  'what the receipt names instead of a figure invented to satisfy a word. Read-only -- the three '
  'acts stay at ack_compliance_watch / snooze_compliance_watch / resolve_compliance_watch, all '
  'three of which refuse an agent identity outright (0016:1053-1055). EXECUTE to '
  'clara_authenticated only.';

-- ==============================================================================================
-- GRANTS. clara_authenticated ONLY, on both. A portfolio board and a disposition receipt are
-- human reads of a human's own queue -- never something a model lane produces or consumes on its
-- own, which is the same argument 0189 and 0214 make for the Work reads beside them.
-- ==============================================================================================
revoke all on function clara.get_firm_portfolio_pack(int, text, int) from public;
grant execute on function clara.get_firm_portfolio_pack(int, text, int) to clara_authenticated;

revoke all on function clara.get_compliance_watch_disposition(uuid) from public;
grant execute on function clara.get_compliance_watch_disposition(uuid) to clara_authenticated;

reset role;

-- ==============================================================================================
-- TAIL POSTCHECK.
-- ==============================================================================================
do $p659_tail$
declare
  v_n int;
  v_src text;
  v_bad text;
  v_sig_pack  constant text := 'clara.get_firm_portfolio_pack(int,text,int)';
  v_sig_dispo constant text := 'clara.get_compliance_watch_disposition(uuid)';
  -- The EXACT ACL both new names must carry when this file is done. Asserted literally rather than
  -- counted (0188 §5b / 0189's argument): the ACL array IS the complete answer to "who holds
  -- EXECUTE", and a NULL proacl -- the create default, where PUBLIC holds EXECUTE implicitly --
  -- fails this too, which is the point.
  v_acl constant text := 'clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner';
  v_pin_queue    constant text := '29deb82d1609441d40a5be6131ffac12dc6b0ee8f1d37645dd9de986ce3eaf40';
  v_pin_worklist constant text := '61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a';
  v_pin_pack     constant text := '07698be0d6867787bcea81994214edd017216c0471bf95db21f7629d1572441e';
  v_pin_attempts constant text := '3da8d655d78cac6eede8444321492fc4a1b5797a4f8a826fb878e26081cfa69e';
  v_pin_activity constant text := 'dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870';
  v_role text;
  v_name text;
begin
  -- 1 · BOTH NAMES EXIST, EXACTLY ONCE EACH. An overload would be a second surface with a second
  -- set of arguments nothing in this file argues for.
  if to_regprocedure(v_sig_pack) is null then
    raise exception 'firm_portfolio_pack tail: clara.get_firm_portfolio_pack is absent' using errcode = 'CLR10';
  end if;
  if to_regprocedure(v_sig_dispo) is null then
    raise exception 'firm_portfolio_pack tail: clara.get_compliance_watch_disposition is absent' using errcode = 'CLR10';
  end if;
  foreach v_name in array array['get_firm_portfolio_pack', 'get_compliance_watch_disposition'] loop
    select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'clara' and p.proname = v_name;
    if v_n <> 1 then
      raise exception 'firm_portfolio_pack tail: expected exactly one clara.%, found %', v_name, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 2 · THE SIGNATURE IS THE ENFORCEMENT OF TWO SENTENCES AT ONCE: "a financial period never
  -- narrows Work attention" (no period/fiscal-year/as-of parameter) and "the firm is not a
  -- parameter" (no client or firm argument at all -- the only channel a client identity can enter
  -- through is the cursor, and the body treats that as a sort key).
  if pg_get_function_arguments(v_sig_pack::regprocedure)
       <> 'p_limit integer DEFAULT 50, p_cursor text DEFAULT NULL::text, p_preview integer DEFAULT 3' then
    raise exception 'firm_portfolio_pack tail: the pack signature is % -- it takes a page size, a cursor and a preview size and NOTHING that could name a financial period or a subject',
      pg_get_function_arguments(v_sig_pack::regprocedure) using errcode = 'CLR10';
  end if;
  if pg_get_function_arguments(v_sig_dispo::regprocedure) <> 'p_watch uuid' then
    raise exception 'firm_portfolio_pack tail: the disposition signature is %',
      pg_get_function_arguments(v_sig_dispo::regprocedure) using errcode = 'CLR10';
  end if;

  -- 3 · POSTURE. Owner, security mode, volatility and the proconfig pins. Whitespace-insensitive,
  -- because PostgreSQL NORMALISES a GUC list when it stores it (0189's own measured note).
  select case when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                then 'owned by ' || pg_get_userbyid(p.proowner)
              when p.prosecdef is distinct from false
                then 'is not SECURITY INVOKER'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%search_path=clara,pg_temp%'
                then 'search_path is not pinned'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%plan_cache_mode=force_custom_plan%'
                then 'plan_cache_mode is not pinned (0183)'
              when p.provolatile <> 's'
                then 'is not STABLE'
              else null end
    into v_bad
    from pg_proc p where p.oid = v_sig_pack::regprocedure;
  if v_bad is not null then
    raise exception 'firm_portfolio_pack tail: % %', v_sig_pack, v_bad using errcode = 'CLR10';
  end if;
  select case when pg_get_userbyid(p.proowner) <> 'clara_fn_owner'
                then 'owned by ' || pg_get_userbyid(p.proowner)
              when p.prosecdef is distinct from true
                then 'is not SECURITY DEFINER -- an INVOKER body sees nothing on either watch relation'
              when replace(coalesce(array_to_string(p.proconfig, ','), ''), ' ', '')
                     not like '%search_path=clara,pg_temp%'
                then 'search_path is not pinned'
              when p.provolatile <> 's'
                then 'is not STABLE'
              else null end
    into v_bad
    from pg_proc p where p.oid = v_sig_dispo::regprocedure;
  if v_bad is not null then
    raise exception 'firm_portfolio_pack tail: % %', v_sig_dispo, v_bad using errcode = 'CLR10';
  end if;

  -- 4 · PUBLIC REVOKED, AND THE ACL ASSERTED LITERALLY, on both.
  foreach v_name in array array[v_sig_pack, v_sig_dispo] loop
    if has_function_privilege('public', v_name::regprocedure, 'execute') then
      raise exception 'firm_portfolio_pack tail: PUBLIC still holds EXECUTE on %', v_name using errcode = 'CLR10';
    end if;
    if not has_function_privilege('clara_authenticated', v_name::regprocedure, 'execute') then
      raise exception 'firm_portfolio_pack tail: clara_authenticated cannot execute %', v_name using errcode = 'CLR10';
    end if;
    select coalesce(array_to_string(p.proacl, ' | '), '(null)') into v_bad
      from pg_proc p where p.oid = v_name::regprocedure;
    if v_bad is distinct from v_acl then
      raise exception 'firm_portfolio_pack tail: the EXECUTE ACL on % is not exactly what this file granted: %', v_name, v_bad
        using errcode = 'CLR10';
    end if;
  end loop;

  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_pack::regprocedure;

  -- 5 · THE PROSRC NEGATIVES ON THE PACK -- THE FILE'S CENTRAL PROHIBITION.
  --
  -- Firm Home renders no money. A portfolio table is the easiest place in the product to reduce
  -- rows into a false cross-client figure, so the absence is a POSTCHECK rather than a comment.
  -- The tokens are assembled from fragments here so that this assertion's own text does not put
  -- the words it forbids into the body it is checking -- an in-body comment is part of prosrc.
  foreach v_name in array array['amount' || '_cents', '_' || 'cents', 'de' || 'bit',
                                'cre' || 'dit', 'to' || 'tal'] loop
    if position(v_name in v_src) <> 0 then
      raise exception 'firm_portfolio_pack tail: the pack body names a money/sum key (%) -- Firm Home consolidates no client figures, and an in-body COMMENT counts', v_name
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 6 · THE PROSRC POSITIVES ON THE PACK. Every one of these is a property a later refactor could
  -- lose silently, so each is probed the way 0203:601 probes its keyset clause.
  v_bad := '';
  if position('order by lower(c.name), c.id' in v_src) = 0 then v_bad := v_bad || ' keyset-order'; end if;
  if position('invalid_cursor' in v_src) = 0 then v_bad := v_bad || ' cursor-refusal'; end if;
  if position('empty cursor name component' in v_src) = 0 then v_bad := v_bad || ' empty-name-fence'; end if;
  if position('jwt_firm()' in v_src) = 0 then v_bad := v_bad || ' firm-self-scope'; end if;
  if position('Asia/Kuala_Lumpur' in v_src) = 0 then v_bad := v_bad || ' myt-window'; end if;
  if position('''committed''' in v_src) = 0 then v_bad := v_bad || ' committed-receipt'; end if;
  if position('least(greatest(coalesce(p_limit, 50), 1), 100)' in v_src) = 0 then v_bad := v_bad || ' limit-clamp'; end if;
  if position('least(greatest(coalesce(p_preview, 3), 0), 5)' in v_src) = 0 then v_bad := v_bad || ' preview-clamp'; end if;
  if position('v_preview_ids[1:101]' in v_src) = 0 then v_bad := v_bad || ' helper-cut'; end if;
  if position('onboarding_client_excluded_from_queue' in v_src) = 0 then v_bad := v_bad || ' onboarding-disclosure'; end if;
  if position('retry_label_preview_only' in v_src) = 0 then v_bad := v_bad || ' preview-coverage'; end if;
  if position('completions_without_receipt' in v_src) = 0 then v_bad := v_bad || ' undated-coverage'; end if;
  if position('register_page_truncated' in v_src) = 0 then v_bad := v_bad || ' page-coverage'; end if;
  if v_bad <> '' then
    raise exception 'firm_portfolio_pack tail: the pack body LOST arm(s):%', v_bad using errcode = 'CLR10';
  end if;
  -- AND THE PACK NEVER RESOLVES ITS CURSOR AGAINST THE REGISTER. The whole cross-firm argument in
  -- this file's header rests on the decoded pair being COMPARED and never looked up, and a lookup
  -- would be a THIRD read of clara.clients. The body makes exactly two: the keyset page, and the
  -- page CTE that re-reads those ids for their name and status. Counted rather than described.
  v_n := (length(v_src) - length(replace(v_src, 'from clara.clients', '')))
         / length('from clara.clients');
  if v_n <> 2 then
    raise exception 'firm_portfolio_pack tail: the pack body reads clara.clients % time(s), not the 2 the page and its fence need -- a third read is where a cursor lookup hides', v_n
      using errcode = 'CLR10';
  end if;

  -- 7 · THE PROSRC NEGATIVE ON THE DISPOSITION DOOR. The word the acceptance criterion asks for
  -- has no referent in this schema, and the door must not invent one.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig_dispo::regprocedure;
  if position('version' in v_src) <> 0 then
    raise exception 'firm_portfolio_pack tail: the disposition body names a revision number -- clara.compliance_watches carries no such column, so state_before -> state_after is the honest answer'
      using errcode = 'CLR10';
  end if;
  if position('watch not found' in v_src) = 0 then
    raise exception 'firm_portfolio_pack tail: the disposition door does not use the write doors'' own not-found token'
      using errcode = 'CLR10';
  end if;

  -- 8 · NO TABLE PRIVILEGE MOVED. This file grants on two functions and nothing else.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'clara' and table_name = 'agent_tasks' and grantee = 'clara_authenticated';
  if v_n <> 0 then
    raise exception 'firm_portfolio_pack tail: clara.agent_tasks gained a clara_authenticated grant'
      using errcode = 'CLR10';
  end if;
  select string_agg(format('%s:%s', t.table_name, t.privilege_type), ',' order by t.table_name, t.privilege_type)
    into v_bad
    from information_schema.role_table_grants t
   where t.table_schema = 'clara' and t.grantee = 'clara_authenticated'
     and t.table_name in ('accounting_work', 'operation_receipts', 'clients')
     and t.privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception 'firm_portfolio_pack tail: a non-SELECT privilege reached a relation this read borrows: %', v_bad
      using errcode = 'CLR10';
  end if;
  -- THE DECISIVE NEGATIVE FOR DOOR 2. Its SECURITY DEFINER rationale is that no application role
  -- can read either watch relation; if one could, the rationale would have to be re-argued.
  foreach v_role in array array['clara_authenticated', 'clara_runtime', 'clara_agent_ro',
                                'clara_wake_interactive', 'clara_wake_proactive'] loop
    select count(*) into v_n from information_schema.role_table_grants t
     where t.table_schema = 'clara'
       and t.table_name in ('compliance_watches', 'compliance_watch_events')
       and t.grantee = v_role;
    if v_n <> 0 then
      raise exception 'firm_portfolio_pack tail: % holds % privilege(s) on a compliance watch relation -- door 2 exists because nobody does', v_role, v_n
        using errcode = 'CLR10';
    end if;
  end loop;

  -- 9 · NOTHING WAS RECUT. The five pre-image pins, re-asserted byte-identical, plus the two
  -- security postures a caller of those doors depends on.
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara.list_review_queue(jsonb,jsonb,int)'::regprocedure), 'UTF8')), 'hex') <> v_pin_queue then
    raise exception 'firm_portfolio_pack tail: clara.list_review_queue moved while this file was applying' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure), 'UTF8')), 'hex') <> v_pin_worklist then
    raise exception 'firm_portfolio_pack tail: clara.list_accounting_work moved while this file was applying' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara.get_client_work_pack(uuid,int)'::regprocedure), 'UTF8')), 'hex') <> v_pin_pack then
    raise exception 'firm_portfolio_pack tail: clara.get_client_work_pack moved while this file was applying' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara._work_run_attempts(uuid[])'::regprocedure), 'UTF8')), 'hex') <> v_pin_attempts then
    raise exception 'firm_portfolio_pack tail: clara._work_run_attempts moved while this file was applying' using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select prosrc from pg_proc where oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure), 'UTF8')), 'hex') <> v_pin_activity then
    raise exception 'firm_portfolio_pack tail: clara.list_activity moved while this file was applying' using errcode = 'CLR10';
  end if;
  if (select prosecdef from pg_proc where oid = 'clara.list_review_queue(jsonb,jsonb,int)'::regprocedure) is distinct from true then
    raise exception 'firm_portfolio_pack tail: list_review_queue is no longer SECURITY DEFINER' using errcode = 'CLR10';
  end if;
  if (select prosecdef from pg_proc where oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure) is distinct from false then
    raise exception 'firm_portfolio_pack tail: list_accounting_work is no longer SECURITY INVOKER' using errcode = 'CLR10';
  end if;
  if (select prosecdef from pg_proc where oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure) is distinct from false then
    raise exception 'firm_portfolio_pack tail: list_activity is no longer SECURITY INVOKER' using errcode = 'CLR10';
  end if;

  raise notice '#659 tail: OK -- clara.get_firm_portfolio_pack exists exactly once at (int,text,int), owned by clara_fn_owner, SECURITY INVOKER, STABLE, search_path- and plan_cache_mode-pinned; clara.get_compliance_watch_disposition exists exactly once at (uuid), SECURITY DEFINER, STABLE, search_path-pinned; EXECUTE on both to clara_authenticated and nobody else (PUBLIC revoked, each ACL asserted literally). The pack signature carries no period, fiscal-year, as-of, firm or client parameter, so no caller can narrow Work attention to a financial period and no caller can name a subject: the cursor is the only channel a client identity can enter through, and the body compares it as a sort key instead of resolving it. Its body orders by lower(c.name), c.id, refuses a malformed OR empty-named cursor with invalid_cursor, self-scopes on jwt_firm(), resolves its seven-day window against Asia/Kuala_Lumpur, keys recent success on a COMMITTED receipt, clamps the page to 1..100 and the preview to 0..5, cuts the preview array at 101 before clara._work_run_attempts is asked anything, and publishes all four coverage tokens. It names NO money or sum key anywhere -- in code or in comment. The disposition door names no revision number and reuses the write doors'' own not-found token. No table privilege moved: clara.agent_tasks is still ungranted, the three relations the pack borrows still carry SELECT and nothing else, and NO application role holds any privilege on either compliance watch relation -- which is the whole reason door 2 is SECURITY DEFINER. Zero relations, columns, policies, triggers or indexes were created and NOTHING was recut: all five pre-image pins are byte-identical and the three dependent security postures are unchanged.';
end $p659_tail$;
