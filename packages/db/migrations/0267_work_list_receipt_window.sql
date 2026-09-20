-- 0267_work_list_receipt_window — #905: THE WORK LIST GAINS A RECEIPT-DATED WINDOW, SO THE CLIENT
-- HOME'S RECENT-SUCCESS DRILLDOWN CAN OPEN THE SAME POPULATION IT COUNTS.
-- =====================================================================================
-- Spec of record: issue #905's 2026-09-17 Agent Brief (no owner ruling comment dated 2026-09-20
-- exists on this ticket). Domain words: CONTEXT.md — "Work attention facet", "Work pack". The
-- finding this ticket closes is #650's own round-1 review (finding 650-B1), pinned as
-- `packages/db/tests/client-work-pack.test.mjs` `p650.pack.recent_success_drilldown`.
--
-- WHAT THIS FILE CHANGES, IN ONE SENTENCE. `clara.list_accounting_work` (0189, recut #809/0203,
-- recut #880/0266) gains TWO more parameters, `p_receipt_since`/`p_receipt_until`, that fence a
-- Work by its OWN committed receipt (`clara.operation_receipts`, outcome='committed') instead of
-- its admission instant — so the client home's recent-success tile, which has always COUNTED by
-- receipt (0214), can finally LINK by receipt too, and the two numbers describe one population.
--
-- =====================================================================================
-- WHY A DROP AND A CREATE, NOT A `create or replace` — THE 0202/#770 PRECEDENT, NAMED BY THE
-- AGENT BRIEF ITSELF ("follow the precedent the activity list set when it gained p_work").
--
-- `create or replace function` cannot ADD a parameter: PostgreSQL identifies a function by
-- (schema, name, ARGUMENT TYPES), and a longer type list is a DIFFERENT overload, left resolvable
-- BESIDE the nine-argument body rather than replacing it (0202's own header, verbatim reasoning).
-- An overload that still resolves is an overload a later caller can reach, and PostgREST would be
-- left two candidates for one name — so the nine-argument signature is DROPPED and the
-- eleven-argument one is (re-)created, in the SAME transaction the runner already gives this file.
--
-- Nothing in the estate depends on the dropped signature (no view, no default, no index
-- expression, no trigger); §0's dependency check measures that emptiness rather than assuming it,
-- the same belt 0202 records (measured on this rig: zero non-internal pg_depend rows).
--
-- AND A DROP TAKES FIVE THINGS WITH IT THAT A REPLACE WOULD HAVE KEPT: owner, SECURITY INVOKER,
-- BOTH pinned settings, the literal ACL, and the comment. All five are RE-ISSUED below, in the
-- SAME statements 0202 uses for the SAME reason, and §T re-reads every one from the catalog rather
-- than assuming a statement above did what it says.
--
-- WRITTEN SO A REDO (#957) OVER ITS OWN OLD EFFECTS IS SAFE — packages/db/README.md's own
-- instruction for a redo target. §W below is `drop function if exists <nine-arg>` (a no-op once
-- this file has already run once) followed by `create or replace function <eleven-arg>` (already
-- idempotent), so re-running this exact file after a fix-round edit, under
-- `CLARA_MIGRATION_REDO=0267_work_list_receipt_window`, converges on the same committed state
-- whether the nine-argument door or this file's own eleven-argument one is what is currently
-- live. §0's prestate below is written to recognise BOTH starting shapes — see its own header.
--
-- =====================================================================================
-- WHY THE PARAMETER PAIR, NOT A SIBLING DOOR — THE AGENT BRIEF NAMED BOTH, AND THE PAIR COSTS
-- LESS. A sibling door would have had to restate the whole nine-argument contract (every filter,
-- the keyset, the cursor, the projection) to add two more predicates beside it — a second,
-- drifting reader of `clara.accounting_work`, the exact shape #809/0203's own header retired when
-- it added `intent_key` to THIS door instead of standing up a second one. Two more parameters on
-- the one existing door cost nothing a caller who omits them would notice (AC3's own "supplying
-- neither returns today's result"), and they compose with every other axis for free because they
-- land in the SAME `where` the other eight already share.
--
-- THE RECEIPT JOIN, AND WHY IT CANNOT DUPLICATE A ROW. `clara.operation_receipts` carries
-- `uq_operation_receipts_committed` (0178:448, a unique index on `(firm_id, logical_op_id)` WHERE
-- outcome='committed'), and 0214's own header already leans on the fact that a Work carries
-- exactly one logical identity, so it can hold at most one committed receipt — but 0214 itself
-- calls that a "belt", not a hard `work_id`-grained constraint, and this file does not lean on it
-- alone either. The join below is a LATERAL with `limit 1`, the SAME "at most one" idiom the
-- pending-question join a few lines below it already uses (0189's own comment: "a second pending
-- row — which no verb produces — could never duplicate a list row") — so even a violation of the
-- logical-identity invariant could never turn one Work into two list rows.
--
-- A WORK WITH NO COMMITTED RECEIPT IS EXCLUDED, NEVER DATED BY SOMETHING ELSE — the Agent Brief's
-- own second line. `rc.committed_at` is NULL for such a Work, and NULL compared against either
-- receipt bound is NULL, which is neither TRUE nor FALSE and therefore excludes the row from
-- `where` — the same "a NULL is not a match" honesty this door's own `p_purpose` predicate states
-- elsewhere. Supplying NEITHER `p_receipt_since` NOR `p_receipt_until` leaves both new predicate
-- arms `true` regardless of `rc.committed_at`, so an omitted pair changes nothing about who is on
-- the page (AC3). And the two bounds — admission-dated (`p_since`/`p_until`) and receipt-dated
-- (`p_receipt_since`/`p_receipt_until`) — compose with a plain `and`, because that is what "both
-- bounds combine" (AC3) already means once they are two more clauses in the SAME `where`.
--
-- NO PROJECTED FIELD IS ADDED. This is a FILTER widen, not a projection widen: the SELECT list in
-- pass 2 is untouched, character for character, from the live 0266 text — §T's own byte-identity
-- check on it is the proof. `clara.get_accounting_work_row` is therefore UNTOUCHED, exactly as
-- 0202 left `clara.get_activity_event` untouched when `clara.list_activity` gained `p_work`: an
-- addressed row is looked up BY ID, never by a window, so it has no bound to accept, and "the two
-- Work projections still match" (AC6) stays true because NEITHER projection moved — §T re-reads
-- `clara.get_accounting_work_row`'s body byte-for-byte against its own pinned pre-image to prove
-- it, the same way 0202's own tail step 6 proves `clara.get_activity_event` survived untouched.
--
-- WHAT DOES NOT CHANGE: the nine existing arguments and their order, the closed status roster, the
-- keyset contract and its cursor, the two-pass shape, the inline bookkeeper floor, the #809
-- intent_key widen, the #880 claim_id/claimant_label widen, the SECURITY INVOKER posture, the
-- grants and the RLS this door already leans on.
--
-- ROLLBACK is a NEW append-only migration. An applied migration is never edited or deleted
-- (packages/db/README.md).
--
-- =====================================================================================
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME: THE SAME AS 0189/0203/0266 — a
-- new filter predicate adds none. `p_receipt_since`/`p_receipt_until` are shape-checked by
-- PostgreSQL itself (timestamptz parameters) before the body runs, and an unmatched window simply
-- narrows the page to nothing, which is not an error and not an existence signal — the same
-- no-oracle posture every other filter axis on this door already takes.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, measured before it edits.
--
-- TWO STARTING SHAPES ARE BOTH VALID, for redo-safety (see header): the ordinary nine-argument
-- door (first apply), or this file's OWN eleven-argument door already carrying its
-- `p_receipt_since` marker (a redo of this exact file, #957). Anything else — both signatures
-- resolving at once, or neither, or an eleven-argument body that is not recognisably this file's
-- own — is refused rather than guessed at.
-- =====================================================================================
do $w905_pre$
declare
  n text; v_src text; v_n int; v_missing text; v_posture text;
  v_old boolean; v_new boolean;
begin
  -- 0.1 · the prerequisites the widened body calls, in exact regprocedure form.
  foreach n in array array[
    'clara.get_accounting_work_row(uuid)',
    'clara._work_run_attempts(uuid[])',
    'clara.jwt_sub()', 'clara.jwt_firm()', 'clara.actor_role_rank()', 'clara.role_rank(text)'
  ] loop
    if to_regprocedure(n) is null then
      raise exception '#905 prestate: prerequisite absent: % (migrations 0189/0203/0266 have not all been applied)', n
        using errcode='CLR10';
    end if;
  end loop;

  -- 0.2 · the relation this file joins, and the index it leans on for "at most one committed
  -- receipt per Work" (a belt, per 0214's own header — never assumed alone; see §W's LATERAL).
  if to_regclass('clara.operation_receipts') is null then
    raise exception '#905 prestate: clara.operation_receipts is absent (migration 0178 has not been applied)'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.uq_operation_receipts_committed') is null then
    raise exception '#905 prestate: clara.uq_operation_receipts_committed is absent -- the belt this file''s header cites is missing'
      using errcode='CLR10';
  end if;
  if to_regclass('clara.ix_operation_receipts_work') is null then
    raise exception '#905 prestate: clara.ix_operation_receipts_work is absent -- the join below would have no ordered path to a Work''s receipt'
      using errcode='CLR10';
  end if;

  -- 0.3 · WHICH OF THE TWO VALID STARTING SHAPES IS LIVE.
  v_old := to_regprocedure(
    'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'
  ) is not null;
  v_new := to_regprocedure(
    'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)'
  ) is not null;

  if v_old and v_new then
    raise exception '#905 prestate: BOTH the nine-argument and the eleven-argument clara.list_accounting_work resolve -- a broken partial state; refusing rather than guessing which is the live door'
      using errcode='CLR10';
  end if;
  if not v_old and not v_new then
    raise exception '#905 prestate: neither clara.list_accounting_work signature resolves (migration 0189 has not been applied)'
      using errcode='CLR10';
  end if;

  if v_old then
    -- ---------------------------------------------------------------------------------------
    -- FIRST APPLY. Pin the live (0266) body byte-for-byte, exactly as 0202 pins 0184's before
    -- recutting it — measured on THIS rig now, never transcribed from 0266's own file, per house
    -- rule: a ticket before this one in the chain may have recut a body this file touches.
    -- ---------------------------------------------------------------------------------------
    select count(*)::int into v_n from pg_proc p
     where p.pronamespace='clara'::regnamespace and p.proname='list_accounting_work';
    if v_n <> 1 then
      raise exception '#905 prestate: clara.list_accounting_work has % bodies (expected exactly 1) -- an overload is already installed', v_n
        using errcode='CLR10';
    end if;

    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
     where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
    if v_src is distinct from '0af8a8bb004cbbd5233e63339090f25f4c5736affb3e7f3244303b07ce48f20a' then
      raise exception '#905 prestate: clara.list_accounting_work has DRIFTED from the pinned 0266 body (sha %) -- re-derive section W against the live body before applying', v_src
        using errcode='CLR10';
    end if;

    -- …NOTHING DEPENDS ON THE SIGNATURE ABOUT TO BE DROPPED. `drop function` without CASCADE
    -- refuses on a dependency, so this is belt-and-braces — but it is measured here so the
    -- refusal, if it ever comes, arrives as this file's own sentence rather than a raw 2BP01. Only
    -- meaningful (and only safe to evaluate — the regprocedure cast itself requires the signature
    -- to resolve) while the nine-argument door is the one about to be dropped.
    select count(*)::int into v_n from pg_depend d
     where d.refobjid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure
       and d.refclassid = 'pg_proc'::regclass
       and d.deptype <> 'i'
       and d.classid <> 'pg_namespace'::regclass
       and not (d.classid = 'pg_proc'::regclass and d.objid = d.refobjid);
    if v_n > 0 then
      raise exception '#905 prestate: % catalog object(s) depend on clara.list_accounting_work''s nine-argument signature -- the drop below would refuse', v_n
        using errcode='CLR10';
    end if;

    -- …the arms this file carries over unchanged, named one by one against the live text, so a
    -- reader of a later failure knows WHICH property the sha was standing for.
    select p.prosrc into v_src from pg_proc p
     where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
    v_missing := '';
    if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
    if position('least(greatest(coalesce(p_limit, 25), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
    if position('array_length(p_status, 1) is null' in v_src) = 0 then v_missing := v_missing || ' empty-array-is-no-filter'; end if;
    if position('invalid_status' in v_src) = 0 then v_missing := v_missing || ' status-roster'; end if;
    if position('invalid_purpose' in v_src) = 0 then v_missing := v_missing || ' purpose-null-refusal'; end if;
    if position('non-finite cursor timestamp' in v_src) = 0 then v_missing := v_missing || ' non-finite-cursor-refusal'; end if;
    if position('coalesce(w.initiated_by, w.initiator) = p_initiator' in v_src) = 0 then v_missing := v_missing || ' entered-by-filter'; end if;
    if position('clara._work_run_attempts(v_ids)' in v_src) = 0 then v_missing := v_missing || ' attempts-helper'; end if;
    if position('w.intent_key                              as intent_key' in v_src) = 0 then v_missing := v_missing || ' 809-intent-key-widen'; end if;
    if position('sec.id                                    as claim_id' in v_src) = 0 then v_missing := v_missing || ' 880-claim-id-widen'; end if;
    if position('sec.claimant_label                        as claimant_label' in v_src) = 0 then v_missing := v_missing || ' 880-claimant-label-widen'; end if;
    if v_missing <> '' then
      raise exception '#905 prestate: the live clara.list_accounting_work is missing arm(s):%', v_missing
        using errcode='CLR10';
    end if;

    -- …it does not already carry a receipt predicate (a re-run against a hand-patched database
    -- would otherwise silently double the widen).
    if position('p_receipt_since' in v_src) <> 0 or position('p_receipt_until' in v_src) <> 0 then
      raise exception '#905 prestate: the live nine-argument clara.list_accounting_work ALREADY mentions a receipt parameter -- this file has nothing to add and would silently re-write somebody else''s body'
        using errcode='CLR10';
    end if;

    -- …and the posture the drop is about to destroy, measured so §T's re-read is a COMPARISON and
    -- not a hopeful assertion.
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
           || coalesce(array_to_string(p.proacl, ','), '<null>')
      into v_posture from pg_proc p
     where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)'::regprocedure;
    if v_posture is distinct from
       'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
      raise exception '#905 prestate: clara.list_accounting_work does not carry the posture this file must re-issue after the drop; got {%}', v_posture
        using errcode='CLR10';
    end if;
  else
    -- ---------------------------------------------------------------------------------------
    -- REDO (#957) OF THIS FILE'S OWN EARLIER RUN. The eleven-argument door already resolves; it
    -- must be recognisably THIS file's own prior output before §W is allowed to `create or
    -- replace` over it, never a foreign eleven-argument body this file does not recognise.
    -- ---------------------------------------------------------------------------------------
    select p.prosrc into v_src from pg_proc p
     where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)'::regprocedure;
    if position('p_receipt_since' in v_src) = 0 or position('p_receipt_until' in v_src) = 0 then
      raise exception '#905 prestate: the live eleven-argument clara.list_accounting_work does not carry this file''s own p_receipt_since/p_receipt_until predicate -- it is not this file''s prior output, and this file refuses to overwrite a door it does not recognise'
        using errcode='CLR10';
    end if;
  end if;

  -- 0.4 · THE SIBLING DOOR THIS FILE DOES NOT TOUCH, pinned so §T's byte-identity check is a
  -- comparison against a measured pre-image rather than an assumption.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_src is distinct from '9979520fe0202141686d960c8dfa4ae8efd3ffb31f14aae787074218fbce0781' then
    raise exception '#905 prestate: clara.get_accounting_work_row has DRIFTED from its pinned 0266 body (sha %) -- this file must not touch it, so a drift here means the pin is stale, not that this file should chase it', v_src
      using errcode='CLR10';
  end if;

  raise notice '#905 prestate: clean -- clara.operation_receipts carries uq_operation_receipts_committed and ix_operation_receipts_work; exactly one starting shape of clara.list_accounting_work is live (%), matching what this file expects for it; and clara.get_accounting_work_row carries its pinned, untouched 0266 body.',
    case when v_old then 'nine-argument, pre-widen' else 'eleven-argument, this file''s own prior redo' end;
end
$w905_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §W THE WIDEN. The pinned live body, byte-for-byte, plus TWO new parameters, ONE new LATERAL
-- join and TWO new predicate arms in pass 1's own `where`. `drop function if exists` on the OLD
-- signature (a no-op on a redo, where it is already gone) followed by `create or replace` on the
-- NEW one (idempotent either way) is what makes this section safe to redo — see the header.
-- =====================================================================================
drop function if exists clara.list_accounting_work(
  uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int
);

create or replace function clara.list_accounting_work(
  p_client    uuid        default null,
  p_status    text[]      default null,
  p_initiator uuid        default null,
  p_purpose   text[]      default null,
  p_since     timestamptz default null,
  p_until     timestamptz default null,
  p_q         text        default null,
  p_cursor    text        default null,
  p_limit     int         default 25,
  -- #905: THE RECEIPT-DATED BOUND, LAST so every existing positional caller keeps its meaning and
  -- an omitted pair reproduces the nine-argument door exactly — same rows, same order, same
  -- cursors, for every other caller in the estate (AC3's "supplying neither returns today's
  -- result").
  p_receipt_since timestamptz default null,
  p_receipt_until timestamptz default null
) returns jsonb
  language plpgsql stable security invoker
  -- RE-ISSUED, NOT INHERITED. A DROP took both of these with it; a `create or replace` alone
  -- (had one been legal here) would have preserved them. See this file's header for the full list
  -- of five properties a drop destroys.
  set search_path = clara, pg_temp
  set plan_cache_mode = force_custom_plan as $$
declare
  c record;
  v_limit int;
  v_cursor_ts timestamptz := null;
  v_cursor_id uuid := null;
  v_decoded text;
  v_pipe int;
  v_status text;
  v_purpose text;
  v_status_f text[];
  v_purpose_f text[];
  v_q text;
  v_ids uuid[];
  v_all jsonb;
  v_total int;
  v_truncated boolean;
  v_page jsonb;
  v_last jsonb;
  v_next_cursor text;
begin
  -- The inline floor, for the same structural reason 0181:0174 state: an INVOKER body cannot call
  -- clara._human_ctx (an internal helper with no application-role EXECUTE grant), so this
  -- restates its three predicates against the helpers that ARE granted to clara_authenticated.
  select clara.jwt_sub() as actor, clara.jwt_firm() as firm into c;
  if c.actor is null then
    raise exception 'no authenticated actor' using errcode = 'CLR04';
  end if;
  if c.firm is null then
    raise exception 'actor has no active membership' using errcode = 'CLR04';
  end if;
  if coalesce(clara.actor_role_rank(), -1) < clara.role_rank('bookkeeper') then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);

  -- AN EMPTY ARRAY IS "NO FILTER ON THIS AXIS", not "match nothing". A URL that carries
  -- `?status=` with no value parses to an empty list on the web side, and a door that answered an
  -- empty PAGE for it would look exactly like "this firm has no Work" -- the one thing the Empty
  -- taxonomy must never confuse. `array_length(x, 1) is null` is the honest test: it is null for
  -- `{}` as well as for NULL.
  v_status_f := case when array_length(p_status, 1) is null then null else p_status end;
  v_purpose_f := case when array_length(p_purpose, 1) is null then null else p_purpose end;

  -- A NULL ELEMENT IS A CALLER DEFECT, NOT A FILTER (adversarial migration-safety review,
  -- 2026-09-14). `v_status not in (…)` evaluates to NULL for a NULL element, so a bare
  -- `if v_status not in (…)` fell through — and `= any(array[null])` then matches nothing, which
  -- answered `rows=0`: the exact "`[]` looks like *no such Work*" failure the roster check exists
  -- to refuse. `v_status is null or …` is the honest test. The same hazard reaches `p_purpose`,
  -- whose VOCABULARY this door deliberately does not own (0178's CHECK does) — so its elements are
  -- checked for being present at all, and for nothing else.
  if v_status_f is not null then
    foreach v_status in array v_status_f loop
      if v_status is null
         or v_status not in ('queued','running','awaiting_input','stopping','completed','refused',
                             'failed','cancelled','expired') then
        raise exception 'unknown work status %', coalesce(v_status, '<null>') using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'invalid_status', 'status', v_status)::text;
      end if;
    end loop;
  end if;

  if v_purpose_f is not null then
    foreach v_purpose in array v_purpose_f loop
      if v_purpose is null then
        raise exception 'a null purpose is not a filter' using errcode = 'CLR10',
          detail = jsonb_build_object('reason', 'invalid_purpose')::text;
      end if;
    end loop;
  end if;

  v_q := nullif(btrim(coalesce(p_q, '')), '');

  if p_cursor is not null and btrim(p_cursor) <> '' then
    begin
      v_decoded := convert_from(decode(p_cursor, 'base64'), 'UTF8');
      v_pipe := position('|' in v_decoded);
      if v_pipe < 2 or v_pipe = length(v_decoded) then
        raise exception 'malformed cursor shape';
      end if;
      v_cursor_ts := substr(v_decoded, 1, v_pipe - 1)::timestamptz;
      v_cursor_id := substr(v_decoded, v_pipe + 1)::uuid;
      -- A NON-FINITE FENCE IS NOT A PAGE. `timestamptz` accepts the literals `infinity` and
      -- `-infinity`, and `-infinity` compares below every real row — so a hand-edited `?cursor=`
      -- carrying it answered a clean, well-formed EMPTY page, which is indistinguishable from
      -- "there is no more Work". No `next_cursor` this door mints is ever non-finite (it is
      -- `created_at`, a real clock reading), so this is a malformed cursor like any other.
      if v_cursor_ts = '-infinity'::timestamptz or v_cursor_ts = 'infinity'::timestamptz then
        raise exception 'non-finite cursor timestamp';
      end if;
    exception when others then
      raise exception 'malformed work cursor' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'invalid_cursor')::text;
    end;
  end if;

  -- PASS 1 — the page's own ids, under the keyset fence. Taken first so the DEFINER helper in
  -- pass 2 is asked about at most v_limit+1 Works rather than about the firm.
  select array_agg(x.id order by x.created_at desc, x.id desc) into v_ids
    from (
      select w.id, w.created_at
        from clara.accounting_work w
        -- #905: THE COMMITTED RECEIPT, joined so a receipt-dated bound can fence w.id without a
        -- second round trip. AT MOST ONE ROW: uq_operation_receipts_committed (0178:448) admits at
        -- most one committed receipt per (firm_id, logical_op_id), and 0214's own header records
        -- that a Work carries exactly one logical identity -- but this file does not lean on that
        -- alone (0214 itself only calls it a "belt"): a LATERAL with `limit 1`, the SAME "at most
        -- one" idiom the pending-question join below already uses, so even a violation of that
        -- invariant could never duplicate a list row.
        left join lateral (
          select o.created_at as committed_at
            from clara.operation_receipts o
           where o.work_id = w.id and o.firm_id = w.firm_id and o.outcome = 'committed'
           order by o.created_at desc
           limit 1
        ) rc on true
       where (p_client is null or w.client_id = p_client)
         and (v_status_f is null or w.status = any(v_status_f))
         -- THE FILTER MATCHES THE COLUMN THE LIST ACTUALLY SHOWS (spec review, 2026-09-14). The
         -- "Entered by" column renders `initiated_by ?? initiator` — who ASKED, #630's frozen
         -- historical fact — while `initiator` is the MUTABLE current run authority a Take-over
         -- moves. Filtering the mutable one under the immutable one's label silently dropped the
         -- taken-over Work whose column still reads the person the caller picked, and admitted
         -- Work the new responsible never asked for. One expression, both places.
         and (p_initiator is null or coalesce(w.initiated_by, w.initiator) = p_initiator)
         and (v_purpose_f is null or w.purpose = any(v_purpose_f))
         and (p_since is null or w.created_at >= p_since)
         and (p_until is null or w.created_at < p_until)
         -- #905: THE RECEIPT-DATED BOUND. `rc.committed_at` is NULL for a Work with no committed
         -- receipt, and a NULL compared against a receipt bound is NULL -- neither true nor false
         -- -- so supplying EITHER argument excludes an undated completion rather than dating it by
         -- something else (the Agent Brief's own second line). Supplying NEITHER leaves both arms
         -- `true` regardless of `rc.committed_at`, so an omitted pair reproduces today's page
         -- exactly (AC3), and this pair composes with p_since/p_until above by plain `and` (AC3's
         -- "both bounds combine").
         and (p_receipt_since is null or rc.committed_at >= p_receipt_since)
         and (p_receipt_until is null or rc.committed_at < p_receipt_until)
         and (v_q is null or position(lower(v_q) in lower(coalesce(w.basis->>'memo', ''))) > 0)
         and (v_cursor_ts is null or (w.created_at, w.id) < (v_cursor_ts, v_cursor_id))
       order by w.created_at desc, w.id desc
       limit v_limit + 1
    ) x;

  if v_ids is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'next_cursor', null, 'truncated', false);
  end if;

  -- PASS 2 — the projection. `jsonb_agg(... order by ...)` INSIDE the aggregate call, never
  -- borrowed from the subquery's own order: an aggregate over a subquery may see its input in
  -- whatever order the planner chooses, and the page and its next_cursor must never be minted
  -- from an order the aggregate itself did not pin (0181's own measured note). UNCHANGED from
  -- 0266, character for character -- #905 is a FILTER widen, and pass 2's own row shape is not
  -- one of the things a filter can touch.
  select coalesce(jsonb_agg(to_jsonb(r.*) order by r.created_at desc, r.id desc), '[]'::jsonb)
    into v_all
    from (
      select
        w.id                                      as id,
        w.client_id                               as client_id,
        cl.name                                   as client_name,
        w.purpose                                 as purpose,
        w.status                                  as status,
        w.initiator                               as initiator,
        w.initiated_by                            as initiated_by,
        w.initiator_role                          as initiator_role,
        w.basis_origin                            as basis_origin,
        -- #809: THE ONE ADDED FIELD. Taken straight from the column, which is NOT NULL on
        -- clara.accounting_work (0178), so the row type carries it as a non-nullable string. It
        -- exists because the plan authority picker labels a candidate by its basis memo and falls
        -- back to the intent key when there is none -- and that picker was, until this file, the
        -- SECOND list reader of clara.accounting_work, written direct against the table precisely
        -- because this projection omitted this field. No `basis` object joins it: 0189's "a list
        -- of operations is not a ledger" stands, and the memo already arrives flat below.
        w.intent_key                              as intent_key,
        -- #880: THE CLAIM LABEL, when this Work IS one. `clara.staff_expense_claims` carries a
        -- UNIQUE work_id (0221's own constraint), so this LEFT JOIN adds at most one row and can
        -- never duplicate a list row. Both fields are NULL for a plain journal_entry Work, a
        -- periodic_stock_adjustment or a payroll_obligation -- the honest absence, never a
        -- fabricated origin. The settlement, the amounts and the item counts stay off this list
        -- (0189's "a list of operations is not a ledger" stands); a surface that needs them reads
        -- the UNCHANGED clara.get_work_claim_origin, exactly as the Work detail already does.
        sec.id                                    as claim_id,
        sec.claimant_label                        as claimant_label,
        w.basis->>'memo'                          as memo,
        w.basis->>'posting_date'                  as posting_date,
        w.basis->>'currency'                      as currency,
        coalesce(jsonb_array_length(w.source_refs), 0) as source_ref_count,
        w.current_task_id                         as current_task_id,
        nullif(w.result->>'entry_id', '')         as entry_id,
        nullif(w.result->>'receipt_id', '')       as receipt_id,
        nullif(w.error->>'code', '')              as error_code,
        nullif(w.error->>'reason', '')            as error_reason,
        coalesce(a.attempts, 0)                   as attempts,
        a.current_run_status                      as current_run_status,
        q.id                                      as pending_question_id,
        q.question_version                        as pending_question_version,
        w.created_at                              as created_at,
        w.updated_at                              as updated_at
      from clara.accounting_work w
      left join clara.clients cl on cl.id = w.client_id and cl.firm_id = w.firm_id
      -- #880: at most one row (uq_staff_expense_claims_work), so this join cannot duplicate a
      -- list row. sec.firm_id = w.firm_id is belt-and-braces over the FK that already enforces it.
      left join clara.staff_expense_claims sec on sec.work_id = w.id and sec.firm_id = w.firm_id
      left join clara._work_run_attempts(v_ids) a on a.work_id = w.id
      -- AT MOST ONE PENDING QUESTION PER WORK (0180's own ix_agent_interruptions_work_pending and
      -- its one-pending-row invariant). A lateral with `limit 1` rather than a bare join, so a
      -- second pending row — which no verb produces — could never duplicate a list row.
      left join lateral (
        select i.id, i.question_version
          from clara.agent_interruptions i
         where i.work_id = w.id and i.status = 'pending'
         order by i.question_version desc
         limit 1
      ) q on true
     where w.id = any(v_ids)
    ) r;

  v_total := jsonb_array_length(v_all);
  v_truncated := v_total > v_limit;

  if v_truncated then
    select jsonb_agg(t.elem order by t.ord) into v_page
      from (
        select elem, ord from jsonb_array_elements(v_all) with ordinality as e(elem, ord)
         where ord <= v_limit
      ) t;
    v_last := v_page -> (v_limit - 1);
    v_next_cursor := encode(
      convert_to((v_last->>'created_at') || '|' || (v_last->>'id'), 'UTF8'), 'base64');
  else
    v_page := v_all;
    v_next_cursor := null;
  end if;

  return jsonb_build_object('rows', v_page, 'next_cursor', v_next_cursor, 'truncated', v_truncated);
end $$;

-- THE THREE PROPERTIES A DROP DESTROYS, RE-ISSUED BY HAND (all three are ordinary idempotent
-- statements, so re-running them on redo is harmless).
revoke all on function clara.list_accounting_work(
  uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int, timestamptz, timestamptz
) from public;
grant execute on function clara.list_accounting_work(
  uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int, timestamptz, timestamptz
) to clara_authenticated;

comment on function clara.list_accounting_work(
  uuid, text[], uuid, text[], timestamptz, timestamptz, text, text, int, timestamptz, timestamptz
) is
  '#641 B3, widened #809, widened #880, widened #905. The Work list behind /work (firm-wide) and '
  '/clients/:id/work, and — since #809 — the plan authority picker''s ONE reader of '
  'clara.accounting_work: keyset-paged over (created_at desc, id desc), filterable by '
  'client/status/initiator/purpose/[since,until)/free text, newest first. SECURITY INVOKER over '
  'clara.accounting_work, clara.agent_interruptions, clara.clients, clara.staff_expense_claims '
  '(since #880) and — since #905 — clara.operation_receipts (all five already '
  'clara_authenticated-granted with firm-scoped RLS); refuses CLR04 below bookkeeper before '
  'reading. p_status is the closed nine-member roster, refused CLR10 invalid_status otherwise (a '
  'NULL element included); p_purpose''s VOCABULARY is NOT validated (0178''s CHECK owns it) so an '
  'unknown purpose matches nothing, but a NULL element is refused CLR10 invalid_purpose. '
  'p_initiator filters coalesce(initiated_by, initiator) -- WHO ASKED, the expression the '
  'Entered-by column renders -- not the mutable run authority a Take-over moves. p_q matches the '
  'basis memo by case-insensitive CONTAINMENT, never as a LIKE pattern. p_limit clamps 1..100. '
  'p_cursor is an opaque base64 pair minted by a previous page''s next_cursor; a malformed one '
  'refuses CLR10 invalid_cursor. Every row carries attempts + the pending question id/version so '
  'a caller''s status LABEL is derived from canonical state; no money is projected. #809 added '
  'intent_key; #880 added claim_id/claimant_label, LEFT JOINED from clara.staff_expense_claims by '
  'its UNIQUE work_id. #905 adds TWO more PARAMETERS (not projected fields), p_receipt_since and '
  'p_receipt_until: they fence a Work by its OWN committed clara.operation_receipts row (a LATERAL '
  'limit-1 join, belt-and-braces over uq_operation_receipts_committed) rather than by admission -- '
  'a Work with no committed receipt satisfies neither bound and is excluded, never dated by '
  'something else; the pair composes with p_since/p_until by a plain AND; supplying neither '
  'reproduces the nine-argument door exactly. THE NINE-ARGUMENT SIGNATURE IS GONE: a new '
  'parameter cannot be added by `create or replace`, and an overload that still resolved would '
  'leave PostgREST two candidates for one name. PINS plan_cache_mode = force_custom_plan for the '
  'same session-pooling reason 0189/0203 record. See this migration''s header and 0189''s/0203''s '
  'for the full rationale. clara.get_accounting_work_row is UNCHANGED by this file.';

reset role;

-- =====================================================================================
-- §T TAIL CENSUS. Re-read the COMMITTED catalog and say what it found. This file's whole hazard
-- is a property silently lost in a DROP, so every one of the five is read back from the catalog
-- rather than assumed from the statements above — and this check is path-independent: whichever
-- of §0's two starting shapes was live, the committed state after §W must look identical.
-- =====================================================================================
do $w905_tail$
declare v_src text; v_src2 text; v_n int; v_posture text; v_cmt text; v_missing text;
begin
  -- 1 · EXACTLY ONE BODY OF THIS NAME, and it is the eleven-argument one. The nine-argument
  -- signature must not survive as a resolvable overload.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace and p.proname='list_accounting_work';
  if v_n <> 1 then
    raise exception '#905 tail: clara.list_accounting_work now has % bodies (expected exactly 1) -- the recut created an overload instead of retiring the old signature', v_n
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)') is not null then
    raise exception '#905 tail: the NINE-argument clara.list_accounting_work still resolves -- an overload that still resolves is an overload a later caller can reach, and PostgREST would have two candidates'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)') is null then
    raise exception '#905 tail: the eleven-argument clara.list_accounting_work does not resolve' using errcode='CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)'::regprocedure;

  -- 2 · THE NEW JOIN AND ITS TWO PREDICATES, and EXACTLY that many mentions.
  if position('left join lateral (' in v_src) = 0
     or position('where o.work_id = w.id and o.firm_id = w.firm_id and o.outcome = ''committed''' in v_src) = 0 then
    raise exception '#905 tail: the committed body does not join clara.operation_receipts the way this file specifies' using errcode='CLR10';
  end if;
  if position('and (p_receipt_since is null or rc.committed_at >= p_receipt_since)' in v_src) = 0 then
    raise exception '#905 tail: the committed body is missing the p_receipt_since predicate' using errcode='CLR10';
  end if;
  if position('and (p_receipt_until is null or rc.committed_at < p_receipt_until)' in v_src) = 0 then
    raise exception '#905 tail: the committed body is missing the p_receipt_until predicate' using errcode='CLR10';
  end if;
  -- `prosrc` holds only the `declare…begin…end` body, never the parameter list, so a parameter
  -- used in exactly ONE predicate line of the shape `(p_name is null or … p_name)` mentions itself
  -- exactly twice there and nowhere else in the committed text.
  v_n := (length(v_src) - length(replace(v_src, 'p_receipt_since', ''))) / length('p_receipt_since');
  if v_n <> 2 then
    raise exception '#905 tail: the committed body mentions p_receipt_since % time(s) (expected exactly 2 -- both mentions on its own predicate line, and nowhere else)', v_n
      using errcode='CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'p_receipt_until', ''))) / length('p_receipt_until');
  if v_n <> 2 then
    raise exception '#905 tail: the committed body mentions p_receipt_until % time(s) (expected exactly 2 -- both mentions on its own predicate line, and nowhere else)', v_n
      using errcode='CLR10';
  end if;

  -- 3 · THE PASS-2 PROJECTION IS UNTOUCHED FROM 0266's -- this is a filter widen, not a
  -- projection widen. The first and last projected fields are the bookends of that SELECT list
  -- (0266's own §T checks the same way for its own two added fields), so both resolving to
  -- exactly one occurrence each is the proof no field was added, removed or renamed.
  if position('w.id                                      as id,' in v_src) = 0 then
    raise exception '#905 tail: the pass-2 projection''s first field (w.id as id) is missing -- this file must not have touched the SELECT list' using errcode='CLR10';
  end if;
  if position('w.updated_at                              as updated_at' in v_src) = 0 then
    raise exception '#905 tail: the pass-2 projection''s last field (w.updated_at as updated_at) is missing -- this file must not have touched the SELECT list' using errcode='CLR10';
  end if;
  if position('w.basis                                   as basis' in v_src) <> 0
     or position('to_jsonb(w.basis)' in v_src) <> 0 then
    raise exception '#905 tail: the committed body projects the basis OBJECT -- a list of operations is not a ledger' using errcode='CLR10';
  end if;

  -- 4 · THE THREE CLAUSES A REPLACE RESTATES, plus the two it preserves, in one comparison.
  select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
         || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
         || coalesce(array_to_string(p.proacl, ','), '<null>')
    into v_posture from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)'::regprocedure;
  if v_posture is distinct from
     'clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
    raise exception '#905 tail: the widened door has the wrong posture -- expected owner clara_fn_owner, SECURITY INVOKER, search_path=clara, pg_temp + plan_cache_mode=force_custom_plan, and EXECUTE to clara_authenticated only (PUBLIC revoked); got {%}', v_posture
      using errcode='CLR10';
  end if;

  -- 5 · the comment, re-issued to name the new parameters.
  select obj_description(p.oid, 'pg_proc') into v_cmt from pg_proc p
   where p.oid = 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)'::regprocedure;
  if v_cmt is null or position('#905' in v_cmt) = 0 or position('p_receipt_since' in v_cmt) = 0 then
    raise exception '#905 tail: the widened door carries no comment naming p_receipt_since -- a DROP takes the comment with it and this file must re-issue one'
      using errcode='CLR10';
  end if;

  -- 6 · EVERY OTHER ARM SURVIVED, arm by arm, against the committed text.
  v_missing := '';
  if position('role_rank(''bookkeeper'')' in v_src) = 0 then v_missing := v_missing || ' bookkeeper-floor'; end if;
  if position('least(greatest(coalesce(p_limit, 25), 1), 100)' in v_src) = 0 then v_missing := v_missing || ' limit-clamp'; end if;
  if position('array_length(p_status, 1) is null' in v_src) = 0 then v_missing := v_missing || ' empty-array-is-no-filter'; end if;
  if position('invalid_status' in v_src) = 0 then v_missing := v_missing || ' status-roster'; end if;
  if position('invalid_purpose' in v_src) = 0 then v_missing := v_missing || ' purpose-null-refusal'; end if;
  if position('invalid_cursor' in v_src) = 0 then v_missing := v_missing || ' cursor-refusal'; end if;
  if position('non-finite cursor timestamp' in v_src) = 0 then v_missing := v_missing || ' non-finite-cursor-refusal'; end if;
  if position('coalesce(w.initiated_by, w.initiator) = p_initiator' in v_src) = 0 then v_missing := v_missing || ' entered-by-filter'; end if;
  if position('clara._work_run_attempts(v_ids)' in v_src) = 0 then v_missing := v_missing || ' attempts-helper'; end if;
  if position('order by w.created_at desc, w.id desc' in v_src) = 0 then v_missing := v_missing || ' keyset-order'; end if;
  if position('''rows'', v_page, ''next_cursor'', v_next_cursor, ''truncated'', v_truncated' in v_src) = 0 then v_missing := v_missing || ' page-envelope'; end if;
  if position('w.intent_key                              as intent_key' in v_src) = 0 then v_missing := v_missing || ' 809-intent-key-widen'; end if;
  if position('sec.id                                    as claim_id' in v_src) = 0 then v_missing := v_missing || ' 880-claim-id-widen'; end if;
  if position('sec.claimant_label                        as claimant_label' in v_src) = 0 then v_missing := v_missing || ' 880-claimant-label-widen'; end if;
  if v_missing <> '' then
    raise exception '#905 tail: the widen LOST arm(s):% -- only p_receipt_since/p_receipt_until and their join may have arrived', v_missing
      using errcode='CLR10';
  end if;

  if pg_catalog.has_function_privilege('public', 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)', 'execute') then
    raise exception '#905 tail: PUBLIC regained EXECUTE on the widened door' using errcode='CLR10';
  end if;
  if not pg_catalog.has_function_privilege('clara_authenticated', 'clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)', 'execute') then
    raise exception '#905 tail: clara_authenticated lost EXECUTE on the widened door' using errcode='CLR10';
  end if;

  -- 7 · THE SIBLING DOOR IS UNTOUCHED — byte-identical to its pinned pre-image, own signature,
  -- own ACL. "The two Work projections still match" (AC6) because NEITHER moved.
  if to_regprocedure('clara.get_accounting_work_row(uuid)') is null then
    raise exception '#905 tail: clara.get_accounting_work_row no longer resolves -- this file must not have touched it' using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_src2 from pg_proc p
   where p.oid = 'clara.get_accounting_work_row(uuid)'::regprocedure;
  if v_src2 is distinct from '9979520fe0202141686d960c8dfa4ae8efd3ffb31f14aae787074218fbce0781' then
    raise exception '#905 tail: clara.get_accounting_work_row''s body moved (sha %) -- this file must not touch it', v_src2
      using errcode='CLR10';
  end if;
  if pg_catalog.has_function_privilege('public', 'clara.get_accounting_work_row(uuid)', 'execute')
     or not pg_catalog.has_function_privilege('clara_authenticated', 'clara.get_accounting_work_row(uuid)', 'execute') then
    raise exception '#905 tail: clara.get_accounting_work_row lost its PUBLIC-revoked / clara_authenticated-only posture' using errcode='CLR10';
  end if;

  raise notice '#905 tail: OK -- clara.list_accounting_work exists EXACTLY ONCE, at (uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz); the nine-argument signature is GONE rather than left as a resolvable overload; the widened door LATERAL-joins clara.operation_receipts (limit 1, firm-correlated, outcome=committed) and tests p_receipt_since/p_receipt_until against it exactly once each beyond their own declarations; the pass-2 projection is byte-identical to 0266''s (a filter widen, not a projection widen); the door is owned by clara_fn_owner, SECURITY INVOKER, pins search_path=clara, pg_temp AND plan_cache_mode=force_custom_plan, is PUBLIC-revoked and EXECUTE-reachable by clara_authenticated and nobody else, and carries a re-issued comment naming the new parameters; every 0189/0203/0880 arm survives -- the inline bookkeeper floor, the 1..100 clamp, empty-array-is-no-filter, the closed status roster and the NULL-purpose refusal, both cursor refusals including the non-finite one, the coalesce(initiated_by, initiator) Entered-by filter, the clara._work_run_attempts page-bounded helper, the (created_at desc, id desc) keyset order, the {rows, next_cursor, truncated} envelope, and the #809/#880 intent_key/claim_id/claimant_label projections; and clara.get_accounting_work_row is untouched, byte-identical to its pinned pre-image with its own ACL intact -- AC6''s "the two Work projections still match" holds because neither one moved.';
end
$w905_tail$;
