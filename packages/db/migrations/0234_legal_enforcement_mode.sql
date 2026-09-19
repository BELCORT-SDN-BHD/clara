-- 0234_legal_enforcement_mode — #1008 (rider; owner ruling 2026-09-20): DURING THE BETA, THE
-- STATE OF A FIRM'S AGREEMENTS MUST NEVER SWITCH A CAPABILITY OFF.
-- =====================================================================================
-- Spec of record: issue #1008 and its Agent Brief. Domain words: CONTEXT.md — "Legal enforcement
-- mode", "Firm legal standing", "Purpose authorisation".
--
-- THE RULING, IN THE OWNER'S OWN WORDS (2026-09-20): "现在是beta phase, 我要所有东西都可以用和
-- test, 这些东西反而是最不重要的, 正式发布前我会和律师核对, 你不要DARk东西了". Lawyer-reviewed
-- wording, and ENFORCEMENT, come before the official launch. Until then a firm's agreement state is
-- SHOWN and ASKED FOR, and never withdraws Work's use of the model.
--
-- WHAT THE ESTATE DOES TODAY, AND WHY IT IS WRONG FOR THE BETA. `0187_legal_v1_beta_publication`
-- first published Terms v1 on 2026-09-13. Firms admitted BEFORE that date never accepted it,
-- because it did not exist: checkout has always required a data processing agreement acceptance to
-- admit a firm (0186), and that is all those firms hold. 0195 then made Work's model authority a
-- DERIVED basis — `clara._accounting_work_egress_live` answers live only when ONE active owner of
-- the firm holds acceptances of the currently PUBLISHED version of BOTH kinds — so every such firm
-- silently lost Work's use of the model, and so does every firm, of every age, the moment a newer
-- version of either kind is published. Measured on hosted during the signed-in release walk of
-- 2026-09-20: BELCORT's `/settings/firm` reads "This firm's legal standing is not current".
--
-- =====================================================================================
-- WHAT THIS FILE ADDS, IN ONE SENTENCE. ONE platform-level setting with TWO values — `prompt`
-- (this migration's landing value) and `enforce` (today's rule) — stored in ONE forced-RLS
-- singleton relation with ZERO application-role privilege, written through ONE door at the floor
-- `clara.set_admission_capacity` already uses (the OPERATOR FIRM's owner), read through ONE
-- ungranted predicate that four DEFINER bodies consult.
--
-- THE FOUR BODIES IT RECUTS, AND EXACTLY WHY EACH ONE HAD TO MOVE:
--
--   (1) `clara._accounting_work_egress_live(uuid,uuid)` — the wall itself. Under `enforce` it is
--       0195's rule, unchanged in behaviour. Under `prompt` it is: an ACTIVE client of the firm,
--       and an ACTIVE OWNER of the firm who holds AT LEAST ONE REAL `clara.legal_acceptances` row
--       (either kind, any version). No published version is required to exist. A firm whose active
--       owner has never accepted ANYTHING is STILL not live — `prompt` relaxes currency and
--       completeness, it never manufactures a citation. The function stays UNGRANTED and its
--       negatives stay the one indistinguishable `{"live": false}` in both modes.
--
--   (2) `clara.prepare_egress_dispatch(...)` — its `accounting_work` MINT ARM only, by the house
--       string-splice (three anchors, each asserted to occur EXACTLY ONCE, the pre-image pinned,
--       and the reverse substitution proving every other byte is unchanged). Two things forced it:
--         · THE CITATION. The mint inserts `legal_acceptance_id = (v_live->>'dpa_acceptance')`,
--           and `ck_client_egress_purpose_consents_evidence` (0195:502) requires that column to be
--           NOT NULL for `accounting_work`. A `prompt`-mode firm whose only acceptance is the
--           TERMS has no DPA acceptance, so the unpatched body would raise `23514` — an estate
--           defect, not a refusal, and precisely the class 0195's own review round closed.
--         · THE TRUTH. The scope note, the audit row and the `egress.purpose_consent_derived`
--           event must say WHICH MODE granted the basis and WHICH acceptance it cites. A key name
--           must never call a Terms acceptance a DPA acceptance, so the basis travels on its own
--           kind-neutral keys (`basis_acceptance` / `basis_kind`) and `dpa_acceptance` keeps
--           carrying a DPA acceptance or NULL and nothing else.
--       `clara.consume_egress_dispatch` is NOT touched, in either direction, and §T proves it.
--
--   (3) `clara.restore_client_egress_purpose(uuid,text,text)` — MEASURED, not assumed. #1008's
--       brief allowed this door to stand "if it only calls the helper". It does not: it cites
--       `v_live->>'dpa_acceptance'` in the consent insert, in its audit row and in its event, and
--       it writes a scope note that names both kinds. Under `prompt`, a Terms-only firm that
--       revokes and then restores would hit the SAME 23514 the mint arm would, and its receipt
--       would describe acceptances that do not exist. Three anchored substitutions, same
--       discipline. Its CLR28 `derived_basis_not_live` refusal is untouched and still fires
--       whenever the helper says the basis is not live — in BOTH modes.
--
--   (4) `clara.get_firm_legal_standing()` (0233) — one anchored substitution that adds
--       `enforcement_mode` to the returned object so the settings card can choose its copy. ITS
--       OWN FACTS DO NOT MOVE: `standing_live` is still 0195:890-906's limb (a), so "not current"
--       is STILL reported under `prompt`. That is deliberate — the card must ask the owner to
--       accept, and #1009's Firm Home prompt needs the same fact. ARITY 0 FOREVER survives the
--       recut (0233's own safety property; §T re-asserts it).
--
-- WHAT IT DOES NOT DO. It inserts NO `clara.legal_acceptances` row and gives no door the ability
-- to: the estate's ONLY writer of that relation is `clara.accept_legal_document`, and §T re-reads
-- the catalog to say so rather than this comment asserting it. It does not touch the signup
-- acceptance stage, the wording or publication of any agreement, the acceptance machinery, the
-- legal standing card's own facts, any other egress purpose, any frozen body, or any applied
-- migration. It adds NO web control for the flip: the mode is the operator's, and the console
-- control for it is a follow-up.
--
-- =====================================================================================
-- WHY THE MODE IS A RELATION AND NOT A SETTING SOMEBODY CAN SPELL.
--
-- `clara.legal_enforcement` is a single row (`id boolean primary key check (id)`) with FORCE ROW
-- LEVEL SECURITY, one `clara_fn_owner` policy, ZERO privilege for every application role, and a
-- no-delete / no-truncate pair — 0186's `clara.admission_capacity` shape, for 0186's reason: a
-- MISSING row is an unanswerable question, not an unenforced estate. The vocabulary is CLOSED at
-- two values by CHECK, so a third spelling is unrepresentable rather than merely unwritten.
--
-- THE PREDICATE FAILS CLOSED. `clara._legal_enforcement_mode()` coalesces an absent row to
-- `enforce` — the stricter reading — so a configuration that somehow went missing can only ever
-- make the estate behave as it did before this file, never more permissively. The no-delete
-- trigger makes that unreachable; the coalesce states the intent anyway.
--
-- ONE BODY, READ BY EVERYTHING. The operator's own read (`clara.get_legal_enforcement_mode`) takes
-- its `mode` from that same predicate rather than from the row, so the number an operator is shown
-- and the value the wall actually used cannot drift apart — 0186's `_admission_capacity_state`
-- rule, restated.
--
-- =====================================================================================
-- LOCK ORDER. This file takes NO row lock in the
-- `accounting_plans → accounting_work → agent_tasks → agent_interruptions` chain, and adds none
-- to the bodies it splices. `clara.set_legal_enforcement_mode` takes ONE advisory transaction lock
-- (`clara.legal-enforcement`), its own key, held only across its single-row UPDATE — the shape
-- `clara.set_admission_capacity` uses for `clara.admission-capacity`.
--
-- DEPLOYMENT. This file RECUTS FOUR LIVE BODIES, so it rides a writer-quiescence window: stop new
-- writes, drain in-flight calls, apply, resume. A call already executing finishes on its previous
-- body (packages/db/README.md, "Migration and deployment behavior"). It owes NO consumer-first
-- obligation in the other direction: nothing lawful before this migration becomes unlawful after
-- it — the landing mode is strictly more permissive than the rule it replaces, the web reads a
-- NEW key and defaults a missing one to `enforce`, and no runtime lane calls any of the three new
-- names. ROLLBACK is a new append-only migration, or — with no migration at all — the operator
-- firm's owner setting the mode back to `enforce` through the door this file ships.
--
-- EVERY (errcode, detail.reason) PAIR THIS FILE RAISES AT RUNTIME:
--   clara.set_legal_enforcement_mode                             (clara_authenticated)
--     CLR04 (from clara._human_ctx, no detail)                   — below the owner floor
--     CLR04  reason='not_operator_firm'                          — an ordinary firm's owner
--     CLR10  reason='invalid_op_key'                             — a missing or blank op_key
--     CLR10  reason='invalid_mode'                               — anything but prompt | enforce
--     CLR10  reason='reason_required'                            — a missing or blank reason
--     CLR10  reason='reason_too_long'                            — a reason past 500 characters
--     CLR10  reason='op_key_conflict'                            — that key, different arguments
--     CLR10  reason='enforcement_row_missing'                    — the singleton row is gone
--     CLR13  reason='operation_in_flight'                        — the same change, still landing
--   clara.get_legal_enforcement_mode                             (clara_authenticated)
--     CLR04 (from clara._human_ctx, no detail) / CLR04 reason='not_operator_firm'
--   clara._legal_enforcement_mode                                (granted to NOBODY)
--     raises nothing.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: the first executable statement
set local lock_timeout = '15s';

-- =====================================================================================
-- §0 PRESTATE. Every claim this file makes about what it is editing, MEASURED before it edits.
--
-- The five sha pins below were measured on the release-rehearsal rig at 228 migrations
-- (0001->0233, PG 17.11) by reading `pg_proc.prosrc` through `to_regprocedure`, never transcribed
-- from a creating migration's file text — a pin written from file text does not match the live
-- body and this file would refuse to apply. FOUR are PRE-IMAGES of bodies this file recuts, so
-- each recut is applied to the body it was written against and nothing else. TWO are
-- NON-REGRESSION pins: `consume_egress_dispatch`, which this file must never touch, and
-- `set_admission_capacity`, whose shape this file's write door copies — pinning it is what makes
-- "copied from that door" a checked claim rather than a promise.
-- =====================================================================================
do $w1008_pre$
declare v_sig text; v_want text; v_n int; v_def text;
begin
  -- (1) THE RELATIONS AND HELPERS THIS FILE READS OR REUSES MUST EXIST.
  foreach v_sig in array array['clara.legal_acceptances','clara.legal_documents',
                               'clara.firm_memberships','clara.clients','clara.firms','clara.users',
                               'clara.client_egress_purpose_consents',
                               'clara.client_egress_purpose_activations',
                               'clara.admission_capacity']
  loop
    if to_regclass(v_sig) is null then
      raise exception '#1008 prestate: % is absent -- its owning migration must apply first', v_sig
        using errcode='CLR10';
    end if;
  end loop;
  foreach v_sig in array array['clara._human_ctx(integer)','clara.role_rank(text)',
                               'clara.jwt_firm()','clara._hash(jsonb)',
                               'clara._reserve_op(uuid,text,text,bytea)',
                               'clara._finish_op(uuid,text,text,jsonb)',
                               'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
                               'clara._append_event(uuid,text,uuid,uuid,uuid,text,uuid,uuid,uuid,jsonb)',
                               'clara._tf_append_only()','clara._tf_no_truncate()']
  loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1008 prestate: prerequisite absent: %', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (2) THE THREE NEW NAMES AND THE NEW RELATION MUST BE WHOLLY ABSENT. A half-applied cohort is
  --     the failure mode rig-meta's "wholly present or wholly absent" rule exists to catch.
  if to_regclass('clara.legal_enforcement') is not null then
    raise exception '#1008 prestate: clara.legal_enforcement already exists' using errcode='CLR10';
  end if;
  foreach v_sig in array array['clara._legal_enforcement_mode()',
                               'clara.set_legal_enforcement_mode(text,text,text)',
                               'clara.get_legal_enforcement_mode()']
  loop
    if to_regprocedure(v_sig) is not null then
      raise exception '#1008 prestate: % already exists', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (3) THE SIX PINS.
  for v_sig, v_want in
    select * from (values
      -- the FOUR pre-images this file recuts
      ('clara._accounting_work_egress_live(uuid,uuid)',
       '53f690091c24bb82ec529d5cb818647374d0181ed609777155d2f9eae87596a0'),
      ('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)',
       'f051fe1ff8cacfe15e570b668413e43d41e562b78f0f99524d03bf0889dcb3a9'),
      ('clara.restore_client_egress_purpose(uuid,text,text)',
       '97e3f3ee783bb18374d5f8efb51fe14569a9ea2ad16e601058a52a65731f1cba'),
      ('clara.get_firm_legal_standing()',
       '42fc6a6630a29462e74953635abd81928ecbb02dbb1e4fac1dc6dd78939ff8b9'),
      -- the TWO non-regression pins
      ('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)',
       'f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3'),
      ('clara.set_admission_capacity(integer,text,text)',
       '190d0fe847c2ab24eb6a257c68e2478f10c5df857f96e085846f6b43243a7c86')
    ) as t(sig, sha)
  loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1008 prestate: % does not resolve', v_sig using errcode='CLR10';
    end if;
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p where p.oid = to_regprocedure(v_sig))
       is distinct from v_want then
      raise exception '#1008 prestate: % has DRIFTED from its pinned body -- re-measure on a migrated rig before applying', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- (4) THE EVIDENCE CHECK IS AT 0195's SIX-PURPOSE FORM, and it REQUIRES a legal acceptance for
  --     accounting_work. This is the constraint that makes the mint arm's citation a correctness
  --     question rather than a cosmetic one: a NULL citation is 23514, not a refusal.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.client_egress_purpose_consents'::regclass
     and c.conname='ck_client_egress_purpose_consents_evidence';
  if v_def is null then
    raise exception '#1008 prestate: ck_client_egress_purpose_consents_evidence is absent'
      using errcode='CLR10';
  end if;
  if position('legal_acceptance_id IS NOT NULL' in v_def) = 0 then
    raise exception '#1008 prestate: the evidence CHECK no longer requires a legal acceptance for accounting_work -- got {%}', v_def
      using errcode='CLR10';
  end if;

  -- (5) THE ONE ACCEPTANCE WRITER. This file must not become a second one, and §T says whether it
  --     did; saying what was here first is what makes that comparison mean something.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.prosrc like '%insert into clara.legal_acceptances%';
  if v_n <> 1 then
    raise exception '#1008 prestate: % bodies insert a legal acceptance (expected exactly 1, clara.accept_legal_document)', v_n
      using errcode='CLR10';
  end if;

  raise notice '#1008 prestate: clean -- clara.legal_enforcement and the three new names are wholly absent; _accounting_work_egress_live, prepare_egress_dispatch, restore_client_egress_purpose and get_firm_legal_standing are at their measured pre-0234 bodies; consume_egress_dispatch and set_admission_capacity are at theirs; 0195''s evidence CHECK still requires a legal acceptance for accounting_work; and exactly ONE body in the estate inserts an acceptance.';
end
$w1008_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A  THE MODE. One configuration row, one predicate body, two doors — 0186 §C's shape.
-- =====================================================================================
create table clara.legal_enforcement (
  id         boolean     primary key default true,
  mode       text        not null default 'prompt',
  reason     text,
  updated_by uuid        references clara.users(id),
  updated_at timestamptz not null default now(),
  constraint ck_legal_enforcement_singleton check (id),
  -- THE VOCABULARY IS CLOSED HERE, not in a body. A third spelling is unrepresentable.
  constraint ck_legal_enforcement_mode check (mode in ('prompt','enforce')),
  constraint ck_legal_enforcement_reason
    check (reason is null or (btrim(reason) <> '' and length(reason) <= 500))
);

alter table clara.legal_enforcement enable row level security;
alter table clara.legal_enforcement force row level security;
create policy p_legal_enforcement_owner on clara.legal_enforcement for all to clara_fn_owner
  using (true) with check (true);

-- UPDATE is the point of the table, so it is NOT append-only -- but the row may never be deleted
-- or truncated away, because a missing row is an unanswerable question rather than an unenforced
-- estate. 0186's own disposition for clara.admission_capacity.
create trigger t_legal_enforcement_no_delete before delete on clara.legal_enforcement
  for each row execute function clara._tf_append_only();
create trigger t_legal_enforcement_no_truncate before truncate on clara.legal_enforcement
  for each statement execute function clara._tf_no_truncate();

-- SEEDED AT `prompt`, DELIBERATELY, and that is the whole hosted effect of this migration: after
-- it applies, every admitted firm's Work can use the model with NO owner action. The reason is
-- stored beside the value so the row itself says why it is where it is.
insert into clara.legal_enforcement(id, mode, reason)
  values (true, 'prompt',
    'beta: a firm''s agreement state must not switch a capability off (#1008, owner ruling 2026-09-20)');

comment on table clara.legal_enforcement is
  '#1008: the platform''s legal enforcement mode, one row. prompt = beta (agreement state is shown '
  'and asked for, and never withdraws Work''s model authority); enforce = 0195''s rule. Written '
  'only by clara.set_legal_enforcement_mode (operator-firm owner); read by '
  'clara._legal_enforcement_mode.';

-- THE PREDICATE, IN ONE BODY. Every wall that asks "is enforcement on" asks THIS, so the
-- operator's read and the derived basis can never drift apart. Granted to NOBODY: it is reached
-- only from the definer bodies below. FAILS CLOSED -- an absent row reads as `enforce`, the
-- STRICTER value, so a configuration that went missing can only behave as the estate did before
-- this file.
create function clara._legal_enforcement_mode() returns text
  language sql stable security definer set search_path=clara,pg_temp as $$
  select coalesce((select e.mode from clara.legal_enforcement e where e.id), 'enforce');
$$;
revoke all on function clara._legal_enforcement_mode() from public;
comment on function clara._legal_enforcement_mode() is
  '#1008: the platform''s legal enforcement mode -- prompt | enforce -- as the ONE body every wall '
  'and every read consults. Coalesces an absent configuration row to enforce (fail closed). '
  'Granted to nobody.';

-- THE SEED, RE-READ THROUGH THE PREDICATE. This block runs while `set role clara_fn_owner` is
-- still in force, because §T below runs AFTER `reset role` and the migration login is not
-- guaranteed to be a superuser on every estate — a forced-RLS relation carrying no table grant is
-- unreadable to it. The CONTENT of the row is asserted here; §T asserts its POSTURE from the
-- catalog, which any login can read.
do $w1008_seed$
declare v_n int; v_mode text;
begin
  select count(*)::int into v_n from clara.legal_enforcement;
  if v_n <> 1 then
    raise exception '#1008 seed: clara.legal_enforcement holds % rows (want exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select e.mode into v_mode from clara.legal_enforcement e where e.id;
  if v_mode <> 'prompt' then
    raise exception '#1008 seed: the landing mode is % -- this migration''s whole hosted effect is that it is prompt', v_mode
      using errcode='CLR10';
  end if;
  if clara._legal_enforcement_mode() is distinct from 'prompt' then
    raise exception '#1008 seed: the predicate does not answer the STORED row' using errcode='CLR10';
  end if;
  raise notice '#1008 seed: clara.legal_enforcement holds exactly one row at mode=prompt, and clara._legal_enforcement_mode() agrees.';
end
$w1008_seed$;

-- THE WRITER. Authority is `clara.set_admission_capacity`'s predicate, byte-for-byte: rank through
-- `_human_ctx(role_rank('owner'))`, then the operator-firm exists() re-derived at call time, never
-- cached. op_receipts-idempotent under the caller's own op_key, with a `clara._audit` receipt --
-- the sole-writer convention 0133 and 0186 both use.
create function clara.set_legal_enforcement_mode(
  p_mode text, p_reason text, p_op_key text
) returns jsonb
  language plpgsql security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare
  c record;
  v_dedupe jsonb;
  v_mode text;
  v_reason text;
  v_previous text;
  v_at timestamptz;
begin
  c := clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode='CLR04', detail='{"reason":"not_operator_firm"}';
  end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then
    raise exception 'op_key is required' using errcode='CLR10', detail='{"reason":"invalid_op_key"}';
  end if;
  v_mode := nullif(btrim(coalesce(p_mode,'')),'');
  if v_mode is null or v_mode not in ('prompt','enforce') then
    raise exception 'the legal enforcement mode is prompt or enforce' using errcode='CLR10',
      detail='{"reason":"invalid_mode"}';
  end if;
  v_reason := nullif(btrim(coalesce(p_reason,'')),'');
  if v_reason is null then
    raise exception 'a reason is required' using errcode='CLR10', detail='{"reason":"reason_required"}';
  end if;
  if length(v_reason) > 500 then
    raise exception 'that reason is too long' using errcode='CLR10', detail='{"reason":"reason_too_long"}';
  end if;

  begin
    v_dedupe := clara._reserve_op(c.firm, 'set_legal_enforcement_mode', p_op_key,
      clara._hash(jsonb_build_object('mode',v_mode,'reason',v_reason,'actor',c.actor)));
  exception when sqlstate 'CLR10' then
    -- `_reserve_op`'s own untyped "op_key reused with different args" (0004:57), re-raised WITH a
    -- detail so every refusal this door emits carries (errcode, detail.reason).
    raise exception 'this op key was already used for a different enforcement change'
      using errcode='CLR10', detail='{"reason":"op_key_conflict"}';
  end;
  if v_dedupe is not null then
    if coalesce(v_dedupe->>'pending','') = 'true' then
      raise exception 'this enforcement change is already being recorded' using errcode='CLR13',
        detail='{"reason":"operation_in_flight"}';
    end if;
    return v_dedupe;                                  -- the ORIGINAL receipt, byte-identical
  end if;

  -- ONE advisory key of its own, so two operators cannot interleave a read-then-write on the
  -- singleton row and lose one of the two changes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('clara.legal-enforcement', 0));
  -- `now()` is sampled ONCE into a local and written BOTH to the row and into the receipt, exactly
  -- as clara.set_admission_capacity does with admission_capacity.updated_at: sampling once is what
  -- makes the stored stamp and the answer the caller is handed the same moment.
  v_at := now();
  select e.mode into v_previous from clara.legal_enforcement e where e.id;
  update clara.legal_enforcement
     set mode = v_mode, reason = v_reason, updated_by = c.actor, updated_at = v_at
   where id;
  if not found then
    raise exception 'the legal enforcement row is missing' using errcode='CLR10',
      detail='{"reason":"enforcement_row_missing"}';
  end if;

  perform clara._audit(c.firm, c.actor, null, null, 'set_legal_enforcement_mode', null,
    jsonb_build_object('mode',v_mode,'previous_mode',v_previous,'reason',v_reason));

  return clara._finish_op(c.firm, 'set_legal_enforcement_mode', p_op_key, jsonb_build_object(
    'status','set','mode',v_mode,'previous_mode',v_previous,'reason',v_reason,
    'updated_at',v_at));
end $$;
revoke all on function clara.set_legal_enforcement_mode(text,text,text) from public;
grant execute on function clara.set_legal_enforcement_mode(text,text,text) to clara_authenticated;
comment on function clara.set_legal_enforcement_mode(text,text,text) is
  '#1008: set the platform''s legal enforcement mode (prompt | enforce). Owner of the OPERATOR '
  'firm only (clara.set_admission_capacity''s predicate, re-derived at call time). '
  'op_receipts-idempotent; writes a clara._audit receipt naming the actor, the new mode and the '
  'previous one. Refusals carry detail.reason: invalid_op_key | invalid_mode | reason_required | '
  'reason_too_long | op_key_conflict | enforcement_row_missing (CLR10), operation_in_flight '
  '(CLR13), not_operator_firm (CLR04).';

-- THE READER, BEHIND THE SAME WALL AS THE WRITER (0186 review S4's rule). Its `mode` comes from
-- clara._legal_enforcement_mode() and NOT from the row, so what the operator is shown is what the
-- wall actually used. The firm's own people do not read this door: the mode reaches them on
-- clara.get_firm_legal_standing(), which is viewer-floored and firm-bound.
create function clara.get_legal_enforcement_mode() returns jsonb
  language plpgsql stable security definer
  set search_path=clara,pg_temp
  set plan_cache_mode = force_custom_plan
  as $$
declare v_row record;
begin
  perform clara._human_ctx(clara.role_rank('owner'));
  if not exists (select 1 from clara.firms f where f.id = clara.jwt_firm() and f.is_operator) then
    raise exception 'insufficient role' using errcode='CLR04', detail='{"reason":"not_operator_firm"}';
  end if;
  select e.reason, e.updated_by, e.updated_at into v_row
    from clara.legal_enforcement e where e.id;
  return jsonb_build_object(
    'mode', clara._legal_enforcement_mode(),
    'reason', v_row.reason,
    'updated_by', v_row.updated_by,
    'updated_at', v_row.updated_at);
end $$;
revoke all on function clara.get_legal_enforcement_mode() from public;
grant execute on function clara.get_legal_enforcement_mode() to clara_authenticated;
comment on function clara.get_legal_enforcement_mode() is
  '#1008: {mode, reason, updated_at, updated_by} for the OPERATOR FIRM''s owner only -- the same '
  'predicate clara.set_legal_enforcement_mode carries, re-derived at call time. The mode is read '
  'through clara._legal_enforcement_mode() so this answer cannot drift from the wall. A firm''s '
  'own people read the mode on clara.get_firm_legal_standing() instead.';

-- =====================================================================================
-- §B  THE WALL ITSELF: clara._accounting_work_egress_live, RECUT.
--
-- The `enforce` arm below is 0195:875-910's body, carried through UNCHANGED: the same two
-- `legal_documents ... status='published'` selects, the same one-human-holds-both join with the
-- same `order by m.created_at, m.user_id limit 1` tie-break, and the same negative. §T asserts
-- those fragments are still present from the live source.
--
-- THE `prompt` ARM AND WHAT IT DOES NOT RELAX. It drops the both-kinds, current-version test. It
-- does NOT drop limb (b) (the client is ACTIVE, in THIS firm), it does NOT drop the requirement
-- that the person is an ACTIVE OWNER of this firm, and it does NOT drop the requirement that a
-- REAL acceptance exists to cite. An owner who has never accepted anything answers the same
-- `{"live": false}` as an inactive client — the one indistinguishable negative, in both modes, so
-- this function still cannot become an existence oracle for another firm's books.
--
-- WHICH ACCEPTANCE THE BASIS CITES, AND WHY THE KEY NAMES MATTER. Under `prompt` the payload
-- carries the owner's most recent acceptance OF EACH KIND under that kind's own key
-- (`terms_acceptance` / `dpa_acceptance`, either of which may be NULL) and names the one the basis
-- is founded on under kind-NEUTRAL keys (`basis_acceptance`, `basis_kind`, `basis_version`). The
-- DPA is preferred when one exists, because that is what checkout has always required and what
-- 0195 cited. A Terms acceptance therefore NEVER arrives under a DPA-named key, in any payload,
-- audit row or event.
--
-- `terms_version` / `dpa_version` UNDER `prompt` ARE THE ACCEPTED VERSIONS, not the published
-- ones: under `prompt` no published version need exist at all, and reporting a published version
-- nobody accepted beside an acceptance of an older one would be the mislabelling this file exists
-- to avoid. Under `enforce` the two coincide, exactly as 0195 left them.
-- =====================================================================================
create or replace function clara._accounting_work_egress_live(p_firm uuid, p_client uuid)
  returns jsonb
  language plpgsql stable security definer set search_path=clara,pg_temp
  -- Both the membership probe and the acceptance join bind the firm as a parameter; 0183's house
  -- rule applies for the same reason 0185's doors give.
  set plan_cache_mode = force_custom_plan
  as $$
declare v_client_status text; v_terms int; v_dpa int; v_owner uuid; v_terms_acc uuid; v_dpa_acc uuid;
        v_mode text; v_basis uuid; v_basis_kind text; v_basis_version int;   -- #1008
begin
  if p_firm is null or p_client is null then return jsonb_build_object('live',false); end if;
  -- (b) THE CLIENT IS ACTIVE, in THIS firm. A foreign or absent client answers the same bytes as
  -- an inactive one: this function must not become an existence oracle for another firm's books.
  -- UNCHANGED BY #1008, and it is checked FIRST in both modes.
  select c.status into v_client_status from clara.clients c
   where c.id=p_client and c.firm_id=p_firm;
  if v_client_status is distinct from 'active' then return jsonb_build_object('live',false); end if;

  -- #1008: THE MODE, from the one body that holds it. Fail-closed on an absent row (enforce).
  v_mode := clara._legal_enforcement_mode();

  if v_mode = 'prompt' then
    -- #1008 BETA ARM. An ACTIVE OWNER of this firm who holds AT LEAST ONE REAL acceptance, of
    -- either kind, at any version. The `exists` is INSIDE the owner selection on purpose: with two
    -- active owners where only the second has ever accepted anything, the second is the one this
    -- basis is founded on. The tie-break is 0195's own.
    select m.user_id into v_owner
      from clara.firm_memberships m
     where m.firm_id=p_firm and m.status='active' and m.role='owner'
       and exists (select 1 from clara.legal_acceptances a where a.user_id=m.user_id)
     order by m.created_at, m.user_id limit 1;
    if v_owner is null then return jsonb_build_object('live',false); end if;
    -- THAT OWNER'S OWN most recent acceptance of each kind. (user_id, kind, version) is UNIQUE
    -- (0185's uq_legal_acceptances_user_kind_version), so "most recent" is the highest version.
    select a.id, a.version into v_dpa_acc, v_dpa from clara.legal_acceptances a
     where a.user_id=v_owner and a.kind='dpa' order by a.version desc limit 1;
    select a.id, a.version into v_terms_acc, v_terms from clara.legal_acceptances a
     where a.user_id=v_owner and a.kind='terms' order by a.version desc limit 1;
    if v_dpa_acc is not null then
      v_basis := v_dpa_acc; v_basis_kind := 'dpa'; v_basis_version := v_dpa;
    else
      v_basis := v_terms_acc; v_basis_kind := 'terms'; v_basis_version := v_terms;
    end if;
    -- BELT AND BRACES. The `exists` above already found a row; this is the statement that no
    -- payload can leave here claiming to be live with nothing to cite.
    if v_basis is null then return jsonb_build_object('live',false); end if;
    return jsonb_build_object('live',true,'mode','prompt','owner',v_owner,
      'terms_version',v_terms,'dpa_version',v_dpa,
      'terms_acceptance',v_terms_acc,'dpa_acceptance',v_dpa_acc,
      'basis_kind',v_basis_kind,'basis_acceptance',v_basis,'basis_version',v_basis_version);
  end if;

  -- (a) THE FIRM'S CURRENT ACCEPTED TERMS AND DPA. "Current" is the PUBLISHED version of each
  -- kind; a newer publication that nobody has accepted therefore withdraws authority the moment
  -- it lands, with no sweep and no second switch. 0195's own arm, unchanged.
  select d.version into v_terms from clara.legal_documents d where d.kind='terms' and d.status='published';
  select d.version into v_dpa   from clara.legal_documents d where d.kind='dpa'   and d.status='published';
  if v_terms is null or v_dpa is null then return jsonb_build_object('live',false); end if;
  -- ONE HUMAN must hold BOTH acceptances, and they must be an ACTIVE OWNER of this firm. Two
  -- halves from two different people is not a firm-level acceptance: 0185's checkout door binds
  -- both kinds to the SAME actor, and this is that rule read forward.
  select m.user_id, ta.id, da.id into v_owner, v_terms_acc, v_dpa_acc
    from clara.firm_memberships m
    join clara.legal_acceptances ta
      on ta.user_id=m.user_id and ta.kind='terms' and ta.version=v_terms
    join clara.legal_acceptances da
      on da.user_id=m.user_id and da.kind='dpa' and da.version=v_dpa
   where m.firm_id=p_firm and m.status='active' and m.role='owner'
   order by m.created_at, m.user_id limit 1;
  if v_owner is null then return jsonb_build_object('live',false); end if;
  return jsonb_build_object('live',true,'mode','enforce','owner',v_owner,'terms_version',v_terms,
    'dpa_version',v_dpa,'terms_acceptance',v_terms_acc,'dpa_acceptance',v_dpa_acc,
    'basis_kind','dpa','basis_acceptance',v_dpa_acc,'basis_version',v_dpa);
end $$;
comment on function clara._accounting_work_egress_live(uuid,uuid) is
  '#631, recut by #1008: the DERIVED model-egress basis for purpose=accounting_work, under the '
  'platform''s legal enforcement mode. enforce = an ACTIVE OWNER of the firm holding acceptances '
  'of BOTH currently published legal kinds, and an ACTIVE client (0195''s rule, unchanged). '
  'prompt = an ACTIVE client, and an ACTIVE OWNER holding at least ONE real acceptance of either '
  'kind at any version; the basis CITES that owner''s most recent DPA acceptance when one exists '
  'and their most recent Terms acceptance otherwise, on the kind-neutral basis_acceptance / '
  'basis_kind keys. Never live with nothing real to cite, in either mode. Ungranted; reached only '
  'from clara.prepare_egress_dispatch and clara.restore_client_egress_purpose, whose answers '
  'collapse every negative onto one indistinguishable unknown or refusal.';

-- =====================================================================================
-- §C  THE MINT ARM: clara.prepare_egress_dispatch, spliced.
--
--     THREE SUBSTRING-ANCHORED REPLACEMENTS, not a retyped body, and that is the point: the six
--     purpose arms, the document-sha grammar, the `not exists` mint guard that spans REVOKED rows
--     (what makes an owner's withdrawal stick), the TTL, the authorization insert and the public
--     6-arg signature cannot move if the only text that changes is the three blocks named here.
--     Each anchor is asserted to occur EXACTLY ONCE, and after the splice the REVERSE substitution
--     is applied to the live body and required to reproduce the pinned pre-image BYTE FOR BYTE.
--     That last step is what turns "mint arm only" into a measurement.
-- =====================================================================================
do $w1008_prepare$
declare
  v_sig text := 'clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)';
  v_pre constant text := 'f051fe1ff8cacfe15e570b668413e43d41e562b78f0f99524d03bf0889dcb3a9';
  v_oid oid; v_def text; v_src text; v_head text; v_new text; v_back text; v_occ int; v_probe text;
  v_t1 text; v_r1 text; v_t2 text; v_r2 text; v_t3 text; v_r3 text;
begin
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception '#1008 prepare: % does not resolve at its exact pinned signature', v_sig using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
    raise exception '#1008 prepare: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
  end if;

  -- (1) THE CONSENT THE MINT WRITES: its scope note and the acceptance it cites.
  v_t1 := $t1$        values(p_firm,p_client,'accounting_work',
          'derived from the firm''s accepted Terms and DPA at their published versions (#631)',
          null,(v_live->>'dpa_acceptance')::uuid,(v_live->>'owner')::uuid)$t1$;
  v_r1 := $r1$        values(p_firm,p_client,'accounting_work',
          -- #1008: the scope note states WHICH MODE granted the basis and WHICH KIND of acceptance
          -- it cites. Under enforce it is 0195's own sentence, byte-for-byte.
          case when coalesce(v_live->>'mode','enforce') = 'prompt'
               then 'derived under the beta legal enforcement mode (prompt) from an active owner''s '
                    || coalesce(v_live->>'basis_kind','?')
                    || ' acceptance at version ' || coalesce(v_live->>'basis_version','?')
                    || ' (#1008)'
               else 'derived from the firm''s accepted Terms and DPA at their published versions (#631)'
          end,
          -- #1008: the acceptance the consent CITES, on the kind-neutral key. 0195's evidence
          -- CHECK requires this to be NOT NULL for accounting_work, and under prompt a Terms-only
          -- firm has no DPA acceptance to name.
          null,(v_live->>'basis_acceptance')::uuid,(v_live->>'owner')::uuid)$r1$;

  -- (2) THE AUDIT ROW.
  v_t2 := $t2$          jsonb_build_object('consent',v_derived,'activation',v_derived_act,'client',p_client,
            'purpose','accounting_work','basis','legal_acceptance',
            'legal_acceptance',(v_live->>'dpa_acceptance'),
            'terms_version',(v_live->>'terms_version')::int,
            'dpa_version',(v_live->>'dpa_version')::int));$t2$;
  v_r2 := $r2$          jsonb_build_object('consent',v_derived,'activation',v_derived_act,'client',p_client,
            'purpose','accounting_work','basis','legal_acceptance',
            -- #1008: `legal_acceptance` is the row the consent actually cites, whichever kind it
            -- is; `basis_kind` says which, and `enforcement_mode` says what granted it. The two
            -- kind-named keys below carry their own kind or NULL, never each other's.
            'legal_acceptance',(v_live->>'basis_acceptance'),
            'enforcement_mode',coalesce(v_live->>'mode','enforce'),
            'basis_kind',(v_live->>'basis_kind'),
            'basis_version',(v_live->>'basis_version')::int,
            'terms_acceptance',(v_live->>'terms_acceptance'),
            'dpa_acceptance',(v_live->>'dpa_acceptance'),
            'terms_version',(v_live->>'terms_version')::int,
            'dpa_version',(v_live->>'dpa_version')::int));$r2$;

  -- (3) THE DOMAIN EVENT.
  v_t3 := $t3$          jsonb_build_object('consent_id',v_derived,'activation_id',v_derived_act,
            'purpose','accounting_work','basis','legal_acceptance',
            'legal_acceptance_id',(v_live->>'dpa_acceptance'),
            'terms_acceptance_id',(v_live->>'terms_acceptance'),
            'terms_version',(v_live->>'terms_version')::int,
            'dpa_version',(v_live->>'dpa_version')::int));$t3$;
  v_r3 := $r3$          jsonb_build_object('consent_id',v_derived,'activation_id',v_derived_act,
            'purpose','accounting_work','basis','legal_acceptance',
            -- #1008: the same truthfulness rule as the audit row above. A reader of this event can
            -- tell WHICH MODE granted the basis and WHICH acceptance is behind it, forever.
            'legal_acceptance_id',(v_live->>'basis_acceptance'),
            'enforcement_mode',coalesce(v_live->>'mode','enforce'),
            'basis_kind',(v_live->>'basis_kind'),
            'basis_version',(v_live->>'basis_version')::int,
            'dpa_acceptance_id',(v_live->>'dpa_acceptance'),
            'terms_acceptance_id',(v_live->>'terms_acceptance'),
            'terms_version',(v_live->>'terms_version')::int,
            'dpa_version',(v_live->>'dpa_version')::int));$r3$;

  foreach v_probe in array array[v_t1, v_t2, v_t3] loop
    v_occ := (length(v_src) - length(replace(v_src, v_probe, ''))) / length(v_probe);
    if v_occ <> 1 then
      raise exception '#1008 prepare: an anchor occurs % time(s) in %, expected exactly 1 -- re-derive before patching', v_occ, v_sig
        using errcode='CLR10';
    end if;
  end loop;

  v_new := replace(replace(replace(v_src, v_t1, v_r1), v_t2, v_r2), v_t3, v_r3);
  execute v_head || 'AS $w1008p$' || v_new || '$w1008p$';

  -- …AND NOTHING ELSE MOVED. Read the COMMITTED body back, substitute the three replacements out
  -- again, and require the remainder to hash to the PRE-IMAGE exactly. A smuggled change anywhere
  -- else in this 6184-byte body changes this hash.
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(v_sig);
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') = v_pre then
    raise exception '#1008 prepare: % still hashes to its PRE-IMAGE -- the splice did not apply', v_sig
      using errcode='CLR10';
  end if;
  v_back := replace(replace(replace(v_src, v_r1, v_t1), v_r2, v_t2), v_r3, v_t3);
  if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
    raise exception '#1008 prepare: the splice changed MORE than its three anchors -- the live body with #1008''s blocks substituted out does not reproduce the pinned pre-image'
      using errcode='CLR10';
  end if;
  raise notice '#1008 prepare: clara.prepare_egress_dispatch''s accounting_work mint arm now cites basis_acceptance and states the mode; every other byte is the pinned 0195 body.';
end
$w1008_prepare$;

-- =====================================================================================
-- §D  THE WAY BACK ON: clara.restore_client_egress_purpose, spliced.
--
--     MEASURED, NOT ASSUMED (see the header). This door does not only call the helper: it cites
--     `dpa_acceptance` three times and writes a scope note naming both kinds. Same discipline as
--     §C — three anchors, each exactly once, and the reverse substitution proving the pre-image.
--     Its owner floor, its four refusals (purpose_not_restorable, already_live, nothing_to_restore
--     and CLR28 derived_basis_not_live), its op_key idempotency and its mint-a-fresh-pair shape
--     are all untouched.
-- =====================================================================================
do $w1008_restore$
declare
  v_sig text := 'clara.restore_client_egress_purpose(uuid,text,text)';
  v_pre constant text := '97e3f3ee783bb18374d5f8efb51fe14569a9ea2ad16e601058a52a65731f1cba';
  v_oid oid; v_def text; v_src text; v_head text; v_new text; v_back text; v_occ int; v_probe text;
  v_t1 text; v_r1 text; v_t2 text; v_r2 text; v_t3 text; v_r3 text;
begin
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception '#1008 restore: % does not resolve at its exact pinned signature', v_sig using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
    raise exception '#1008 restore: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
  end if;

  v_t1 := $t1$    values(c.firm,p_client,'accounting_work',
      'restored by an owner from the firm''s accepted Terms and DPA at their published versions (#631)',
      null,(v_live->>'dpa_acceptance')::uuid,c.actor)$t1$;
  v_r1 := $r1$    values(c.firm,p_client,'accounting_work',
      -- #1008: the scope note states WHICH MODE the basis was re-derived under and WHICH KIND of
      -- acceptance it cites. Under enforce it is 0195's own sentence, byte-for-byte.
      case when coalesce(v_live->>'mode','enforce') = 'prompt'
           then 'restored by an owner under the beta legal enforcement mode (prompt) from an active owner''s '
                || coalesce(v_live->>'basis_kind','?')
                || ' acceptance at version ' || coalesce(v_live->>'basis_version','?')
                || ' (#1008)'
           else 'restored by an owner from the firm''s accepted Terms and DPA at their published versions (#631)'
      end,
      -- #1008: the kind-neutral citation. 0195's evidence CHECK requires it to be NOT NULL.
      null,(v_live->>'basis_acceptance')::uuid,c.actor)$r1$;

  v_t2 := $t2$    jsonb_build_object('consent',v_consent,'activation',v_activation,'client',p_client,
      'purpose','accounting_work','restored_over',v_prior,
      'legal_acceptance',(v_live->>'dpa_acceptance'),'op_key',p_op_key));$t2$;
  v_r2 := $r2$    jsonb_build_object('consent',v_consent,'activation',v_activation,'client',p_client,
      'purpose','accounting_work','restored_over',v_prior,
      -- #1008: the acceptance this restore actually cites, the mode it was re-derived under, and
      -- the kind it is. The DPA-named key keeps carrying a DPA acceptance or NULL.
      'legal_acceptance',(v_live->>'basis_acceptance'),
      'enforcement_mode',coalesce(v_live->>'mode','enforce'),
      'basis_kind',(v_live->>'basis_kind'),
      'dpa_acceptance',(v_live->>'dpa_acceptance'),
      'terms_acceptance',(v_live->>'terms_acceptance'),'op_key',p_op_key));$r2$;

  v_t3 := $t3$      'legal_acceptance_id',(v_live->>'dpa_acceptance'),
      'terms_version',(v_live->>'terms_version')::int,
      'dpa_version',(v_live->>'dpa_version')::int));$t3$;
  v_r3 := $r3$      'legal_acceptance_id',(v_live->>'basis_acceptance'),
      'enforcement_mode',coalesce(v_live->>'mode','enforce'),
      'basis_kind',(v_live->>'basis_kind'),
      'basis_version',(v_live->>'basis_version')::int,
      'dpa_acceptance_id',(v_live->>'dpa_acceptance'),
      'terms_acceptance_id',(v_live->>'terms_acceptance'),
      'terms_version',(v_live->>'terms_version')::int,
      'dpa_version',(v_live->>'dpa_version')::int));$r3$;

  foreach v_probe in array array[v_t1, v_t2, v_t3] loop
    v_occ := (length(v_src) - length(replace(v_src, v_probe, ''))) / length(v_probe);
    if v_occ <> 1 then
      raise exception '#1008 restore: an anchor occurs % time(s) in %, expected exactly 1 -- re-derive before patching', v_occ, v_sig
        using errcode='CLR10';
    end if;
  end loop;

  v_new := replace(replace(replace(v_src, v_t1, v_r1), v_t2, v_r2), v_t3, v_r3);
  execute v_head || 'AS $w1008r$' || v_new || '$w1008r$';

  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(v_sig);
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') = v_pre then
    raise exception '#1008 restore: % still hashes to its PRE-IMAGE -- the splice did not apply', v_sig
      using errcode='CLR10';
  end if;
  v_back := replace(replace(replace(v_src, v_r1, v_t1), v_r2, v_t2), v_r3, v_t3);
  if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
    raise exception '#1008 restore: the splice changed MORE than its three anchors -- the live body with #1008''s blocks substituted out does not reproduce the pinned pre-image'
      using errcode='CLR10';
  end if;
  raise notice '#1008 restore: clara.restore_client_egress_purpose now cites basis_acceptance and states the mode; every other byte, including its CLR28 derived_basis_not_live refusal, is the pinned 0195 body.';
end
$w1008_restore$;

-- =====================================================================================
-- §E  THE STANDING READ: clara.get_firm_legal_standing(), spliced.
--
--     ONE anchored substitution, on the RETURN expression alone. `standing_live` is untouched --
--     it is still 0195:890-906's limb (a), so "this firm's legal standing is not current" is still
--     reported under `prompt`, which is exactly what the settings card and #1009's Firm Home
--     prompt need in order to ASK. What moves is that the payload now says which mode is in force,
--     so the surface can choose its copy instead of inferring it.
-- =====================================================================================
do $w1008_standing$
declare
  v_sig text := 'clara.get_firm_legal_standing()';
  v_pre constant text := '42fc6a6630a29462e74953635abd81928ecbb02dbb1e4fac1dc6dd78939ff8b9';
  v_oid oid; v_def text; v_src text; v_head text; v_new text; v_back text; v_occ int;
  v_t1 text; v_r1 text;
begin
  v_oid := to_regprocedure(v_sig);
  if v_oid is null then
    raise exception '#1008 standing: % does not resolve', v_sig using errcode='CLR10';
  end if;
  v_def := pg_get_functiondef(v_oid);
  select p.prosrc into v_src from pg_proc p where p.oid = v_oid;
  v_head := left(v_def, position(E'\nAS $function$' in v_def));
  if v_def <> v_head || 'AS $function$' || v_src || '$function$' || E'\n' then
    raise exception '#1008 standing: % does not split at the AS $function$ boundary', v_sig using errcode='CLR10';
  end if;

  v_t1 := $t1$    'masked', v_masked);$t1$;
  v_r1 := $r1$    'masked', v_masked,
    -- #1008: WHICH RULE IS IN FORCE, so the settings card can choose its copy rather than infer
    -- it. standing_live above is UNCHANGED -- it is still 0195's limb (a) in both modes, because
    -- a card that stopped reporting "not current" could not ask an owner to accept.
    'enforcement_mode', clara._legal_enforcement_mode());$r1$;

  v_occ := (length(v_src) - length(replace(v_src, v_t1, ''))) / length(v_t1);
  if v_occ <> 1 then
    raise exception '#1008 standing: the return anchor occurs % time(s), expected exactly 1', v_occ
      using errcode='CLR10';
  end if;

  v_new := replace(v_src, v_t1, v_r1);
  execute v_head || 'AS $w1008s$' || v_new || '$w1008s$';

  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(v_sig);
  if encode(sha256(convert_to(v_src,'UTF8')),'hex') = v_pre then
    raise exception '#1008 standing: % still hashes to its PRE-IMAGE -- the splice did not apply', v_sig
      using errcode='CLR10';
  end if;
  v_back := replace(v_src, v_r1, v_t1);
  if encode(sha256(convert_to(v_back,'UTF8')),'hex') is distinct from v_pre then
    raise exception '#1008 standing: the splice changed MORE than the return object -- the live body with #1008''s block substituted out does not reproduce the pinned pre-image'
      using errcode='CLR10';
  end if;
  raise notice '#1008 standing: clara.get_firm_legal_standing() now reports enforcement_mode; standing_live and every other byte are 0233''s.';
end
$w1008_standing$;

reset role;

-- =====================================================================================
-- §T  TAIL CENSUS. Re-reads the live catalog after privileges are final; raises on any finding
--     rather than trusting §A..§E ran as written.
-- =====================================================================================
do $w1008_tail$
declare
  v_sig text; v_want text; v_n int; v_posture text; v_src text; r text; v_def text;
begin
  -- (T.1) THE RELATION. Forced RLS, one clara_fn_owner policy, ZERO application-role privilege,
  --       a closed two-value vocabulary, exactly one row, and the no-delete / no-truncate pair.
  if to_regclass('clara.legal_enforcement') is null then
    raise exception '#1008 tail: clara.legal_enforcement is absent' using errcode='CLR10';
  end if;
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           where c.oid='clara.legal_enforcement'::regclass) then
    raise exception '#1008 tail: clara.legal_enforcement does not FORCE row level security'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from information_schema.role_table_grants
   where table_schema='clara' and table_name='legal_enforcement'
     and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                     'clara_wake_interactive','clara_wake_proactive','PUBLIC');
  if v_n <> 0 then
    raise exception '#1008 tail: clara.legal_enforcement carries % application-role grant(s) -- the mode is reached through a door, never a table', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policy p where p.polrelid='clara.legal_enforcement'::regclass;
  if v_n <> 1 then
    raise exception '#1008 tail: clara.legal_enforcement carries % policies (want exactly 1)', v_n
      using errcode='CLR10';
  end if;
  -- (the row's CONTENT — exactly one row, at mode=prompt — was asserted in §A's seed block, while
  --  `set role clara_fn_owner` was still in force; this block reads only the catalog.)
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.legal_enforcement'::regclass and c.conname='ck_legal_enforcement_mode';
  if v_def is null or position('''prompt''' in v_def) = 0 or position('''enforce''' in v_def) = 0 then
    raise exception '#1008 tail: the mode vocabulary is not closed at prompt|enforce -- got {%}', v_def
      using errcode='CLR10';
  end if;
  foreach r in array array['t_legal_enforcement_no_delete','t_legal_enforcement_no_truncate'] loop
    if not exists (select 1 from pg_trigger t
                    where t.tgrelid='clara.legal_enforcement'::regclass and t.tgname=r
                      and not t.tgisinternal) then
      raise exception '#1008 tail: % is not armed -- a missing configuration row is an unanswerable question', r
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.2) THE TWO NEW DOORS: exactly one pg_proc row each, clara_fn_owner, SECURITY DEFINER,
  --       pinned search_path, and the EXACT ACL TEXT -- grantor included, so a WITH GRANT OPTION
  --       or a PUBLIC grant cannot hide behind a has_function_privilege probe.
  for v_sig, v_want in
    select * from (values
      ('clara.set_legal_enforcement_mode(text,text,text)', 'set_legal_enforcement_mode'),
      ('clara.get_legal_enforcement_mode()',               'get_legal_enforcement_mode')
    ) as t(sig, nm)
  loop
    if to_regprocedure(v_sig) is null then
      raise exception '#1008 tail: % does not resolve', v_sig using errcode='CLR10';
    end if;
    select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
     where ns.nspname='clara' and p.proname = v_want;
    if v_n <> 1 then
      raise exception '#1008 tail: % overloads named clara.% exist (want exactly 1)', v_n, v_want
        using errcode='CLR10';
    end if;
    select pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
           || coalesce(array_to_string(p.proconfig,','),'<none>') || ' | '
           || coalesce(array_to_string(p.proacl,','),'<null>')
      into v_posture from pg_proc p where p.oid = to_regprocedure(v_sig);
    if v_posture is distinct from
       'clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner' then
      raise exception '#1008 tail: % has the wrong posture -- got {%}', v_sig, v_posture using errcode='CLR10';
    end if;
    foreach r in array array['clara_runtime','clara_agent_ro','clara_wake_interactive','clara_wake_proactive'] loop
      if to_regrole(r) is not null and has_function_privilege(r, v_sig, 'EXECUTE') then
        raise exception '#1008 tail: % can EXECUTE % -- only clara_authenticated may', r, v_sig using errcode='CLR10';
      end if;
    end loop;
    if to_regrole('anon') is not null and has_function_privilege('anon', v_sig, 'EXECUTE') then
      raise exception '#1008 tail: an anon role can EXECUTE %', v_sig using errcode='CLR10';
    end if;
    -- BOTH DOORS CARRY THE OPERATOR PREDICATE, read from their own text. The rank floor alone
    -- would hand the estate's switch to every firm owner in it.
    select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure(v_sig);
    if position('clara.role_rank(''owner'')' in v_src) = 0
       or position('f.id = clara.jwt_firm() and f.is_operator' in v_src) = 0
       or position('not_operator_firm' in v_src) = 0 then
      raise exception '#1008 tail: % does not carry clara.set_admission_capacity''s operator-firm predicate', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.3) THE PREDICATE IS GRANTED TO NOBODY, and the read door takes its mode FROM it.
  select coalesce(array_to_string(p.proacl,','),'<null>') into v_posture
    from pg_proc p where p.oid='clara._legal_enforcement_mode()'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner=X/clara_fn_owner' then
    raise exception '#1008 tail: clara._legal_enforcement_mode''s ACL is {%} -- it must be the owner alone', v_posture
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_legal_enforcement_mode()'::regprocedure;
  if position('clara._legal_enforcement_mode()' in v_src) = 0 then
    raise exception '#1008 tail: the operator read does not take its mode from the one body every wall reads'
      using errcode='CLR10';
  end if;

  -- (T.4) THE WALL. It answers the mode, it still refuses with the ONE negative, it still carries
  --       0195's enforce arm verbatim, and it is STILL ungranted and still arity 2.
  select p.prosrc into v_src from pg_proc p where p.oid='clara._accounting_work_egress_live(uuid,uuid)'::regprocedure;
  if encode(sha256(convert_to(v_src,'UTF8')),'hex')
     = '53f690091c24bb82ec529d5cb818647374d0181ed609777155d2f9eae87596a0' then
    raise exception '#1008 tail: clara._accounting_work_egress_live still hashes to its PRE-IMAGE -- the recut did not apply'
      using errcode='CLR10';
  end if;
  if position('clara._legal_enforcement_mode()' in v_src) = 0 then
    raise exception '#1008 tail: the derived basis does not consult the enforcement mode' using errcode='CLR10';
  end if;
  foreach r in array array[
    'where d.kind=''terms'' and d.status=''published''',
    'where d.kind=''dpa''   and d.status=''published''',
    'on ta.user_id=m.user_id and ta.kind=''terms'' and ta.version=v_terms',
    'on da.user_id=m.user_id and da.kind=''dpa'' and da.version=v_dpa',
    'where m.firm_id=p_firm and m.status=''active'' and m.role=''owner''']
  loop
    if position(r in v_src) = 0 then
      raise exception '#1008 tail: 0195''s enforce arm lost its own predicate {%} -- enforce must be TODAY''S rule, unchanged', r
        using errcode='CLR10';
    end if;
  end loop;
  -- THE PROMPT ARM CAN NEVER ANSWER LIVE WITH NOTHING TO CITE.
  if position('if v_basis is null then return jsonb_build_object(''live'',false); end if;' in v_src) = 0 then
    raise exception '#1008 tail: the prompt arm has no guard against answering live with no acceptance to cite'
      using errcode='CLR10';
  end if;
  select coalesce(array_to_string(p.proacl,','),'<null>') into v_posture
    from pg_proc p where p.oid='clara._accounting_work_egress_live(uuid,uuid)'::regprocedure;
  if v_posture is distinct from 'clara_fn_owner=X/clara_fn_owner' then
    raise exception '#1008 tail: clara._accounting_work_egress_live''s ACL MOVED -- got {%}', v_posture
      using errcode='CLR10';
  end if;
  select p.pronargs::int into v_n from pg_proc p where p.oid='clara._accounting_work_egress_live(uuid,uuid)'::regprocedure;
  if v_n <> 2 then
    raise exception '#1008 tail: the derived basis takes % arguments (want 2)', v_n using errcode='CLR10';
  end if;

  -- (T.5) THE THREE SPLICED BODIES: each moved off its pre-image, each cites basis_acceptance, and
  --       each kept the ACL `create or replace` preserves. The byte-for-byte "nothing else moved"
  --       proof is asserted inside §C/§D/§E, against the body each one had just written.
  for v_sig, v_want in
    select * from (values
      ('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)',
       'clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner'),
      ('clara.restore_client_egress_purpose(uuid,text,text)',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner'),
      ('clara.get_firm_legal_standing()',
       'clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner')
    ) as t(sig, acl)
  loop
    select coalesce(array_to_string(p.proacl,','),'<null>') into v_posture
      from pg_proc p where p.oid = to_regprocedure(v_sig);
    if v_posture is distinct from v_want then
      raise exception '#1008 tail: %''s ACL MOVED -- got {%}, want {%}', v_sig, v_posture, v_want
        using errcode='CLR10';
    end if;
  end loop;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)'::regprocedure;
  if position('(v_live->>''basis_acceptance'')::uuid' in v_src) = 0 then
    raise exception '#1008 tail: the mint arm does not cite basis_acceptance' using errcode='CLR10';
  end if;
  if position('''legal_acceptance'',(v_live->>''dpa_acceptance'')' in v_src) <> 0
     or position('''legal_acceptance_id'',(v_live->>''dpa_acceptance'')' in v_src) <> 0 then
    raise exception '#1008 tail: the mint arm still files the DPA acceptance under the kind-neutral citation key'
      using errcode='CLR10';
  end if;
  -- the mint guard that makes an owner's revoke STICK is untouched.
  if position('not exists (select 1 from clara.client_egress_purpose_consents' in v_src) = 0 then
    raise exception '#1008 tail: the once-per-client mint guard is gone from prepare_egress_dispatch'
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.restore_client_egress_purpose(uuid,text,text)'::regprocedure;
  if position('derived_basis_not_live' in v_src) = 0 then
    raise exception '#1008 tail: the restore door lost its CLR28 derived_basis_not_live refusal'
      using errcode='CLR10';
  end if;
  if position('(v_live->>''basis_acceptance'')::uuid' in v_src) = 0 then
    raise exception '#1008 tail: the restore door does not cite basis_acceptance' using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid='clara.get_firm_legal_standing()'::regprocedure;
  if position('''enforcement_mode'', clara._legal_enforcement_mode()' in v_src) = 0 then
    raise exception '#1008 tail: the standing read does not report the enforcement mode' using errcode='CLR10';
  end if;
  if position('''standing_live'', v_owner is not null' in v_src) = 0 then
    raise exception '#1008 tail: the standing read''s own standing_live fact MOVED' using errcode='CLR10';
  end if;
  select p.pronargs::int into v_n from pg_proc p where p.oid='clara.get_firm_legal_standing()'::regprocedure;
  if v_n <> 0 then
    raise exception '#1008 tail: get_firm_legal_standing takes % argument(s) -- arity 0 forever (0233 §C)', v_n
      using errcode='CLR10';
  end if;

  -- (T.6) THE TWO NON-REGRESSION PINS, RE-READ AFTER THE FILE APPLIED. §0 said "found here"; this
  --       says "left here". consume_egress_dispatch in particular: 0195 refused to recut it and so
  --       does this file.
  for v_sig, v_want in
    select * from (values
      ('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)',
       'f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3'),
      ('clara.set_admission_capacity(integer,text,text)',
       '190d0fe847c2ab24eb6a257c68e2478f10c5df857f96e085846f6b43243a7c86')
    ) as t(sig, sha)
  loop
    if (select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') from pg_proc p where p.oid = to_regprocedure(v_sig))
       is distinct from v_want then
      raise exception '#1008 tail: % MOVED while this file applied', v_sig using errcode='CLR10';
    end if;
  end loop;

  -- (T.7) 0195's EVIDENCE CHECK IS UNTOUCHED, in both directions. This file makes the mint's
  --       citation TRUE; it does not relax the rule that one must exist.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='clara.client_egress_purpose_consents'::regclass
     and c.conname='ck_client_egress_purpose_consents_evidence';
  if v_def is null or position('legal_acceptance_id IS NOT NULL' in v_def) = 0 then
    raise exception '#1008 tail: ck_client_egress_purpose_consents_evidence MOVED -- got {%}', v_def
      using errcode='CLR10';
  end if;

  -- (T.8) THIS FILE DID NOT BECOME A SECOND ACCEPTANCE WRITER. §0 measured one; there must still
  --       be exactly one, and it must be the human door.
  select count(*)::int into v_n from pg_proc p
   where p.pronamespace='clara'::regnamespace
     and p.prosrc like '%insert into clara.legal_acceptances%'
     and p.proname <> 'accept_legal_document';
  if v_n <> 0 then
    raise exception '#1008 tail: % body/bodies besides clara.accept_legal_document now insert a legal acceptance -- the system never creates an acceptance on a person''s behalf', v_n
      using errcode='CLR10';
  end if;

  raise notice '#1008 tail: OK -- clara.legal_enforcement is a one-row, FORCE-RLS, application-role-privilege-free singleton at mode=prompt with a two-value CHECK and the no-delete/no-truncate pair; clara.set_legal_enforcement_mode(text,text,text) and clara.get_legal_enforcement_mode() are clara_fn_owner-owned SECURITY DEFINER doors with search_path and plan_cache_mode pinned, an ACL of exactly {clara_fn_owner, clara_authenticated} and clara.set_admission_capacity''s operator-firm predicate in both bodies; clara._legal_enforcement_mode() is granted to nobody and is the body the operator read takes its mode from; clara._accounting_work_egress_live consults it, keeps 0195''s enforce arm predicate for predicate, cannot answer live with nothing to cite, and is still ungranted at arity 2; prepare_egress_dispatch''s mint arm and restore_client_egress_purpose now cite basis_acceptance with their ACLs and their once-per-client mint guard and CLR28 refusal intact; get_firm_legal_standing reports enforcement_mode with standing_live and arity 0 unmoved; consume_egress_dispatch and set_admission_capacity hash exactly as the prestate found them; 0195''s evidence CHECK still requires a legal acceptance for accounting_work; and clara.accept_legal_document is STILL the only body in the estate that inserts one.';
end
$w1008_tail$;
