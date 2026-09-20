-- 0272_document_capability_wall_completion — #846 FIX ROUND: THE THREE ROUTES 0244 LEFT OPEN,
-- and #782 FIX ROUND: the registry's own column documentation stops calling line items planned.
-- =====================================================================================
-- WHY A NEW FILE AND NOT AN EDIT OF 0244/0245. Both are unmerged and both COULD be edited under
-- the wave-2 rule, but the supported re-apply path (packages/db/README.md, "Redo (#957)") refuses
-- any version that is not the HIGHEST applied one — "redoing anything below the frontier would
-- silently invalidate whatever was applied on top of it" — and 0245 and 0246 sit on top of 0244
-- on every lane database. Editing 0244 in place would therefore mean the hand procedure #957
-- exists to abolish. A successor file is also what BOTH review axes prescribed for these
-- findings. Its number is deliberately ABOVE the wave-2 reservation (0235…0271, all of which
-- belong to a named ticket in another lane); nothing in the estate depends on it, so renumbering
-- at integration is free.
--
-- WHAT 0244 CLOSED AND WHAT IT DID NOT. 0244 made `clara.document_capabilities.registry_version`
-- un-undercuttable by DELETE-then-INSERT: a high-water relation remembers what each
-- (format, document_kind) has ever published, a BEFORE INSERT wall reads it, and the mark itself
-- is append-only against DELETE and against a lowering, re-keying or birth-moving UPDATE. Its
-- header, packages/db/README.md and CONTEXT.md all then stated the invariant as an ABSOLUTE —
-- "a version once published for a pair can never be undercut BY ANY ROUTE". Three routes were
-- driven afterwards, as `clara_fn_owner` (the role every migration runs as, and the only writer
-- either table has), each measured inside a rolled-back transaction on the lane database:
--
--   1. TRUNCATE of the mark ledger. `clara._tf_document_capability_high_water_monotone` is a
--      BEFORE UPDATE OR DELETE **row** trigger, and PostgreSQL fires no row-level trigger on
--      TRUNCATE. Measured: 240 marks -> 0 with no refusal, after which deleting pdf x invoice
--      and re-inserting it BELOW its published version was ADMITTED. #846's reproducer, in two
--      statements. (§B.1)
--   2. A RE-KEYING UPDATE of the registry. The high-water wall was INSERT-side only, and the
--      registry's only BEFORE UPDATE wall (0207's) compares nothing but the version. Measured:
--      publish a never-seen pair at version 1 (admitted — it has no mark), then
--      `update … set format='pdf', document_kind='invoice'`; the pair read version 1 while its
--      mark still read 3, and the deferred uniformity wall passed it. (§B.2, which also records
--      why the wall is a SECOND trigger with a key-change WHEN clause rather than a wider event
--      list on 0244's.)
--   3. `recorded_at` on the mark. 0244 comments the column "Moves only upward with
--      registry_version" and walls first_seen_at, the key and the version — but not this column.
--      Measured: rewritten to 1999-01-01 with no refusal. A column comment is a claim; this file
--      makes it one the wall backs. (§B.3)
--
-- #782's RESIDUAL, in the same file for one reason. 0245 moved the 28 invoice-family rows'
-- `limits.invoice_line_items` from `planned` to `accepted_limitation` but issued no
-- `comment on column`, so `col_description(clara.document_capabilities.limits)` still read
-- 0191's text — "per-LINE facts are an accepted target with no table yet" — which is the registry's
-- OWN machine-readable documentation of the very key 0245 re-seeded, still calling it planned.
-- #782's AC2 is "no 'planned' or 'coming' wording for line items remains in the registry seed, the
-- web copy or the PRD". §B.4 re-issues that comment, and the tail proves the comment and the rows
-- agree. It rides THIS file rather than a fifth
-- migration because it is a fix round, not a ticket: one file, two clearly separated sections, one
-- prestate and one tail, rather than a second round of migration ceremony for one comment.
--
-- WHY `clara._tf_no_truncate()` AND NOT A #846-SHAPED TWIN. The estate has had exactly one
-- truncate guard since 0003 (`clara._tf_no_truncate`, raising CLR08 '% cannot be truncated'), and
-- it is installed on every other append-only relation there is — audit_log, journal_entries,
-- journal_lines (0003), domain_events, taxonomy_versions, wake_intents, relay_dead_letters
-- (0005), the runtime spine (0006) and the document pipeline (0007). Minting a second spelling of
-- "this relation cannot be truncated" is exactly what 0244's own header refused to do with 0207's
-- CLR08 / detail shape. The cost is named honestly: the TRUNCATE refusal carries NO
-- `detail.reason`, because the estate's single guard carries none — a caller classifies it by
-- code and by the relation the message names. Nothing catches it: TRUNCATE on this ledger is only
-- ever a migration's mistake.
--
-- REDO-SAFE BY CONSTRUCTION (wave-2 rule; packages/db/README.md "Redo (#957)"): `drop trigger if
-- exists` before each `create trigger`, `create or replace function`, and a `comment on` that is
-- idempotent by nature. Nothing here inserts, deletes or re-keys a row of either table.
--
-- WHAT DOES NOT CHANGE: the four capability axes and their closed sets, every seeded verdict,
-- `registry_version` on any row (it stays where 0245 published it), 0191's two policies and its
-- grants, 0207's wall body, and the output of `clara._document_capability(text,text)` /
-- `clara.get_document_state(uuid,uuid)`. No application role gains anything: this file installs
-- two triggers (one on an ungranted ledger, one on the registry, both on bodies that already
-- exist), recuts one ungranted trigger body and re-issues two comments. It mints NO new FUNCTION,
-- so no rig-meta cohort moves: `cohortFailures` rosters names, and every name here is already in
-- #846's own cohort or in 0003's.
-- =====================================================================================

set local statement_timeout = '5min';   -- runner rule: statement_timeout is the first executable statement
set local lock_timeout = '5s';

-- =====================================================================================
-- §A  PRESTATE. Everything this file builds on, measured on the lane database, never transcribed.
-- =====================================================================================
do $w846fix_pre$
declare
  v_n int; v_def text; v_sha text; v_role text; v_redo boolean;
begin
  foreach v_role in array array['clara_fn_owner','clara_authenticated','clara_agent_ro'] loop
    if not exists (select 1 from pg_roles where rolname = v_role) then
      raise exception '#846 fix prestate: role % is missing', v_role using errcode = 'CLR10';
    end if;
  end loop;

  -- (a) BOTH SUBJECTS, keyed the way this file assumes they are keyed.
  foreach v_role in array array['clara.document_capabilities','clara.document_capability_version_high_water'] loop
    if to_regclass(v_role) is null then
      raise exception '#846 fix prestate: % is absent -- 0191 and 0244 must apply first', v_role
        using errcode = 'CLR10';
    end if;
    select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
     where c.conrelid = v_role::regclass and c.contype = 'p';
    if v_def is null or v_def not ilike '%(format, document_kind)%' then
      raise exception '#846 fix prestate: % is no longer primary-keyed on (format, document_kind) -- got %', v_role, coalesce(v_def, '<none>')
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (b) THE FIVE WALL BODIES THIS FILE STANDS BESIDE, pinned by sha256(prosrc) MEASURED on the
  -- lane database with 0244/0245/0246 applied — the wave-2 rule's "pin what is live", because a
  -- ticket of this same lane cut them three commits ago.
  foreach v_def in array array[
    '_tf_document_capabilities_version_monotone()=170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56',
    '_tf_document_capabilities_version_high_water()=b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9',
    '_tf_document_capabilities_high_water_record()=839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d',
    '_tf_document_capabilities_version_uniform()=d21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776'] loop
    if to_regprocedure('clara.' || split_part(v_def, '=', 1)) is null then
      raise exception '#846 fix prestate: clara.% is absent -- 0207/0244 must apply first', split_part(v_def, '=', 1)
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
     where p.oid = ('clara.' || split_part(v_def, '=', 1))::regprocedure;
    if v_sha <> split_part(v_def, '=', 2) then
      raise exception '#846 fix prestate: clara.% body drifted (sha %)', split_part(v_def, '=', 1), v_sha
        using errcode = 'CLR10';
    end if;
  end loop;

  -- (b2) THE ONE BODY THIS FILE RECUTS (§B.3). Its pin is TWO-VALUED by construction, which is
  -- what redo-safety means for a `create or replace`: 0244's pre-image on a FIRST apply, this
  -- file's own post-image on a REDO. Both measured on the lane database, never transcribed, and
  -- anything else is drift.
  if to_regprocedure('clara._tf_document_capability_high_water_monotone()') is null then
    raise exception '#846 fix prestate: clara._tf_document_capability_high_water_monotone is absent -- 0244 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure;
  if v_sha not in (
      '196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27',   -- 0244's pre-image
      '62e83a3b249ca1d0186041ac36c6f77615f3631b04d96eb57fc16f010974ec8c') then                                          -- 0272's own post-image
    raise exception '#846 fix prestate: clara._tf_document_capability_high_water_monotone body is neither 0244''s pre-image nor this file''s post-image (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- (c) THE ESTATE'S SINGLE TRUNCATE GUARD, the body §B.1 arms rather than re-spelling. Pinned
  -- the same way: a recut body would mean the refusal this file installs is no longer the one it
  -- was written beside.
  if to_regprocedure('clara._tf_no_truncate()') is null then
    raise exception '#846 fix prestate: clara._tf_no_truncate is absent -- 0003 must apply first'
      using errcode = 'CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._tf_no_truncate()'::regprocedure;
  if v_sha <> 'e64ba9f6b93ba56d2752b095bae361dc4a3f0baf63e841e7c81f1b631c68eea8' then
    raise exception '#846 fix prestate: clara._tf_no_truncate body drifted (sha %)', v_sha
      using errcode = 'CLR10';
  end if;

  -- (d) THE REGISTRY IS WHERE 0245 LEFT IT. This file moves no row and raises no version, so a
  -- registry that is not already uniform would mean something else moved it first.
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#846 fix prestate: the registry publishes % distinct versions, not one', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n
    from clara.document_capabilities c
    left join clara.document_capability_version_high_water h
      on h.format = c.format and h.document_kind = c.document_kind
   where h.format is null or h.registry_version < c.registry_version;
  if v_n <> 0 then
    raise exception '#846 fix prestate: % published pair(s) carry no high-water mark at or above their version', v_n
      using errcode = 'CLR10';
  end if;

  -- (e) FIRST or REDO, said out loud rather than refused. Every object below is idempotent DDL.
  v_redo := exists (select 1 from pg_trigger t
                     where t.tgrelid = 'clara.document_capability_version_high_water'::regclass
                       and t.tgname = 't_document_capability_high_water_no_truncate'
                       and not t.tgisinternal);
  raise notice '#846 fix prestate: OK -- % apply. Registry uniform, every pair marked at or above its version, 0207/0244''s five wall bodies and 0003''s clara._tf_no_truncate at their pinned pre-images.',
    case when v_redo then 'REDO' else 'FIRST' end;
end
$w846fix_pre$;

-- =====================================================================================
-- §B.1  ROUTE 1 — TRUNCATE. A row trigger does not fire on TRUNCATE, so an append-only ledger
-- guarded only by a BEFORE UPDATE OR DELETE **row** trigger can be emptied in one statement by
-- the very role its wall exists to constrain. The estate's answer to that, on every other
-- append-only relation it has, is a BEFORE TRUNCATE **statement** trigger running
-- clara._tf_no_truncate (0003:439-443). This arms the same one.
-- =====================================================================================
set role clara_fn_owner;

drop trigger if exists t_document_capability_high_water_no_truncate on clara.document_capability_version_high_water;
create trigger t_document_capability_high_water_no_truncate
  before truncate on clara.document_capability_version_high_water
  for each statement execute function clara._tf_no_truncate();

reset role;

-- =====================================================================================
-- §B.2  ROUTE 2 — A RE-KEYING UPDATE. The high-water wall was armed BEFORE INSERT only, on the
-- reasoning that "a deleted-then-reinserted row is a first publication to the database". So it
-- is — but so is a row whose (format, document_kind) is UPDATED onto another pair's key, and
-- that route never passes through an INSERT. The registry's only BEFORE UPDATE wall is 0207's,
-- whose body compares nothing but the version (`new.registry_version < old.registry_version`)
-- and never the key, so a row born lawfully at a low version under a never-seen key can be moved
-- onto a published pair and land BELOW that pair's mark.
--
-- 0244 SAW THE SHAPE AND WALLED THE WRONG TABLE. Its §B.3 reasons that "RE-KEYING IS A DELETE IN
-- DISGUISE" and refuses a re-key of the MARK; the registry's own key was left unguarded.
--
-- A SECOND TRIGGER ON THE SAME BODY, NOT A WIDER EVENT LIST ON THE FIRST. The obvious cut —
-- re-arm `t_document_capabilities_version_high_water` as BEFORE INSERT OR UPDATE — was written,
-- applied and MEASURED to be wrong: PostgreSQL fires BEFORE ROW triggers in trigger-NAME order,
-- `…_version_high_water` sorts before `…_version_monotone`, and an ordinary in-place LOWERING
-- update then came back as CLR08 / `registry_version_high_water` instead of 0207's
-- `registry_version_monotone`. document-capability-registry.test.mjs caught it on the next run.
-- Re-labelling a refusal a caller already classifies is a breaking change this fix round has no
-- mandate for, so the widening is confined to the case that is actually new:
--
--   `when (new.format is distinct from old.format or new.document_kind is distinct from
--    old.document_kind)` — a genuine RE-KEY, and nothing else. An in-place UPDATE never reaches
--   this wall and 0207 keeps its whole subject. (The WHEN clause has to live on its own trigger:
--   a combined INSERT OR UPDATE trigger may not reference OLD at all.)
--
-- THE BODY IS BYTE-UNCHANGED. `clara._tf_document_capabilities_version_high_water` already reads
-- the mark for `new.format` / `new.document_kind` and has no opinion about `old`, so on a re-key
-- it asks exactly the right question of exactly the right key — the destination. Its sha is
-- pinned in §A and re-read in the tail; only its comment moves, to say it is now armed twice.
--
-- WHAT THIS DOES NOT REFUSE, deliberately: an ordinary raise or an unchanged version (the WHEN
-- clause is false), and a re-key ONTO a never-published pair, which is a first publication and
-- mints its own mark through the AFTER writer. A lowering UPDATE in place was, and stays, 0207's.
-- =====================================================================================
set role clara_fn_owner;

comment on function clara._tf_document_capabilities_version_high_water() is
  'BEFORE row wall on clara.document_capabilities (#846), armed TWICE since 0272: on INSERT (t_document_capabilities_version_high_water, 0244) and on a key-changing UPDATE (t_document_capabilities_version_high_water_rekey, 0272). A row may not LAND below the high-water mark clara.document_capability_version_high_water holds for the (format, document_kind) it is landing ON. The body reads `new` and has no opinion about `old`, so one body answers both halves: an INSERT after a DELETE (0207''s first residual) and an UPDATE that RE-KEYS a row onto another pair (the route 0244 walled on the mark table but not on the registry). A pair with no mark has never been published and is admitted. An in-place UPDATE is NOT this wall''s subject -- it stays clara._tf_document_capabilities_version_monotone''s (0207). Raises CLR08 with detail.reason = registry_version_high_water, the same code family and detail shape clara._tf_document_capabilities_version_monotone (0207) and clara._tf_accounting_plans_immutable (0193) raise.';

-- REDO REPAIR, and a no-op on a first apply. An earlier cut of this file re-armed 0244's own
-- trigger as BEFORE INSERT OR UPDATE; a database that already carries that cut must come back to
-- the shape 0244 declares, or the tail below (rightly) refuses. `drop … if exists` + `create`
-- with 0244's exact spelling is idempotent from either starting point.
drop trigger if exists t_document_capabilities_version_high_water on clara.document_capabilities;
create trigger t_document_capabilities_version_high_water
  before insert on clara.document_capabilities
  for each row execute function clara._tf_document_capabilities_version_high_water();

drop trigger if exists t_document_capabilities_version_high_water_rekey on clara.document_capabilities;
create trigger t_document_capabilities_version_high_water_rekey
  before update on clara.document_capabilities
  for each row
  when (new.format is distinct from old.format or new.document_kind is distinct from old.document_kind)
  execute function clara._tf_document_capabilities_version_high_water();

reset role;

-- =====================================================================================
-- §B.3  ROUTE 3 — `recorded_at`. 0244 comments the column "Moves only upward with
-- registry_version" and walls the key, `first_seen_at` and the version, but `recorded_at` is not
-- in the case expression at all. Measured: rewritten to 1999-01-01 with no refusal. The mark's
-- INTEGRITY does not depend on it — that is why this is the small one of the three — but a
-- column comment is a checkable claim, and an estate whose comments are only sometimes backed by
-- a wall teaches the next reader to check every one of them by hand.
--
-- STRICTLY `<`, and no concurrency hazard. The writer stamps `recorded_at = now()`, which is
-- transaction-start time and therefore CONSTANT inside one transaction, so a transaction that
-- raises the same mark twice writes the same instant and is admitted (equal is not less). Two
-- transactions cannot race here: any two writers of this ledger are republishing the registry,
-- and the deferred uniformity wall (0244 §B.4) already refuses the second of them.
--
-- The rest of the body is byte-for-byte 0244's: same code, same detail shape, same DELETE arm,
-- same ordering of the case arms with the new one LAST, so an update that moves both the version
-- and recorded_at backwards still reports `registry_version` — the more serious fact — first.
-- =====================================================================================
set role clara_fn_owner;

create or replace function clara._tf_document_capability_high_water_monotone() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $fn$
declare v_what text;
begin
  if tg_op = 'DELETE' then
    raise exception 'a capability registry_version high-water mark is never deleted (% x %: %)',
      old.format, old.document_kind, old.registry_version
      using errcode = 'CLR08',
        detail = jsonb_build_object(
          'reason', 'registry_version_high_water_append_only',
          'column', 'registry_version',
          'operation', 'DELETE',
          'format', old.format,
          'document_kind', old.document_kind,
          'from', old.registry_version,
          'to', null)::text;
  end if;

  v_what := case
    when new.format <> old.format or new.document_kind <> old.document_kind then 'key'
    when new.first_seen_at <> old.first_seen_at then 'first_seen_at'
    when new.registry_version < old.registry_version then 'registry_version'
    when new.recorded_at < old.recorded_at then 'recorded_at'
    else null end;

  if v_what is not null then
    raise exception 'a capability registry_version high-water mark only ever rises (% x %: % changed, % -> %)',
      old.format, old.document_kind, v_what, old.registry_version, new.registry_version
      using errcode = 'CLR08',
        detail = jsonb_build_object(
          'reason', 'registry_version_high_water_append_only',
          'column', v_what,
          'operation', 'UPDATE',
          'format', old.format,
          'document_kind', old.document_kind,
          'from', old.registry_version,
          'to', new.registry_version)::text;
  end if;
  return new;
end
$fn$;
revoke all on function clara._tf_document_capability_high_water_monotone() from public;
comment on function clara._tf_document_capability_high_water_monotone() is
  'BEFORE UPDATE OR DELETE row wall on clara.document_capability_version_high_water (#846): the mark is append-only. A DELETE is refused outright, and an UPDATE is refused when it lowers registry_version, re-keys the row, moves first_seen_at or moves recorded_at BACKWARDS (0272 -- 0244 commented that last column as only ever moving upward without walling it); a RAISE is admitted, because that is the writer''s ordinary act. Raises CLR08 with detail.reason = registry_version_high_water_append_only plus the operation and the column that moved. Without this wall the INSERT-side wall would have a door beside it: delete the mark, re-insert low. TRUNCATE is refused separately, by t_document_capability_high_water_no_truncate (0272), because no row trigger fires on TRUNCATE.';

reset role;

-- =====================================================================================
-- §B.4  #782's RESIDUAL — the registry's OWN documentation of `limits`. 0245 moved the 28
-- invoice-family rows from `{"invoice_line_items":"planned"}` to
-- `{"invoice_line_items":"accepted_limitation","invoice_line_items_reason":
-- "no_consumer_reads_line_facts"}` and issued no `comment on column`, so
-- `col_description(clara.document_capabilities.limits)` still carried 0191's sentence — "per-LINE
-- facts are an accepted target with no table yet" — about the very key 0245 re-seeded. #782's AC2
-- is that no "planned" or "coming" wording for line items remains in the registry seed; a column
-- comment IS the registry's machine-readable seed documentation, and it is the one surface a
-- later reader consults from inside the database.
--
-- 0191 IS NOT EDITED. The house fix is a re-issued comment from a successor file, which is
-- exactly what this lane's own 0246 already did for `business_operation` (0246 §B, re-issuing
-- 0191's column comment without touching 0191).
--
-- WHY THE REASON KEY IS NAMED IN THE COMMENT. A limitation with no reason is a verdict; the
-- reason is what makes it arguable. `no_consumer_reads_line_facts` is a structural fact about
-- the schema Clara posts through — packages/runtime/lib/trade-invoice-basis.ts's tool schemas are
-- `.strict()` and admit no `line_items` field — not a scheduling note, and the comment says so.
-- =====================================================================================
set role clara_fn_owner;

comment on column clara.document_capabilities.limits is
  'Named, machine-readable limitations of a level that is otherwise supported, as `{"<limit>": "<value>"}` with an optional `"<limit>_reason"` sibling. The invoice family carries `{"invoice_line_items": "accepted_limitation", "invoice_line_items_reason": "no_consumer_reads_line_facts"}` (#782, owner ruling 2026-09-18): invoice HEADER facts are persisted with their source regions and drive the questionnaire, the autodraft and the posting; per-LINE facts are a standing, accepted limitation of what Clara reads, not a deferred feature. The reason is structural rather than a schedule -- nothing Clara posts through admits a per-line invoice field, so there is no consumer for such a fact. A limit is not a lower level -- the header facts are real -- but a surface that rendered "facts: validated" without it would overstate what was read.';

reset role;

-- =====================================================================================
-- §D  TAIL. The wall is present, it is at the right timing, and it actually refuses.
-- =====================================================================================
do $w846fix_tail$
declare
  v_n int; v_def text; v_marks int; v_detail text; v_reason jsonb; v_published int;
  r clara.document_capabilities%rowtype;
begin
  -- (0) THE ONE RECUT BODY LANDED, at the post-image this file's own prestate names on a redo.
  -- A `create or replace` that silently did nothing would pass every behavioural probe below on
  -- a database that already carried an earlier cut.
  if encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capability_high_water_monotone()'::regprocedure), 'UTF8')), 'hex')
     <> '62e83a3b249ca1d0186041ac36c6f77615f3631b04d96eb57fc16f010974ec8c' then
    raise exception '#846 fix tail: clara._tf_document_capability_high_water_monotone is not at this file''s post-image'
      using errcode = 'CLR10';
  end if;

  -- (1) THE TRIGGER, at the ONE timing that sees a TRUNCATE.
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capability_version_high_water'::regclass
     and t.tgname = 't_document_capability_high_water_no_truncate' and not t.tgisinternal;
  if v_def is null or v_def !~* 'BEFORE TRUNCATE' or v_def !~* 'FOR EACH STATEMENT'
     or v_def !~* '_tf_no_truncate' then
    raise exception '#846 fix tail: the mark ledger''s truncate wall is not a BEFORE TRUNCATE FOR EACH STATEMENT trigger on clara._tf_no_truncate -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;

  -- (2) IT ACTUALLY REFUSES. Structural presence is not enforcement. Rolled back whole through
  -- the estate's in-migration sentinel idiom (0016 D-P1's shape, 0244 §D(6)'s usage).
  select count(*)::int into v_marks from clara.document_capability_version_high_water;
  if v_marks = 0 then
    raise exception '#846 fix tail: the mark ledger is empty, so a TRUNCATE probe would prove nothing'
      using errcode = 'CLR10';
  end if;
  begin
    begin
      truncate clara.document_capability_version_high_water;
      raise exception '#846 fix tail: TRUNCATE of the mark ledger was ACCEPTED -- the wall is installed but does not enforce'
        using errcode = 'CLR10';
    exception when sqlstate 'CLR08' then null;
    end;
    raise exception '#846 fix truncate probe rollback' using errcode = 'ZA272';
  exception when sqlstate 'ZA272' then null;
  end;

  -- (3) THE HIGH-WATER WALL IS NOW ARMED TWICE, its body did not move to get there, and 0244's
  -- own INSERT arming is untouched.
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capabilities'::regclass
     and t.tgname = 't_document_capabilities_version_high_water' and not t.tgisinternal;
  if v_def is null or v_def !~* 'BEFORE INSERT' or v_def ~* 'UPDATE' or v_def !~* 'FOR EACH ROW'
     or v_def ~* '\mWHEN\M' then
    raise exception '#846 fix tail: 0244''s INSERT arming is no longer an unconditional BEFORE INSERT FOR EACH ROW trigger -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;
  select pg_get_triggerdef(t.oid) into v_def from pg_trigger t
   where t.tgrelid = 'clara.document_capabilities'::regclass
     and t.tgname = 't_document_capabilities_version_high_water_rekey' and not t.tgisinternal;
  if v_def is null or v_def !~* 'BEFORE UPDATE' or v_def !~* 'FOR EACH ROW'
     or v_def !~* 'WHEN' or v_def !~* 'format' or v_def !~* 'document_kind'
     or v_def !~* '_tf_document_capabilities_version_high_water' then
    raise exception '#846 fix tail: the re-key wall is not a BEFORE UPDATE FOR EACH ROW trigger gated on a change of (format, document_kind) -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;
  if encode(sha256(convert_to((select p.prosrc from pg_proc p
       where p.oid = 'clara._tf_document_capabilities_version_high_water()'::regprocedure), 'UTF8')), 'hex')
     <> 'b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9' then
    raise exception '#846 fix tail: the high-water wall''s BODY was modified -- this file arms it a second time, it does not recut it'
      using errcode = 'CLR10';
  end if;

  -- (4) IT ACTUALLY REFUSES A RE-KEY. The probe reproduces the exact route measured before this
  -- file was written, against the live registry, and is rolled back whole.
  select min(registry_version)::int into v_published from clara.document_capabilities;
  if v_published < 2 then
    raise exception '#846 fix tail: the registry publishes version %, too low for a probe that stays above the positivity CHECK', v_published
      using errcode = 'CLR10';
  end if;
  begin
    select * into r from clara.document_capabilities where format = 'pdf' and document_kind = 'invoice';
    if r.format is null then
      raise exception '#846 fix tail: the probe pair pdf x invoice is not in the registry' using errcode = 'CLR10';
    end if;
    delete from clara.document_capabilities where format = 'pdf' and document_kind = 'invoice';
    insert into clara.document_capabilities
      (format, document_kind, mime_type, custody, byte_extraction, typed_facts,
       business_operation, engine_id, engine_byte, registry_version, basis, limits)
    values ('probe846rekey', 'probe_kind', r.mime_type, r.custody, r.byte_extraction, r.typed_facts,
            r.business_operation, r.engine_id, r.engine_byte, r.registry_version - 1, r.basis, r.limits);
    begin
      update clara.document_capabilities set format = 'pdf', document_kind = 'invoice'
       where format = 'probe846rekey';
      raise exception '#846 fix tail: a RE-KEYING update republished pdf x invoice below its mark -- the wall is installed but does not see UPDATE'
        using errcode = 'CLR10';
    exception when sqlstate 'CLR08' then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_reason := nullif(v_detail, '')::jsonb;
      if coalesce(v_reason ->> 'reason', '') <> 'registry_version_high_water'
         or coalesce(v_reason ->> 'format', '') <> 'pdf'
         or coalesce(v_reason ->> 'document_kind', '') <> 'invoice'
         or coalesce((v_reason ->> 'from')::int, -1) <> r.registry_version then
        raise exception '#846 fix tail: the re-key refusal does not name the DESTINATION key and its mark (detail %)', coalesce(v_detail, '<null>')
          using errcode = 'CLR10';
      end if;
    end;
    raise exception '#846 fix rekey probe rollback' using errcode = 'ZA273';
  exception when sqlstate 'ZA273' then null;
  end;

  -- (5) …AND IT STILL ADMITS THE ONLY SHAPE A REPUBLICATION HAS EVER TAKEN. A wall that refused
  -- every UPDATE would pass (4) and break 0245's own raise, silently, on the next republish.
  begin
    update clara.document_capabilities set registry_version = registry_version + 1;
    select count(distinct registry_version)::int into v_n from clara.document_capabilities;
    if v_n <> 1 then
      raise exception '#846 fix tail: the whole-registry raise did not leave one version (got %)', v_n
        using errcode = 'CLR10';
    end if;
    raise exception '#846 fix raise probe rollback' using errcode = 'ZA274';
  exception when sqlstate 'ZA274' then null;
  end;

  -- (5b) 0207 KEEPS ITS OWN SUBJECT. An IN-PLACE lowering must still come back under 0207's
  -- reason, not under this file's: a caller that classifies by detail.reason would otherwise be
  -- broken by a fix round it never asked for. This is the regression the first cut of §B.2
  -- actually caused, so it is pinned here rather than left to the battery alone.
  begin
    begin
      update clara.document_capabilities set registry_version = registry_version - 1
       where format = 'pdf' and document_kind = 'invoice';
      raise exception '#846 fix tail: an in-place LOWERING update was ACCEPTED -- 0207''s wall no longer fires'
        using errcode = 'CLR10';
    exception when sqlstate 'CLR08' then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_reason := nullif(v_detail, '')::jsonb;
      if coalesce(v_reason ->> 'reason', '') <> 'registry_version_monotone' then
        raise exception '#846 fix tail: an in-place lowering now refuses under reason "%" rather than 0207''s registry_version_monotone -- this file re-labelled a refusal a caller already classifies', coalesce(v_reason ->> 'reason', '<none>')
          using errcode = 'CLR10';
      end if;
    end;
    raise exception '#846 fix monotone probe rollback' using errcode = 'ZA275';
  exception when sqlstate 'ZA275' then null;
  end;

  -- (5c) `recorded_at` NOW HAS A WALL BEHIND ITS COMMENT, and a forward stamp still passes.
  begin
    begin
      update clara.document_capability_version_high_water
         set recorded_at = timestamptz '1999-01-01 00:00:00+00'
       where format = 'pdf' and document_kind = 'invoice';
      raise exception '#846 fix tail: recorded_at was rewritten BACKWARDS -- the column comment is still a claim nothing backs'
        using errcode = 'CLR10';
    exception when sqlstate 'CLR08' then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_reason := nullif(v_detail, '')::jsonb;
      if coalesce(v_reason ->> 'reason', '') <> 'registry_version_high_water_append_only'
         or coalesce(v_reason ->> 'column', '') <> 'recorded_at' then
        raise exception '#846 fix tail: the backwards-recorded_at refusal does not name the column (detail %)', coalesce(v_detail, '<null>')
          using errcode = 'CLR10';
      end if;
    end;
    update clara.document_capability_version_high_water
       set registry_version = registry_version + 1, recorded_at = recorded_at + interval '1 second'
     where format = 'pdf' and document_kind = 'invoice';
    raise exception '#846 fix recorded_at probe rollback' using errcode = 'ZA276';
  exception when sqlstate 'ZA276' then null;
  end;

  -- (5d) #782 — THE COLUMN COMMENT MATCHES THE DATA IT DOCUMENTS. Asserted against the LIVE
  -- catalog rather than against this file's own text, and against the live rows as well: a
  -- comment that named a value no row carries would be a second way to be wrong.
  select col_description('clara.document_capabilities'::regclass, a.attnum) into v_def
    from pg_attribute a
   where a.attrelid = 'clara.document_capabilities'::regclass and a.attname = 'limits';
  if v_def is null or v_def ~* 'planned' or v_def ~* 'no table yet' or v_def ~* 'accepted target' then
    raise exception '#782 fix tail: the limits column comment still describes line items as planned or as a target -- got %', coalesce(v_def, '<none>')
      using errcode = 'CLR10';
  end if;
  if v_def !~ 'accepted_limitation' or v_def !~ 'invoice_line_items_reason' then
    raise exception '#782 fix tail: the limits column comment does not document the shape 0245 seeded -- got %', v_def
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities
   where limits ->> 'invoice_line_items' = 'accepted_limitation'
     and limits ->> 'invoice_line_items_reason' = 'no_consumer_reads_line_facts';
  if v_n <> 28 then
    raise exception '#782 fix tail: % invoice-family row(s) carry the accepted-limitation shape, not 0245''s 28', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capabilities where limits::text ~* 'planned';
  if v_n <> 0 then
    raise exception '#782 fix tail: % registry row(s) still publish a limit valued "planned"', v_n
      using errcode = 'CLR10';
  end if;

  -- (6) THE PROBES LEFT NOTHING BEHIND, in either table.
  select count(*)::int into v_n from clara.document_capability_version_high_water;
  if v_n <> v_marks then
    raise exception '#846 fix tail: a probe leaked -- % marks, was %', v_n, v_marks using errcode = 'CLR10';
  end if;
  select count(distinct registry_version)::int into v_n from clara.document_capabilities;
  if v_n <> 1 then
    raise exception '#846 fix tail: a probe leaked -- the registry publishes % distinct versions', v_n using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from clara.document_capability_version_high_water
   where registry_version <> v_published;
  if v_n <> 0 then
    raise exception '#846 fix tail: a probe leaked -- % mark(s) sit off the published version', v_n using errcode = 'CLR10';
  end if;

  raise notice '#846 fix tail: OK -- clara.document_capability_version_high_water refuses TRUNCATE with CLR08 through 0003''s clara._tf_no_truncate, and clara._tf_document_capabilities_version_high_water (body byte-unchanged at its pinned pre-image) is now armed a SECOND time as t_document_capabilities_version_high_water_rekey, a BEFORE UPDATE trigger gated on a change of (format, document_kind), so a re-key onto a published pair is refused with CLR08 / detail.reason = registry_version_high_water naming the DESTINATION key. clara._tf_document_capability_high_water_monotone is recut to refuse a BACKWARDS recorded_at as well, under the same reason and naming the column. All proven behaviourally against the live tables (% marks, registry at version %) and rolled back whole; the whole-registry raise is still admitted, a forward recorded_at stamp is still admitted, and an in-place lowering still refuses under 0207''s registry_version_monotone. #782: clara.document_capabilities.limits carries a re-issued column comment that documents the accepted-limitation shape (0191 unedited), and no registry row publishes a limit valued "planned".',
    v_marks, v_published;
end
$w846fix_tail$;
