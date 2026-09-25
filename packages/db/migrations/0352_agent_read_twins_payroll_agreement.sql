-- 0352_agent_read_twins_payroll_agreement — #1136 (riders sweep wave, lane L8): THE MODEL LANE'S
-- ENTRANCE TO THE PAYROLL AND AGREEMENT READS, opened the house way and without a second
-- definition of a single row.
-- =====================================================================================
-- Spec of record: issue #1136's body (Agent Brief, the newest and only one — the issue carries no
-- comments), plus the sweep wave's plan of record
-- `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` (lane L8) and
-- `docs/plan/active/riders-2026-09-20/CUT-PLAN.md` §1.4, which DEFERRED three chat tools for
-- exactly the reason this file removes.
--
-- WHAT THIS FILE DOES, IN ONE SENTENCE. Two human reads — `clara.get_payroll_settlement_candidates`
-- (0298, #947) and `clara.list_review_queue` (0011 and eight later splices, most recently 0299's
-- `agreement_posting_blocked` arm and 0297's `payroll_posting_blocked` arm) — each have their
-- computation moved, byte for byte, into ONE ungranted core that takes the caller's FIRM as an
-- argument; each human door becomes that core's own thin audited wrapper, keeping its signature,
-- its envelope, its refusal codes and its ACL; and TWO new audited wrappers —
-- `clara.wake_get_payroll_settlement_candidates` and `clara.wake_list_review_queue`, EXECUTE to
-- `clara_agent_ro` and one `clara.wake_fn_allowlist` row each — are the chat lane's doors onto the
-- same bodies.
--
-- =====================================================================================
-- WHY THIS FILE EXISTS AT ALL. Three successor contracts written by riders wave 4 name doors the
-- chat lane cannot reach:
--
--   · `read_payroll_posting_state` (#946, `reports/wave4-lane01-ticket946.md`) reads
--     `clara.list_review_queue` for the `payroll_posting_blocked` row and reports its
--     `question_text` — the database's own sentence for why a payroll run did not post.
--   · `read_payroll_settlement_state` (#947, `reports/wave4-lane01-ticket947.md`) reads
--     `clara.get_payroll_settlement_candidates` for the runs whose net pay has not left the bank.
--   · `read_agreement_terms` (#948, `reports/wave4-lane01-ticket948.md`) reads the banked terms
--     through `clara.get_document_extract` — which the agent role ALREADY holds — and the POSTING
--     verdict through `clara.list_review_queue`'s `agreement_posting_blocked` row.
--     `clara._agreement_posting_verdict(uuid)` itself is granted to NOBODY (0299:2597) and must
--     not be called from a tool; this file keeps it that way and the tail proves it.
--
-- A chat tool runs on a pooled credential that carries NO `request.jwt.claims` at all
-- (`packages/runtime/lib/pools.mjs`: the read pool logs in as `clara_agent_read_login` and SET
-- ROLEs to `clara_agent_ro`), so a `clara_authenticated`-only door answers a grant refusal on
-- every call. CUT-PLAN.md §1.4 therefore DEFERRED all three rather than ship tools that can only
-- refuse — "a tool that could only return a grant refusal, and that is not a capability"
-- (`reports/wave4-lane04-ticket939.md`). #1136 is the ticket that opens the doors.
--
-- =====================================================================================
-- WHY A SPLIT AND NOT A GRANT, A TWIN OR AN IMPERSONATION. The estate settled this question four
-- files ago and this one follows the ruling rather than re-deciding it.
--
-- (1) GRANT THE READ TO THE AGENT ROLE. Both doors resolve their caller through
--     `clara._human_ctx`, which reads `clara.jwt_sub()` / `clara.jwt_firm()`. The chat lane
--     carries neither, so the grant would buy a door that answers CLR04 `no authenticated actor`
--     every time. `0011:4210-4213` also asserts, literally, that `clara_agent_ro` must NOT hold
--     `clara.list_review_queue`, and this file keeps that true: the agent role gains the WAKE
--     wrapper, never the human door.
--
-- (2) A WAKE WRAPPER THAT SETS `request.jwt.claims` FROM THE CREDENTIAL'S on_behalf_of. REFUSED,
--     and the estate refused it first, in words: "Setting request.jwt.claims from a production
--     function to borrow a human's identity is impersonation; in this repo that idiom appears
--     ONLY inside migration probes (0011:99, 0019:1778), never on a production path, and it is
--     not being introduced here." — `0082_wave_e_zeta_render_jobs_part4.sql:14-17`.
--
-- (3) A SECOND, MACHINE-SIDE COPY OF EITHER COMPUTATION. Refused by the same header's next
--     sentence — "DUPLICATION IS REFUSED -- a second copy of a gate is a second place to forget
--     it" — and by #660's own law, "One fact gets ONE definition" (`0154:2058`). It matters more
--     here than anywhere: the `payroll_posting_blocked` and `agreement_posting_blocked` rows carry
--     the GATE'S OWN SENTENCE (`0299:2600`: "clara._post_agreement_acquisition acts on it and
--     clara.list_review_queue DERIVES its agreement_posting_blocked row from it, so the decision
--     the lane took and the sentence a person reads are the same body and cannot drift"). A second
--     projection for the chat lane would be a second place for those words to drift, and the
--     words are the whole point of #946's and #948's contracts.
--
-- (4) A SECURITY INVOKER wake wrapper relying on the estate's `*_agent` RLS policies. Closed by
--     measurement: `clara.list_review_queue` reads more than twenty relations across sixteen row
--     kinds, and making that route work would mean a new table grant and a new policy for
--     `clara_agent_ro` on each — a widening of the model lane's RELATION reach far past the one
--     EXECUTE this file buys. #1000's own last acceptance criterion names the narrower buy and
--     this file takes it.
--
-- So the shape is #1000's, from the cut phase that merged immediately before this wave:
-- `0320_client_financial_pack_wake_read.sql` — one ungranted `_*_core(p_firm, …)`, one thin human
-- wrapper, one audited wake wrapper, one allowlist row per kind. That is also the `_*_core`
-- containment idiom of `0004:749-750` and how the WAKE lane already reaches the same writers
-- (`0004:626`).
--
-- =====================================================================================
-- THE ONE THING THAT MUST NOT CHANGE, AND HOW THIS FILE PROVES IT.
--
-- Neither core is retyped. Each is derived from the LIVE body by anchored string surgery, and
-- §TAIL REVERSES that surgery on the COMMITTED core and asserts the result hashes to the
-- pre-image this file pinned. So "the rows did not change" is a checked fact about the live
-- catalog rather than a claim about a copy-paste.
--
--   `clara.get_payroll_settlement_candidates` → `clara._payroll_settlement_candidates_core`:
--     A. the `declare c record;` + `c := clara._human_ctx(clara.role_rank('bookkeeper'));` opener,
--        replaced by a comment naming the two doors that now carry the floor;
--     B. `cl.firm_id = c.firm` → `cl.firm_id = p_firm`.
--
--   `clara.list_review_queue` → `clara._list_review_queue_core`:
--     A. `declare c record; v_client uuid;` → `declare v_client uuid;`;
--     B. the `c:=clara._human_ctx(clara.role_rank('viewer'));` line, replaced by a comment;
--     C. every `c.firm` → `p_firm` (a MEASURED count, asserted before and after, never a
--        remembered number — eight migrations have spliced this body and a ninth may add an arm
--        with its own firm predicate before this file lands).
--
-- The behavioural halves are the existing batteries, which run UNCHANGED against the human doors:
-- `payroll-settlement.test.mjs` (#947), `payroll-summary-posting.test.mjs` (#946),
-- `agreement-contract-acquisition.test.mjs` (#948), `wave-a-reads`, and every other file that
-- reads the queue. `agent-read-twins-payroll-agreement.test.mjs` is this file's own battery and
-- proves the NEW lane plus the one property the split must never lose — that both lanes answer
-- from the same body, row for row.
--
-- =====================================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
--   * It opens NO act to the chat lane. No settling, no confirming, no posting: the two new
--     wrappers are reads, they are granted to a READ-ONLY role, and #947's own report already
--     refused to propose an accept-via-chat tool ("the brief names the bank surface or Needs you
--     as the two accept points, never chat").
--   * It grants `clara._agreement_posting_verdict(uuid)` to nobody, exactly as 0299 left it. The
--     verdict reaches the model lane the same way it reaches a person: as the queue row's
--     `question_text`, which IS the gate's own sentence.
--   * It does not change either read's signature, its envelope, its row kinds, its sort or any of
--     its refusal codes. A malformed queue scope is still CLR10 `queue scope is malformed`; a
--     client outside the caller's firm is still CLR10 there and CLR11 `client not in your firm`
--     on the settlement read; the limit is still clamped, never refused.
--   * It mints no table, no column, no chart row, no event type and no role.
--   * It does not widen the model lane by one RELATION. The whole delta on the machine side is:
--     two EXECUTEs on two new wrappers, and two allowlist rows for one wake kind.
--
-- THE FLOOR EACH LANE CARRIES, STATED SO NOBODY HAS TO DERIVE IT.
--   · human lane — VIEWER for the queue and BOOKKEEPER for the settlement read, through
--     `clara._human_ctx(clara.role_rank(...))`, which IS the estate's one floor body and raises
--     the same three CLR04s (`no authenticated actor`, `actor has no active membership`,
--     `insufficient role`) the inline calls raised before this file;
--   · model lane — BOOKKEEPER+, and it is not this file's choice: `clara.mint_wake_credential`
--     refuses a below-bookkeeper `on_behalf_of` outright (CLR10 `authority_lost`) and
--     `clara.wake_context` re-validates the same standing on EVERY use, so a demoted person's
--     outstanding credential goes inert mid-conversation. The model lane is therefore never wider
--     than the human door it reaches, and on the queue it is strictly narrower.
--
-- REDO-SAFE BY CONSTRUCTION (#957, `packages/db/README.md`): every object here is a
-- `create or replace function`, the two rows it writes are `on conflict do nothing` against
-- `clara.wake_fn_allowlist`'s own primary key, and each split RECOVERS its pre-image before it
-- splices — from the human door on a fresh apply, and by REVERSING the committed core on a redo —
-- so the pin is asserted on both paths rather than only on the one `CLARA_MIGRATION_REDO` takes.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates four
                                        -- functions, replaces two, and writes two rows. It runs no
                                        -- backfill and scans no table.

-- =====================================================================================
-- §-1 — THE SURGERY, SPELLED ONCE. §0, §A, §D and §TAIL all need the SAME anchors and the SAME
-- reversal; writing them four times would be four places for them to drift, and drift between the
-- prestate's pin and the tail's reversal is precisely the failure a reversal exists to catch.
-- They live for the length of this file's own transaction and §Z drops them, so nothing outside
-- this migration can ever reach them.
--
-- EVERY ANCHOR IS A SINGLE DOLLAR-QUOTED LITERAL, byte for byte as the LIVE body carries it
-- (leading and trailing newlines included) — no concatenation chain and no chr(), so each
-- substitution is reconstructible by reading this file.
-- =====================================================================================
create function clara.__t1136_settle_anchor() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_sa_fn$
select $t1136_sa$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
$t1136_sa$::text
$t1136_sa_fn$;

create function clara.__t1136_settle_replacement() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_sr_fn$
select $t1136_sr$
begin
  -- #1136 [0352]: the BOOKKEEPER floor and the caller identity are resolved ABOVE this core, by
  -- clara.get_payroll_settlement_candidates (the human door) and by
  -- clara.wake_get_payroll_settlement_candidates (the model lane's door). The firm they resolved
  -- arrives as this function's first argument, and it is the whole tenancy wall for both lanes.
$t1136_sr$::text
$t1136_sr_fn$;

create function clara.__t1136_queue_anchor() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_qa_fn$
select $t1136_qa$  c:=clara._human_ctx(clara.role_rank('viewer'));
$t1136_qa$::text
$t1136_qa_fn$;

create function clara.__t1136_queue_replacement() returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_qr_fn$
select $t1136_qr$  -- #1136 [0352]: the VIEWER floor and the caller identity are resolved ABOVE this
  -- core, by clara.list_review_queue (the human door) and by clara.wake_list_review_queue (the
  -- model lane's door). The firm they resolved arrives as this function's first argument.
$t1136_qr$::text
$t1136_qr_fn$;

-- THE REVERSAL. Each undoes its own file's substitutions in the opposite order. The firm
-- predicate goes back FIRST because neither replacement comment names it, so no comment can be
-- damaged on the way back.
create function clara.__t1136_settle_reverse(p_src text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_srv$
select replace(replace(p_src, 'cl.firm_id = p_firm', 'cl.firm_id = c.firm'),
               clara.__t1136_settle_replacement(), clara.__t1136_settle_anchor())
$t1136_srv$;

create function clara.__t1136_queue_reverse(p_src text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_qrv$
select replace(
         replace(
           replace(p_src, 'p_firm', 'c.firm'),
           clara.__t1136_queue_replacement(), clara.__t1136_queue_anchor()),
         'declare v_client uuid;', 'declare c record; v_client uuid;')
$t1136_qrv$;

-- THE PRE-IMAGE, RECOVERED THE SAME WAY ON BOTH PATHS. On a FRESH apply the human door still
-- carries the body this file is about to move; on a REDO (#957) it carries this file's own thin
-- delegate, and the pre-image is the committed core with the surgery reversed. §0 and §TAIL both
-- call these, so the pin is asserted before AND after, on whichever path the run took.
create function clara.__t1136_settle_preimage() returns text
  language plpgsql stable set search_path = pg_catalog, pg_temp as $t1136_sp$
declare v_src text;
begin
  if to_regprocedure('clara._payroll_settlement_candidates_core(uuid,uuid)') is null then
    select p.prosrc into v_src from pg_proc p
      where p.oid = 'clara.get_payroll_settlement_candidates(uuid)'::regprocedure;
    return v_src;
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara._payroll_settlement_candidates_core(uuid,uuid)'::regprocedure;
  return clara.__t1136_settle_reverse(v_src);
end
$t1136_sp$;

create function clara.__t1136_queue_preimage() returns text
  language plpgsql stable set search_path = pg_catalog, pg_temp as $t1136_qp$
declare v_src text;
begin
  if to_regprocedure('clara._list_review_queue_core(uuid,jsonb,jsonb,integer)') is null then
    select p.prosrc into v_src from pg_proc p
      where p.oid = 'clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure;
    return v_src;
  end if;
  select p.prosrc into v_src from pg_proc p
    where p.oid = 'clara._list_review_queue_core(uuid,jsonb,jsonb,integer)'::regprocedure;
  return clara.__t1136_queue_reverse(v_src);
end
$t1136_qp$;

-- No PUBLIC grant even for eight minutes: §A and §D call these while the session is
-- clara_fn_owner, and nothing else ever should.
revoke all on function clara.__t1136_settle_anchor() from public;
revoke all on function clara.__t1136_settle_replacement() from public;
revoke all on function clara.__t1136_queue_anchor() from public;
revoke all on function clara.__t1136_queue_replacement() from public;
revoke all on function clara.__t1136_settle_reverse(text) from public;
revoke all on function clara.__t1136_queue_reverse(text) from public;
revoke all on function clara.__t1136_settle_preimage() from public;
revoke all on function clara.__t1136_queue_preimage() from public;
grant execute on function clara.__t1136_settle_anchor() to clara_fn_owner;
grant execute on function clara.__t1136_settle_replacement() to clara_fn_owner;
grant execute on function clara.__t1136_queue_anchor() to clara_fn_owner;
grant execute on function clara.__t1136_queue_replacement() to clara_fn_owner;
grant execute on function clara.__t1136_settle_reverse(text) to clara_fn_owner;
grant execute on function clara.__t1136_queue_reverse(text) to clara_fn_owner;
grant execute on function clara.__t1136_settle_preimage() to clara_fn_owner;
grant execute on function clara.__t1136_queue_preimage() to clara_fn_owner;

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t1136_pre$
declare
  v_src text; v_sha text; v_mode text; v_n int; v_i int; v_sig text; v_expect text;
  -- THE TWO BODIES THIS FILE RECUTS, at their MEASURED live sha on `clara_l01` at 312 files /
  -- `0323_trade_invoice_probe_self_exclusion` (the merged and released riders cut phase). Neither
  -- is copied from an earlier migration's header.
  c_settle_pre constant text :=
    '09de64492afaa5f2876c9d51078de55f29fccb946b1bf1fd868403734e4e65e4';
  c_queue_pre constant text :=
    'd5456eccb945decd9f61bba6194543d0528ee5f052776d6fdc20cf9fa0226b6b';
  -- UNCONDITIONAL NEIGHBOUR PINS. Every one is MEASURED LIVE on `clara_l01` at the same frontier.
  -- This file CALLS the first four and RELIES on the last four being exactly what the two reads it
  -- is splitting rely on — the two ungranted verdict bodies whose sentences the queue projects,
  -- and the two ungranted payroll readers the settlement read composes.
  v_pins text[][] := array[
    ['clara.wake_context()',
     'fae8e7999b1763b96d451e12cba28ba15a27a2eb93601ccf9f178f4f361b540d'],
    ['clara.assert_wake_allowed(text,text)',
     '1c88b7e09e60e3384ee5a2cff36db7ba242f3397f0213b488388f7f827306e3b'],
    ['clara._human_ctx(integer)',
     'd1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46'],
    ['clara.role_rank(text)',
     '5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f'],
    ['clara._payroll_posting_verdict(uuid)',
     '23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0'],
    ['clara._agreement_posting_verdict(uuid)',
     'ddd38816bc22037bd5b5c4f1b56b3bbaf1aba581871bd38b12b8918a63607168'],
    ['clara._payroll_net_pay_unsettled(uuid)',
     'e95d5beb42cd546b2fdb3d29ec285e334e258b83085c62f192bbb388a30f100e'],
    ['clara._payroll_settlement_bank_candidates(uuid,bigint,date,integer)',
     'ef61f841cd48f22b24a3e24b9fbe6c74365ab348d59df43a439ea94ef65977f3']
  ];
begin
  -- (1) THE MODE. Both cores present is a REDO; both absent is a fresh apply; one of each is a
  --     half-applied file, which nothing downstream could interpret.
  v_n := (case when to_regprocedure('clara._payroll_settlement_candidates_core(uuid,uuid)') is null then 0 else 1 end)
       + (case when to_regprocedure('clara._list_review_queue_core(uuid,jsonb,jsonb,integer)') is null then 0 else 1 end);
  if v_n = 0 then v_mode := 'FRESH';
  elsif v_n = 2 then v_mode := 'REDO';
  else
    raise exception '#1136 §0: exactly one of the two cores exists — this database carries a HALF-applied 0352 and must be repaired before it is re-run'
      using errcode = 'CLR10';
  end if;

  -- (2) THE PREMISES. The two doors and the two lanes they belong to must be here at all.
  if to_regprocedure('clara.get_payroll_settlement_candidates(uuid)') is null
     or to_regprocedure('clara.list_review_queue(jsonb,jsonb,integer)') is null
     or to_regclass('clara.wake_fn_allowlist') is null
     or to_regprocedure('clara.wake_context()') is null then
    raise exception '#1136 §0: a premise is missing — 0011/0298 doors or the wake allowlist are not on this chain'
      using errcode = 'CLR10';
  end if;

  -- (3) THE TWO PRE-IMAGES, RECOVERED THE SAME WAY §A and §D will recover them, so the pin is
  --     asserted on BOTH paths. On a fresh apply the pre-image is the human door's own body; on a
  --     redo it is the committed core with this file's surgery REVERSED.
  select clara.__t1136_settle_preimage() into v_src;
  v_sha := encode(sha256(v_src::bytea), 'hex');
  if v_sha is distinct from c_settle_pre then
    raise exception '#1136 §0: clara.get_payroll_settlement_candidates(uuid) is not the body this file was written against (mode %, recovered sha %, expected %) — re-derive the surgery against the LIVE body',
      v_mode, v_sha, c_settle_pre using errcode = 'CLR10';
  end if;
  select clara.__t1136_queue_preimage() into v_src;
  v_sha := encode(sha256(v_src::bytea), 'hex');
  if v_sha is distinct from c_queue_pre then
    raise exception '#1136 §0: clara.list_review_queue(jsonb,jsonb,integer) is not the body this file was written against (mode %, recovered sha %, expected %) — re-derive the surgery against the LIVE body',
      v_mode, v_sha, c_queue_pre using errcode = 'CLR10';
  end if;

  -- (4) THE NEIGHBOURS this file calls or relies on, each pinned unconditionally.
  for v_i in 1 .. array_length(v_pins, 1) loop
    v_sig := v_pins[v_i][1]; v_expect := v_pins[v_i][2];
    if to_regprocedure(v_sig) is null then
      raise exception '#1136 §0: neighbour % is absent', v_sig using errcode = 'CLR10';
    end if;
    select encode(sha256(p.prosrc::bytea), 'hex') into v_sha
      from pg_proc p where p.oid = v_sig::regprocedure;
    if v_sha is distinct from v_expect then
      raise exception '#1136 §0: neighbour % moved (sha % , expected %) — another lane recut it; re-measure this file''s pins before applying',
        v_sig, v_sha, v_expect using errcode = 'CLR10';
    end if;
  end loop;

  -- (5) THE ACLs THIS FILE MUST NOT WIDEN, read BEFORE it edits. `clara_agent_ro` holding the
  --     HUMAN queue door would contradict 0011:4210-4213; the tail re-reads all of this after.
  if not has_function_privilege('clara_authenticated', 'clara.list_review_queue(jsonb,jsonb,integer)', 'EXECUTE')
     or not has_function_privilege('clara_authenticated', 'clara.get_payroll_settlement_candidates(uuid)', 'EXECUTE') then
    raise exception '#1136 §0: a human door has lost its clara_authenticated grant before this file ran'
      using errcode = 'CLR10';
  end if;
  for v_i in 1 .. 2 loop
    v_sig := (array['clara.list_review_queue(jsonb,jsonb,integer)',
                    'clara.get_payroll_settlement_candidates(uuid)'])[v_i];
    if has_function_privilege('clara_agent_ro', v_sig, 'EXECUTE')
       or has_function_privilege('clara_runtime', v_sig, 'EXECUTE') then
      raise exception '#1136 §0: % is already reachable from a machine role — this file assumes it is not', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (6) THE VERDICT BODY THE AGREEMENT HALF MUST NEVER OPEN. 0299 granted it to nobody and this
  --     file keeps it that way; asserted before AND after, because "ungranted" is the whole
  --     reason #948's tool reads the queue instead.
  if has_function_privilege('clara_agent_ro', 'clara._agreement_posting_verdict(uuid)', 'EXECUTE')
     or has_function_privilege('clara_authenticated', 'clara._agreement_posting_verdict(uuid)', 'EXECUTE')
     or has_function_privilege('clara_runtime', 'clara._agreement_posting_verdict(uuid)', 'EXECUTE') then
    raise exception '#1136 §0: clara._agreement_posting_verdict is already granted to an application role'
      using errcode = 'CLR10';
  end if;

  raise notice '#1136 §0 prestate OK -- mode %, both pre-images recovered at their pinned sha, eight neighbours pinned, both human doors clara_authenticated-only and closed to every machine role, the agreement verdict ungranted.', v_mode;
end
$t1136_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara._payroll_settlement_candidates_core — #947'S OWN BODY, WITH THE FIRM AS AN ARGUMENT.
--
-- Derived from the LIVE body by two anchored substitutions, each asserted to occur EXACTLY once.
-- Nothing else moves: not a key, not an order-by, not the CLR11, not the '[]' empty answer.
-- =====================================================================================
do $t1136_a$
declare
  v_src text; v_new text; v_n int;
begin
  select clara.__t1136_settle_preimage() into v_src;

  v_n := (length(v_src) - length(replace(v_src, clara.__t1136_settle_anchor(), ''))) / length(clara.__t1136_settle_anchor());
  if v_n <> 1 then
    raise exception '#1136 §A: the floor opener appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'cl.firm_id = c.firm', ''))) / length('cl.firm_id = c.firm');
  if v_n <> 1 then
    raise exception '#1136 §A: the firm predicate appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;

  v_new := replace(v_src, clara.__t1136_settle_anchor(), clara.__t1136_settle_replacement());
  v_new := replace(v_new, 'cl.firm_id = c.firm', 'cl.firm_id = p_firm');
  if position('c.firm' in v_new) <> 0 or position('_human_ctx' in v_new) <> 0 then
    raise exception '#1136 §A: the derived core still resolves a caller of its own' using errcode = 'CLR10';
  end if;
  if clara.__t1136_settle_reverse(v_new) is distinct from v_src then
    raise exception '#1136 §A: the surgery does not reverse to the pre-image — refusing to install a body the tail could not check'
      using errcode = 'CLR10';
  end if;

  execute format(
    'create or replace function clara._payroll_settlement_candidates_core(p_firm uuid, p_client uuid)'
    || ' returns jsonb language plpgsql security definer set search_path = clara, pg_temp as %L', v_new);

  raise notice '#1136 §A: clara._payroll_settlement_candidates_core installed -- #947''s own body with the bookkeeper floor lifted into its two doors and ONE firm predicate carrying the tenancy.';
end
$t1136_a$;

comment on function clara._payroll_settlement_candidates_core(uuid, uuid) is
  '#947 [0298], recut by #1136 [0352]. Per client, each posted payroll run whose net pay is not '
  'yet settled, with its own candidate bank lines -- clara.get_payroll_settlement_candidates''s '
  'OWN body with the caller''s firm as an argument instead of a JWT read. ONE definition, two '
  'entrances: the human door (clara.get_payroll_settlement_candidates, bookkeeper floor, '
  'clara_authenticated) and the model lane''s door (clara.wake_get_payroll_settlement_candidates, '
  'clara_agent_ro, one interactive allowlist row). Granted to NOBODY and reached only from those '
  'two definer doors -- the one-ungranted-core law (0004:6-12). Derived entirely from live state '
  '(clara._payroll_net_pay_unsettled + clara._payroll_settlement_bank_candidates); stores nothing.';

-- =====================================================================================
-- §B — clara.get_payroll_settlement_candidates — RECUT: THE BOOKKEEPER'S OWN AUDITED DOOR.
--
-- SAME SIGNATURE, SAME RETURN TYPE, SAME ACL, SAME ENVELOPE, SAME REFUSALS. What changes is that
-- the body it used to carry is now the core's. The floor is still BOOKKEEPER and it is still
-- `clara._human_ctx`, the estate's one floor body, raising the same three CLR04s.
-- =====================================================================================
create or replace function clara.get_payroll_settlement_candidates(p_client uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = clara, pg_temp as $t1136_settle_human$
declare
  h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._payroll_settlement_candidates_core(h.firm, p_client);
end $t1136_settle_human$;

comment on function clara.get_payroll_settlement_candidates(uuid) is
  '#947 AC1, recut by #1136 [0352]. Per client, each posted payroll run whose net pay is not yet '
  'settled, with its own candidate bank lines. The computation is '
  'clara._payroll_settlement_candidates_core''s -- ONE definition, two entrances -- and this door '
  'is the HUMAN entrance: floored at BOOKKEEPER through clara._human_ctx (CLR04 for no actor, no '
  'active membership or an insufficient role), CLR11 for a client outside the caller''s firm, and '
  'granted to clara_authenticated alone. clara_runtime, clara_agent_ro and every clara_wake_* role '
  'still hold NOTHING on it; the model lane''s entrance is '
  'clara.wake_get_payroll_settlement_candidates, its own audited door.';

-- =====================================================================================
-- §C — clara.wake_get_payroll_settlement_candidates — THE MODEL LANE'S OWN AUDITED DOOR.
--
-- The shape is `clara.wake_get_client_financial_pack` (0320 §C), which is
-- `clara.wake_list_binding_candidates`' (0154:2296-2307): resolve the wake context, refuse without
-- a credential, ask the allowlist, require a named person, carry the credential's client pin, then
-- delegate. It adds no floor of its own: `clara.wake_context` only returns a row when the
-- credential's `on_behalf_of` is an ACTIVE BOOKKEEPER+ of the credential's firm, which is exactly
-- the read's own floor.
--
-- IT OPENS NO ACT. #947's settlement door (`clara.settle_payroll_net_pay`) is untouched and still
-- clara_authenticated-only: acceptance happens on the bank surface or in Needs you, where a person
-- sees every candidate side by side before deciding.
-- =====================================================================================
create or replace function clara.wake_get_payroll_settlement_candidates(p_client uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = clara, pg_temp as $t1136_settle_wake$
declare
  w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_get_payroll_settlement_candidates');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03',
        detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  -- DORMANT TODAY: the one allowlisted kind is `interactive`, whose client_id is NULL by
  -- construction. Written anyway because the bank wrappers carry it for the pinned kinds
  -- (0121/0130) and a later file that allowlists `interactive_client` must not have to remember.
  if w.client_id is not null and p_client is distinct from w.client_id then
    raise exception 'that is not the client this credential is pinned to' using errcode = 'CLR11',
      detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._payroll_settlement_candidates_core(w.firm_id, p_client);
end $t1136_settle_wake$;

comment on function clara.wake_get_payroll_settlement_candidates(uuid) is
  '#1136 [0352]. The MODEL LANE''s entrance to #947''s settlement candidates: the same '
  'clara._payroll_settlement_candidates_core the bookkeeper''s door calls, reached under a wake '
  'credential instead of a JWT. EXECUTE to clara_agent_ro alone -- the role the chat lane''s read '
  'pool SET ROLEs to -- and ONE clara.wake_fn_allowlist row, for the `interactive` kind. It reads '
  'and never acts: clara.settle_payroll_net_pay is untouched and unreachable from here, because a '
  'person accepts a candidate on the bank surface or in Needs you, never in a conversation. The '
  'floor is the credential''s own BOOKKEEPER+, re-validated by clara.wake_context on every use.';

-- =====================================================================================
-- §D — clara._list_review_queue_core — THE QUEUE'S OWN BODY, WITH THE FIRM AS AN ARGUMENT.
--
-- Derived from the LIVE body by three anchored substitutions. The third is a MEASURED count, not
-- a remembered one: eight migrations have spliced this body (0146, 0168, 0180, 0260, 0288, 0297,
-- 0298, 0299, 0300, 0302, 0303) and a ninth arm would bring its own firm predicate with it.
-- =====================================================================================
do $t1136_d$
declare
  v_src text; v_new text; v_n int; v_firm_n int; v_kinds text[]; v_k text;
begin
  select clara.__t1136_queue_preimage() into v_src;

  v_n := (length(v_src) - length(replace(v_src, 'declare c record; v_client uuid;', ''))) / length('declare c record; v_client uuid;');
  if v_n <> 1 then
    raise exception '#1136 §D: the declare opener appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, clara.__t1136_queue_anchor(), ''))) / length(clara.__t1136_queue_anchor());
  if v_n <> 1 then
    raise exception '#1136 §D: the floor line appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;
  v_firm_n := (length(v_src) - length(replace(v_src, 'c.firm', ''))) / length('c.firm');
  if v_firm_n < 1 then
    raise exception '#1136 §D: the pre-image carries no firm predicate at all' using errcode = 'CLR10';
  end if;
  if position('p_firm' in v_src) <> 0 then
    raise exception '#1136 §D: the pre-image already names p_firm' using errcode = 'CLR10';
  end if;

  v_new := replace(v_src, 'declare c record; v_client uuid;', 'declare v_client uuid;');
  v_new := replace(v_new, clara.__t1136_queue_anchor(), clara.__t1136_queue_replacement());
  v_new := replace(v_new, 'c.firm', 'p_firm');
  if position('c.firm' in v_new) <> 0 or position('_human_ctx' in v_new) <> 0 then
    raise exception '#1136 §D: the derived core still resolves a caller of its own' using errcode = 'CLR10';
  end if;
  v_n := (length(v_new) - length(replace(v_new, 'p_firm', ''))) / length('p_firm');
  if v_n <> v_firm_n then
    raise exception '#1136 §D: the firm predicate moved from % site(s) to % — the surgery is not one-for-one', v_firm_n, v_n
      using errcode = 'CLR10';
  end if;
  if clara.__t1136_queue_reverse(v_new) is distinct from v_src then
    raise exception '#1136 §D: the surgery does not reverse to the pre-image — refusing to install a body the tail could not check'
      using errcode = 'CLR10';
  end if;

  -- EVERY ROW KIND the queue projected before this file still projects, each at exactly one site.
  -- The chat lane's two contracts live on two of them (payroll_posting_blocked for #946,
  -- agreement_posting_blocked for #948) and the other fourteen must be untouched collateral.
  v_kinds := array(select m[1] from regexp_matches(v_src, '''([a-z_]+)''::text row_kind', 'g') m order by 1);
  foreach v_k in array v_kinds loop
    if (length(v_new) - length(replace(v_new, '''' || v_k || '''::text row_kind', '')))
       / length('''' || v_k || '''::text row_kind') <> 1 then
      raise exception '#1136 §D: row kind % is no longer projected exactly once in the derived core', v_k
        using errcode = 'CLR10';
    end if;
  end loop;

  execute format(
    'create or replace function clara._list_review_queue_core(p_firm uuid, p_scope jsonb, p_cursor jsonb, p_limit integer)'
    || ' returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as %L', v_new);

  raise notice '#1136 §D: clara._list_review_queue_core installed -- the queue''s own body, % firm predicate(s) rekeyed onto the argument, % row kind(s) each projected exactly once.', v_firm_n, array_length(v_kinds, 1);
end
$t1136_d$;

comment on function clara._list_review_queue_core(uuid, jsonb, jsonb, integer) is
  '#1136 [0352]. Needs you / Needs review as ONE read -- clara.list_review_queue''s OWN body with '
  'the caller''s firm as an argument instead of a JWT read, and the VIEWER floor lifted into its '
  'two doors. ONE definition, two entrances: the human door (clara.list_review_queue, '
  'clara_authenticated) and the model lane''s door (clara.wake_list_review_queue, clara_agent_ro, '
  'one interactive allowlist row). Granted to NOBODY and reached only from those two definer '
  'doors. It is where the chat lane reads the two sentences it may never compose for itself: '
  'payroll_posting_blocked (#946) and agreement_posting_blocked (#948), each derived from its own '
  'ungranted verdict body so the words a person reads and the decision the lane took cannot drift.';

-- =====================================================================================
-- §E — clara.list_review_queue — RECUT: THE HUMAN LANE'S OWN AUDITED DOOR.
--
-- SAME SIGNATURE, SAME DEFAULT, SAME RETURN TYPE, SAME ACL, SAME ENVELOPE, SAME REFUSALS.
-- =====================================================================================
create or replace function clara.list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit integer default 50)
  returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp as $t1136_queue_human$
declare
  h record;
begin
  select * into h from clara._human_ctx(clara.role_rank('viewer'));
  return clara._list_review_queue_core(h.firm, p_scope, p_cursor, p_limit);
end $t1136_queue_human$;

comment on function clara.list_review_queue(jsonb, jsonb, integer) is
  'Needs you / Needs review as ONE read, recut by #1136 [0352]. The computation is '
  'clara._list_review_queue_core''s -- ONE definition, two entrances -- and this door is the HUMAN '
  'entrance: floored at VIEWER through clara._human_ctx and granted to clara_authenticated alone. '
  'clara_runtime, clara_agent_ro and every clara_wake_* role still hold NOTHING on it (0011:4210-4213); '
  'the model lane''s entrance is clara.wake_list_review_queue, its own audited door.';

-- =====================================================================================
-- §F — clara.wake_list_review_queue — THE MODEL LANE'S OWN AUDITED DOOR ONTO THE QUEUE.
--
-- Same shape as §C. The client pin is compared as TEXT rather than cast to uuid, deliberately: a
-- malformed scope is the queue's OWN CLR10 `queue scope is malformed`, raised by the core, and a
-- cast here would pre-empt it with a 22P02 that says something different.
-- =====================================================================================
create or replace function clara.wake_list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit integer default 50)
  returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp as $t1136_queue_wake$
declare
  w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then
    raise exception 'no valid wake credential' using errcode = 'CLR03';
  end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_list_review_queue');
  if w.on_behalf_of is null then
    raise exception 'this read rides a named person''s authority and this credential names none'
      using errcode = 'CLR03',
        detail = '{"reason":"wake_authority_absent","class":"on_behalf_of"}';
  end if;
  -- DORMANT TODAY (see §C): `interactive` credentials carry no client pin.
  if w.client_id is not null
     and (p_scope is null or (p_scope ->> 'client_id') is distinct from w.client_id::text) then
    raise exception 'that is not the client this credential is pinned to' using errcode = 'CLR11',
      detail = '{"reason":"credential_client_pin"}';
  end if;
  return clara._list_review_queue_core(w.firm_id, p_scope, p_cursor, p_limit);
end $t1136_queue_wake$;

comment on function clara.wake_list_review_queue(jsonb, jsonb, integer) is
  '#1136 [0352]. The MODEL LANE''s entrance to Needs you / Needs review: the same '
  'clara._list_review_queue_core the human door calls, reached under a wake credential instead of '
  'a JWT. EXECUTE to clara_agent_ro alone and ONE clara.wake_fn_allowlist row, for the '
  '`interactive` kind. This is how #946''s read_payroll_posting_state and #948''s '
  'read_agreement_terms reach their gates'' OWN sentences without a second projection of either '
  'verdict, and how clara._agreement_posting_verdict stays granted to nobody. It reads and never '
  'acts: it mints no question, admits no Work and writes no row.';

reset role;

-- =====================================================================================
-- §G — ACL + THE ALLOWLIST. The complete delta on the machine side: TWO executes, TWO rows.
-- =====================================================================================
-- The cores: nobody. `create or replace` preserves an ACL, so these REVOKEs are what make a redo
-- over a hand-granted core close it again.
revoke all on function clara._payroll_settlement_candidates_core(uuid,uuid) from public;
revoke all on function clara._list_review_queue_core(uuid,jsonb,jsonb,integer) from public;

-- The human doors: restated rather than assumed. `create or replace` preserved the grants 0011
-- and 0298 made, and restating them here means the tail's has_function_privilege read is proving
-- a line this file owns.
revoke all on function clara.get_payroll_settlement_candidates(uuid) from public;
grant execute on function clara.get_payroll_settlement_candidates(uuid) to clara_authenticated;
revoke all on function clara.list_review_queue(jsonb,jsonb,integer) from public;
grant execute on function clara.list_review_queue(jsonb,jsonb,integer) to clara_authenticated;

-- The model lane's doors: the READ role, and no other. NOT clara_runtime (the act lane has no
-- business reading a firm's inbox), NOT clara_wake_interactive (the write pool COMMITs; these are
-- reads and they run read-only), NOT clara_authenticated (a human has their own doors).
revoke all on function clara.wake_get_payroll_settlement_candidates(uuid) from public;
grant execute on function clara.wake_get_payroll_settlement_candidates(uuid) to clara_agent_ro;
revoke all on function clara.wake_list_review_queue(jsonb,jsonb,integer) from public;
grant execute on function clara.wake_list_review_queue(jsonb,jsonb,integer) to clara_agent_ro;

-- ONE KIND, TWO ROWS. `interactive` is what `readScoped` mints (plain, OBO the initiating human,
-- no client pin) in `packages/runtime/workflows/chatTurn.v13.infra.ts`. `interactive_client` is
-- deliberately NOT allowlisted: neither read needs a client pin, and an unpinned credential is the
-- narrower of the two here because the scope arrives as an argument the core walls against the
-- firm.
insert into clara.wake_fn_allowlist(wake_kind, function_name)
  values ('interactive', 'wake_get_payroll_settlement_candidates'),
         ('interactive', 'wake_list_review_queue')
  on conflict (wake_kind, function_name) do nothing;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- A tail that only says OK has proven nothing.
-- =====================================================================================
do $t1136_tail$
declare
  v_src text; v_sha text; v_n int; v_i int; v_sig text; v_role text; v_env jsonb;
  c_settle_pre constant text :=
    '09de64492afaa5f2876c9d51078de55f29fccb946b1bf1fd868403734e4e65e4';
  c_queue_pre constant text :=
    'd5456eccb945decd9f61bba6194543d0528ee5f052776d6fdc20cf9fa0226b6b';
  v_machine text[] := array['clara_agent_ro','clara_runtime','clara_wake_interactive',
                            'clara_wake_proactive','clara_wake_bank','clara_wake_filing',
                            'clara_freeform_ro'];
begin
  -- (1) THE ARITHMETIC DID NOT CHANGE. Reverse this file's own surgery on the COMMITTED cores and
  --     hash: if a single byte of either computation moved, this raises.
  select clara.__t1136_settle_preimage() into v_src;
  v_sha := encode(sha256(v_src::bytea), 'hex');
  if v_sha is distinct from c_settle_pre then
    raise exception '#1136 tail: the settlement core does not reverse to #947''s body (sha %, expected %)', v_sha, c_settle_pre
      using errcode = 'CLR10';
  end if;
  select clara.__t1136_queue_preimage() into v_src;
  v_sha := encode(sha256(v_src::bytea), 'hex');
  if v_sha is distinct from c_queue_pre then
    raise exception '#1136 tail: the queue core does not reverse to the queue''s body (sha %, expected %)', v_sha, c_queue_pre
      using errcode = 'CLR10';
  end if;

  -- (2) SIX OBJECTS, ONE OWNER, THE PINNED search_path, AND SECURITY DEFINER ON ALL SIX.
  for v_i in 1 .. 6 loop
    v_sig := (array['clara._payroll_settlement_candidates_core(uuid,uuid)',
                    'clara.get_payroll_settlement_candidates(uuid)',
                    'clara.wake_get_payroll_settlement_candidates(uuid)',
                    'clara._list_review_queue_core(uuid,jsonb,jsonb,integer)',
                    'clara.list_review_queue(jsonb,jsonb,integer)',
                    'clara.wake_list_review_queue(jsonb,jsonb,integer)'])[v_i];
    if to_regprocedure(v_sig) is null then
      raise exception '#1136 tail: % is absent', v_sig using errcode = 'CLR10';
    end if;
    perform 1 from pg_proc p
      where p.oid = v_sig::regprocedure
        and pg_get_userbyid(p.proowner) = 'clara_fn_owner'
        and p.prosecdef
        and p.proconfig @> array['search_path=clara, pg_temp'];
    if not found then
      raise exception '#1136 tail: % is not a clara_fn_owner-owned SECURITY DEFINER with the pinned search_path', v_sig
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (3) THE TWO CORES ARE REACHABLE BY NOBODY. Not PUBLIC, not a human role, not a machine role.
  for v_i in 1 .. 2 loop
    v_sig := (array['clara._payroll_settlement_candidates_core(uuid,uuid)',
                    'clara._list_review_queue_core(uuid,jsonb,jsonb,integer)'])[v_i];
    if has_function_privilege('public', v_sig, 'EXECUTE')
       or has_function_privilege('clara_authenticated', v_sig, 'EXECUTE') then
      raise exception '#1136 tail: % is reachable outside its two doors', v_sig using errcode = 'CLR10';
    end if;
    foreach v_role in array v_machine loop
      if has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1136 tail: % is reachable from %', v_sig, v_role using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- (4) THE HUMAN DOORS KEPT THEIR ACL AND GAINED NO MACHINE ROLE. 0011:4210-4213's assertion
  --     about clara_agent_ro and clara.list_review_queue is still literally true.
  for v_i in 1 .. 2 loop
    v_sig := (array['clara.get_payroll_settlement_candidates(uuid)',
                    'clara.list_review_queue(jsonb,jsonb,integer)'])[v_i];
    if not has_function_privilege('clara_authenticated', v_sig, 'EXECUTE') then
      raise exception '#1136 tail: % lost its clara_authenticated grant', v_sig using errcode = 'CLR10';
    end if;
    if has_function_privilege('public', v_sig, 'EXECUTE') then
      raise exception '#1136 tail: % is granted to PUBLIC', v_sig using errcode = 'CLR10';
    end if;
    foreach v_role in array v_machine loop
      if has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1136 tail: the HUMAN door % is now reachable from %', v_sig, v_role using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- (5) THE TWO NEW DOORS ARE clara_agent_ro's ALONE.
  for v_i in 1 .. 2 loop
    v_sig := (array['clara.wake_get_payroll_settlement_candidates(uuid)',
                    'clara.wake_list_review_queue(jsonb,jsonb,integer)'])[v_i];
    if not has_function_privilege('clara_agent_ro', v_sig, 'EXECUTE') then
      raise exception '#1136 tail: % is not reachable from clara_agent_ro', v_sig using errcode = 'CLR10';
    end if;
    if has_function_privilege('public', v_sig, 'EXECUTE')
       or has_function_privilege('clara_authenticated', v_sig, 'EXECUTE') then
      raise exception '#1136 tail: % is reachable from PUBLIC or from a human', v_sig using errcode = 'CLR10';
    end if;
    foreach v_role in array v_machine loop
      if v_role <> 'clara_agent_ro' and has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception '#1136 tail: % is reachable from %, which this file did not buy', v_sig, v_role
          using errcode = 'CLR10';
      end if;
    end loop;
  end loop;

  -- (6) TWO ALLOWLIST ROWS, ONE KIND EACH. The dormant client-pin arms in §C and §F are dormant
  --     because of this.
  select count(*)::int into v_n from clara.wake_fn_allowlist
    where function_name in ('wake_get_payroll_settlement_candidates','wake_list_review_queue');
  if v_n <> 2 then
    raise exception '#1136 tail: the two new doors hold % allowlist row(s), expected 2', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.wake_fn_allowlist
    where function_name in ('wake_get_payroll_settlement_candidates','wake_list_review_queue')
      and wake_kind = 'interactive';
  if v_n <> 2 then
    raise exception '#1136 tail: a kind other than `interactive` may call the new doors' using errcode = 'CLR10';
  end if;

  -- (7) THE AGREEMENT VERDICT IS STILL GRANTED TO NOBODY, which is why #948's tool reads the
  --     queue rather than calling it. Asserted after, because a grant here would be the one
  --     widening this file must never make.
  if has_function_privilege('public', 'clara._agreement_posting_verdict(uuid)', 'EXECUTE')
     or has_function_privilege('clara_authenticated', 'clara._agreement_posting_verdict(uuid)', 'EXECUTE') then
    raise exception '#1136 tail: clara._agreement_posting_verdict gained a grant' using errcode = 'CLR10';
  end if;
  foreach v_role in array v_machine loop
    if has_function_privilege(v_role, 'clara._agreement_posting_verdict(uuid)', 'EXECUTE') then
      raise exception '#1136 tail: clara._agreement_posting_verdict is now reachable from %', v_role
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (8) THE ACT DOORS ARE UNTOUCHED. This ticket buys reads; a settle from the chat lane is
  --     exactly what #947's own report refused to propose.
  if has_function_privilege('clara_agent_ro', 'clara.settle_payroll_net_pay(uuid,uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('clara_runtime', 'clara.settle_payroll_net_pay(uuid,uuid,uuid,text)', 'EXECUTE') then
    raise exception '#1136 tail: the payroll settlement ACT is reachable from a machine role' using errcode = 'CLR10';
  end if;

  -- (9) BOTH CORES RUN, AND THE ONE PREDICATE THIS FILE ADDED IS THE WALL. Driven here rather
  --     than reasoned about: a firm that owns nothing sees an EMPTY queue (not somebody else's),
  --     and the settlement core refuses a client that firm does not own with the read's OWN CLR11
  --     — the refusal 0298 wrote, now keyed on the argument instead of on a JWT. This is the
  --     cheapest proof that the two spliced bodies compile, execute AND still wall their tenant.
  select clara._list_review_queue_core('00000000-0000-4000-8000-0000000011f6'::uuid, null, null, 5) into v_env;
  if v_env is null or jsonb_typeof(v_env->'rows') <> 'array' or jsonb_array_length(v_env->'rows') <> 0 then
    raise exception '#1136 tail: the queue core did not answer an empty envelope for a firm with nothing in it (got %)', v_env
      using errcode = 'CLR10';
  end if;
  begin
    select clara._payroll_settlement_candidates_core('00000000-0000-4000-8000-0000000011f6'::uuid,
                                                     '00000000-0000-4000-8000-0000000011f7'::uuid) into v_env;
    raise exception '#1136 tail: the settlement core answered % for a client the named firm does not own — the firm predicate is not walling anything', v_env
      using errcode = 'CLR10';
  exception when sqlstate 'CLR11' then
    null;  -- 0298's own refusal, unchanged: `client not in your firm`.
  end;

  raise notice '#1136 tail: OK -- both cores reverse to their pinned pre-images byte for byte; six objects owned by clara_fn_owner, SECURITY DEFINER, search_path pinned; both cores reachable by nobody; both human doors still clara_authenticated-only and closed to all seven machine roles; the two new doors clara_agent_ro-only with one `interactive` allowlist row each; clara._agreement_posting_verdict and clara.settle_payroll_net_pay unchanged; both cores driven and answering their own empty shapes.';
end
$t1136_tail$;

-- =====================================================================================
-- §Z — THE SURGERY HELPERS, DROPPED. They exist only for the length of this file: §0, §A, §D and
-- §TAIL all need the SAME anchors and the SAME reversal, and spelling them four times is four
-- places for them to drift. Created at the top of the file's own transaction and dropped here, so
-- nothing outside this migration can ever call them.
-- =====================================================================================
drop function clara.__t1136_settle_preimage();
drop function clara.__t1136_settle_reverse(text);
drop function clara.__t1136_settle_anchor();
drop function clara.__t1136_settle_replacement();
drop function clara.__t1136_queue_preimage();
drop function clara.__t1136_queue_reverse(text);
drop function clara.__t1136_queue_anchor();
drop function clara.__t1136_queue_replacement();
