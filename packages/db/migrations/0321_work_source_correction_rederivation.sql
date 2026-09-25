-- 0321_work_source_correction_rederivation.sql — #1030
--
-- =====================================================================================
-- WHAT THIS FILE IS FOR, IN ONE PARAGRAPH.
--
-- #885 (0268) retires every Work parked on a question about a document fact somebody corrects,
-- and admits NOTHING in its place. Its own header says why: "Re-admission ON THE CORRECTED FACTS
-- needs somebody to re-read the corrected document and propose a basis from it, and nothing below
-- the runtime can do that." This file is the database half of the lane that does. It adds no
-- interpretation of its own — it hands the Work runtime everything it needs to re-derive (the
-- correction, the retired instruction, and the document's LIVE facts), and it takes back exactly
-- one answer per retirement: the successor that was admitted, or the reason none could be.
--
-- IT ALSO DECIDES THE ONE RULE #885 LEFT OPEN — what a COSMETICALLY EQUIVALENT edit does.
--
-- =====================================================================================
-- THE COSMETIC-EDIT RULE, DECIDED (the ticket asks for a decision, not a preference).
--
-- 0268's third fix round settled the principle: "a keystroke is not a correction", and "what
-- 'changed' means is the STORED value rather than the keystrokes". It implemented that for MONEY
-- only, because money is the one value class the estate normalises (cents). Everything else fell
-- back to trimmed text, so re-casing `MYR` to `myr`, or respelling a date to the same calendar
-- day, still retired every Work parked on that document and made a carved-out question's answer
-- PERMANENTLY refused (`max(recorded_at)` can never fall back below the question's `created_at`).
--
-- THE DECISION IS PER FIELD, AND THE TEST IS WHETHER THE ESTATE HAS A CANONICAL FORM FOR IT.
--   · money  → the normalised CENTS (0268's own rule, unchanged and reached by delegation);
--   · `invoice.currency` → the ISO 4217 CODE. The standard defines the code, not its typography,
--     and this estate stores it upper-cased everywhere it reaches the books, so `myr` and `MYR`
--     are the same fact differently spelled;
--   · `invoice.invoice_date` → the CALENDAR DAY. `5 March 2026` and `2026-03-05` are the same day.
--   · EVERYTHING ELSE → the trimmed text, UNCHANGED AND ON PURPOSE. A vendor name, an invoice id
--     or a registration number has no canonical form in this estate: the recorded text IS the
--     fact, and a professional who corrects `ACME SDN BHD` to the mixed case actually printed on
--     the page is making a real correction. Folding that into the no-op guard would leave them
--     with a door that refuses the only edit they wanted to make, which is the same defect
--     pointing the other way.
--
-- ONE NOTION, STILL. `clara._fact_value_changed(jsonb,jsonb)` is NOT recut: it stays exactly the
-- answer it always gave for a caller with no field path. The typed notion is a THREE-argument
-- sibling that delegates to it for every field the estate does not canonicalise, and BOTH of
-- 0268's callers now pass the path they already hold — the correcting door (`p_field_path`) and
-- the question predicate (`r.field_path`) — so the door and the predicate still cannot drift, and
-- a row written before this guard existed is read the same way it is written.
--
-- =====================================================================================
-- THE RE-DERIVATION LANE, AND WHY IT IS THREE DOORS AND NOT ONE TRIGGER.
--
-- WHO. The Work runtime. Measured, not argued: `journalBasisSchema` has no back-link from a line
-- to a document field path, so a corrected `invoice.total` cannot be mapped onto debit and credit
-- lines in SQL; and `clara.open_work_question` needs a RUNNING task, while a freshly admitted
-- Work's task is `queued` until the runtime claims it. Both are 0268's own measurements.
--
-- WHY NOT IN THE CORRECTING TRANSACTION. Same reason 0268 gives for not admitting a successor
-- there, plus one this file measured: the retirement puts the parked task into `cancel_requested`
-- and the runtime's control listener then ABORTS that engine run — so the retired run cannot be
-- the lane that re-derives, because it is not guaranteed to be resumed at all. The lane therefore
-- has to be DURABLE and RESTARTABLE, which is what a backlog read plus an idempotent settlement
-- is.
--
-- THE LINK IS THE CORRECTION'S OWN OP KEY. `source_corrected:<revision>:<retired work>` is
-- already durable on `clara.op_receipts` (0268 passes it to `clara.cancel_accounting_work`, whose
-- `_finish_op` writes the receipt), and 0268 deliberately left `superseded_by` NULL so a real
-- successor could claim it honestly. `clara.settle_source_corrected_rederivation` is the only
-- writer of that claim, and it refuses any successor whose own `intent_key` is not that same key
-- — so the link cannot be claimed by a Work that was not admitted for this correction.
--
-- THE SETTLEMENT IS EXACTLY-ONCE, THROUGH THE ESTATE'S OWN RESERVATION. One `op_receipts` row per
-- correction under `fn = 'source_correction_rederivation'`, carrying either the successor or the
-- decline reason. The backlog read excludes any correction that already has one, so a lane that
-- crashes between admitting and settling re-reads the SAME correction (the admission is itself
-- idempotent — the successor's `intent_key` IS the op key, and `clara.admit_journal_work` replays
-- on it), and a lane that declines does not re-decide every cycle.
--
-- WHAT THIS FILE DOES NOT DO, STATED SO A READER DOES NOT LOOK FOR IT. It does not derive a
-- basis, it does not admit a Work, it does not open a question, and it does not decide whether a
-- correction is re-derivable. Every one of those is the runtime's, and the runtime's half of this
-- contract is `claraWork_v6` plus `lib/source-correction-rederive.mjs` and
-- `lib/reconciler-work-source-correction.mjs`.
--
-- NO NEW RELATION, NO NEW COLUMN. Six new functions (two for the rule, four for the lane), two
-- recut bodies, and not one new row written at apply.
-- =====================================================================================

set local statement_timeout = '20min';  -- PRECAUTIONARY, not load-bearing: this file creates and replaces
                                        -- functions only, and writes no row.

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $r1030_pre$
declare
  v_sha text; v_src text; v_i int; v_mode text; v_n int;
  -- THE TWO BODIES THIS FILE RECUTS, pinned at what is LIVE on `clara_l01` after #985 (no
  -- migration) and #1000 (0320), the two tickets before this one in lane C1. Measured on this rig
  -- now, never copied from 0268's header.
  c_revise_pre constant text :=
    '6c5b63a8cac64ad2eb8a2eb984bd86b1d0fc15fce340aa0b74d9b55509bf43e6';
  c_question_pre constant text :=
    '52323011550764e77030cb92c5b907004e6525c4511664fae84791f2305d1bd9';
  -- UNCONDITIONAL NEIGHBOUR PINS. Every one MEASURED LIVE on `clara_l01` at this frontier. This
  -- file calls the first five and relies on the rest being exactly what the lane it is extending
  -- relies on. The integrator reads this list to find a pin another lane recuts.
  v_pins text[][] := array[
    ['clara._fact_value_changed(jsonb,jsonb)',
     '7d4f995cc61a615def90ba57408ff85d2215582d9114c73b485e7147dd205869'],
    ['clara._revisable_invoice_field(text)',
     '2d44b64fc0011b0c947cf4fceab9363e814e0fe04a62906d9849b05a164c0b23'],
    ['clara._monetary_invoice_field(text)',
     '1b5a3e32e949107a910bbc9a6e8239438078a63abb64bcbabd1b5b80872f7219'],
    ['clara._reserve_op(uuid,text,text,bytea)',
     '8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4'],
    ['clara._finish_op(uuid,text,text,jsonb)',
     'c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e'],
    ['clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid)',
     '5d1c5a80591da3762ac6fadf1b2902ffac636fc904b198ae7220281ec9bf4d44'],
    ['clara._source_corrected_work(uuid,uuid)',
     'ba646c9f90c270e0024106c4add935feb65a39bc5f2cce15ff3d83cdc7458532'],
    ['clara._lock_source_corrected_work(uuid,uuid)',
     '8ea81da175c1e4d81050ed35530e5c6c594e031a0a5ac83ded0910b9bd47a60d'],
    ['clara.cancel_accounting_work(uuid,uuid,text)',
     '27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b'],
    ['clara.admit_journal_work(uuid,uuid,text,jsonb,text,jsonb,text)',
     '011cfeedd4fe30ba37d34630fa43ad12ecd17a5e0f8e6abffe18f872e0697114'],
    ['clara.open_work_question(uuid,text,jsonb,jsonb,text,jsonb)',
     '28505d8b173d83fd582791b3f040630fcbc8d4c98359c6c0ea21ce5a6cbbfc27'],
    ['clara._work_question_record(uuid)',
     '4a6152f497dc0581396582c3befa46c60140fb5d15591db9f1119f2ec0a4e4ef'],
    ['clara.answer_work_question(uuid,integer,jsonb,text)',
     '86454f7fb95b8ad82e679ed28acf7d0954bf0aaa3543d101f96e8e1eeb829966'],
    ['clara._work_committed_receipt(uuid)',
     '82700a7c43b7c08d19f6293d774ae61e623c9a6222394e93ca4c04398930de0c'],
    ['clara._document_source_observation(uuid)',
     '9e2a7abb60e386f550413709da48c4502ff08084ba1818727936dd7f50fd0483'],
    ['clara._journal_basis_digest(jsonb)',
     '1e5825cd2e1e003a4d9e485e073a62fbd62262f77365ef38af03ec42f1387e83']
  ];
begin
  -- (0.1) THE PREMISE: 0268's whole cohort must be here. A forward reference would otherwise
  -- resolve at first CALL rather than at apply.
  if to_regprocedure('clara._fact_value_changed(jsonb,jsonb)') is null
     or to_regprocedure('clara._supersede_source_corrected_work(uuid,uuid,uuid[],uuid,uuid)') is null
     or to_regprocedure('clara._question_source_corrected(uuid)') is null
     or to_regprocedure('clara.revise_document_fact(uuid,text,jsonb,integer,text,text)') is null then
    raise exception '#1030 prestate: 0268_work_source_correction_supersede.sql is not applied — apply it first'
      using errcode = 'CLR10';
  end if;

  -- (0.2) THE TWO RECUT BODIES, PINNED, with the redo branch named rather than tolerated.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
    from pg_proc p where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,integer,text,text)'::regprocedure;
  if v_sha = c_revise_pre then
    v_mode := 'FIRST APPLY';
  elsif position('clara._fact_value_changed(v_prior_value, v_new_value, p_field_path)' in v_src) > 0 then
    v_mode := 'REDO';
  else
    raise exception '#1030 prestate: clara.revise_document_fact has DRIFTED — live sha % is neither the pinned pre-image % nor a body carrying this file''s own substitution. Re-measure before re-pinning; do not widen this check.',
      v_sha, c_revise_pre using errcode = 'CLR10';
  end if;

  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex'), p.prosrc into v_sha, v_src
    from pg_proc p where p.oid = 'clara._question_source_corrected(uuid)'::regprocedure;
  if v_mode = 'FIRST APPLY' and v_sha <> c_question_pre then
    raise exception '#1030 prestate: clara._question_source_corrected has DRIFTED — live sha % is not the pinned pre-image %',
      v_sha, c_question_pre using errcode = 'CLR10';
  end if;
  if v_mode = 'REDO' and position('clara._fact_value_changed(r.prior_value, r.new_value, r.field_path)' in v_src) = 0 then
    raise exception '#1030 prestate: half-applied — clara.revise_document_fact carries this file''s substitution but clara._question_source_corrected does not'
      using errcode = 'CLR10';
  end if;

  -- (0.3) PARTIAL BIRTH. On a first apply none of the five new objects exists; on a redo all of
  -- them do. Anything between is a half-applied file and says so by name.
  select count(*)::int into v_i from (values
      ('clara._fact_calendar_day(text)'),
      ('clara._fact_value_changed(jsonb,jsonb,text)'),
      ('clara._source_correction_rederivation_brief(text)'),
      ('clara.source_correction_rederivations(integer)'),
      ('clara.settle_source_corrected_rederivation(text,uuid,text)'),
      ('clara.source_correction_successor_brief(uuid)')) t(sig)
   where to_regprocedure(t.sig) is not null;
  if v_mode = 'FIRST APPLY' and v_i <> 0 then
    raise exception '#1030 prestate: partial birth — % of this file''s 6 new functions already exist while clara.revise_document_fact is still 0268''s own body',
      v_i using errcode = 'CLR10';
  end if;
  -- NO COUNT CHECK ON THE REDO BRANCH, and the absence is deliberate rather than an oversight.
  -- Every object below is `create or replace`, so a redo over ANY subset of them is safe, and a
  -- file that legitimately GREW between two redos of an unmerged migration is indistinguishable
  -- here from a half-applied one. Completeness is asserted where it can be measured instead of
  -- guessed: §TAIL requires all six to exist AFTER this file, on every apply.

  -- (0.4) THE NEIGHBOURS, UNCONDITIONALLY.
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#1030 prestate: pinned neighbour % is ABSENT', v_pins[v_i][1]
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha <> v_pins[v_i][2] then
      raise exception '#1030 prestate: pinned neighbour % has MOVED (live % expected %)',
        v_pins[v_i][1], v_sha, v_pins[v_i][2] using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.5) THE DATA-DEPENDENT BRANCH, ENTERED RATHER THAN ASSUMED (wave-3 addendum). The backlog
  -- read below is only interesting where a `source_corrected:` cancellation receipt EXISTS, and a
  -- rig that has never run one would exercise the empty arm only. This is a NOTICE rather than a
  -- refusal: hosted carries such rows, a freshly seeded rig does not, and neither state is wrong.
  select count(*)::int into v_n from clara.op_receipts
   where fn = 'cancel_accounting_work' and op_key like 'source\_corrected:%';
  -- (0.6) THE MODE, HANDED TO §TAIL. 0115's `_fa5pr2d_pre` idiom: a tail assertion about what this
  -- FILE wrote cannot be stated on a redo, because between the first apply and the redo a rig runs
  -- the battery and the lane writes real settlements. `on commit drop` so the row cannot outlive
  -- this migration's own transaction and be read by a later file in the same runner session.
  create temporary table _r1030_mode (mode text) on commit drop;
  insert into _r1030_mode values (v_mode);

  raise notice '#1030 prestate: clean — mode %, 0268 cohort present, 16 neighbour bodies byte-identical, % source-corrected cancellation receipt(s) on this rig', v_mode, v_n;
end
$r1030_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — THE TYPED NO-OP NOTION. Two new bodies; 0268's own two-argument notion is UNTOUCHED.
-- =====================================================================================

-- A CALENDAR DAY, OR NULL, AND IT NEVER RAISES — AND IT MEANS THE SAME DAY IN EVERY SESSION.
--
-- `::date` accepts every spelling PostgreSQL accepts (`2026-03-05`, `5 March 2026`, `March 5,
-- 2026`) and RAISES on everything else, so the cast has to be caught rather than guarded — a
-- regex that tried to predict which strings cast would be a second, weaker parser.
--
-- THE `DateStyle` CLAUSE IS THE LOAD-BEARING LINE, and it was missing from the first cut (found by
-- the cut-phase adversarial round, ADV-C1-04). A Malaysian invoice prints `03/05/2026` for 3 May;
-- this cluster's DateStyle is `ISO, MDY`, under which the bare cast read that as 5 March. The
-- bookkeeper correcting the region to `2026-03-05` — a real correction of a genuinely ambiguous
-- printed date — was then told "this revision does not change what the document is recorded as
-- saying", and nothing was written: no extraction, no revision row, no retirement. Under `DMY` the
-- same pair read as a real change, so the guard's verdict depended on a session setting.
--
-- PINNED TO `ISO, YMD`, the parser answers a day only where the spelling means ONE day whatever a
-- session says: an ISO `YYYY-MM-DD` (the year is unambiguous at four digits) or a spelled-out
-- month. `03/05/2026`, `03-05-2026` and `05.03.2026` all RAISE under YMD and are therefore NULL
-- here — so `clara._fact_value_changed(jsonb,jsonb,text)` falls through to the trimmed-text
-- comparison, which is exactly what 0268 answered before the widening. The conservative direction
-- is deliberate: this guard may let a cosmetic edit through, and it may never refuse a real one.
-- Measured on `clara_l01` across all three orderings before the clause was written.
--
-- STILL STABLE rather than IMMUTABLE. The clause makes the answer session-independent in practice,
-- but the cast it wraps is catalogued STABLE and this body does not claim to know better; nothing
-- indexes it. That is also why this is a separate body, so 0268's immutable two-argument notion
-- can stay exactly what it is.
create or replace function clara._fact_calendar_day(p_text text)
  returns date
  language plpgsql stable
  set search_path = clara, pg_temp
  set DateStyle to 'ISO, YMD' as $$
begin
  if p_text is null or btrim(p_text) = '' then return null; end if;
  begin
    return btrim(p_text)::date;
  exception when others then
    return null;
  end;
end $$;
revoke all on function clara._fact_calendar_day(text) from public;
comment on function clara._fact_calendar_day(text) is
  '#1030: the CALENDAR DAY a fact value spells, or NULL when it spells none. Exception-safe by '
  'construction -- it exists so clara._fact_value_changed(jsonb,jsonb,text) can ask "is this the '
  'same day, differently spelled?" without a second, weaker date parser. DateStyle is PINNED to '
  'ISO, YMD, so it answers a day only for a spelling that means ONE day in every session (an ISO '
  'date or a spelled-out month); an ambiguous slash or dot date answers NULL and falls through to '
  'the text rule rather than being read as whichever day the session happens to prefer.';

-- DOES A FACT REVISION CHANGE THE RECORDED VALUE, GIVEN THE FIELD IT IS ON?
--
-- THE RULE IS PER FIELD AND THE TEST IS WHETHER THE ESTATE HAS A CANONICAL FORM (this file's
-- header states the decision and its reasoning in full):
--   · both sides carry cents        -> the CENTS            (0268's rule, by delegation)
--   · invoice.currency              -> the ISO 4217 CODE, case-insensitively, WHEN BOTH SIDES
--                                      SPELL ONE (three letters and nothing else)
--   · invoice.invoice_date          -> the CALENDAR DAY, when both sides spell one UNAMBIGUOUSLY
--   · anything else                 -> clara._fact_value_changed(jsonb,jsonb), UNCHANGED
--
-- BOTH CANONICAL ARMS ARE GATED ON BOTH SIDES, and the currency gate was missing from the first
-- cut (cut-phase adversarial round, ADV-C1-06): a currency region carrying PROSE ("Ringgit
-- Malaysia") was case-folded too, which is the opposite of the rule stated above it for a value
-- with no canonical form. ISO 4217 defines a THREE-LETTER code; anything else on that field is
-- text, and the recorded text is the fact.
--
-- A NULL `p_field_path` IS THE TWO-ARGUMENT ANSWER, so a caller that does not know the field can
-- never accidentally get the widened one.
create or replace function clara._fact_value_changed(p_prior jsonb, p_new jsonb, p_field_path text)
  returns boolean
  language sql stable set search_path = clara, pg_temp as $$
  select case
    when p_prior is null or p_new is null then true
    when (p_prior ? 'cents') and (p_new ? 'cents') then clara._fact_value_changed(p_prior, p_new)
    when p_field_path = 'invoice.currency'
         and btrim(coalesce(p_prior->>'text', '')) ~ '^[A-Za-z]{3}$'
         and btrim(coalesce(p_new->>'text', '')) ~ '^[A-Za-z]{3}$'
      then upper(btrim(coalesce(p_prior->>'text', ''))) is distinct from upper(btrim(coalesce(p_new->>'text', '')))
    when p_field_path = 'invoice.invoice_date'
         and clara._fact_calendar_day(p_prior->>'text') is not null
         and clara._fact_calendar_day(p_new->>'text') is not null
      then clara._fact_calendar_day(p_prior->>'text') is distinct from clara._fact_calendar_day(p_new->>'text')
    else clara._fact_value_changed(p_prior, p_new)
  end;
$$;
revoke all on function clara._fact_value_changed(jsonb,jsonb,text) from public;
comment on function clara._fact_value_changed(jsonb,jsonb,text) is
  '#1030: does a fact revision CHANGE the recorded value, given the FIELD it is on? The cents '
  'when both sides carry them, the ISO 4217 code for invoice.currency WHEN BOTH SIDES SPELL A '
  'THREE-LETTER CODE, the unambiguous calendar day for '
  'invoice.invoice_date, and otherwise clara._fact_value_changed(jsonb,jsonb) unchanged -- a '
  'field the estate keeps as TEXT has no canonical form, so its recorded spelling IS the fact. '
  'The ONE notion clara.revise_document_fact refuses a no-op with and '
  'clara._question_source_corrected reads a revision row through.';


-- =====================================================================================
-- §B — clara.revise_document_fact — 0268 §B's body VERBATIM plus exactly ONE substitution: the
--      no-op guard now asks the TYPED notion, passing the field path it already holds. Nothing
--      else moves — not one wall, not one refusal, not one write, not one comment.
--
--      TAKEN FROM THE LIVE CATALOG rather than retyped, so "verbatim" is a property of the
--      construction and not a claim: §TAIL re-derives the pre-image by reversing this one
--      substitution and asserts it hashes back to the pinned sha.
-- =====================================================================================
create or replace function clara.revise_document_fact(p_document uuid, p_field_path text, p_value jsonb, p_observed_version integer, p_reason text, p_op_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
declare
  c record; wk record; d record; obs record; r record; prior record;
  v_dedupe jsonb; v_ext uuid; v_version int; v_format text; v_cap jsonb;
  v_raw text; v_cents bigint; v_monetary boolean; v_carried int := 0;
  v_prior_value jsonb; v_new_value jsonb; v_client uuid; v_revision uuid;
  v_locator_kind text; v_locator jsonb; v_found boolean;
  -- #885 · the Work rungs this call took BEFORE clara.documents, and what it did with them.
  v_locked uuid[]; v_superseded jsonb;
begin
  -- THE AGENT WALL, verbatim from clara.set_document_kind (0169:162-165). A revision of what a
  -- document SAYS is a human judgement; a wake credential makes none.
  select * into wk from clara.wake_context();
  if wk.credential_id is not null or exists(select 1 from clara.users u
      where u.id = clara.jwt_sub() and u.is_agent) then
    raise exception 'agent identity cannot revise a document fact' using errcode = 'CLR03';
  end if;
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then
    raise exception 'op_key is required' using errcode = 'CLR10';
  end if;
  if p_document is null or p_field_path is null
     or p_reason is null or nullif(btrim(p_reason), '') is null then
    raise exception 'a document, a field path and a reason are required' using errcode = 'CLR10',
      detail = '{"reason":"revision_incomplete"}';
  end if;

  -- #885 · THE WORK RUNGS, TAKEN BEFORE clara.documents AND NOT AFTER IT. The declared global
  -- order is accounting_plans -> accounting_work -> agent_tasks -> agent_interruptions
  -- (0193:248), and the JOURNAL lane already takes clara.documents while holding the
  -- accounting_work rung (clara._lock_document_binding, 0197:329, from two BEFORE ROW triggers
  -- on clara.journal_entries and clara.entry_evidence_links). A correcting transaction that
  -- took clara.documents first and reached for a Work row afterwards would be the OTHER
  -- direction of that same edge -- the ABBA a posting transaction and a correction can deadlock
  -- on. So the Work rungs are taken FIRST, in the declared order, and clara.documents stays
  -- BELOW them; 0217's own documents lock is not moved by one line, it simply is no longer the
  -- first lock this body takes. The helper returns exactly the ids it LOCKED, and nothing else
  -- in this body may supersede a Work it did not lock.
  v_locked := clara._lock_source_corrected_work(p_document, c.firm);

  -- SERIALISED AGAINST EVERY OTHER WRITER OF THIS DOCUMENT'S READING, on the same row
  -- clara.set_document_kind takes (0169:184). Two concurrent revisions of the same document
  -- therefore queue here rather than racing the facts-version comparison below.
  select * into d from clara.documents where id = p_document for update;
  if not found or d.firm_id <> c.firm then
    raise exception 'document not in your firm' using errcode = 'CLR11',
      detail = '{"reason":"document_not_found"}';
  end if;

  v_dedupe := clara._reserve_op(c.firm, 'revise_document_fact', p_op_key,
    clara._hash(jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'value', p_value, 'observed_version', p_observed_version, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;

  -- 0038's LIVE BANK STATEMENT PIN, the same family as set_document_kind's (0169:199-203): a
  -- statement, its lines and every match on them cite this document's reading. Void the statement
  -- first, then revise.
  if clara._bank_live_statement_on_document(p_document) then
    raise exception 'a live bank statement is bound to this document; void it before revising its facts'
      using errcode = 'CLR10', detail = '{"reason":"live_bank_statement_present"}';
  end if;

  -- THE GRAMMAR WALL FIRST (0191:554 -- CLR10 with its own detail), then the narrower lane wall.
  -- Order matters: a string that is not a path at all must be refused as a SYNTAX error, while
  -- `statement.closing_balance` is a perfectly canonical path that simply cannot live in an
  -- invoice-facts extraction.
  perform clara._assert_field_path(p_field_path);
  if not clara._revisable_invoice_field(p_field_path) then
    raise exception 'field path % is not one this door can revise', quote_literal(left(p_field_path, 160))
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'field_path_not_revisable',
        'field_path', p_field_path)::text;
  end if;

  -- THE CAPABILITY REGISTRY'S OWN VERDICT (0191:460), asked rather than re-derived. An
  -- unclassified document reads `typed_facts: unsupported` with `kind_known:false`, which is the
  -- honest refusal for "there are no typed facts here to revise yet".
  v_format := clara._document_format(d.mime_type);
  v_cap := clara._document_capability(v_format, d.document_kind);
  if coalesce(v_cap->>'typed_facts', 'unsupported') <> 'supported' then
    raise exception 'typed facts are not supported for this document'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'typed_facts_not_supported',
        'format', v_format, 'document_kind', d.document_kind,
        'typed_facts', v_cap->>'typed_facts')::text;
  end if;

  select * into obs from clara._document_source_observation(p_document);
  if obs.facts_version = 0 or obs.facts_extraction_id is null then
    raise exception 'this document carries no typed facts to revise'
      using errcode = 'CLR10', detail = '{"reason":"no_facts_to_revise"}';
  end if;

  -- THE VALUE, decoded before the staleness comparison so a malformed value is not reported as a
  -- version problem. A jsonb scalar only: an object or an array is not a value a fact region can
  -- carry, and silently stringifying one would store JSON text where a professional expects the
  -- figure they typed.
  if p_value is null or jsonb_typeof(p_value) not in ('string', 'number') then
    raise exception 'a revised fact value must be a JSON string or number'
      using errcode = 'CLR10', detail = '{"reason":"value_not_scalar"}';
  end if;
  v_raw := p_value #>> '{}';
  if nullif(btrim(coalesce(v_raw, '')), '') is null then
    raise exception 'a revised fact value must not be blank -- this door revises a value, it does not remove one'
      using errcode = 'CLR10', detail = '{"reason":"value_blank"}';
  end if;
  v_raw := btrim(v_raw);
  v_monetary := clara._monetary_invoice_field(p_field_path);
  if v_monetary then
    v_cents := clara._normalize_invoice_cents(v_raw);
    -- STRICTER THAN clara.persist_invoice_facts ON `invoice.total`, DELIBERATELY. That writer
    -- admits an unparseable total because an OCR engine legitimately cannot read one and the
    -- fail-closed corroboration path handles it (0026:846-851). A HUMAN typing a total that does
    -- not normalise to cents is a typo, and accepting it would store a fact with no number in the
    -- one field the six-term identity is measured against.
    if v_cents is null then
      raise exception 'a revised monetary value must be readable as cents'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'monetary_value_malformed',
          'field_path', p_field_path, 'attempted_value', v_raw)::text;
    end if;
    -- 0022's (b2) and 0023's (b3) sign conventions, re-stated at this boundary because an
    -- emitter convention is not a control: the identity SUBTRACTS the discount, so a negative one
    -- becomes a plus and a wrong total ties.
    if p_field_path in ('invoice.service_charge','invoice.discount','invoice.delivery',
                        'invoice.total_excl_tax','invoice.tax_total') and v_cents < 0 then
      raise exception 'a stated invoice component must not be negative'
        using errcode = 'CLR10', detail = jsonb_build_object('reason', 'component_must_not_be_negative',
          'field_path', p_field_path, 'attempted_cents', v_cents)::text;
    end if;
  end if;

  -- THE STALE-SOURCE REFUSAL (CLR19), with the attempted value echoed back so the surface can
  -- re-show what the human typed beside what the document now says. AC2: "preserves the attempted
  -- values and converges on the accepted revision".
  if p_observed_version is distinct from obs.facts_version then
    raise exception 'this revision was written against facts version %, the current version is %',
      coalesce(p_observed_version, -1), obs.facts_version
      using errcode = 'CLR19', detail = jsonb_build_object('reason', 'stale_source_version',
        'observed_version', p_observed_version, 'current_version', obs.facts_version,
        'current_extraction_id', obs.facts_extraction_id,
        'field_path', p_field_path, 'attempted_value', v_raw)::text;
  end if;

  -- THE APPENDED EXTRACTION. version_n is scoped to (document, engine_id, engine_kind) exactly as
  -- 0169:291-292 scopes the human classification's, so it counts THIS engine's revisions and
  -- collides with nothing the machine wrote.
  select coalesce(max(version_n), 0) + 1 into v_version from clara.document_extractions
   where document_id = p_document and engine_id = 'clara-fact-human:v1' and engine_kind = 'invoice_facts';

  select * into prior from clara.document_regions rg
   where rg.extraction_id = obs.facts_extraction_id and rg.field_path = p_field_path
   order by rg.created_at, rg.id limit 1;
  v_found := found;
  if v_found then
    v_prior_value := jsonb_strip_nulls(jsonb_build_object(
      'text', prior.text_content, 'cents', prior.monetary_cents));
    -- THE LOCATOR IS CARRIED, not invented: the human is correcting the value read AT THAT PLACE
    -- on the page, so the overlay keeps pointing at the same polygon and UI-17's highlight still
    -- lands where the figure is printed.
    v_locator_kind := prior.locator_kind;
    v_locator := prior.locator;
  else
    v_prior_value := null;
    -- A fact the reader never persisted has no place on the page to point at. An EMPTY polygon is
    -- the honest locator: clara.document_regions.locator is NOT NULL, and the page overlay skips a
    -- region whose polygon is missing or too short rather than drawing a degenerate shape.
    v_locator_kind := 'page_polygon';
    v_locator := jsonb_build_object('page', 1, 'polygon', '[]'::jsonb, 'source', 'human');
  end if;
  v_new_value := jsonb_strip_nulls(jsonb_build_object('text', v_raw, 'cents', v_cents));

  -- #885 (third fix round) · A KEYSTROKE IS NOT A CORRECTION. Refused BEFORE anything is
  -- written: no extraction, no revision row, no facts_version, and -- the reason this is not a
  -- cosmetic guard -- no retirement of the Work parked on this document and no question turned
  -- permanently unanswerable. A fact the reader never persisted has no prior value, and anything
  -- is a change against nothing.
  if v_prior_value is not null and not clara._fact_value_changed(v_prior_value, v_new_value, p_field_path) then
    raise exception 'this revision does not change what the document is recorded as saying'
      using errcode = 'CLR10', detail = jsonb_build_object('reason', 'value_unchanged',
        'field_path', p_field_path, 'value', v_new_value)::text;
  end if;

  insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind,
      version_n, status, page_count, envelope)
    values (c.firm, p_document, 'clara-fact-human:v1', 'invoice_facts', v_version, 'done',
      coalesce(d.page_count, 0),
      jsonb_build_object('source', 'human', 'actor', c.actor, 'reason', btrim(p_reason),
        'field_path', p_field_path, 'prior_value', v_prior_value, 'new_value', v_new_value,
        'revises_extraction_id', obs.facts_extraction_id,
        'observed_version', obs.facts_version, 'op_key', p_op_key))
    returning id into v_ext;

  -- EVERY OTHER FACT CARRIED FORWARD. Without this the appended extraction would supersede the
  -- machine's whole reading with a single field (0089:280-285 supersedes the entire kind), and the
  -- arithmetic belt would then measure a document with no total. Each carried path passes the
  -- canonical grammar on the way in, so a path that predates 0191's splice cannot ride through
  -- this door.
  for r in select rg.* from clara.document_regions rg
            where rg.extraction_id = obs.facts_extraction_id
              and rg.field_path is distinct from p_field_path
            order by rg.created_at, rg.id loop
    perform clara._assert_field_path(r.field_path);
    insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
        field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
      values (c.firm, v_ext, r.locator_kind, r.locator, r.field_path, r.text_content,
        r.engine_confidence, r.monetary_raw, r.monetary_cents);
    v_carried := v_carried + 1;
  end loop;

  insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator,
      field_path, text_content, engine_confidence, monetary_raw, monetary_cents)
    values (c.firm, v_ext, v_locator_kind, v_locator, p_field_path, v_raw, 1,
      case when v_monetary then v_raw end, v_cents);

  v_client := clara._document_sole_live_client(p_document);
  insert into clara.document_fact_revisions(firm_id, client_id, document_id, revision_kind,
      field_path, prior_value, new_value, observed_extraction_id, observed_version_n,
      resulting_extraction_id, reason, recorded_by, op_key)
    values (c.firm, v_client, p_document, 'fact', p_field_path, v_prior_value, v_new_value,
      obs.facts_extraction_id, obs.facts_version, v_ext, btrim(p_reason), c.actor, p_op_key)
    returning id into v_revision;

  -- #885 · THE CAUSE IS APPENDED FIRST, and 0217's own event is unchanged to the byte. A reader
  -- of the feed meets the correction and only then the cancellations it caused; the reverse order
  -- would show a Work retired for a reason the timeline had not yet recorded. (0217 wrote the
  -- audit row before this event; the audit row now has to NAME the supersessions, so it moves
  -- below them and this event moves above. Nothing else about either call changes.)
  perform clara._append_event(c.firm, 'document.fact_revised', v_client, c.actor, null, null,
    null, p_document, null,
    jsonb_build_object('revision_id', v_revision, 'field_path', p_field_path,
      'extraction_id', v_ext, 'observed_version', obs.facts_version,
      'facts_version', obs.facts_version + 1, 'source', 'human'));

  -- #885 · THE EFFECT. Every Work this call LOCKED that is still parked on a question about this
  -- document is retired with the correction as its reason -- the owner's 2026-09-17 ruling,
  -- re-confirmed 2026-09-20. It runs in THIS transaction: a runtime consumer would leave a window
  -- in which the stale question is still answerable, which is the one thing the ruling forbids. A
  -- SUCCESSOR is admitted on the same basis when that basis is the human's own (`user_direct`) and
  -- 0200's door accepts it; a DERIVED basis is not re-admitted (it was read off the reading that
  -- just moved) and a Work that door refuses is retired anyway, with the reason on the receipt --
  -- a bookkeeper's correction is never refused because of a Work they were not acting on.
  v_superseded := clara._supersede_source_corrected_work(p_document, c.firm, v_locked, c.actor,
    v_revision);

  perform clara._audit(c.firm, c.actor, null, null, 'revise_document_fact', null,
    jsonb_build_object('document', p_document, 'field_path', p_field_path,
      'prior_value', v_prior_value, 'new_value', v_new_value,
      'observed_extraction', obs.facts_extraction_id,
      'observed_version', obs.facts_version, 'extraction', v_ext, 'revision', v_revision,
      'reason', p_reason, 'op_key', p_op_key,
      'superseded_work', v_superseded));

  return clara._finish_op(c.firm, 'revise_document_fact', p_op_key,
    jsonb_build_object('document_id', p_document, 'revision_id', v_revision,
      'field_path', p_field_path, 'prior_value', v_prior_value, 'new_value', v_new_value,
      'extraction_id', v_ext, 'observed_extraction_id', obs.facts_extraction_id,
      'observed_version', obs.facts_version, 'facts_version', obs.facts_version + 1,
      'carried_regions', v_carried,
      'superseded_work', v_superseded));
end $function$
;

-- =====================================================================================
-- §C — clara._question_source_corrected — 0268 §A1b's body VERBATIM plus the SAME one
--      substitution, on the row's own field path, so the door and the predicate keep reading a
--      revision row through ONE notion. A row written before either guard existed is read the
--      same way it is written.
-- =====================================================================================
create or replace function clara._question_source_corrected(p_question uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'clara', 'pg_temp'
AS $function$
  select max(r.recorded_at)
    from clara.agent_interruptions i
    join clara.accounting_work w on w.id = i.work_id and w.firm_id = i.firm_id
    join clara.document_fact_revisions r
      on r.firm_id = w.firm_id
     and r.revision_kind = 'fact'
     and r.recorded_at > i.created_at
     -- …AND IT ACTUALLY CHANGED THE VALUE (third fix round). A row whose prior_value and
     -- new_value are the same fact is a keystroke, not a correction, and must not make a
     -- question unanswerable. Applied HERE as well as at the door so rows written before the
     -- door's guard existed are read the same way.
     and clara._fact_value_changed(r.prior_value, r.new_value, r.field_path)
     and exists (select 1 from jsonb_array_elements(coalesce(w.source_refs, '[]'::jsonb)) x
                  where x->>'kind' = 'document' and x->>'document_id' = r.document_id::text)
   where i.id = p_question and i.work_id is not null;
$function$
;
revoke all on function clara._question_source_corrected(uuid) from public;
comment on function clara._question_source_corrected(uuid) is
  '#885 (#1030): WHEN the source this question stands on was last corrected, if it was corrected '
  'AFTER the question was asked -- the instant, or NULL. Reads every revision row through '
  'clara._fact_value_changed(jsonb,jsonb,text), so an edit that only re-spells a value the estate '
  'canonicalises never makes a question unanswerable.';

set role clara_fn_owner;

-- =====================================================================================
-- §D — THE RE-DERIVATION LANE. One ungranted builder, two reads and one settlement.
-- =====================================================================================

-- D0 · THE BRIEF, BUILT ONCE SO THE TWO READS CANNOT DISAGREE.
--
-- Given a retirement's own op key, it answers everything the Work runtime needs and nothing it
-- does not: the correction (what the document used to say and what it says now, on whose
-- authority), the RETIRED INSTRUCTION (its purpose, its evidence, and the basis it was admitted
-- on — so a question can QUOTE the figure a person last saw rather than paraphrase it), and the
-- document's LIVE FACTS, read off its newest done `invoice_facts` extraction through the estate's
-- own observation helper. NULL when the key names no revision, or no Work of that revision's firm.
--
-- THE LIVE FACTS ARE THE SOURCE OF TRUTH FOR THE FIGURES, and the retired basis is NOT. That is
-- the ruling's own line ("never the retired Work's own basis"): the basis is here so the question
-- can name both readings, and a re-derivation that took a figure from it rather than from
-- `live_facts` would be carrying the pre-correction reading forward under a new id.
--
-- UNGRANTED, like every sibling of the 0268 cohort: it reads `clara.document_fact_revisions`
-- joined across the Work lane and its only legitimate callers are the two definer doors below.
create or replace function clara._source_correction_rederivation_brief(p_op_key text)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_rev uuid; v_work uuid; r record; w record; obs record; v_facts jsonb;
begin
  -- THE KEY'S SHAPE IS THE WALL. `source_corrected:<revision>:<work>` is 0268's own derivation
  -- and anything else is not this lane's business; the regex runs BEFORE either cast, so a
  -- malformed key can never raise an invalid-uuid error out of a read.
  if p_op_key is null
     or p_op_key !~ '^source_corrected:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  v_rev := split_part(p_op_key, ':', 2)::uuid;
  v_work := split_part(p_op_key, ':', 3)::uuid;

  select * into r from clara.document_fact_revisions dr where dr.id = v_rev;
  if not found then return null; end if;
  -- THE FIRM TERM IS THE REVISION'S OWN. A Work of another firm carrying the same uuid is not
  -- this correction's Work, and this read must not be the place that learns it exists.
  select * into w from clara.accounting_work aw where aw.id = v_work and aw.firm_id = r.firm_id;
  if not found then return null; end if;

  select * into obs from clara._document_source_observation(r.document_id);
  select coalesce(jsonb_object_agg(g.field_path, jsonb_strip_nulls(
           jsonb_build_object('text', g.text_content, 'cents', g.monetary_cents))), '{}'::jsonb)
    into v_facts
    from clara.document_regions g
   where g.extraction_id = obs.facts_extraction_id and g.firm_id = r.firm_id;

  return jsonb_build_object(
    'op_key', p_op_key,
    'revision_id', r.id,
    'document_id', r.document_id,
    'field_path', r.field_path,
    'prior_value', r.prior_value,
    'new_value', r.new_value,
    'corrected_by', r.recorded_by,
    'corrected_at', r.recorded_at,
    'firm_id', r.firm_id,
    'client_id', w.client_id,
    'retired_work_id', w.id,
    'retired_purpose', w.purpose,
    'retired_source_refs', w.source_refs,
    'retired_basis', w.basis,
    'retired_basis_origin', w.basis_origin,
    'successor_work_id', w.superseded_by,
    'live_extraction_id', obs.facts_extraction_id,
    'facts_version', obs.facts_version,
    'live_facts', v_facts);
end $$;
revoke all on function clara._source_correction_rederivation_brief(text) from public;
comment on function clara._source_correction_rederivation_brief(text) is
  '#1030: everything the Work runtime needs to re-derive after ONE source correction, keyed by '
  'the retirement''s own op key -- the correction, the retired instruction, and the document''s '
  'LIVE facts (the figures'' only source of truth; the retired basis is here to be QUOTED, never '
  'to be carried). NULL for a key that names no revision or no Work of that revision''s firm. '
  'Ungranted: reached only from clara.source_correction_rederivations and '
  'clara.source_correction_successor_brief.';

-- D1 · THE BACKLOG. Every retirement still owed a successor, oldest correction first.
--
-- A plpgsql loop rather than one SELECT, deliberately: the op key has to pass its shape regex
-- BEFORE anything casts it to a uuid, and a planner is free to reorder a WHERE against a JOIN.
-- The loop makes the order a property of the code.
--
-- WHAT LEAVES THE BACKLOG, and there are exactly two ways: a `source_correction_rederivation`
-- receipt exists for this correction (the lane settled it, either by claiming a successor or by
-- declining with a reason), or the retired Work already points at one. Nothing else.
create or replace function clara.source_correction_rederivations(p_limit integer default 20)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare o record; v_out jsonb := '[]'::jsonb; v_b jsonb; v_n int := 0; v_lim int;
begin
  v_lim := least(greatest(coalesce(p_limit, 20), 0), 200);
  for o in
    select rc.op_key from clara.op_receipts rc
     where rc.fn = 'cancel_accounting_work'
       and rc.op_key like 'source\_corrected:%'
       and not exists (select 1 from clara.op_receipts s
                        where s.firm_id = rc.firm_id
                          and s.fn = 'source_correction_rederivation'
                          and s.op_key = rc.op_key)
     order by rc.created_at, rc.op_key
  loop
    exit when v_n >= v_lim;
    v_b := clara._source_correction_rederivation_brief(o.op_key);
    continue when v_b is null;
    continue when (v_b->>'successor_work_id') is not null;
    v_out := v_out || jsonb_build_array(v_b);
    v_n := v_n + 1;
  end loop;
  return v_out;
end $$;
revoke all on function clara.source_correction_rederivations(integer) from public;
grant execute on function clara.source_correction_rederivations(integer) to clara_runtime;
comment on function clara.source_correction_rederivations(integer) is
  '#1030: every source correction that retired a Work and is still owed a successor, oldest '
  'first, each as the full re-derivation brief. The Work runtime''s own backlog read: it names '
  'what to re-derive and from what, and it decides nothing. clara_runtime only.';

-- D2 · THE SETTLEMENT. One answer per correction, exactly once, through the estate's own
--      reservation.
--
-- TWO ANSWERS AND NO THIRD. Either a successor was admitted -- and then this is the ONE writer of
-- `superseded_by` for this lane, the claim #885 deliberately left open -- or none could be, and
-- the reason is recorded so the lane does not re-decide the same correction every cycle. A
-- decline with no reason is refused: a silent one is a fact nobody can read.
--
-- THE LINK IS PROVED, NOT ASSERTED. The successor must be a Work of the SAME firm and the SAME
-- client whose own `intent_key` IS this correction's op key. That is what makes the key a link
-- rather than a label: a Work admitted for anything else cannot claim it, and the admission door
-- already makes the key unique per (firm, client), so the successor is also idempotent to admit.
create or replace function clara.settle_source_corrected_rederivation(
    p_op_key text, p_successor uuid, p_reason text)
  returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_rev uuid; v_work uuid; v_firm uuid; w record; sx record;
  v_dedupe jsonb; v_result jsonb; v_reason text; v_actor uuid;
begin
  if p_op_key is null
     or p_op_key !~ '^source_corrected:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'this is not a source-correction retirement key' using errcode = 'CLR10',
      detail = '{"reason":"invalid_op_key"}';
  end if;
  v_rev := split_part(p_op_key, ':', 2)::uuid;
  v_work := split_part(p_op_key, ':', 3)::uuid;

  -- THE CORRECTION MUST HAVE HAPPENED. The cancellation receipt is the durable evidence 0268
  -- wrote, and it is also where this lane's firm comes from -- never from the caller.
  select rc.firm_id into v_firm from clara.op_receipts rc
   where rc.fn = 'cancel_accounting_work' and rc.op_key = p_op_key;
  if v_firm is null then
    raise exception 'no source-correction retirement carries this key' using errcode = 'CLR11',
      detail = '{"reason":"correction_not_found"}';
  end if;

  select * into w from clara.accounting_work aw
   where aw.id = v_work and aw.firm_id = v_firm for update;
  if not found then
    raise exception 'no source-correction retirement carries this key' using errcode = 'CLR11',
      detail = '{"reason":"correction_not_found"}';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if p_successor is null and v_reason is null then
    raise exception 'a declined re-derivation must say why' using errcode = 'CLR10',
      detail = '{"reason":"decline_reason_required"}';
  end if;

  if p_successor is not null then
    select * into sx from clara.accounting_work aw where aw.id = p_successor for update;
    if not found or sx.firm_id <> v_firm or sx.client_id <> w.client_id
       or sx.id = w.id or sx.intent_key is distinct from p_op_key then
      raise exception 'that Work was not admitted for this correction' using errcode = 'CLR10',
        detail = jsonb_build_object('reason', 'successor_not_for_this_correction',
          'op_key', p_op_key)::text;
    end if;
  end if;

  v_dedupe := clara._reserve_op(v_firm, 'source_correction_rederivation', p_op_key,
    clara._hash(jsonb_build_object('op_key', p_op_key, 'successor', p_successor,
      'reason', coalesce(v_reason, ''))));
  if v_dedupe is not null then return v_dedupe || '{"replayed":true}'::jsonb; end if;

  if p_successor is not null then
    -- #885 left `superseded_by` NULL on purpose so a real successor could claim it honestly.
    -- This is that claim, and it is symmetric: the retired Work points forward, the successor
    -- points back, exactly as #721's restatement writes the pair.
    update clara.accounting_work set superseded_by = p_successor, updated_at = now()
     where id = w.id;
    update clara.accounting_work set supersedes = w.id, updated_at = now()
     where id = p_successor;
  end if;

  select dr.recorded_by into v_actor from clara.document_fact_revisions dr where dr.id = v_rev;
  perform clara._audit(v_firm, v_actor, null, null, 'source_correction_rederivation', null,
    jsonb_build_object('op_key', p_op_key, 'revision', v_rev, 'retired_work', w.id,
      'successor_work', p_successor, 'reason', v_reason));

  v_result := jsonb_build_object('op_key', p_op_key, 'revision_id', v_rev,
    'retired_work_id', w.id, 'successor_work_id', p_successor,
    'claimed', p_successor is not null, 'reason', v_reason, 'replayed', false);
  return clara._finish_op(v_firm, 'source_correction_rederivation', p_op_key, v_result);
end $$;
revoke all on function clara.settle_source_corrected_rederivation(text,uuid,text) from public;
grant execute on function clara.settle_source_corrected_rederivation(text,uuid,text) to clara_runtime;
comment on function clara.settle_source_corrected_rederivation(text,uuid,text) is
  '#1030: the ONE answer a source correction''s re-derivation gets -- the successor that was '
  'admitted (claiming the superseded_by link #885 left open, proved by the successor''s own '
  'intent_key being this correction''s op key) or the reason none could be. Exactly once, through '
  'clara._reserve_op / clara._finish_op. clara_runtime only.';

-- D3 · THE SUCCESSOR'S OWN BRIEF, so its run can name BOTH figures before anything may post.
--
-- A Work whose `intent_key` is a real correction's retirement key IS a successor, and that is the
-- only thing that makes it one -- no column, no flag, no marker on the basis. NULL for every
-- ordinary Work, so a run can ask unconditionally and a missing answer is not a default.
create or replace function clara.source_correction_successor_brief(p_work uuid)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare w record; v_b jsonb; v_firm uuid;
begin
  select * into w from clara.accounting_work aw where aw.id = p_work;
  if not found or w.intent_key is null then return null; end if;
  select rc.firm_id into v_firm from clara.op_receipts rc
   where rc.fn = 'cancel_accounting_work' and rc.op_key = w.intent_key and rc.firm_id = w.firm_id;
  if v_firm is null then return null; end if;
  v_b := clara._source_correction_rederivation_brief(w.intent_key);
  if v_b is null then return null; end if;
  return v_b
    || jsonb_build_object(
         'successor_work_id', p_work,
         'retired_reading', v_b->'prior_value',
         'corrected_reading', v_b->'new_value');
end $$;
revoke all on function clara.source_correction_successor_brief(uuid) from public;
grant execute on function clara.source_correction_successor_brief(uuid) to clara_runtime;
comment on function clara.source_correction_successor_brief(uuid) is
  '#1030: is this Work the successor a source correction owed, and if so what must its own run '
  'say before anything may post -- the reading the retired Work was admitted on, the reading the '
  'document carries now, and the retired basis to quote. NULL for every ordinary Work. '
  'clara_runtime only.';

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- =====================================================================================
do $r1030_tail$
declare
  v_src text; v_sha text; v_n int; v_changed boolean;
  c_revise_pre constant text :=
    '6c5b63a8cac64ad2eb8a2eb984bd86b1d0fc15fce340aa0b74d9b55509bf43e6';
  c_question_pre constant text :=
    '52323011550764e77030cb92c5b907004e6525c4511664fae84791f2305d1bd9';
begin
  -- (T1) THE ONE SUBSTITUTION, PROVED BY REVERSING IT. This is the strongest statement this file
  -- can make about "0268's body verbatim plus one line": undo the single edit on the LIVE body and
  -- the result must hash back to the pinned pre-image. A second edit anywhere in either body — a
  -- re-wrapped comment, a moved wall, a dropped refusal — reds here.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,integer,text,text)'::regprocedure;
  v_src := replace(v_src, 'clara._fact_value_changed(v_prior_value, v_new_value, p_field_path)',
                          'clara._fact_value_changed(v_prior_value, v_new_value)');
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <> c_revise_pre then
    raise exception '#1030 §TAIL: clara.revise_document_fact is NOT 0268''s body plus exactly one substitution — reversing the guard call does not hash back to %',
      c_revise_pre using errcode = 'CLR10';
  end if;

  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._question_source_corrected(uuid)'::regprocedure;
  v_src := replace(v_src, 'clara._fact_value_changed(r.prior_value, r.new_value, r.field_path)',
                          'clara._fact_value_changed(r.prior_value, r.new_value)');
  if encode(sha256(convert_to(v_src, 'UTF8')), 'hex') <> c_question_pre then
    raise exception '#1030 §TAIL: clara._question_source_corrected is NOT 0268''s body plus exactly one substitution'
      using errcode = 'CLR10';
  end if;

  -- (T2) 0268's TWO-ARGUMENT NOTION IS UNTOUCHED. The widening is a sibling, never an edit: a
  -- caller that has no field path must keep getting exactly the answer it always got.
  select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha from pg_proc p
   where p.oid = 'clara._fact_value_changed(jsonb,jsonb)'::regprocedure;
  if v_sha <> '7d4f995cc61a615def90ba57408ff85d2215582d9114c73b485e7147dd205869' then
    raise exception '#1030 §TAIL: clara._fact_value_changed(jsonb,jsonb) was RECUT — it must not be'
      using errcode = 'CLR10';
  end if;

  -- (T3) THE RULE ITSELF, DRIVEN. Not "the function exists": the four arms answered.
  if clara._fact_value_changed('{"text":"MYR"}'::jsonb, '{"text":"myr"}'::jsonb, 'invoice.currency') then
    raise exception '#1030 §TAIL: a re-cased ISO currency code reads as CHANGED' using errcode = 'CLR10';
  end if;
  if not clara._fact_value_changed('{"text":"MYR"}'::jsonb, '{"text":"SGD"}'::jsonb, 'invoice.currency') then
    raise exception '#1030 §TAIL: a DIFFERENT currency code reads as unchanged' using errcode = 'CLR10';
  end if;
  if clara._fact_value_changed('{"text":"2026-03-05"}'::jsonb, '{"text":"5 March 2026"}'::jsonb, 'invoice.invoice_date') then
    raise exception '#1030 §TAIL: the same calendar day, respelled, reads as CHANGED' using errcode = 'CLR10';
  end if;
  if not clara._fact_value_changed('{"text":"2026-03-05"}'::jsonb, '{"text":"2026-03-06"}'::jsonb, 'invoice.invoice_date') then
    raise exception '#1030 §TAIL: a DIFFERENT calendar day reads as unchanged' using errcode = 'CLR10';
  end if;
  -- …and the field the estate keeps as TEXT is DELIBERATELY not widened.
  if not clara._fact_value_changed('{"text":"ACME SDN BHD"}'::jsonb, '{"text":"Acme Sdn Bhd"}'::jsonb, 'invoice.vendor_name') then
    raise exception '#1030 §TAIL: a re-cased vendor NAME reads as unchanged — the decision is that it is a real correction'
      using errcode = 'CLR10';
  end if;
  -- A NULL path is the two-argument answer, so a caller who does not know the field can never
  -- accidentally get the widened one.
  if clara._fact_value_changed('{"text":"MYR"}'::jsonb, '{"text":"myr"}'::jsonb, null)
     is distinct from clara._fact_value_changed('{"text":"MYR"}'::jsonb, '{"text":"myr"}'::jsonb) then
    raise exception '#1030 §TAIL: a NULL field path does not answer what the two-argument notion answers'
      using errcode = 'CLR10';
  end if;
  -- An unparseable date on both sides falls back to the text rule rather than to "same day".
  if clara._fact_value_changed('{"text":"n/a"}'::jsonb, '{"text":"n/a"}'::jsonb, 'invoice.invoice_date') then
    raise exception '#1030 §TAIL: two identical unparseable dates read as CHANGED' using errcode = 'CLR10';
  end if;
  if not clara._fact_value_changed('{"text":"n/a"}'::jsonb, '{"text":"2026-03-05"}'::jsonb, 'invoice.invoice_date') then
    raise exception '#1030 §TAIL: an unparseable date replaced by a real one reads as unchanged'
      using errcode = 'CLR10';
  end if;
  -- AN AMBIGUOUS PRINTED DATE IS NOT A CANONICAL FORM (ADV-C1-04). `03/05/2026` is 3 May on a
  -- Malaysian invoice and 5 March under this cluster's MDY, so correcting it to an ISO day is a
  -- REAL correction and refusing it would be refusing the only edit the person wanted to make.
  if not clara._fact_value_changed('{"text":"03/05/2026"}'::jsonb, '{"text":"2026-03-05"}'::jsonb,
                                   'invoice.invoice_date') then
    raise exception '#1030 §TAIL: an ambiguous slash date corrected to an ISO day reads as unchanged'
      using errcode = 'CLR10';
  end if;
  if not clara._fact_value_changed('{"text":"03/05/2026"}'::jsonb, '{"text":"2026-05-03"}'::jsonb,
                                   'invoice.invoice_date') then
    raise exception '#1030 §TAIL: the mirror correction of the same ambiguous date reads as unchanged'
      using errcode = 'CLR10';
  end if;
  -- …AND THE ISO ARM IS NOT WEAKENED: the two spellings that mean one day in every session still
  -- read as the same day, which is what makes the gate a gate rather than a retreat.
  if clara._fact_value_changed('{"text":"2026-3-5"}'::jsonb, '{"text":"March 5, 2026"}'::jsonb,
                               'invoice.invoice_date') then
    raise exception '#1030 §TAIL: an unpadded ISO day and a spelled month read as different days'
      using errcode = 'CLR10';
  end if;
  -- A CURRENCY REGION CARRYING PROSE GETS THE TEXT RULE (ADV-C1-06). ISO 4217 defines a
  -- three-letter code; a field spelling anything else has no canonical form on this lane.
  if not clara._fact_value_changed('{"text":"Ringgit Malaysia"}'::jsonb,
                                   '{"text":"ringgit malaysia"}'::jsonb, 'invoice.currency') then
    raise exception '#1030 §TAIL: re-casing currency PROSE reads as unchanged — the ISO fold is for a code'
      using errcode = 'CLR10';
  end if;
  if not clara._fact_value_changed('{"text":"RM"}'::jsonb, '{"text":"rm"}'::jsonb, 'invoice.currency') then
    raise exception '#1030 §TAIL: a two-letter symbol was folded as though it were an ISO 4217 code'
      using errcode = 'CLR10';
  end if;
  -- MONEY still goes through 0268's own cents rule whatever the field name says.
  if clara._fact_value_changed('{"text":"RM 880.00","cents":88000}'::jsonb,
                               '{"text":"880.00","cents":88000}'::jsonb, 'invoice.total') then
    raise exception '#1030 §TAIL: the same cents, differently spelled, reads as CHANGED'
      using errcode = 'CLR10';
  end if;

  -- (T4) `clara._fact_calendar_day` NEVER RAISES. The whole reason it is a plpgsql body.
  if clara._fact_calendar_day('not a date at all') is not null
     or clara._fact_calendar_day('') is not null
     or clara._fact_calendar_day(null) is not null then
    raise exception '#1030 §TAIL: clara._fact_calendar_day answered a date for a non-date'
      using errcode = 'CLR10';
  end if;
  if clara._fact_calendar_day('5 March 2026') <> date '2026-03-05'
     or clara._fact_calendar_day('2026-03-05') <> date '2026-03-05' then
    raise exception '#1030 §TAIL: clara._fact_calendar_day does not read a spelled-out or ISO day'
      using errcode = 'CLR10';
  end if;
  -- …AND IT ANSWERS NOTHING FOR A SPELLING WHOSE MEANING DEPENDS ON THE SESSION (ADV-C1-04). The
  -- `set DateStyle` clause is what makes this true; without it these three answered a day, and
  -- WHICH day moved with the session.
  if clara._fact_calendar_day('03/05/2026') is not null
     or clara._fact_calendar_day('03-05-2026') is not null
     or clara._fact_calendar_day('05.03.2026') is not null then
    raise exception '#1030 §TAIL: clara._fact_calendar_day read an AMBIGUOUS date as a day'
      using errcode = 'CLR10';
  end if;

  -- (T5) THE TWO NEW HELPERS ARE UNGRANTED, like every sibling of the 0268 cohort. They are
  -- reached from SECURITY DEFINER bodies and from nowhere else.
  select count(*)::int into v_n from (
    select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
      from pg_proc p
     where p.oid in ('clara._fact_calendar_day(text)'::regprocedure,
                     'clara._fact_value_changed(jsonb,jsonb,text)'::regprocedure)) t
   where a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1030 §TAIL: % non-owner grant(s) on this file''s new helpers — they are ungranted by design',
      v_n using errcode = 'CLR10';
  end if;

  -- (T6) THE CORRECTING DOOR KEPT ITS OWN ACL. `create or replace` preserves privileges; this is
  -- the cell that says so rather than the comment that assumes it.
  select count(*)::int into v_n from (
    select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a from pg_proc p
     where p.oid = 'clara.revise_document_fact(uuid,text,jsonb,integer,text,text)'::regprocedure) t
   where a::text like 'clara_authenticated=%';
  if v_n <> 1 then
    raise exception '#1030 §TAIL: clara.revise_document_fact no longer carries its clara_authenticated grant'
      using errcode = 'CLR10';
  end if;

  -- (T7) THE LANE'S ACL, THE COMPLETE DELTA ON THE MACHINE SIDE: three EXECUTEs, all to
  -- clara_runtime, and NOTHING anywhere else. No human door (a person corrects and reads through
  -- the doors they already have), no agent-read grant (this lane writes), no wake wrapper (the
  -- runtime credential is the lane's own).
  select count(*)::int into v_n from (
    select p.oid::regprocedure::text as sig, unnest(coalesce(p.proacl, '{}'::aclitem[])) as a
      from pg_proc p
     where p.oid in ('clara.source_correction_rederivations(integer)'::regprocedure,
                     'clara.settle_source_corrected_rederivation(text,uuid,text)'::regprocedure,
                     'clara.source_correction_successor_brief(uuid)'::regprocedure)) t
   where a::text like 'clara_runtime=%';
  if v_n <> 3 then
    raise exception '#1030 §TAIL: % of 3 lane doors carry the clara_runtime EXECUTE', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from (
    select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a from pg_proc p
     where p.oid in ('clara.source_correction_rederivations(integer)'::regprocedure,
                     'clara.settle_source_corrected_rederivation(text,uuid,text)'::regprocedure,
                     'clara.source_correction_successor_brief(uuid)'::regprocedure)) t
   where a::text not like 'clara_fn_owner=%' and a::text not like 'clara_runtime=%';
  if v_n <> 0 then
    raise exception '#1030 §TAIL: % grant(s) beyond clara_runtime on this lane''s doors', v_n
      using errcode = 'CLR10';
  end if;
  -- …and the builder they share is granted to NOBODY, the one-ungranted-core law.
  select count(*)::int into v_n from (
    select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a from pg_proc p
     where p.oid = 'clara._source_correction_rederivation_brief(text)'::regprocedure) t
   where a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1030 §TAIL: the shared brief builder carries % non-owner grant(s)', v_n
      using errcode = 'CLR10';
  end if;

  -- (T8) THE KEY-SHAPE WALL, DRIVEN. A key that is not this lane's derivation answers NULL from
  -- the reads and CLR10 from the settlement — never an invalid-uuid error out of a read.
  if clara._source_correction_rederivation_brief('not-a-key') is not null
     or clara._source_correction_rederivation_brief(null) is not null
     or clara._source_correction_rederivation_brief('source_corrected:abc:def') is not null then
    raise exception '#1030 §TAIL: the brief builder answered for a key that is not this lane''s'
      using errcode = 'CLR10';
  end if;
  -- …and a well-shaped key naming a revision nobody wrote is also NULL, not a raise.
  if clara._source_correction_rederivation_brief(
       'source_corrected:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222')
     is not null then
    raise exception '#1030 §TAIL: the brief builder answered for a correction nobody performed'
      using errcode = 'CLR10';
  end if;

  -- (T8b) ALL SIX NEW OBJECTS EXIST. This is where completeness is asserted, because it is the
  -- only place it can be MEASURED rather than guessed (see §0.3's note on the redo branch).
  select count(*)::int into v_n from (values
      ('clara._fact_calendar_day(text)'),
      ('clara._fact_value_changed(jsonb,jsonb,text)'),
      ('clara._source_correction_rederivation_brief(text)'),
      ('clara.source_correction_rederivations(integer)'),
      ('clara.settle_source_corrected_rederivation(text,uuid,text)'),
      ('clara.source_correction_successor_brief(uuid)')) t(sig)
   where to_regprocedure(t.sig) is not null;
  if v_n <> 6 then
    raise exception '#1030 §TAIL: only % of this file''s 6 new functions exist', v_n
      using errcode = 'CLR10';
  end if;

  -- (T9) THIS FILE WRITES NO ROW AT APPLY. The lane is doors, not a backfill: nothing here
  -- claims a link, declines a re-derivation, or moves a Work that a person has not been told
  -- about. A correction retired before this migration stays exactly where 0268 left it until the
  -- runtime lane reaches it.
  --
  -- ON A REDO THE CLAIM IS UNSTATEABLE, and saying so is better than a check that reds for the
  -- wrong reason. Between the first apply and a redo of an unmerged file a rig RUNS the battery,
  -- and the lane then legitimately holds settlements this file did not write. The count is
  -- reported instead, so a reader still sees it. A from-scratch chain — the one the integrator
  -- runs, and the only one that can state this — always takes the FIRST APPLY branch.
  select count(*)::int into v_n from clara.op_receipts
   where fn = 'source_correction_rederivation';
  if (select m.mode from _r1030_mode m) = 'FIRST APPLY' then
    if v_n <> 0 then
      raise exception '#1030 §TAIL: % settlement receipt(s) exist at apply — this file settles nothing',
        v_n using errcode = 'CLR10';
    end if;
  else
    raise notice '#1030 §TAIL: redo — % settlement receipt(s) on this rig, written by the battery rather than by this file', v_n;
  end if;

  raise notice '#1030 §TAIL: clean — both recut bodies reverse to their pinned pre-images, the two-argument notion is untouched, the typed rule answers all four arms, and the lane is three clara_runtime doors over one ungranted builder';
end
$r1030_tail$;
