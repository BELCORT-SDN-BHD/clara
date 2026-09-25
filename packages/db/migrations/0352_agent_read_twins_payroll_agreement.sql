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
-- Neither core is hand-retyped, and neither is built at run time either. Each core's body is the
-- LIVE body with a closed roster of anchored substitutions applied, WRITTEN OUT in §A and §D as
-- ordinary SQL — so a reader and the migration lexer both see exactly what is installed, and no
-- statement in this file is assembled from a variable. What keeps that honest is a pin on BOTH
-- sides of the apply: §0 applies the surgery to the LIVE pre-image and refuses unless the result
-- hashes to the body embedded below, and §TAIL re-reads the COMMITTED core, pins the same value,
-- and REVERSES the surgery to assert it hashes back to the pre-image. So "the rows did not change"
-- is a checked fact about the live catalog rather than a claim about a copy-paste.
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
-- §-1 — THE SURGERY, SPELLED ONCE. §0 and §TAIL both need the SAME anchors, the SAME forward
-- derivation and the SAME reversal; writing them twice would be two places for them to drift, and
-- drift between the prestate's pin and the tail's reversal is precisely the failure a reversal
-- exists to catch. Ten helpers: an anchor, a replacement, a forward, a reverse and a pre-image
-- recovery per read. They live for the length of this file's own transaction and §Z drops them, so
-- nothing outside this migration can ever reach them. They INSTALL nothing: §A and §D are ordinary
-- `create or replace function` statements with their bodies written out.
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

-- THE SURGERY ITSELF. §A and §D install their cores as PLAIN SQL — the derived body is embedded
-- in this file, so a reader sees exactly what is installed and no statement here is built at run
-- time. These functions are what makes that safe: §0 applies them to the LIVE pre-image and pins
-- the sha of the result, so an embedded body that differs from the derivation by one byte aborts
-- the migration before anything is installed, and §TAIL re-reads the COMMITTED core against the
-- same two pins.
create function clara.__t1136_settle_forward(p_src text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_sfw$
select replace(replace(p_src, clara.__t1136_settle_anchor(), clara.__t1136_settle_replacement()),
               'cl.firm_id = c.firm', 'cl.firm_id = p_firm')
$t1136_sfw$;

create function clara.__t1136_queue_forward(p_src text) returns text
  language sql immutable set search_path = pg_catalog, pg_temp as $t1136_qfw$
select replace(
         replace(
           replace(p_src, 'declare c record; v_client uuid;', 'declare v_client uuid;'),
           clara.__t1136_queue_anchor(), clara.__t1136_queue_replacement()),
         'c.firm', 'p_firm')
$t1136_qfw$;

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
revoke all on function clara.__t1136_settle_forward(text) from public;
revoke all on function clara.__t1136_queue_forward(text) from public;
revoke all on function clara.__t1136_settle_reverse(text) from public;
revoke all on function clara.__t1136_queue_reverse(text) from public;
revoke all on function clara.__t1136_settle_preimage() from public;
revoke all on function clara.__t1136_queue_preimage() from public;
grant execute on function clara.__t1136_settle_anchor() to clara_fn_owner;
grant execute on function clara.__t1136_settle_replacement() to clara_fn_owner;
grant execute on function clara.__t1136_queue_anchor() to clara_fn_owner;
grant execute on function clara.__t1136_queue_replacement() to clara_fn_owner;
grant execute on function clara.__t1136_settle_forward(text) to clara_fn_owner;
grant execute on function clara.__t1136_queue_forward(text) to clara_fn_owner;
grant execute on function clara.__t1136_settle_reverse(text) to clara_fn_owner;
grant execute on function clara.__t1136_queue_reverse(text) to clara_fn_owner;
grant execute on function clara.__t1136_settle_preimage() to clara_fn_owner;
grant execute on function clara.__t1136_queue_preimage() to clara_fn_owner;

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $t1136_pre$
declare
  v_src text; v_new text; v_sha text; v_mode text; v_n int; v_i int; v_firm_n int;
  v_sig text; v_expect text; v_kinds text[]; v_k text;
  -- THE TWO BODIES THIS FILE RECUTS, at their MEASURED live sha on `clara_l01` at 312 files /
  -- `0323_trade_invoice_probe_self_exclusion` (the merged and released riders cut phase). Neither
  -- is copied from an earlier migration's header.
  c_settle_pre constant text :=
    '09de64492afaa5f2876c9d51078de55f29fccb946b1bf1fd868403734e4e65e4';
  c_queue_pre constant text :=
    'd5456eccb945decd9f61bba6194543d0528ee5f052776d6fdc20cf9fa0226b6b';
  -- …AND THE TWO BODIES §A AND §D EMBED, which must be exactly those two with this file's own
  -- anchored surgery applied. Measured on the same rig from the same pre-images.
  c_settle_core constant text :=
    'a00342aa0fb9ec7c09b13404f8e92b5f19a28366bd65a75ece8be32af7e8bafb';
  c_queue_core constant text :=
    '5eae4caaf6a17eb4441c2079b31b71674b541334264fa5c01cd4544645542591';
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

  -- (7) THE SURGERY, APPLIED TO THE LIVE PRE-IMAGE AND PINNED. §A and §D install their cores as
  --     PLAIN SQL with the derived body written out in this file, which is what a reader and the
  --     migration lexer can both see. This block is what keeps that honest: it derives the body
  --     from the LIVE pre-image here and pins the sha of the result, so an embedded body that
  --     differs by one byte aborts the migration before anything is installed. Each anchor is
  --     counted first, and the reversal is checked, so a derivation that could not be undone is
  --     refused rather than installed.
  select clara.__t1136_settle_preimage() into v_src;
  v_n := (length(v_src) - length(replace(v_src, clara.__t1136_settle_anchor(), '')))
         / length(clara.__t1136_settle_anchor());
  if v_n <> 1 then
    raise exception '#1136 §0: the settlement floor opener appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, 'cl.firm_id = c.firm', '')))
         / length('cl.firm_id = c.firm');
  if v_n <> 1 then
    raise exception '#1136 §0: the settlement firm predicate appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;
  v_new := clara.__t1136_settle_forward(v_src);
  if position('c.firm' in v_new) <> 0 or position('_human_ctx' in v_new) <> 0 then
    raise exception '#1136 §0: the derived settlement core still resolves a caller of its own'
      using errcode = 'CLR10';
  end if;
  if clara.__t1136_settle_reverse(v_new) is distinct from v_src then
    raise exception '#1136 §0: the settlement surgery does not reverse to the pre-image'
      using errcode = 'CLR10';
  end if;
  v_sha := encode(sha256(v_new::bytea), 'hex');
  if v_sha is distinct from c_settle_core then
    raise exception '#1136 §0: the body §A embeds is not the surgery of the live #947 read (derived sha %, embedded %) — re-derive §A against the LIVE body',
      v_sha, c_settle_core using errcode = 'CLR10';
  end if;

  select clara.__t1136_queue_preimage() into v_src;
  v_n := (length(v_src) - length(replace(v_src, 'declare c record; v_client uuid;', '')))
         / length('declare c record; v_client uuid;');
  if v_n <> 1 then
    raise exception '#1136 §0: the queue declare opener appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;
  v_n := (length(v_src) - length(replace(v_src, clara.__t1136_queue_anchor(), '')))
         / length(clara.__t1136_queue_anchor());
  if v_n <> 1 then
    raise exception '#1136 §0: the queue floor line appears % time(s) in the pre-image (expected 1)', v_n
      using errcode = 'CLR10';
  end if;
  -- A MEASURED COUNT, never a remembered one: eleven migrations have spliced this body and a
  -- twelfth arm would bring its own firm predicate with it.
  v_firm_n := (length(v_src) - length(replace(v_src, 'c.firm', ''))) / length('c.firm');
  if v_firm_n < 1 or position('p_firm' in v_src) <> 0 then
    raise exception '#1136 §0: the queue pre-image carries % firm predicate(s) and % p_firm token(s) — expected at least one and none',
      v_firm_n, (length(v_src) - length(replace(v_src, 'p_firm', ''))) / length('p_firm')
      using errcode = 'CLR10';
  end if;
  v_new := clara.__t1136_queue_forward(v_src);
  if position('c.firm' in v_new) <> 0 or position('_human_ctx' in v_new) <> 0 then
    raise exception '#1136 §0: the derived queue core still resolves a caller of its own'
      using errcode = 'CLR10';
  end if;
  if (length(v_new) - length(replace(v_new, 'p_firm', ''))) / length('p_firm') <> v_firm_n then
    raise exception '#1136 §0: the queue firm predicate did not move one-for-one from % site(s)', v_firm_n
      using errcode = 'CLR10';
  end if;
  if clara.__t1136_queue_reverse(v_new) is distinct from v_src then
    raise exception '#1136 §0: the queue surgery does not reverse to the pre-image' using errcode = 'CLR10';
  end if;
  -- EVERY ROW KIND the queue projected before this file still projects, each at exactly one site.
  -- The chat lane's two contracts live on two of them (payroll_posting_blocked for #946,
  -- agreement_posting_blocked for #948) and the other fourteen must be untouched collateral.
  v_kinds := array(select m[1] from regexp_matches(v_src, '''([a-z_]+)''::text row_kind', 'g') m order by 1);
  foreach v_k in array v_kinds loop
    if (length(v_new) - length(replace(v_new, '''' || v_k || '''::text row_kind', '')))
       / length('''' || v_k || '''::text row_kind') <> 1 then
      raise exception '#1136 §0: row kind % is no longer projected exactly once in the derived core', v_k
        using errcode = 'CLR10';
    end if;
  end loop;
  v_sha := encode(sha256(v_new::bytea), 'hex');
  if v_sha is distinct from c_queue_core then
    raise exception '#1136 §0: the body §D embeds is not the surgery of the live queue read (derived sha %, embedded %) — re-derive §D against the LIVE body',
      v_sha, c_queue_core using errcode = 'CLR10';
  end if;

  raise notice '#1136 §0 prestate OK -- mode %, both pre-images recovered at their pinned sha, the two embedded core bodies re-derived from them byte for byte (% queue firm predicate(s), % row kind(s) each projected once), eight neighbours pinned, both human doors clara_authenticated-only and closed to every machine role, the agreement verdict ungranted.',
    v_mode, v_firm_n, array_length(v_kinds, 1);
end
$t1136_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — clara._payroll_settlement_candidates_core — #947'S OWN BODY, WITH THE FIRM AS AN ARGUMENT.
--
-- The body below is #947's own, with the two anchored substitutions §0 already applied to the
-- LIVE pre-image and pinned by sha, so it is written out here rather than built at run time:
-- a reader sees exactly what is installed, the migration lexer can inspect it, and a drift of one
-- byte between this text and the derivation aborts §0 before anything is created.
-- Nothing else moves: not a key, not an order-by, not the CLR11, not the '[]' empty answer.
-- =====================================================================================
create or replace function clara._payroll_settlement_candidates_core(p_firm uuid, p_client uuid)
  returns jsonb
  language plpgsql security definer
  set search_path = clara, pg_temp as $t1136_settle_core$
begin
  -- #1136 [0352]: the BOOKKEEPER floor and the caller identity are resolved ABOVE this core, by
  -- clara.get_payroll_settlement_candidates (the human door) and by
  -- clara.wake_get_payroll_settlement_candidates (the model lane's door). The firm they resolved
  -- arrives as this function's first argument, and it is the whole tenancy wall for both lanes.
  if not exists (select 1 from clara.clients cl where cl.id = p_client and cl.firm_id = p_firm) then
    raise exception 'client not in your firm' using errcode='CLR11';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'entry_id', u.entry_id, 'document_id', u.document_id, 'filing_id', u.filing_id,
        'posting_date', u.posting_date, 'period_month', u.period_month,
        'net_pay_cents', u.net_pay_cents, 'unsettled_cents', u.unsettled_cents,
        'candidates', clara._payroll_settlement_bank_candidates(
          p_client, u.unsettled_cents, u.posting_date))
      order by u.posting_date, u.entry_id)
    from clara._payroll_net_pay_unsettled(p_client) u
    where u.unsettled_cents > 0
  ), '[]'::jsonb);
end $t1136_settle_core$;

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
-- The body below is the queue's own, with the three anchored substitutions §0 already applied to
-- the LIVE pre-image and pinned by sha (the third at a MEASURED count, never a remembered one:
-- eleven migrations have spliced this body — 0146, 0168, 0180, 0260, 0288, 0297, 0298, 0299, 0300,
-- 0302, 0304 — and a twelfth arm would bring its own firm predicate with it). It is written out
-- here rather than built at run time for the reason §A gives.
-- =====================================================================================
create or replace function clara._list_review_queue_core(p_firm uuid, p_scope jsonb, p_cursor jsonb, p_limit integer)
  returns jsonb
  language plpgsql stable security definer
  set search_path = clara, pg_temp as $t1136_queue_core$
declare v_client uuid; v_cursor text[]; v_result jsonb;
begin
  -- #1136 [0352]: the VIEWER floor and the caller identity are resolved ABOVE this
  -- core, by clara.list_review_queue (the human door) and by clara.wake_list_review_queue (the
  -- model lane's door). The firm they resolved arrives as this function's first argument.
  if p_scope is null then p_scope:='{}'::jsonb; end if;
  if jsonb_typeof(p_scope)<>'object' or exists(select 1 from jsonb_object_keys(p_scope) k
      where k<>'client_id') then
    raise exception 'queue scope is malformed' using errcode='CLR10';
  end if;
  if p_scope?'client_id' then
    begin v_client:=(p_scope->>'client_id')::uuid;
    exception when others then raise exception 'queue scope is malformed' using errcode='CLR10'; end;
    if not exists(select 1 from clara.clients where id=v_client and firm_id=p_firm) then
      raise exception 'queue scope is malformed' using errcode='CLR10';
    end if;
  end if;
  -- Clamp, never refuse, the limit (the list_unassigned_documents precedent):
  -- pins §5a validates cursor/scope only.
  p_limit:=least(greatest(coalesce(p_limit,50),1),500);
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object' or jsonb_typeof(p_cursor->'tuple')<>'array'
       or jsonb_array_length(p_cursor->'tuple')<>5 then
      raise exception 'queue cursor is malformed' using errcode='CLR10';
    end if;
    select array_agg(value order by ord) into v_cursor
      from jsonb_array_elements_text(p_cursor->'tuple') with ordinality x(value,ord);
    begin
      perform v_cursor[1]::int; perform v_cursor[2]::uuid;
      perform v_cursor[4]::timestamptz; perform v_cursor[5]::uuid;
    exception when others then raise exception 'queue cursor is malformed' using errcode='CLR10'; end;
  end if;

  with draft_rows as (
    select case when ln.lane='needs_you' then 1 else 2 end section_rank,'draft'::text row_kind,
      case when ln.lane='needs_you' then 'needs_you' else 'needs_review' end section,
      e.client_id,cp.counterparty_id,e.filing_id,e.id entry_id,null::uuid question_id,
      null::uuid task_id,e.document_id,ln.lane,false auto,
      exists(select 1 from clara.rule_decisions rd where rd.entry_id=e.id
        and rd.account_matched) rule_backed,clara.is_high_stakes(e.id) high_stakes,
      e.created_at aged_since,(select coalesce(sum(l.debit_cents),0)
        from clara.journal_lines l where l.entry_id=e.id) amount_cents,
      e.posting_date::text period,null::text question_text,e.created_at,e.id,
      coalesce(cp.counterparty_id::text,'') vendor_group,
      e.coding_kind coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.journal_entries e
    join clara.clients active_entry_client on active_entry_client.id=e.client_id and active_entry_client.status='active'
    left join lateral (select clara._canonical_counterparty(e.client_id,l.counterparty_id)
      counterparty_id from clara.journal_lines l where l.entry_id=e.id
        and l.counterparty_id is not null order by l.line_no limit 1) cp on true
    left join lateral (select * from clara._coding_lane_core(e.client_id,e.filing_id)) ln on true
    where e.firm_id=p_firm and e.status='draft'
      and (v_client is null or e.client_id=v_client)
  ), filing_rows as (
    select case when ln.lane='needs_you' then 1 else 2 end section_rank,
      'uncoded_filing'::text row_kind,
      case when ln.lane='needs_you' then 'needs_you' else 'needs_review' end section,
      f.client_id,null::uuid counterparty_id,f.id filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,f.document_id,ln.lane,
      false auto,(ln.reasons@>array['rule_backed']) rule_backed,
      (ln.reasons@>array['high_stakes']) high_stakes,f.filed_at aged_since,
      nullif(clara._invoice_fact_state(f.document_id)->>'total_cents','')::bigint amount_cents,
      clara._invoice_fact_state(f.document_id)->>'invoice_date' period,
      null::text question_text,f.filed_at created_at,f.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.document_filings f
    join clara.clients active_filing_client on active_filing_client.id=f.client_id and active_filing_client.status='active'
    cross join lateral clara._coding_lane_core(f.client_id,f.id) ln
    where f.firm_id=p_firm and f.retired_at is null
      and exists(select 1 from clara.documents kd where kd.id=f.document_id
                  and clara._is_codeable_kind(kd.document_kind))
      and (v_client is null or f.client_id=v_client)
      and not exists(select 1 from clara.journal_entries e where e.filing_id=f.id
        and (e.status='draft' or (e.status='approved' and e.reversed_by is null)))
  ), question_rows as (
    select 1 section_rank,'open_question'::text row_kind,'needs_you'::text section,
      q.client_id,q.counterparty_id,null::uuid filing_id,null::uuid entry_id,q.id question_id,
      null::uuid task_id,q.document_id,'needs_you'::text lane,
      q.opener_kind='wake' auto,q.spawned_rule_id is not null rule_backed,false high_stakes,
      q.opened_at aged_since,null::bigint amount_cents,null::text period,
      q.question_text,q.opened_at created_at,q.id,
      coalesce(q.counterparty_id::text,'') vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.open_questions q join clara.clients active_question_client on active_question_client.id=q.client_id and active_question_client.status='active' where q.firm_id=p_firm and q.status='open'
      and (v_client is null or q.client_id=v_client)
  ), task_rows as (
    select 2 section_rank,'coding_task'::text row_kind,'needs_review'::text section,
      t.client_id,null::uuid counterparty_id,t.filing_id,null::uuid entry_id,
      null::uuid question_id,t.id task_id,t.document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,t.created_at aged_since,
      null::bigint amount_cents,null::text period,null::text question_text,
      t.created_at,t.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.coding_tasks t join clara.clients active_task_client on active_task_client.id=t.client_id and active_task_client.status='active' where t.firm_id=p_firm and t.status='open'
      and (v_client is null or t.client_id=v_client)
  ), compliance_rows as (
    select case when cw.state in ('crossed','overdue') then 1 else 2 end section_rank,
      'compliance_watch'::text row_kind,
      case when cw.state in ('crossed','overdue') then 'needs_you' else 'needs_review' end section,
      cw.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,cw.created_at aged_since,
      null::bigint amount_cents,cw.window_end::text period,
      ('SST registration threshold watch ('||cw.service_group||')')::text question_text,
      cw.created_at created_at,cw.id,''::text vendor_group,
      null::text coding_kind,cw.id watch_id,cw.state tier,null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.compliance_watches cw
    join clara.clients active_watch_client on active_watch_client.id=cw.client_id and active_watch_client.status='active'
    where cw.firm_id=p_firm and cw.watch_kind='sst_registration' and cw.state<>'resolved'
      and (v_client is null or cw.client_id=v_client)
  ), lint_rows as (
    select case when lf.severity='critical' then 1 else 2 end section_rank,
      'lint_finding'::text row_kind,
      case when lf.severity='critical' then 'needs_you' else 'needs_review' end section,
      lf.client_id,null::uuid counterparty_id,null::uuid filing_id,
      null::uuid entry_id,null::uuid question_id,null::uuid task_id,
      null::uuid document_id,null::text lane,false auto,false rule_backed,
      false high_stakes,lf.opened_at aged_since,null::bigint amount_cents,
      null::text period,('Lint: '||lf.finding_kind)::text question_text,
      lf.created_at,lf.id,''::text vendor_group,null::text coding_kind,
      null::uuid watch_id,lf.severity tier,lf.id finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.lint_findings lf
    join clara.clients active_lint_client on active_lint_client.id=lf.client_id
      and active_lint_client.status='active'
    where lf.firm_id=p_firm and lf.state='open'
      and (v_client is null or lf.client_id=v_client)
  ), fa_rows as (
    -- 0041 (Wave D-a, WD-R1): INCOMPLETE REGISTER ROWS CHASE. Acquisition never blocks on
    -- particulars nobody has yet; the register row is born honestly incomplete and the queue
    -- carries it until a human completes it. The lint_rows shape is copied exactly (lane
    -- NULL, so the ready/needs_review/needs_you counters are untouched).
    select 2 section_rank,'fixed_asset_incomplete'::text row_kind,'needs_review'::text section,
      fa.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,fa.created_at aged_since,
      fa.cost_cents amount_cents,null::text period,fa.description question_text,
      fa.created_at,fa.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.fixed_assets fa
    join clara.clients active_fa_client on active_fa_client.id=fa.client_id
      and active_fa_client.status='active'
    where fa.firm_id=p_firm and fa.status in ('pending','active')
      and not clara._fa_particulars_complete(fa)
      and (v_client is null or fa.client_id=v_client)
  ), adv_rows as (
    -- 0042 (Wave D-b, design SS3.4; WD-R1): INCOMPLETE ADVANCES CHASE. The register row is
    -- soft-born by clara._adv_on_approve with no purpose and no reference -- the disbursement
    -- is never blocked on particulars nobody has typed yet -- so the queue is the only thing
    -- that ever asks for them. fa_rows above is copied exactly (lane NULL, section
    -- needs_review, section_rank 2), which is what keeps the counters untouched.
    -- question_text is composed here rather than left null so the row reads as a sentence in
    -- every consumer, including ones with no advance-specific rendering.
    select 2 section_rank,'staff_advance_incomplete'::text row_kind,'needs_review'::text section,
      sa.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,null::text lane,
      false auto,false rule_backed,false high_stakes,sa.created_at aged_since,
      sa.amount_cents,null::text period,
      format('Staff advance (particulars pending) - %s RM%s', sa.account_code,
        to_char(sa.amount_cents / 100.0, 'FM999,999,990.00')) question_text,
      sa.created_at,sa.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.staff_advances sa
    join clara.clients active_adv_client on active_adv_client.id=sa.client_id
      and active_adv_client.status='active'
    where sa.firm_id=p_firm and sa.purpose is null and sa.voided_by_entry_id is null
      and (v_client is null or sa.client_id=v_client)
  -- #1012 (0288): the seeding_proposal row kind is RETIRED here. 0146 (裁-17) added a
  -- BATCH-LEVEL seeding_rows CTE emitting one row per client that still owned an OPEN
  -- proposal in an OPEN batch; after 0288 nobody can tick or decline one ever again, so
  -- every such row pointed at a decision that can no longer be made. The CTE and its
  -- union arm are spliced OUT. The proposals and batches themselves are untouched and
  -- stay readable. The three columns this CTE alone populated (client_name, batch_ids,
  -- open_proposal_count) stay in the shared column vector, null on every row -- a named
  -- residual: dropping them would recut all ten surviving CTEs for no behavioural gain.
  ), work_question_rows as (
    -- #629: the ONE persistent question a parked accounting Work is waiting on. Section
    -- `needs_you` with lane `needs_you`, exactly like `open_question` rows: a person must act
    -- before the Work can move, which is what that lane means. The client join is the
    -- active-client guard eight of the other nine kinds already carry (0017 R1-F5).
    select 1 section_rank,'work_question'::text row_kind,'needs_you'::text section,
      wqw.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      wqi.id question_id,wqi.task_id,null::uuid document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,wqi.created_at aged_since,
      null::bigint amount_cents,null::text period,
      nullif(btrim(coalesce(wqi.question->>'question',wqi.question->>'text','')),'') question_text,
      wqi.created_at created_at,wqi.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.agent_interruptions wqi
    join clara.accounting_work wqw on wqw.id=wqi.work_id
    join clara.clients wqc on wqc.id=wqw.client_id and wqc.status='active'
    where wqi.firm_id=p_firm and wqi.status='pending' and wqi.work_id is not null
      and (v_client is null or wqw.client_id=v_client)
  ), authority_rows as (
    -- #974 (0260): A PROPOSED, UNSIGNED DEPRECIATION AUTHORITY BLOCKS THE WHOLE CLIENT'S
    -- DEPRECIATION LANE. Section `needs_you`, lane `needs_you` -- exactly like
    -- open_question/work_question: a person (an admin) must act -- sign
    -- (clara.sign_depreciation_authority) or withdraw (clara.retire_depreciation_authority) --
    -- before depreciation for this client can run at all. AT MOST ONE ROW PER CLIENT,
    -- unconditionally: uq_fa_authorities_proposed is a partial unique index on (client_id)
    -- WHERE status='proposed', so this CTE needs no aggregation, unlike seeding_rows. `id` IS
    -- the authority's own id; `authority_id` mirrors it at json-build time (the
    -- asset_id/advance_id idiom, 0041 S4.9 / 0043 S3.8), never a dedicated column, because it
    -- is fully derivable from the shared `id`. The active-client guard mirrors eight of the
    -- other ten kinds (0017 R1-F5).
    select 1 section_rank,'depreciation_authority_pending'::text row_kind,'needs_you'::text section,
      fda.client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,null::uuid task_id,null::uuid document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,fda.created_at aged_since,
      null::bigint amount_cents,null::text period,
      format('Depreciation authority awaiting signature (%s cadence)',fda.cadence) question_text,
      fda.created_at created_at,fda.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.fa_depreciation_authorities fda
    join clara.clients active_fda_client on active_fda_client.id=fda.client_id and active_fda_client.status='active'
    where fda.firm_id=p_firm and fda.status='proposed'
      and (v_client is null or fda.client_id=v_client)
  ), payroll_rows as (
    -- #946 (0297): A PAYROLL SUMMARY THAT WAS READ AND DID NOT POST. DERIVED, stores nothing,
    -- clears itself: clara._payroll_posting_verdict is asked about the estate as it is NOW, and
    -- the sentence shown is that body's own, so the words a person reads and the decision the
    -- lane took can never drift apart. Section `needs_you`, lane `needs_you` -- a person must
    -- act (add an account, check a page, decide correction-versus-re-upload) before this month
    -- can be booked. `id` is the filing's id; `entry_id` names the entry a duplicate refusal
    -- points at, so the row opens onto it. The active-client guard mirrors the other kinds
    -- (0017 R1-F5).
    select 1 section_rank,'payroll_posting_blocked'::text row_kind,'needs_you'::text section,
      pf.client_id,null::uuid counterparty_id,pf.id filing_id,
      nullif(pv.v->>'existing_entry_id','')::uuid entry_id,
      null::uuid question_id,null::uuid task_id,pf.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,pf.filed_at aged_since,
      nullif(pv.v->'plan'->>'debit_cents','')::bigint amount_cents,
      nullif(pv.v->'plan'->>'period_month','') period,
      pv.v->>'sentence' question_text,
      pf.filed_at created_at,pf.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.document_filings pf
    join clara.clients active_payroll_client on active_payroll_client.id=pf.client_id and active_payroll_client.status='active'
    join clara.documents pd on pd.id=pf.document_id and pd.document_kind='payroll_summary'
    cross join lateral (select clara._payroll_posting_verdict(pf.document_id) v) pv
    where pf.firm_id=p_firm and pf.retired_at is null
      and (v_client is null or pf.client_id=v_client)
      and exists(select 1 from clara.document_extractions pe
                  where pe.document_id=pf.document_id and pe.engine_kind='payroll_text_facts'
                    and pe.status='done')
      and not exists(select 1 from clara.journal_entries pj where pj.filing_id=pf.id
        and (pj.status='draft' or (pj.status='approved' and pj.reversed_by is null)))
  ), payroll_settlement_rows as (
    -- #947 (0298): A POSTED PAYROLL RUN WHOSE NET PAY HAS NOT LEFT THE BANK YET. DERIVED from
    -- clara._payroll_net_pay_unsettled's own FIFO ledger read -- stores nothing, clears itself
    -- the moment the account's own balance says the run is covered, by whichever of the three
    -- routes cleared it (CONTEXT.md's Settlement candidate row). Section `needs_you`, lane
    -- `needs_you`. `id`/`filing_id` carry the run's own filing; `entry_id` names the posted
    -- payroll entry itself.
    select 2 section_rank,'payroll_net_pay_unsettled'::text row_kind,'needs_you'::text section,
      active_settlement_client.id client_id,null::uuid counterparty_id,pnu.filing_id,pnu.entry_id,
      null::uuid question_id,null::uuid task_id,pnu.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,pnu.posting_date aged_since,
      pnu.unsettled_cents amount_cents,to_char(pnu.period_month,'YYYY-MM-DD') period,
      'Payroll for ' || to_char(pnu.period_month,'FMMonth YYYY')
        || ' is posted; the payment has not appeared.' question_text,
      pnu.posting_date created_at,pnu.filing_id id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.clients active_settlement_client
    cross join lateral clara._payroll_net_pay_unsettled(active_settlement_client.id) pnu
    where active_settlement_client.firm_id=p_firm and active_settlement_client.status='active'
      and (v_client is null or active_settlement_client.id=v_client)
      and pnu.unsettled_cents > 0
  ), agreement_rows as (
    -- #948 (0299): AN AGREEMENT CONTRACT THAT WAS READ AND DID NOT POST. DERIVED, stores
    -- nothing, clears itself: clara._agreement_posting_verdict is asked about the estate as it
    -- is NOW, and the sentence shown is that body's own, so the words a person reads and the
    -- decision the lane took can never drift apart. A NON-FINANCING agreement gets a row too --
    -- it was read, it will never post, and a person is told what the page IS rather than left to
    -- wonder why a filed agreement produced nothing. Section `needs_you`, lane `needs_you`.
    -- `id` is the filing's id; `entry_id` names the entry a duplicate refusal points at. The
    -- active-client guard mirrors the other kinds (0017 R1-F5).
    select 1 section_rank,'agreement_posting_blocked'::text row_kind,'needs_you'::text section,
      af.client_id,null::uuid counterparty_id,af.id filing_id,
      nullif(av.v->>'existing_entry_id','')::uuid entry_id,
      null::uuid question_id,null::uuid task_id,af.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,af.filed_at aged_since,
      nullif(av.v->'plan'->>'debit_cents','')::bigint amount_cents,
      nullif(av.v->'plan'->>'posting_date','') period,
      av.v->>'sentence' question_text,
      af.filed_at created_at,af.id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.document_filings af
    join clara.clients active_agreement_client on active_agreement_client.id=af.client_id and active_agreement_client.status='active'
    join clara.documents ad on ad.id=af.document_id and ad.document_kind='agreement_contract'
    cross join lateral (select clara._agreement_posting_verdict(af.document_id) v) av
    where af.firm_id=p_firm and af.retired_at is null
      and (v_client is null or af.client_id=v_client)
      and exists(select 1 from clara.document_extractions ae
                  where ae.document_id=af.document_id and ae.engine_kind='agreement_text_facts'
                    and ae.status='done')
      and not exists(select 1 from clara.journal_entries aj where aj.filing_id=af.id
        and (aj.status='draft' or (aj.status='approved' and aj.reversed_by is null)))
  ), rent_settlement_rows as (
    -- #949 (0300): A MONTH OF RENT WHOSE PAYMENT HAS NOT APPEARED. DERIVED from
    -- clara._rent_payable_unsettled's own FIFO ledger read over the confirmed rent plan's
    -- payable account -- stores nothing, clears itself the moment the account's own balance says
    -- the month is covered, by whichever route covered it (CONTEXT.md's Settlement candidate
    -- row, #657's own shape, #947's own second instance). Section `needs_you`, lane `needs_you`.
    -- `id`/`entry_id` carry the rent entry itself; `document_id` carries the tenancy.
    select 2 section_rank,'rent_payable_unsettled'::text row_kind,'needs_you'::text section,
      active_rent_client.id client_id,null::uuid counterparty_id,rpu.filing_id,rpu.entry_id,
      null::uuid question_id,null::uuid task_id,rpu.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,rpu.posting_date aged_since,
      rpu.unsettled_cents amount_cents,to_char(rpu.period_month,'YYYY-MM-DD') period,
      'Rent is posted for ' || to_char(rpu.period_month,'FMMonth YYYY')
        || '; the payment has not appeared.' question_text,
      rpu.posting_date created_at,rpu.entry_id id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.clients active_rent_client
    cross join lateral clara._rent_payable_unsettled(active_rent_client.id) rpu
    where active_rent_client.firm_id=p_firm and active_rent_client.status='active'
      and (v_client is null or active_rent_client.id=v_client)
      and rpu.unsettled_cents > 0
  ), rent_escalation_rows as (
    -- #949 (0300): A STATED RENT REVIEW THE PLAN HAS NOT TAKEN YET. DERIVED from
    -- clara._tenancy_escalation_state: a live rent plan, a live escalation term, and a live
    -- revision that does not yet carry the escalated amount. It appears sixty days before the
    -- date and does NOT disappear once the date passes -- an escalation that took effect and was
    -- never confirmed is exactly the case a person most needs to see. `id`/`task_id` carry the
    -- plan; `document_id` carries the tenancy.
    select 2 section_rank,'rent_escalation_pending'::text row_kind,'needs_you'::text section,
      esc_client.id client_id,null::uuid counterparty_id,null::uuid filing_id,null::uuid entry_id,
      null::uuid question_id,(es.state->>'plan_id')::uuid task_id,es.document_id,
      'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,(es.state->>'effective_from')::date aged_since,
      (es.state->>'new_cents')::bigint amount_cents,es.state->>'effective_from' period,
      'This tenancy states a rent escalation from '
        || to_char((es.state->>'effective_from')::date,'FMDD FMMonth YYYY')
        || '; the plan still charges the earlier amount. Confirm the revision, or decide another treatment.' question_text,
      (es.state->>'effective_from')::date created_at,(es.state->>'plan_id')::uuid id,
      ''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.clients esc_client
    cross join lateral (
      select distinct cf.document_id from clara.contract_plan_confirmations cf
       where cf.client_id = esc_client.id and cf.kind = 'rent_plan') cfd
    cross join lateral (select clara._tenancy_escalation_state(cfd.document_id) state,
                               cfd.document_id document_id) es
    where esc_client.firm_id=p_firm and esc_client.status='active'
      and (v_client is null or esc_client.id=v_client)
      and (es.state->>'pending')::boolean is true
  ), bill_rows as (
    -- #938 (0302): A DOCUMENT-SOURCED ENTRY POSTS INSIDE AN ACCRUAL'S OWN PERIOD WHILE THE
    -- ACCRUAL HAS POSTED AND ITS REVERSAL HAS NOT (see the migration header for the full law).
    -- `id` IS THE PLAN's OWN ID (the two remedies act on the plan); `period` carries the flagged
    -- occurrence's own due date as ISO text. AT MOST ONE ROW PER PLAN.
    select distinct on (o.plan_id)
      1 section_rank,'accrual_bill_conflict'::text row_kind,'needs_you'::text section,
      o.client_id,null::uuid counterparty_id,null::uuid filing_id,je.id entry_id,
      null::uuid question_id,null::uuid task_id,je.document_id,'needs_you'::text lane,
      false auto,false rule_backed,false high_stakes,o.admitted_at aged_since,
      coalesce((clara._plan_accrual_period_line(o.plan_id,o.due_date)->>'amount_cents')::bigint,aa.amount_cents) amount_cents,to_char(o.due_date,'YYYY-MM-DD') period,
      format('A %s posted inside the accrued period %s to %s for "%s"',
        case when aa.side='revenue' then 'document-sourced invoice or receipt'
             else 'document-sourced entry' end,
        to_char(o.period_key,'YYYY-MM-DD'),to_char(pw.period_end,'YYYY-MM-DD'),aa.purpose) question_text,
      o.admitted_at created_at,o.plan_id id,''::text vendor_group,
      null::text coding_kind,null::uuid watch_id,null::text tier,null::uuid finding_id,
      null::text client_name,null::uuid[] batch_ids,null::int open_proposal_count
    from clara.accounting_plan_occurrences o
    join clara.accounting_plan_revisions r on r.plan_id=o.plan_id and r.revision=o.revision
    join clara.accrual_adjustments aa on aa.plan_id=o.plan_id and aa.revision=o.revision
    join clara.clients active_accrual_client on active_accrual_client.id=o.client_id and active_accrual_client.status='active'
    cross join lateral (
      select (o.period_key
              + (case r.frequency when 'monthly' then 1 when 'quarterly' then 3 else 12 end)
                * interval '1 month' - interval '1 day')::date as period_end
    ) pw
    join clara.journal_entries je on je.firm_id=p_firm and je.client_id=o.client_id
      and je.status='approved' and je.reversed_by is null
      and ((je.origin='document' and je.document_id is not null)
        or (aa.side='revenue' and je.origin='agent' and exists (
             select 1 from clara.trade_invoices ti942
               join clara.operation_receipts tr942 on tr942.work_id=ti942.work_id
                    and tr942.outcome='committed'
              where ti942.client_id=o.client_id and ti942.kind='sales_invoice'
                and (tr942.effects->>'entry_id')::uuid=je.id)))
      and exists (select 1 from clara.journal_lines jl
                   where jl.entry_id=je.id and jl.account_code=aa.expense_account_code)
      and (
        je.posting_date between o.period_key and pw.period_end
        or exists (select 1 from clara.document_service_periods dsp
                     where dsp.document_id=je.document_id and dsp.superseded_by is null
                       and dsp.period_start<=pw.period_end and dsp.period_end>=o.period_key)
      )
    where o.firm_id=p_firm and o.leg='primary' and o.work_id is not null
      and (v_client is null or o.client_id=v_client)
      and exists (select 1 from clara.operation_receipts rc
                   where rc.work_id=o.work_id and rc.outcome='committed')
      and not exists (select 1 from clara.accounting_plan_occurrences ro
                       where ro.plan_id=o.plan_id and ro.leg='reversal' and ro.period_key=o.period_key
                         and ro.work_id is not null)
    order by o.plan_id,o.due_date,je.posting_date,je.id
  ), all_rows as (
    select * from draft_rows union all select * from filing_rows
    union all select * from question_rows union all select * from task_rows
    union all select * from compliance_rows union all select * from lint_rows
    union all select * from fa_rows union all select * from adv_rows
    union all select * from work_question_rows
    union all select * from authority_rows
    union all select * from payroll_rows
    union all select * from payroll_settlement_rows
    union all select * from agreement_rows
    union all select * from rent_settlement_rows
    union all select * from rent_escalation_rows
    union all select * from bill_rows
  ), keyed as (
    select r.*,array[r.section_rank::text,r.client_id::text,r.vendor_group,
      r.created_at::text,r.id::text] sort_tuple from all_rows r
  ), page as (
    select * from keyed where v_cursor is null or sort_tuple>v_cursor
    order by sort_tuple limit p_limit
  ), counts as (
    select count(*) filter(where lane='ready')::int ready,
      count(*) filter(where lane='needs_review')::int needs_review,
      count(*) filter(where lane='needs_you')::int needs_you,
      count(*) filter(where row_kind='draft')::int open_drafts,
      count(*) filter(where row_kind='open_question')::int open_questions,
      count(*) filter(where row_kind='coding_task')::int open_tasks,
      count(*) filter(where row_kind='compliance_watch')::int compliance_watches, count(*) filter(where row_kind='lint_finding')::int lint_findings, count(*) filter(where row_kind='work_question')::int work_questions from all_rows
  ), sweep as (
    select exists(select 1 from clara.sweep_runs r where r.firm_id=p_firm
        and r.state='open') open_run,
      (select max(r.finalized_at) from clara.sweep_runs r where r.firm_id=p_firm
        and r.state='finalized') last_finalized_at,
      (select max(r.acknowledged_at) from clara.sweep_runs r where r.firm_id=p_firm)
        last_ack_at
  )
  select jsonb_build_object(
    'watermark',coalesce((select max(de.seq)::text from clara.domain_events de
      where de.firm_id=p_firm and (v_client is null or de.client_id=v_client)),'0'),
    'counts',jsonb_build_object('ready',counts.ready,'needs_review',counts.needs_review,
      'needs_you',counts.needs_you,'open_drafts',counts.open_drafts,
      'open_questions',counts.open_questions,'open_tasks',counts.open_tasks,
      'compliance_watches',counts.compliance_watches,'lint_findings',counts.lint_findings,'work_questions',counts.work_questions),
    'sweep',jsonb_build_object('open_run',sweep.open_run,
      'last_finalized_at',sweep.last_finalized_at,'last_ack_at',sweep.last_ack_at),
    'compliance',jsonb_build_object(
      'stale_evaluator',coalesce(
        (select max(coalesce(r.completed_at,r.started_at))
           from clara.compliance_eval_runs r)<now()-interval '48 hours',true),
      'clients',(select coalesce(jsonb_agg(jsonb_build_object(
          'client_id',cw.client_id,'service_group',cw.service_group,'state',cw.state,
          'confirmed_included_cents',cw.confirmed_included_cents,
          'unknown_or_mixed_cents',cw.unknown_or_mixed_cents,
          'screening_proxy_cents',cw.screening_proxy_cents,
          'earliest_crossing_month',cw.earliest_crossing_month,
          'application_due',cw.application_due,
          'future_method_status',cw.future_method_status)
          order by cw.client_id,cw.service_group),'[]'::jsonb)
        from clara.compliance_watches cw
        join clara.clients active_envelope_client on active_envelope_client.id=cw.client_id and active_envelope_client.status='active'
        where cw.firm_id=p_firm and cw.state<>'resolved'
          and (v_client is null or cw.client_id=v_client))),
    'lint',jsonb_build_object(
      'stale_evaluator',coalesce(
        (select max(coalesce(lr.completed_at,lr.started_at))
          from clara.lint_runs lr)<now()-interval '48 hours',true)),
    'rows',coalesce((select jsonb_agg(jsonb_build_object('row_kind',p.row_kind,
      'section',p.section,'sort',to_jsonb(p.sort_tuple),'client_id',p.client_id,
      'counterparty_id',p.counterparty_id,'filing_id',p.filing_id,'entry_id',p.entry_id,
      'question_id',p.question_id,'task_id',p.task_id,'document_id',p.document_id,
      'lane',p.lane,'auto',p.auto,'rule_backed',p.rule_backed,
      'high_stakes',p.high_stakes,'aged_since',p.aged_since,
      'amount_cents',p.amount_cents,'period',p.period,'question_text',p.question_text,
      'created_at',p.created_at,'id',p.id,
      'coding_kind',p.coding_kind,'watch_id',p.watch_id,'tier',p.tier,'finding_id',p.finding_id,'asset_id',case when p.row_kind='fixed_asset_incomplete' then p.id end,'advance_id',case when p.row_kind='staff_advance_incomplete' then p.id end,'authority_id',case when p.row_kind='depreciation_authority_pending' then p.id end,'accrual_side',case when p.row_kind='accrual_bill_conflict' then (select aa942.side from clara.accrual_adjustments aa942 where aa942.plan_id=p.id order by aa942.revision desc limit 1) end,'accrual_plan_status',case when p.row_kind='accrual_bill_conflict' then (select pl942.status from clara.accounting_plans pl942 where pl942.id=p.id) end,'autodraft',clara._autodraft_attempt_budget(p.filing_id),'client_name',p.client_name,'batch_ids',to_jsonb(p.batch_ids),'open_proposal_count',p.open_proposal_count) order by p.sort_tuple)
      from page p),'[]'::jsonb),
    'next_cursor',(select jsonb_build_object('tuple',to_jsonb(p.sort_tuple))
      from page p order by p.sort_tuple desc limit 1)) into v_result
  from counts cross join sweep;
  return v_result;
end $t1136_queue_core$;

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
  c_settle_core constant text :=
    'a00342aa0fb9ec7c09b13404f8e92b5f19a28366bd65a75ece8be32af7e8bafb';
  c_queue_core constant text :=
    '5eae4caaf6a17eb4441c2079b31b71674b541334264fa5c01cd4544645542591';
  v_machine text[] := array['clara_agent_ro','clara_runtime','clara_wake_interactive',
                            'clara_wake_proactive','clara_wake_bank','clara_wake_filing',
                            'clara_freeform_ro'];
begin
  -- (0) WHAT WAS INSTALLED IS WHAT §0 DERIVED. §0 pinned the sha of the surgery applied to the
  --     LIVE pre-image; this reads the COMMITTED body back and pins the same value, so the two
  --     bodies §A and §D embed are proven to be the derivation on BOTH sides of the apply.
  for v_i in 1 .. 2 loop
    v_sig := (array['clara._payroll_settlement_candidates_core(uuid,uuid)',
                    'clara._list_review_queue_core(uuid,jsonb,jsonb,integer)'])[v_i];
    select encode(sha256(p.prosrc::bytea), 'hex') into v_sha from pg_proc p where p.oid = v_sig::regprocedure;
    if v_sha is distinct from (array[c_settle_core, c_queue_core])[v_i] then
      raise exception '#1136 tail: % was committed at sha % but §0 derived %', v_sig, v_sha,
        (array[c_settle_core, c_queue_core])[v_i] using errcode = 'CLR10';
    end if;
  end loop;

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
drop function clara.__t1136_settle_forward(text);
drop function clara.__t1136_queue_forward(text);
drop function clara.__t1136_settle_reverse(text);
drop function clara.__t1136_settle_anchor();
drop function clara.__t1136_settle_replacement();
drop function clara.__t1136_queue_preimage();
drop function clara.__t1136_queue_reverse(text);
drop function clara.__t1136_queue_anchor();
drop function clara.__t1136_queue_replacement();
