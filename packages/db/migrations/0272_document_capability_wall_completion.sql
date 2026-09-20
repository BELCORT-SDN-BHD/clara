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
--      mark still read 3, and the deferred uniformity wall passed it. (§B.2)
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
-- web copy or the PRD". §B.4 re-issues that comment. It rides THIS file rather than a fifth
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
-- one trigger on an ungranted ledger, recuts one ungranted trigger body, re-arms one trigger's
-- event list and re-issues one column comment. It mints NO new name, so no rig-meta cohort moves.
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
    '_tf_document_capability_high_water_monotone()=196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27',
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
-- §D  TAIL. The wall is present, it is at the right timing, and it actually refuses.
-- =====================================================================================
do $w846fix_tail$
declare
  v_n int; v_def text; v_marks int;
begin
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

  -- (3) THE PROBE LEFT NOTHING BEHIND.
  select count(*)::int into v_n from clara.document_capability_version_high_water;
  if v_n <> v_marks then
    raise exception '#846 fix tail: the truncate probe leaked -- % marks, was %', v_n, v_marks using errcode = 'CLR10';
  end if;

  raise notice '#846 fix tail: OK -- clara.document_capability_version_high_water refuses TRUNCATE with CLR08 through 0003''s clara._tf_no_truncate, proven behaviourally against the live ledger (% marks) and rolled back whole.',
    v_marks;
end
$w846fix_tail$;
