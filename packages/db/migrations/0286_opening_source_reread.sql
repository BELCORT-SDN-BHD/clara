-- 0286_opening_source_reread — #986 (riders wave 3, lane 06): A RE-READ OPENING DOCUMENT BECOMES
-- RE-PARSABLE, WITHOUT WEAKENING THE GUARANTEE THAT AN UNCHANGED ONE IS NEVER PARSED TWICE.
-- =====================================================================================
-- Spec of record: issue #986's Agent Brief. Parent: #656 (its `656-final.md` residual R4 and
-- follow-up F4, and `656-fixround-1.md` A5, which measured this dead end and filed it rather than
-- closing it). Domain words: CONTEXT.md — "Opening basis", "Opening source", "Opening target",
-- and this file's new one, "Opening source refresh".
--
-- =====================================================================================
-- THE DEAD END, MEASURED ON THIS RIG AND NOT DESCRIBED FROM MEMORY.
--
--   `clara.record_opening_targets_parsed` (0017) records a tied basis's document-primary targets
--   from ONE reading of its tie document. The runtime mints its op key as
--   `openingparse:<seed>:<document>` (`packages/runtime/lib/opening-parse.mjs`), DELIBERATELY
--   stable per (seed, document) so a retried POST cannot double a basis — while the payload that
--   key hashes is keyed by REGION ID (`line_key = 'r:<region_id>'`). The two facts together are
--   the whole of the defect: when the document is genuinely READ AGAIN, the second parse arrives
--   with the SAME key and DIFFERENT args, and `clara._reserve_op` (0002) refuses it CLR10
--   `op_key reused with different args`. #656's fix round classified that as the typed conflict
--   `source_reread_since_parse` and recorded, in `opening-parse.mjs`'s own prose, that the
--   refusal is honest but a DEAD END.
--
--   IT IS WORSE THAN A DEAD END, and that half was not in the brief. `clara.approve_opening_seed`
--   (0017) re-runs `clara._assert_opening_target_fact` over EVERY target of a tied basis, and
--   `clara._assert_opening_extraction_ref` refuses a citation whose extraction carries
--   `superseded_by` — so once a second reading exists, the basis's existing targets cite a run
--   that is no longer current and the APPROVAL refuses CLR31 `extraction_not_accepted` too
--   (`packages/db/tests/opening-ledger-source.test.mjs`, `p656.tie.approve_rebinds`). A basis in
--   that state cannot be re-parsed and cannot be approved: the only way out is to cancel it and
--   start another one, throwing away every drafted opening item with it.
--
--   AND A FRESH OP KEY IS NOT THE FIX. Handing `record_opening_targets_parsed` a random key after
--   a re-read succeeds — and leaves the OLD targets standing beside the new ones, because the new
--   reading mints new region ids and therefore new `line_key`s, and `uq_opening_tb_targets_key` is
--   on (seed_id, line_key). The basis would carry SIX targets for a three-line trial balance and
--   tie to nothing. That is exactly what the stable key exists to prevent, and it is why the
--   remedy has to RETIRE the superseded set rather than merely record another one.
--
-- =====================================================================================
-- THE SHAPE, AND WHY IT IS THE FIRST OF THE TWO THE BRIEF OFFERS.
--
--   The brief admits "either a fresh parse superseding the stale targets under a key that
--   reflects the new extraction, or a door that re-points existing targets at the new regions",
--   and it rules that the `source_reread_since_parse` conflict "keeps firing for the same
--   condition, but stops being a dead end once the remedy exists". Both sentences point the same
--   way: the PARSE door and its pinned (seed, document) key do not move, and the remedy is a
--   SEPARATE door with its own key.
--
--   RE-POINTING WAS MEASURED AND REJECTED. A re-read is not guaranteed to yield the same number
--   of rows in the same order — the producer is an OCR pass — so "re-point target i at region i"
--   is an identity this estate cannot honestly assert. Retire-and-replace makes no such claim:
--   every target on the basis afterwards was derived, row by row, from the reading the document
--   now stands on, and `clara._assert_opening_target_fact` re-proved each one against its own
--   stored region.
--
--   THIS FILE THEREFORE RECUTS NOTHING. `clara.record_opening_targets_parsed` is pinned in the
--   prestate AND re-hashed in the tail: its sha after 0286 is the sha before it, which is the
--   executable form of "the anti-double-parse guarantee did not regress". So are the three
--   assertions the new door shares with it, the approval door whose behaviour the ticket's fourth
--   acceptance criterion rests on, and the two reads that sum the live target set.
--
-- =====================================================================================
-- WHAT THIS FILE ADDS, IN THREE SENTENCES.
--
--   1. `clara.opening_target_refreshes` — an append-only, FORCE-RLS receipt relation: one row per
--      refresh, naming the basis, the document, the reading LEFT and the reading ARRIVED AT, how
--      many targets were retired and recorded, and the retired rows VERBATIM. It is the half of
--      the ticket's second acceptance criterion that a reader can see: "the basis's state shows
--      which". Retired, not erased.
--   2. `clara.refresh_opening_targets_from_reread` — ONE door, `clara_runtime` only, exactly as
--      `record_opening_targets_parsed` is: a document-primary opening target is written by the
--      lane that re-derived it from stored evidence, never by a browser that typed it. Its op key
--      carries the NEW EXTRACTION (`openingreread:<seed>:<document>:<extraction>`), so a retried
--      POST of the same refresh replays byte-identically while a LATER reading is a new act.
--   3. Nothing else. No column on `clara.opening_tb_targets`, no trigger on it, no change to any
--      0017 body, no new grant to any human or agent lane.
--
-- WHY THE RECEIPT RELATION AND NOT A `state` COLUMN ON THE TARGETS. `clara.opening_items` carries
-- the estate's supersede-chain shape (`state`, `superseded_by_item`, `supersedes_item_id`) and it
-- was the first candidate. It does not fit here, measured: `clara._opening_seed_deltas`,
-- `clara._assert_opening_tie`, `clara.get_opening_dryrun`, `clara.approve_opening_seed`'s two
-- target sweeps, 0056's close-model read and 0239's three `opening_balance_work` reads ALL sum or
-- scan `clara.opening_tb_targets` with no state predicate. Adding a retired state to that table
-- would silently make every one of those readers wrong until each was recut — nine bodies, in a
-- lane whose whole point is that a stale figure must never stand quietly beside a fresh one. The
-- live target set stays exactly "the rows in the table", which is what all nine already believe,
-- and the supersession is recorded where a reader can ask for it.
--
-- WHAT THE DOOR REFUSES, AND WHY EACH REFUSAL IS ITS OWN TOKEN.
--   · `registry_not_open` (CLR31) / not-found (CLR11) / `tie_mismatch` (CLR31) / CLR28 — the same
--     four front-door walls `record_opening_targets_parsed` has, in the same order, for the same
--     reasons. A refresh is a parse; it is not a lifecycle exemption.
--   · `stale_extraction_version` (CLR31) — the reading being refreshed ONTO must be the document's
--     own `authoritative_extraction_id`. Refreshing onto anything else would replace a stale set
--     with another stale set.
--   · `refresh_extraction_mixed` (CLR31) — every line must cite that one reading. A payload mixing
--     readings is refused before a single row moves.
--   · `no_reread_to_refresh` (CLR31) — the basis must ALREADY stand on a different reading. This
--     door is the re-read remedy and nothing else: it is not a second way to perform the first
--     parse, and it can never be used to bypass the (seed, document) key on a basis that has not
--     been re-read.
--
-- THE CALLER'S ECHO IS WALLED THE SAME WAY THE PARSE DOOR WALLS IT (ADV-07, riders wave 3 review
-- round 1). `clara.record_opening_targets_parsed` admits an OPTIONAL `opening_fact` on a line --
-- a parser echoing the triple it believes it read -- and accepts that echo only when it is
-- EXACTLY the triple the database independently proved from the cited region, refusing
-- `opening_extraction_fact_malformed` / `opening_extraction_fact_mismatch` otherwise ([R3-F1] in
-- its own body). The first cut of this file ran the field-level fact assertion but IGNORED the
-- key, so the refresh door silently accepted a payload the parse door would have refused, while
-- this header claimed "byte for byte the parse door's own per-line validation". Two write doors
-- on one lane must not disagree about what a payload may CLAIM -- the more so because #986's
-- successor contract hands this core to #985's chat tool -- so the wall is run here too, in the
-- same position and with the same two tokens. It is a wall, never a source of figures: nothing
-- stored is ever taken from the echo.
--
-- WHICH READING THE RECEIPT NAMES AS THE ONE LEFT. `from_extraction_id` is the extraction of the
-- NEWEST retired target. Every writer in this estate records a basis's document targets from ONE
-- reading at a time, so in practice the retired set is homogeneous; the receipt does not depend on
-- that being true, because `retired_targets` carries each retired row's own `extraction_ref`
-- verbatim and is the full record. The scalar is a convenience pointer, and this sentence is its
-- contract.
--
-- REDO-SAFE (#957). Every statement is idempotent by construction: `create table if not exists`,
-- `create index if not exists`, `alter table ... enable/force row level security`,
-- `drop policy if exists` before each `create policy`, `create or replace trigger` (PostgreSQL 14+;
-- this estate runs 17), `create or replace function`, and a `grant` that is a no-op when already
-- held. The prestate asserts nothing about this file's OWN door or relation being absent, so a
-- `CLARA_MIGRATION_REDO` re-run over this file's own effects is safe. There is no backfill and no
-- data-dependent branch anywhere in the prestate or the tail: every assertion is a catalog fact.
-- =====================================================================================

do $t986_pre$
declare
  v_sha text;
  v_pins text[][] := array[
    -- THE PINNED, LOAD-BEARING SHAPE ITSELF. This file must leave it byte-identical; the tail
    -- re-hashes it against this same value, and that pair is the ticket's third acceptance
    -- criterion expressed as an executable assertion.
    ['clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)',
     'f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1'],
    -- The three assertions the new door shares with the parse door, unchanged.
    ['clara._assert_opening_target_fact(uuid,uuid,jsonb,text,bigint,bigint)',
     'b4c505b418f8bc676048b0da3cded0f9565a547487a7ce8a5a9ad5b16d3c0305'],
    ['clara._assert_opening_extraction_ref(uuid,uuid,jsonb)',
     'a8b48e14895295e1dcd22d9245d4b96f0f12538daecc22bf0b2cc4332e67fae0'],
    ['clara._opening_region_fact(uuid,uuid)',
     'c61cc978650fbbf6fbe3b92af90f538daff0aa3e6a9ff91873ad427706853610'],
    -- The filing wall and the contributor stamp the new door rides on the same terms.
    ['clara._active_document_filing(uuid,text,uuid,boolean)',
     '8d75cb02cfeaa4b739b598c81f084342b3389a6625f5d0eee76659bfe9bab7d7'],
    ['clara._record_onboarding_contributor(uuid,uuid)',
     'cc9acdf5d07dc9fe528f727d3bae794c3acf6686717a6491e62e73a066676719'],
    -- The idempotency and audit plumbing.
    ['clara._reserve_op(uuid,text,text,bytea)',
     '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'],
    ['clara._finish_op(uuid,text,text,jsonb)',
     'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'],
    ['clara._hash(jsonb)',
     '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'],
    ['clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
     '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'],
    -- The approval door and the tie gate the ticket's fourth acceptance criterion drives end to
    -- end, plus the two reads that sum the LIVE target set: if a future change gave those a
    -- retired-state predicate, this pin is where it would have to be re-measured.
    ['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
     '6735ef453153450286fe7fd2c5a645c164c14b0fcc127c9f16954b16f63fbada'],
    ['clara._assert_opening_tie(uuid)',
     'afa141b3bf2c5f7dd04a0a73dfe21221405fe18d3d94b72d197f5d8eb07cca30'],
    ['clara._opening_seed_deltas(uuid,boolean)',
     'be1d4c7da3fab86f24fc89884cf679aa4191363279e17b4a78f6cee4fb7edead'],
    ['clara.get_opening_dryrun(uuid)',
     '328c0eda12c0d1aa42633a04f4df5801f89f2f3db8f36e564f377a2296dd8372']
  ];
  v_i int;
begin
  if to_regclass('clara.opening_tb_targets') is null
     or to_regclass('clara.opening_seed_registry') is null then
    raise exception '#986 prestate: the wave-B opening relations are absent -- 0017 must apply first'
      using errcode='CLR10';
  end if;
  -- The two walls the retire-and-replace shape rides. `uq_opening_tb_targets_key` is what makes a
  -- second reading's targets ADDITIONAL rows rather than an overwrite (new region ids -> new
  -- line_keys), and `uq_opening_tb_targets_extraction_fact_0017` is what stops one stored fact
  -- backing two targets in a basis. Both are 0017's; this file adds neither and moves neither.
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where i.indrelid = 'clara.opening_tb_targets'::regclass
                    and c.relname = 'uq_opening_tb_targets_extraction_fact_0017' and i.indisunique) then
    raise exception '#986 prestate: uq_opening_tb_targets_extraction_fact_0017 (0017) is absent -- one stored fact per target has nothing enforcing it'
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'clara.opening_tb_targets'::regclass
                    and conname = 'uq_opening_tb_targets_key' and contype = 'u') then
    raise exception '#986 prestate: uq_opening_tb_targets_key (0017) is absent -- the line-key identity this file reasons about is not enforced'
      using errcode='CLR10';
  end if;
  -- `documents.authoritative_extraction_id` is the pointer the refresh target is checked against.
  if not exists (select 1 from pg_attribute
                  where attrelid = 'clara.documents'::regclass
                    and attname = 'authoritative_extraction_id' and not attisdropped) then
    raise exception '#986 prestate: clara.documents has no authoritative_extraction_id -- the refreshed reading cannot be checked'
      using errcode='CLR10';
  end if;

  -- THE PINS, MEASURED ON THIS LANE DATABASE NOW (rule: pin what is LIVE, never a copied
  -- literal). Lane 06's earlier tickets (#936/0284, #919/0285) recut nothing in this blast
  -- radius; every value above was measured on clara_l06 after both had applied.
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#986 prestate: % is absent', v_pins[v_i][1] using errcode='CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#986 prestate: % has DRIFTED from its measured pre-image -- this file must not touch it, so re-measure before applying (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  raise notice '#986 prestate: clean -- clara.opening_tb_targets carries uq_opening_tb_targets_key and uq_opening_tb_targets_extraction_fact_0017 (0017), clara.documents carries authoritative_extraction_id, and the fourteen bodies this file depends on (the pinned parse door first) are byte-identical to their measured pre-images.';
end
$t986_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- 1 · clara.opening_target_refreshes — THE RECEIPT A BASIS READS BACK.
--
-- Append-only: a refresh is an event that happened, and a second refresh is another row, never an
-- edit of this one. FORCE RLS with the same four policies every wave-B opening relation carries,
-- and SELECT for the human and runtime lanes only — the same posture `clara.opening_tb_targets`
-- itself holds (measured: clara_authenticated SELECT, clara_runtime SELECT, clara_fn_owner ALL,
-- and no grant at all to the agent read lane, which reaches the opening estate only through
-- definer doors).
-- =====================================================================================
create table if not exists clara.opening_target_refreshes (
  id                  uuid        primary key default gen_random_uuid(),
  firm_id             uuid        not null,
  client_id           uuid        not null,
  seed_id             uuid        not null,
  document_id         uuid        not null,
  -- The reading the retired targets stood on, and the reading they were replaced from. Bare
  -- columns rather than FKs to clara.document_extractions: that relation carries no
  -- (id, firm_id) unique this file may add to, and the door proves both ids against the
  -- document's own authority pointer and against each retired row before it writes here.
  from_extraction_id  uuid        not null,
  to_extraction_id    uuid        not null,
  -- STRICTLY POSITIVE on both sides, and that is the door's own guard restated at the storage
  -- layer: a refresh that retired nothing was not a re-read remedy (`no_reread_to_refresh`), and
  -- one that recorded nothing would leave the basis with no targets at all.
  retired_count       int         not null check (retired_count >= 1),
  recorded_count      int         not null check (recorded_count >= 1),
  -- THE RETIRED ROWS, VERBATIM. "Retired and replaced" is only honest if the retired set can
  -- still be read; this is where it is kept, each element carrying its own extraction_ref.
  retired_targets     jsonb       not null check (jsonb_typeof(retired_targets) = 'array'),
  op_key              text        not null check (btrim(op_key) <> ''),
  refreshed_at        timestamptz not null default now(),
  constraint uq_opening_target_refreshes_to unique(seed_id, to_extraction_id),
  constraint ck_opening_target_refreshes_moved check (from_extraction_id <> to_extraction_id),
  constraint ck_opening_target_refreshes_snapshot check (
    jsonb_array_length(retired_targets) = retired_count),
  constraint fk_opening_target_refreshes_seed foreign key(seed_id, firm_id, client_id)
    references clara.opening_seed_registry(id, firm_id, client_id),
  constraint fk_opening_target_refreshes_document foreign key(document_id, firm_id)
    references clara.documents(id, firm_id)
);
create index if not exists ix_opening_target_refreshes_seed
  on clara.opening_target_refreshes(seed_id, refreshed_at desc);

alter table clara.opening_target_refreshes enable row level security;
alter table clara.opening_target_refreshes force row level security;
drop policy if exists p_opening_target_refreshes_owner on clara.opening_target_refreshes;
create policy p_opening_target_refreshes_owner on clara.opening_target_refreshes
  for all to clara_fn_owner using (true) with check (true);
drop policy if exists p_opening_target_refreshes_human on clara.opening_target_refreshes;
create policy p_opening_target_refreshes_human on clara.opening_target_refreshes
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
drop policy if exists p_opening_target_refreshes_agent on clara.opening_target_refreshes;
create policy p_opening_target_refreshes_agent on clara.opening_target_refreshes
  for select to clara_agent_ro using (firm_id = clara.wake_firm());
drop policy if exists p_opening_target_refreshes_runtime on clara.opening_target_refreshes;
create policy p_opening_target_refreshes_runtime on clara.opening_target_refreshes
  for select to clara_runtime using (true);

create or replace trigger t_opening_target_refreshes_append_only
  before update or delete on clara.opening_target_refreshes
  for each row execute function clara._tf_append_only();
create or replace trigger t_opening_target_refreshes_no_truncate
  before truncate on clara.opening_target_refreshes
  for each statement execute function clara._tf_no_truncate();

grant select on clara.opening_target_refreshes to clara_authenticated;
grant select on clara.opening_target_refreshes to clara_runtime;

-- =====================================================================================
-- 2 · clara.refresh_opening_targets_from_reread — THE REMEDY.
--
-- Front door, in the parse door's own order: op key + payload shape, the basis (FOR UPDATE), the
-- lifecycle, the tie document and its hash, the active filing. Then the three walls that make
-- this the RE-READ remedy and nothing else: the reading refreshed onto is the document's
-- authoritative one, every line cites that one reading, and the basis already stands on another.
-- Then the reservation, the retire (snapshot first, delete second), the replace (the identical
-- per-line validation the parse door runs, including the field-level fact comparison), the
-- receipt, the contributor stamp, the audit row and the operation receipt.
-- =====================================================================================
create or replace function clara.refresh_opening_targets_from_reread(
    p_seed uuid, p_lines jsonb, p_document uuid, p_extraction uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  s record; d record; j jsonb;
  v_dedupe jsonb; v_result jsonb;
  v_count int := 0; v_retired_n int; v_retired jsonb; v_from uuid; v_refresh uuid;
  v_key text; v_account text; v_debit bigint; v_credit bigint;
  v_asserted_account text; v_asserted_side text; v_asserted_amount bigint;
begin
  if p_op_key is null or btrim(p_op_key) = '' or p_extraction is null
     or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'refreshed opening targets are malformed' using errcode='CLR10';
  end if;
  select * into s from clara.opening_seed_registry where id = p_seed for update;
  if not found then raise exception 'opening seed not found' using errcode='CLR11'; end if;
  if s.state <> 'open' then
    raise exception 'opening registry is not open'
      using errcode='CLR31', detail='{"reason":"registry_not_open"}';
  end if;
  select * into d from clara.documents where id = p_document and firm_id = s.firm_id;
  if not found or d.document_kind = 'consent_evidence'
     or p_document is distinct from s.tie_document_id
     or d.sha256 is distinct from s.tie_document_sha256 then
    if d.document_kind = 'consent_evidence' then
      raise exception 'consent evidence cannot feed opening targets' using errcode='CLR28';
    end if;
    raise exception 'refreshed targets do not match the tie document'
      using errcode='CLR31', detail='{"reason":"tie_mismatch"}';
  end if;
  perform clara._active_document_filing(p_document, d.sha256, s.client_id, true);

  -- THE READING REFRESHED ONTO IS THE ONE THE DOCUMENT NOW STANDS ON. Without this, a caller
  -- could replace one stale set with another. `_assert_opening_target_fact` would refuse each
  -- line below in any case; asserting it here names the fault once, before anything moves, and
  -- with the token that says WHICH reading was wrong rather than which row.
  if d.authoritative_extraction_id is distinct from p_extraction then
    raise exception 'the refreshed reading is not this document''s authoritative run'
      using errcode='CLR31', detail='{"reason":"stale_extraction_version"}';
  end if;
  -- ONE READING PER REFRESH. A payload mixing readings would leave the basis citing two runs and
  -- make the receipt's own from/to pair a fiction.
  if exists (select 1 from jsonb_array_elements(p_lines) x
              where nullif(x #>> '{extraction_ref,extraction_id}', '') is distinct from p_extraction::text) then
    raise exception 'refreshed opening targets must all cite the new reading'
      using errcode='CLR31', detail='{"reason":"refresh_extraction_mixed"}';
  end if;
  -- THE RESERVATION COMES BEFORE THE PRECONDITION THIS DOOR ITSELF CONSUMES, and the ordering is
  -- MEASURED rather than stylistic (`packages/db/tests/opening-source-reread.test.mjs`,
  -- `p986.reread.refresh_walls`, found the other order on its first run). Everything above is a
  -- FRONT-DOOR wall — the basis, its lifecycle, the tie document, its filing, and which reading
  -- the document now stands on — exactly the set `clara.record_opening_targets_parsed` checks
  -- before ITS reservation, and a replay is honoured only while those still hold. The
  -- `no_reread_to_refresh` precondition below is different in kind: a SUCCESSFUL refresh makes it
  -- false, because the stale targets it names are the ones this door has just retired. Checking it
  -- first would make a retried POST — the exact event an op key exists for — refuse with
  -- `no_reread_to_refresh` instead of replaying its own receipt. A refusal here still rolls the
  -- reservation back with the transaction, so a later legitimate refresh may reuse the key.
  v_dedupe := clara._reserve_op(s.firm_id, 'refresh_opening_targets_from_reread', p_op_key,
    clara._hash(jsonb_build_object('seed', p_seed, 'document', p_document,
      'extraction', p_extraction, 'lines', p_lines)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- THIS DOOR IS THE RE-READ REMEDY AND NOTHING ELSE. A basis that has not been re-read has one
  -- road in — `clara.record_opening_targets_parsed` under its pinned (seed, document) key — and
  -- this refusal is what stops this door from becoming a second one.
  select count(*)::int into v_retired_n
    from clara.opening_tb_targets t
   where t.seed_id = p_seed and t.firm_id = s.firm_id and t.client_id = s.client_id
     and t.provenance_kind = 'document'
     and t.extraction_ref ->> 'extraction_id' is distinct from p_extraction::text;
  if v_retired_n = 0 then
    raise exception 'this basis carries no targets from an earlier reading of the document'
      using errcode='CLR31', detail='{"reason":"no_reread_to_refresh"}';
  end if;

  -- RETIRE. Snapshot first — the receipt keeps the retired rows verbatim — then delete. The
  -- scalar `from_extraction_id` is the NEWEST retired target's reading (see the header's contract
  -- for it); `retired_targets` is the full record.
  select coalesce(jsonb_agg(to_jsonb(t) order by t.line_key), '[]'::jsonb) into v_retired
    from clara.opening_tb_targets t
   where t.seed_id = p_seed and t.firm_id = s.firm_id and t.client_id = s.client_id
     and t.provenance_kind = 'document'
     and t.extraction_ref ->> 'extraction_id' is distinct from p_extraction::text;
  select (t.extraction_ref ->> 'extraction_id')::uuid into v_from
    from clara.opening_tb_targets t
   where t.seed_id = p_seed and t.firm_id = s.firm_id and t.client_id = s.client_id
     and t.provenance_kind = 'document'
     and t.extraction_ref ->> 'extraction_id' is distinct from p_extraction::text
   order by t.created_at desc, t.id desc limit 1;
  delete from clara.opening_tb_targets t
   where t.seed_id = p_seed and t.firm_id = s.firm_id and t.client_id = s.client_id
     and t.provenance_kind = 'document'
     and t.extraction_ref ->> 'extraction_id' is distinct from p_extraction::text;

  -- REPLACE. Byte for byte the parse door's own per-line validation: the key, the amounts, the
  -- single positive side, the extraction reference, and the field-level comparison against the
  -- canonical fact stored on the cited region. Nothing here trusts the caller's figures.
  for j in select value from jsonb_array_elements(p_lines) loop
    v_key := nullif(btrim(j ->> 'line_key'), '');
    v_account := nullif(j ->> 'account_code', '');
    begin
      v_debit := coalesce((j ->> 'debit_cents')::bigint, 0);
      v_credit := coalesce((j ->> 'credit_cents')::bigint, 0);
    exception when others then
      raise exception 'refreshed opening target amount is malformed' using errcode='CLR10';
    end;
    if v_key is null or (v_debit > 0) = (v_credit > 0)
       or jsonb_typeof(j -> 'extraction_ref') <> 'object' then
      raise exception 'refreshed opening target is malformed' using errcode='CLR10';
    end if;
    perform clara._assert_opening_target_fact(
      s.firm_id, p_document, j -> 'extraction_ref', v_account, v_debit, v_credit);
    -- [R3-F1], the parse door's own echo wall, run here for the same reason (see the header). A
    -- caller MAY echo the fact it believes it read; the echo is accepted only when it is exactly
    -- the triple proved independently above, and nothing stored below is ever taken from it.
    if j ? 'opening_fact' then
      if jsonb_typeof(j -> 'opening_fact') <> 'object' then
        raise exception 'caller opening fact is malformed'
          using errcode='CLR31', detail='{"reason":"opening_extraction_fact_malformed"}';
      end if;
      begin
        v_asserted_account := nullif(btrim(j #>> '{opening_fact,account_code}'), '');
        v_asserted_amount := nullif(j #>> '{opening_fact,amount_cents}', '')::bigint;
        v_asserted_side := lower(nullif(btrim(j #>> '{opening_fact,side}'), ''));
      exception when others then
        raise exception 'caller opening fact is malformed'
          using errcode='CLR31', detail='{"reason":"opening_extraction_fact_malformed"}';
      end;
      if v_asserted_account is null or v_asserted_amount is null or v_asserted_amount <= 0
         or v_asserted_side not in ('debit', 'credit') then
        raise exception 'caller opening fact is malformed'
          using errcode='CLR31', detail='{"reason":"opening_extraction_fact_malformed"}';
      end if;
      if v_asserted_account is distinct from v_account
         or v_asserted_amount is distinct from greatest(v_debit, v_credit)
         or v_asserted_side is distinct from
              (case when v_debit > 0 then 'debit' else 'credit' end) then
        raise exception 'caller opening fact contradicts extraction evidence'
          using errcode='CLR31', detail='{"reason":"opening_extraction_fact_mismatch"}';
      end if;
    end if;
    insert into clara.opening_tb_targets(firm_id, client_id, seed_id, line_key,
        account_code, source_label, debit_cents, credit_cents, provenance_kind,
        document_id, source_sha256, extraction_ref)
      values(s.firm_id, s.client_id, p_seed, v_key, v_account,
        coalesce(nullif(j ->> 'source_label', ''), v_key), v_debit, v_credit,
        'document', p_document, d.sha256, j -> 'extraction_ref')
      on conflict(seed_id, line_key) do update set
        account_code = excluded.account_code, source_label = excluded.source_label,
        debit_cents = excluded.debit_cents, credit_cents = excluded.credit_cents,
        provenance_kind = 'document', document_id = excluded.document_id,
        source_sha256 = excluded.source_sha256,
        extraction_ref = excluded.extraction_ref, entered_by = null;
    v_count := v_count + 1;
  end loop;

  insert into clara.opening_target_refreshes(firm_id, client_id, seed_id, document_id,
      from_extraction_id, to_extraction_id, retired_count, recorded_count, retired_targets, op_key)
    values(s.firm_id, s.client_id, p_seed, p_document,
      v_from, p_extraction, v_retired_n, v_count, v_retired, p_op_key)
    returning id into v_refresh;

  -- The refreshed targets are attributed to the seed author, exactly as the parse door attributes
  -- its own: the human who selected the document and the as-of owns this material input.
  perform clara._record_onboarding_contributor(s.plan_id, s.created_by);
  perform clara._audit(s.firm_id, null, null, null, 'refresh_opening_targets_from_reread', null,
    jsonb_build_object('seed', p_seed, 'document', p_document, 'refresh', v_refresh,
      'from_extraction', v_from, 'to_extraction', p_extraction,
      'retired', v_retired_n, 'targets', v_count, 'op_key', p_op_key));
  v_result := jsonb_build_object('seed_id', p_seed, 'document_id', p_document,
    'refresh_id', v_refresh, 'from_extraction_id', v_from, 'to_extraction_id', p_extraction,
    'targets_retired', v_retired_n, 'targets_recorded', v_count, 'provenance_kind', 'document');
  return clara._finish_op(s.firm_id, 'refresh_opening_targets_from_reread', p_op_key, v_result);
end $$;

revoke all on function clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text) from public;
grant execute on function clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text) to clara_runtime;

reset role;

do $t986_tail$
declare
  v_sha text; v_src text; v_n int; r text; v_i int;
  v_pins text[][] := array[
    ['clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)',
     'f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1'],
    ['clara._assert_opening_target_fact(uuid,uuid,jsonb,text,bigint,bigint)',
     'b4c505b418f8bc676048b0da3cded0f9565a547487a7ce8a5a9ad5b16d3c0305'],
    ['clara._assert_opening_extraction_ref(uuid,uuid,jsonb)',
     'a8b48e14895295e1dcd22d9245d4b96f0f12538daecc22bf0b2cc4332e67fae0'],
    ['clara._opening_region_fact(uuid,uuid)',
     'c61cc978650fbbf6fbe3b92af90f538daff0aa3e6a9ff91873ad427706853610'],
    ['clara._active_document_filing(uuid,text,uuid,boolean)',
     '8d75cb02cfeaa4b739b598c81f084342b3389a6625f5d0eee76659bfe9bab7d7'],
    ['clara._record_onboarding_contributor(uuid,uuid)',
     'cc9acdf5d07dc9fe528f727d3bae794c3acf6686717a6491e62e73a066676719'],
    ['clara._reserve_op(uuid,text,text,bytea)',
     '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'],
    ['clara._finish_op(uuid,text,text,jsonb)',
     'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'],
    ['clara._hash(jsonb)',
     '421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547'],
    ['clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)',
     '000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1'],
    ['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
     '6735ef453153450286fe7fd2c5a645c164c14b0fcc127c9f16954b16f63fbada'],
    ['clara._assert_opening_tie(uuid)',
     'afa141b3bf2c5f7dd04a0a73dfe21221405fe18d3d94b72d197f5d8eb07cca30'],
    ['clara._opening_seed_deltas(uuid,boolean)',
     'be1d4c7da3fab86f24fc89884cf679aa4191363279e17b4a78f6cee4fb7edead'],
    ['clara.get_opening_dryrun(uuid)',
     '328c0eda12c0d1aa42633a04f4df5801f89f2f3db8f36e564f377a2296dd8372']
  ];
begin
  -- 1 · the door resolves, with the shape this estate's definer doors all carry.
  if to_regprocedure('clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)') is null then
    raise exception '#986 tail: the refresh door did not install' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
    join pg_roles o on o.oid = p.proowner
   where p.oid = 'clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)'::regprocedure
     and p.prosecdef and o.rolname = 'clara_fn_owner'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#986 tail: the refresh door is not SECURITY DEFINER owned by clara_fn_owner with a pinned search_path'
      using errcode='CLR10';
  end if;

  -- 2 · the ACL. clara_runtime ALONE, exactly as clara.record_opening_targets_parsed is held: a
  --     document-primary opening target is never written by a browser that typed it.
  if not has_function_privilege('clara_runtime',
        'clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)'::regprocedure, 'execute') then
    raise exception '#986 tail: clara_runtime cannot execute the refresh door' using errcode='CLR10';
  end if;
  if has_function_privilege('public',
        'clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)'::regprocedure, 'execute') then
    raise exception '#986 tail: PUBLIC can execute the refresh door' using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated',
        'clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)'::regprocedure, 'execute') then
    raise exception '#986 tail: clara_authenticated can execute the refresh door -- the document lane is runtime-only'
      using errcode='CLR10';
  end if;
  if to_regrole('clara_agent_ro') is not null and has_function_privilege('clara_agent_ro',
        'clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)'::regprocedure, 'execute') then
    raise exception '#986 tail: the agent read lane can execute the refresh door' using errcode='CLR10';
  end if;

  -- 3 · the house shape, as independent tokens in the body: the reservation/receipt pair, the
  --     audit row, the filing wall, the shared field-level fact assertion, the retire, and each
  --     of the four refusal tokens this door owns.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)'::regprocedure;
  foreach r in array array['clara._reserve_op(', 'clara._finish_op(', 'clara._audit(',
      'clara._active_document_filing(', 'clara._assert_opening_target_fact(',
      'clara._record_onboarding_contributor(', 'delete from clara.opening_tb_targets',
      'clara.opening_target_refreshes', 'for update',
      'no_reread_to_refresh', 'refresh_extraction_mixed', 'stale_extraction_version',
      'tie_mismatch', 'registry_not_open',
      -- ADV-07: the parse door's own caller-echo wall, run on this lane too.
      'opening_fact', 'opening_extraction_fact_malformed', 'opening_extraction_fact_mismatch'] loop
    if position(r in v_src) = 0 then
      raise exception '#986 tail: the refresh door is missing "%"', r using errcode='CLR10';
    end if;
  end loop;
  -- …and NOT a recut of the pinned parse door from inside this file's own source.
  if position('create or replace function clara.record_opening_targets_parsed' in v_src) <> 0 then
    raise exception '#986 tail: the refresh door recuts the pinned parse door' using errcode='CLR10';
  end if;

  -- 4 · THIS FILE RECUT NOTHING. The fourteen bodies re-hashed against the SAME pins the prestate
  --     measured — the pinned parse door first. This pair IS the no-regression proof.
  for v_i in 1 .. array_length(v_pins, 1) loop
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha is distinct from v_pins[v_i][2] then
      raise exception '#986 tail: % MOVED while this file applied -- it must not have (got %)',
        v_pins[v_i][1], v_sha using errcode='CLR10';
    end if;
  end loop;

  -- 5 · the receipt relation: present, RLS enabled AND forced, four policies, two triggers, and
  --     SELECT for the human and runtime lanes only.
  if to_regclass('clara.opening_target_refreshes') is null then
    raise exception '#986 tail: clara.opening_target_refreshes did not install' using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_class
   where oid = 'clara.opening_target_refreshes'::regclass and relrowsecurity and relforcerowsecurity;
  if v_n <> 1 then
    raise exception '#986 tail: clara.opening_target_refreshes does not have RLS enabled and forced'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_policy where polrelid = 'clara.opening_target_refreshes'::regclass;
  if v_n <> 4 then
    raise exception '#986 tail: expected 4 policies on clara.opening_target_refreshes, found %', v_n
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.opening_target_refreshes'::regclass and not tgisinternal;
  if v_n <> 2 then
    raise exception '#986 tail: expected 2 triggers on clara.opening_target_refreshes, found %', v_n
      using errcode='CLR10';
  end if;
  for r in select unnest(array['clara_authenticated','clara_runtime']) loop
    if not has_table_privilege(r, 'clara.opening_target_refreshes', 'select') then
      raise exception '#986 tail: % cannot read clara.opening_target_refreshes', r using errcode='CLR10';
    end if;
    if has_table_privilege(r, 'clara.opening_target_refreshes', 'insert')
       or has_table_privilege(r, 'clara.opening_target_refreshes', 'update')
       or has_table_privilege(r, 'clara.opening_target_refreshes', 'delete') then
      raise exception '#986 tail: % can WRITE clara.opening_target_refreshes -- the receipt is written by the door alone', r
        using errcode='CLR10';
    end if;
  end loop;
  if has_table_privilege('public', 'clara.opening_target_refreshes', 'select') then
    raise exception '#986 tail: PUBLIC can read clara.opening_target_refreshes' using errcode='CLR10';
  end if;
  if to_regrole('clara_agent_ro') is not null
     and has_table_privilege('clara_agent_ro', 'clara.opening_target_refreshes', 'select') then
    raise exception '#986 tail: the agent read lane holds a table grant on clara.opening_target_refreshes -- it reaches the opening estate through definer doors only'
      using errcode='CLR10';
  end if;

  -- 6 · clara.opening_tb_targets is UNTOUCHED: the same columns, the same two uniques, and no new
  --     trigger. A retired-state column on this table is exactly what the header rejected.
  select count(*)::int into v_n from pg_attribute
   where attrelid = 'clara.opening_tb_targets'::regclass and attnum > 0 and not attisdropped;
  if v_n <> 15 then
    raise exception '#986 tail: clara.opening_tb_targets has % columns, expected the 15 it had before this file ran', v_n
      using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where i.indrelid = 'clara.opening_tb_targets'::regclass
                    and c.relname = 'uq_opening_tb_targets_extraction_fact_0017' and i.indisunique)
     or not exists (select 1 from pg_constraint
                     where conrelid = 'clara.opening_tb_targets'::regclass
                       and conname = 'uq_opening_tb_targets_key' and contype = 'u') then
    raise exception '#986 tail: an opening_tb_targets unique moved -- this file must not touch either'
      using errcode='CLR10';
  end if;

  raise notice '#986 tail: OK -- clara.refresh_opening_targets_from_reread resolves, is SECURITY DEFINER owned by clara_fn_owner with a pinned search_path and granted to clara_runtime alone (no PUBLIC, no human lane, no agent read lane); its body carries the reservation/receipt pair, the audit row, the filing wall, the shared field-level fact assertion, the retire and its four refusal tokens, and recuts the pinned parse door nowhere; the fourteen bodies it depends on hash byte-identically to their measured pre-images (clara.record_opening_targets_parsed first, which is the no-regression proof); clara.opening_target_refreshes stands with RLS enabled and forced, four policies, two triggers and read-only grants for the human and runtime lanes; and clara.opening_tb_targets keeps its fifteen columns and both uniques unmoved.';
end
$t986_tail$;
